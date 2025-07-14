#!/usr/bin/env python3
"""
Test script for the enhanced face recognition pipeline with dedicated alignment step.
This script tests each component of the face recognition pipeline:
1. Detection
2. Alignment
3. Embedding extraction
4. Face matching
"""

import os
import cv2
import numpy as np
import logging
import json
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import our face recognition module
try:
    from mediapipe_face import (
        init_face_recognition, 
        detect_faces, 
        align_face,
        extract_faces_from_image,
        recognize_face,
        process_face_image
    )
except ImportError:
    logger.error("Failed to import mediapipe_face module. Make sure it's in the same directory.")
    exit(1)

def test_detection(image_path: str) -> bool:
    """Test face detection functionality"""
    logger.info(f"Testing face detection on: {image_path}")
    
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Failed to load image: {image_path}")
            return False
            
        # Detect faces
        faces = detect_faces(image)
        
        # Log results
        logger.info(f"Detected {len(faces)} faces")
        for i, face in enumerate(faces):
            bbox = face['bbox']
            logger.info(f"Face {i+1}: bbox={bbox}, confidence={face['confidence']:.4f}")
            
        # Draw bounding boxes on image
        result_image = image.copy()
        for face in faces:
            bbox = face['bbox']
            x1, y1, x2, y2 = bbox
            cv2.rectangle(result_image, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
        # Save result
        output_path = os.path.join(os.path.dirname(image_path), f"detection_result_{os.path.basename(image_path)}")
        cv2.imwrite(output_path, result_image)
        logger.info(f"Saved detection result to {output_path}")
        
        return len(faces) > 0
    except Exception as e:
        logger.error(f"Error in detection test: {e}")
        return False

def test_alignment(image_path: str) -> bool:
    """Test face alignment functionality"""
    logger.info(f"Testing face alignment on: {image_path}")
    
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Failed to load image: {image_path}")
            return False
            
        # Detect faces
        faces = detect_faces(image)
        if not faces:
            logger.error(f"No faces detected in {image_path}")
            return False
            
        # Get the first face
        face = faces[0]
        bbox = face['bbox']
        
        # Create visualization
        result_image = np.hstack([
            cv2.resize(face['face_image'], (224, 224)),  # Original face crop
            cv2.resize(face['aligned_face'], (224, 224))  # Aligned face
        ])
        
        # Save comparison image
        output_path = os.path.join(os.path.dirname(image_path), f"alignment_comparison_{os.path.basename(image_path)}")
        cv2.imwrite(output_path, result_image)
        logger.info(f"Saved alignment comparison to {output_path}")
        
        # Add text labels
        h, w = result_image.shape[:2]
        cv2.putText(result_image, "Original", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.putText(result_image, "Aligned", (w//2 + 20, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # Save labeled comparison
        output_path = os.path.join(os.path.dirname(image_path), f"alignment_labeled_{os.path.basename(image_path)}")
        cv2.imwrite(output_path, result_image)
        
        return True
    except Exception as e:
        logger.error(f"Error in alignment test: {e}")
        return False

def test_recognition(image_path: str, enrolled: bool = False) -> bool:
    """Test the full recognition pipeline"""
    logger.info(f"Testing full recognition pipeline on: {image_path}")
    
    try:
        # Process the image
        result = process_face_image(image_path)
        
        if not result['success']:
            logger.error(f"Failed to process image: {result.get('error', 'Unknown error')}")
            return False
            
        # Get recognition results
        recognition = result['recognition']
        name = recognition.get('name', 'Unknown')
        similarity = recognition.get('similarity', 0.0)
        role = recognition.get('role', '')
        
        logger.info(f"Recognition result: {name} (similarity: {similarity:.4f})")
        logger.info(f"Role: {role}")
        
        # Load the image and draw the result
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Failed to load image: {image_path}")
            return False
            
        # Draw bounding box
        box = result['box']
        cv2.rectangle(image, (box['x1'], box['y1']), (box['x2'], box['y2']), (0, 255, 0), 2)
        
        # Draw name and similarity
        cv2.putText(image, f"{name} ({similarity:.2f})", 
                    (box['x1'], box['y1'] - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Save result
        output_path = os.path.join(os.path.dirname(image_path), f"recognition_result_{os.path.basename(image_path)}")
        cv2.imwrite(output_path, image)
        logger.info(f"Saved recognition result to {output_path}")
        
        # Check if face was recognized as expected
        if enrolled:
            expected_status = name != "Unknown" and similarity > 0.5
        else:
            expected_status = True  # Just check if it runs without errors
            
        return expected_status
    except Exception as e:
        logger.error(f"Error in recognition test: {e}")
        return False

def run_full_test(test_image: str) -> None:
    """Run the complete test suite"""
    logger.info("Starting enhanced face recognition pipeline test")
    
    # Initialize face recognition
    if not init_face_recognition():
        logger.error("Failed to initialize face recognition")
        return
        
    # Make sure test image exists
    if not os.path.exists(test_image):
        logger.error(f"Test image not found: {test_image}")
        return
        
    # Run tests
    detection_result = test_detection(test_image)
    logger.info(f"Detection test: {'PASSED' if detection_result else 'FAILED'}")
    
    alignment_result = test_alignment(test_image)
    logger.info(f"Alignment test: {'PASSED' if alignment_result else 'FAILED'}")
    
    recognition_result = test_recognition(test_image)
    logger.info(f"Recognition test: {'PASSED' if recognition_result else 'FAILED'}")
    
    # Overall result
    if detection_result and alignment_result and recognition_result:
        logger.info("All tests PASSED!")
    else:
        logger.error("Some tests FAILED!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test the enhanced face recognition pipeline")
    parser.add_argument("--image", "-i", type=str, default="test_face.jpg", 
                        help="Path to test image (default: test_face.jpg)")
    args = parser.parse_args()
    
    run_full_test(args.image) 