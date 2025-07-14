#!/usr/bin/env python3
"""
Enhanced face recognition module using InsightFace
This module provides high-accuracy face detection, alignment, and recognition
using InsightFace and related deep learning models.
"""

import os
import cv2
import json
import numpy as np
import insightface
import pickle
from sklearn.metrics.pairwise import cosine_similarity
import logging
from typing import List, Dict, Tuple, Optional, Any, Union

# Note: We're using InsightFace's built-in face detection and alignment
# No need for mediapipe or additional alignment libraries

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
FACE_WIDTH = 112
FACE_HEIGHT = 112
FACE_DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'insightface_db.pkl')
DETECTION_SIZE = (640, 640)  # Detection size for InsightFace detector
RECOGNITION_THRESHOLD = 0.5  # Cosine similarity threshold (0.5 is a good starting point)
MAX_NUM_FACES = 5  # Max number of faces to detect in a single image

# Global variables
face_model = None
face_database = {}  # Format: {name: {'role': role, 'embeddings': [list of embeddings], 'access': {...}}}
model_initialized = False

def init_face_recognition() -> bool:
    """Initialize face recognition system with InsightFace model"""
    global face_model, model_initialized, face_database
    
    try:
        # Initialize InsightFace model
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
        os.makedirs(model_path, exist_ok=True)
        
        # Create model handler - use 'buffalo_l' for better accuracy, but requires downloading model
        face_model = insightface.app.FaceAnalysis(name='buffalo_l', root=model_path)
        face_model.prepare(ctx_id=-1, det_size=DETECTION_SIZE)
        
        logger.info("InsightFace model initialized successfully")
        model_initialized = True
        
        # Load face database if exists
        if os.path.exists(FACE_DB_FILE):
            try:
                with open(FACE_DB_FILE, 'rb') as f:
                    face_database = pickle.load(f)
                logger.info(f"Loaded {len(face_database)} identities from database")
            except Exception as e:
                logger.error(f"Error loading face database: {e}")
                face_database = {}
        
        return True
    except Exception as e:
        logger.error(f"Error initializing face recognition: {e}")
        model_initialized = False
        return False

def detect_and_align_faces(image: np.ndarray) -> List[Dict]:
    """Detect and align faces in an image using InsightFace
    
    Args:
        image: Input image (BGR format)
        
    Returns:
        List of face dictionaries with bounding box, landmarks, and embedding
    """
    if not model_initialized or face_model is None:
        if not init_face_recognition():
            return []
    
    # Make sure image is in BGR format (OpenCV default)
    if image.shape[2] == 4:  # RGBA format
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2BGR)
    
    try:
        # Detect faces
        faces = face_model.get(image)
        return faces
    except Exception as e:
        logger.error(f"Error detecting faces: {e}")
        return []

def extract_faces_from_image(image_path: str) -> List[Dict]:
    """Extract faces from an image file
    
    Args:
        image_path: Path to the image file
        
    Returns:
        List of face dictionaries with bounding box, landmarks, and embedding
    """
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Error loading image: {image_path}")
            return []
        
        # Detect and align faces
        faces = detect_and_align_faces(image)
        
        # Keep track of original image path
        for face in faces:
            face['image_path'] = image_path
        
        return faces
    except Exception as e:
        logger.error(f"Error extracting faces: {e}")
        return []

def add_face_to_database(name: str, role: str, face_data: Union[Dict, List[Dict]], access_areas: Dict = None) -> bool:
    """Add a face or faces to the database
    
    Args:
        name: Name of the person
        role: Role of the person (Family, Friend, etc.)
        face_data: Face data dictionary from detect_and_align_faces or a list of them
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

def recognize_face(face_embedding: np.ndarray, threshold: float = RECOGNITION_THRESHOLD) -> Tuple[str, float, Dict]:
    """Recognize a face using cosine similarity
    
    Args:
        face_embedding: Face embedding to recognize
        threshold: Similarity threshold (higher = more strict)
        
    Returns:
        Tuple of (name, similarity, access permissions)
    """
    if not face_database:
        logger.warning("Face database is empty")
        return "Unknown", 0.0, {}
    
    max_similarity = 0.0
    best_match_name = "Unknown"
    access_permissions = {}
    matched_role = ""
    
    for name, identity in face_database.items():
        embeddings = identity['embeddings']
        
        # Compare with all embeddings for this person
        similarities = cosine_similarity([face_embedding], embeddings)[0]
        best_similarity = np.max(similarities)
        
        # Update best match
        if best_similarity > max_similarity and best_similarity > threshold:
            max_similarity = best_similarity
            best_match_name = name
            access_permissions = identity.get('access', {})
            matched_role = identity.get('role', '')
    
    logger.debug(f"Recognized: {best_match_name} with similarity {max_similarity:.4f}")
    
    result = {
        'name': best_match_name,
        'similarity': float(max_similarity),
        'is_known': best_match_name != "Unknown",
        'role': matched_role,
        'access': access_permissions
    }
    
    return best_match_name, float(max_similarity), result

def process_face_image(image_path: str) -> Dict:
    """Process a face image and return recognition results
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Dictionary with recognition results and face data
    """
    try:
        # Extract faces from image
        faces = extract_faces_from_image(image_path)
        
        if not faces:
            return {
                'success': False,
                'error': 'No face detected in the image'
            }
        
        # Use the largest face (usually the main subject in enrollment images)
        # For InsightFace, use detection score to get best face
        best_face = max(faces, key=lambda f: f.get('det_score', 0))
        
        # Get embedding
        embedding = best_face['embedding']
        
        # Create bounding box in expected format
        bbox = best_face['bbox']
        box = {
            'x1': int(bbox[0]),
            'y1': int(bbox[1]),
            'x2': int(bbox[2]),
            'y2': int(bbox[3])
        }
        
        # Get recognition results
        name, similarity, recognition_result = recognize_face(embedding)
        
        return {
            'success': True,
            'embedding': embedding.tolist(),  # Convert to list for JSON serialization
            'face': best_face,
            'bbox': box,
            'recognition': recognition_result
        }
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

# Initialize on module load
init_face_recognition()

# Command line interface
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python insightface_recognition.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = process_face_image(image_path)
    
    if result['success']:
        # Print compact result for command line use
        print(json.dumps(result))
    else:
        print(json.dumps(result))
        sys.exit(1) 