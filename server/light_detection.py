#!/usr/bin/env python3
import cv2
import numpy as np
import json
import logging
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import math

# Configure logging
logger = logging.getLogger(__name__)

class LightDetector:
    def __init__(self, config: Dict = None):
        """
        Initialize the light detector with configurable parameters
        
        Args:
            config: Configuration dictionary with detection parameters
        """
        # Default configuration
        default_config = {
            # Brightness thresholds (0-255 scale)
            'brightness_threshold_low': 50,   # Below this = lights off
            'brightness_threshold_high': 120, # Above this = lights on
            'brightness_hysteresis': 10,      # Prevent flickering between states
            
            # Histogram analysis
            'histogram_bins': 64,             # Number of histogram bins
            'bright_pixel_threshold': 180,    # Pixels above this considered "bright"
            'bright_pixel_ratio_on': 0.15,   # Ratio of bright pixels for "lights on"
            'bright_pixel_ratio_off': 0.05,  # Ratio of bright pixels for "lights off"
            
            # Temporal analysis
            'temporal_window_size': 5,        # Number of frames to analyze for changes
            'brightness_change_threshold': 30, # Minimum change to detect light switch
            'stability_frames': 3,            # Frames needed to confirm state change
            
            # ROI analysis
            'roi_regions': [],                # List of (x1, y1, x2, y2) regions to analyze
            'roi_weights': [],                # Weights for each ROI region
            
            # General settings
            'resize_for_analysis': True,      # Resize frame for faster analysis
            'analysis_width': 320,            # Width for analysis (maintains aspect ratio)
            'use_temporal_smoothing': True,   # Use temporal smoothing for stability
            'detection_methods': ['brightness', 'histogram', 'temporal'] # Methods to use
        }
        
        # Merge user config with defaults
        self.config = {**default_config, **(config or {})}
        
        # State tracking
        self.current_state = None  # 'on', 'off', or None (unknown)
        self.brightness_history = []
        self.histogram_history = []
        self.state_confidence = 0.0
        self.frames_in_current_state = 0
        self.last_state_change = None
        
        # Detection statistics
        self.detection_stats = {
            'total_frames_analyzed': 0,
            'state_changes_detected': 0,
            'lights_on_duration': 0,
            'lights_off_duration': 0,
            'last_on_time': None,
            'last_off_time': None
        }
        
        logger.info("Light detector initialized with config: %s", self.config)
    
    def preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess frame for analysis (resize, convert to grayscale if needed)
        
        Args:
            frame: Input BGR frame
            
        Returns:
            Preprocessed frame
        """
        processed_frame = frame.copy()
        
        # Resize for faster analysis if configured
        if self.config['resize_for_analysis']:
            height, width = frame.shape[:2]
            if width > self.config['analysis_width']:
                new_width = self.config['analysis_width']
                new_height = int(height * (new_width / width))
                processed_frame = cv2.resize(processed_frame, (new_width, new_height))
        
        return processed_frame
    
    def calculate_brightness_metrics(self, frame: np.ndarray, roi_regions: List = None) -> Dict:
        """
        Calculate various brightness metrics for the frame
        
        Args:
            frame: Input frame (BGR or grayscale)
            roi_regions: Optional list of ROI regions [(x1, y1, x2, y2), ...]
            
        Returns:
            Dictionary with brightness metrics
        """
        # Convert to grayscale if needed
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        
        metrics = {}
        
        # Global brightness metrics
        metrics['mean_brightness'] = np.mean(gray)
        metrics['median_brightness'] = np.median(gray)
        metrics['std_brightness'] = np.std(gray)
        metrics['min_brightness'] = np.min(gray)
        metrics['max_brightness'] = np.max(gray)
        
        # Brightness distribution
        bright_pixels = np.sum(gray > self.config['bright_pixel_threshold'])
        total_pixels = gray.size
        metrics['bright_pixel_ratio'] = bright_pixels / total_pixels
        
        # ROI analysis if regions are specified
        if roi_regions:
            roi_brightness = []
            roi_weights = self.config.get('roi_weights', [1.0] * len(roi_regions))
            
            for i, (x1, y1, x2, y2) in enumerate(roi_regions):
                # Ensure coordinates are within frame bounds
                h, w = gray.shape
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                
                if x2 > x1 and y2 > y1:
                    roi = gray[y1:y2, x1:x2]
                    roi_mean = np.mean(roi)
                    roi_brightness.append(roi_mean * roi_weights[i])
                else:
                    roi_brightness.append(0)
            
            metrics['roi_weighted_brightness'] = np.mean(roi_brightness) if roi_brightness else metrics['mean_brightness']
        else:
            metrics['roi_weighted_brightness'] = metrics['mean_brightness']
        
        return metrics
    
    def calculate_histogram_metrics(self, frame: np.ndarray) -> Dict:
        """
        Calculate histogram-based lighting metrics
        
        Args:
            frame: Input frame
            
        Returns:
            Dictionary with histogram metrics
        """
        # Convert to grayscale if needed
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        
        # Calculate histogram
        hist = cv2.calcHist([gray], [0], None, [self.config['histogram_bins']], [0, 256])
        hist = hist.flatten() / gray.size  # Normalize
        
        metrics = {}
        
        # Histogram statistics
        metrics['histogram'] = hist.tolist()
        
        # Weighted brightness (emphasizes higher intensities)
        bin_centers = np.linspace(0, 255, self.config['histogram_bins'])
        metrics['weighted_brightness'] = np.sum(hist * bin_centers)
        
        # Distribution metrics
        total_pixels = np.sum(hist)
        
        # Dark pixel ratio (0-85)
        dark_bins = int(85 * self.config['histogram_bins'] / 256)
        metrics['dark_pixel_ratio'] = np.sum(hist[:dark_bins])
        
        # Mid pixel ratio (85-170)
        mid_start = dark_bins
        mid_end = int(170 * self.config['histogram_bins'] / 256)
        metrics['mid_pixel_ratio'] = np.sum(hist[mid_start:mid_end])
        
        # Bright pixel ratio (170-255)
        metrics['bright_pixel_ratio'] = np.sum(hist[mid_end:])
        
        # Histogram entropy (measure of distribution uniformity)
        hist_nonzero = hist[hist > 0]
        if len(hist_nonzero) > 0:
            metrics['entropy'] = -np.sum(hist_nonzero * np.log2(hist_nonzero))
        else:
            metrics['entropy'] = 0
        
        return metrics
    
    def detect_temporal_changes(self, current_metrics: Dict) -> Dict:
        """
        Detect temporal changes in lighting
        
        Args:
            current_metrics: Current frame metrics
            
        Returns:
            Dictionary with temporal change information
        """
        changes = {
            'brightness_change': 0,
            'significant_change': False,
            'change_direction': 'none',  # 'increase', 'decrease', 'none'
            'stability_score': 0.0
        }
        
        # Add current brightness to history
        current_brightness = current_metrics.get('roi_weighted_brightness', current_metrics['mean_brightness'])
        self.brightness_history.append(current_brightness)
        
        # Maintain window size
        if len(self.brightness_history) > self.config['temporal_window_size']:
            self.brightness_history.pop(0)
        
        # Calculate changes if we have enough history
        if len(self.brightness_history) >= 2:
            # Calculate change from previous frame
            brightness_change = current_brightness - self.brightness_history[-2]
            changes['brightness_change'] = brightness_change
            
            # Check for significant change
            if abs(brightness_change) > self.config['brightness_change_threshold']:
                changes['significant_change'] = True
                changes['change_direction'] = 'increase' if brightness_change > 0 else 'decrease'
        
        # Calculate stability score (lower = more stable)
        if len(self.brightness_history) >= self.config['temporal_window_size']:
            stability = np.std(self.brightness_history)
            changes['stability_score'] = stability
        
        return changes
    
    def classify_lighting_state(self, metrics: Dict, temporal_changes: Dict) -> Dict:
        """
        Classify the current lighting state based on all metrics
        
        Args:
            metrics: Frame brightness/histogram metrics
            temporal_changes: Temporal change information
            
        Returns:
            Dictionary with classification results
        """
        classification = {
            'state': 'unknown',
            'confidence': 0.0,
            'method_votes': {},
            'reasoning': []
        }
        
        votes = []
        reasoning = []
        
        # Method 1: Brightness-based classification
        if 'brightness' in self.config['detection_methods']:
            brightness = metrics.get('roi_weighted_brightness', metrics['mean_brightness'])
            
            # Apply hysteresis to prevent flickering
            threshold_low = self.config['brightness_threshold_low']
            threshold_high = self.config['brightness_threshold_high']
            hysteresis = self.config['brightness_hysteresis']
            
            if self.current_state == 'off':
                threshold_high += hysteresis
            elif self.current_state == 'on':
                threshold_low -= hysteresis
            
            if brightness < threshold_low:
                votes.append(('off', 0.8))
                reasoning.append(f"Brightness {brightness:.1f} < {threshold_low} (lights off)")
            elif brightness > threshold_high:
                votes.append(('on', 0.8))
                reasoning.append(f"Brightness {brightness:.1f} > {threshold_high} (lights on)")
            else:
                # In between - use current state or default to unknown
                if self.current_state:
                    votes.append((self.current_state, 0.3))
                    reasoning.append(f"Brightness {brightness:.1f} in hysteresis zone, maintaining {self.current_state}")
                else:
                    votes.append(('unknown', 0.1))
                    reasoning.append(f"Brightness {brightness:.1f} in uncertain range")
        
        # Method 2: Histogram-based classification
        if 'histogram' in self.config['detection_methods']:
            hist_metrics = metrics.get('histogram_metrics', {})
            if hist_metrics:
                bright_ratio = hist_metrics.get('bright_pixel_ratio', 0)
                
                if bright_ratio > self.config['bright_pixel_ratio_on']:
                    votes.append(('on', 0.7))
                    reasoning.append(f"Bright pixel ratio {bright_ratio:.3f} > {self.config['bright_pixel_ratio_on']} (lights on)")
                elif bright_ratio < self.config['bright_pixel_ratio_off']:
                    votes.append(('off', 0.7))
                    reasoning.append(f"Bright pixel ratio {bright_ratio:.3f} < {self.config['bright_pixel_ratio_off']} (lights off)")
        
        # Method 3: Temporal change analysis
        if 'temporal' in self.config['detection_methods'] and temporal_changes.get('significant_change'):
            change_direction = temporal_changes.get('change_direction')
            brightness_change = temporal_changes.get('brightness_change', 0)
            
            if change_direction == 'increase' and brightness_change > self.config['brightness_change_threshold']:
                votes.append(('on', 0.9))
                reasoning.append(f"Significant brightness increase detected ({brightness_change:.1f})")
            elif change_direction == 'decrease' and abs(brightness_change) > self.config['brightness_change_threshold']:
                votes.append(('off', 0.9))
                reasoning.append(f"Significant brightness decrease detected ({brightness_change:.1f})")
        
        # Combine votes
        if votes:
            # Group votes by state
            state_votes = {}
            for state, confidence in votes:
                if state not in state_votes:
                    state_votes[state] = []
                state_votes[state].append(confidence)
            
            # Calculate weighted average for each state
            state_scores = {}
            for state, confidences in state_votes.items():
                state_scores[state] = np.mean(confidences)
            
            # Choose state with highest score
            best_state = max(state_scores.items(), key=lambda x: x[1])
            classification['state'] = best_state[0]
            classification['confidence'] = best_state[1]
            classification['method_votes'] = state_scores
        
        classification['reasoning'] = reasoning
        return classification
    
    def analyze_frame(self, frame: np.ndarray, timestamp: datetime = None) -> Dict:
        """
        Main method to analyze a frame for lighting conditions
        
        Args:
            frame: Input BGR frame
            timestamp: Optional timestamp for the frame
            
        Returns:
            Dictionary with complete analysis results
        """
        if timestamp is None:
            timestamp = datetime.now()
        
        # Preprocess frame
        processed_frame = self.preprocess_frame(frame)
        
        # Calculate metrics
        brightness_metrics = self.calculate_brightness_metrics(
            processed_frame, 
            self.config.get('roi_regions')
        )
        
        histogram_metrics = self.calculate_histogram_metrics(processed_frame)
        
        temporal_changes = self.detect_temporal_changes(brightness_metrics)
        
        # Combine all metrics
        all_metrics = {
            **brightness_metrics,
            'histogram_metrics': histogram_metrics,
            'temporal_changes': temporal_changes
        }
        
        # Classify lighting state
        classification = self.classify_lighting_state(all_metrics, temporal_changes)
        
        # Update state tracking
        previous_state = self.current_state
        new_state = classification['state']
        
        if new_state != 'unknown':
            if previous_state != new_state:
                # State change detected
                if self.frames_in_current_state >= self.config['stability_frames']:
                    # Confirmed state change
                    self.current_state = new_state
                    self.last_state_change = timestamp
                    self.frames_in_current_state = 1
                    self.detection_stats['state_changes_detected'] += 1
                    
                    # Update timing statistics
                    if new_state == 'on':
                        self.detection_stats['last_on_time'] = timestamp
                    elif new_state == 'off':
                        self.detection_stats['last_off_time'] = timestamp
                else:
                    # Not enough stability, increment counter
                    self.frames_in_current_state += 1
            else:
                # Same state, reset stability counter
                self.frames_in_current_state = 0
        
        # Update statistics
        self.detection_stats['total_frames_analyzed'] += 1
        
        # Compile results
        results = {
            'timestamp': timestamp.isoformat(),
            'lighting_state': self.current_state,
            'state_confidence': classification['confidence'],
            'state_changed': previous_state != self.current_state and self.current_state is not None,
            'previous_state': previous_state,
            'metrics': all_metrics,
            'classification': classification,
            'detection_stats': self.detection_stats.copy()
        }
        
        return results
    
    def get_roi_suggestion(self, frame: np.ndarray, num_regions: int = 4) -> List[Tuple[int, int, int, int]]:
        """
        Suggest ROI regions for light detection based on frame analysis
        
        Args:
            frame: Input frame
            num_regions: Number of ROI regions to suggest
            
        Returns:
            List of (x1, y1, x2, y2) tuples
        """
        height, width = frame.shape[:2]
        
        # Default regions focusing on common light locations
        suggestions = []
        
        # Top center (ceiling lights)
        suggestions.append((width//4, 0, 3*width//4, height//4))
        
        # Top corners (corner lamps)
        suggestions.append((0, 0, width//3, height//3))
        suggestions.append((2*width//3, 0, width, height//3))
        
        # Center regions (general illumination)
        suggestions.append((width//3, height//3, 2*width//3, 2*height//3))
        
        return suggestions[:num_regions]
    
    def reset_state(self):
        """Reset the detector state"""
        self.current_state = None
        self.brightness_history = []
        self.histogram_history = []
        self.state_confidence = 0.0
        self.frames_in_current_state = 0
        self.last_state_change = None
        
        # Reset statistics
        self.detection_stats = {
            'total_frames_analyzed': 0,
            'state_changes_detected': 0,
            'lights_on_duration': 0,
            'lights_off_duration': 0,
            'last_on_time': None,
            'last_off_time': None
        }
        
        logger.info("Light detector state reset")


# Utility functions for integration with existing system

def create_light_detector_config() -> Dict:
    """
    Create a light detector configuration with balanced thresholds suitable for most environments
    
    Returns:
        Configuration dictionary
    """
    # Load day/night specific thresholds from database if available
    config = load_day_night_light_config()
    
    if config is None:
        # Use balanced thresholds that work well in most environments
        config = {
            'brightness_threshold_low': 50,    # Balanced for most lighting conditions
            'brightness_threshold_high': 120,  # Balanced for most lighting conditions
            'brightness_hysteresis': 15,       # Prevent flickering
            'bright_pixel_ratio_on': 0.15,    # Balanced ratio for light detection
            'bright_pixel_ratio_off': 0.05,   # Balanced ratio for dark detection
            'temporal_window_size': 5,         # Look at last 5 frames
            'brightness_change_threshold': 30,  # Significant change threshold
            'stability_frames': 3,             # Frames needed to confirm change
            'resize_for_analysis': True,       # Resize for performance
            'analysis_width': 320,             # Standard analysis width
            'detection_methods': ['brightness', 'histogram', 'temporal']  # Use all methods
        }
    
    return config


def load_day_night_light_config() -> Dict:
    """
    Load day/night specific light detection configuration from database
    
    Returns:
        Configuration dictionary or None if not available
    """
    try:
        import mysql.connector
        from datetime import datetime
        
        # Database configuration
        db_config = {
            'host': 'localhost',
            'user': 'root',
            'password': '',
            'database': 'owl_security'
        }
        
        # Determine if it's day or night based on current time
        current_hour = datetime.now().hour
        is_day = 6 <= current_hour < 20  # Consider 6AM-8PM as day
        section = 'day' if is_day else 'night'
        
        # Connect to database
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get threshold configuration for current time period
        cursor.execute("""
            SELECT brightness_threshold_low, brightness_threshold_high, 
                   bright_pixel_ratio_on, bright_pixel_ratio_off,
                   threshold_configured
            FROM light_detection_thresholds 
            WHERE section = %s AND threshold_configured = TRUE
        """, (section,))
        
        threshold_result = cursor.fetchone()
        
        if threshold_result:
            logger.info(f"Loaded {section} light detection thresholds from database")
            
            config = {
                'brightness_threshold_low': threshold_result['brightness_threshold_low'],
                'brightness_threshold_high': threshold_result['brightness_threshold_high'],
                'bright_pixel_ratio_on': float(threshold_result['bright_pixel_ratio_on']),
                'bright_pixel_ratio_off': float(threshold_result['bright_pixel_ratio_off']),
                'brightness_hysteresis': 15,
                'temporal_window_size': 5,
                'brightness_change_threshold': 25,
                'stability_frames': 3,
                'resize_for_analysis': True,
                'analysis_width': 320,
                'detection_methods': ['brightness', 'histogram', 'temporal'],
                'section': section  # Store which section is being used
            }
            
            cursor.close()
            conn.close()
            return config
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error loading day/night light config: {e}")
    
    return None


def get_current_light_config() -> Dict:
    """
    Get the current light detection configuration based on time of day
    
    Returns:
        Configuration dictionary
    """
    return load_day_night_light_config() or create_light_detector_config()


def detect_light_state_simple(frame: np.ndarray, threshold: float = 100.0) -> Tuple[str, float]:
    """
    Simple light detection function for quick integration
    
    Args:
        frame: Input BGR frame
        threshold: Brightness threshold (0-255)
        
    Returns:
        Tuple of (state, brightness) where state is 'on' or 'off'
    """
    # Convert to grayscale and calculate mean brightness
    if len(frame.shape) == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame
    
    brightness = np.mean(gray)
    state = 'on' if brightness > threshold else 'off'
    
    return state, brightness 