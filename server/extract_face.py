#!/usr/bin/env python3
import face_recognition
import cv2
import numpy as np
import json
import sys
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extract_face(image_path):
    """
    Extract face encodings from an image.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        dict: JSON-compatible dictionary with face encoding data
    """
    try:
        # Read the image
        image = face_recognition.load_image_file(image_path)
        
        # Find face locations
        face_locations = face_recognition.face_locations(image)
        
        if not face_locations:
            logger.warning(f"No faces detected in {image_path}")
            return {
                'success': False,
                'error': 'No face detected in the image'
            }
        
        # Get face encodings
        face_encodings = face_recognition.face_encodings(image, face_locations)
        
        if not face_encodings:
            logger.warning(f"Could not extract face encodings from {image_path}")
            return {
                'success': False,
                'error': 'Failed to encode face'
            }
        
        # Convert the first face encoding to a list for JSON serialization
        encoding = face_encodings[0].tolist()
        
        # Get face location for cropping
        top, right, bottom, left = face_locations[0]
        
        return {
            'success': True,
            'encoding': encoding,
            'location': {
                'top': top,
                'right': right,
                'bottom': bottom,
                'left': left
            }
        }
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Please provide an image path'
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({
            'success': False,
            'error': 'Image file does not exist'
        }))
        sys.exit(1)
    
    result = extract_face(image_path)
    print(json.dumps(result)) 