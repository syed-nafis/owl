#!/usr/bin/env python3
"""
Test script to verify face detection is working
"""

import cv2
import os
import sys
import numpy as np

def test_opencv_detection():
    """Test basic OpenCV face detection"""
    print("Testing OpenCV face detection...")
    
    # Create a test image with a face (simple circle)
    img_size = 300
    img = np.zeros((img_size, img_size, 3), dtype=np.uint8)
    
    # Draw a face-like circle
    cv2.circle(img, (img_size//2, img_size//2), img_size//3, (200, 200, 200), -1)
    cv2.circle(img, (img_size//2 - 30, img_size//2 - 30), 10, (0, 0, 0), -1)  # Left eye
    cv2.circle(img, (img_size//2 + 30, img_size//2 - 30), 10, (0, 0, 0), -1)  # Right eye
    cv2.ellipse(img, (img_size//2, img_size//2 + 20), (40, 20), 0, 0, 180, (0, 0, 0), 2)  # Smile
    
    # Save the test image
    test_img_path = "test_face.jpg"
    cv2.imwrite(test_img_path, img)
    print(f"Created test image: {test_img_path}")
    
    # Try to load face cascade
    try:
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        print("Successfully loaded face cascade")
    except Exception as e:
        print(f"Error loading face cascade: {e}")
        return False
    
    # Try to detect faces in our test image
    try:
        # Load the image
        img = cv2.imread(test_img_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        print(f"Detected {len(faces)} faces in test image")
        
        # Draw rectangles around faces
        for (x, y, w, h) in faces:
            cv2.rectangle(img, (x, y), (x+w, y+h), (255, 0, 0), 2)
        
        # Save the result
        cv2.imwrite("test_face_detected.jpg", img)
        print("Saved detection result to test_face_detected.jpg")
        
        return len(faces) > 0
    except Exception as e:
        print(f"Error in face detection: {e}")
        return False

def test_extract_face():
    """Test the extract_face.py script"""
    print("\nTesting extract_face.py...")
    
    try:
        # Try to import the extract_face module
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        import extract_face
        
        # Use the test image
        test_img_path = "test_face.jpg"
        if not os.path.exists(test_img_path):
            print(f"Test image not found: {test_img_path}")
            return False
        
        # Extract face encoding
        encoding = extract_face.extract_face_encoding(test_img_path)
        
        if encoding:
            print("Successfully extracted face encoding")
            return True
        else:
            print("Failed to extract face encoding")
            return False
    except Exception as e:
        print(f"Error testing extract_face.py: {e}")
        return False

def test_opencv_face_module():
    """Test the opencv_face module"""
    print("\nTesting opencv_face module...")
    
    try:
        # Try to import the opencv_face module
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        import opencv_face
        
        # Use the test image
        test_img_path = "test_face.jpg"
        if not os.path.exists(test_img_path):
            print(f"Test image not found: {test_img_path}")
            return False
        
        # Extract face encoding
        encoding = opencv_face.extract_face_encoding_from_file(test_img_path)
        
        if encoding is not None:
            print("Successfully extracted face encoding using opencv_face")
            print(f"Face recognition available: {opencv_face.HAS_FACE_RECOGNITION}")
            return True
        else:
            print("Failed to extract face encoding using opencv_face")
            return False
    except Exception as e:
        print(f"Error testing opencv_face module: {e}")
        return False

if __name__ == "__main__":
    print("Face Detection Test Script")
    print("=========================")
    
    # Test OpenCV detection
    opencv_result = test_opencv_detection()
    
    # Test extract_face.py
    extract_face_result = test_extract_face()
    
    # Test opencv_face module
    opencv_face_result = test_opencv_face_module()
    
    # Print summary
    print("\nTest Results Summary:")
    print(f"OpenCV Detection: {'PASS' if opencv_result else 'FAIL'}")
    print(f"extract_face.py: {'PASS' if extract_face_result else 'FAIL'}")
    print(f"opencv_face module: {'PASS' if opencv_face_result else 'FAIL'}")
    
    if opencv_result or extract_face_result or opencv_face_result:
        print("\nAt least one face detection method is working!")
        print("Your system is ready to use face detection.")
        sys.exit(0)
    else:
        print("\nAll face detection methods failed.")
        print("Please check the error messages above and fix the issues.")
        sys.exit(1) 