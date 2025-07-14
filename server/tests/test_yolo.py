#!/usr/bin/env python3
"""
Test script to verify YOLOv11x model works correctly
"""

import os
import sys
import cv2
import numpy as np
import time
import requests
from io import BytesIO

def test_yolo_model():
    """Test if YOLOv11x model can be loaded and run"""
    print("Testing YOLOv11x model...")
    
    # Check if model file exists
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yolo11x.pt')
    if not os.path.exists(model_path):
        print(f"ERROR: Model file not found at {model_path}")
        return False
    
    print(f"Found model file: {model_path}")
    
    # Try to import ultralytics
    try:
        from ultralytics import YOLO
        print("Successfully imported ultralytics")
    except ImportError:
        print("ERROR: Failed to import ultralytics. Make sure it's installed with: pip install ultralytics")
        return False
    
    # Try to load model
    try:
        model = YOLO(model_path)
        print("Successfully loaded YOLOv11x model")
    except Exception as e:
        print(f"ERROR: Failed to load model: {e}")
        return False
    
    # Create or download a test image
    test_img_path = "test_yolo.jpg"
    
    try:
        # Try to download a sample image with people
        print("Downloading a sample image...")
        sample_url = "https://raw.githubusercontent.com/ultralytics/yolov5/master/data/images/zidane.jpg"
        response = requests.get(sample_url)
        
        if response.status_code == 200:
            with open(test_img_path, "wb") as f:
                f.write(response.content)
            print(f"Downloaded sample image to {test_img_path}")
        else:
            # If download fails, create a simple test image
            print("Failed to download sample image, creating a test image...")
            img_size = 640
            img = np.zeros((img_size, img_size, 3), dtype=np.uint8)
            
            # Draw a person-like shape (more realistic)
            # Body
            cv2.rectangle(img, (img_size//3, img_size//3), (2*img_size//3, 3*img_size//4), (200, 200, 200), -1)
            # Head
            cv2.circle(img, (img_size//2, img_size//4), img_size//8, (200, 200, 200), -1)
            # Eyes
            cv2.circle(img, (img_size//2 - 15, img_size//4 - 10), 5, (0, 0, 0), -1)
            cv2.circle(img, (img_size//2 + 15, img_size//4 - 10), 5, (0, 0, 0), -1)
            # Mouth
            cv2.ellipse(img, (img_size//2, img_size//4 + 10), (20, 10), 0, 0, 180, (0, 0, 0), 2)
            
            cv2.imwrite(test_img_path, img)
            print(f"Created test image: {test_img_path}")
    except Exception as e:
        print(f"Error creating test image: {e}")
        return False
    
    # Run inference
    try:
        print("Running inference...")
        start_time = time.time()
        results = model(test_img_path)
        inference_time = time.time() - start_time
        print(f"Inference completed in {inference_time:.2f} seconds")
        
        # Get the original image for visualization
        img = cv2.imread(test_img_path)
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                
                detections.append({
                    'class': class_name,
                    'confidence': confidence,
                    'box': (x1, y1, x2, y2)
                })
                
                # Draw on image
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(img, f"{class_name} {confidence:.2f}", (x1, y1-10), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # Save result image
        cv2.imwrite("test_yolo_result.jpg", img)
        
        print(f"Found {len(detections)} objects:")
        for i, det in enumerate(detections):
            print(f"  {i+1}. {det['class']} ({det['confidence']:.2f})")
        
        return len(detections) > 0
    except Exception as e:
        print(f"ERROR: Inference failed: {e}")
        return False

def test_video_processor_integration():
    """Test if video_processor.py can use the model"""
    print("\nTesting integration with video_processor.py...")
    
    try:
        # Import the video_processor module
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        import video_processor
        
        # Initialize face detection
        result = video_processor.init_face_detection()
        
        if result:
            print("Successfully initialized face detection in video_processor.py")
            if hasattr(video_processor, 'model'):
                model_type = type(video_processor.model).__name__
                print(f"Model loaded in video_processor: {model_type}")
                return True
            else:
                print("WARNING: No model loaded in video_processor")
                return False
        else:
            print("ERROR: Failed to initialize face detection in video_processor.py")
            return False
    except Exception as e:
        print(f"ERROR: Failed to test video_processor integration: {e}")
        return False

if __name__ == "__main__":
    print("YOLOv11x Model Test Script")
    print("=========================")
    
    # Test YOLO model
    yolo_result = test_yolo_model()
    
    # Test video processor integration
    integration_result = test_video_processor_integration()
    
    # Print summary
    print("\nTest Results Summary:")
    print(f"YOLOv11x Model: {'PASS' if yolo_result else 'FAIL'}")
    print(f"Video Processor Integration: {'PASS' if integration_result else 'FAIL'}")
    
    if yolo_result and integration_result:
        print("\nAll tests passed! Your system is ready to use YOLOv11x for object detection.")
        sys.exit(0)
    elif yolo_result:
        print("\nYOLO model works but integration with video_processor.py failed.")
        print("Check the video_processor.py file for issues.")
        sys.exit(1)
    else:
        print("\nYOLO model test failed. Please check the error messages above.")
        sys.exit(1) 