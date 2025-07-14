#!/usr/bin/env python3
"""
Test script for InsightFace-based face recognition
"""
import os
import sys
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import our custom InsightFace module
from insightface_recognition import (
    process_face_image,
    extract_faces_from_image,
    add_face_to_database
)

def test_face_detection(image_path):
    """Test face detection using a sample image"""
    logger.info(f"Testing face detection on: {image_path}")
    
    # Process the face image
    result = process_face_image(image_path)
    
    if result['success']:
        logger.info(f"Face detected successfully")
        bbox = result['bbox']
        logger.info(f"Face bounding box: x1={bbox['x1']}, y1={bbox['y1']}, x2={bbox['x2']}, y2={bbox['y2']}")
        
        # Try to recognize the face - handle empty response format
        try:
            recognition = result.get('recognition', {})
            name = recognition.get('name', 'Unknown')
            similarity = recognition.get('similarity', 0.0)
            logger.info(f"Recognition result: {name} (similarity: {similarity:.4f})")
        except Exception as e:
            logger.warning(f"Error accessing recognition result: {e}")
        
        return True
    else:
        logger.error(f"Face detection failed: {result.get('error', 'Unknown error')}")
        return False

def test_add_face(image_path, name="Test Person", role="Test"):
    """Test adding a face to the database"""
    logger.info(f"Testing face registration for {name} using: {image_path}")
    
    # Extract faces from the image
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        logger.error(f"No faces found in {image_path}")
        return False
    
    # Add the first face to the database
    access_areas = {
        'bedroom': True,
        'living_room': True,
        'kitchen': True,
        'front_door': True
    }
    
    success = add_face_to_database(name, role, faces[0], access_areas)
    
    if success:
        logger.info(f"Successfully added {name} to the face database")
        return True
    else:
        logger.error(f"Failed to add {name} to the face database")
        return False

if __name__ == "__main__":
    # Use test image if provided as argument, or the default test face
    if len(sys.argv) > 1:
        test_image = sys.argv[1]
    else:
        test_image = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_face.jpg')
    
    if not os.path.exists(test_image):
        logger.error(f"Test image not found: {test_image}")
        sys.exit(1)
    
    # Run detection test
    detection_ok = test_face_detection(test_image)
    
    # Run registration test
    if detection_ok:
        registration_ok = test_add_face(test_image)
        if registration_ok:
            print("All tests passed successfully!")
        else:
            print("Face registration test failed!")
            sys.exit(1)
    else:
        print("Face detection test failed!")
        sys.exit(1) 