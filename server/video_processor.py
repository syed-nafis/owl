#!/usr/bin/env python3
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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # Set your MySQL password here
    'database': 'owl_security'
}
VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'videos')
FRAME_INTERVAL = 30  # Process every 30 frames (adjust based on video FPS)
FACE_RECOGNITION_THRESHOLD = 0.6  # Lower = stricter matching
NOTIFICATION_ENABLED = True

# Global variables
db_config = DEFAULT_DB_CONFIG
model = None
known_faces = []
known_encodings = []
known_names = []
known_access = {}
HAS_FACE_RECOGNITION = False
HAS_OPENCV_FACE = False

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
    try:
        conn = mysql.connector.connect(**db_config)
        return conn
    except mysql.connector.Error as err:
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
        import face_recognition
        
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
        
        frame_number = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Process only key frames
            if frame_number % FRAME_INTERVAL == 0:
                # Run YOLOv11x detection
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
                            
                            # Determine detection type
                            if class_name in ['person']:
                                detection_type = 'person'
                            elif class_name in ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe']:
                                detection_type = 'animal'
                            else:
                                detection_type = 'object'
                            
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
                                'end_frame': end_frame
                            }
                            
                            cursor.execute("""
                                INSERT INTO detections 
                                (video_id, detection_type, object_class, confidence, frame_number, 
                                 bounding_box, camera_role, start_frame, end_frame)
                                VALUES (%(video_id)s, %(detection_type)s, %(object_class)s, %(confidence)s, 
                                        %(frame_number)s, %(bounding_box)s, %(camera_role)s, %(start_frame)s, %(end_frame)s)
                            """, detection_data)
                            detection_id = cursor.lastrowid
                            conn.commit()
                            
                            # If person detected, do face recognition
                            if detection_type == 'person':
                                # Extract face region
                                face_image = frame[y1:y2, x1:x2]
                                
                                # Find face locations
                                face_locations = face_recognition.face_locations(face_image)
                                
                                if face_locations:
                                    # Get face encodings
                                    face_encodings = face_recognition.face_encodings(face_image, face_locations)
                                    
                                    for face_encoding in face_encodings:
                                        # Compare with known faces
                                        matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=FACE_RECOGNITION_THRESHOLD)
                                        name = "Unknown"
                                        is_authorized = False
                                        
                                        # If match found
                                        if True in matches:
                                            match_index = matches.index(True)
                                            name = known_names[match_index]
                                            
                                            # Check authorization for this camera
                                            if name in known_access:
                                                cam_key = str(camera_role).lower().replace(' ', '_') if isinstance(camera_role, str) else 'unknown'
                                                is_authorized = known_access[name].get(cam_key, False)
                                        
                                        # Store face detection
                                        face_data = {
                                            'video_id': video_id,
                                            'frame_number': frame_number,
                                            'person_name': name,
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
                                        
                                        # If known face, record the match
                                        if name != "Unknown":
                                            known_face_id = next((safe_get(face, 'known_face_id') for face in known_faces 
                                                              if safe_get(face, 'name') == name), None)
                                            if known_face_id:
                                                match_data = {
                                                    'face_id': face_id,
                                                    'known_face_id': known_face_id,
                                                    'similarity_score': 1.0 - FACE_RECOGNITION_THRESHOLD,
                                                    'is_authorized': is_authorized
                                                }
                                                
                                                cursor.execute("""
                                                    INSERT INTO face_matches 
                                                    (face_id, known_face_id, similarity_score, is_authorized)
                                                    VALUES (%(face_id)s, %(known_face_id)s, %(similarity_score)s, %(is_authorized)s)
                                                """, match_data)
                                                conn.commit()
                                        
                                        # Send notifications if needed
                                        if NOTIFICATION_ENABLED:
                                            # Notify for unknown faces
                                            if name == "Unknown":
                                                send_notification("Unknown person detected", f"Unknown person detected on {camera_role} camera")
                                            
                                            # Notify for unauthorized access
                                            elif not is_authorized and camera_role == "front_door":
                                                send_notification("Unauthorized access", f"{name} detected at front door without authorization")
                                            
                                            # Notify for motion at front door
                                            elif camera_role == "front_door":
                                                send_notification("Motion at front door", f"{name} detected at front door")
            
            frame_number += 1
        
        cap.release()
        cursor.close()
        conn.close()
        logger.info(f"Finished processing video ID {video_id}")
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
        
        # Load face cascade
        haar_path = get_haarcascade_path()
        face_cascade = cv2.CascadeClassifier(haar_path)
        
        frame_number = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Process only key frames
            if frame_number % FRAME_INTERVAL == 0:
                # Convert to grayscale for face detection
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                
                # Detect faces
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                
                for (x, y, w, h) in faces:
                    # Calculate 5 seconds before and after (in frames)
                    seconds_buffer = 5
                    start_frame = max(0, frame_number - int(fps * seconds_buffer))
                    end_frame = min(frame_count, frame_number + int(fps * seconds_buffer))
                    
                    # Store detection in database
                    detection_data = {
                        'video_id': video_id,
                        'detection_type': 'person',
                        'object_class': 'person',
                        'confidence': 0.8,  # Default confidence
                        'frame_number': frame_number,
                        'bounding_box': json.dumps({'x1': x, 'y1': y, 'x2': x+w, 'y2': y+h}),
                        'camera_role': camera_role,
                        'start_frame': start_frame,
                        'end_frame': end_frame
                    }
                    
                    cursor.execute("""
                        INSERT INTO detections 
                        (video_id, detection_type, object_class, confidence, frame_number, 
                         bounding_box, camera_role, start_frame, end_frame)
                        VALUES (%(video_id)s, %(detection_type)s, %(object_class)s, %(confidence)s, 
                                %(frame_number)s, %(bounding_box)s, %(camera_role)s, %(start_frame)s, %(end_frame)s)
                    """, detection_data)
                    detection_id = cursor.lastrowid
                    conn.commit()
                    
                    # Store face detection
                    face_data = {
                        'video_id': video_id,
                        'frame_number': frame_number,
                        'person_name': 'Unknown',  # Basic OpenCV can't recognize faces
                        'confidence': 0.8,
                        'bounding_box': json.dumps({'x1': x, 'y1': y, 'x2': x+w, 'y2': y+h}),
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
                    conn.commit()
                    
                    # Send notification
                    if NOTIFICATION_ENABLED and camera_role == "front_door":
                        send_notification("Motion at front door", "Person detected at front door")
            
            frame_number += 1
        
        cap.release()
        cursor.close()
        conn.close()
        logger.info(f"Finished processing video ID {video_id}")
    except Exception as e:
        logger.error(f"Error processing video with OpenCV: {e}")

# Process a video file
def process_video(video_id):
    try:
        # Try to use YOLO if available
        if 'ultralytics' in sys.modules and model and hasattr(model, 'predict'):
            process_video_yolo(video_id)
        else:
            # Fall back to OpenCV
            process_video_opencv(video_id)
    except Exception as e:
        logger.error(f"Error processing video: {e}")

# Send notification (placeholder - integrate with your notification system)
def send_notification(title, message):
    logger.info(f"NOTIFICATION: {title} - {message}")
    # Implement your notification logic here
    # For example, you could emit a socket.io event to the client

# Main function to monitor for new videos
def monitor_videos():
    conn = get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        return
        
    cursor = conn.cursor(dictionary=True)
    
    # Get last processed video ID
    last_processed_id = 0
    
    while True:
        try:
            # Check for new videos
            cursor.execute("SELECT video_id FROM videos WHERE video_id > %s ORDER BY video_id", (safe_int(last_processed_id),))
            new_videos = cursor.fetchall()
            
            for video in new_videos:
                video_id = safe_get(video, 'video_id')
                if video_id:
                    logger.info(f"Processing video ID: {video_id}")
                    
                    # Process in a separate thread to avoid blocking
                    threading.Thread(target=process_video, args=(video_id,)).start()
                    
                    last_processed_id = video_id
            
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
        }
        
        cursor.execute("""
            INSERT INTO videos 
            (filename, path, camera_role)
            VALUES (%(filename)s, %(path)s, %(camera_role)s)
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

if __name__ == "__main__":
    import sys
    
    parser = argparse.ArgumentParser(description='Process videos for object and face detection')
    parser.add_argument('--video', help='Process a single video file')
    parser.add_argument('--camera-role', default='unknown', help='Camera role for the video')
    parser.add_argument('--monitor', action='store_true', help='Monitor for new videos')
    parser.add_argument('--db-host', default='localhost', help='Database host')
    parser.add_argument('--db-user', default='root', help='Database user')
    parser.add_argument('--db-password', default='', help='Database password')
    parser.add_argument('--db-name', default='owl_security', help='Database name')
    
    args = parser.parse_args()
    
    # Update database config
    db_config = {
        'host': args.db_host,
        'user': args.db_user,
        'password': args.db_password,
        'database': args.db_name
    }
    
    # Initialize face detection
    if not init_face_detection():
        logger.error("Failed to initialize face detection")
        sys.exit(1)
    
    # Load known faces
    load_known_faces()
    
    if args.video:
        logger.info(f"Processing single video: {args.video}")
        video_id = process_single_video(args.video, args.camera_role)
        logger.info(f"Processed video with ID: {video_id}")
    elif args.monitor:
        logger.info("Starting video monitoring")
        monitor_videos()
    else:
        parser.print_help() 