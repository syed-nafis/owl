#!/usr/bin/env python3
"""
Test script for Smart Lighting Automation System
"""

import cv2
import time
import numpy as np
import json
from datetime import datetime
from smart_lighting_automation import SmartLightingController, create_automation_log_table

def create_test_frame_with_person(has_person=True, brightness=160):
    """
    Create a test frame with or without a person
    
    Args:
        has_person: Whether to include a person-shaped object
        brightness: Overall brightness level of the frame
        
    Returns:
        Test frame as numpy array
    """
    # Create a base frame
    frame = np.full((480, 640, 3), brightness, dtype=np.uint8)
    
    if has_person:
        # Add a simple person-shaped object (rectangle with head circle)
        # Body rectangle
        cv2.rectangle(frame, (300, 200), (340, 350), (brightness-50, brightness-50, brightness-50), -1)
        # Head circle
        cv2.circle(frame, (320, 180), 20, (brightness-50, brightness-50, brightness-50), -1)
        
        # Add some variation to make it more realistic
        noise = np.random.normal(0, 10, frame.shape).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    return frame

def test_automation_scenario():
    """Test the complete automation scenario"""
    
    print("🔧 Initializing Smart Lighting Controller...")
    
    # Configure for testing
    config = {
        'test_mode': True,  # Enable test mode
        'no_person_timeout': 10,  # Reduce to 10 seconds for testing
        'user_response_timeout': 15,  # Reduce to 15 seconds for testing
        'camera_roles': ['living_room'],  # Test with one room
        'esp_base_url': 'http://192.168.1.100',  # Your ESP IP
        'person_confidence_threshold': 0.3,  # Lower threshold for test frames
        'light_confidence_threshold': 0.6
    }
    
    controller = SmartLightingController(config)
    
    # Create database table
    create_automation_log_table()
    
    room = 'living_room'
    
    print(f"\n🏠 Testing automation for room: {room}")
    print("="*60)
    
    # Scenario 1: Person present, lights off -> should turn on lights
    print("\n📋 Scenario 1: Person detected with lights off")
    print("Expected: Lights should turn ON")
    
    # Create frame with person and low brightness (lights off)
    frame_person_lights_off = create_test_frame_with_person(has_person=True, brightness=100)
    controller.process_frame(frame_person_lights_off, room)
    
    status = controller.get_status_summary()
    print(f"✅ Person present: {status['rooms'][room]['person_present']}")
    print(f"💡 Lights on: {status['rooms'][room]['lights_on']}")
    
    time.sleep(2)
    
    # Scenario 2: Person leaves, lights still on -> should send notification
    print("\n📋 Scenario 2: Person leaves, lights remain on")
    print("Expected: Notification should be sent after timeout")
    
    # Simulate person leaving (process frames without person)
    print("👤 Person leaving room...")
    for i in range(3):
        frame_no_person_lights_on = create_test_frame_with_person(has_person=False, brightness=200)
        controller.process_frame(frame_no_person_lights_on, room)
        time.sleep(1)
        print(f"   Frame {i+1}: No person detected")
    
    # Wait for timeout to trigger notification
    print(f"⏳ Waiting {config['no_person_timeout']} seconds for notification...")
    
    for i in range(config['no_person_timeout'] + 2):
        frame_no_person_lights_on = create_test_frame_with_person(has_person=False, brightness=200)
        controller.process_frame(frame_no_person_lights_on, room)
        time.sleep(1)
        
        if i % 5 == 0:
            status = controller.get_status_summary()
            has_notification = status['rooms'][room]['has_pending_notification']
            minutes_since = status['rooms'][room]['minutes_since_person']
            print(f"   {i:2d}s: Minutes since person: {minutes_since}, Notification pending: {has_notification}")
    
    # Check final status
    final_status = controller.get_status_summary()
    print(f"\n🔍 Final status:")
    print(f"   💡 Lights on: {final_status['rooms'][room]['lights_on']}")
    print(f"   👤 Person present: {final_status['rooms'][room]['person_present']}")
    print(f"   📱 Pending notification: {final_status['rooms'][room]['has_pending_notification']}")
    print(f"   ⏰ Minutes since person: {final_status['rooms'][room]['minutes_since_person']}")
    
    # Wait a bit more to see auto turn-off in action
    print(f"\n⏳ Waiting for auto turn-off (timeout: {config['user_response_timeout']}s)...")
    time.sleep(config['user_response_timeout'] + 2)
    
    # Check status after auto turn-off
    auto_status = controller.get_status_summary()
    print(f"\n🔍 Status after auto turn-off:")
    print(f"   💡 Lights on: {auto_status['rooms'][room]['lights_on']}")
    print(f"   📱 Pending notification: {auto_status['rooms'][room]['has_pending_notification']}")
    
    print("\n✅ Test completed!")
    
    return controller

def test_manual_scenarios():
    """Test manual control scenarios"""
    
    print("\n🔧 Testing manual scenarios...")
    
    config = {
        'test_mode': False,  # Disable test mode to see actual ESP calls
        'camera_roles': ['living_room'],
        'esp_base_url': 'http://192.168.1.100'  # Your ESP IP
    }
    
    controller = SmartLightingController(config)
    
    print("\n📋 Manual ESP Control Test")
    print("="*40)
    
    # Test ESP communication
    rooms_to_test = ['living_room', 'all']
    
    for room in rooms_to_test:
        print(f"\n🏠 Testing room: {room}")
        
        # Test turning lights on
        print("   🔆 Turning lights ON...")
        success_on = controller.esp_light_control('on', room)
        print(f"   ✅ Success: {success_on}")
        
        time.sleep(2)
        
        # Test turning lights off
        print("   🌙 Turning lights OFF...")
        success_off = controller.esp_light_control('off', room)
        print(f"   ✅ Success: {success_off}")
        
        time.sleep(1)
        print()

def interactive_test():
    """Interactive test mode"""
    
    print("\n🎮 Interactive Test Mode")
    print("="*30)
    
    config = {
        'test_mode': True,
        'no_person_timeout': 30,
        'user_response_timeout': 60,
        'camera_roles': ['living_room']
    }
    
    controller = SmartLightingController(config)
    room = 'living_room'
    
    print("\nCommands:")
    print("  p - Simulate person detected")
    print("  n - Simulate no person")
    print("  s - Show status")
    print("  q - Quit")
    
    while True:
        try:
            cmd = input("\n> ").strip().lower()
            
            if cmd == 'q':
                break
            elif cmd == 'p':
                frame = create_test_frame_with_person(True, 200)
                controller.process_frame(frame, room)
                print("👤 Person detected in frame")
            elif cmd == 'n':
                frame = create_test_frame_with_person(False, 200)
                controller.process_frame(frame, room)
                print("🚫 No person in frame")
            elif cmd == 's':
                status = controller.get_status_summary()
                room_status = status['rooms'][room]
                print(f"\n📊 Status for {room}:")
                print(f"   💡 Lights on: {room_status['lights_on']}")
                print(f"   👤 Person present: {room_status['person_present']}")
                print(f"   📱 Has notification: {room_status['has_pending_notification']}")
                print(f"   ⏰ Minutes since person: {room_status['minutes_since_person']}")
                print(f"   🕐 Last detection: {room_status['last_person_time']}")
            else:
                print("❓ Unknown command")
                
        except KeyboardInterrupt:
            break
    
    print("\n👋 Interactive test ended")

if __name__ == "__main__":
    print("🌟 Smart Lighting Automation Test Suite")
    print("="*50)
    
    print("\nAvailable tests:")
    print("1. Automated scenario test")
    print("2. Manual ESP control test") 
    print("3. Interactive test mode")
    
    try:
        choice = input("\nSelect test (1-3): ").strip()
        
        if choice == '1':
            controller = test_automation_scenario()
        elif choice == '2':
            test_manual_scenarios()
        elif choice == '3':
            interactive_test()
        else:
            print("❓ Invalid choice")
            
    except KeyboardInterrupt:
        print("\n\n👋 Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test error: {e}")
    
    print("\n🏁 Test suite completed") 