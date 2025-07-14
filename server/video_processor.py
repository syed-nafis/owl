#!/usr/bin/env python3
"""
Video Processing Module
Handles video frame processing, face detection, and light detection
"""

import cv2
import numpy as np
import mysql.connector
import json
import os
import time
import threading
import logging
from datetime import datetime
import argparse
import sys
from typing import Dict, Optional, Union, List, Any
from light_detection import LightDetector
from light_detector_manager import get_manager

# Import our custom MediaPipe+InsightFace module
try:
    from mediapipe_face import (
        detect_faces,
        extract_faces_from_image,
        recognize_face,
        init_face_recognition,
        RECOGNITION_THRESHOLD
    )
    HAS_MEDIAPIPE = True
    HAS_INSIGHT_FACE = True  # MediaPipe module includes InsightFace
except ImportError:
    HAS_MEDIAPIPE = False
    try:
        from insightface_recognition import (
            detect_and_align_faces,
            recognize_face,
            init_face_recognition,
            RECOGNITION_THRESHOLD
        )
        HAS_INSIGHT_FACE = True
    except ImportError:
        HAS_INSIGHT_FACE = False
        print("Neither MediaPipe nor InsightFace modules available. Using fallback face recognition.")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import light detection module
try:
    from light_detection import LightDetector, create_light_detector_config
    HAS_LIGHT_DETECTION = True
except ImportError:
    HAS_LIGHT_DETECTION = False
    logger.warning("Light detection module not available")

# Import smart lighting automation
try:
    from smart_lighting_automation import SmartLightingController
    HAS_SMART_LIGHTING = True
except ImportError:
    HAS_SMART_LIGHTING = False
    logger.warning("Smart lighting automation not available")

# Global configuration
DEFAULT_DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',  # Default MySQL user
    'password': '',  # Empty password for local development
    'database': 'owl_security'
}

# Global settings
PERSON_DETECTION_THRESHOLD = 0.60  # For person detection (60%)
OBJECT_DETECTION_THRESHOLD = 0.95  # For object detection (95%)
FACE_RECOGNITION_THRESHOLD = 0.90  # For face recognition (90%)
FRAME_INTERVAL = 30  # Process every 30th frame by default
NOTIFICATION_ENABLED = True  # Enable notifications
USE_MOTION_DETECTION = False  # Use motion-based frame selection
MOTION_THRESHOLD = 0.02  # Motion detection threshold (0.01-0.05 typical)
MIN_FRAME_GAP = 5  # Minimum frames between processing

# Motion detection parameters
USE_MOTION_DETECTION = True  # Enable motion-based frame downsampling
MOTION_THRESHOLD = 0.05      # Motion sensitivity (0.01-0.05 typical range)
MIN_FRAME_GAP = 5            # Minimum frames to skip after processing a frame

# Updated confidence thresholds per requirements
PERSON_DETECTION_THRESHOLD = 0.5  # For person detection (50%)
FACE_RECOGNITION_THRESHOLD = 0.5  # For face recognition (50%)
OBJECT_DETECTION_THRESHOLD = 0.95  # For other object detection (95%)
NOTIFICATION_ENABLED = True

# Global variables
db_config = DEFAULT_DB_CONFIG
model = None
known_faces: List = []
known_encodings: List = []
known_names: List[str] = []
known_access: Dict = {}
HAS_FACE_RECOGNITION = False
HAS_OPENCV_FACE = False
light_detector_manager = get_manager() if LightDetector is not None else None
smart_lighting_controller = None

class LightDetectorManager:
    """Manages light detector instances"""
    def __init__(self):
        self.detectors: Dict[str, Optional[LightDetector]] = {'default': None}
        self.initialize()
    
    def initialize(self):
        """Initialize the light detector with default configuration"""
        try:
            if LightDetector is not None:
                config = create_light_detector_config()
                self.detectors['default'] = LightDetector(config)
                logger.info("Light detector initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing light detector: {e}")
    
    def get_detector(self, camera_id: str = 'default') -> Optional[LightDetector]:
        """Get light detector for a specific camera"""
        return self.detectors.get(camera_id)

# Helper function to get light detector
def get_light_detector(camera_id: str = 'default') -> Optional[LightDetector]:
    """Get a light detector instance for a specific camera"""
    if light_detector_manager is not None:
        return light_detector_manager.get_detector(camera_id)
    return None

# Safe wrapper for face_recognition to avoid incompatible function arguments error
def safe_face_encoding(face_image):
    """
    Safely get face encodings using face_recognition library
    with proper error handling for incompatible arguments
    """
    try:
        import face_recognition
        # Ensure image is RGB (face_recognition requires RGB)
        if face_image.shape[2] == 4:  # RGBA
            face_image = face_image[:, :, :3]
        
        # Ensure image is not empty
        if face_image.size == 0 or face_image.shape[0] == 0 or face_image.shape[1] == 0:
            return []
        
        # Get face locations first
        face_locations = face_recognition.face_locations(face_image)
        if not face_locations:
            return []
        
        # Then get encodings
        return face_recognition.face_encodings(face_image, face_locations)
    except Exception as e:
        logger.error(f"Error in safe_face_encoding: {e}")
        return []

# Find haarcascade file path
def get_haarcascade_path():
    # Try common locations
    possible_paths = [
        # OpenCV installed via pip
        os.path.join(os.path.dirname(cv2.__file__), 'data/haarcascade_frontalface_default.xml'),
        # System OpenCV installation
        '/usr/local/share/opencv4/haarcascades/haarcascade_frontalface_default.xml',
        '/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml',
        '/usr/share/opencv/haarcascades/haarcascade_frontalface_default.xml',
        # Current directory
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haarcascade_frontalface_default.xml')
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    # If not found, return a default path and log a warning
    logger.warning("Could not find haarcascade_frontalface_default.xml in common locations")
    return 'haarcascade_frontalface_default.xml'

# Initialize face detection
def init_face_detection():
    global model, HAS_FACE_RECOGNITION, HAS_OPENCV_FACE
    
    # Initialize InsightFace if available
    if HAS_INSIGHT_FACE:
        try:
            if init_face_recognition():
                logger.info("InsightFace recognition system initialized successfully")
            else:
                logger.warning("InsightFace initialization failed")
        except Exception as e:
            logger.error(f"Error initializing InsightFace: {e}")
    
    # Initialize Smart Lighting Controller
    global smart_lighting_controller
    if HAS_SMART_LIGHTING:
        try:
            smart_config = {
                'test_mode': False,  # Set to True for testing without ESP
                'esp_base_url': '192.168.0.106',  # Update with your ESP IP
                'notification_endpoint': 'http://localhost:9000/api/notifications',  # Fixed: Correct port
                'db_config': db_config
            }
            smart_lighting_controller = SmartLightingController(smart_config)
            logger.info("Smart Lighting Controller initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing Smart Lighting Controller: {e}")
            smart_lighting_controller = None
    
    # Initialize light detector if available
    if HAS_LIGHT_DETECTION:
        try:
            # Light detector is already initialized via get_manager()
            logger.info("Using pre-initialized light detector")
        except Exception as e:
            logger.error(f"Error initializing light detector: {e}")
    
    # Fallback to traditional libraries if InsightFace isn't available
    try:
        # Try to import face_recognition
        import face_recognition
        logger.info("Face recognition library loaded successfully")
        HAS_FACE_RECOGNITION = True
    except ImportError:
        logger.warning("Face recognition library not available, using OpenCV fallback")
        HAS_FACE_RECOGNITION = False
        
    # Try to import our OpenCV fallback
    try:
        import opencv_face
        logger.info("OpenCV face recognition fallback loaded successfully")
        HAS_OPENCV_FACE = True
    except ImportError:
        logger.warning("OpenCV face recognition fallback not available")
        HAS_OPENCV_FACE = False
        
    # Try to load YOLOv11x model if available
    try:
        from ultralytics import YOLO
        yolo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolo11x.pt')
        if os.path.exists(yolo_path):
            model = YOLO(yolo_path)
            logger.info("YOLOv11x model loaded successfully")
        else:
            logger.warning(f"YOLOv11x model not found at {yolo_path}")
            # Fall back to OpenCV DNN for object detection
            model = cv2.dnn.readNetFromDarknet(
                os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolov4.cfg'),
                os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolov4.weights')
            )
            logger.info("Loaded fallback OpenCV DNN model")
    except ImportError:
        logger.warning("YOLO not available, using OpenCV for detection")
        # Use OpenCV's built-in object detection
        haar_path = get_haarcascade_path()
        model = cv2.CascadeClassifier(haar_path)
        logger.info(f"Loaded OpenCV Haar Cascade for face detection from {haar_path}")
    
    return True

# Connect to database
def get_db_connection():
    """Get a connection to the database"""
    try:
        conn = mysql.connector.connect(**db_config)
        return conn
    except mysql.connector.Error as err:
        if err.errno == 1045:  # Access denied error
            logger.error(f"Database access denied: {err}. Check your username and password.")
        elif err.errno == 1049:  # Unknown database
            logger.error(f"Database '{db_config['database']}' does not exist. Please create it first.")
            logger.info("You can create the database using: CREATE DATABASE owl_security;")
        else:
            logger.error(f"Database connection error: {err}")
        return None

# Safely get value from dictionary
def safe_get(d, key, default=None):
    if isinstance(d, dict) and key in d:
        return d[key]
    return default

# Safely convert to integer
def safe_int(value, default=0):
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return default

# Load known faces from database
def load_known_faces():
    global known_faces, known_encodings, known_names, known_access
    
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return []
        
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM known_faces")
        known_faces = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Convert stored face encodings back to numpy arrays
        known_encodings = []
        known_names = []
        known_access = {}
        
        for face in known_faces:
            if face and isinstance(face, dict) and 'face_encoding' in face and face['face_encoding']:
                try:
                    # Convert to string if it's not already
                    face_encoding_str = face['face_encoding']
                    if not isinstance(face_encoding_str, str):
                        face_encoding_str = str(face_encoding_str)
                    
                    encoding = np.array(json.loads(face_encoding_str))
                    known_encodings.append(encoding)
                    known_names.append(safe_get(face, 'name', 'Unknown'))
                    
                    # Store access permissions
                    known_access[safe_get(face, 'name', 'Unknown')] = {
                        'bedroom': safe_get(face, 'access_bedroom', False),
                        'living_room': safe_get(face, 'access_living_room', False),
                        'kitchen': safe_get(face, 'access_kitchen', False),
                        'front_door': safe_get(face, 'access_front_door', False)
                    }
                except Exception as e:
                    logger.error(f"Error parsing face encoding for {safe_get(face, 'name', 'Unknown')}: {e}")
        
        logger.info(f"Loaded {len(known_encodings)} known faces")
        return known_faces
    except Exception as e:
        logger.error(f"Error loading known faces: {e}")
        return []

# Process a video file with YOLO
def process_video_yolo(video_id):
    try:
        from ultralytics import YOLO
        
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return
            
        cursor = conn.cursor(dictionary=True)
        
        # Get video details
        cursor.execute("SELECT * FROM videos WHERE video_id = %s", (safe_int(video_id),))
        video = cursor.fetchone()
        
        if not video:
            logger.error(f"Video ID {video_id} not found")
            return
        
        video_path = safe_get(video, 'path')
        camera_role = safe_get(video, 'camera_role', 'unknown')
        
        if not video_path:
            logger.error("Video path not found in database")
            return
        
        # Load video
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Motion detection variables
        prev_frame = None
        last_processed_frame = -MIN_FRAME_GAP  # Force processing the first frame
        
        frame_number = 0
        processed_count = 0
        recognized_count = 0
        recognition_results = {}
        
        # Initialize light detector for this camera
        light_detector = None
        if HAS_LIGHT_DETECTION:
            camera_role_str = str(camera_role) if camera_role else 'unknown'
            light_config = create_light_detector_config()  # Fixed: removed argument
            light_detector = LightDetector(light_config)
            logger.info(f"Light detector initialized for camera: {camera_role_str}")
        
        logger.info(f"Processing video ID {video_id}: {frame_count} total frames, {fps} fps")
        start_time = time.time()
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Determine whether to process this frame
            process_this_frame = False
            motion_score = 0
            
            # Apply motion-based downsampling if enabled
            if USE_MOTION_DETECTION:
                # Convert current frame to grayscale and resize for motion detection
                gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                small_frame = cv2.resize(gray_frame, (0, 0), fx=0.25, fy=0.25)
                
                # Check for motion if we have a previous frame
                if prev_frame is not None and frame_number - last_processed_frame >= MIN_FRAME_GAP:
                    # Calculate absolute difference between current and previous frame
                    frame_diff = cv2.absdiff(small_frame, prev_frame)
                    
                    # Apply threshold to get significant changes
                    _, thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)
                    
                    # Calculate fraction of pixels that changed
                    motion_score = np.count_nonzero(thresh) / thresh.size
                    
                    # Process frame if motion exceeds threshold or if we haven't processed a frame in a while
                    if motion_score > MOTION_THRESHOLD or frame_number - last_processed_frame >= FRAME_INTERVAL:
                        process_this_frame = True
                        last_processed_frame = frame_number
                        
                        if motion_score > MOTION_THRESHOLD:
                            logger.info(f"Motion detected in frame {frame_number} (score: {motion_score:.4f})")
                elif frame_number == 0 or frame_number - last_processed_frame >= FRAME_INTERVAL:
                    # Always process first frame or if max interval reached
                    process_this_frame = True
                    last_processed_frame = frame_number
                
                # Store current frame for next iteration
                prev_frame = small_frame
            else:
                # Original behavior: process every Nth frame
                process_this_frame = (frame_number % FRAME_INTERVAL == 0)
            
            if not process_this_frame:
                frame_number += 1
                continue
                
            # Increment processed frames counter
            processed_count += 1
            
            # Perform light detection on this frame
            if light_detector:
                try:
                    timestamp = datetime.fromtimestamp(time.time() + (frame_number / fps))
                    light_results = light_detector.analyze_frame(frame, timestamp)
                    
                    # Check if lighting state changed
                    if light_results.get('state_changed', False):
                        new_state = light_results.get('lighting_state')
                        previous_state = light_results.get('previous_state')
                        confidence = light_results.get('state_confidence', 0.0)
                        
                        logger.info(f"Frame {frame_number}: Lighting changed from {previous_state} to {new_state} "
                                  f"(confidence: {confidence:.2f})")
                        
                        # Store lighting change in database (will create table if needed)
                        try:
                            lighting_data = {
                                'video_id': video_id,
                                'frame_number': frame_number,
                                'lighting_state': new_state,
                                'previous_state': previous_state,
                                'confidence': confidence,
                                'camera_role': camera_role_str,
                                'timestamp': timestamp,
                                'brightness_level': light_results['metrics'].get('mean_brightness', 0),
                                'detection_method': 'global_brightness'
                            }
                            
                            cursor.execute("""
                                INSERT INTO lighting_events 
                                (video_id, frame_number, lighting_state, previous_state, confidence,
                                 camera_role, timestamp, brightness_level, detection_method)
                                VALUES (%(video_id)s, %(frame_number)s, %(lighting_state)s, %(previous_state)s, 
                                        %(confidence)s, %(camera_role)s, %(timestamp)s, %(brightness_level)s, %(detection_method)s)
                            """, lighting_data)
                            conn.commit()
                        except mysql.connector.Error as db_err:
                            if "doesn't exist" in str(db_err):
                                logger.warning("lighting_events table doesn't exist. Skipping light detection storage.")
                            else:
                                logger.error(f"Database error storing light detection: {db_err}")
                        
                        # 🔔 SMART LIGHTING NOTIFICATIONS: Send detailed notifications for lighting changes
                        if NOTIFICATION_ENABLED:
                            send_smart_lighting_notification(
                                step=f'lights_turned_{new_state}',
                                room=camera_role_str,
                                message=f"Lights turned {new_state} in {camera_role_str} (confidence: {confidence:.1%})",
                                lightState=new_state,
                                confidence=confidence,
                                brightness=light_results['metrics'].get('mean_brightness', 0)
                            )
                    
                except Exception as e:
                    logger.error(f"Error in light detection for frame {frame_number}: {e}")
            
            # Smart lighting automation processing
            if smart_lighting_controller and camera_role:
                try:
                    smart_lighting_controller.process_frame(frame, str(camera_role))
                except Exception as e:
                    logger.error(f"Error in smart lighting automation for frame {frame_number}: {e}")
            
            # Progress indicator
            if frame_number % (FRAME_INTERVAL * 10) == 0 or process_this_frame:
                progress = frame_number / frame_count * 100
                elapsed = time.time() - start_time
                remaining = (elapsed / (frame_number + 1)) * (frame_count - frame_number)
                logger.info(f"Processing frame {frame_number}/{frame_count} ({progress:.1f}%), "
                          f"ETA: {remaining:.1f}s" + 
                          (f", Motion: {motion_score:.4f}" if USE_MOTION_DETECTION else ""))
            
            # First, run YOLO detection to find persons and objects
            if isinstance(model, YOLO):
                results = model(frame)
                
                for result in results:
                    boxes = result.boxes
                    for box in boxes:
                        # Get detection info
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])
                        class_name = model.names[class_id]
                        
                        # Check if this detection class is enabled in user settings
                        # Default to enabling all YOLOv11x classes if no settings found
                        detection_enabled = True
                        notifications_enabled = True
                        
                        try:
                            # First, fetch the latest detection class settings from the database
                            cursor.execute("SELECT settings_value FROM app_settings WHERE settings_key = 'detection_classes'")
                            settings_row = cursor.fetchone()
                            
                            if settings_row and isinstance(settings_row, dict) and 'settings_value' in settings_row:
                                try:
                                    settings_value = str(settings_row['settings_value'])
                                    detection_settings = json.loads(settings_value)
                                    
                                    # Find which category this class belongs to and check both category and class settings
                                    class_found_in_settings = False
                                    for category_key, category_data in detection_settings.items():
                                        # First check if this class is in this category
                                        category_classes = category_data.get('classes', {})
                                        if str(class_id) in category_classes:
                                            class_found_in_settings = True
                                            # Check if the category itself is enabled
                                            category_enabled = category_data.get('enabled', True)
                                            
                                            # Check if the specific class is enabled
                                            class_settings = category_classes.get(str(class_id), {})
                                            class_enabled = class_settings.get('enabled', True)
                                            
                                            # Class is only enabled if both category and class settings are enabled
                                            detection_enabled = category_enabled and class_enabled
                                            
                                            # Notifications are only enabled if category has notifications enabled
                                            notifications_enabled = category_data.get('notifications', False)
                                            
                                            break
                                    
                                    # If class not found in settings, enable by default (all YOLOv11x classes)
                                    if not class_found_in_settings:
                                        logger.debug(f"Class {class_name} (id: {class_id}) not found in settings, enabling by default")
                                        detection_enabled = True
                                        notifications_enabled = True
                                        
                                except (json.JSONDecodeError, KeyError, TypeError) as e:
                                    logger.error(f"Error parsing detection class settings: {e}")
                                    # Fall back to detecting all YOLOv11x classes
                                    detection_enabled = True
                                    notifications_enabled = True
                            else:
                                # No settings found - detect all YOLOv11x classes by default
                                logger.debug(f"No detection settings found, enabling all YOLOv11x classes by default")
                                detection_enabled = True
                                notifications_enabled = True
                                
                        except Exception as e:
                            logger.warning(f"Could not fetch detection settings from database (table may not exist): {e}")
                            # Fall back to detecting all YOLOv11x classes
                            logger.info(f"Falling back to detecting all YOLOv11x classes by default")
                            detection_enabled = True
                            notifications_enabled = True
                        
                        # Skip if detection is disabled for this class
                        if not detection_enabled:
                            logger.debug(f"Skipping disabled detection class: {class_name} (id: {class_id})")
                            continue
                        
                        # Apply appropriate confidence threshold based on detection type
                        threshold_to_use = OBJECT_DETECTION_THRESHOLD  # Default for objects
                        
                        # Determine detection type
                        if class_name in ['person']:
                            detection_type = 'person'
                            threshold_to_use = PERSON_DETECTION_THRESHOLD
                        elif class_name in ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe']:
                            detection_type = 'animal'
                        else:
                            detection_type = 'object'
                        
                        # Skip if below confidence threshold
                        if confidence < threshold_to_use:
                            continue
                        
                        # Calculate 5 seconds before and after (in frames)
                        seconds_buffer = 5
                        start_frame = max(0, frame_number - int(fps * seconds_buffer))
                        end_frame = min(frame_count, frame_number + int(fps * seconds_buffer))
                        
                        # Store detection in database
                        detection_data = {
                            'video_id': video_id,
                            'detection_type': detection_type,
                            'object_class': class_name,
                            'confidence': confidence,
                            'frame_number': frame_number,
                            'bounding_box': json.dumps({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}),
                            'camera_role': camera_role,
                            'start_frame': start_frame,
                            'end_frame': end_frame,
                            'notify': notifications_enabled  # Add notification flag based on settings
                        }
                        
                        cursor.execute("""
                            INSERT INTO detections 
                            (video_id, detection_type, object_class, confidence, frame_number, 
                             bounding_box, camera_role, start_frame, end_frame, notify)
                            VALUES (%(video_id)s, %(detection_type)s, %(object_class)s, %(confidence)s, 
                                    %(frame_number)s, %(bounding_box)s, %(camera_role)s, %(start_frame)s, %(end_frame)s, %(notify)s)
                        """, detection_data)
                        detection_id = cursor.lastrowid
                        conn.commit()
            
            # Now, use MediaPipe for face detection and recognition directly on the frame
            # This is the same approach as in test_video_recognition.py
            if HAS_MEDIAPIPE:
                # Detect faces using MediaPipe
                faces = detect_faces(frame)
                
                # Process each face
                for face_idx, face in enumerate(faces):
                    # Get face details
                    x1, y1, x2, y2 = face['bbox']
                    confidence = face.get('confidence', 0.9)
                    embedding = face['embedding']
                    
                    # Calculate 5 seconds before and after (in frames)
                    seconds_buffer = 5
                    start_frame = max(0, frame_number - int(fps * seconds_buffer))
                    end_frame = min(frame_count, frame_number + int(fps * seconds_buffer))
                    
                    # Default values
                    person_name = "Unknown person"
                    is_authorized = False
                    face_recognized = False
                    
                    # Recognize face using MediaPipe
                    try:
                        recognition = recognize_face(embedding, threshold=FACE_RECOGNITION_THRESHOLD)
                        # Handle the recognition result properly based on its actual type
                        if recognition:
                            if isinstance(recognition, dict):
                                # If it's already a dict, use it directly
                                if recognition.get('name') != "Unknown":
                                    person_name = recognition.get('name')
                                    similarity = recognition.get('similarity', FACE_RECOGNITION_THRESHOLD)
                                    face_recognized = True
                                    recognized_count += 1
                                    
                                    # Track recognized faces for reporting
                                    if person_name not in recognition_results:
                                        recognition_results[person_name] = []
                                    
                                    # Calculate timestamp
                                    timestamp = frame_number / fps
                                    minutes = int(timestamp / 60)
                                    seconds = int(timestamp % 60)
                                    time_str = f"{minutes:02d}:{seconds:02d}"
                                    
                                    # Add to recognition results
                                    recognition_results[person_name].append({
                                        'frame': frame_number,
                                        'time': time_str,
                                        'similarity': similarity
                                    })
                                    
                                    logger.info(f"Frame {frame_number}: Recognized {person_name} with similarity {similarity:.4f}")
                                    
                                    # Check authorization for this camera
                                    if person_name in known_access:
                                        cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                                        is_authorized = known_access[person_name].get(cam_key, False)
                            elif isinstance(recognition, tuple) and len(recognition) >= 2:
                                # If it's a tuple (name, similarity, ...), extract values
                                name, similarity = recognition[0], recognition[1]
                                if name != "Unknown":
                                    person_name = name
                                    face_recognized = True
                                    recognized_count += 1
                                    
                                    # Track recognized faces for reporting
                                    if person_name not in recognition_results:
                                        recognition_results[person_name] = []
                                    
                                    # Calculate timestamp
                                    timestamp = frame_number / fps
                                    minutes = int(timestamp / 60)
                                    seconds = int(timestamp % 60)
                                    time_str = f"{minutes:02d}:{seconds:02d}"
                                    
                                    # Add to recognition results
                                    recognition_results[person_name].append({
                                        'frame': frame_number,
                                        'time': time_str,
                                        'similarity': similarity
                                    })
                                    
                                    logger.info(f"Frame {frame_number}: Recognized {person_name} with similarity {similarity:.4f}")
                                    
                                    # Check authorization for this camera
                                    if person_name in known_access:
                                        cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                                        is_authorized = known_access[person_name].get(cam_key, False)
                    except Exception as e:
                        logger.error(f"Error during face recognition: {e}")
                    
                    # Store face detection in database
                    face_data = {
                        'video_id': video_id,
                        'frame_number': frame_number,
                        'person_name': person_name,
                        'confidence': confidence,
                        'bounding_box': json.dumps({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}),
                        'camera_role': camera_role,
                        'start_frame': start_frame,
                        'end_frame': end_frame
                    }
                    
                    cursor.execute("""
                        INSERT INTO faces 
                        (video_id, frame_number, person_name, confidence, 
                         bounding_box, camera_role, start_frame, end_frame)
                        VALUES (%(video_id)s, %(frame_number)s, %(person_name)s, %(confidence)s,
                                %(bounding_box)s, %(camera_role)s, %(start_frame)s, %(end_frame)s)
                    """, face_data)
                    face_id = cursor.lastrowid
                    conn.commit()
                    
                    # Log face detection results
                    if face_recognized:
                        logger.info(f"Face recognized: {person_name} (authorized: {is_authorized})")
                    else:
                        logger.info("Face detected but not recognized")
                    
                    # If known face and recognized, record the match
                    if face_recognized and person_name != "Unknown person":
                        known_face_id = next((safe_get(face_db, 'known_face_id') for face_db in known_faces 
                                          if safe_get(face_db, 'name') == person_name), None)
                        if known_face_id:
                            match_data = {
                                'face_id': face_id,
                                'known_face_id': known_face_id,
                                'similarity_score': similarity,
                                'is_authorized': is_authorized
                            }
                            
                            cursor.execute("""
                                INSERT INTO face_matches 
                                (face_id, known_face_id, similarity_score, is_authorized)
                                VALUES (%(face_id)s, %(known_face_id)s, %(similarity_score)s, %(is_authorized)s)
                            """, match_data)
                            conn.commit()
                    
                    # 🔔 FACE DETECTION NOTIFICATIONS: Send detailed notifications for face detections
                    if NOTIFICATION_ENABLED:
                        # Notify for unknown persons
                        if person_name == "Unknown person":
                            send_smart_lighting_notification(
                                step='unknown_person_detected',
                                room=camera_role,
                                message=f"Unknown person detected on {camera_role} camera",
                                lightState=None,
                                confidence=confidence
                            )
                        
                        # Notify for unauthorized access
                        elif not is_authorized and camera_role == "front_door":
                            send_smart_lighting_notification(
                                step='unauthorized_access',
                                room=camera_role,
                                message=f"{person_name} detected at front door without authorization",
                                lightState=None,
                                confidence=confidence
                            )
                        
                        # Notify for motion at front door
                        elif camera_role == "front_door":
                            send_smart_lighting_notification(
                                step='person_detected',
                                room=camera_role,
                                message=f"{person_name} detected at front door",
                                lightState=None,
                                confidence=confidence
                            )
            
            frame_number += 1
        
        cap.release()
        
        # Mark video as processed
        cursor.execute("UPDATE videos SET processed = true WHERE video_id = %s", (video_id,))
        conn.commit()
        
        # Log processing statistics
        total_time = time.time() - start_time
        processing_efficiency = 100 - (processed_count / frame_count * 100)
        logger.info(f"Finished processing video ID {video_id}")
        logger.info(f"Total frames in video: {frame_count}")
        logger.info(f"Frames processed: {processed_count} ({processed_count/frame_count*100:.1f}% of total)")
        logger.info(f"Frames skipped: {frame_count - processed_count} ({processing_efficiency:.1f}% efficiency gain)")
        logger.info(f"Total processing time: {total_time:.2f}s")
        logger.info(f"Recognized {recognized_count} faces")
        logger.info(f"Found {len(recognition_results)} unique identities")
        for name, instances in recognition_results.items():
            logger.info(f"  {name}: {len(instances)} instances")
        
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error processing video with YOLO: {e}")

# Process video with OpenCV (fallback)
def process_video_opencv(video_id):
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return
            
        cursor = conn.cursor(dictionary=True)
        
        # Get video details
        cursor.execute("SELECT * FROM videos WHERE video_id = %s", (safe_int(video_id),))
        video = cursor.fetchone()
        
        if not video:
            logger.error(f"Video ID {video_id} not found")
            return
        
        video_path = safe_get(video, 'path')
        camera_role = safe_get(video, 'camera_role', 'unknown')
        
        if not video_path:
            logger.error("Video path not found in database")
            return
        
        # Load video
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Motion detection variables
        prev_frame = None
        last_processed_frame = -MIN_FRAME_GAP  # Force processing the first frame
        
        frame_number = 0
        processed_count = 0
        recognized_count = 0
        recognition_results = {}
        
        logger.info(f"Processing video ID {video_id} with OpenCV: {frame_count} total frames, {fps} fps")
        start_time = time.time()
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Determine whether to process this frame
            process_this_frame = False
            motion_score = 0
            
            # Apply motion-based downsampling if enabled
            if USE_MOTION_DETECTION:
                # Convert current frame to grayscale and resize for motion detection
                gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                small_frame = cv2.resize(gray_frame, (0, 0), fx=0.25, fy=0.25)
                
                # Check for motion if we have a previous frame
                if prev_frame is not None and frame_number - last_processed_frame >= MIN_FRAME_GAP:
                    # Calculate absolute difference between current and previous frame
                    frame_diff = cv2.absdiff(small_frame, prev_frame)
                    
                    # Apply threshold to get significant changes
                    _, thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)
                    
                    # Calculate fraction of pixels that changed
                    motion_score = np.count_nonzero(thresh) / thresh.size
                    
                    # Process frame if motion exceeds threshold or if we haven't processed a frame in a while
                    if motion_score > MOTION_THRESHOLD or frame_number - last_processed_frame >= FRAME_INTERVAL:
                        process_this_frame = True
                        last_processed_frame = frame_number
                        
                        if motion_score > MOTION_THRESHOLD:
                            logger.info(f"Motion detected in frame {frame_number} (score: {motion_score:.4f})")
                elif frame_number == 0 or frame_number - last_processed_frame >= FRAME_INTERVAL:
                    # Always process first frame or if max interval reached
                    process_this_frame = True
                    last_processed_frame = frame_number
                
                # Store current frame for next iteration
                prev_frame = small_frame
            else:
                # Original behavior: process every Nth frame
                process_this_frame = (frame_number % FRAME_INTERVAL == 0)
            
            if not process_this_frame:
                frame_number += 1
                continue
                
            # Increment processed frames counter
            processed_count += 1
            
            # Progress indicator
            if frame_number % (FRAME_INTERVAL * 10) == 0 or process_this_frame:
                progress = frame_number / frame_count * 100
                elapsed = time.time() - start_time
                remaining = (elapsed / (frame_number + 1)) * (frame_count - frame_number)
                logger.info(f"Processing frame {frame_number}/{frame_count} ({progress:.1f}%), "
                          f"ETA: {remaining:.1f}s" + 
                          (f", Motion: {motion_score:.4f}" if USE_MOTION_DETECTION else ""))
            
            # Detect faces using MediaPipe if available
            faces = []
            if HAS_MEDIAPIPE:
                faces = detect_faces(frame)
            
            # If no faces detected with MediaPipe, try OpenCV
            if not faces and HAS_OPENCV_FACE:
                try:
                    import opencv_face
                    faces = opencv_face.detect_faces(frame)
                except Exception as e:
                    logger.error(f"Error detecting faces with OpenCV: {e}")
            
            # Process detected faces
            for face_idx, face in enumerate(faces):
                # Get face details
                if isinstance(face, dict):
                    # MediaPipe format
                    x1, y1, x2, y2 = face['bbox']
                    confidence = face.get('confidence', 0.9)
                    embedding = face.get('embedding')
                else:
                    # OpenCV format (x, y, w, h)
                    x, y, w, h = face
                    x1, y1, x2, y2 = x, y, x + w, y + h
                    confidence = 0.9  # Default confidence
                    embedding = None
                
                # Calculate 5 seconds before and after (in frames)
                seconds_buffer = 5
                start_frame = max(0, frame_number - int(fps * seconds_buffer))
                end_frame = min(frame_count, frame_number + int(fps * seconds_buffer))
                
                # Default values
                person_name = "Unknown person"
                is_authorized = False
                face_recognized = False
                
                # Try to recognize face
                try:
                    if HAS_MEDIAPIPE and embedding is not None:
                        # Use MediaPipe recognition
                        try:
                            recognition = recognize_face(embedding, threshold=FACE_RECOGNITION_THRESHOLD)
                            # Handle the recognition result properly based on its actual type
                            if recognition:
                                if isinstance(recognition, dict):
                                    # If it's already a dict, use it directly
                                    if recognition.get('name') != "Unknown":
                                        person_name = recognition.get('name')
                                        similarity = recognition.get('similarity', FACE_RECOGNITION_THRESHOLD)
                                        face_recognized = True
                                        recognized_count += 1
                                        
                                        # Track recognized faces for reporting
                                        if person_name not in recognition_results:
                                            recognition_results[person_name] = []
                                        
                                        # Calculate timestamp
                                        timestamp = frame_number / fps
                                        minutes = int(timestamp / 60)
                                        seconds = int(timestamp % 60)
                                        time_str = f"{minutes:02d}:{seconds:02d}"
                                        
                                        # Add to recognition results
                                        recognition_results[person_name].append({
                                            'frame': frame_number,
                                            'time': time_str,
                                            'similarity': similarity
                                        })
                                        
                                        logger.info(f"Frame {frame_number}: Recognized {person_name} with similarity {similarity:.4f}")
                                        
                                        # Check authorization for this camera
                                        if person_name in known_access:
                                            cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                                            is_authorized = known_access[person_name].get(cam_key, False)
                                elif isinstance(recognition, tuple) and len(recognition) >= 2:
                                    # If it's a tuple (name, similarity, ...), extract values
                                    name, similarity = recognition[0], recognition[1]
                                    if name != "Unknown":
                                        person_name = name
                                        face_recognized = True
                                        recognized_count += 1
                                        
                                        # Track recognized faces for reporting
                                        if person_name not in recognition_results:
                                            recognition_results[person_name] = []
                                        
                                        # Calculate timestamp
                                        timestamp = frame_number / fps
                                        minutes = int(timestamp / 60)
                                        seconds = int(timestamp % 60)
                                        time_str = f"{minutes:02d}:{seconds:02d}"
                                        
                                        # Add to recognition results
                                        recognition_results[person_name].append({
                                            'frame': frame_number,
                                            'time': time_str,
                                            'similarity': similarity
                                        })
                                        
                                        logger.info(f"Frame {frame_number}: Recognized {person_name} with similarity {similarity:.4f}")
                                        
                                        # Check authorization for this camera
                                        if person_name in known_access:
                                            cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                                            is_authorized = known_access[person_name].get(cam_key, False)
                        except Exception as e:
                            logger.error(f"Error during face recognition: {e}")
                    elif HAS_FACE_RECOGNITION:
                        # Use face_recognition library
                        try:
                            face_image = frame[y1:y2, x1:x2]
                            face_encodings = safe_face_encoding(face_image)
                            
                            if face_encodings:
                                # Import inside the function to handle potential import errors
                                try:
                                    import face_recognition
                                    matches = face_recognition.compare_faces(
                                        known_encodings, 
                                        face_encodings[0], 
                                        tolerance=1.0 - FACE_RECOGNITION_THRESHOLD
                                    )
                                except ImportError:
                                    logger.error("face_recognition library not available")
                                    matches = []
                                
                                # Only proceed if we have valid matches
                                if isinstance(matches, list) and len(matches) > 0 and True in matches:
                                    match_index = matches.index(True)
                                    person_name = known_names[match_index]
                                    face_recognized = True
                                    recognized_count += 1
                                    
                                    # Track recognized faces for reporting
                                    if person_name not in recognition_results:
                                        recognition_results[person_name] = []
                                    
                                    # Calculate timestamp
                                    timestamp = frame_number / fps
                                    minutes = int(timestamp / 60)
                                    seconds = int(timestamp % 60)
                                    time_str = f"{minutes:02d}:{seconds:02d}"
                                    
                                    # Add to recognition results
                                    recognition_results[person_name].append({
                                        'frame': frame_number,
                                        'time': time_str,
                                        'similarity': FACE_RECOGNITION_THRESHOLD
                                    })
                                    
                                    logger.info(f"Frame {frame_number}: Recognized {person_name} with similarity {FACE_RECOGNITION_THRESHOLD:.4f}")
                        except Exception as e:
                            logger.error(f"Error during face recognition with face_recognition library: {e}")
                except Exception as e:
                    logger.error(f"Error during face recognition: {e}")
                
                # Store face detection in database
                face_data = {
                    'video_id': video_id,
                    'frame_number': frame_number,
                    'person_name': person_name,
                    'confidence': confidence,
                    'bounding_box': json.dumps({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}),
                    'camera_role': camera_role,
                    'start_frame': start_frame,
                    'end_frame': end_frame
                }
                
                cursor.execute("""
                    INSERT INTO faces 
                    (video_id, frame_number, person_name, confidence, 
                     bounding_box, camera_role, start_frame, end_frame)
                    VALUES (%(video_id)s, %(frame_number)s, %(person_name)s, %(confidence)s,
                            %(bounding_box)s, %(camera_role)s, %(start_frame)s, %(end_frame)s)
                """, face_data)
                face_id = cursor.lastrowid
                conn.commit()
                
                # Log face detection
                if face_recognized:
                    logger.info(f"Face recognized in frame {frame_number}: {person_name}")
                else:
                    logger.info(f"Unknown face detected in frame {frame_number}")
                
                # If known face, record the match
                if face_recognized and person_name != "Unknown person":
                    # Find the known_face_id
                    known_face_id = None
                    for known_face in known_faces:
                        if safe_get(known_face, 'name') == person_name:
                            known_face_id = safe_get(known_face, 'known_face_id')
                            break
                    
                    if known_face_id:
                        # Check authorization
                        is_authorized = False
                        if person_name in known_access:
                            cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                            is_authorized = known_access[person_name].get(cam_key, False)
                        
                        # Record match
                        match_data = {
                            'face_id': face_id,
                            'known_face_id': known_face_id,
                            'similarity_score': FACE_RECOGNITION_THRESHOLD,
                            'is_authorized': is_authorized
                        }
                        
                        cursor.execute("""
                            INSERT INTO face_matches 
                            (face_id, known_face_id, similarity_score, is_authorized)
                            VALUES (%(face_id)s, %(known_face_id)s, %(similarity_score)s, %(is_authorized)s)
                        """, match_data)
                        conn.commit()
                
                # Send notification
                if NOTIFICATION_ENABLED:
                    if face_recognized:
                        if camera_role == "front_door":
                            send_notification(f"{person_name} at front door", f"{person_name} detected at front door")
                        else:
                            send_notification("Unknown person detected", f"Unknown person detected at {camera_role}")
            
            # Smart lighting automation processing
            if smart_lighting_controller and camera_role:
                try:
                    smart_lighting_controller.process_frame(frame, str(camera_role))
                except Exception as e:
                    logger.error(f"Error in smart lighting automation for frame {frame_number}: {e}")
            
            frame_number += 1
        
        cap.release()
        
        # Mark video as processed
        cursor.execute("UPDATE videos SET processed = true WHERE video_id = %s", (video_id,))
        conn.commit()
        
        # Log processing statistics
        total_time = time.time() - start_time
        processing_efficiency = 100 - (processed_count / frame_count * 100)
        logger.info(f"Finished processing video ID {video_id}")
        logger.info(f"Total frames in video: {frame_count}")
        logger.info(f"Frames processed: {processed_count} ({processed_count/frame_count*100:.1f}% of total)")
        logger.info(f"Frames skipped: {frame_count - processed_count} ({processing_efficiency:.1f}% efficiency gain)")
        logger.info(f"Total processing time: {total_time:.2f}s")
        logger.info(f"Recognized {recognized_count} faces")
        logger.info(f"Found {len(recognition_results)} unique identities")
        for name, instances in recognition_results.items():
            logger.info(f"  {name}: {len(instances)} instances")
        
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error processing video with OpenCV: {e}")

# Process a video file
def process_video(video_id):
    try:
        # Try to use YOLO if available
        if 'ultralytics' in sys.modules and model and hasattr(model, 'predict'):
            logger.info(f"Processing video ID {video_id} with YOLO")
            process_video_yolo(video_id)
        else:
            # Fall back to OpenCV
            logger.info(f"Processing video ID {video_id} with OpenCV (fallback)")
            process_video_opencv(video_id)
    except Exception as e:
        logger.error(f"Error processing video: {e}")
        
        # Update video as processed even if it fails
        try:
            conn = get_db_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE videos SET processed = true WHERE video_id = %s", (video_id,))
                conn.commit()
                cursor.close()
                conn.close()
        except Exception as update_err:
            logger.error(f"Error updating video processed status: {update_err}")

# Send notification (placeholder - integrate with your notification system)
def send_notification(title, message):
    logger.info(f"NOTIFICATION: {title} - {message}")
    # Implement your notification logic here
    # For example, you could emit a socket.io event to the client

# Send smart lighting notification to the server
def send_smart_lighting_notification(step, room, message, lightState=None, confidence=None, brightness=None):
    """
    Send a smart lighting notification to the server
    """
    try:
        import requests
        import time
        
        notification_data = {
            'id': f'smart_lighting_{step}_{room}_{int(time.time())}',
            'type': 'smart_lighting',
            'room': room,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'timeout': 60,
            'actions': ['Turn Off', 'Keep On'],
            'step': step,
            'lightState': lightState,
            'confidence': confidence,
            'brightness': brightness
        }
        
        # Send to the server's smart lighting notification endpoint
        server_url = 'http://localhost:9000/api/notifications'
        response = requests.post(server_url, json=notification_data, timeout=5)
        
        if response.status_code == 200:
            logger.info(f"📱 Smart lighting notification sent: {step} in {room}")
        else:
            logger.warning(f"Failed to send smart lighting notification: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error sending smart lighting notification: {e}")
        # Fall back to basic notification
        send_notification(f"Smart Lighting - {room}", message)

# Main function to monitor for new videos
def monitor_videos():
    conn = get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        return
        
    cursor = conn.cursor(dictionary=True)
    
    while True:
        try:
            # Check for unprocessed videos
            cursor.execute("SELECT video_id FROM videos WHERE processed = false OR processed IS NULL ORDER BY video_id")
            unprocessed_videos = cursor.fetchall()
            
            if unprocessed_videos:
                logger.info(f"Found {len(unprocessed_videos)} unprocessed videos")
                
                for video in unprocessed_videos:
                    video_id = safe_get(video, 'video_id')
                    if video_id:
                        logger.info(f"Processing video ID: {video_id}")
                        
                        # Process in a separate thread to avoid blocking
                        threading.Thread(target=process_video, args=(video_id,)).start()
                        
                        # Wait a bit between videos to avoid overloading
                        time.sleep(1)
            else:
                logger.info("No unprocessed videos found")
            
            # Wait before checking again
            time.sleep(10)
        except Exception as e:
            logger.error(f"Error in monitor loop: {e}")
            time.sleep(30)  # Wait longer on error
            
            # Try to reconnect
            try:
                if conn and hasattr(conn, 'is_connected') and conn.is_connected():
                    cursor.close()
                    conn.close()
                conn = get_db_connection()
                if conn:
                    cursor = conn.cursor(dictionary=True)
            except:
                pass

# Process a single video file (for manual processing)
def process_single_video(video_path, camera_role="unknown"):
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return
            
        cursor = conn.cursor(dictionary=True)
        
        # Insert video into database
        video_data = {
            'filename': os.path.basename(video_path),
            'path': video_path,
            'camera_role': camera_role,
            'processed': False
        }
        
        cursor.execute("""
            INSERT INTO videos 
            (filename, path, camera_role, processed)
            VALUES (%(filename)s, %(path)s, %(camera_role)s, %(processed)s)
        """, video_data)
        
        video_id = cursor.lastrowid
        conn.commit()
        
        # Process the video
        process_video(video_id)
        
        cursor.close()
        conn.close()
        
        return video_id
    except Exception as e:
        logger.error(f"Error processing single video: {e}")
        return None

# Add a function to save detection class settings from the mobile app
def update_detection_class_settings(settings_json):
    """Update detection class settings in the database"""
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return False
        
        cursor = conn.cursor(dictionary=True)
        
        # Check if settings entry exists more simply
        cursor.execute("SELECT 1 FROM app_settings WHERE settings_key = 'detection_classes' LIMIT 1")
        settings_exists = cursor.fetchone() is not None
        
        if settings_exists:
            # Update existing settings
            cursor.execute("""
                UPDATE app_settings 
                SET settings_value = %s, updated_at = NOW() 
                WHERE settings_key = 'detection_classes'
            """, (settings_json,))
        else:
            # Insert new settings
            cursor.execute("""
                INSERT INTO app_settings (settings_key, settings_value, created_at, updated_at)
                VALUES ('detection_classes', %s, NOW(), NOW())
            """, (settings_json,))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info("Detection class settings updated")
        return True
    except Exception as e:
        logger.error(f"Error updating detection class settings: {e}")
        return False

# Initialize when module is imported (not just when run as main script)
try:
    # Initialize face detection and smart lighting when module loads
    init_face_detection()
    load_known_faces()
    logger.info("Video processor module initialized successfully")
except Exception as e:
    logger.error(f"Error initializing video processor module: {e}")

# Main entry point
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video processing for face and object detection")
    parser.add_argument("--video", type=str, help="Path to video file to process")
    parser.add_argument("--camera-role", type=str, default="unknown", help="Role of the camera (e.g., front_door)")
    parser.add_argument("--monitor", action="store_true", help="Run in monitoring mode")
    parser.add_argument("--db-host", type=str, default="localhost", help="Database host")
    parser.add_argument("--db-user", type=str, default="root", help="Database user")
    parser.add_argument("--db-password", type=str, default="", help="Database password")
    parser.add_argument("--db-name", type=str, default="owl_security", help="Database name")
    parser.add_argument("--use-motion", action="store_true", default=False, help="Use motion-based frame selection")
    parser.add_argument("--motion-threshold", type=float, default=0.02, help="Motion detection threshold (0.01-0.05 typical)")
    parser.add_argument("--min-gap", type=int, default=5, help="Minimum frames between processing")
    parser.add_argument("--threshold", type=float, default=FACE_RECOGNITION_THRESHOLD, 
                        help=f"Face recognition threshold (default: {FACE_RECOGNITION_THRESHOLD})")
    
    args = parser.parse_args()
    
    # Set global parameters
    db_config = {
        'host': args.db_host,
        'user': args.db_user,
        'password': args.db_password,
        'database': args.db_name
    }
    
    # Set motion detection parameters
    USE_MOTION_DETECTION = args.use_motion
    MOTION_THRESHOLD = args.motion_threshold
    MIN_FRAME_GAP = args.min_gap
    FACE_RECOGNITION_THRESHOLD = args.threshold
    
    # Re-initialize with custom parameters if provided
    if any([args.db_host != "localhost", args.db_user != "root", 
            args.db_password != "", args.db_name != "owl_security"]):
        init_face_detection()
        load_known_faces()
    
    if args.monitor:
        # Run in monitoring mode
        monitor_videos()
    elif args.video:
        # Process a single video file
        process_single_video(args.video, args.camera_role)
    else:
        parser.print_help() 