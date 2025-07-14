#!/usr/bin/env python3
"""
Advanced Light Detection Test Script
Tests light detection on videos with frame saving and adjustable thresholds
"""

import cv2
import sys
import os
import argparse
import json
from datetime import datetime
import logging
import numpy as np

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from light_detection import LightDetector, create_light_detector_config, detect_light_state_simple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_output_directory(base_name="light_test_results"):
    """Create output directory for saving frames and results"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = f"{base_name}_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    return output_dir

def save_frame_with_info(frame, frame_number, timestamp, lighting_info, output_dir, video_name):
    """Save frame with lighting information overlay"""
    # Create a copy of the frame to add text
    display_frame = frame.copy()
    
    # Add lighting information overlay
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2
    
    # Background color based on lighting state
    lighting_state = lighting_info.get('lighting_state') or 'unknown'
    if lighting_state == 'on':
        bg_color = (0, 255, 0)  # Green for lights on
        text_color = (0, 0, 0)  # Black text
    elif lighting_state == 'off':
        bg_color = (0, 0, 255)  # Red for lights off
        text_color = (255, 255, 255)  # White text
    else:
        bg_color = (128, 128, 128)  # Gray for unknown
        text_color = (255, 255, 255)  # White text
    
    # Create info text
    info_lines = [
        f"Frame: {frame_number}",
        f"Time: {timestamp}",
        f"State: {lighting_state}",
        f"Confidence: {lighting_info.get('state_confidence', 0):.2f}",
        f"Brightness: {lighting_info['metrics'].get('mean_brightness', 0):.1f}",
        f"Change: {lighting_info.get('previous_state') or 'N/A'} -> {lighting_state}"
    ]
    
    # Add background rectangle and text
    y_offset = 30
    for i, line in enumerate(info_lines):
        y_pos = y_offset + (i * 25)
        # Get text size for background rectangle
        (text_width, text_height), _ = cv2.getTextSize(line, font, font_scale, thickness)
        
        # Draw background rectangle
        cv2.rectangle(display_frame, (10, y_pos - text_height - 5), 
                     (10 + text_width + 10, y_pos + 5), bg_color, -1)
        
        # Draw text
        cv2.putText(display_frame, line, (15, y_pos), font, font_scale, text_color, thickness)
    
    # Save the frame
    filename = f"{video_name}_frame_{frame_number:06d}_{lighting_state}.jpg"
    filepath = os.path.join(output_dir, filename)
    cv2.imwrite(filepath, display_frame)
    
    return filepath

def test_light_detection_advanced(video_path, camera_role='test_room', 
                                brightness_low=50, brightness_high=120, 
                                hysteresis=15, save_all_changes=True,
                                frame_interval=1, output_dir=None):
    """
    Advanced light detection test with customizable parameters
    
    Args:
        video_path: Path to video file
        camera_role: Camera role for configuration
        brightness_low: Low brightness threshold
        brightness_high: High brightness threshold  
        hysteresis: Hysteresis value to prevent flickering
        save_all_changes: Save frames for all state changes
        frame_interval: Process every Nth frame
        output_dir: Directory to save results
    """
    
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    print(f"\n🔍 Advanced Light Detection Test")
    print("=" * 80)
    print(f"📹 Video: {video_name}")
    print(f"🎛️  Settings:")
    print(f"   - Brightness Low Threshold: {brightness_low}")
    print(f"   - Brightness High Threshold: {brightness_high}")
    print(f"   - Hysteresis: {hysteresis}")
    print(f"   - Camera Role: {camera_role}")
    print(f"   - Frame Interval: {frame_interval}")
    print("=" * 80)
    
    # Create custom configuration
    config = create_light_detector_config()
    config.update({
        'brightness_threshold_low': brightness_low,
        'brightness_threshold_high': brightness_high,
        'brightness_hysteresis': hysteresis,
        'stability_frames': 2,  # Faster response for testing
    })
    
    light_detector = LightDetector(config)
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file: {video_path}")
        return None
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps
    
    print(f"📊 Video Info:")
    print(f"   - FPS: {fps:.2f}")
    print(f"   - Total Frames: {frame_count}")
    print(f"   - Duration: {duration:.1f} seconds")
    print()
    
    # Initialize tracking variables
    frame_number = 0
    lighting_events = []
    saved_frames = []
    current_brightness_history = []
    
    # Create results file
    results_file = os.path.join(output_dir, f"{video_name}_analysis.json") if output_dir else f"{video_name}_analysis.json"
    
    print("🎬 Starting Analysis...")
    print("State | Frame  | Time   | Brightness | Confidence | Change")
    print("-" * 65)
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Process every Nth frame
        if frame_number % frame_interval == 0:
            timestamp = datetime.now()
            time_in_video = frame_number / fps
            time_str = f"{int(time_in_video/60):02d}:{int(time_in_video%60):02d}"
            
            # Get simple brightness for continuous monitoring
            simple_state, brightness = detect_light_state_simple(frame, (brightness_low + brightness_high) / 2)
            current_brightness_history.append(brightness)
            
            # Analyze frame with advanced detection
            results = light_detector.analyze_frame(frame, timestamp)
            
            # Print current status
            lighting_state = results.get('lighting_state') or 'unknown'
            state_confidence = results.get('state_confidence') or 0.0
            
            state_emoji = "💡" if lighting_state == 'on' else "🌙" if lighting_state == 'off' else "❓"
            print(f"{state_emoji} {lighting_state:4s} | {frame_number:6d} | {time_str} | {brightness:8.1f} | {state_confidence:8.2f} | ", end="")
            
            # Check for state changes
            if results.get('state_changed', False):
                new_state = results.get('lighting_state') or 'unknown'
                previous_state = results.get('previous_state') or 'unknown'
                confidence = results.get('state_confidence') or 0.0
                
                print(f"{previous_state} -> {new_state}")
                
                # Record event
                event = {
                    'frame': frame_number,
                    'time_seconds': time_in_video,
                    'time_formatted': time_str,
                    'previous_state': previous_state,
                    'new_state': new_state,
                    'confidence': confidence,
                    'brightness': brightness,
                    'timestamp': timestamp.isoformat()
                }
                lighting_events.append(event)
                
                # Save frame if requested
                if save_all_changes and output_dir:
                    saved_frame_path = save_frame_with_info(
                        frame, frame_number, time_str, results, output_dir, video_name
                    )
                    saved_frames.append(saved_frame_path)
                    print(f"   💾 Saved frame: {os.path.basename(saved_frame_path)}")
            else:
                print("no change")
        
        frame_number += 1
        
        # Progress indicator every 10 seconds
        if frame_number % (int(fps * 10)) == 0:
            progress = frame_number / frame_count * 100
            print(f"📈 Progress: {progress:.1f}% ({frame_number}/{frame_count} frames)")
    
    cap.release()
    
    # Calculate statistics
    avg_brightness = np.mean(current_brightness_history) if current_brightness_history else 0
    brightness_std = np.std(current_brightness_history) if current_brightness_history else 0
    
    # Summary
    print("\n" + "=" * 80)
    print("📋 ANALYSIS SUMMARY")
    print("=" * 80)
    print(f"🎯 Detection Results:")
    print(f"   - Total lighting events detected: {len(lighting_events)}")
    print(f"   - Final lighting state: {light_detector.current_state or 'unknown'}")
    print(f"   - Frames analyzed: {light_detector.detection_stats['total_frames_analyzed']}")
    print(f"   - Average brightness: {avg_brightness:.1f} ± {brightness_std:.1f}")
    
    if saved_frames:
        print(f"💾 Saved Frames: {len(saved_frames)}")
        for frame_path in saved_frames:
            print(f"   - {os.path.basename(frame_path)}")
    
    if lighting_events:
        print(f"\n🗂️  Lighting Events Timeline:")
        for i, event in enumerate(lighting_events, 1):
            print(f"   {i:2d}. {event['time_formatted']} - {event['previous_state']} → {event['new_state']} "
                  f"(confidence: {event['confidence']:.2f}, brightness: {event['brightness']:.1f})")
    
    # Save detailed results to JSON
    detailed_results = {
        'video_info': {
            'name': video_name,
            'path': video_path,
            'fps': fps,
            'frame_count': frame_count,
            'duration_seconds': duration
        },
        'detection_config': config,
        'lighting_events': lighting_events,
        'statistics': {
            'total_events': len(lighting_events),
            'final_state': light_detector.current_state,
            'avg_brightness': float(avg_brightness),
            'brightness_std': float(brightness_std),
            'frames_analyzed': light_detector.detection_stats['total_frames_analyzed']
        },
        'saved_frames': saved_frames
    }
    
    if output_dir:
        with open(results_file, 'w') as f:
            json.dump(detailed_results, f, indent=2, default=str)
        print(f"\n💾 Detailed results saved to: {results_file}")
    
    return detailed_results

def main():
    """Main function with command line interface"""
    parser = argparse.ArgumentParser(description="Advanced Light Detection Testing")
    parser.add_argument("--video", type=str, help="Specific video file to test")
    parser.add_argument("--brightness-low", type=int, default=50, help="Low brightness threshold (default: 50)")
    parser.add_argument("--brightness-high", type=int, default=120, help="High brightness threshold (default: 120)")
    parser.add_argument("--hysteresis", type=int, default=15, help="Hysteresis value (default: 15)")
    parser.add_argument("--camera-role", type=str, default="test_room", help="Camera role (default: test_room)")
    parser.add_argument("--frame-interval", type=int, default=1, help="Process every Nth frame (default: 1)")
    parser.add_argument("--no-save", action="store_true", help="Don't save frames on state changes")
    parser.add_argument("--output-dir", type=str, help="Custom output directory")
    
    args = parser.parse_args()
    
    print("🚀 Advanced Light Detection Test Suite")
    print("=" * 80)
    
    # Create output directory
    if not args.output_dir:
        output_dir = create_output_directory()
    else:
        output_dir = args.output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    print(f"📁 Output directory: {output_dir}")
    
    # Get video files to test
    test_light_dir = "test_light"
    video_files = []
    
    if args.video:
        if os.path.exists(args.video):
            video_files = [args.video]
        else:
            print(f"❌ Video file not found: {args.video}")
            return
    else:
        # Test both videos in test_light directory
        if os.path.exists(test_light_dir):
            for file in os.listdir(test_light_dir):
                if file.endswith(('.mp4', '.avi', '.mov', '.mkv')):
                    video_files.append(os.path.join(test_light_dir, file))
        
        if not video_files:
            print(f"❌ No video files found in {test_light_dir} directory")
            return
    
    print(f"🎬 Videos to test: {len(video_files)}")
    for video in video_files:
        print(f"   - {os.path.basename(video)}")
    
    # Test each video
    all_results = []
    for video_path in video_files:
        results = test_light_detection_advanced(
            video_path=video_path,
            camera_role=args.camera_role,
            brightness_low=args.brightness_low,
            brightness_high=args.brightness_high,
            hysteresis=args.hysteresis,
            save_all_changes=not args.no_save,
            frame_interval=args.frame_interval,
            output_dir=output_dir
        )
        
        if results:
            all_results.append(results)
    
    # Save combined results
    combined_results_file = os.path.join(output_dir, "combined_analysis.json")
    with open(combined_results_file, 'w') as f:
        json.dump(all_results, f, indent=2, default=str)
    
    print(f"\n✨ Testing complete!")
    print(f"📊 Combined results saved to: {combined_results_file}")
    print(f"📁 All output files in: {output_dir}")

if __name__ == "__main__":
    main() 