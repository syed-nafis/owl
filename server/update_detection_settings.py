#!/usr/bin/env python3
"""
Script to update detection class settings in the database
"""

import os
import sys
import json
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def main():
    """Update detection class settings"""
    try:
        # Check if settings JSON is provided as a command-line argument
        if len(sys.argv) != 2:
            logger.error("Missing settings JSON argument")
            print(json.dumps({
                'success': False,
                'message': 'Missing settings JSON argument'
            }))
            sys.exit(1)
        
        settings_json = sys.argv[1]
        logger.info(f"Received settings JSON: {settings_json[:100]}...")
        
        try:
            # Parse the JSON to validate it
            settings = json.loads(settings_json)
            
            # Import video_processor module to use the update function
            sys.path.append(os.path.dirname(os.path.abspath(__file__)))
            from video_processor import update_detection_class_settings
            
            # Update the settings
            result = update_detection_class_settings(settings_json)
            
            if result:
                logger.info("Detection class settings updated successfully")
                print(json.dumps({
                    'success': True,
                    'message': 'Detection class settings updated successfully'
                }))
                sys.exit(0)
            else:
                logger.error("Failed to update detection class settings")
                print(json.dumps({
                    'success': False,
                    'message': 'Failed to update detection class settings'
                }))
                sys.exit(1)
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON format")
            print(json.dumps({
                'success': False,
                'message': 'Invalid JSON format'
            }))
            sys.exit(1)
        
    except Exception as e:
        logger.error(f"Error updating detection class settings: {e}")
        print(json.dumps({
            'success': False,
            'message': f'Error: {str(e)}'
        }))
        sys.exit(1)

if __name__ == "__main__":
    main() 