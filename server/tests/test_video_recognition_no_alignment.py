#!/usr/bin/env python3
"""
Video face recognition test script WITHOUT face alignment.
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
        recognize_face,
        load_known_faces_from_db,
        RECOGNITION_THRESHOLD
    )
except ImportError:
    logger.error("Failed to import mediapipe_face module. Make sure it's in the same directory.")
    exit(1)

# Import MediaPipe directly for face detection without using our alignment
import mediapipe as mp

# Initialize MediaPipe Face Detection
mp_face_detection = mp.solutions.face_detection
face_detector = mp_face_detection.FaceDetection(
    model_selection=1,  # 0 for short-range, 1 for full-range detection
    min_detection_confidence=0.5
)

# Initialize InsightFace
import insightface
insightface_app = None

def init_insightface():
    """Initialize InsightFace for feature extraction"""
    global insightface_app
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    insightface_app = insightface.app.FaceAnalysis(name='buffalo_l', root=model_path)
    insightface_app.prepare(ctx_id=-1)
    return True

def detect_faces_no_alignment(image: np.ndarray) -> List[Dict]:
    """
    Detect faces without alignment
    
    Args:
        image: Input image in BGR format
        
    Returns:
        List of face dictionaries with bounding box and embedding
    """
    # Convert to RGB for MediaPipe
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Detect faces
    results = face_detector.process(image_rgb)
    
    faces = []
    if results.detections:
        height, width, _ = image.shape
        for detection in results.detections:
            # Get bounding box
            bbox = detection.location_data.relative_bounding_box
            x_min = max(0, int(bbox.xmin * width))
            y_min = max(0, int(bbox.ymin * height))
            width_face = int(bbox.width * width)
            height_face = int(bbox.height * height)
            
            # Add some margin (20%)
            margin_x = int(width_face * 0.2)
            margin_y = int(height_face * 0.2)
            x_min = max(0, x_min - margin_x)
            y_min = max(0, y_min - margin_y)
            width_face = min(width - x_min, width_face + 2 * margin_x)
            height_face = min(height - y_min, height_face + 2 * margin_y)
            
            # Extract face region
            face_img = image[y_min:y_min+height_face, x_min:x_min+width_face]
            
            if face_img.size == 0:
                continue
                
            # Get embeddings directly from InsightFace
            try:
                insight_faces = insightface_app.get(face_img)
                if not insight_faces:
                    continue
                    
                # Use the first face detection
                best_face = insight_faces[0]
                embedding = best_face.normed_embedding
                
                # Create face dictionary
                face_data = {
                    'bbox': (x_min, y_min, x_min+width_face, y_min+height_face),
                    'confidence': float(detection.score[0]),
                    'embedding': embedding,
                    'face_image': face_img
                }
                
                faces.append(face_data)
            except Exception as e:
                logger.error(f"Error getting face embedding: {e}")
    
    return faces

def process_video(video_path: str, output_dir: str, 
                 frame_interval: int = 30, 
                 recognition_threshold: float = RECOGNITION_THRESHOLD) -> None:
    """
    Process video for face recognition without alignment
    
    Args:
        video_path: Path to the video file
        output_dir: Directory to save output frames
        frame_interval: Process every Nth frame
        recognition_threshold: Threshold for face recognition
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Initialize face recognition
    if not init_face_recognition():
        logger.error("Failed to initialize face recognition")
        return
        
    # Initialize InsightFace
    if not init_insightface():
        logger.error("Failed to initialize InsightFace")
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
    
    logger.info(f"Video properties: {width}x{height}, {fps} fps, {frame_count} frames")
    
    # Recognition results
    recognition_results = {}
    frame_idx = 0
    recognized_count = 0
    
    # Process frames
    start_time = time.time()
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # Process every Nth frame
        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue
        
        # Progress indicator
        if frame_idx % (frame_interval * 10) == 0:
            progress = frame_idx / frame_count * 100
            elapsed = time.time() - start_time
            remaining = (elapsed / (frame_idx + 1)) * (frame_count - frame_idx)
            logger.info(f"Processing frame {frame_idx}/{frame_count} ({progress:.1f}%), "
                       f"ETA: {remaining:.1f}s")
            
        # Detect faces WITHOUT alignment
        faces = detect_faces_no_alignment(frame)
        
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
                        
            # Save face image
            face_img = face['face_image']
            
            # Save results
            timestamp = frame_idx / fps
            minutes = int(timestamp / 60)
            seconds = int(timestamp % 60)
            
            # Save frame with recognition
            output_filename = f"frame_{frame_idx:06d}_{name}_{similarity:.2f}_{minutes:02d}m{seconds:02d}s.jpg"
            output_path = os.path.join(output_dir, output_filename)
            cv2.imwrite(output_path, result_frame)
            
            # Save face image
            face_filename = f"face_{frame_idx:06d}_{name}_{similarity:.2f}.jpg"
            face_path = os.path.join(output_dir, face_filename)
            cv2.imwrite(face_path, cv2.resize(face_img, (224, 224)))
            
            # Save recognized time for reporting
            if name not in recognition_results:
                recognition_results[name] = []
            
            recognition_results[name].append({
                'frame': frame_idx,
                'time': f"{minutes:02d}:{seconds:02d}",
                'similarity': similarity,
                'image': output_filename,
                'face_image': face_filename
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
    logger.info(f"Processing complete WITHOUT alignment. Total time: {total_time:.2f}s")
    logger.info(f"Processed {frame_idx} frames, recognized {recognized_count} faces")
    logger.info(f"Found {len(recognition_results)} unique identities")
    for name, instances in recognition_results.items():
        logger.info(f"  {name}: {len(instances)} instances")

def generate_html_report(recognition_results: Dict[str, List[Dict]], 
                        output_dir: str, video_path: str) -> None:
    """Generate HTML report of recognition results"""
    report_path = os.path.join(output_dir, "recognition_report_no_alignment.html")
    
    with open(report_path, "w") as f:
        # Write HTML header
        f.write("""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Face Recognition Report (NO ALIGNMENT)</title>
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
                .note { color: red; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Face Recognition Report (NO ALIGNMENT)</h1>
            <p class="note">This test was run WITHOUT the face alignment step.</p>
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
                face_image = instance['face_image']
                image_path = os.path.join(".", image)  # relative path
                face_path = os.path.join(".", face_image)  # relative path
                
                f.write(f"""
                    <div class="instance">
                        <img src="{image_path}" alt="{name} at {time}">
                        <p><span class="timestamp">Frame {frame} (Time: {time})</span><br>
                        Similarity: <span class="similarity">{similarity:.4f}</span></p>
                        <img src="{face_path}" alt="Face of {name} at {time}" style="width: 112px;">
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
    parser = argparse.ArgumentParser(description="Test face recognition on a video file WITHOUT alignment")
    parser.add_argument("--video", "-v", type=str, default="server/test_video.mp4", 
                        help="Path to the video file")
    parser.add_argument("--output", "-o", type=str, default="server/video_recognition_no_alignment", 
                        help="Directory to save output frames")
    parser.add_argument("--interval", "-i", type=int, default=30, 
                        help="Process every Nth frame (default: 30)")
    parser.add_argument("--threshold", "-t", type=float, default=RECOGNITION_THRESHOLD, 
                        help=f"Recognition similarity threshold (default: {RECOGNITION_THRESHOLD})")
    
    args = parser.parse_args()
    
    process_video(args.video, args.output, args.interval, args.threshold) 