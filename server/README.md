# Owl Security System - Server

This is the server component of the Owl Security System, a home security camera system with face detection and object recognition capabilities.

## Features

- Video recording and storage
- Face detection and recognition
- Object and animal detection
- Access control for different areas
- Timeline events for security monitoring
- Mobile app integration

## Directory Structure

```
server/
├── scripts/          # Utility and setup scripts
├── sql/             # Database schema and queries
├── tests/           # Test files
├── face_images/     # Face detection images
├── models/          # AI models
├── clips/           # Video clips
├── thumbnails/      # Video thumbnails
├── videos/          # Full video files
├── server.js        # Main server application
├── video_processor.py  # Video analysis engine
├── mediapipe_face.py   # Face recognition system
├── light_detection.py  # Smart lighting system
└── README.md        # This file
```

## Components

- **Node.js Server**: Handles API requests, video uploads, and database operations
- **Python Video Processor**: Analyzes videos for faces, people, animals, and objects
- **MySQL Database**: Stores videos, detections, faces, and access permissions
- **Mobile App**: React Native app for viewing and managing the security system

## Installation

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/owl-security.git
cd owl-security/server

# Run the setup script
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Manual Setup

1. Install MySQL and create the database:
   ```bash
   mysql -u root -p < sql/owl_security_db.sql
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Set up Python environment:
   ```bash
   python3 -m venv env
   source env/bin/activate
   pip install -r requirements.txt
   ```

## Detection System

The system includes multiple detection methods:

### Object Detection

1. **YOLOv11x**: State-of-the-art object detection model that can identify 80 different classes
   - Detects people, animals, vehicles, and many other objects
   - High accuracy and good performance even on CPU

2. **OpenCV Fallback**: Basic detection using OpenCV if YOLOv11x is not available

### Face Recognition

1. **Primary Method**: Uses `face_recognition` library with dlib
2. **OpenCV Fallback**: Uses our custom OpenCV-based face detection for platforms where dlib is not available (like Apple Silicon)

For more details, see [README-face-detection.md](README-face-detection.md).

## Usage

### Starting the Server

```bash
# Start the server
./scripts/start.sh

# Or manually
node server.js
```

### Processing Videos Manually

```bash
source env/bin/activate
python video_processor.py --video path/to/video.mp4 --camera-role front_door
```

### Running Tests

```bash
# Run all tests
cd tests
python -m pytest

# Run specific tests
python tests/test_face_detection.py
```

## API Endpoints

- `GET /api/videos` - List all videos
- `POST /api/videos/upload` - Upload a new video
- `GET /api/timeline` - Get timeline of detection events
- `GET /api/faces` - Get all detected faces
- `POST /api/faces/add` - Add a known face

## Configuration

Edit `server.js` to configure:

- Database connection
- Server port
- Video storage location

## Troubleshooting

See [README-face-detection.md](README-face-detection.md) for specific troubleshooting steps related to face detection.

## License

MIT 