#!/usr/bin/env python3
"""
OpenCV-based face detection and recognition fallback
This module provides face detection functionality using only OpenCV,
without requiring dlib or face_recognition libraries.
"""

import cv2
import numpy as np
import json
import os
import pickle
from typing import List, Dict, Tuple, Optional, Any

# Load pre-trained models
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Try to load LBPH face recognizer if available
try:
    face_recognizer = cv2.face.LBPHFaceRecognizer_create()
    HAS_FACE_RECOGNITION = True
except AttributeError:
    # Older versions of OpenCV or missing modules
    HAS_FACE_RECOGNITION = False
    print("OpenCV face recognition module not available, using basic detection only")

# Constants
FACE_WIDTH = 128
FACE_HEIGHT = 128
RECOGNIZER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_recognizer.yml')
FACE_DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_db.pkl')

# Global variables
known_faces = {}
face_encodings = []
face_names = []

def init_face_recognition():
    """Initialize face recognition system"""
    global known_faces, face_recognizer
    
    if not HAS_FACE_RECOGNITION:
        return False
    
    # Load face database if exists
    if os.path.exists(FACE_DB_FILE):
        try:
            with open(FACE_DB_FILE, 'rb') as f:
                known_faces = pickle.load(f)
            print(f"Loaded {len(known_faces)} known faces")
        except Exception as e:
            print(f"Error loading face database: {e}")
    
    # Load recognizer if exists
    if os.path.exists(RECOGNIZER_FILE):
        try:
            face_recognizer.read(RECOGNIZER_FILE)
            print("Loaded face recognizer model")
            return True
        except Exception as e:
            print(f"Error loading face recognizer: {e}")
    
    return False

def detect_faces(image: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """Detect faces in an image using OpenCV
    
    Args:
        image: Input image (BGR format)
        
    Returns:
        List of face rectangles as (x, y, w, h)
    """
    # Convert to grayscale for face detection
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Detect faces
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    return faces

def extract_face_encoding(image: np.ndarray, face_rect: Tuple[int, int, int, int]) -> np.ndarray:
    """Extract a simple face encoding from an image
    
    Args:
        image: Input image (BGR format)
        face_rect: Face rectangle as (x, y, w, h)
        
    Returns:
        Face encoding as numpy array
    """
    x, y, w, h = face_rect
    
    # Extract face region
    face_roi = image[y:y+h, x:x+w]
    
    # Convert to grayscale
    gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    
    # Resize to standard size
    face_resized = cv2.resize(gray, (FACE_WIDTH, FACE_HEIGHT))
    
    # Apply histogram equalization for better recognition
    face_normalized = cv2.equalizeHist(face_resized)
    
    # Flatten the image as a simple "encoding"
    encoding = face_normalized.flatten().astype(np.float32)
    
    return encoding

def compare_faces(known_encodings: List[np.ndarray], face_encoding: np.ndarray, 
                 tolerance: float = 0.6) -> List[bool]:
    """Compare a face encoding against a list of known encodings
    
    Args:
        known_encodings: List of known face encodings
        face_encoding: Face encoding to compare
        tolerance: Threshold for considering a match (lower = stricter)
        
    Returns:
        List of boolean values indicating matches
    """
    if not HAS_FACE_RECOGNITION or not known_encodings:
        return []
    
    matches = []
    for encoding in known_encodings:
        # Use L2 norm (Euclidean distance) for comparison
        dist = np.linalg.norm(encoding - face_encoding)
        # Convert distance to similarity (1 = identical, 0 = completely different)
        similarity = 1.0 - min(dist / 100.0, 1.0)
        matches.append(similarity >= (1.0 - tolerance))
    
    return matches

def recognize_face(face_encoding: np.ndarray) -> Tuple[str, float]:
    """Recognize a face using the trained model
    
    Args:
        face_encoding: Face encoding to recognize
        
    Returns:
        Tuple of (name, confidence)
    """
    if not HAS_FACE_RECOGNITION:
        return "Unknown", 0.0
    
    try:
        # Reshape for LBPH recognizer
        face_array = face_encoding.reshape(FACE_HEIGHT, FACE_WIDTH)
        
        # Predict
        label, confidence = face_recognizer.predict(face_array)
        
        # Convert confidence to similarity (0-100%, higher is better)
        similarity = max(0, min(100 - confidence, 100)) / 100.0
        
        # Get name from label
        name = "Unknown"
        for person_name, person_data in known_faces.items():
            if person_data.get('label') == label:
                name = person_name
                break
        
        return name, similarity
    except Exception as e:
        print(f"Error recognizing face: {e}")
        return "Unknown", 0.0

def add_face(name: str, face_encoding: np.ndarray) -> bool:
    """Add a face to the known faces database
    
    Args:
        name: Name of the person
        face_encoding: Face encoding to add
        
    Returns:
        True if successful, False otherwise
    """
    global known_faces, face_recognizer
    
    if not HAS_FACE_RECOGNITION:
        return False
    
    try:
        # Check if person already exists
        if name not in known_faces:
            # Assign a new label
            label = len(known_faces)
            known_faces[name] = {
                'label': label,
                'encodings': [face_encoding],
                'count': 1
            }
        else:
            # Add to existing person
            known_faces[name]['encodings'].append(face_encoding)
            known_faces[name]['count'] += 1
        
        # Retrain recognizer
        labels = []
        faces = []
        
        for person_name, person_data in known_faces.items():
            for encoding in person_data['encodings']:
                # Reshape for LBPH recognizer
                face_array = encoding.reshape(FACE_HEIGHT, FACE_WIDTH)
                faces.append(face_array)
                labels.append(person_data['label'])
        
        face_recognizer.train(faces, np.array(labels))
        
        # Save the recognizer and database
        face_recognizer.write(RECOGNIZER_FILE)
        with open(FACE_DB_FILE, 'wb') as f:
            pickle.dump(known_faces, f)
        
        return True
    except Exception as e:
        print(f"Error adding face: {e}")
        return False

def extract_face_encoding_from_file(image_path: str) -> Optional[np.ndarray]:
    """Extract face encoding from an image file
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Face encoding or None if no face detected
    """
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            print(f"Error loading image: {image_path}")
            return None
        
        # Detect faces
        faces = detect_faces(image)
        if len(faces) == 0:
            print("No face detected")
            return None
        
        # Use the largest face
        largest_face = max(faces, key=lambda rect: rect[2] * rect[3])
        
        # Extract encoding
        encoding = extract_face_encoding(image, largest_face)
        return encoding
    except Exception as e:
        print(f"Error extracting face encoding: {e}")
        return None

def encode_face_for_json(face_encoding: np.ndarray) -> str:
    """Convert face encoding to JSON-compatible string
    
    Args:
        face_encoding: Face encoding
        
    Returns:
        JSON string representation
    """
    return json.dumps(face_encoding.tolist())

# Initialize on module load
if HAS_FACE_RECOGNITION:
    init_face_recognition()

# Command line interface
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python opencv_face.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    encoding = extract_face_encoding_from_file(image_path)
    
    if encoding is not None:
        print(encode_face_for_json(encoding))
    else:
        print("No face detected")
        sys.exit(1) 