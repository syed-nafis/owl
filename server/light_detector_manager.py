#!/usr/bin/env python3
"""
Light Detector Manager Module
Manages light detector instances for different cameras
"""

import logging
from typing import Dict, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to import light detection
try:
    from light_detection import LightDetector, create_light_detector_config
except ImportError:
    logger.warning("Light detection module not available")
    LightDetector = None

class LightDetectorManager:
    """Manages light detector instances"""
    def __init__(self):
        self.detectors: Dict[str, Optional[LightDetector]] = {'default': None}
        self.initialize()
    
    def initialize(self):
        """Initialize the light detector with default configuration"""
        try:
            if LightDetector is not None:
                config = create_light_detector_config()
                self.detectors['default'] = LightDetector(config)
                logger.info("Light detector initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing light detector: {e}")
    
    def get_detector(self, camera_id: str = 'default') -> Optional[LightDetector]:
        """Get light detector for a specific camera"""
        return self.detectors.get(camera_id)

# Create a singleton instance
_instance = None

def get_manager() -> LightDetectorManager:
    """Get the singleton instance of LightDetectorManager"""
    global _instance
    if _instance is None:
        _instance = LightDetectorManager()
    return _instance 