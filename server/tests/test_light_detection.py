#!/usr/bin/env python3
"""
Test script for light detection functionality
"""

import cv2
import sys
import os
from datetime import datetime
import logging

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from light_detection import LightDetector, create_light_detector_config, detect_light_state_simple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_light_detection_on_video(video_path, camera_role='test_room'):
    """Test light detection on a video file"""
    
    print(f"\n🔍 Testing Light Detection on Video: {video_path}")
    print("=" * 60)
    
    # Create light detector with configuration for the camera role
    config = create_light_detector_config(camera_role)
    light_detector = LightDetector(config)
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file: {video_path}")
        return
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"📹 Video Info:")
    print(f"   - FPS: {fps}")
    print(f"   - Total Frames: {frame_count}")
    print(f"   - Duration: {frame_count/fps:.1f} seconds")
    print(f"   - Camera Role: {camera_role}")
    print()
    
    frame_number = 0
    lighting_events = []
    
    # Process frames (sample every 30 frames for speed)
    sample_interval = 30
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Only process every Nth frame for speed
        if frame_number % sample_interval == 0:
            timestamp = datetime.now()
            
            # Analyze frame for lighting
            results = light_detector.analyze_frame(frame, timestamp)
            
            # Check for state changes
            if results.get('state_changed', False):
                event = {
                    'frame': frame_number,
                    'time': frame_number / fps,
                    'previous_state': results.get('previous_state'),
                    'new_state': results.get('lighting_state'),
                    'confidence': results.get('state_confidence', 0.0),
                    'brightness': results['metrics'].get('mean_brightness', 0)
                }
                lighting_events.append(event)
                
                # Print event
                time_str = f"{int(event['time']/60):02d}:{int(event['time']%60):02d}"
                print(f"💡 Frame {frame_number:5d} ({time_str}): "
                      f"Lights {event['previous_state']} → {event['new_state']} "
                      f"(confidence: {event['confidence']:.2f}, "
                      f"brightness: {event['brightness']:.1f})")
        
        frame_number += 1
        
        # Progress indicator
        if frame_number % (sample_interval * 10) == 0:
            progress = frame_number / frame_count * 100
            print(f"📊 Progress: {progress:.1f}% (frame {frame_number}/{frame_count})")
    
    cap.release()
    
    # Summary
    print("\n📋 Detection Summary:")
    print(f"   - Total lighting events detected: {len(lighting_events)}")
    print(f"   - Final lighting state: {light_detector.current_state}")
    
    if lighting_events:
        print("\n🗂️  All Lighting Events:")
        for i, event in enumerate(lighting_events, 1):
            time_str = f"{int(event['time']/60):02d}:{int(event['time']%60):02d}"
            print(f"   {i:2d}. {time_str} - {event['previous_state']} → {event['new_state']} "
                  f"(conf: {event['confidence']:.2f})")
    
    return lighting_events

def test_light_detection_on_image(image_path):
    """Test simple light detection on a single image"""
    
    print(f"\n🖼️  Testing Light Detection on Image: {image_path}")
    print("=" * 60)
    
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"❌ Error: Could not load image: {image_path}")
        return
    
    # Simple detection
    state, brightness = detect_light_state_simple(image)
    print(f"🔍 Simple Detection Result:")
    print(f"   - Lighting State: {state}")
    print(f"   - Brightness Level: {brightness:.1f}")
    
    # Advanced detection
    config = create_light_detector_config()
    detector = LightDetector(config)
    results = detector.analyze_frame(image)
    
    print(f"\n🔬 Advanced Detection Result:")
    print(f"   - Lighting State: {results.get('lighting_state', 'unknown')}")
    print(f"   - Confidence: {results.get('state_confidence', 0.0):.2f}")
    print(f"   - Mean Brightness: {results['metrics'].get('mean_brightness', 0):.1f}")
    print(f"   - Median Brightness: {results['metrics'].get('median_brightness', 0):.1f}")
    print(f"   - Bright Pixel Ratio: {results['metrics'].get('bright_pixel_ratio', 0):.3f}")
    
    # Histogram metrics
    if 'histogram_metrics' in results['metrics']:
        hist_metrics = results['metrics']['histogram_metrics']
        print(f"   - Histogram Brightness: {hist_metrics.get('weighted_brightness', 0):.1f}")
        print(f"   - Dark Pixel Ratio: {hist_metrics.get('dark_pixel_ratio', 0):.3f}")
        print(f"   - Mid Pixel Ratio: {hist_metrics.get('mid_pixel_ratio', 0):.3f}")
        print(f"   - Bright Pixel Ratio: {hist_metrics.get('bright_pixel_ratio', 0):.3f}")

def main():
    """Main test function"""
    print("🚀 Light Detection Test Suite")
    print("=" * 60)
    
    # Test on video files if available
    video_files = [
        'test_video.mp4',
        'test_video_nafis.mp4'
    ]
    
    for video_file in video_files:
        if os.path.exists(video_file):
            print(f"\n✅ Found video: {video_file}")
            test_light_detection_on_video(video_file)
            break
    else:
        print("❌ No test video files found")
    
    # Test on image files if available
    image_files = [
        'test_face.jpg',
        'test_face_detected.jpg',
        'debug_test_face.jpg'
    ]
    
    for image_file in image_files:
        if os.path.exists(image_file):
            print(f"\n✅ Found image: {image_file}")
            test_light_detection_on_image(image_file)
            break
    else:
        print("❌ No test image files found")
    
    print("\n✨ Test complete!")

if __name__ == "__main__":
    main() 