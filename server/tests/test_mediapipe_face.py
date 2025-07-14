#!/usr/bin/env python3
"""
Test script for the MediaPipe face detection and recognition module.
"""
import os
import sys
import cv2
import json
import argparse
import logging
from mediapipe_face import (
    init_face_recognition,
    extract_faces_from_image,
    process_face_image,
    add_face_to_database,
    recognize_face,
    draw_faces
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_detection(image_path):
    """Test face detection on an image"""
    print(f"Testing face detection on {image_path}")
    
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: Could not load image {image_path}")
        return False
    
    # Extract faces
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        print("No faces detected!")
        return False
    
    print(f"Detected {len(faces)} faces")
    
    # Draw faces on image
    image_with_faces = image.copy()
    for i, face in enumerate(faces):
        x1, y1, x2, y2 = face['bbox']
        cv2.rectangle(image_with_faces, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(image_with_faces, f"Face {i+1}", (x1, y1-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    
    # Save result
    output_path = os.path.join(os.path.dirname(image_path), f"detected_{os.path.basename(image_path)}")
    cv2.imwrite(output_path, image_with_faces)
    print(f"Saved result to {output_path}")
    
    # Show result
    cv2.imshow("Detected Faces", image_with_faces)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    
    return True

def register_face(image_path, name, role="Unknown"):
    """Register a face in the database"""
    print(f"Registering face for {name} ({role}) from {image_path}")
    
    # Process face image
    result = process_face_image(image_path)
    
    if not result['success']:
        print(f"Error: {result['error']}")
        return False
    
    # Extract faces
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        print("No faces detected!")
        return False
    
    # Add to database
    access_areas = {
        'bedroom': role == 'Family',
        'living_room': role in ['Family', 'Friend'],
        'kitchen': role == 'Family',
        'front_door': role in ['Family', 'Friend', 'Service']
    }
    
    success = add_face_to_database(name, role, faces, access_areas)
    
    if success:
        print(f"Successfully registered {name} ({role}) with {len(faces)} face samples")
    else:
        print("Failed to register face")
    
    return success

def test_recognition(image_path):
    """Test recognition on an image"""
    print(f"Testing face recognition on {image_path}")
    
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: Could not load image {image_path}")
        return False
    
    # Extract faces
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        print("No faces detected!")
        return False
    
    # Recognize each face
    for i, face in enumerate(faces):
        recognition = recognize_face(face['embedding'])
        face['recognition'] = recognition
        
        print(f"Face {i+1}: {recognition['name']} (Confidence: {recognition['similarity']:.4f})")
        if recognition['name'] != "Unknown":
            print(f"  Role: {recognition['role']}")
            print(f"  Access areas: {recognition['access']}")
    
    # Draw recognition results
    image_with_faces = draw_faces(image, faces)
    
    # Save result
    output_path = os.path.join(os.path.dirname(image_path), f"recognized_{os.path.basename(image_path)}")
    cv2.imwrite(output_path, image_with_faces)
    print(f"Saved result to {output_path}")
    
    # Show result
    cv2.imshow("Face Recognition", image_with_faces)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Test MediaPipe face detection and recognition')
    parser.add_argument('--detect', type=str, help='Test detection on an image')
    parser.add_argument('--register', type=str, help='Register a face from an image')
    parser.add_argument('--name', type=str, help='Name for face registration')
    parser.add_argument('--role', type=str, default='Unknown', help='Role for face registration')
    parser.add_argument('--recognize', type=str, help='Test recognition on an image')
    
    args = parser.parse_args()
    
    # Initialize the system
    if not init_face_recognition():
        print("Error initializing face recognition system")
        sys.exit(1)
    
    if args.detect:
        test_detection(args.detect)
    elif args.register and args.name:
        register_face(args.register, args.name, args.role)
    elif args.recognize:
        test_recognition(args.recognize)
    else:
        parser.print_help() 