#!/usr/bin/env python3
"""
Quick test for Smart Lighting Automation - 5 second timeout
"""

import cv2
import time
import logging
from datetime import datetime
from smart_lighting_automation import SmartLightingController

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def quick_test_lighting():
    """Quick test with 5-second timeout to verify notification system"""
    
    print("🚀 Quick Smart Lighting Test (5-second timeout)")
    print("="*50)
    
    # Configure with very short timeout for immediate testing
    config = {
        'test_mode': False,  
        'no_person_timeout': 5,  # 5 seconds for immediate testing
        'user_response_timeout': 10,  # 10 seconds 
        'notification_endpoint': 'http://localhost:9000/api/notifications',
        'camera_roles': ['living_room'],
        'person_confidence_threshold': 0.5,
        'light_confidence_threshold': 0.7
    }
    
    print(f"⚙️  Config: {config['no_person_timeout']}s timeout")
    
    # Initialize controller
    controller = SmartLightingController(config)
    
    # Load a test video
    video_path = '/Users/syed/code/micro/server/videos/upload_2025-06-28T06-18-04-867Z_segment_20250627_211604.mp4'
    
    print(f"📹 Processing: {video_path}")
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("❌ Could not open video")
        return
    
    start_time = datetime.now()
    frame_count = 0
    notification_sent = False
    
    print("🔍 Processing frames...")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        
        # Process every 10th frame to speed up
        if frame_count % 10 != 0:
            continue
            
        # Process frame
        controller.process_frame(frame, 'living_room')
        
        # Get room state
        room_state = controller.room_states['living_room']
        
        # Calculate elapsed time
        elapsed_time = (datetime.now() - start_time).total_seconds()
        
        # Check if lights first detected
        if room_state.get('lights_first_detected_time') and not notification_sent:
            lights_on_duration = (datetime.now() - room_state['lights_first_detected_time']).total_seconds()
            
            print(f"⏱️  Frame {frame_count}: Elapsed {elapsed_time:.1f}s, Lights on for {lights_on_duration:.1f}s")
            print(f"    Person present: {room_state['person_present']}")
            print(f"    Lights on: {room_state['lights_on']}")
            print(f"    Pending notification: {bool(room_state.get('pending_notification'))}")
            
            # Check if notification should have been sent
            if lights_on_duration > config['no_person_timeout']:
                if room_state.get('pending_notification'):
                    print(f"🔔 NOTIFICATION SENT at {elapsed_time:.1f}s!")
                    notification_sent = True
                    break
                else:
                    print(f"❌ Should have sent notification but didn't!")
                    print(f"   Debug conditions:")
                    print(f"   - Lights on: {room_state['lights_on']}")
                    print(f"   - Person present: {room_state['person_present']}")
                    print(f"   - Last person time: {room_state.get('last_person_time')}")
                    print(f"   - Lights first detected: {room_state.get('lights_first_detected_time')}")
                    print(f"   - Duration > timeout: {lights_on_duration} > {config['no_person_timeout']}")
        
        # Stop after 30 seconds max
        if elapsed_time > 30:
            print(f"⏰ Test timeout after {elapsed_time:.1f}s")
            break
    
    cap.release()
    
    # Final state
    room_state = controller.room_states['living_room']
    print(f"\n📊 Final Results:")
    print(f"   Frames processed: {frame_count}")
    print(f"   Notification sent: {'✓' if notification_sent else '✗'}")
    print(f"   Lights detected: {'✓' if room_state.get('lights_first_detected_time') else '✗'}")
    print(f"   Person detected: {'✓' if room_state.get('last_person_time') else '✗'}")
    
    return notification_sent

if __name__ == "__main__":
    success = quick_test_lighting()
    print(f"\n🎯 Test {'PASSED' if success else 'FAILED'}") 