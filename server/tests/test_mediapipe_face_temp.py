#!/usr/bin/env python3
"""
Test script for the MediaPipe face detection and recognition module.
This script tests face detection on images from face_images/temp directory,
where folder names represent person names.
"""
import os
import sys
import cv2
import glob
import json
import logging
import numpy as np
from mediapipe_face import (
    init_face_recognition,
    extract_faces_from_image,
    recognize_face,
    draw_faces
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_bbox_coordinates(bbox):
    """Helper function to handle different bbox formats"""
    if isinstance(bbox, (tuple, list)) and len(bbox) == 4:
        return bbox  # Already in (x1, y1, x2, y2) format
    elif isinstance(bbox, np.ndarray) and len(bbox) == 4:
        return tuple(bbox)  # Convert numpy array to tuple
    else:
        # Try to extract coordinates from other formats
        try:
            if hasattr(bbox, "__getitem__"):
                if len(bbox) >= 4:
                    return (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
        except Exception as e:
            logger.error(f"Error processing bbox: {e}")
    
    # If we can't determine the format, return None
    return None

def test_face_detection_in_directory(directory_path, person_name):
    """Test face detection on all images in a directory"""
    print(f"Testing face detection for {person_name} in {directory_path}")
    
    # Get all jpg files in the directory
    image_files = glob.glob(os.path.join(directory_path, "*.jpg"))
    
    if not image_files:
        print(f"No jpg images found in {directory_path}")
        return False
    
    print(f"Found {len(image_files)} images")
    
    success_count = 0
    failure_count = 0
    
    # Process each image
    for image_path in image_files:
        print(f"\nProcessing {os.path.basename(image_path)}")
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            print(f"Error: Could not load image {image_path}")
            failure_count += 1
            continue
        
        # Extract faces
        faces = extract_faces_from_image(image_path)
        
        if not faces:
            print("No faces detected!")
            failure_count += 1
            continue
        
        print(f"Detected {len(faces)} faces")
        success_count += 1
        
        # Draw faces on image
        image_with_faces = image.copy()
        for i, face in enumerate(faces):
            # Get bbox coordinates using helper function
            bbox_coords = get_bbox_coordinates(face['bbox'])
            if bbox_coords is None:
                print(f"Warning: Invalid bbox format for face {i+1}")
                continue
                
            x1, y1, x2, y2 = bbox_coords
            cv2.rectangle(image_with_faces, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
            cv2.putText(image_with_faces, f"{person_name}", (int(x1), int(y1)-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        # Save result
        output_path = os.path.join(os.path.dirname(image_path), f"detected_{os.path.basename(image_path)}")
        cv2.imwrite(output_path, image_with_faces)
        print(f"Saved result to {output_path}")
        
    print(f"\nResults for {person_name}:")
    print(f"- Successfully detected faces in {success_count}/{len(image_files)} images")
    print(f"- Failed to detect faces in {failure_count}/{len(image_files)} images")
    
    return success_count > 0

def test_face_recognition_in_directory(directory_path, person_name):
    """Test face recognition on all images in a directory"""
    print(f"\nTesting face recognition for {person_name} in {directory_path}")
    
    # Get all jpg files in the directory
    image_files = glob.glob(os.path.join(directory_path, "*.jpg"))
    
    if not image_files:
        print(f"No jpg images found in {directory_path}")
        return False
    
    print(f"Found {len(image_files)} images")
    
    success_count = 0
    failure_count = 0
    
    # Process each image
    for image_path in image_files:
        print(f"\nProcessing {os.path.basename(image_path)}")
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            print(f"Error: Could not load image {image_path}")
            failure_count += 1
            continue
        
        # Extract faces
        faces = extract_faces_from_image(image_path)
        
        if not faces:
            print("No faces detected!")
            failure_count += 1
            continue
        
        # Try to recognize each face
        recognition_results = []
        for face in faces:
            embedding = face.get('embedding')
            if embedding is not None:
                # Call recognize_face which returns a dictionary
                recognition = recognize_face(embedding)
                name = recognition.get('name', 'Unknown')
                similarity = recognition.get('similarity', 0.0)
                
                recognition_results.append({
                    'name': name,
                    'similarity': similarity,
                    'data': recognition
                })
                print(f"Recognized as: {name} (similarity: {similarity:.4f})")
                
                # Draw faces on image
                image_with_faces = image.copy()
                # Get bbox coordinates using helper function
                bbox_coords = get_bbox_coordinates(face['bbox'])
                if bbox_coords is None:
                    print(f"Warning: Invalid bbox format for face")
                    continue
                    
                x1, y1, x2, y2 = bbox_coords
                color = (0, 255, 0) if name == person_name else (0, 0, 255)
                cv2.rectangle(image_with_faces, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                cv2.putText(image_with_faces, f"{name} ({similarity:.2f})", (int(x1), int(y1)-10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
                
                # Save result
                output_path = os.path.join(os.path.dirname(image_path), f"recognized_{os.path.basename(image_path)}")
                cv2.imwrite(output_path, image_with_faces)
                print(f"Saved recognition result to {output_path}")
                
                if name == person_name:
                    success_count += 1
                else:
                    failure_count += 1
            else:
                print("No embedding found for face!")
                failure_count += 1
        
    if success_count + failure_count > 0:
        print(f"\nRecognition Results for {person_name}:")
        print(f"- Correctly recognized as {person_name}: {success_count}/{success_count + failure_count} ({success_count/(success_count + failure_count)*100:.1f}%)")
    else:
        print(f"\nNo recognition results for {person_name}")
    
    return success_count > 0

def main():
    # Initialize face recognition
    print("Initializing face recognition...")
    if not init_face_recognition():
        print("Failed to initialize face recognition!")
        return
    
    # Get temp directory path
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_images', 'temp')
    if not os.path.exists(temp_dir):
        print(f"Temp directory not found: {temp_dir}")
        return
    
    # Get all person directories
    person_dirs = [d for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d))]
    
    if not person_dirs:
        print(f"No person directories found in {temp_dir}")
        return
    
    print(f"Found {len(person_dirs)} person directories: {', '.join(person_dirs)}")
    
    # Test each person directory
    for person_dir in person_dirs:
        person_name = person_dir  # Directory name is the person name
        person_path = os.path.join(temp_dir, person_dir)
        
        # Test face detection
        test_face_detection_in_directory(person_path, person_name)
        
        # Test face recognition
        test_face_recognition_in_directory(person_path, person_name)

if __name__ == "__main__":
    main() 