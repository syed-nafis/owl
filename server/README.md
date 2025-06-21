# Owl Home Security Camera System - Server

This repository contains the server component of the Owl home security camera system, designed to work with a Raspberry Pi 4 camera and the Owl mobile app.

## System Architecture

The system consists of three main components:

1. **Owl Mobile App** - React Native application for viewing camera footage and controlling the system
2. **Home Server** - Node.js server that handles communication between the app and Pi, and stores video recordings
3. **Raspberry Pi 4 Camera** - Captures video footage and streams it to the server

## Setup Instructions

### Home Server Setup

1. Install Node.js (v14 or higher) and npm
2. Install dependencies:
```
npm install
```
3. Configure the server (optional):
   - Edit the `STORAGE_PATH` and `MAX_STORAGE_GB` variables in `server.js` if needed
   - Default port is 9000, change `PORT` if needed
4. Create a videos directory (if it doesn't exist):
```
mkdir videos
```
5. Start the server:
```
npm start
```

### Raspberry Pi 4 Setup

1. Install required Python packages:
```
pip3 install -r requirements.txt
```
2. Make sure your Raspberry Pi camera is enabled:
```
sudo raspi-config
```
   - Navigate to Interfacing Options > Camera > Enable

3. Run the camera script:
```
python3 pi_camera.py --server http://YOUR_HOME_SERVER_IP:9000
```

Replace `YOUR_HOME_SERVER_IP` with the IP address of the computer running the home server.

## Video Format

The system uses MP4 video format (H.264 codec) for recording. This format provides:
- Good compression for efficient storage
- Compatibility with most machine learning frameworks for video analysis
- Easy playback on most devices

## API Endpoints

### Home Server API

- `GET /status` - Get server status
- `POST /start-stream` - Start streaming from Pi camera
- `POST /stop-stream` - Stop streaming from Pi camera
- `GET /latest-video` - Get the URL of the latest recorded video
- `GET /videos-list` - Get a list of all recorded videos
- `POST /upload-video` - Endpoint for Pi to upload recorded videos

### Pi Camera API

- `GET /status` - Get camera status
- `POST /start-stream` - Start camera streaming
- `POST /stop-stream` - Stop camera streaming
- `POST /start-recording` - Start recording video
- `POST /stop-recording` - Stop recording video
- `GET /stream` - MJPEG stream from camera

## Machine Learning Integration

The server is designed to support adding machine learning models to analyze the video footage. To implement this:

1. Add model files to a new `/models` directory
2. Create an analysis pipeline in the server code
3. Process videos after they are uploaded by the Pi

Common ML tasks for security cameras include:
- Motion detection
- Person detection
- Face recognition
- Object detection
- Activity recognition

## Troubleshooting

### Connection Issues
- Make sure all devices are on the same network
- Check firewall settings to allow the required ports
- Verify IP addresses are correct in the configuration

### Camera Issues
- Check that the camera module is properly connected
- Ensure the camera is enabled in Raspberry Pi configuration
- Test the camera with `libcamera-hello` to verify it works

### Storage Issues
- Check available disk space on the server
- The system will automatically manage storage and delete old recordings when needed 