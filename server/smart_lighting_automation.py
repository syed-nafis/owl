#!/usr/bin/env python3
"""
Smart Lighting Automation System
Integrates person detection, light detection, and ESP light control
"""

import cv2
import time
import json
import requests
import threading
import logging
import os
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Any
import mysql.connector

# Import our detection modules
try:
    from light_detection import LightDetector, create_light_detector_config
    from mediapipe_face import detect_faces
    from ultralytics import YOLO
except ImportError as e:
    print(f"Import warning: {e}")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SmartLightingController:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the smart lighting controller
        
        Args:
            config: Configuration dictionary with optional settings
        """
        # Default configuration
        default_config = {
            'test_mode': False,
            'esp_base_url': '192.168.85.90',  # No http:// prefix, just the IP or hostname
            'notification_endpoint': 'http://localhost:9000/api/notifications',
            'db_config': None,
            'person_confidence_threshold': 0.5,  # Confidence threshold for person detection
            'light_state_change_delay': 5,  # Seconds to wait before changing light state
            'motion_timeout': 300,  # Seconds to wait after last motion before turning off lights
            'person_timeout': 300  # Seconds to wait after last person detection before turning off lights
        }
        
        # Merge user config with defaults
        self.config = {**default_config, **(config or {})}
        
        # Initialize light detector
        try:
            from light_detection import LightDetector, create_light_detector_config
            config = create_light_detector_config()
            self.light_detector = LightDetector(config)
            logger.info("Light detector initialized successfully")
        except ImportError:
            logger.warning("Light detection module not available")
            self.light_detector = None
        
        # Initialize YOLO model for person detection
        try:
            self.yolo_model = YOLO('yolov8n.pt')
            logger.info("YOLO model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading YOLO model: {e}")
            self.yolo_model = None
        
        # Initialize state tracking
        self.current_lighting_state = {}  # Track lighting state
        self.last_state_change = {}      # Track last state change time
        self.state_confidence = {}       # Track confidence in current state
        self.last_motion_time = {}      # Track last motion detection time
        
        logger.info("Smart lighting controller initialized with config: %s", self.config)
    
    def detect_person_in_frame(self, frame: np.ndarray) -> bool:
        """
        Detect if a person is present in the frame
        
        Args:
            frame: Input frame
            
        Returns:
            True if person detected with sufficient confidence
        """
        try:
            # Method 1: YOLO detection
            if self.yolo_model:
                results = self.yolo_model(frame)
                for result in results:
                    boxes = result.boxes
                    for box in boxes:
                        class_id = int(box.cls[0])
                        class_name = self.yolo_model.names[class_id]
                        confidence = float(box.conf[0])
                        
                        if (class_name == 'person' and 
                            confidence > self.config['person_confidence_threshold']):
                            return True
            
            # Method 2: Face detection as backup
            faces = detect_faces(frame)
            if faces:
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error in person detection: {e}")
            return False
    
    def get_light_status(self, frame: np.ndarray) -> Dict:
        """
        Get current light status
        
        Args:
            frame: Current frame from camera
            
        Returns:
            Dictionary with light status information
        """
        try:
            if self.light_detector:
                results = self.light_detector.analyze_frame(frame)
                return {
                    'status': results.get('lighting_state', 'unknown'),
                    'confidence': results.get('state_confidence', 0.0),
                    'brightness': results['metrics'].get('mean_brightness', 0)
                }
            else:
                return {'status': 'unknown', 'confidence': 0.0}
            
        except Exception as e:
            logger.error(f"Error getting light status: {e}")
            return {'status': 'unknown', 'confidence': 0.0}
    
    def esp_light_control(self, action: str) -> bool:
        """
        Control lights via ESP endpoint
        
        Args:
            action: 'on' or 'off'
            
        Returns:
            True if successful
        """
        try:
            if self.config['test_mode']:
                logger.info(f"TEST MODE: Would turn lights {action}")
                return True
            
            # Construct proper URL with protocol
            esp_url = f"http://{self.config['esp_base_url'].strip('/')}/light"
            
            # Send request to ESP8266 using form data
            response = requests.post(esp_url,
                                  data={'state': action}, 
                                  headers={'Content-Type': 'application/x-www-form-urlencoded'},
                                  timeout=5)
            
            if response.status_code == 200:
                logger.info(f"Successfully turned lights {action}")
                return True
            else:
                logger.error(f"ESP request failed: {response.status_code} - {response.text}")
                return False
                
        except requests.RequestException as e:
            logger.error(f"ESP communication error: {e}")
            return False
        except Exception as e:
            logger.error(f"Error in ESP light control: {e}")
            return False
    
    def send_notification(self, message: str, notification_type: str = 'light_control') -> Optional[str]:
        """
        Send notification to user via app
        
        Args:
            message: Notification message
            notification_type: Type of notification
            
        Returns:
            Notification ID for tracking response
        """
        try:
            notification_id = f"{int(time.time())}"
            
            payload = {
                'id': notification_id,
                'type': notification_type,
                'message': message,
                'timestamp': datetime.now().isoformat(),
                'timeout': self.config['user_response_timeout'],
                'actions': ['turn_off', 'keep_on', 'dismiss']
            }
            
            if self.config['test_mode']:
                logger.info(f"TEST MODE: Would send notification - {message}")
                # Simulate user response after random delay for testing
                def simulate_response():
                    time.sleep(10)  # Simulate user taking 10 seconds to respond
                    self.handle_user_response(notification_id, 'turn_off')  # Simulate "turn off" response
                
                threading.Thread(target=simulate_response, daemon=True).start()
                return notification_id
            
            # Send actual notification
            response = requests.post(self.config['notification_endpoint'], json=payload, timeout=5)
            
            if response.status_code == 200:
                logger.info(f"Notification sent successfully: {notification_id}")
                return notification_id
            else:
                logger.error(f"Failed to send notification: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error sending notification: {e}")
            return None
    
    def handle_user_response(self, notification_id: str, action: str):
        """
        Handle user response to notification
        
        Args:
            notification_id: ID of the notification
            action: User's chosen action ('turn_off', 'keep_on', 'dismiss')
        """
        try:
            logger.info(f"User response for {notification_id}: {action}")
            
            if action == 'turn_off':
                # Turn off lights
                success = self.esp_light_control('off')
                if success:
                    self.current_lighting_state['lights_on'] = False
                    logger.info(f"Lights turned off per user request")
                    
                    # Store action in database
                    self.log_automation_action('user_turn_off', 'User requested lights off')
                
            elif action == 'keep_on':
                logger.info(f"User chose to keep lights on")
                # Store action in database
                self.log_automation_action('user_keep_on', 'User chose to keep lights on')
            
            # Clear pending notification
            self.current_lighting_state['pending_notification'] = None
            
            # Cancel any scheduled auto turn-off
            if self.current_lighting_state.get('auto_turn_off_scheduled'):
                self.current_lighting_state['auto_turn_off_scheduled'].cancel()
                self.current_lighting_state['auto_turn_off_scheduled'] = None
                
        except Exception as e:
            logger.error(f"Error handling user response: {e}")
    
    def schedule_auto_turn_off(self):
        """
        Schedule automatic turn-off after user response timeout
        """
        def auto_turn_off():
            try:
                logger.info(f"Auto-turning off lights (no user response)")
                success = self.esp_light_control('off')
                if success:
                    self.current_lighting_state['lights_on'] = False
                    self.current_lighting_state['pending_notification'] = None
                    
                    # Log action
                    self.log_automation_action('auto_turn_off', 'Automatic turn-off after timeout')
                    
            except Exception as e:
                logger.error(f"Error in auto turn-off: {e}")
        
        # Schedule the auto turn-off
        timer = threading.Timer(self.config['user_response_timeout'], auto_turn_off)
        timer.start()
        self.current_lighting_state['auto_turn_off_scheduled'] = timer
    
    def log_automation_action(self, action: str, description: str):
        """
        Log automation actions to database
        
        Args:
            action: Action taken
            description: Description of action
        """
        try:
            conn = mysql.connector.connect(**self.config['db_config'])
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO lighting_automation_log 
                (action, description, timestamp, room)
                VALUES (%s, %s, %s, %s)
            """, (action, description, datetime.now(), 'default'))
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"Error logging automation action: {e}")
    
    def process_frame(self, frame: np.ndarray, camera_id: str = 'default'):
        """
        Process a frame for smart lighting control based on person detection
        
        Args:
            frame: Input frame from camera
            camera_id: Identifier for the camera
        """
        try:
            # Get current light status
            light_status = self.get_light_status(frame)
            current_state = light_status['status']
            
            # Initialize state tracking for this camera if not exists
            if camera_id not in self.current_lighting_state:
                self.current_lighting_state[camera_id] = current_state
                self.last_state_change[camera_id] = time.time()
                self.state_confidence[camera_id] = light_status['confidence']
                self.last_motion_time[camera_id] = 0
            
            # Check for person in frame
            person_detected = self.detect_person_in_frame(frame)
            
            # Update last detection time if person detected
            if person_detected:
                self.last_motion_time[camera_id] = time.time()
                logger.info(f"Person detected for camera {camera_id}")
                
                # If lights are off and person detected, turn them on
                if current_state == 'off':
                    logger.info("Person detected with lights off - turning lights on")
                    self.esp_light_control('on')
                    self.current_lighting_state[camera_id] = 'on'
                    self.last_state_change[camera_id] = time.time()
            
            # Check if we should turn off lights due to no person detected
            elif current_state == 'on':
                time_since_person = time.time() - self.last_motion_time[camera_id]
                if time_since_person > self.config['person_timeout']:
                    logger.info(f"No person detected for {time_since_person:.1f}s - turning lights off")
                    self.esp_light_control('off')
                    self.current_lighting_state[camera_id] = 'off'
                    self.last_state_change[camera_id] = time.time()
            
            # Log state changes
            if current_state != self.current_lighting_state[camera_id]:
                self.log_automation_action(
                    action=f"lights_{current_state}",
                    description=f"Lights turned {current_state} due to {'person detected' if person_detected else 'no person detected'}"
                )
            
        except Exception as e:
            logger.error(f"Error in frame processing: {e}")
    
    def get_status_summary(self) -> Dict:
        """Get current status summary"""
        summary = {
            'timestamp': datetime.now().isoformat(),
            'lights_on': self.current_lighting_state.get('lights_on', False),
            'person_present': self.current_lighting_state.get('person_present', False),
            'last_person_time': self.current_lighting_state['last_person_time'].isoformat() if self.current_lighting_state['last_person_time'] else None,
            'has_pending_notification': bool(self.current_lighting_state.get('pending_notification')),
            'minutes_since_person': (
                int((datetime.now() - self.current_lighting_state['last_person_time']).total_seconds() / 60)
                if self.current_lighting_state['last_person_time'] else None
            ),
            'minutes_since_lights_on': (
                int((datetime.now() - self.current_lighting_state['last_person_time']).total_seconds() / 60)
                if self.current_lighting_state['last_person_time'] else None
            )
        }
        
        return summary

# Create database table for logging
def create_automation_log_table():
    """Create the automation log table if it doesn't exist"""
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS lighting_automation_log (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(50) NOT NULL,
        description TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        room VARCHAR(50) NOT NULL DEFAULT 'default',
        
        INDEX idx_timestamp (timestamp),
        INDEX idx_action (action)
    );
    """
    
    try:
        from video_processor import get_db_connection
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute(create_table_sql)
            conn.commit()
            cursor.close()
            conn.close()
            logger.info("Automation log table created/verified")
    except Exception as e:
        logger.error(f"Error creating automation log table: {e}")

# API endpoint for handling user responses
def handle_notification_response(notification_id: str, action: str, controller: SmartLightingController):
    """
    API endpoint handler for user notification responses
    
    Args:
        notification_id: ID of the notification
        action: User's chosen action
        controller: SmartLightingController instance
    """
    controller.handle_user_response(notification_id, action)

if __name__ == "__main__":
    # Example usage
    config = {
        'test_mode': True,  # Enable test mode
        'esp_base_url': 'http://192.168.1.100',  # Update with your ESP IP
    }
    
    controller = SmartLightingController(config)
    
    # Create log table
    create_automation_log_table()
    
    print("Smart Lighting Controller initialized in test mode")
    print("Use controller.process_frame(frame) to process video frames")
    print("Use controller.get_status_summary() to get current status") 