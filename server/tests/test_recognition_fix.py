#!/usr/bin/env python3
"""
Test script to verify face recognition is working after standardizing embeddings
"""
import os
import sys
import cv2
import logging
import pickle
from mediapipe_face import (
    init_face_recognition,
    extract_faces_from_image,
    recognize_face,
    draw_faces
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def verify_database_embeddings():
    """Verify that embeddings in the database have consistent dimensions"""
    try:
        # Load the pickle database
        with open('mediapipe_face_db.pkl', 'rb') as f:
            db = pickle.load(f)
        
        print(f"Database contains {len(db)} faces:")
        for name, data in db.items():
            embeddings = data['embeddings']
            shapes = [e.shape for e in embeddings]
            print(f"- {name}: {len(embeddings)} embeddings with shapes {shapes}")
        
        return True
    except Exception as e:
        print(f"Error checking database: {e}")
        return False

def test_recognition(image_path, expected_name=None):
    """Test recognition on a single image"""
    print(f"\nTesting recognition on: {image_path}")
    
    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        return False
    
    # Load and display image info
    image = cv2.imread(image_path)
    if image is None:
        print(f"Could not load image: {image_path}")
        return False
    
    print(f"Image dimensions: {image.shape}")
    
    # Extract faces
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        print("No faces detected in the image")
        return False
    
    print(f"Detected {len(faces)} faces")
    
    # Process each face
    for i, face in enumerate(faces):
        bbox = face['bbox']
        embedding = face['embedding']
        
        print(f"Face {i+1}:")
        print(f"  - Bounding box: {bbox}")
        print(f"  - Embedding shape: {embedding.shape}")
        
        # Recognize face
        recognition = recognize_face(embedding)
        
        print(f"  - Recognition result:")
        print(f"    * Name: {recognition['name']}")
        print(f"    * Similarity: {recognition['similarity']:.4f}")
        print(f"    * Is known: {recognition['is_known']}")
        print(f"    * Role: {recognition['role']}")
        
        # If expected name is provided, verify the result
        if expected_name:
            if recognition['name'] == expected_name:
                print(f"  ✅ Correctly recognized as {expected_name}")
            else:
                print(f"  ❌ Expected {expected_name}, got {recognition['name']}")
        
        # Save result image with face box and name
        result_img = image.copy()
        x1, y1, x2, y2 = [int(v) for v in bbox]
        
        # Draw bounding box and name
        color = (0, 255, 0) if recognition['is_known'] else (0, 0, 255)  # Green for known, red for unknown
        cv2.rectangle(result_img, (x1, y1), (x2, y2), color, 2)
        
        # Add name and similarity
        text = f"{recognition['name']} ({recognition['similarity']:.2f})"
        cv2.putText(result_img, text, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        
        # Save the result
        result_path = os.path.join(os.path.dirname(image_path), f"recognized_{os.path.basename(image_path)}")
        cv2.imwrite(result_path, result_img)
        print(f"  - Saved recognition result to {result_path}")
    
    return True

def main():
    """Main function"""
    # Initialize face recognition
    print("Initializing face recognition system...")
    if not init_face_recognition():
        print("Failed to initialize face recognition")
        return
    
    # Verify database embeddings
    print("\nVerifying database embeddings...")
    verify_database_embeddings()
    
    # Test with a few images from different people
    test_images = [
        # Nafis
        ("face_images/temp/nafis/1750693254658-capture_Nafis_20250623_064054.jpg", "Nafis"),
        # Nafis v2
        ("face_images/temp/nafis_v2/1750696857489-face.jpg", "Nafis v2"),
        # Tareq
        ("face_images/temp/tareq/1750842435412-face.jpg", "Tareq"),
        # Unknown person (should not match)
        ("test_face.jpg", None)
    ]
    
    for image_path, expected_name in test_images:
        test_recognition(image_path, expected_name)

if __name__ == "__main__":
    main() 