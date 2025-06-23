#!/usr/bin/env python3
import cv2
import time
import os
import socket
import argparse
import requests
import socketio
from flask import Flask, Response, jsonify
import threading
import numpy as np
import datetime
from picamera2 import Picamera2
import shutil
import logging
import queue
import json

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_SERVER_URL = 'http://192.168.0.102:9000'  # Your Mac running the home server
DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720
DEFAULT_FRAMERATE = 30
DEFAULT_PORT = 8000
DEFAULT_SEGMENT_MINUTES = 2
DEFAULT_FORMAT = 'mp4'  # Video format: mp4 is good for ML processing
MAX_LOCAL_STORAGE_GB = 2  # Maximum local storage in GB before cleanup

# Initialize Flask app
app = Flask(__name__)
sio = socketio.Client(reconnection=True)

# Global variables
camera = None
recording = False
stream_active = False
connected_to_server = False
recording_thread = None
upload_thread = None
server_url = DEFAULT_SERVER_URL
upload_queue = queue.Queue()
local_storage_path = None

# Camera status
status = {
    'online': True,
    'streaming': False,
    'recording': False,
    'server_connected': False,
    'current_segment': None,
    'segments_recorded': 0,
    'segments_uploaded': 0,
    'last_upload_time': None,
    'disk_usage': {'total': '0GB', 'used': '0GB', 'free': '0GB'}
}

# Initialize camera
def init_camera(width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT, framerate=DEFAULT_FRAMERATE):
    global camera
    try:
        # Initialize the Picamera2 (newer Raspberry Pi camera library)
        camera = Picamera2()
        
        # Configure the camera
        config = camera.create_video_configuration(
            main={"size": (width, height), "format": "RGB888"},
            controls={"FrameRate": framerate}
        )
        camera.configure(config)
        camera.start()
        
        # Wait for camera to warm up
        time.sleep(2)
        
        logger.info(f"Camera initialized: {width}x{height} @ {framerate}fps")
        return True
    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return False

# Connect to the central server
def connect_to_server():
    global connected_to_server, server_url, status
    
    try:
        sio.connect(server_url, wait_timeout=10)
        connected_to_server = True
        status['server_connected'] = True
        
        # Tell the server that this Pi camera is online
        sio.emit('pi-connect', {
            'hostname': socket.gethostname(),
            'ip': get_local_ip(),
            'timestamp': time.time()
        })
        
        logger.info(f"Connected to server: {server_url}")
        return True
    except Exception as e:
        logger.error(f"Server connection error: {e}")
        connected_to_server = False
        status['server_connected'] = False
        
        # Try reconnecting in the background
        threading.Thread(target=reconnect_to_server, daemon=True).start()
        return False

# Reconnection logic
def reconnect_to_server():
    global connected_to_server, server_url, status
    
    retry_delay = 5  # Start with 5 seconds delay
    max_delay = 60   # Maximum 1 minute between retries
    
    while not connected_to_server:
        logger.info(f"Attempting to reconnect to server in {retry_delay} seconds...")
        time.sleep(retry_delay)
        
        try:
            sio.connect(server_url, wait_timeout=10)
            connected_to_server = True
            status['server_connected'] = True
            
            # Tell the server that this Pi camera is back online
            sio.emit('pi-connect', {
                'hostname': socket.gethostname(),
                'ip': get_local_ip(),
                'timestamp': time.time(),
                'reconnected': True
            })
            
            logger.info(f"Reconnected to server: {server_url}")
            
            # If recording was interrupted, attempt to restart
            if status['recording'] and not recording:
                logger.info("Restarting recording after reconnection...")
                start_continuous_recording()
                
            break
        except Exception as e:
            logger.error(f"Reconnection failed: {e}")
            connected_to_server = False
            status['server_connected'] = False
            
            # Exponential backoff for retries (up to max_delay)
            retry_delay = min(retry_delay * 1.5, max_delay)

# Get local IP address
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# Check disk space
def check_disk_space(path="."):
    try:
        total, used, free = shutil.disk_usage(path)
        
        # Convert to GB
        total_gb = total / (1024 * 1024 * 1024)
        used_gb = used / (1024 * 1024 * 1024)
        free_gb = free / (1024 * 1024 * 1024)
        
        status['disk_usage'] = {
            'total': f"{total_gb:.2f}GB",
            'used': f"{used_gb:.2f}GB",
            'free': f"{free_gb:.2f}GB"
        }
        
        return free_gb > 0.5  # Return True if at least 500MB free
    except Exception as e:
        logger.error(f"Error checking disk space: {e}")
        return True  # Assume space is available if check fails

# Clean up old recordings
def cleanup_old_recordings():
    try:
        if not os.path.exists(local_storage_path):
            return
            
        # Get all mp4 files in recordings directory
        files = [os.path.join(local_storage_path, f) for f in os.listdir(local_storage_path)
                if f.endswith('.mp4')]
        
        # Sort by creation time (oldest first)
        files.sort(key=lambda x: os.path.getctime(x))
        
        # Calculate total size
        total_size = sum(os.path.getsize(f) for f in files)
        max_size_bytes = MAX_LOCAL_STORAGE_GB * 1024 * 1024 * 1024
        
        # Delete oldest files until under the limit
        deleted_count = 0
        for file in files:
            if total_size <= max_size_bytes:
                break
                
            # Skip file if it's currently being uploaded
            if file == status.get('current_segment'):
                continue
                
            # Check if the file has been uploaded
            if os.path.exists(file + '.uploaded'):
                file_size = os.path.getsize(file)
                os.remove(file)
                if os.path.exists(file + '.uploaded'):
                    os.remove(file + '.uploaded')
                total_size -= file_size
                deleted_count += 1
                
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} old recordings")
            
    except Exception as e:
        logger.error(f"Error cleaning up old recordings: {e}")

# Generate camera frames
def generate_frames():
    while stream_active:
        try:
            if camera is None:
                time.sleep(0.1)
                continue
            
            # Capture a frame
            frame = camera.capture_array()
            
            # Convert to BGR (OpenCV format)
            if frame.shape[2] == 3:  # RGB
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            
            # Add timestamp
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, timestamp, (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Encode frame as JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                continue
            
            # Convert to bytes and yield for streaming
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            # Small delay to maintain framerate
            time.sleep(1.0/DEFAULT_FRAMERATE)
            
        except Exception as e:
            logger.error(f"Error generating frame: {e}")
            time.sleep(0.1)

# Start continuous recording with segments
def start_continuous_recording(segment_minutes=DEFAULT_SEGMENT_MINUTES):
    global recording, recording_thread, upload_thread, status
    
    if recording:
        return False
    
    # Ensure the output folder exists
    os.makedirs(local_storage_path, exist_ok=True)
    
    # Start recording
    recording = True
    status['recording'] = True
    
    # Start the recording thread
    recording_thread = threading.Thread(
        target=continuous_recording_thread,
        args=(segment_minutes,)
    )
    recording_thread.daemon = True
    recording_thread.start()
    
    # Start the upload thread if not already running
    if upload_thread is None or not upload_thread.is_alive():
        upload_thread = threading.Thread(
            target=upload_worker,
            daemon=True
        )
        upload_thread.start()
    
    logger.info(f"Continuous recording started with {segment_minutes}-minute segments")
    return True

# Thread function for continuous segmented recording
def continuous_recording_thread(segment_minutes):
    global camera, recording, status
    
    segment_seconds = segment_minutes * 60
    
    try:
        while recording:
            # Check disk space
            if not check_disk_space():
                logger.warning("Low disk space. Cleaning up old recordings...")
                cleanup_old_recordings()
                if not check_disk_space():
                    logger.error("Critically low disk space! Pausing recording.")
                    time.sleep(30)  # Wait and try again
                    continue
            
            # Generate a filename with timestamp
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = os.path.join(local_storage_path, f"segment_{timestamp}.mp4")
            
            status['current_segment'] = output_file
            status['segments_recorded'] += 1
            
            logger.info(f"Starting segment: {output_file}")
            
            # Set up video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(
                output_file,
                fourcc,
                DEFAULT_FRAMERATE,
                (DEFAULT_WIDTH, DEFAULT_HEIGHT)
            )
            
            # Record for segment_seconds or until recording is stopped
            start_time = time.time()
            frames_count = 0
            
            while recording and (time.time() - start_time) < segment_seconds:
                # Capture a frame
                frame = camera.capture_array()
                
                # Convert to BGR (OpenCV format) if needed
                if frame.shape[2] == 3:  # RGB
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                    
                # Add timestamp
                timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cv2.putText(frame, timestamp, (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Write frame to video
                out.write(frame)
                frames_count += 1
                
                # Sleep to maintain framerate
                time.sleep(1.0/DEFAULT_FRAMERATE)
            
            # Close the video writer
            out.release()
            
            # If we have frames in the video, add it to upload queue
            if frames_count > 0:
                logger.info(f"Segment completed: {output_file} ({frames_count} frames)")
                upload_queue.put(output_file)
            else:
                # Empty recording, delete it
                if os.path.exists(output_file):
                    os.remove(output_file)
                logger.warning("Empty segment discarded")
                
    except Exception as e:
        logger.error(f"Recording error: {e}")
    finally:
        # Ensure recording flag is reset if this thread exits
        if recording:
            recording = False
            status['recording'] = False
            logger.info("Recording stopped due to error")

# Worker thread for uploading videos
def upload_worker():
    while True:
        try:
            # Get a file from the queue
            file_path = upload_queue.get()
            
            # Check if file exists
            if not os.path.exists(file_path):
                logger.warning(f"File no longer exists: {file_path}")
                upload_queue.task_done()
                continue
                
            # Attempt upload
            success = upload_video(file_path)
            
            if success:
                # Mark file as uploaded for cleanup
                with open(file_path + '.uploaded', 'w') as f:
                    f.write(datetime.datetime.now().isoformat())
                status['segments_uploaded'] += 1
                status['last_upload_time'] = datetime.datetime.now().isoformat()
            else:
                # Re-queue for retry later (at the end of queue)
                logger.warning(f"Upload failed, re-queueing: {file_path}")
                upload_queue.put(file_path)
                
            upload_queue.task_done()
            
            # Prevent overwhelming the server with uploads
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"Upload worker error: {e}")
            time.sleep(5)  # Wait before trying again

# Stop video recording
def stop_recording():
    global recording, status
    
    if not recording:
        return False
    
    recording = False
    status['recording'] = False
    
    # Wait for the recording thread to finish
    if recording_thread and recording_thread.is_alive():
        recording_thread.join(timeout=2.0)
    
    logger.info("Recording stopped")
    return True

# Upload a video file to the server
def upload_video(file_path):
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        return False
    
    try:
        # Check server connection
        if not connected_to_server:
            logger.warning("Server not connected. Queueing file for later upload.")
            return False
        
        logger.info(f"Uploading: {file_path}")
        
        # Add metadata about the segment
        metadata = {
            'timestamp': datetime.datetime.fromtimestamp(
                os.path.getctime(file_path)
            ).isoformat(),
            'duration': 0,  # Calculate actual duration if needed
            'hostname': socket.gethostname(),
            'camera_ip': get_local_ip()
        }
        
        # Create multipart form data with file and metadata
        files = {'video': open(file_path, 'rb')}
        data = {'metadata': json.dumps(metadata)}
        
        # Send to server
        response = requests.post(f"{server_url}/upload-video", files=files, data=data)
        
        if response.status_code == 200:
            logger.info(f"Video uploaded successfully: {file_path}")
            return True
        else:
            logger.error(f"Upload failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return False

# Flask routes
@app.route('/status')
def get_status():
    # Update disk usage info
    check_disk_space()
    
    # Add queue information
    queue_size = upload_queue.qsize()
    
    return jsonify({
        'status': 'online',
        'streaming': stream_active,
        'recording': recording,
        'server_connected': connected_to_server,
        'segments_recorded': status['segments_recorded'],
        'segments_uploaded': status['segments_uploaded'],
        'segments_pending': queue_size,
        'disk_usage': status['disk_usage'],
        'last_upload_time': status['last_upload_time'],
        'timestamp': time.time()
    })

@app.route('/start-stream', methods=['POST'])
def start_stream():
    global stream_active, status
    
    try:
        # Make sure camera is initialized
        if camera is None:
            success = init_camera()
            if not success:
                return jsonify({
                    'success': False,
                    'error': 'Failed to initialize camera'
                })
        
        # Wait for camera to be ready
        time.sleep(0.5)
        
        stream_active = True
        status['streaming'] = True
        
        return jsonify({
            'success': True,
            'message': 'Stream started'
        })
    except Exception as e:
        logger.error(f"Error starting stream: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/stop-stream', methods=['POST'])
def stop_stream():
    global stream_active, status
    
    stream_active = False
    status['streaming'] = False
    
    return jsonify({
        'success': True,
        'message': 'Stream stopped'
    })

@app.route('/start-recording', methods=['POST'])
def api_start_recording():
    success = start_continuous_recording()
    
    return jsonify({
        'success': success,
        'message': 'Continuous recording started' if success else 'Failed to start recording'
    })

@app.route('/stop-recording', methods=['POST'])
def api_stop_recording():
    success = stop_recording()
    
    return jsonify({
        'success': success,
        'message': 'Recording stopped' if success else 'Failed to stop recording'
    })

@app.route('/stream')
def stream():
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

# Capture an image from the camera
@app.route('/capture', methods=['POST'])
def capture_image_endpoint():
    try:
        import json
        from flask import request
        
        # Parse request data
        data = request.json if request.is_json else {}
        name = data.get('name', 'unknown')
        timestamp = data.get('timestamp', datetime.datetime.now().isoformat())
        
        # Create a filename based on name and timestamp
        safe_name = "".join([c if c.isalnum() else "_" for c in name])
        filename = f"capture_{safe_name}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        
        # Create directory paths
        captures_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
        output_path = os.path.join(captures_dir, filename)
        
        # Ensure captures directory exists
        os.makedirs(captures_dir, exist_ok=True)
        
        # Capture the image
        if camera:
            # Capture from the camera
            frame = camera.capture_array()
            
            # Convert to BGR (OpenCV format) if needed
            if frame.shape[2] == 3:  # RGB
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            
            # Write the image locally
            cv2.imwrite(output_path, frame)
            
            logger.info(f"Image captured and saved to {output_path}")
            
            # Upload the image to the main server if connected
            server_image_url = None
            if connected_to_server:
                try:
                    # Send the image to the main server
                    with open(output_path, 'rb') as img_file:
                        files = {'image': (filename, img_file, 'image/jpeg')}
                        metadata = {
                            'name': name,
                            'timestamp': timestamp,
                            'camera_ip': get_local_ip(),
                            'hostname': socket.gethostname()
                        }
                        
                        response = requests.post(
                            f"{server_url}/upload-face-image",
                            files=files,
                            data={'metadata': json.dumps(metadata)}
                        )
                        
                        if response.status_code == 200:
                            result = response.json()
                            server_image_url = result.get('image_url')
                            logger.info(f"Image uploaded to server: {server_image_url}")
                        else:
                            logger.error(f"Failed to upload image to server: {response.status_code}")
                except Exception as e:
                    logger.error(f"Error uploading image to server: {e}")
            
            # Continue video recording if already in progress
            # (No need to interrupt recording, it's a separate process)
            
            # Return success response with path to the image
            return jsonify({
                'success': True,
                'image_url': f'/captures/{filename}',
                'server_image_url': server_image_url,
                'name': name,
                'timestamp': timestamp
            })
        else:
            # Fallback for testing without camera
            logger.warning("Camera not available, creating test image")
            
            # Create a test image
            img = np.zeros((720, 1280, 3), dtype=np.uint8)
            cv2.putText(img, f"Test Image: {name}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(img, f"Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
            # Save the test image
            cv2.imwrite(output_path, img)
            
            logger.info(f"Test image created and saved to {output_path}")
            
            # Simulate server upload
            server_image_url = None
            if connected_to_server:
                try:
                    # Send the image to the main server
                    with open(output_path, 'rb') as img_file:
                        files = {'image': (filename, img_file, 'image/jpeg')}
                        metadata = {
                            'name': name,
                            'timestamp': timestamp,
                            'camera_ip': get_local_ip(),
                            'hostname': socket.gethostname()
                        }
                        
                        response = requests.post(
                            f"{server_url}/upload-face-image",
                            files=files,
                            data={'metadata': json.dumps(metadata)}
                        )
                        
                        if response.status_code == 200:
                            result = response.json()
                            server_image_url = result.get('image_url')
                            logger.info(f"Test image uploaded to server: {server_image_url}")
                except Exception as e:
                    logger.error(f"Error uploading test image to server: {e}")
            
            # Return success response with path to the test image
            return jsonify({
                'success': True,
                'image_url': f'/captures/{filename}',
                'server_image_url': server_image_url,
                'name': name,
                'timestamp': timestamp
            })
    
    except Exception as e:
        logger.error(f"Error capturing image: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Serve static files from captures directory
@app.route('/captures/<path:filename>')
def serve_capture(filename):
    from flask import send_from_directory
    return send_from_directory('captures', filename)

# Socket.IO event handlers
@sio.event
def connect():
    logger.info("Connected to server")
    status['server_connected'] = True

@sio.event
def disconnect():
    logger.info("Disconnected from server")
    status['server_connected'] = False
    
    # Try to reconnect
    threading.Thread(target=reconnect_to_server, daemon=True).start()

@sio.on('start-stream')
def on_start_stream(data):
    global stream_active, status
    logger.info("Received start-stream command from server")
    stream_active = True
    status['streaming'] = True

@sio.on('stop-stream')
def on_stop_stream(data):
    global stream_active, status
    logger.info("Received stop-stream command from server")
    stream_active = False
    status['streaming'] = False

@sio.on('start-recording')
def on_start_recording(data):
    logger.info("Received start-recording command from server")
    segment_minutes = data.get('segment_minutes', DEFAULT_SEGMENT_MINUTES)
    start_continuous_recording(segment_minutes)

@sio.on('stop-recording')
def on_stop_recording(data):
    logger.info("Received stop-recording command from server")
    stop_recording()

# Main function
def main():
    parser = argparse.ArgumentParser(description='Raspberry Pi Camera Server')
    parser.add_argument('--server', default=DEFAULT_SERVER_URL, help='Server URL')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='Local server port')
    parser.add_argument('--width', type=int, default=DEFAULT_WIDTH, help='Video width')
    parser.add_argument('--height', type=int, default=DEFAULT_HEIGHT, help='Video height')
    parser.add_argument('--fps', type=int, default=DEFAULT_FRAMERATE, help='Video framerate')
    parser.add_argument('--segment', type=int, default=DEFAULT_SEGMENT_MINUTES,
                       help='Segment length in minutes')
    
    args = parser.parse_args()
    
    global server_url, local_storage_path
    server_url = args.server
    
    # Create recordings directory
    local_storage_path = os.path.abspath("recordings")
    os.makedirs(local_storage_path, exist_ok=True)
    
    # Initialize camera
    if not init_camera(args.width, args.height, args.fps):
        logger.error("Failed to initialize camera. Exiting.")
        return
    
    # Try to connect to the server
    connect_to_server()
    
    # Start the Flask server
    logger.info(f"Starting Flask server on port {args.port}")
    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=True)

if __name__ == '__main__':
    main()











