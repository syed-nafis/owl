#!/usr/bin/env python3
"""
Calculate Light Detection Thresholds
Analyzes light reference images to determine optimal thresholds for day/night light detection
"""

import cv2
import numpy as np
import json
import sys
import os
import logging
from typing import Dict, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def analyze_image_brightness(image_path: str) -> Dict:
    """
    Analyze brightness metrics of an image
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Dictionary with brightness metrics
    """
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Calculate basic brightness metrics
        metrics = {
            'mean_brightness': float(np.mean(gray)),
            'median_brightness': float(np.median(gray)),
            'std_brightness': float(np.std(gray)),
            'min_brightness': float(np.min(gray)),
            'max_brightness': float(np.max(gray)),
            'image_shape': gray.shape
        }
        
        # Calculate brightness distribution
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
        
        # Normalize histogram
        hist_normalized = hist / gray.size
        
        # Calculate percentiles
        metrics['brightness_p25'] = float(np.percentile(gray, 25))
        metrics['brightness_p75'] = float(np.percentile(gray, 75))
        metrics['brightness_p95'] = float(np.percentile(gray, 95))
        
        # Calculate pixel ratios for different brightness ranges
        dark_pixels = np.sum(gray < 85)
        mid_pixels = np.sum((gray >= 85) & (gray < 170))
        bright_pixels = np.sum(gray >= 170)
        total_pixels = gray.size
        
        metrics['dark_pixel_ratio'] = dark_pixels / total_pixels
        metrics['mid_pixel_ratio'] = mid_pixels / total_pixels
        metrics['bright_pixel_ratio'] = bright_pixels / total_pixels
        
        # Calculate brightness for different thresholds
        for threshold in [120, 140, 160, 180, 200]:
            ratio = np.sum(gray > threshold) / total_pixels
            metrics[f'pixels_above_{threshold}'] = ratio
        
        logger.info(f"Image analysis for {os.path.basename(image_path)}: "
                   f"Mean={metrics['mean_brightness']:.1f}, "
                   f"Bright ratio={metrics['bright_pixel_ratio']:.3f}")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error analyzing image {image_path}: {e}")
        raise

def calculate_optimal_thresholds(lights_on_metrics: Dict, lights_off_metrics: Dict, section: str) -> Dict:
    """
    Calculate optimal thresholds based on lights on/off image analysis
    
    Args:
        lights_on_metrics: Brightness metrics for lights-on image
        lights_off_metrics: Brightness metrics for lights-off image
        section: 'day' or 'night' section
        
    Returns:
        Dictionary with calculated thresholds
    """
    try:
        # Calculate the difference in brightness metrics
        brightness_diff = lights_on_metrics['mean_brightness'] - lights_off_metrics['mean_brightness']
        bright_pixel_diff = lights_on_metrics['bright_pixel_ratio'] - lights_off_metrics['bright_pixel_ratio']
        
        logger.info(f"Brightness difference analysis for {section}:")
        logger.info(f"  Mean brightness diff: {brightness_diff:.1f}")
        logger.info(f"  Bright pixel ratio diff: {bright_pixel_diff:.3f}")
        
        # Base thresholds depending on section and brightness difference
        if section == 'day':
            # Daytime typically has higher ambient light
            base_low = max(30, lights_off_metrics['mean_brightness'] + brightness_diff * 0.2)
            base_high = min(200, lights_off_metrics['mean_brightness'] + brightness_diff * 0.7)
        else:  # night
            # Nighttime has lower ambient light, more sensitive detection
            base_low = max(15, lights_off_metrics['mean_brightness'] + brightness_diff * 0.15)
            base_high = min(150, lights_off_metrics['mean_brightness'] + brightness_diff * 0.6)
        
        # Adjust based on the actual brightness difference
        if brightness_diff < 30:
            # Small difference, need more sensitive detection
            threshold_low = max(base_low - 10, 10)
            threshold_high = max(base_high - 15, 25)
        elif brightness_diff > 100:
            # Large difference, can be less sensitive
            threshold_low = min(base_low + 10, 80)
            threshold_high = min(base_high + 20, 180)
        else:
            # Normal difference
            threshold_low = base_low
            threshold_high = base_high
        
        # Calculate bright pixel ratios
        bright_pixel_ratio_off = max(0.01, lights_off_metrics['bright_pixel_ratio'])
        bright_pixel_ratio_on = min(0.95, lights_on_metrics['bright_pixel_ratio'])
        
        # Ensure minimum separation between on/off ratios
        if bright_pixel_ratio_on - bright_pixel_ratio_off < 0.05:
            bright_pixel_ratio_on = bright_pixel_ratio_off + 0.05
        
        # Final adjustments to ensure reasonable values
        threshold_low = max(10, min(threshold_low, 100))
        threshold_high = max(threshold_low + 15, min(threshold_high, 220))
        
        result = {
            'brightness_threshold_low': int(round(threshold_low)),
            'brightness_threshold_high': int(round(threshold_high)),
            'bright_pixel_ratio_on': round(bright_pixel_ratio_on, 3),
            'bright_pixel_ratio_off': round(bright_pixel_ratio_off, 3),
            'analysis': {
                'lights_on_brightness': round(lights_on_metrics['mean_brightness'], 1),
                'lights_off_brightness': round(lights_off_metrics['mean_brightness'], 1),
                'brightness_difference': round(brightness_diff, 1),
                'bright_pixel_difference': round(bright_pixel_diff, 3),
                'section': section
            }
        }
        
        logger.info(f"Calculated thresholds for {section}:")
        logger.info(f"  Low threshold: {result['brightness_threshold_low']}")
        logger.info(f"  High threshold: {result['brightness_threshold_high']}")
        logger.info(f"  Bright pixel ratio (on): {result['bright_pixel_ratio_on']}")
        logger.info(f"  Bright pixel ratio (off): {result['bright_pixel_ratio_off']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error calculating thresholds: {e}")
        raise

def main():
    """
    Main function to calculate light detection thresholds
    """
    if len(sys.argv) != 4:
        print(json.dumps({
            'error': 'Usage: python calculate_light_thresholds.py <lights_on_image> <lights_off_image> <section>'
        }))
        sys.exit(1)
    
    lights_on_image = sys.argv[1]
    lights_off_image = sys.argv[2]
    section = sys.argv[3]
    
    try:
        # Validate inputs
        if not os.path.exists(lights_on_image):
            raise ValueError(f"Lights-on image not found: {lights_on_image}")
        
        if not os.path.exists(lights_off_image):
            raise ValueError(f"Lights-off image not found: {lights_off_image}")
        
        if section not in ['day', 'night']:
            raise ValueError(f"Invalid section: {section}. Must be 'day' or 'night'")
        
        # Analyze both images
        logger.info(f"Analyzing lights-on image: {lights_on_image}")
        lights_on_metrics = analyze_image_brightness(lights_on_image)
        
        logger.info(f"Analyzing lights-off image: {lights_off_image}")
        lights_off_metrics = analyze_image_brightness(lights_off_image)
        
        # Calculate optimal thresholds
        logger.info(f"Calculating thresholds for {section} section")
        thresholds = calculate_optimal_thresholds(lights_on_metrics, lights_off_metrics, section)
        
        # Output results as JSON
        print(json.dumps(thresholds, indent=2))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'section': section if 'section' in locals() else 'unknown'
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main() 