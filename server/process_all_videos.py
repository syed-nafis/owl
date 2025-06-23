#!/usr/bin/env python3
import os
import sys
import mysql.connector
import logging
from video_processor import process_single_video, init_face_detection, load_known_faces

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'owl_security'
}

def get_processed_videos():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT filename FROM videos WHERE processed = TRUE")
        processed = {row['filename'] for row in cursor.fetchall()}
        cursor.close()
        conn.close()
        return processed
    except Exception as e:
        logger.error(f"Error getting processed videos: {e}")
        return set()

def main():
    # Initialize face detection
    if not init_face_detection():
        logger.error("Failed to initialize face detection")
        sys.exit(1)
    
    # Load known faces
    load_known_faces()
    
    # Get list of already processed videos
    processed_videos = get_processed_videos()
    
    # Get all videos in the videos directory
    videos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'videos')
    video_files = [f for f in os.listdir(videos_dir) 
                   if f.endswith('.mp4') and not f.startswith('.')]
    
    total_videos = len(video_files)
    logger.info(f"Found {total_videos} videos to process")
    
    # Process each video
    for idx, video_file in enumerate(video_files, 1):
        if video_file in processed_videos:
            logger.info(f"[{idx}/{total_videos}] Skipping already processed video: {video_file}")
            continue
            
        video_path = os.path.join(videos_dir, video_file)
        logger.info(f"[{idx}/{total_videos}] Processing video: {video_file}")
        
        try:
            # Get camera role from filename
            camera_role = "unknown"
            if "recording" in video_file:
                camera_role = "recording"
            elif "segment" in video_file:
                camera_role = "segment"
            
            # Process the video
            video_id = process_single_video(video_path, camera_role)
            
            if video_id:
                logger.info(f"Successfully processed video {video_file} with ID: {video_id}")
            else:
                logger.error(f"Failed to process video: {video_file}")
        except Exception as e:
            logger.error(f"Error processing video {video_file}: {e}")

if __name__ == "__main__":
    main()
