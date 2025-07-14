#!/usr/bin/env python3
import cv2
import numpy as np
import mysql.connector
import json
import os
import logging
from datetime import datetime
import ssl
import certifi
from typing import Dict, List, Any, Optional, Union
from mysql.connector.cursor import MySQLCursor
from mysql.connector.connection import MySQLConnection
from mysql.connector.pooling import PooledMySQLConnection
from mysql.connector.abstracts import MySQLConnectionAbstract

# Fix SSL certificate issue
ssl._create_default_https_context = ssl._create_unverified_context

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_db_connection() -> Optional[Union[MySQLConnection, PooledMySQLConnection, MySQLConnectionAbstract]]:
    try:
        return mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="owl_security"
        )
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

def load_known_faces() -> List[Dict[str, Any]]:
    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return []

        cursor = conn.cursor(dictionary=True)
        
        # Get known faces with their images
        cursor.execute("""
            SELECT kf.*, 
                   (SELECT fi.image_path 
                    FROM face_images fi 
                    WHERE fi.known_face_id = kf.known_face_id 
                    ORDER BY fi.date_added DESC 
                    LIMIT 1) as image_path
            FROM known_faces kf
            WHERE kf.face_encoding IS NOT NULL
        """)
        
        # Convert cursor results to list of dictionaries and explicitly convert bytes to strings
        rows = cursor.fetchall()
        known_faces: List[Dict[str, Any]] = []
        for row in rows:
            # Convert row to dictionary if it's not already
            row_dict = dict(row) if not isinstance(row, dict) else row
            face_dict = {}
            for key, value in row_dict.items():
                if isinstance(value, bytes):
                    face_dict[key] = value.decode('utf-8')
                else:
                    face_dict[key] = value
            known_faces.append(face_dict)
            
        cursor.close()
        conn.close()

        if not known_faces:
            logger.warning("No known faces found in database")
            return []

        logger.info(f"Found {len(known_faces)} known faces in database")
        
        # Process each face
        processed_faces: List[Dict[str, Any]] = []
        for face in known_faces:
            try:
                # Convert stored face encoding back to numpy array
                face_encoding = face.get('face_encoding')
                if face_encoding:
                    # Ensure face_encoding is a string
                    if not isinstance(face_encoding, str):
                        face_encoding = str(face_encoding)
                    
                    encoding = np.array(json.loads(face_encoding))
                    face_dict = {
                        'name': str(face.get('name', 'Unknown')),
                        'role': str(face.get('role', 'Unknown')),
                        'image_path': str(face.get('image_path', '')),
                        'access_bedroom': bool(face.get('access_bedroom', False)),
                        'access_living_room': bool(face.get('access_living_room', False)),
                        'access_kitchen': bool(face.get('access_kitchen', False)),
                        'access_front_door': bool(face.get('access_front_door', False)),
                        'encoding_array': encoding
                    }
                    processed_faces.append(face_dict)
                    
                    logger.info(f"Successfully loaded face encoding for {face_dict['name']}")
                    
                    # Log the image path
                    if face_dict['image_path']:
                        full_path = os.path.join(os.path.dirname(__file__), 'face_images', face_dict['image_path'])
                        logger.info(f"Image path for {face_dict['name']}: {full_path}")
                        if not os.path.exists(full_path):
                            logger.warning(f"Image file does not exist: {full_path}")
            except Exception as e:
                logger.error(f"Error processing face {face.get('name', 'unknown')}: {e}")

        return processed_faces

    except Exception as e:
        logger.error(f"Error loading known faces: {e}")
        return []

def test_recognition():
    # Load known faces
    logger.info("Loading known faces from database...")
    known_faces = load_known_faces()
    
    if not known_faces:
        logger.error("No known faces loaded, cannot test recognition")
        return
    
    logger.info(f"Successfully loaded {len(known_faces)} known faces")
    
    # Print face information
    for face in known_faces:
        logger.info(f"\nFace Details:")
        logger.info(f"  Name: {face['name']}")
        logger.info(f"  Role: {face['role']}")
        logger.info(f"  Image Path: {face['image_path']}")
        logger.info(f"  Access Permissions:")
        logger.info(f"    - Bedroom: {face['access_bedroom']}")
        logger.info(f"    - Living Room: {face['access_living_room']}")
        logger.info(f"    - Kitchen: {face['access_kitchen']}")
        logger.info(f"    - Front Door: {face['access_front_door']}")
        
        # Verify encoding format
        if 'face_encoding' in face:
            try:
                encoding = np.array(json.loads(face['face_encoding']))
                logger.info(f"  Encoding shape: {encoding.shape}")
                logger.info(f"  Encoding type: {encoding.dtype}")
                logger.info(f"  Encoding range: {encoding.min():.2f} to {encoding.max():.2f}")
            except Exception as e:
                logger.warning(f"  Error parsing encoding for {face['name']}: {e}")
        else:
            logger.warning(f"  No valid encoding found for {face['name']}")

    # Test with existing face images
    logger.info("\nTesting recognition with stored face images...")
    
    try:
        # Import face recognition modules
        try:
            from mediapipe_face import (
                detect_faces,
                extract_faces_from_image,
                recognize_face,
                init_face_recognition,
                RECOGNITION_THRESHOLD,
                process_face_image
            )
            logger.info("Using MediaPipe face recognition")
            recognition_system = "mediapipe"
        except ImportError:
            try:
                from insightface_recognition import (
                    detect_and_align_faces,
                    recognize_face,
                    init_face_recognition,
                    RECOGNITION_THRESHOLD
                )
                logger.info("Using InsightFace recognition")
                recognition_system = "insightface"
            except ImportError:
                logger.error("No face recognition system available")
                return

        # Initialize face recognition
        if not init_face_recognition():
            logger.error("Failed to initialize face recognition")
            return

        # Test recognition with each known face's image
        for face in known_faces:
            if face['image_path']:
                # Construct the full path correctly
                image_path = os.path.join(os.path.dirname(__file__), 'face_images', face['image_path'])
                
                if not os.path.exists(image_path):
                    logger.warning(f"Image file not found: {image_path}")
                    # Try to list contents of the directory
                    dir_path = os.path.dirname(image_path)
                    if os.path.exists(dir_path):
                        logger.info(f"Contents of directory {dir_path}:")
                        for item in os.listdir(dir_path):
                            logger.info(f"  - {item}")
                    continue
                
                logger.info(f"\nTesting recognition for: {face['name']}")
                logger.info(f"Using image: {image_path}")
                
                # Process the image using the appropriate recognition system
                if recognition_system == "mediapipe":
                    # Use process_face_image for MediaPipe
                    result = process_face_image(image_path)
                    if result['success']:
                        recognition = result['recognition']
                        name = recognition.get('name', 'Unknown')
                        similarity = recognition.get('similarity', 0.0)
                        role = recognition.get('role', '')
                        access = recognition.get('access', {})
                        
                        logger.info(f"Recognition result: {name} (similarity: {similarity:.4f})")
                        logger.info(f"Role: {role}")
                        logger.info(f"Access permissions: {access}")
                        
                        # Verify recognition accuracy
                        if name == face['name']:
                            logger.info("✓ Correctly recognized")
                        else:
                            logger.warning("✗ Recognition mismatch")
                    else:
                        logger.error(f"Failed to process image: {result.get('error', 'Unknown error')}")
                else:
                    # Use InsightFace directly
                    image = cv2.imread(image_path)
                    if image is None:
                        logger.error(f"Failed to read image: {image_path}")
                        continue
                        
                    faces = detect_and_align_faces(image)
                    if not faces:
                        logger.error("No faces detected")
                        continue
                        
                    # Use the first face
                    face_data = faces[0]
                    name, similarity, recognition = recognize_face(face_data['embedding'])
                    logger.info(f"Recognition result: {name} (similarity: {similarity:.4f})")
                    
                    # Verify recognition accuracy
                    if name == face['name']:
                        logger.info("✓ Correctly recognized")
                    else:
                        logger.warning("✗ Recognition mismatch")
                        
                    if name != "Unknown":
                        logger.info(f"Role: {recognition['role']}")
                        logger.info(f"Access permissions: {recognition['access']}")
                
    except Exception as e:
        logger.error(f"Error testing recognition: {e}")
        return

if __name__ == "__main__":
    test_recognition() 