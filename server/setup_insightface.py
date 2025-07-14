#!/usr/bin/env python3
"""
Setup script to download InsightFace models
"""
import os
import sys
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def download_insightface_models():
    """Download and set up InsightFace models"""
    try:
        import insightface
        from insightface.app import FaceAnalysis
        
        # Create model directory
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
        os.makedirs(model_path, exist_ok=True)
        
        logger.info(f"Downloading InsightFace models to: {model_path}")
        logger.info("This may take a few minutes depending on your internet connection...")
        
        # Initialize with buffalo_l for better accuracy
        # This will automatically download the model if it's not present
        app = FaceAnalysis(name='buffalo_l', root=model_path)
        app.prepare(ctx_id=-1)  # CPU context
        
        logger.info("InsightFace models downloaded successfully!")
        logger.info("Face recognition system is ready to use.")
        return True
    except Exception as e:
        logger.error(f"Error downloading InsightFace models: {e}")
        return False

if __name__ == "__main__":
    print("Starting InsightFace setup...")
    if download_insightface_models():
        print("Setup completed successfully!")
    else:
        print("Setup failed. Please check the error messages above.")
        sys.exit(1) 