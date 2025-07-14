#!/usr/bin/env python3
"""
MediaPipe-based face detection and recognition module
This module uses MediaPipe for face detection and alignment,
and InsightFace for face recognition/embedding generation.
"""

import os
import cv2
import json
import numpy as np
import mediapipe as mp
import insightface
import pickle
from sklearn.metrics.pairwise import cosine_similarity
import logging
import mysql.connector
import sys
from typing import List, Dict, Tuple, Optional, Any, Union

# Configure logging to use stderr
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', stream=sys.stderr)
logger = logging.getLogger(__name__)

# Initialize MediaPipe
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh  # Added for alignment
mp_drawing = mp.solutions.drawing_utils

# Constants
FACE_WIDTH = 112  # Required size for InsightFace
FACE_HEIGHT = 112  # Required size for InsightFace
FACE_DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mediapipe_face_db.pkl')
DETECTION_CONFIDENCE = 0.5  # Minimum confidence for MediaPipe face detection
RECOGNITION_THRESHOLD = 0.90  # Cosine similarity threshold (0.9 for high confidence)

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'owl_security'
}

# Global variables
face_detector = None
face_mesh = None  # Added for alignment
insightface_model = None
face_database = {}  # Format: {name: {'role': role, 'embeddings': [list of embeddings], 'access': {...}}}
model_initialized = False

# Standard face landmark positions for alignment (eyes centers)
# For 5-point alignment (using eyes centers and nose tip)
STANDARD_LANDMARKS = np.float32([
    [38.2946, 51.6963],  # Left eye
    [73.5318, 51.5014],  # Right eye
    [56.0252, 71.7366],  # Nose tip
])

def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        logger.error(f"Database connection error: {err}")
        return None

def load_known_faces_from_db():
    """Load known faces from MySQL database"""
    global face_database
    
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return False
            
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM known_faces")
        known_faces = cursor.fetchall()
        cursor.close()
        conn.close()
        
        face_database = {}
        for face in known_faces:
            if face and 'face_encoding' in face and face['face_encoding']:
                try:
                    # Convert to string if it's not already
                    face_encoding_str = face['face_encoding']
                    if not isinstance(face_encoding_str, str):
                        face_encoding_str = str(face_encoding_str)
                    
                    # Parse the face encoding
                    encoding = np.array(json.loads(face_encoding_str))
                    
                    # Store in our database format
                    name = str(face.get('name', 'Unknown'))
                    face_database[name] = {
                        'role': str(face.get('role', 'Unknown')),
                        'embeddings': [encoding],  # List of embeddings for this person
                        'access': {
                            'bedroom': bool(face.get('access_bedroom', False)),
                            'living_room': bool(face.get('access_living_room', False)),
                            'kitchen': bool(face.get('access_kitchen', False)),
                            'front_door': bool(face.get('access_front_door', False))
                        }
                    }
                except Exception as e:
                    logger.error(f"Error parsing face encoding for {face.get('name', 'Unknown')}: {e}")
        
        logger.info(f"Loaded {len(face_database)} known faces from database")
        return True
    except Exception as e:
        logger.error(f"Error loading known faces from database: {e}")
        return False

def init_face_recognition() -> bool:
    """Initialize face detection using MediaPipe and recognition with InsightFace model"""
    global face_detector, face_mesh, insightface_model, model_initialized, face_database
    
    try:
        # Initialize MediaPipe Face Detection
        face_detector = mp_face_detection.FaceDetection(
            model_selection=1,  # 0 for short-range, 1 for full-range detection
            min_detection_confidence=DETECTION_CONFIDENCE
        )
        
        # Initialize MediaPipe Face Mesh for alignment
        face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            min_detection_confidence=DETECTION_CONFIDENCE
        )
        
        # Initialize InsightFace for recognition
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
        os.makedirs(model_path, exist_ok=True)
        
        # Redirect stdout to stderr during insightface initialization to prevent JSON contamination
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        try:
            # Initialize InsightFace Recognition model
            insightface_app = insightface.app.FaceAnalysis(name='buffalo_l', root=model_path)
            insightface_app.prepare(ctx_id=-1)
            
            # Use the recognition model directly from app instead of get_model
            # The method has changed in newer versions
            insightface_model = insightface_app
        finally:
            # Restore stdout
            sys.stdout = old_stdout
        
        logger.info("MediaPipe face detection and InsightFace recognition initialized successfully")
        model_initialized = True
        
        # Load known faces from database
        if not load_known_faces_from_db():
            logger.warning("Failed to load known faces from database")
        
        return True
    except Exception as e:
        logger.error(f"Error initializing face detection/recognition: {e}")
        model_initialized = False
        return False

def align_face(image: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
    """Aligns a face using MediaPipe Face Mesh or InsightFace's alignment
    
    Args:
        image: Input image containing the face
        bbox: Bounding box of the face (x_min, y_min, x_max, y_max)
        
    Returns:
        Aligned face image
    """
    global face_mesh
    
    if face_mesh is None:
        if not init_face_recognition():
            return image
    
    # Extract the face region
    x_min, y_min, x_max, y_max = bbox
    face_img = image[y_min:y_max, x_min:x_max]
    
    # If face extraction failed, return the original
    if face_img.size == 0:
        logger.warning("Face region is empty during alignment")
        return image
    
    try:
        # Convert to RGB for MediaPipe
        face_img_rgb = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        
        # Process with Face Mesh
        results = face_mesh.process(face_img_rgb)
        
        if not results.multi_face_landmarks or len(results.multi_face_landmarks) == 0:
            logger.warning("No face landmarks detected during alignment")
            return face_img
        
        # Get landmarks
        landmarks = results.multi_face_landmarks[0].landmark
        
        # Get image dimensions
        height, width = face_img.shape[:2]
        
        # Extract key landmarks for alignment (eyes and nose)
        # Left eye, right eye, nose tip (using MediaPipe face mesh indices)
        left_eye = np.mean([(landmarks[33].x * width, landmarks[33].y * height), 
                            (landmarks[133].x * width, landmarks[133].y * height)], axis=0)
        right_eye = np.mean([(landmarks[362].x * width, landmarks[362].y * height),
                             (landmarks[263].x * width, landmarks[263].y * height)], axis=0)
        nose_tip = (landmarks[1].x * width, landmarks[1].y * height)
        
        # Create source points
        src_pts = np.float32([left_eye, right_eye, nose_tip])
        
        # Calculate scale based on eye distance
        eye_distance = np.linalg.norm(right_eye - left_eye)
        scale = (STANDARD_LANDMARKS[1][0] - STANDARD_LANDMARKS[0][0]) / eye_distance
        
        # Get affine transform matrix
        M = cv2.getAffineTransform(src_pts, STANDARD_LANDMARKS)
        
        # Apply affine transformation to align face
        aligned_face = cv2.warpAffine(face_img, M, (FACE_WIDTH, FACE_HEIGHT))
        
        logger.debug("Face alignment successful")
        return aligned_face
    
    except Exception as e:
        logger.error(f"Error during face alignment: {e}")
        return face_img  # Return original face image if alignment fails

def detect_faces(image: np.ndarray) -> List[Dict]:
    """Detect faces in an image using MediaPipe
    
    Args:
        image: Input image (BGR format)
        
    Returns:
        List of face dictionaries with bounding box and landmarks
    """
    global face_detector
    
    if face_detector is None:
        if not init_face_recognition():
            return []
    
    # Make sure image is in RGB format for MediaPipe
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Detect faces
    results = face_detector.process(image_rgb)
    
    # Process results
    faces = []
    if results.detections:
        image_height, image_width, _ = image.shape
        for detection in results.detections:
            # Get bounding box
            bbox = detection.location_data.relative_bounding_box
            x_min = max(0, int(bbox.xmin * image_width))
            y_min = max(0, int(bbox.ymin * image_height))
            width = int(bbox.width * image_width)
            height = int(bbox.height * image_height)
            
            # Add some margin (20%)
            margin_x = int(width * 0.2)
            margin_y = int(height * 0.2)
            x_min = max(0, x_min - margin_x)
            y_min = max(0, y_min - margin_y)
            width = min(image_width - x_min, width + 2 * margin_x)
            height = min(image_height - y_min, height + 2 * margin_y)
            
            # Define full bounding box
            full_bbox = (x_min, y_min, x_min+width, y_min+height)
            
            # Extract face
            face_image = image[y_min:y_min+height, x_min:x_min+width]
            
            # Skip if face crop is empty
            if face_image.size == 0:
                continue
            
            # Apply face alignment - new step added to the pipeline
            aligned_face = align_face(image, full_bbox)
            
            # Get face encoding using InsightFace
            try:
                # Use the aligned face for InsightFace processing
                # First try with the aligned face
                insight_faces = insightface_model.get(aligned_face)
                
                # If no faces detected, fall back to the original approach
                if not insight_faces:
                    logger.debug("No faces detected in aligned image, trying original approach")
                    insight_faces = insightface_model.get(image)
                
                # If still no faces detected by InsightFace, skip
                if not insight_faces:
                    logger.warning("InsightFace failed to detect any faces")
                    continue
                
                # Find the face that best matches our MediaPipe detection
                mediapipe_center_x = x_min + width // 2
                mediapipe_center_y = y_min + height // 2
                best_face = None
                min_distance = float('inf')
                
                for face in insight_faces:
                    # Get the center of this InsightFace detection
                    face_bbox = face.bbox.astype(int)
                    face_center_x = (face_bbox[0] + face_bbox[2]) // 2
                    face_center_y = (face_bbox[1] + face_bbox[3]) // 2
                    
                    # Calculate distance to MediaPipe detection
                    distance = ((face_center_x - mediapipe_center_x) ** 2 + 
                               (face_center_y - mediapipe_center_y) ** 2) ** 0.5
                    
                    if distance < min_distance:
                        min_distance = distance
                        best_face = face
                
                if best_face is None:
                    continue
                
                # Get the embedding from InsightFace
                embedding = best_face.normed_embedding
                
                # Create face dictionary
                face_data = {
                    'bbox': full_bbox,
                    'confidence': float(detection.score[0]),
                    'embedding': embedding,
                    'face_image': face_image,
                    'aligned_face': aligned_face  # Store the aligned face as well
                }
                
                faces.append(face_data)
            except Exception as e:
                logger.error(f"Error getting face embedding: {e}")
    
    return faces

def extract_faces_from_image(image_path: str) -> List[Dict]:
    """Extract faces from an image file
    
    Args:
        image_path: Path to the image file
        
    Returns:
        List of face dictionaries with bounding box and embedding
    """
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Error loading image: {image_path}")
            return []
        
        # Log image shape for debugging
        logger.info(f"Image shape: {image.shape}")
        
        # Save a debugging copy of the image
        debug_path = os.path.join(os.path.dirname(image_path), f"debug_{os.path.basename(image_path)}")
        cv2.imwrite(debug_path, image)
        logger.info(f"Saved debug image to {debug_path}")
        
        # Redirect stdout during processing to prevent JSON contamination
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        try:
            # Use the detect_faces function which includes alignment
            logger.info("Detecting and aligning faces...")
            faces = detect_faces(image)
            
            # If MediaPipe detection fails, try InsightFace directly
            if not faces and insightface_model:
                logger.info("MediaPipe detection failed, trying InsightFace...")
                try:
                    insightface_faces = insightface_model.get(image)
                    if insightface_faces:
                        logger.info(f"InsightFace detected {len(insightface_faces)} faces")
                        # Convert InsightFace face objects to our format
                        for idx, face in enumerate(insightface_faces):
                            try:
                                bbox = face.bbox.astype(int)
                                logger.info(f"Face {idx+1}: bbox={bbox}, confidence={face.det_score:.4f}")
                                
                                # Check for valid bbox dimensions
                                if bbox[0] >= bbox[2] or bbox[1] >= bbox[3] or bbox[0] < 0 or bbox[1] < 0:
                                    logger.warning(f"Invalid bounding box: {bbox}")
                                    continue
                                    
                                # Ensure bbox is within image boundaries
                                bbox[0] = max(0, bbox[0])
                                bbox[1] = max(0, bbox[1])
                                bbox[2] = min(image.shape[1], bbox[2])
                                bbox[3] = min(image.shape[0], bbox[3])
                                
                                # Skip faces that are too small
                                if bbox[2] - bbox[0] < 20 or bbox[3] - bbox[1] < 20:
                                    logger.warning(f"Face too small: {bbox[2] - bbox[0]}x{bbox[3] - bbox[1]}")
                                    continue
                                
                                # Extract face image
                                face_img = image[bbox[1]:bbox[3], bbox[0]:bbox[2]]
                                if face_img.size == 0:
                                    logger.warning(f"Empty face image for bbox: {bbox}")
                                    continue
                                
                                # Apply face alignment using our alignment function
                                aligned_face = align_face(image, (bbox[0], bbox[1], bbox[2], bbox[3]))
                                
                                # Create placeholder embedding if not available
                                # Using 512 dimensions as that's what InsightFace w600k_r50 model produces
                                embedding = getattr(face, 'normed_embedding', np.zeros(512))
                                
                                # Log embedding dimensions for debugging
                                logger.debug(f"Face embedding dimensions: {embedding.shape}")
                                
                                faces.append({
                                    'bbox': (int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])),
                                    'confidence': float(face.det_score),
                                    'embedding': embedding,
                                    'face_image': face_img,
                                    'aligned_face': aligned_face
                                })
                            except Exception as face_e:
                                logger.error(f"Error processing face {idx}: {face_e}")
                except Exception as e:
                    logger.error(f"InsightFace detection error: {e}")
            
            # Keep track of original image path
            for face in faces:
                face['image_path'] = image_path
            
            # Save debug images for each detected face
            for i, face in enumerate(faces):
                try:
                    # Save original face crop
                    face_debug_path = os.path.join(os.path.dirname(image_path), 
                                                  f"debug_face_{i}_{os.path.basename(image_path)}")
                    cv2.imwrite(face_debug_path, face['face_image'])
                    
                    # Save aligned face
                    aligned_debug_path = os.path.join(os.path.dirname(image_path), 
                                                     f"debug_aligned_face_{i}_{os.path.basename(image_path)}")
                    cv2.imwrite(aligned_debug_path, face['aligned_face'])
                    
                    logger.info(f"Saved debug face images to {face_debug_path} and {aligned_debug_path}")
                except Exception as e:
                    logger.error(f"Error saving debug face image: {e}")
                
            return faces
        finally:
            # Restore stdout
            sys.stdout = old_stdout
            
    except Exception as e:
        logger.error(f"Error extracting faces from image: {e}")
        return []

def add_face_to_database(name: str, role: str, face_data: Union[Dict, List[Dict]], access_areas: Dict = None) -> bool:
    """Add a face or faces to the database
    
    Args:
        name: Name of the person
        role: Role of the person (Family, Friend, etc.)
        face_data: Face data dictionary from detect_faces or a list of them
        access_areas: Dictionary of access permissions
        
    Returns:
        True if successful, False otherwise
    """
    global face_database
    
    if not model_initialized:
        if not init_face_recognition():
            return False
    
    try:
        # Convert to list if single face
        if not isinstance(face_data, list):
            face_data = [face_data]
        
        # Extract embeddings
        embeddings = []
        for face in face_data:
            if 'embedding' in face and face['embedding'] is not None:
                embeddings.append(face['embedding'])
        
        if not embeddings:
            logger.error("No valid embeddings found in face data")
            return False
        
        # Default access permissions if not provided
        if access_areas is None:
            access_areas = {
                'bedroom': False,
                'living_room': False,
                'kitchen': False,
                'front_door': False
            }
        
        # Update database
        if name not in face_database:
            face_database[name] = {
                'role': role,
                'embeddings': embeddings,
                'access': access_areas
            }
        else:
            # Add new embeddings to existing entry
            face_database[name]['embeddings'].extend(embeddings)
            face_database[name]['role'] = role
            face_database[name]['access'] = access_areas
        
        # Save database
        with open(FACE_DB_FILE, 'wb') as f:
            pickle.dump(face_database, f)
        
        logger.info(f"Added {len(embeddings)} embeddings for {name} ({role})")
        return True
    except Exception as e:
        logger.error(f"Error adding face to database: {e}")
        return False

def recognize_face(face_embedding: np.ndarray, threshold: float = RECOGNITION_THRESHOLD) -> Dict[str, Any]:
    """Recognize a face using cosine similarity
    
    Args:
        face_embedding: Face embedding to recognize
        threshold: Similarity threshold (higher = more strict)
        
    Returns:
        Dictionary with recognition results
    """
    if not face_database:
        logger.warning("Face database is empty")
        return {
            'name': "Unknown",
            'similarity': 0.0,
            'is_known': False,
            'role': '',
            'access': {}
        }
    
    max_similarity = 0.0
    best_match_name = "Unknown"
    access_permissions = {}
    matched_role = ""
    
    # Get dimensionality of the input embedding
    input_dim = face_embedding.shape[0]
    
    for name, identity in face_database.items():
        embeddings = identity['embeddings']
        
        # Check if we need to handle different dimensions
        if len(embeddings) > 0:
            db_dim = embeddings[0].shape[0]
            
            # If dimensions don't match, we need to adapt
            if db_dim != input_dim:
                logger.info(f"Dimension mismatch: input={input_dim}, database={db_dim}")
                
                # Option 1: Use PCA-like dimensionality reduction (simple approach)
                if input_dim > db_dim:
                    # Reduce the input embedding to match database
                    resized_embedding = face_embedding[:db_dim]
                    logger.info(f"Resized input embedding from {input_dim} to {db_dim}")
                    compare_embedding = resized_embedding
                else:
                    # Pad the input embedding to match database
                    resized_embedding = np.zeros(db_dim)
                    resized_embedding[:input_dim] = face_embedding
                    logger.info(f"Padded input embedding from {input_dim} to {db_dim}")
                    compare_embedding = resized_embedding
            else:
                compare_embedding = face_embedding
                
            # Compare with all embeddings for this person
            try:
                similarities = cosine_similarity([compare_embedding], embeddings)[0]
                best_similarity = np.max(similarities)
                
                # Update best match if above threshold
                if best_similarity > max_similarity and best_similarity > threshold:
                    max_similarity = best_similarity
                    best_match_name = name
                    access_permissions = identity.get('access', {})
                    matched_role = identity.get('role', '')
            except Exception as e:
                logger.error(f"Error calculating similarity for {name}: {e}")
                continue
    
    logger.debug(f"Recognized: {best_match_name} with similarity {max_similarity:.4f}")
    
    return {
        'name': best_match_name,
        'similarity': float(max_similarity),
        'is_known': best_match_name != "Unknown",
        'role': matched_role,
        'access': access_permissions
    }

def process_face_image(image_path: str) -> Dict:
    """Process a face image and return recognition results
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Dictionary with recognition results and face data
    """
    try:
        # Initialize if needed
        if insightface_model is None:
            if not init_face_recognition():
                return {
                    'success': False,
                    'error': 'Failed to initialize face recognition'
                }
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            return {
                'success': False,
                'error': f'Could not load image: {image_path}'
            }
        
        # Log image info
        logger.info(f"Image shape: {image.shape}")
        
        # Save a debug copy of the image
        debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'debug_test_face.jpg')
        cv2.imwrite(debug_path, image)
        logger.info(f"Saved debug image to debug_test_face.jpg")
        
        # Save a debug copy in the same directory as the source image
        source_dir = os.path.dirname(image_path)
        source_filename = os.path.basename(image_path)
        debug_source_path = os.path.join(source_dir, f"debug_{source_filename}")
        cv2.imwrite(debug_source_path, image)
        logger.info(f"Saved debug image to {debug_source_path}")
        
        # Redirect stdout during processing to prevent JSON contamination
        old_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        try:
            # Process with MediaPipe face detection and alignment
            logger.info("Attempting face detection with MediaPipe...")
            mediapipe_faces = detect_faces(image)
            
            if not mediapipe_faces:
                logger.info("MediaPipe detection failed, trying InsightFace...")
                try:
                    # Use InsightFace's built-in detection
                    insight_faces = insightface_model.get(image)
                    
                    if insight_faces:
                        # Convert InsightFace faces to our format
                        mediapipe_faces = []
                        for i, face in enumerate(insight_faces):
                            face_bbox = face.bbox.astype(int)
                            x1, y1, x2, y2 = face_bbox
                            
                            # Extract face image
                            face_img = image[y1:y2, x1:x2] if (y2 > y1 and x2 > x1) else image
                            
                            # Align the face using our alignment function
                            aligned_face = align_face(image, (x1, y1, x2, y2))
                            
                            # Create face dictionary
                            face_data = {
                                'bbox': (x1, y1, x2, y2),
                                'confidence': float(face.det_score),
                                'embedding': face.normed_embedding,
                                'face_image': face_img,
                                'aligned_face': aligned_face
                            }
                            mediapipe_faces.append(face_data)
                            
                            logger.info(f"Face {i+1}: bbox={face_bbox}, confidence={face.det_score:.4f}")
                    else:
                        logger.warning("No faces detected by InsightFace")
                except Exception as e:
                    logger.error(f"Error using InsightFace face detection: {e}")
            
            logger.info(f"Total faces detected: {len(mediapipe_faces)}")
            
            if not mediapipe_faces:
                return {
                    'success': False,
                    'error': 'No face detected in the image'
                }
            
            # Use the largest face (usually the main subject in enrollment images)
            best_face = max(mediapipe_faces, key=lambda f: 
                (f['bbox'][2] - f['bbox'][0]) * (f['bbox'][3] - f['bbox'][1]))
            
            # Save a debug copy of the aligned face
            debug_aligned_path = os.path.join(source_dir, f"debug_aligned_{source_filename}")
            cv2.imwrite(debug_aligned_path, best_face['aligned_face'])
            logger.info(f"Saved aligned face to {debug_aligned_path}")
            
            # Get embedding - use the embedding from the aligned face for better recognition
            embedding = best_face['embedding']
            
            # Create bounding box in expected format
            x1, y1, x2, y2 = best_face['bbox']
            box = {
                'x1': int(x1),
                'y1': int(y1),
                'x2': int(x2),
                'y2': int(y2)
            }
            
            # Perform recognition on the aligned face embedding
            recognition_result = recognize_face(embedding)
            
            # Create result
            result = {
                'success': True,
                'box': box,
                'embedding': embedding.tolist(),  # Convert numpy array to list for JSON serialization
                'recognition': recognition_result,
                'debug_image': debug_source_path,
                'debug_aligned_image': debug_aligned_path
            }
            
            return result
        finally:
            # Restore stdout
            sys.stdout = old_stdout
            
    except Exception as e:
        logger.error(f"Error processing face image: {e}")
        return {
            'success': False,
            'error': str(e)
        }

def encode_face_for_json(face_embedding: np.ndarray) -> str:
    """Convert face embedding to JSON-compatible string
    
    Args:
        face_embedding: Face embedding
        
    Returns:
        JSON string representation
    """
    return json.dumps(face_embedding.tolist())

def update_access_permissions(name: str, access_areas: Dict) -> bool:
    """Update access permissions for a person
    
    Args:
        name: Name of the person
        access_areas: Dictionary of access permissions
        
    Returns:
        True if successful, False otherwise
    """
    global face_database
    
    if not model_initialized:
        if not init_face_recognition():
            return False
    
    try:
        if name not in face_database:
            logger.error(f"Person {name} not found in database")
            return False
        
        face_database[name]['access'] = access_areas
        
        # Save database
        with open(FACE_DB_FILE, 'wb') as f:
            pickle.dump(face_database, f)
        
        logger.info(f"Updated access permissions for {name}")
        return True
    except Exception as e:
        logger.error(f"Error updating access permissions: {e}")
        return False

def delete_identity(name: str) -> bool:
    """Delete a person from the face database
    
    Args:
        name: Name of the person
        
    Returns:
        True if successful, False otherwise
    """
    global face_database
    
    try:
        if name not in face_database:
            logger.warning(f"Person {name} not found in database")
            return False
        
        del face_database[name]
        
        # Save database
        with open(FACE_DB_FILE, 'wb') as f:
            pickle.dump(face_database, f)
        
        logger.info(f"Deleted {name} from face database")
        return True
    except Exception as e:
        logger.error(f"Error deleting identity: {e}")
        return False

def draw_faces(image: np.ndarray, faces: List[Dict]) -> np.ndarray:
    """Draw detected faces on image
    
    Args:
        image: Input image (BGR format)
        faces: List of face dictionaries from detect_faces
        
    Returns:
        Image with faces drawn
    """
    image_copy = image.copy()
    
    for face in faces:
        x1, y1, x2, y2 = face['bbox']
        
        # Get recognition if available
        name = "Unknown"
        color = (0, 0, 255)  # Red for unknown
        
        if 'recognition' in face:
            recognition = face['recognition']
            name = recognition.get('name', 'Unknown')
            similarity = recognition.get('similarity', 0.0)
            
            if name != "Unknown":
                # Green for known faces
                color = (0, 255, 0)
                # Add similarity score
                name = f"{name} ({similarity:.2f})"
        
        # Draw bounding box
        cv2.rectangle(image_copy, (x1, y1), (x2, y2), color, 2)
        
        # Draw name
        cv2.putText(image_copy, name, (x1, y1-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    
    return image_copy

# Initialize on module load
init_face_recognition()

# Command line interface
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python mediapipe_face.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = process_face_image(image_path)
    
    if result['success']:
        # Print compact result for command line use
        print(json.dumps(result))
        
        # Display image with detected faces
        image = cv2.imread(image_path)
        faces = extract_faces_from_image(image_path)
        
        # Recognize each face
        for face in faces:
            recognition = recognize_face(face['embedding'])
            face['recognition'] = recognition
        
        # Draw faces on image
        image_with_faces = draw_faces(image, faces)
        
        # Show the image
        cv2.imshow("Detected Faces", image_with_faces)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    else:
        print(json.dumps(result))
        sys.exit(1) 