#!/usr/bin/env python3
"""
Test Smart Lighting Automation on specific video
"""

import cv2
import time
import numpy as np
import json
import logging
from datetime import datetime, timedelta
from smart_lighting_automation import SmartLightingController, create_automation_log_table
import mysql.connector

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_smart_lighting_on_video(video_path, camera_role='living_room'):
    """
    Test smart lighting automation on a specific video file
    
    Args:
        video_path: Path to video file
        camera_role: Camera role/room name
    """
    
    print(f"🎬 Testing Smart Lighting Automation on video: {video_path}")
    print(f"🏠 Camera role: {camera_role}")
    print("="*80)
    
    # Initialize video capture
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file: {video_path}")
        return False
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps
    
    print(f"📹 Video Info:")
    print(f"   FPS: {fps}")
    print(f"   Frames: {frame_count}")
    print(f"   Duration: {duration:.1f} seconds")
    print()
    
    # Create automation log table
    create_automation_log_table()
    
    # Configure smart lighting controller for testing
    config = {
        'test_mode': True,  # Enable test mode
        'no_person_timeout': 20,  # 20 seconds for testing (instead of 2 minutes)
        'user_response_timeout': 30,  # 30 seconds for testing (instead of 3 minutes)
        'camera_roles': [camera_role],
        'person_confidence_threshold': 0.5,
        'light_confidence_threshold': 0.7,
        'esp_base_url': 'http://192.168.1.100',  # Your ESP IP
        'notification_endpoint': 'http://localhost:9000/api/notifications',  # Point to your server
        'db_config': {
            'host': 'localhost',
            'user': 'root', 
            'password': '',
            'database': 'owl_security'
        }
    }
    
    # Initialize controller
    print("🔧 Initializing Smart Lighting Controller...")
    controller = SmartLightingController(config)
    
    # Clear previous automation logs for this test
    try:
        conn = mysql.connector.connect(**config['db_config'])
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lighting_automation_log WHERE room = %s", (camera_role,))
        conn.commit()
        cursor.close()
        conn.close()
        print("🗑️  Cleared previous automation logs")
    except Exception as e:
        print(f"⚠️  Could not clear logs: {e}")
    
    # Track statistics
    stats = {
        'frames_processed': 0,
        'person_detections': 0,
        'lights_on_detections': 0,
        'lights_off_detections': 0,
        'notifications_sent': 0,
        'state_changes': []
    }
    
    frame_number = 0
    process_interval = max(1, int(fps / 2))  # Process 2 frames per second
    
    print("🎬 Starting video analysis...")
    print("📊 Real-time stats:")
    
    start_time = time.time()
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Process every Nth frame for efficiency
        if frame_number % process_interval == 0:
            stats['frames_processed'] += 1
            
            # Process frame with smart lighting automation
            try:
                # Store the controller state before processing
                prev_state = controller.get_status_summary()
                prev_room_state = prev_state['rooms'].get(camera_role, {})
                
                # Process the frame
                controller.process_frame(frame, camera_role)
                
                # Get current state after processing
                current_state = controller.get_status_summary()
                current_room_state = current_state['rooms'].get(camera_role, {})
                
                # Track detections
                if current_room_state.get('person_present', False):
                    stats['person_detections'] += 1
                
                if current_room_state.get('lights_on', False):
                    stats['lights_on_detections'] += 1
                else:
                    stats['lights_off_detections'] += 1
                
                # Check for state changes
                if prev_room_state.get('lights_on') != current_room_state.get('lights_on'):
                    timestamp = frame_number / fps
                    change = {
                        'frame': frame_number,
                        'time': f"{int(timestamp//60):02d}:{int(timestamp%60):02d}",
                        'lights_on': current_room_state.get('lights_on', False),
                        'person_present': current_room_state.get('person_present', False)
                    }
                    stats['state_changes'].append(change)
                    print(f"   🔄 State change at {change['time']}: Lights {'ON' if change['lights_on'] else 'OFF'}")
                
                # Check for notifications
                if (current_room_state.get('has_pending_notification', False) and 
                    not prev_room_state.get('has_pending_notification', False)):
                    stats['notifications_sent'] += 1
                    timestamp = frame_number / fps
                    print(f"   📱 Notification sent at {int(timestamp//60):02d}:{int(timestamp%60):02d}")
                
                # Progress update every 10 processed frames
                if stats['frames_processed'] % 10 == 0:
                    progress = frame_number / frame_count * 100
                    elapsed = time.time() - start_time
                    print(f"   Progress: {progress:.1f}% | Person: {stats['person_detections']} | "
                          f"Lights ON: {stats['lights_on_detections']} | Notifications: {stats['notifications_sent']}")
                
            except Exception as e:
                logger.error(f"Error processing frame {frame_number}: {e}")
        
        frame_number += 1
    
    cap.release()
    
    # Final analysis
    print("\n" + "="*80)
    print("📋 FINAL ANALYSIS")
    print("="*80)
    
    print(f"🎬 Video processed: {stats['frames_processed']} frames")
    print(f"👤 Person detections: {stats['person_detections']}")
    print(f"💡 Lights ON detections: {stats['lights_on_detections']}")
    print(f"🌙 Lights OFF detections: {stats['lights_off_detections']}")
    print(f"📱 Notifications sent: {stats['notifications_sent']}")
    
    if stats['state_changes']:
        print(f"\n🔄 Light state changes ({len(stats['state_changes'])}):")
        for change in stats['state_changes']:
            print(f"   {change['time']} - Lights {'ON' if change['lights_on'] else 'OFF'} "
                  f"(Person: {'Yes' if change['person_present'] else 'No'})")
    else:
        print("\n🔄 No light state changes detected")
    
    # Check automation logs
    print(f"\n📝 Checking automation logs for room '{camera_role}'...")
    try:
        conn = mysql.connector.connect(**config['db_config'])
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM lighting_automation_log WHERE room = %s ORDER BY timestamp DESC", (camera_role,))
        logs = cursor.fetchall()
        
        if logs:
            print(f"   Found {len(logs)} automation log entries:")
            for log in logs[:5]:  # Show last 5
                print(f"   {log[4]} - {log[2]}: {log[3]}")
        else:
            print("   No automation log entries found")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"   ❌ Error checking logs: {e}")
    
    # Final room state
    final_state = controller.get_status_summary()
    final_room = final_state['rooms'].get(camera_role, {})
    
    print(f"\n🏠 Final room state for '{camera_role}':")
    print(f"   💡 Lights on: {final_room.get('lights_on', False)}")
    print(f"   👤 Person present: {final_room.get('person_present', False)}")
    print(f"   📱 Pending notification: {final_room.get('has_pending_notification', False)}")
    print(f"   ⏰ Minutes since person: {final_room.get('minutes_since_person', 'N/A')}")
    
    return True

def test_notification_system():
    """Test notification system separately"""
    
    print("\n📱 Testing Notification System")
    print("="*40)
    
    config = {
        'test_mode': False,  # Test real notifications
        'notification_endpoint': 'http://localhost:9000/api/notifications',  # Your server
        'user_response_timeout': 10
    }
    
    controller = SmartLightingController(config)
    
    # Test sending notification
    print("📤 Sending test notification...")
    notification_id = controller.send_notification(
        'living_room', 
        'Test notification: No person detected for 2+ minutes. Turn off lights?',
        'light_control'
    )
    
    if notification_id:
        print(f"✅ Notification sent successfully: {notification_id}")
        
        # Simulate user response after delay
        print("⏳ Waiting 5 seconds...")
        time.sleep(5)
        
        print("📥 Simulating user response: turn_off")
        controller.handle_user_response(notification_id, 'turn_off')
        
    else:
        print("❌ Failed to send notification")

if __name__ == "__main__":
    video_path = "/Users/syed/code/micro/server/videos/upload_2025-06-28T06-20-35-928Z_segment_20250627_212004.mp4"
    
    print("🚀 Smart Lighting Automation Test Suite")
    print("="*60)
    
    # Test 1: Video analysis
    success = test_smart_lighting_on_video(video_path, 'living_room')
    
    if success:
        print("\n✅ Video analysis completed successfully")
    else:
        print("\n❌ Video analysis failed")
    
    # Test 2: Notification system
    test_notification_system()
    
    print("\n🏁 All tests completed!") 