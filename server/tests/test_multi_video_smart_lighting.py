#!/usr/bin/env python3
"""
Test Smart Lighting Automation on multiple sequential videos
Tests the complete 6-minute workflow: monitoring → notification → auto turn-off
"""

import cv2
import time
import numpy as np
import json
import logging
from datetime import datetime, timedelta
from smart_lighting_automation import SmartLightingController, create_automation_log_table
import mysql.connector
import os

def clear_automation_logs():
    """Clear previous automation logs for clean testing"""
    try:
        conn = mysql.connector.connect(host='localhost', user='root', password='', database='owl_security')
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lighting_automation_log")
        conn.commit()
        cursor.close()
        conn.close()
        print("🗑️  Cleared previous automation logs")
    except Exception as e:
        print(f"⚠️  Could not clear logs: {e}")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_smart_lighting_multi_video(video_paths, camera_role='living_room'):
    """
    Test smart lighting automation across multiple sequential videos
    
    Args:
        video_paths: List of video file paths
        camera_role: Camera role/room name
    """
    
    print(f"🚀 Smart Lighting Automation - Multi-Video Test")
    print("="*80)
    print("Testing complete 6-minute workflow:")
    print("  0-2 min: Monitor lights ON, no person")
    print("  2 min:   Send notification (no person for 2+ minutes)")
    print("  5 min:   Auto turn-off lights (3 min after notification)")
    print("="*80)
    
    # Verify video files exist
    for i, video_path in enumerate(video_paths, 1):
        if os.path.exists(video_path):
            print(f"✅ Video {i}: {os.path.basename(video_path)}")
        else:
            print(f"❌ Video {i}: File not found - {video_path}")
            return
    
    # Clear previous logs
    clear_automation_logs()
    
    # Configure smart lighting controller with production settings
    config = {
        'test_mode': False,  # Don't simulate ESP, actually try to send notifications
        'no_person_timeout': 120,  # 2 minutes as per your requirements
        'user_response_timeout': 180,  # 3 minutes as per your requirements
        'notification_endpoint': 'http://localhost:9000/api/notifications',  # Use our server endpoint
        'camera_roles': [camera_role],
        'person_confidence_threshold': 0.5,
        'light_confidence_threshold': 0.7,
        'db_config': {
            'host': 'localhost',
            'user': 'root',
            'password': '',
            'database': 'owl_security'
        }
    }
    
    # Initialize controller
    print(f"🔧 Initializing Smart Lighting Controller...")
    controller = SmartLightingController(config)
    
    # Create cumulative time tracking
    cumulative_time = 0.0
    total_frames = 0
    total_person_detections = 0
    total_lights_on = 0
    total_lights_off = 0
    notifications_sent = 0
    events_timeline = []
    
    # Process each video sequentially
    for video_idx, video_path in enumerate(video_paths):
        video_name = os.path.basename(video_path)
        
        # Calculate time range for this video
        start_time = cumulative_time
        
        print(f"🎬 Processing Video {video_idx + 1}/{len(video_paths)}: {video_name}")
        print(f"   Time range: {start_time}s - {start_time + 120.0}s")
        
        try:
            # Open video
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                print(f"❌ Error: Could not open video {video_path}")
                continue
            
            # Get video info
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_video_frames / fps if fps > 0 else 0
            
            print(f"      📹 Duration: {duration:.1f}s, FPS: {fps:.1f}, Frames: {total_video_frames}")
            
            frame_count = 0
            video_person_detections = 0
            video_lights_on = 0
            
            # Process every 5th frame to speed up testing
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_count += 1
                
                # Skip frames for faster processing (process every 5th frame)
                if frame_count % 5 != 0:
                    continue
                
                # Calculate current timestamp in the overall timeline
                current_video_time = frame_count / fps
                current_timeline_time = start_time + current_video_time
                
                # Process frame with controller
                controller.process_frame(frame, camera_role)
                
                # Get current state for debugging
                room_state = controller.room_states[camera_role]
                
                # Track detections
                total_frames += 1
                if room_state['person_present']:
                    video_person_detections += 1
                    total_person_detections += 1
                
                if room_state['lights_on']:
                    video_lights_on += 1
                    total_lights_on += 1
                else:
                    total_lights_off += 1
                
                # Check for automation events
                if room_state.get('pending_notification') and room_state['pending_notification'] not in [n['id'] for n in [event for event in events_timeline if 'notification_id' in event]]:
                    notification_time = f"{int(current_timeline_time // 60):02d}:{int(current_timeline_time % 60):02d}"
                    print(f"      📱 {notification_time} - 🔔 NOTIFICATION SENT: User response timeout started")
                    events_timeline.append({
                        'time': current_timeline_time,
                        'type': 'notification',
                        'message': 'User notification sent',
                        'notification_id': room_state['pending_notification']['id']
                    })
                    notifications_sent += 1
                
                # Debug logging every 100 frames
                if frame_count % 150 == 0:  # Every 150 frames for progress update
                    progress = (frame_count / total_video_frames) * 100
                    time_str = f"{int(current_timeline_time // 60):02d}:{int(current_timeline_time % 60):02d}"
                    print(f"      Progress: {progress:.1f}% | Time: {time_str} | Person: {video_person_detections} | Lights ON: {video_lights_on}")
                    
                    # Debug state information
                    if room_state.get('lights_first_detected_time'):
                        time_since_lights_on = (datetime.now() - room_state['lights_first_detected_time']).total_seconds()
                        print(f"      🔍 DEBUG: Lights on for {time_since_lights_on:.1f}s, No person timeout: {config['no_person_timeout']}s")
                        if time_since_lights_on > config['no_person_timeout']:
                            print(f"      🔍 DEBUG: Should trigger notification! No person for {time_since_lights_on:.1f}s > {config['no_person_timeout']}s")
            
            cap.release()
            print(f"   ✅ Video {video_idx + 1} completed")
            
            # Update cumulative time for next video
            cumulative_time += 120.0  # Each video represents 2 minutes
            
        except Exception as e:
            print(f"❌ Error processing video {video_name}: {e}")
            continue
    
    # Final analysis
    print("\n" + "="*80)
    print("📋 COMPLETE WORKFLOW ANALYSIS")
    print("="*80)
    
    print(f"🎬 Total frames processed: {total_frames}")
    print(f"👤 Total person detections: {total_person_detections}")
    print(f"💡 Total lights ON detections: {total_lights_on}")
    print(f"🌙 Total lights OFF detections: {total_lights_off}")
    print(f"📱 Notifications sent: {notifications_sent}")
    
    # Timeline of events
    if events_timeline:
        print(f"\n📅 Timeline of Events ({len(events_timeline)}):")
        for event in events_timeline:
            print(f"   {event['time']:.1f}s - {event['type']}: {event['message']}")
    else:
        print("\n📅 No significant events detected")
    
    # Check automation logs from database
    print(f"\n📝 Automation Logs from Database:")
    try:
        conn = mysql.connector.connect(**config['db_config'])
        cursor = conn.cursor()
        cursor.execute("""
            SELECT timestamp, action, description 
            FROM lighting_automation_log 
            WHERE room = %s 
            ORDER BY timestamp ASC
        """, (camera_role,))
        logs = cursor.fetchall()
        
        if logs:
            print(f"   Found {len(logs)} automation actions:")
            for log in logs:
                timestamp, action, description = log
                print(f"   {timestamp.strftime('%H:%M:%S')} - {action}: {description}")
        else:
            print("   No automation actions recorded in database")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"   ❌ Error checking logs: {e}")
    
    # Final controller state
    final_state = controller.get_status_summary()
    final_room = final_state['rooms'].get(camera_role, {})
    
    print(f"\n🏠 Final System State for '{camera_role}':")
    print(f"   💡 Lights on: {final_room.get('lights_on', False)}")
    print(f"   👤 Person present: {final_room.get('person_present', False)}")
    print(f"   📱 Pending notification: {final_room.get('has_pending_notification', False)}")
    print(f"   ⏰ Minutes since person: {final_room.get('minutes_since_person', 'N/A')}")
    
    # Evaluation
    print(f"\n🎯 Test Evaluation:")
    expected_notification = notifications_sent >= 1
    expected_lights_on = total_lights_on > 0
    
    print(f"   ✅ Lights detected as ON: {'✓' if expected_lights_on else '✗'}")
    print(f"   ✅ Notification sent at 2min: {'✓' if expected_notification else '✗'}")
    print(f"   ✅ No person detected (expected): {'✓' if total_person_detections == 0 else '✗'}")
    
    if expected_notification and expected_lights_on:
        print("\n🎉 SUCCESS: Core automation workflow is working!")
    else:
        print("\n⚠️  ISSUES: Some automation features need attention")
    
    return True

def process_single_video(video_path, controller, camera_role, time_offset, video_number):
    """
    Process a single video while maintaining controller state
    
    Args:
        video_path: Path to video file
        controller: SmartLightingController instance to maintain state
        camera_role: Camera role
        time_offset: Cumulative time offset from previous videos
        video_number: Video sequence number
        
    Returns:
        Dictionary with video statistics
    """
    
    # Initialize video capture
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file: {video_path}")
        return {}
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps
    
    # Track statistics for this video
    stats = {
        'frames_processed': 0,
        'person_detections': 0,
        'lights_on_detections': 0,
        'lights_off_detections': 0,
        'notifications_sent': 0,
        'timeline_events': []
    }
    
    frame_number = 0
    process_interval = max(1, int(fps / 2))  # Process 2 frames per second
    
    print(f"      📹 Duration: {duration:.1f}s, FPS: {fps}, Frames: {frame_count}")
    
    start_time = time.time()
    last_notification_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Process every Nth frame for efficiency
        if frame_number % process_interval == 0:
            stats['frames_processed'] += 1
            
            # Calculate current timestamp in the overall timeline
            frame_time_offset = frame_number / fps
            absolute_timestamp = time_offset + frame_time_offset
            
            try:
                # Store controller state before processing
                prev_state = controller.get_status_summary()
                prev_room_state = prev_state['rooms'].get(camera_role, {})
                prev_notification_pending = prev_room_state.get('has_pending_notification', False)
                
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
                
                # Check for new notifications
                current_notification_pending = current_room_state.get('has_pending_notification', False)
                if current_notification_pending and not prev_notification_pending:
                    stats['notifications_sent'] += 1
                    timestamp_str = f"{int(absolute_timestamp//60):02d}:{int(absolute_timestamp%60):02d}"
                    event = f"{timestamp_str} - 📱 NOTIFICATION SENT: No person for 2+ minutes"
                    stats['timeline_events'].append(event)
                    print(f"      🔔 {event}")
                
                # Check for lights turning off (automation action)
                if (prev_room_state.get('lights_on', True) and 
                    not current_room_state.get('lights_on', False)):
                    timestamp_str = f"{int(absolute_timestamp//60):02d}:{int(absolute_timestamp%60):02d}"
                    event = f"{timestamp_str} - 🌙 LIGHTS TURNED OFF: Auto turn-off"
                    stats['timeline_events'].append(event)
                    print(f"      💡 {event}")
                
                # Progress update every 10 processed frames
                if stats['frames_processed'] % 10 == 0:
                    progress = frame_number / frame_count * 100
                    time_in_video = frame_number / fps
                    print(f"      Progress: {progress:.1f}% | Time: {time_in_video:.1f}s | "
                          f"Person: {stats['person_detections']} | Lights ON: {stats['lights_on_detections']}")
                
            except Exception as e:
                logger.error(f"Error processing frame {frame_number}: {e}")
        
        frame_number += 1
    
    cap.release()
    return stats

if __name__ == "__main__":
    # Define the 3 sequential videos (6 minutes total) - Using recent consecutive videos
    video_paths = [
        "/Users/syed/code/micro/server/videos/upload_2025-06-28T09-32-23-728Z_segment_20250628_003023.mp4",  # 0-2 min
        "/Users/syed/code/micro/server/videos/upload_2025-06-28T09-34-23-821Z_segment_20250628_003223.mp4",  # 2-4 min  
        "/Users/syed/code/micro/server/videos/upload_2025-06-28T09-34-42-039Z_segment_20250628_003423.mp4"   # 4-6 min
    ]
    
    print("🎯 Testing Smart Lighting Automation Workflow")
    print("Expected sequence:")
    print("  📹 Video 1 (0-2 min): Lights ON, no person detected")
    print("  📱 Video 2 (2-4 min): Notification sent at 2:00 mark")  
    print("  🌙 Video 3 (4-6 min): Lights auto turn-off at 5:00 mark")
    print()
    
    # Run the test
    success = test_smart_lighting_multi_video(video_paths, 'Camera')  # Use 'Camera' to match your room name
    
    if success:
        print("\n✅ Multi-video automation test completed!")
    else:
        print("\n❌ Multi-video automation test failed!") 