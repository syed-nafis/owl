# Owl Security Face Detection System

This document describes how to set up and use the face detection capabilities in the Owl Security system.

## Overview

The Owl Security system now includes face detection and recognition capabilities, allowing it to:

1. Detect people, faces, animals, and objects in video footage
2. Recognize known faces and track unknown faces
3. Manage access permissions for different areas
4. Send notifications for unauthorized access or unknown visitors

## Requirements

- Python 3.8+ (compatible with Python 3.13)
- Node.js 14+
- MySQL database
- Camera (Raspberry Pi Camera or USB webcam)

## Installation

### Quick Setup

We provide a setup script that handles most of the installation process:

```bash
# Make the setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

The setup script will:
1. Create a Python virtual environment
2. Install required Python packages
3. Install Node.js dependencies
4. Set up the MySQL database
5. Create necessary directories

### Manual Installation

If you prefer to install manually:

1. Create a Python virtual environment:
   ```bash
   python3 -m venv env
   source env/bin/activate
   ```

2. Install Python dependencies:
   ```bash
   pip install --upgrade pip setuptools wheel
   pip install -r requirements.txt
   pip install ultralytics  # For YOLOv11x support
   ```

3. Install Node.js dependencies:
   ```bash
   npm install mysql2
   ```

4. Set up the MySQL database:
   ```bash
   mysql -u root -p < owl_security_db.sql
   ```

## Detection Methods

The system supports multiple detection methods based on available libraries:

### Object Detection

1. **YOLOv11x (Primary)**: Uses the latest YOLOv11x model for accurate object detection
   - Detects 80 different object classes including people, animals, vehicles, etc.
   - Provides bounding boxes and confidence scores
   - Fast inference even on CPU

2. **OpenCV Cascade (Fallback)**: Uses OpenCV's built-in detection capabilities
   - Limited to basic person detection
   - Lower accuracy but works on all platforms

### Face Recognition

1. **Primary Method**: Uses `face_recognition` library with dlib for accurate face recognition
2. **OpenCV Fallback**: Uses OpenCV's built-in face detection and recognition capabilities

### Apple Silicon (M1/M2/M3) Compatibility

For macOS on Apple Silicon:
- The system will automatically use the OpenCV fallback method for face recognition
- YOLOv11x will work at full performance with PyTorch optimizations
- All other features remain fully functional

## Testing the System

To verify that your detection system is working correctly:

```bash
# Test face detection
./test_face_detection.py

# Test YOLOv11x object detection
./test_yolo.py
```

## Usage

### Starting the Server

```bash
node server.js
```

### Processing Videos Manually

```bash
# Activate the virtual environment
source env/bin/activate

# Process a video file
python video_processor.py --video path/to/video.mp4 --camera-role front_door
```

### Adding Known Faces

1. Upload a clear face image to the server
2. Use the API endpoint to add the face:
   ```
   POST /api/faces/add
   {
     "name": "Person Name",
     "image_path": "/path/to/face.jpg",
     "access": {
       "bedroom": true,
       "living_room": true,
       "kitchen": true,
       "front_door": true
     }
   }
   ```

## Troubleshooting

### Python 3.13 Compatibility Issues

If you encounter issues with Python 3.13:

1. Make sure you have the latest setuptools:
   ```bash
   pip install --upgrade pip setuptools wheel
   ```

2. If face_recognition fails to install, the system will automatically use the OpenCV fallback

### YOLOv11x Issues

If YOLOv11x is not working:

1. Verify the model file exists:
   ```bash
   ls -la yolo11x.pt
   ```

2. Make sure ultralytics is installed:
   ```bash
   pip install ultralytics
   ```

3. Run the test script to diagnose issues:
   ```bash
   ./test_yolo.py
   ```

### Database Connection Issues

If you see database connection errors:

1. Check that MySQL is running:
   ```bash
   sudo systemctl status mysql
   ```

2. Verify the database credentials in server.js

### Face Detection Not Working

1. Check that the virtual environment is activated
2. Verify that either face_recognition or OpenCV is properly installed
3. Check the logs for specific error messages

## API Endpoints

The server provides the following API endpoints for face detection:

- `GET /api/timeline` - Get timeline of detection events
- `GET /api/faces` - Get all detected faces
- `POST /api/faces/add` - Add a known face
- `PUT /api/faces/:id` - Update a known face
- `DELETE /api/faces/:id` - Delete a known face

## Mobile App Integration

The Owl mobile app integrates with the face detection system through:

1. Timeline tab - Shows detection events with face information
2. Faces tab - Manages known faces and permissions
3. Settings tab - Configures notification preferences 