#!/usr/bin/env python3
"""
Test script for the fixed embedding dimension handling in face recognition
"""
import os
import sys
import cv2
import numpy as np
import logging
from mediapipe_face import (
    init_face_recognition,
    extract_faces_from_image,
    add_face_to_database,
    recognize_face,
    draw_faces
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_embedding_dimensions():
    """Test if the embedding dimension handling is working correctly"""
    print("Testing embedding dimension handling...")
    
    # Initialize face recognition
    if not init_face_recognition():
        print("Error initializing face recognition system")
        return False
    
    # Create a test face image path
    test_image_path = os.path.join(os.path.dirname(__file__), 'test_face.jpg')
    if not os.path.exists(test_image_path):
        print(f"Test image not found: {test_image_path}")
        return False
    
    # Extract faces from the image
    faces = extract_faces_from_image(test_image_path)
    
    if not faces:
        # Try with a different image
        test_image_path = os.path.join(os.path.dirname(__file__), 'face_images/temp/nafis/1750693260712-capture_Nafis_20250623_064100.jpg')
        if os.path.exists(test_image_path):
            print(f"Trying with alternate image: {test_image_path}")
            faces = extract_faces_from_image(test_image_path)
    
    if not faces:
        print("No faces detected in any test images!")
        return False
    
    print(f"Detected {len(faces)} faces")
    
    # Get the first face's embedding
    face = faces[0]
    embedding = face['embedding']
    print(f"Original embedding shape: {embedding.shape}")
    
    # Test dimension handling with different sizes
    sizes_to_test = [128, 256, 512, 1024]
    for size in sizes_to_test:
        # Create a test embedding with a different dimension
        if size == embedding.shape[0]:
            # Skip if it's the same size
            continue
            
        test_embedding = np.random.random(size)
        print(f"\nTesting with embedding size: {size}")
        
        # Register a test face with this embedding
        face_with_test_embedding = face.copy()
        face_with_test_embedding['embedding'] = test_embedding
        
        test_name = f"Test_Size_{size}"
        result = add_face_to_database(test_name, "Test", face_with_test_embedding)
        if not result:
            print(f"Failed to add test face with embedding size {size}")
            continue
        
        # Now try to recognize using the original embedding
        print(f"Recognizing original embedding (size {embedding.shape[0]}) against database with {size}...")
        try:
            recognition = recognize_face(embedding)
            print(f"Recognition result: {recognition['name']} with similarity {recognition['similarity']:.4f}")
        except Exception as e:
            print(f"Error recognizing face with original embedding: {e}")
    
    print("\nTest completed.")
    return True

if __name__ == "__main__":
    # Run the test
    test_embedding_dimensions() 