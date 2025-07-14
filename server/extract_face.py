#!/usr/bin/env python3
"""
Extract face embeddings from images using MediaPipe for detection and InsightFace for embeddings
"""
import json
import sys
import os
import logging
import numpy as np

# Import our custom MediaPipe-based face module
from mediapipe_face import (
    process_face_image,
    extract_faces_from_image,
    add_face_to_database
)

# Set up logging to stderr, not stdout
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', stream=sys.stderr)
logger = logging.getLogger(__name__)

# Redirect insightface and other package logs to stderr as well
for log_name in ['insightface', 'onnxruntime', 'mediapipe', 'tensorflow', 'albumentations']:
    pkg_logger = logging.getLogger(log_name)
    pkg_logger.setLevel(logging.WARNING)
    pkg_logger.handlers = []
    stderr_handler = logging.StreamHandler(sys.stderr)
    pkg_logger.addHandler(stderr_handler)

def extract_face(image_path):
    """
    Extract face embeddings from an image using MediaPipe for detection and InsightFace for embeddings.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        dict: JSON-compatible dictionary with face encoding data
    """
    try:
        # Process the image with our MediaPipe+InsightFace module
        result = process_face_image(image_path)
        
        if not result['success']:
            logger.warning(f"No faces detected in {image_path}")
            return {
                'success': False,
                'error': 'No face detected in the image'
            }
        
        return result
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == "__main__":
    # Ensure no debug output goes to stdout
    # This is critical because we need clean JSON output
    
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Please provide an image path'
        }), file=sys.stdout)
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({
            'success': False,
            'error': 'Image file does not exist'
        }), file=sys.stdout)
        sys.exit(1)
    
    result = extract_face(image_path)
    # Ensure only clean JSON is printed to stdout
    print(json.dumps(result), file=sys.stdout)
    sys.stdout.flush()