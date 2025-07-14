#!/usr/bin/env python3
"""
Video face recognition test script.
Tests face recognition on a video file and saves frames when faces are recognized.
"""

import os
import cv2
import numpy as np
import logging
import time
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import our face recognition module
try:
    from mediapipe_face import (
        init_face_recognition, 
        detect_faces, 
        align_face,
        recognize_face,
        load_known_faces_from_db,
        RECOGNITION_THRESHOLD
    )
except ImportError:
    logger.error("Failed to import mediapipe_face module. Make sure it's in the same directory.")
    exit(1)

def process_video(video_path: str, output_dir: str, 
                 frame_interval: int = 30, 
                 recognition_threshold: float = RECOGNITION_THRESHOLD,
                 use_motion_detection: bool = True,
                 motion_threshold: float = 0.02,  # Motion sensitivity (0.01-0.05 typical)
                 min_frame_gap: int = 5) -> None:
    """
    Process video for face recognition with motion-based frame downsampling
    
    Args:
        video_path: Path to the video file
        output_dir: Directory to save output frames
        frame_interval: Maximum interval between processed frames
        recognition_threshold: Threshold for face recognition
        use_motion_detection: Whether to use motion-based frame selection
        motion_threshold: Minimum fraction of pixels that must change to trigger processing
        min_frame_gap: Minimum frames to skip after processing a frame
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Initialize face recognition
    if not init_face_recognition():
        logger.error("Failed to initialize face recognition")
        return
        
    # Load known faces from database
    if not load_known_faces_from_db():
        logger.error("Failed to load known faces from database")
        return
    
    # Open video file
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Failed to open video file: {video_path}")
        return
        
    # Video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    logger.info(f"Video properties: {width}x{height}, {fps} fps, {frame_count} total frames")
    
    # Recognition results
    recognition_results = {}
    frame_idx = 0
    recognized_count = 0
    processed_count = 0
    
    # Motion detection variables
    prev_frame = None
    last_processed_frame = -min_frame_gap  # Force processing the first frame
    
    # Process frames
    start_time = time.time()
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Determine whether to process this frame
        process_this_frame = False
        motion_score = 0
        
        # Apply motion-based downsampling if enabled
        if use_motion_detection:
            # Convert current frame to grayscale and resize for motion detection
            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            small_frame = cv2.resize(gray_frame, (0, 0), fx=0.25, fy=0.25)
            
            # Check for motion if we have a previous frame
            if prev_frame is not None and frame_idx - last_processed_frame >= min_frame_gap:
                # Calculate absolute difference between current and previous frame
                frame_diff = cv2.absdiff(small_frame, prev_frame)
                
                # Apply threshold to get significant changes
                _, thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)
                
                # Calculate fraction of pixels that changed
                motion_score = np.count_nonzero(thresh) / thresh.size
                
                # Process frame if motion exceeds threshold or if we haven't processed a frame in a while
                if motion_score > motion_threshold or frame_idx - last_processed_frame >= frame_interval:
                    process_this_frame = True
                    last_processed_frame = frame_idx
                    
                    if motion_score > motion_threshold:
                        logger.info(f"Motion detected in frame {frame_idx} (score: {motion_score:.4f})")
            elif frame_idx == 0 or frame_idx - last_processed_frame >= frame_interval:
                # Always process first frame or if max interval reached
                process_this_frame = True
                last_processed_frame = frame_idx
            
            # Store current frame for next iteration
            prev_frame = small_frame
        else:
            # Original behavior: process every Nth frame
            process_this_frame = (frame_idx % frame_interval == 0)
            
        if not process_this_frame:
            frame_idx += 1
            continue
        
        # Increment processed frames counter
        processed_count += 1
        
        # Progress indicator
        if frame_idx % (frame_interval * 10) == 0 or process_this_frame:
            progress = frame_idx / frame_count * 100
            elapsed = time.time() - start_time
            remaining = (elapsed / (frame_idx + 1)) * (frame_count - frame_idx)
            logger.info(f"Processing frame {frame_idx}/{frame_count} ({progress:.1f}%), "
                       f"ETA: {remaining:.1f}s" + 
                       (f", Motion: {motion_score:.4f}" if use_motion_detection else ""))
            
        # Detect faces
        faces = detect_faces(frame)
        
        # Process each face
        for face_idx, face in enumerate(faces):
            # Get embedding
            embedding = face['embedding']
            
            # Recognize face
            recognition = recognize_face(embedding, threshold=recognition_threshold)
            name = recognition['name']
            similarity = recognition['similarity']
            
            # Skip unknown faces
            if name == "Unknown":
                continue
                
            # Draw rectangle and text
            bbox = face['bbox']
            x1, y1, x2, y2 = bbox
            
            result_frame = frame.copy()
            cv2.rectangle(result_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Add text with name and similarity
            text = f"{name} ({similarity:.2f})"
            cv2.putText(result_frame, text, (x1, y1 - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                       
            # Save face alignment comparison
            aligned_face = face['aligned_face']
            face_img = face['face_image']
            
            # Create side-by-side comparison
            comparison = np.hstack([
                cv2.resize(face_img, (224, 224)),
                cv2.resize(aligned_face, (224, 224))
            ])
            
            # Add labels
            cv2.putText(comparison, "Original", (20, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(comparison, "Aligned", (224 + 20, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Save results
            timestamp = frame_idx / fps
            minutes = int(timestamp / 60)
            seconds = int(timestamp % 60)
            
            # Save frame with recognition
            output_filename = f"frame_{frame_idx:06d}_{name}_{similarity:.2f}_{minutes:02d}m{seconds:02d}s.jpg"
            output_path = os.path.join(output_dir, output_filename)
            cv2.imwrite(output_path, result_frame)
            
            # Save face comparison
            comparison_filename = f"comparison_{frame_idx:06d}_{name}_{similarity:.2f}.jpg"
            comparison_path = os.path.join(output_dir, comparison_filename)
            cv2.imwrite(comparison_path, comparison)
            
            # Save recognized time for reporting
            if name not in recognition_results:
                recognition_results[name] = []
            
            recognition_results[name].append({
                'frame': frame_idx,
                'time': f"{minutes:02d}:{seconds:02d}",
                'similarity': similarity,
                'image': output_filename
            })
            
            logger.info(f"Frame {frame_idx}: Recognized {name} with similarity {similarity:.4f}")
            recognized_count += 1
        
        frame_idx += 1
    
    # Release video capture
    cap.release()
    
    # Generate HTML report
    generate_html_report(recognition_results, output_dir, video_path)
    
    # Log summary
    total_time = time.time() - start_time
    processing_efficiency = 100 - (processed_count / frame_count * 100)
    
    logger.info(f"Processing complete. Total time: {total_time:.2f}s")
    logger.info(f"Total frames in video: {frame_count}")
    logger.info(f"Frames processed: {processed_count} ({processed_count/frame_count*100:.1f}% of total)")
    logger.info(f"Frames skipped: {frame_count - processed_count} ({processing_efficiency:.1f}% efficiency gain)")
    logger.info(f"Recognized {recognized_count} faces")
    logger.info(f"Found {len(recognition_results)} unique identities")
    for name, instances in recognition_results.items():
        logger.info(f"  {name}: {len(instances)} instances")

def generate_html_report(recognition_results: Dict[str, List[Dict]], 
                        output_dir: str, video_path: str) -> None:
    """Generate HTML report of recognition results"""
    report_path = os.path.join(output_dir, "recognition_report.html")
    
    with open(report_path, "w") as f:
        # Write HTML header
        f.write("""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Face Recognition Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1, h2 { color: #333; }
                .person { margin-bottom: 30px; }
                .instances { display: flex; flex-wrap: wrap; gap: 10px; }
                .instance { 
                    border: 1px solid #ddd; 
                    padding: 10px; 
                    border-radius: 5px;
                    width: 300px;
                }
                .instance img { max-width: 100%; }
                .timestamp { font-weight: bold; }
                .similarity { color: green; }
                .summary { margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>Face Recognition Report</h1>
        """)
        
        # Write summary
        video_name = os.path.basename(video_path)
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"""
            <div class="summary">
                <p><strong>Video:</strong> {video_name}</p>
                <p><strong>Date:</strong> {current_time}</p>
                <p><strong>Total identities:</strong> {len(recognition_results)}</p>
            </div>
        """)
        
        # Write results for each person
        for name, instances in recognition_results.items():
            f.write(f"""
                <div class="person">
                    <h2>{name}</h2>
                    <p>Found in {len(instances)} frames</p>
                    <div class="instances">
            """)
            
            # Show up to 10 instances
            for instance in instances[:10]:
                frame = instance['frame']
                time = instance['time']
                similarity = instance['similarity']
                image = instance['image']
                image_path = os.path.join(".", image)  # relative path
                
                f.write(f"""
                    <div class="instance">
                        <img src="{image_path}" alt="{name} at {time}">
                        <p><span class="timestamp">Frame {frame} (Time: {time})</span><br>
                        Similarity: <span class="similarity">{similarity:.4f}</span></p>
                    </div>
                """)
            
            f.write("""
                    </div>
                </div>
            """)
        
        # Write HTML footer
        f.write("""
        </body>
        </html>
        """)
    
    logger.info(f"Generated HTML report: {report_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test face recognition on a video file")
    parser.add_argument("--video", "-v", type=str, default="server/test_video.mp4", 
                        help="Path to the video file")
    parser.add_argument("--output", "-o", type=str, default="server/video_recognition_results", 
                        help="Directory to save output frames")
    parser.add_argument("--interval", "-i", type=int, default=30, 
                        help="Process every Nth frame (default: 30)")
    parser.add_argument("--threshold", "-t", type=float, default=RECOGNITION_THRESHOLD, 
                        help=f"Recognition similarity threshold (default: {RECOGNITION_THRESHOLD})")
    parser.add_argument("--use-motion", "-m", action="store_true", default=True,
                        help="Use motion-based frame selection (default: True)")
    parser.add_argument("--motion-threshold", type=float, default=0.02,
                        help="Motion detection threshold (default: 0.02, 0.01-0.05 typical)")
    parser.add_argument("--min-gap", type=int, default=5,
                        help="Minimum frames between processing (default: 5)")
    
    args = parser.parse_args()
    
    process_video(args.video, args.output, args.interval, args.threshold,
                 args.use_motion, args.motion_threshold, args.min_gap) 