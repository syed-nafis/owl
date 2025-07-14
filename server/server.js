const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const multer = require('multer');
const mysql = require('mysql2/promise');
const ffmpeg = require('fluent-ffmpeg');
const WebSocket = require('ws');
const os = require('os');
const axios = require('axios');
const querystring = require('querystring');

// Set ffmpeg path
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'videos'));
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `upload_${timestamp}_${file.originalname}`);
  }
});

const upload = multer({ storage });

// Create Express application
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Configuration
const PORT = process.env.PORT || 9000;
const STORAGE_PATH = path.join(__dirname, 'videos');
const MAX_STORAGE_GB = 32; // Default max storage in GB
const MAX_STORAGE_BYTES = MAX_STORAGE_GB * 1024 * 1024 * 1024;
const CLEANUP_INTERVAL = 3600000; // Clean up every hour (ms)
const DEFAULT_SEGMENT_MINUTES = 2;

// Keep track of camera status
let cameraStatus = {
  isOnline: false,
  isStreaming: false,
  currentStreamUrl: null,
  lastConnected: null,
  connectedCameras: {} // Track multiple cameras
};

// Database to track video segments
let videoSegments = [];

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',  // Set your MySQL password here
  database: 'owl_security'
};

let dbPool;

async function initDb() {
  try {
    dbPool = mysql.createPool(dbConfig);
    console.log('Database connection pool initialized');
  } catch (error) {
    console.error('Error initializing database pool:', error);
  }
}

// Initialize database connection
initDb();

// Routes
app.get('/status', (req, res) => {
  const diskInfo = checkDiskSpace();
  const totalSegments = videoSegments.length;
  const cameraList = Object.keys(cameraStatus.connectedCameras).map(ip => {
    return {
      ip,
      ...cameraStatus.connectedCameras[ip]
    };
  });
  
  res.json({
    status: 'online',
    streaming: cameraStatus.isStreaming,
    camerasOnline: cameraList.length,
    cameras: cameraList,
    storageUsed: diskInfo.used,
    storageAvailable: diskInfo.available,
    totalSegments: totalSegments,
    version: '1.0.0'
  });
});

// Start streaming and recording from Pi camera
app.post('/start-stream', (req, res) => {
  const { ip } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'Camera IP is required' });
  }
  
  const segmentMinutes = req.body.segmentMinutes || DEFAULT_SEGMENT_MINUTES;
  
  cameraStatus.isStreaming = true;
  cameraStatus.currentStreamUrl = `http://${ip}:8000/stream`;
  
  // Track this camera in our connected cameras list
  if (!cameraStatus.connectedCameras[ip]) {
    cameraStatus.connectedCameras[ip] = {
      status: 'online',
      streaming: true,
      lastConnected: new Date(),
      name: req.body.name || `Camera ${ip}`,
      role: req.body.role || 'Camera'
    };
  } else {
    cameraStatus.connectedCameras[ip].streaming = true;
    cameraStatus.connectedCameras[ip].status = 'online';
    cameraStatus.connectedCameras[ip].lastConnected = new Date();
  }
  
  // Send start-recording command to the camera with segment duration
  io.emit('start-recording', { 
    ip: ip,
    segment_minutes: segmentMinutes
  });
  
  // Notify connected clients that streaming has started
  io.emit('streaming-status', { 
    streaming: true, 
    ip,
    camera: cameraStatus.connectedCameras[ip]
  });
  
  return res.json({ 
    success: true, 
    message: 'Streaming and recording started',
    streamUrl: cameraStatus.currentStreamUrl
  });
});

// Stop streaming and recording
app.post('/stop-stream', (req, res) => {
  const { ip } = req.body;
  
  if (!ip) {
    cameraStatus.isStreaming = false;
    cameraStatus.currentStreamUrl = null;
    
    // Set all cameras to not streaming
    Object.keys(cameraStatus.connectedCameras).forEach(cameraIp => {
      cameraStatus.connectedCameras[cameraIp].streaming = false;
    });
    
    // Send stop command to all cameras
    io.emit('stop-recording', {});
  } else {
    // Stop only the specified camera
    if (cameraStatus.connectedCameras[ip]) {
      cameraStatus.connectedCameras[ip].streaming = false;
      
      // Send stop command to specific camera
      io.to(ip).emit('stop-recording', {});
    }
    
    // Check if any camera is still streaming
    const anyStreaming = Object.values(cameraStatus.connectedCameras).some(cam => cam.streaming);
    if (!anyStreaming) {
      cameraStatus.isStreaming = false;
      cameraStatus.currentStreamUrl = null;
    }
  }
  
  // Notify connected clients that streaming has stopped
  io.emit('streaming-status', { 
    streaming: cameraStatus.isStreaming,
    ip
  });
  
  return res.json({ 
    success: true, 
    message: 'Streaming and recording stopped'
  });
});

// Get the latest video from storage
app.get('/latest-video', (req, res) => {
  fs.readdir(STORAGE_PATH, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read video directory' });
    }
    
    // Filter for video files and sort by creation time (newest first)
    const videoFiles = files
      .filter(file => file.endsWith('.mp4'))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(STORAGE_PATH, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (videoFiles.length === 0) {
      return res.status(404).json({ error: 'No videos found' });
    }
    
    const latestVideo = videoFiles[0].name;
    res.json({
      videoUrl: `/videos/${latestVideo}`
    });
  });
});

// List all videos with metadata
app.get('/videos-list', async (req, res) => {
  try {
    const files = await fs.promises.readdir(STORAGE_PATH);
    
    // Filter for video files and include metadata
    const videoFiles = await Promise.all(
      files
        .filter(file => file.endsWith('.mp4'))
        .map(async file => {
          const stats = fs.statSync(path.join(STORAGE_PATH, file));
          const videoSegment = videoSegments.find(segment => segment.filename === file);
          
          // Generate thumbnail
          let thumbnailUrl = null;
          try {
            thumbnailUrl = await generateThumbnail(path.join(STORAGE_PATH, file), file);
          } catch (error) {
            console.error(`Error generating thumbnail for ${file}:`, error);
          }
          
          return {
            name: file,
            path: `/videos/${file}`,
            size: stats.size,
            created: stats.mtime,
            duration: null, // TODO: Implement video duration extraction
            cameraIp: videoSegment ? videoSegment.cameraIp : null,
            timestamp: videoSegment ? videoSegment.timestamp : stats.mtime,
            thumbnail: thumbnailUrl
          };
        })
    );
    
    // Sort by creation date
    videoFiles.sort((a, b) => b.created - a.created);
    
    res.json({ videos: videoFiles });
  } catch (err) {
    console.error('Error listing videos:', err);
    res.status(500).json({ error: 'Failed to read video directory' });
  }
});

// Get videos by camera IP
app.get('/videos-by-camera/:ip', (req, res) => {
  const cameraIp = req.params.ip;
  
  // Filter video segments by camera IP
  const cameraSegments = videoSegments
    .filter(segment => segment.cameraIp === cameraIp)
    .map(segment => ({
      name: segment.filename,
      path: `/videos/${segment.filename}`,
      timestamp: segment.timestamp,
      cameraIp: segment.cameraIp
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
  res.json({ videos: cameraSegments });
});

// Handle video uploads from the Pi
app.post('/upload-video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  
  console.log(`Received video upload: ${req.file.filename} (${req.file.size} bytes)`);
  
  // Parse metadata if available
  let metadata = {};
  try {
    if (req.body.metadata) {
      metadata = JSON.parse(req.body.metadata);
      console.log('Video metadata:', metadata);
    }
  } catch (error) {
    console.error('Error parsing metadata:', error);
  }
  
  // Track this segment in our database
  const segmentInfo = {
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    timestamp: metadata.timestamp || new Date().toISOString(),
    cameraIp: metadata.camera_ip || 'unknown',
    hostname: metadata.hostname,
    duration: metadata.duration || 0
  };
  
  videoSegments.push(segmentInfo);
  
  // Save segments data to a JSON file for persistence
  saveVideoSegmentsData();
  
  // Update camera status and notify connected clients
  if (metadata.camera_ip && cameraStatus.connectedCameras[metadata.camera_ip]) {
    cameraStatus.connectedCameras[metadata.camera_ip].lastConnected = new Date();
  }
  cameraStatus.lastConnected = new Date();
  
  io.emit('video-uploaded', {
    filename: req.file.filename,
    size: req.file.size,
    timestamp: new Date(),
    metadata: metadata
  });
  
  // Add the video to the detection database
  addVideoToDetectionDb(segmentInfo).then(videoId => {
    if (videoId) {
      // Trigger video processing in the background
      triggerVideoProcessing(videoId, segmentInfo);
    }
  });
  
  res.json({
    success: true,
    message: 'Video uploaded successfully',
    file: req.file
  });
  
  // Check if we need to clean up storage after this upload
  checkAndCleanupStorage();
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current status to newly connected client
  socket.emit('camera-status', cameraStatus);
  
  // Handle Pi camera connection
  socket.on('pi-connect', (data) => {
    console.log('Pi camera connected:', data);
    const cameraIp = data.ip;
    
    cameraStatus.isOnline = true;
    cameraStatus.lastConnected = new Date();
    
    // Add to connected cameras
    if (!cameraStatus.connectedCameras[cameraIp]) {
      cameraStatus.connectedCameras[cameraIp] = {
        status: 'online',
        streaming: false,
        lastConnected: new Date(),
        name: `Camera ${cameraIp}`,
        role: 'Camera',
        socket: socket.id
      };
    } else {
      cameraStatus.connectedCameras[cameraIp].status = 'online';
      cameraStatus.connectedCameras[cameraIp].lastConnected = new Date();
      cameraStatus.connectedCameras[cameraIp].socket = socket.id;
    }
    
    // Associate this socket with the camera IP for targeted messages
    socket.join(cameraIp);
    
    io.emit('camera-status', cameraStatus);
  });
  
  // Handle Pi camera disconnection
  socket.on('pi-disconnect', (data) => {
    // Find which camera this socket belongs to
    const cameraIp = findCameraBySocket(socket.id);
    if (cameraIp) {
      cameraStatus.connectedCameras[cameraIp].status = 'offline';
      console.log(`Camera ${cameraIp} disconnected`);
    }
    
    // Check if any cameras are still online
    const anyCameraOnline = Object.values(cameraStatus.connectedCameras).some(cam => cam.status === 'online');
    if (!anyCameraOnline) {
      cameraStatus.isOnline = false;
    }
    
    io.emit('camera-status', cameraStatus);
  });
  
  // Handle recording status updates
  socket.on('recording-status', (data) => {
    const cameraIp = findCameraBySocket(socket.id);
    if (cameraIp && cameraStatus.connectedCameras[cameraIp]) {
      cameraStatus.connectedCameras[cameraIp].recordingInfo = data;
      io.emit('camera-status', cameraStatus);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Find which camera this socket belongs to
    const cameraIp = findCameraBySocket(socket.id);
    if (cameraIp) {
      cameraStatus.connectedCameras[cameraIp].status = 'offline';
      console.log(`Camera ${cameraIp} disconnected`);
      
      // Check if any cameras are still online
      const anyCameraOnline = Object.values(cameraStatus.connectedCameras).some(cam => cam.status === 'online');
      if (!anyCameraOnline) {
        cameraStatus.isOnline = false;
      }
      
      io.emit('camera-status', cameraStatus);
    }
  });
});

// Helper function to find camera IP by socket ID
function findCameraBySocket(socketId) {
  for (const [ip, camera] of Object.entries(cameraStatus.connectedCameras)) {
    if (camera.socket === socketId) {
      return ip;
    }
  }
  return null;
}

// Helper function to check disk space
function checkDiskSpace() {
  try {
    const stats = fs.statfsSync(STORAGE_PATH);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
    
    return {
      total: `${totalGB} GB`,
      used: `${usedGB} GB`,
      available: `${freeGB} GB`,
      freeBytes: freeBytes,
      usedBytes: usedBytes,
      totalBytes: totalBytes,
      percentUsed: Math.round((usedBytes / totalBytes) * 100)
    };
  } catch (error) {
    console.error('Error checking disk space:', error);
    return {
      used: '0 GB',
      available: `${MAX_STORAGE_GB} GB`,
      percentUsed: 0
    };
  }
}

// Check and clean up storage when needed
function checkAndCleanupStorage() {
  const diskInfo = checkDiskSpace();
  const usedBytes = diskInfo.usedBytes || 0;
  
  // If we're using more than 85% of MAX_STORAGE_GB, clean up
  if (usedBytes > (MAX_STORAGE_BYTES * 0.85)) {
    console.log(`Storage usage at ${diskInfo.percentUsed}%. Cleaning up old recordings.`);
    cleanupOldRecordings();
  }
}

// Clean up old recordings to maintain storage limits
function cleanupOldRecordings() {
  try {
    fs.readdir(STORAGE_PATH, (err, files) => {
      if (err) {
        console.error('Error reading storage directory:', err);
        return;
      }
      
      // Get video files with stats
      const videoFiles = files
        .filter(file => file.endsWith('.mp4'))
        .map(file => ({
          name: file,
          path: path.join(STORAGE_PATH, file),
          stats: fs.statSync(path.join(STORAGE_PATH, file)),
          segment: videoSegments.find(s => s.filename === file)
        }))
        .sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime()); // Oldest first
      
      // Calculate total size
      let totalSize = videoFiles.reduce((sum, file) => sum + file.stats.size, 0);
      const maxAllowedBytes = MAX_STORAGE_BYTES * 0.8; // Target 80% usage
      let deletedCount = 0;
      
      console.log(`Current storage usage: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB of ${MAX_STORAGE_GB} GB`);
      
      // Delete oldest files until we're under the limit
      for (const file of videoFiles) {
        if (totalSize <= maxAllowedBytes) {
          break;
        }
        
        try {
          fs.unlinkSync(file.path);
          console.log(`Deleted old recording: ${file.name}`);
          
          // Remove from our segments database
          const index = videoSegments.findIndex(s => s.filename === file.name);
          if (index !== -1) {
            videoSegments.splice(index, 1);
          }
          
          totalSize -= file.stats.size;
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting file ${file.name}:`, error);
        }
      }
      
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old recordings`);
        saveVideoSegmentsData(); // Update our segments database file
        io.emit('storage-cleaned', { deletedCount, currentUsage: (totalSize / (1024 * 1024 * 1024)).toFixed(2) });
      }
    });
  } catch (error) {
    console.error('Error in cleanup process:', error);
  }
}

// Function to process video with ML (placeholder)
function processVideoWithML(videoInfo) {
  // This is a placeholder for ML processing
  // In production, you would:
  // 1. Analyze video frames with ML models
  // 2. Save detection results
  // 3. Generate notifications for important events
  
  console.log(`[ML] Would process video: ${videoInfo.filename}`);
}

// Load video segments data from file
function loadVideoSegmentsData() {
  const dataFile = path.join(__dirname, 'video_segments.json');
  
  try {
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf8');
      videoSegments = JSON.parse(data);
      console.log(`Loaded ${videoSegments.length} video segments from database`);
      
      // Filter out segments that no longer exist
      videoSegments = videoSegments.filter(segment => {
        const filePath = path.join(STORAGE_PATH, segment.filename);
        return fs.existsSync(filePath);
      });
      
      console.log(`Filtered to ${videoSegments.length} existing video segments`);
    }
  } catch (error) {
    console.error('Error loading video segments data:', error);
    videoSegments = [];
  }
}

// Save video segments data to file
function saveVideoSegmentsData() {
  const dataFile = path.join(__dirname, 'video_segments.json');
  
  try {
    fs.writeFileSync(dataFile, JSON.stringify(videoSegments, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving video segments data:', error);
  }
}

// Initialize on startup
loadVideoSegmentsData();

// Ensure clips directory exists
const clipsDir = path.join(__dirname, 'clips');
if (!fs.existsSync(clipsDir)) {
  fs.mkdirSync(clipsDir, { recursive: true });
  console.log('Created clips directory:', clipsDir);
}

// Schedule periodic storage cleanup
setInterval(checkAndCleanupStorage, CLEANUP_INTERVAL);

// ==== ESP8266 Integration ====
// Parse command-line arguments for --esp-ip
let espIpFromArg = null;
process.argv.forEach(arg => {
  if (arg.startsWith('--esp-ip=')) {
    espIpFromArg = arg.split('=')[1];
  }
});

const ESP8266_IP = espIpFromArg || process.env.ESP8266_IP || '192.168.85.90'; // Set your ESP8266 IP here or via env
const ESP8266_PORT = 80;

// Open door via ESP8266
app.post('/api/esp/open-door', async (req, res) => {
  try {
    console.log(`[ESP] Sending open door command to ESP8266 at ${ESP8266_IP}`);
    const params = new URLSearchParams();
    params.append('door', 'front_door');
    
    const response = await axios.post(`http://${ESP8266_IP}/open-door`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log(`[ESP] ESP8266 responded:`, response.data);
    res.json({ success: true, message: 'Open door command sent to ESP8266', espResponse: response.data });
  } catch (error) {
    console.error('[ESP] Error sending open door command:', error.message);
    res.status(500).json({ error: 'Failed to send open door command to ESP8266' });
  }
});

// Control servo angle on ESP8266
app.post('/api/esp/servo', async (req, res) => {
  const { angle } = req.body;
  
  if (angle === undefined || !Number.isInteger(parseInt(angle))) {
    return res.status(400).json({ error: 'Angle must be a valid integer' });
  }
  
  try {
    console.log(`[ESP] Sending servo angle (${angle}) command to ESP8266 at ${ESP8266_IP}`);
    const response = await axios.post(`http://${ESP8266_IP}:${ESP8266_PORT}/servo`, { angle });
    console.log(`[ESP] ESP8266 responded:`, response.data);
    res.json({ 
      success: true, 
      message: `Servo angle command sent to ESP8266`, 
      angle,
      espResponse: response.data 
    });
  } catch (error) {
    console.error('[ESP] Error sending servo angle command:', error.message);
    res.status(500).json({ error: 'Failed to send servo angle command to ESP8266' });
  }
});

// Control servo oscillation on ESP8266
app.post('/api/esp/servo-oscillate', async (req, res) => {
  const { action } = req.body;
  
  if (!action || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Action must be either "start" or "stop"' });
  }
  
  try {
    console.log(`[ESP] Sending servo oscillate (${action}) command to ESP8266 at ${ESP8266_IP}`);
    const response = await axios.post(`http://${ESP8266_IP}:${ESP8266_PORT}/servo-oscillate`, { action });
    console.log(`[ESP] ESP8266 responded:`, response.data);
    res.json({ 
      success: true, 
      message: `Servo oscillation ${action} command sent to ESP8266`, 
      espResponse: response.data 
    });
  } catch (error) {
    console.error('[ESP] Error sending servo oscillation command:', error.message);
    res.status(500).json({ error: 'Failed to send servo oscillation command to ESP8266' });
  }
});

// Set light state via ESP8266
app.post('/api/esp/light', async (req, res) => {
  const { state } = req.body; // 'on' or 'off'
  if (!['on', 'off'].includes(state)) {
    return res.status(400).json({ error: 'Invalid state. Use "on" or "off".' });
  }
  try {
    console.log(`[ESP] Sending light state (${state}) command to ESP8266 at ${ESP8266_IP}`);
    const response = await axios.post(`http://${ESP8266_IP}:${ESP8266_PORT}/light`, { state });
    console.log(`[ESP] ESP8266 responded:`, response.data);
    res.json({ success: true, message: `Light ${state} command sent to ESP8266`, espResponse: response.data });
  } catch (error) {
    console.error('[ESP] Error sending light command:', error.message);
    res.status(500).json({ error: 'Failed to send light command to ESP8266' });
  }
});

// Keep track of active door access sessions
const activeDoorSessions = new Map();

// Receive button press notification from ESP8266
app.post('/api/esp/button-pressed', handleButtonPress);

// Function to start monitoring for face matches over 3 minutes
async function startDoorAccessMonitoring(sessionId, buttonPressTime) {
  const monitoringDuration = 3 * 60 * 1000; // 3 minutes in milliseconds
  const checkInterval = 10 * 1000; // Check every 10 seconds
  const endTime = new Date(buttonPressTime.getTime() + monitoringDuration);
  
  console.log(`[DOOR ACCESS] Starting monitoring session ${sessionId} until ${endTime.toISOString()}`);
  
  // Store session info
  activeDoorSessions.set(sessionId, {
    buttonPressTime,
    endTime,
    active: true
  });
  
  const monitoringInterval = setInterval(async () => {
    try {
      const now = new Date();
      const session = activeDoorSessions.get(sessionId);
      
      // Check if session is still active and within time limit
      if (!session || !session.active || now > endTime) {
        console.log(`[DOOR ACCESS] Monitoring session ${sessionId} ended - no face matches found`);
        clearInterval(monitoringInterval);
        activeDoorSessions.delete(sessionId);
        
        // Log timeout event if session was still active
        if (session && session.active) {
          await logDoorAccessEvent({
            eventType: 'door_access_timeout',
            personNames: [],
            faceIds: [],
            buttonPressTime,
            doorOpened: false,
            accessDenied: true,
            reason: 'monitoring_timeout'
          });
          
          // 🔔 NOTIFICATION 4: Intruder detected (button pressed but no face recognized)
          await sendMobileNotification({
            id: `intruder_detected_${sessionId}`,
            type: 'security_alert',
            title: '⚠️ Intruder Detected',
            message: 'Button pressed but no known person recognized',
            room: 'Front Door',
            timestamp: now.toISOString(),
            actions: ['View Camera', 'Call Security', 'Dismiss'],
            timeout: 0, // Don't auto-dismiss security alerts
            priority: 'critical',
            alert: true
          });
          
          // Send timeout notification
          io.emit('door-access-notification', {
            type: 'timeout',
            message: 'Door access monitoring timed out - no known person detected',
            timestamp: now.toISOString(),
            doorOpened: false,
            accessDenied: true,
            sessionId: sessionId
          });
        }
        return;
      }
      
      // Check for new face matches since button press
      console.log(`[DOOR ACCESS] Checking for new face matches since ${buttonPressTime.toISOString()}`);
      const faceMatchResults = await checkRecentFaceMatches(buttonPressTime, now);
      
      if (faceMatchResults.hasMatches) {
        console.log(`[DOOR ACCESS] Face match found during monitoring: ${faceMatchResults.personNames.join(', ')}`);
        
        // Stop monitoring
        clearInterval(monitoringInterval);
        session.active = false;
        activeDoorSessions.delete(sessionId);
        
        // Grant access
        await grantDoorAccess(faceMatchResults, buttonPressTime, 'live_detection', sessionId);
        return;
      }
      
      console.log(`[DOOR ACCESS] No new matches found. Continuing monitoring... (${Math.round((endTime - now) / 1000)}s remaining)`);
      
    } catch (error) {
      console.error(`[DOOR ACCESS] Error during monitoring session ${sessionId}:`, error);
    }
  }, checkInterval);
}

// Helper function to grant door access
async function grantDoorAccess(faceMatchResults, buttonPressTime, detectionSource = 'unknown', sessionId = null) {
  try {
    console.log(`[DOOR ACCESS] Granting access for: ${faceMatchResults.personNames.join(', ')} (${detectionSource})`);
    
    let doorResponse = null;
    let doorOpened = false;
    
    // Try to send door open command to ESP8266
    try {
      // Create form data format that matches the curl command
      const params = new URLSearchParams();
      params.append('door', 'front_door');
      
      doorResponse = await axios.post(`http://${ESP8266_IP}/open-door`, params, {
        timeout: 3000, // 3 second timeout
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      console.log(`[DOOR ACCESS] Door opened successfully for: ${faceMatchResults.personNames.join(', ')}`);
      doorOpened = true;
    } catch (espError) {
      console.warn(`[DOOR ACCESS] ESP8266 not available (${espError.message}), simulating door open for testing`);
      // In testing mode, simulate successful door opening
      doorResponse = { 
        data: { 
          success: true, 
          message: 'Door opened (simulated - ESP8266 not connected)',
          simulation: true 
        } 
      };
      doorOpened = true;
    }
    
    // 🔔 NOTIFICATION 3: Door opened with recognized person
    const personList = faceMatchResults.personNames.join(' and ');
    await sendMobileNotification({
      id: `door_access_granted_${sessionId}`,
      type: 'door_access',
      title: '✅ Access Granted',
      message: `Letting ${personList} in`,
      room: 'Front Door',
      timestamp: new Date().toISOString(),
      actions: ['View Activity', 'OK'],
      timeout: 15,
      priority: 'high',
      success: true
    });
    
    // Log successful door access event
    await logDoorAccessEvent({
      eventType: 'door_access_granted',
      personNames: faceMatchResults.personNames,
      faceIds: faceMatchResults.faceIds,
      buttonPressTime,
      doorOpened: doorOpened,
      espResponse: doorResponse.data,
      detectionSource: detectionSource,
      sessionId: sessionId
    });
    
    // Send notification to connected clients
    const notificationMessage = faceMatchResults.personNames.length === 1 
      ? `${faceMatchResults.personNames[0]} entered the house`
      : `${faceMatchResults.personNames.join(' and ')} entered the house`;
      
    io.emit('door-access-notification', {
      type: 'access_granted',
      message: notificationMessage,
      personNames: faceMatchResults.personNames,
      timestamp: new Date().toISOString(),
      doorOpened: doorOpened,
      detectionSource: detectionSource,
      sessionId: sessionId,
      simulation: doorResponse?.data?.simulation || false
    });
    
  } catch (error) {
    console.error('[DOOR ACCESS] Unexpected error in door access:', error);
    
    // Log failed door access event
    await logDoorAccessEvent({
      eventType: 'door_access_failed',
      personNames: faceMatchResults.personNames,
      faceIds: faceMatchResults.faceIds,
      buttonPressTime,
      doorOpened: false,
      error: error.message,
      detectionSource: detectionSource,
      sessionId: sessionId
    });
    
    // Send failure notification
    io.emit('door-access-notification', {
      type: 'access_failed',
      message: 'Person recognized but door access failed',
      personNames: faceMatchResults.personNames,
      timestamp: new Date().toISOString(),
      doorOpened: false,
      error: error.message,
      sessionId: sessionId
    });
  }
}

// Helper function to check for recent face matches
async function checkRecentFaceMatches(startTime, endTime) {
  if (!dbPool) {
    console.error('[DOOR ACCESS] Database not available');
    return { hasMatches: false, personNames: [], faceIds: [] };
  }
  
  try {
    // Query for face matches in the specified time range at the front door
    const [matches] = await dbPool.execute(`
          SELECT DISTINCT
      kf.name,
      f.face_id,
      f.detection_time,
      f.confidence,
      v.camera_role
    FROM faces f
    JOIN face_matches fm ON f.face_id = fm.face_id
    JOIN known_faces kf ON fm.known_face_id = kf.known_face_id
    JOIN videos v ON f.video_id = v.video_id
    WHERE f.detection_time >= ? 
      AND f.detection_time <= ?
      AND kf.access_front_door = 1
    ORDER BY f.detection_time DESC
    `, [startTime, endTime]);
    
    if (matches.length > 0) {
      const personNames = [...new Set(matches.map(match => match.name))];
      const faceIds = matches.map(match => match.face_id);
      
      console.log(`[DOOR ACCESS] Found ${matches.length} face matches for: ${personNames.join(', ')}`);
      
      return {
        hasMatches: true,
        personNames,
        faceIds,
        matches
      };
    } else {
      console.log('[DOOR ACCESS] No face matches found in the last 2 minutes');
      return { hasMatches: false, personNames: [], faceIds: [] };
    }
    
  } catch (error) {
    console.error('[DOOR ACCESS] Error checking face matches:', error);
    return { hasMatches: false, personNames: [], faceIds: [] };
  }
}

// Helper function to log door access events
async function logDoorAccessEvent(eventData) {
  if (!dbPool) {
    console.error('[DOOR ACCESS] Database not available for logging');
    return;
  }
  
  try {
    // Insert into detections table for timeline display
    const [result] = await dbPool.execute(`
      INSERT INTO detections (
        detection_type,
        object_class,
        confidence,
        detection_time,
        camera_role,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'door_access',
      eventData.eventType,
      1.0, // Full confidence for button press events
      eventData.buttonPressTime,
      'Front Door',
      JSON.stringify({
        personNames: eventData.personNames,
        faceIds: eventData.faceIds,
        doorOpened: eventData.doorOpened,
        accessDenied: eventData.accessDenied || false,
        espResponse: eventData.espResponse || null,
        error: eventData.error || null,
        buttonPress: true,
        detectionSource: eventData.detectionSource || 'unknown',
        sessionId: eventData.sessionId || null,
        reason: eventData.reason || null
      })
    ]);
    
    console.log(`[DOOR ACCESS] Event logged to database with ID: ${result.insertId}`);
    
    // Determine display name based on event type
    let displayName;
    if (eventData.personNames && eventData.personNames.length > 0) {
      displayName = eventData.personNames.join(' and ');
    } else if (eventData.eventType === 'door_access_timeout') {
      displayName = 'Door access timeout';
    } else {
      displayName = 'Unknown person';
    }
    
    // Also emit to timeline for real-time updates
    io.emit('timeline-update', {
      detection_id: result.insertId,
      detection_type: 'door_access',
      object_class: eventData.eventType,
      detection_time: eventData.buttonPressTime.toISOString(),
      camera_role: 'Front Door',
      display_name: displayName,
      doorOpened: eventData.doorOpened,
      accessDenied: eventData.accessDenied || false,
      detectionSource: eventData.detectionSource || 'unknown',
      sessionId: eventData.sessionId || null
    });
    
  } catch (error) {
    console.error('[DOOR ACCESS] Error logging door access event:', error);
  }
}

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Video storage path: ${STORAGE_PATH}`);
  console.log(`Max storage configured: ${MAX_STORAGE_GB} GB`);
  console.log(`ESP8266 IP: ${ESP8266_IP}`);
});

// Add video to detection database
async function addVideoToDetectionDb(videoInfo) {
  if (!dbPool) {
    console.error('Database pool not initialized');
    return null;
  }
  
  try {
    const cameraRole = getCameraRole(videoInfo.cameraIp);
    
    const [result] = await dbPool.execute(
      `INSERT INTO videos (filename, path, created_at, camera_ip, camera_role, duration, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        videoInfo.filename,
        videoInfo.path,
        new Date(videoInfo.timestamp),
        videoInfo.cameraIp,
        cameraRole,
        videoInfo.duration,
        videoInfo.size
      ]
    );
    
    console.log(`Added video to detection database with ID: ${result.insertId}`);
    return result.insertId;
  } catch (error) {
    console.error('Error adding video to detection database:', error);
    return null;
  }
}

// Get camera role based on IP
function getCameraRole(cameraIp) {
  if (cameraStatus.connectedCameras[cameraIp] && cameraStatus.connectedCameras[cameraIp].role) {
    return cameraStatus.connectedCameras[cameraIp].role;
  }
  return 'unknown';
}

// Trigger video processing for object and face detection
function triggerVideoProcessing(videoId, videoInfo) {
  const scriptPath = path.join(__dirname, 'video_processor.py');
  const videoPath = videoInfo.path;
  const cameraRole = getCameraRole(videoInfo.cameraIp);
  
  // Run the processing script with correct database credentials
  const command = `${__dirname}/env/bin/python ${scriptPath} --video "${videoPath}" --camera-role "${cameraRole}" --db-user "root" --db-password "" --db-host "localhost" --db-name "owl_security"`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error processing video: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Video processing stderr: ${stderr}`);
    }
    console.log(`Video processing output: ${stdout}`);
    
    // Notify clients that processing is complete
    io.emit('video-processed', {
      videoId: videoId,
      filename: videoInfo.filename
    });
  });
}

// Get timeline events
app.get('/timeline', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { startDate, endDate, type, camera, search, page = 0, pageSize = 50, timePeriod } = req.query;
    
    // Modified query to include information about face detections and face matches
    let query = `
      SELECT 
        d.*,
        v.filename,
        v.path,
        (
          SELECT GROUP_CONCAT(f.face_id) 
          FROM faces f 
          WHERE f.video_id = d.video_id 
          AND ((f.frame_number >= d.start_frame OR d.start_frame IS NULL) 
              AND (f.frame_number <= d.end_frame OR d.end_frame IS NULL))
        ) AS detected_face_ids,
        (
          SELECT GROUP_CONCAT(f.person_name SEPARATOR ', ') 
          FROM faces f 
          WHERE f.video_id = d.video_id 
          AND ((f.frame_number >= d.start_frame OR d.start_frame IS NULL) 
              AND (f.frame_number <= d.end_frame OR d.end_frame IS NULL))
        ) AS detected_face_names,
        (
          SELECT GROUP_CONCAT(DISTINCT kf.name SEPARATOR ', ')
          FROM faces f 
          JOIN face_matches fm ON f.face_id = fm.face_id
          JOIN known_faces kf ON fm.known_face_id = kf.known_face_id
          WHERE f.video_id = d.video_id 
          AND ((f.frame_number >= d.start_frame OR d.start_frame IS NULL) 
              AND (f.frame_number <= d.end_frame OR d.end_frame IS NULL))
        ) AS matched_face_names
      FROM detections d
      LEFT JOIN videos v ON d.video_id = v.video_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Handle time period filter
    if (timePeriod) {
      const now = new Date();
      let filterDate = new Date();
      
      switch (timePeriod) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0); // Start of today
          query += ' AND d.detection_time >= ?';
          params.push(filterDate);
          break;
        case 'yesterday':
          filterDate.setHours(0, 0, 0, 0); // Start of today
          filterDate.setDate(filterDate.getDate() - 1); // Move to yesterday
          const endOfYesterday = new Date(filterDate);
          endOfYesterday.setHours(23, 59, 59, 999);
          query += ' AND d.detection_time >= ? AND d.detection_time <= ?';
          params.push(filterDate, endOfYesterday);
          break;
        case 'week':
          filterDate.setDate(filterDate.getDate() - 7); // 7 days ago
          query += ' AND d.detection_time >= ?';
          params.push(filterDate);
          break;
        case 'month':
          filterDate.setMonth(filterDate.getMonth() - 1); // 1 month ago
          query += ' AND d.detection_time >= ?';
          params.push(filterDate);
          break;
      }
    } else {
      // Handle explicit date ranges if no timePeriod
      if (startDate) {
        query += ' AND d.detection_time >= ?';
        params.push(new Date(startDate));
      }
      
      if (endDate) {
        query += ' AND d.detection_time <= ?';
        params.push(new Date(endDate));
      }
    }
    
    if (type) {
      query += ' AND d.detection_type = ?';
      params.push(type);
    }
    
    if (camera) {
      query += ' AND d.camera_role = ?';
      params.push(camera);
    }
    
    // Add search functionality
    if (search) {
      query += ` AND (
        d.detection_type LIKE ? OR 
        d.object_class LIKE ? OR 
        d.camera_role LIKE ? OR
        (
          SELECT GROUP_CONCAT(f.person_name SEPARATOR ', ') 
          FROM faces f 
          WHERE f.video_id = d.video_id 
          AND ((f.frame_number >= d.start_frame OR d.start_frame IS NULL) 
              AND (f.frame_number <= d.end_frame OR d.end_frame IS NULL))
        ) LIKE ?
      )`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_table`;
    const [countResult] = await dbPool.execute(countQuery, params);
    const totalCount = countResult[0].total;
    
    // Parse pagination parameters as integers
    const parsedPageSize = parseInt(pageSize, 10) || 50;
    const parsedPage = parseInt(page, 10) || 0;
    const offset = parsedPage * parsedPageSize;
    
    // Add pagination - using direct values instead of parameters for LIMIT/OFFSET
    // This avoids issues with prepared statements and LIMIT/OFFSET in mysql2
    query += ' ORDER BY d.detection_time DESC';
    query += ` LIMIT ${parsedPageSize} OFFSET ${offset}`;
    
    const [rows] = await dbPool.execute(query, params);
    
    // Process the results to include proper event descriptions
    const processedRows = rows.map(row => {
      const result = { ...row };
      
      // For person detections, follow the specified logic
      if (row.detection_type === 'person') {
        // Check if any faces were detected
        if (row.detected_face_ids) {
          // Faces were detected, check if they were matched to known faces
          if (row.matched_face_names) {
            const matchedNames = row.matched_face_names.split(', ').filter(Boolean);
            // Format the display name based on matched faces
            if (matchedNames.length === 1) {
              result.display_name = matchedNames[0];
            } else if (matchedNames.length > 1) {
              result.display_name = `${matchedNames.join(' and ')} detected`;
            } else {
              // This shouldn't happen, but just in case
              result.display_name = 'Unknown person';
            }
          } else {
            // Face detected but no matches, so "Unknown person"
            result.display_name = 'Unknown person';
          }
        } else {
          // No faces detected for this person detection
          result.display_name = 'Unknown person';
        }
      } else {
        // For other detections, use the object_class or detection_type
        result.display_name = row.object_class || row.detection_type;
      }
      
      return result;
    });
    
    res.json({
      timeline: processedRows,
      pagination: {
        total: totalCount,
        page: parsedPage,
        pageSize: parsedPageSize,
        totalPages: Math.ceil(totalCount / parsedPageSize)
      }
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline data' });
  }
});

// Get faces detected
app.get('/faces-detected', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { name, startDate, endDate, camera, search } = req.query;
    
    let query = `
      SELECT f.*, v.filename, v.path 
      FROM faces f
      JOIN videos v ON f.video_id = v.video_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (name) {
      query += ' AND f.person_name LIKE ?';
      params.push(`%${name}%`);
    }
    
    if (startDate) {
      query += ' AND f.detection_time >= ?';
      params.push(new Date(startDate));
    }
    
    if (endDate) {
      query += ' AND f.detection_time <= ?';
      params.push(new Date(endDate));
    }
    
    if (camera) {
      query += ' AND f.camera_role = ?';
      params.push(camera);
    }
    
    // Add general search functionality
    if (search) {
      query += ` AND (
        f.person_name LIKE ? OR 
        f.camera_role LIKE ?
      )`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }
    
    query += ' ORDER BY f.detection_time DESC LIMIT 100';
    
    const [rows] = await dbPool.execute(query, params);
    
    res.json({ faces: rows });
  } catch (error) {
    console.error('Error fetching faces:', error);
    res.status(500).json({ error: 'Failed to fetch faces data' });
  }
});

// Get known faces
app.get('/known-faces', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const conn = await dbPool.getConnection();
    const [knownFaces] = await conn.execute('SELECT * FROM known_faces');
    conn.release();
    
    // Don't send the face encoding in the response (it's large)
    const faces = knownFaces.map(face => {
      const { face_encoding, ...faceData } = face;
      return faceData;
    });
    
    res.json({ knownFaces: faces });
  } catch (error) {
    console.error('Error fetching known faces:', error);
    res.status(500).json({ error: 'Failed to fetch known faces' });
  }
});

// Add new known face
app.post('/add-known-face', upload.single('image'), async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { name, role, access_bedroom, access_living_room, access_kitchen, access_front_door } = req.body;
    
    if (!req.file || !name) {
      return res.status(400).json({ error: 'Face image and name are required' });
    }
    
    // Process the uploaded image to extract face encoding
    const scriptPath = path.join(__dirname, 'extract_face.py');
    const imagePath = req.file.path;
    
    exec(`${__dirname}/env/bin/python ${scriptPath} "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error.message}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      if (stderr) {
        // Log stderr but don't fail - it contains debug info
        console.log(`Face extraction debug output: ${stderr}`);
      }
      
      try {
        // Parse the face data from stdout
        let faceData;
        try {
          // Ensure stdout is trimmed of any whitespace
          const cleanedOutput = stdout.trim();
          console.log("Python script output:", cleanedOutput);
          faceData = JSON.parse(cleanedOutput);
        } catch (jsonError) {
          console.error('JSON parsing error:', jsonError);
          console.error('Raw stdout:', stdout);
          return res.status(500).json({ error: 'Invalid output format from face extraction' });
        }
        
        if (!faceData.success) {
          return res.status(400).json({ error: faceData.error || 'No face detected in the image' });
        }
        
        // Get face embedding from the response
        const face_encoding = JSON.stringify(faceData.embedding);
        
        // Insert into database
        const [result] = await dbPool.execute(
          `INSERT INTO known_faces 
           (name, role, access_bedroom, access_living_room, access_kitchen, access_front_door, face_encoding)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            name, 
            role || 'Family', 
            access_bedroom === 'true', 
            access_living_room === 'true', 
            access_kitchen === 'true', 
            access_front_door === 'true',
            face_encoding
          ]
        );
        
        res.json({ 
          success: true, 
          message: 'Face added successfully',
          faceId: result.insertId
        });
      } catch (dbError) {
        console.error('Error adding known face to database:', dbError);
        res.status(500).json({ error: 'Failed to add face to database' });
      }
    });
  } catch (error) {
    console.error('Error adding known face:', error);
    res.status(500).json({ error: 'Failed to add known face' });
  }
});

// Update known face
app.put('/update-known-face/:id', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { id } = req.params;
    const { name, role, access_bedroom, access_living_room, access_kitchen, access_front_door } = req.body;
    
    await dbPool.execute(
      `UPDATE known_faces 
       SET name = ?, role = ?, 
           access_bedroom = ?, access_living_room = ?, 
           access_kitchen = ?, access_front_door = ?
       WHERE known_face_id = ?`,
      [
        name, 
        role, 
        access_bedroom === 'true', 
        access_living_room === 'true', 
        access_kitchen === 'true', 
        access_front_door === 'true',
        id
      ]
    );
    
    res.json({ success: true, message: 'Face updated successfully' });
  } catch (error) {
    console.error('Error updating known face:', error);
    res.status(500).json({ error: 'Failed to update known face' });
  }
});

// Delete known face
app.delete('/delete-known-face/:id', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { id } = req.params;
    
    await dbPool.execute('DELETE FROM face_matches WHERE known_face_id = ?', [id]);
    await dbPool.execute('DELETE FROM known_faces WHERE known_face_id = ?', [id]);
    
    res.json({ success: true, message: 'Face deleted successfully' });
  } catch (error) {
    console.error('Error deleting known face:', error);
    res.status(500).json({ error: 'Failed to delete known face' });
  }
});

// Set up storage for face images
const faceImagesDir = path.join(__dirname, 'face_images');

// Ensure face_images directory exists
if (!fs.existsSync(faceImagesDir)) {
  fs.mkdirSync(faceImagesDir, { recursive: true });
}

// Configure multer for face image uploads
const faceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, faceImagesDir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-face.jpg');
    }
  })
});

// Face registration and management APIs
app.post('/api/faces', faceUpload.single('image'), async (req, res) => {
  try {
    const { 
      name, 
      role,
      access_bedroom,
      access_living_room,
      access_kitchen,
      access_front_door
    } = req.body;
    
    if (!req.file || !name) {
      return res.status(400).json({ error: 'Image and name are required' });
    }
    
    // Process the face image to extract embeddings using our enhanced InsightFace module
    const imagePath = req.file.path;
    const pythonScript = path.join(__dirname, 'extract_face.py');
    
    exec(`${__dirname}/env/bin/python "${pythonScript}" "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      if (stderr) {
        // Log stderr but don't fail - it contains debug info
        console.log(`Face extraction debug output: ${stderr}`);
      }
      
      try {
        // Parse the face data from python script output 
        // (now using InsightFace for better accuracy)
        let faceData;
        try {
          // Ensure stdout is trimmed of any whitespace
          const cleanedOutput = stdout.trim();
          console.log("Python script output:", cleanedOutput);
          faceData = JSON.parse(cleanedOutput);
        } catch (jsonError) {
          console.error('JSON parsing error:', jsonError);
          console.error('Raw stdout:', stdout);
          return res.status(500).json({ error: 'Invalid output format from face extraction' });
        }
        
        if (!faceData.success) {
          return res.status(400).json({ error: faceData.error || 'No face detected in the image' });
        }
        
        // Get face embedding and convert to JSON string
        let faceEncoding = null;
        if (faceData.embedding && Array.isArray(faceData.embedding)) {
          faceEncoding = JSON.stringify(faceData.embedding);
        }
        
        // Insert face into database
        const conn = await dbPool.getConnection();
        
        try {
          await conn.beginTransaction();
          
          // Insert into known_faces table with access permissions
          const [result] = await conn.execute(
            `INSERT INTO known_faces 
            (name, role, face_encoding, access_bedroom, access_living_room, access_kitchen, access_front_door) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              name || 'Unknown', 
              role || 'Unknown', 
              faceEncoding,
              (access_bedroom === 'true') || false,
              (access_living_room === 'true') || false,
              (access_kitchen === 'true') || false,
              (access_front_door === 'true') || false
            ]
          );
          
          const knownFaceId = result.insertId;
          
          // Create a directory for this face
          const faceFolderPath = path.join(faceImagesDir, knownFaceId.toString());
          try {
            // Create directory if it doesn't exist
            if (!fs.existsSync(faceFolderPath)) {
              fs.mkdirSync(faceFolderPath, { recursive: true });
            }
            
            // Move the uploaded image to the face folder
            const newImagePath = path.join(faceFolderPath, req.file.filename);
            fs.renameSync(imagePath, newImagePath);
            
            // Insert into face_images table
            await conn.execute(
              `INSERT INTO face_images (known_face_id, image_path) VALUES (?, ?)`,
              [knownFaceId, path.join(knownFaceId.toString(), req.file.filename)]
            );
            
            await conn.commit();
            
            const successMessage = `Face registered successfully:
              - ID: ${knownFaceId}
              - Name: ${name || 'Unknown'}
              - Role: ${role || 'Unknown'}
              - Image: ${req.file.filename}
              - Access: bedroom=${(access_bedroom === 'true') || false}, living_room=${(access_living_room === 'true') || false}, kitchen=${(access_kitchen === 'true') || false}, front_door=${(access_front_door === 'true') || false}
            `;
            console.log('\x1b[32m%s\x1b[0m', successMessage); // Green color
            
            res.status(201).json({ 
              id: knownFaceId, 
              name, 
              role,
              image: `/api/face_images/${knownFaceId}/${req.file.filename}`,
              message: 'Face registered successfully',
              accessAreas: {
                bedroom: (access_bedroom === 'true') || false,
                living_room: (access_living_room === 'true') || false,
                kitchen: (access_kitchen === 'true') || false,
                front_door: (access_front_door === 'true') || false
              }
            });
          } catch (fsError) {
            await conn.rollback();
            console.error('File system error:', fsError);
            res.status(500).json({ error: 'Failed to store face image' });
          }
        } catch (dbError) {
          await conn.rollback();
          throw dbError;
        } finally {
          conn.release();
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ error: 'Failed to store face in database' });
      }
    });
  } catch (err) {
    console.error('Error in face registration:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all registered faces
app.get('/api/faces', async (req, res) => {
  try {
    const conn = await dbPool.getConnection();
    const [registeredFaces] = await conn.execute(
      `SELECT 
        kf.known_face_id as id, 
        kf.name, 
        kf.role,
        kf.access_bedroom, 
        kf.access_living_room, 
        kf.access_kitchen, 
        kf.access_front_door,
        (SELECT image_path FROM face_images 
         WHERE known_face_id = kf.known_face_id 
         ORDER BY image_id DESC LIMIT 1) as image_path
      FROM known_faces kf`
    );
    conn.release();
    
    // Format the response
    const formattedFaces = registeredFaces.map(face => ({
      id: face.id,
      name: face.name,
      role: face.role || 'Unknown',
      image: face.image_path ? `/api/face_images/${face.id}/${path.basename(face.image_path)}` : null,
      accessAreas: {
        bedroom: !!face.access_bedroom,
        living_room: !!face.access_living_room,
        kitchen: !!face.access_kitchen,
        front_door: !!face.access_front_door
      }
    }));
    
    res.json(formattedFaces);
  } catch (err) {
    console.error('Error fetching faces:', err);
    res.status(500).json({ error: 'Failed to fetch faces' });
  }
});

// Delete a face
app.delete('/api/faces/:id', async (req, res) => {
  try {
    const faceId = req.params.id;
    const conn = await dbPool.getConnection();
    
    // Start transaction for safe deletion
    await conn.beginTransaction();
    
    try {
      // Get the face images
      const [faceImages] = await conn.execute(
        `SELECT image_path FROM face_images WHERE known_face_id = ?`,
        [faceId]
      );
      
      // Delete related records first to avoid foreign key constraint errors
      
      // 1. Delete from face_matches table (references known_faces)
      await conn.execute(
        `DELETE FROM face_matches WHERE known_face_id = ?`,
        [faceId]
      );
      
      // 2. Delete from faces table if there are face detection references
      await conn.execute(
        `DELETE FROM faces WHERE person_name IN (SELECT name FROM known_faces WHERE known_face_id = ?)`,
        [faceId]
      );
      
      // 3. Delete face images
      await conn.execute(
        `DELETE FROM face_images WHERE known_face_id = ?`,
        [faceId]
      );
      
      // 4. Finally delete the main face record
      await conn.execute(
        `DELETE FROM known_faces WHERE known_face_id = ?`,
        [faceId]
      );
      
      // Commit transaction
      await conn.commit();
      conn.release();
      
      // Delete image files from filesystem
      const faceFolderPath = path.join(faceImagesDir, faceId.toString());
      if (fs.existsSync(faceFolderPath)) {
        fs.rmSync(faceFolderPath, { recursive: true, force: true });
      }
      
      res.json({ message: 'Face deleted successfully' });
    } catch (transactionError) {
      // Rollback transaction on error
      await conn.rollback();
      conn.release();
      throw transactionError;
    }
  } catch (err) {
    console.error('Error deleting face:', err);
    res.status(500).json({ error: 'Failed to delete face' });
  }
});

// Get all images for a specific face
app.get('/api/faces/:id/images', async (req, res) => {
  try {
    const faceId = req.params.id;
    const conn = await dbPool.getConnection();
    
    const [images] = await conn.execute(
      `SELECT image_id, image_path FROM face_images WHERE known_face_id = ?`,
      [faceId]
    );
    conn.release();
    
    const formattedImages = images.map(image => ({
      id: image.image_id,
      url: `/api/face_images/${faceId}/${path.basename(image.image_path)}`
    }));
    
    res.json(formattedImages);
  } catch (err) {
    console.error('Error fetching face images:', err);
    res.status(500).json({ error: 'Failed to fetch face images' });
  }
});

// Add additional image to an existing face
app.post('/api/faces/:id/images', faceUpload.single('image'), async (req, res) => {
  try {
    const faceId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    // Process the face image to extract encodings
    const imagePath = req.file.path;
    const pythonScript = path.join(__dirname, 'extract_face.py');
    
    exec(`${__dirname}/env/bin/python ${pythonScript} "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      if (stderr) {
        // Log stderr but don't fail - it contains debug info
        console.log(`Face extraction debug output: ${stderr}`);
      }
      
      try {
        // Parse the face data from python script output
        let faceData;
        try {
          // Ensure stdout is trimmed of any whitespace
          const cleanedOutput = stdout.trim();
          console.log("Python script output:", cleanedOutput);
          faceData = JSON.parse(cleanedOutput);
        } catch (jsonError) {
          console.error('JSON parsing error:', jsonError);
          console.error('Raw stdout:', stdout);
          return res.status(500).json({ error: 'Invalid output format from face extraction' });
        }
        
        if (!faceData.success) {
          return res.status(400).json({ error: faceData.error || 'No face detected in the image' });
        }
        
        // Create a directory for this face if it doesn't exist
        const faceFolderPath = path.join(faceImagesDir, faceId.toString());
        if (!fs.existsSync(faceFolderPath)) {
          fs.mkdirSync(faceFolderPath);
        }
        
        // Move the uploaded image to the face folder
        const newImagePath = path.join(faceFolderPath, req.file.filename);
        fs.renameSync(imagePath, newImagePath);
        
        // Insert into face_images table
        if (!dbPool) {
          throw new Error('Database not connected');
        }
        
        // Validate faceId
        const parsedFaceId = parseInt(faceId, 10);
        if (isNaN(parsedFaceId)) {
          throw new Error('Invalid face ID');
        }
        
        const conn = await dbPool.getConnection();
        try {
          // First check if the face ID exists
          const [faceCheck] = await conn.execute(
            `SELECT known_face_id FROM known_faces WHERE known_face_id = ?`,
            [parsedFaceId]
          );
          
          if (faceCheck.length === 0) {
            conn.release();
            return res.status(404).json({ error: `Face with ID ${faceId} not found` });
          }
          
          const [result] = await conn.execute(
            `INSERT INTO face_images (known_face_id, image_path) VALUES (?, ?)`,
            [parsedFaceId, path.join(faceId.toString(), req.file.filename)]
          );
          
          if (!result.insertId) {
            throw new Error('Failed to insert image record');
          }
          
          conn.release();
          
          const insertResult = result;
          
          res.status(201).json({
            id: insertResult.insertId,
            url: `/api/face_images/${faceId}/${req.file.filename}`,
            message: 'Face image added successfully'
          });
        } catch (dbError) {
          conn.release();
          throw dbError;
        }
      } catch (dbError) {
        console.error('Database error in adding face image:', {
          error: dbError.message,
          faceId: faceId,
          code: dbError.code,
          sqlMessage: dbError.sqlMessage
        });
        res.status(500).json({ 
          error: 'Failed to store face image in database',
          details: dbError.message 
        });
      }
    });
  } catch (err) {
    console.error('Error adding face image:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve face images with caching disabled
app.use('/api/face_images', (req, res, next) => {
  // Disable caching for face images
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}, express.static(faceImagesDir));

// Stream video from Pi camera (MJPEG)
app.get('/api/camera-stream', (req, res) => {
  // Set headers for MJPEG stream
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  // Start the Pi camera stream
  const streamProcess = spawn(path.join(__dirname, 'env/bin/python'), [
    path.join(__dirname, 'pi_camera.py'),
    '--stream-mjpeg'
  ]);
  
  let isClientConnected = true;
  
  // Send stream data to client
  streamProcess.stdout.on('data', (data) => {
    if (isClientConnected) {
      try {
        res.write(data);
      } catch (error) {
        isClientConnected = false;
        streamProcess.kill();
      }
    }
  });
  
  // Handle errors
  streamProcess.stderr.on('data', (data) => {
    console.error(`Stream error: ${data}`);
  });
  
  // Clean up when client disconnects
  req.on('close', () => {
    isClientConnected = false;
    streamProcess.kill();
    console.log('Client disconnected from stream');
  });
});

// Route to capture image from Pi camera
app.post('/api/capture-from-pi', async (req, res) => {
  try {
    const timestamp = Date.now();
    const outputPath = path.join(faceImagesDir, `pi_capture_${timestamp}.jpg`);
    
    // Execute the Python script to capture from Pi camera
    exec(`${__dirname}/env/bin/python ${__dirname}/pi_camera.py --capture "${outputPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error capturing from Pi: ${error}`);
        return res.status(500).json({ error: 'Failed to capture from Pi camera' });
      }
      
      res.json({ 
        success: true,
        imagePath: `/api/face_images/pi_capture_${timestamp}.jpg`
      });
    });
  } catch (err) {
    console.error('Error capturing from Pi:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Handle uploads of face images from the Pi camera
app.post('/upload-face-image', faceUpload.single('image'), async (req, res) => {
  try {
    console.log('Received image upload request');
    console.log('Request file:', req.file ? 'Present' : 'Missing');
    console.log('Request body metadata:', req.body.metadata ? 'Present' : 'Missing');
    
    if (!req.file) {
      console.error('No image file provided in upload request');
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Parse metadata if available
    let metadata = {};
    try {
      if (req.body.metadata) {
        metadata = JSON.parse(req.body.metadata);
        console.log('Parsed metadata:', metadata);
      }
    } catch (error) {
      console.error('Error parsing metadata:', error);
    }
    
    // Check if this is a light reference image
    if (metadata.section && metadata.imageType) {
      console.log(`Processing light reference image: section=${metadata.section}, type=${metadata.imageType}`);
      // This is a light reference image
      const section = metadata.section;
      const imageType = metadata.imageType;
      
      // Store the light reference image info in database
      if (dbPool) {
        try {
          console.log('Storing light reference in database with params:', {
            section,
            imageType,
            path: req.file.path,
            timestamp: metadata.timestamp || new Date().toISOString(),
            camera_ip: metadata.camera_ip || 'unknown',
            hostname: metadata.hostname || 'unknown'
          });
          
          await dbPool.execute(`
            INSERT INTO light_reference_images (section, image_type, image_path, timestamp, camera_ip, hostname)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              image_path = VALUES(image_path), 
              timestamp = VALUES(timestamp),
              camera_ip = VALUES(camera_ip),
              hostname = VALUES(hostname)
          `, [
            section,
            imageType,
            req.file.path,
            metadata.timestamp || new Date().toISOString(),
            metadata.camera_ip || 'unknown',
            metadata.hostname || 'unknown'
          ]);
          
          console.log(`Light reference image stored successfully: ${section}/${imageType}`);
        } catch (dbError) {
          console.error('Error storing light reference in database:', dbError);
          throw dbError; // Re-throw to trigger the main catch block
        }
      } else {
        console.error('Database pool not available for storing light reference');
        throw new Error('Database not available');
      }
      
      // Return the URL to access this image
      const imageUrl = `/api/light-references/${req.file.filename}`;
      
      const responseData = {
        success: true,
        message: 'Light reference image uploaded successfully',
        image_url: imageUrl,
        section: section,
        imageType: imageType,
        timestamp: metadata.timestamp || new Date().toISOString()
      };
      
      console.log('Sending light reference response:', responseData);
      res.json(responseData);
      
    } else {
      // This is a regular face image
      const name = metadata.name || 'unknown';
      
      // Create a directory with the name if it doesn't exist
      const nameDir = path.join(faceImagesDir, 'temp', name.replace(/[^a-z0-9]/gi, '_').toLowerCase());
      if (!fs.existsSync(nameDir)) {
        fs.mkdirSync(nameDir, { recursive: true });
      }
      
      // Move the uploaded image to the name directory
      const originalPath = req.file.path;
      const filename = req.file.filename;
      const newPath = path.join(nameDir, filename);
      
      fs.renameSync(originalPath, newPath);
      
      // Store information about the captured image
      const imageInfo = {
        name: name,
        path: newPath,
        relativePath: path.relative(faceImagesDir, newPath),
        timestamp: metadata.timestamp || new Date().toISOString(),
        camera_ip: metadata.camera_ip || 'unknown',
        hostname: metadata.hostname || 'unknown'
      };
      
      console.log(`Face image captured and saved: ${name} (${imageInfo.relativePath})`);
      
      // Return the URL to access this image
      const imageUrl = `/api/face-temp/${encodeURIComponent(name)}/${filename}`;
      
      res.json({
        success: true,
        message: 'Face image uploaded successfully',
        image_url: imageUrl,
        name: name,
        timestamp: imageInfo.timestamp
      });
    }
    
  } catch (error) {
    console.error('Error processing image upload:', error);
    res.status(500).json({ error: 'Server error processing image upload' });
  }
});

// Serve temporary face images
app.use('/api/face-temp', express.static(path.join(faceImagesDir, 'temp')));

// Get video clip for a detection
app.get('/api/clips/:detectionId', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }

  try {
    const detectionId = req.params.detectionId;
    console.log(`Fetching clip for detection ${detectionId}`);

    // First, get the detection info to check if it's a door access event
    const [allDetections] = await dbPool.execute(`
      SELECT * FROM detections WHERE detection_id = ?
    `, [detectionId]);

    if (!allDetections.length) {
      console.log(`No detection found for ID ${detectionId}`);
      return res.status(404).json({ error: 'Detection not found' });
    }

    const detection = allDetections[0];
    console.log('Detection found:', detection);

    // Handle door access events specially (they don't have video clips)
    if (detection.detection_type === 'door_access') {
      console.log(`Door access event detected for ID ${detectionId}`);
      
      // Parse metadata to get person information
      let metadata = {};
      try {
        metadata = JSON.parse(detection.metadata || '{}');
      } catch (e) {
        console.warn('Failed to parse metadata:', e);
      }

      // Return door access information instead of video clip
      return res.json({
        isDoorAccess: true,
        eventType: detection.object_class,
        personNames: metadata.personNames || [],
        doorOpened: metadata.doorOpened || false,
        accessDenied: metadata.accessDenied || false,
        detectionSource: metadata.detectionSource || 'unknown',
        sessionId: metadata.sessionId || null,
        buttonPress: metadata.buttonPress || false,
        timestamp: detection.detection_time,
        cameraRole: detection.camera_role,
        message: metadata.personNames && metadata.personNames.length > 0 
          ? `${metadata.personNames.join(' and ')} ${metadata.doorOpened ? 'gained access' : 'attempted access'}`
          : 'Door access event'
      });
    }

    // Check if clip already exists
    const clipName = `clip_${detectionId}.mp4`;
    const clipPath = path.join(__dirname, 'clips', clipName);
    
    // If clip already exists, return it immediately
    if (fs.existsSync(clipPath)) {
      console.log(`Clip already exists for detection ${detectionId}`);
      return res.json({ 
        url: `/clips/${clipName}`,
        cached: true
      });
    }

    // Get detection and video info with correct column order (only for non-door access events)
    const [detections] = await dbPool.execute(`
      SELECT 
        d.*,
        v.path,
        v.filename,
        v.camera_role,
        v.duration as duration_seconds
      FROM detections d
      JOIN videos v ON d.video_id = v.video_id
      WHERE d.detection_id = ?
    `, [detectionId]);

    if (!detections.length) {
      console.log(`No video found for detection ID ${detectionId}`);
      return res.status(404).json({ error: 'Video not found for this detection' });
    }

    const videoDetection = detections[0];
    console.log('Video detection found:', videoDetection);

    // Handle both absolute and relative paths
    let videoPath = videoDetection.path;
    if (!path.isAbsolute(videoPath)) {
      videoPath = path.join(__dirname, videoPath);
    }

    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
      console.log(`Video file not found: ${videoPath}`);
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Calculate clip start and end times
    const fps = 30; // Assuming 30 fps
    const paddingSeconds = 5; // 5 seconds before and after
    const startFrame = Math.max(0, videoDetection.start_frame - (fps * paddingSeconds));
    const endFrame = videoDetection.end_frame + (fps * paddingSeconds);
    
    console.log('Generating clip with params:', {
      videoPath,
      clipPath,
      startFrame,
      endFrame,
      fps,
      duration: videoDetection.duration_seconds
    });

    // Use fluent-ffmpeg to extract the clip
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startFrame / fps)
        .setDuration((endFrame - startFrame) / fps)
        .output(clipPath)
        .on('end', () => {
          console.log('Clip generated successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error generating clip:', err);
          reject(err);
        })
        .run();
    });

    // Return the clip URL
    res.json({ 
      url: `/clips/${clipName}`,
      startTime: startFrame / fps,
      duration: (endFrame - startFrame) / fps,
      cached: false
    });

  } catch (error) {
    console.error('Error generating clip:', error);
    res.status(500).json({ error: 'Failed to generate clip' });
  }
});

// ESP8266 light status endpoint
app.post('/api/light-status', (req, res) => {
  try {
    const { status } = req.body;
    
    console.log(`Light status update received: ${status}`);
    
    // Emit the status via socket.io to connected clients
    io.emit('light-status-update', { 
      status,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Light status update received'
    });
  } catch (error) {
    console.error('Error processing light status update:', error);
    res.status(500).json({ error: 'Failed to process light status update' });
  }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/clips', express.static(path.join(__dirname, 'clips')));
app.use('/api/face-temp', express.static(path.join(faceImagesDir, 'temp')));

// Add this endpoint before server.listen
app.get('/api/server-info', (req, res) => {
  console.log('Server-info endpoint called from:', req.ip);
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  // Collect all IPv4 addresses
  Object.keys(networkInterfaces).forEach((iface) => {
    networkInterfaces[iface].forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        addresses.push({
          interface: iface,
          address: details.address
        });
        console.log(`Available network interface: ${iface} - ${details.address}`);
      }
    });
  });
  
  const serverUrl = `http://${addresses[0]?.address || 'localhost'}:${PORT}`;
  console.log(`Returning server URL: ${serverUrl}`);
  
  res.json({
    serverIp: addresses,
    port: PORT,
    serverUrl: serverUrl
  });
}); 

// Update detection class settings
app.post('/api/detection-settings', async (req, res) => {
  try {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid detection class settings format' 
      });
    }
    
    // Call the Python function to update settings
    const { spawn } = require('child_process');
    const python = spawn('python3', ['update_detection_settings.py', JSON.stringify(settings)]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`Error updating detection settings: ${errorOutput}`);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to update detection settings',
          error: errorOutput
        });
      }
      
      try {
        const result = JSON.parse(output);
        return res.json(result);
      } catch (e) {
        return res.json({ 
          success: true, 
          message: 'Detection class settings updated successfully'
        });
      }
    });
  } catch (error) {
    console.error('Error updating detection settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update detection settings',
      error: error.message
    });
  }
});

// Get current detection class settings
app.get('/api/detection-settings', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    // Query the database directly
    const [results] = await dbPool.execute(
      'SELECT settings_value FROM app_settings WHERE settings_key = ?',
      ['detection_classes']
    );
    
    // If no settings found, return default settings
    if (results.length === 0) {
      return res.json({ 
        success: true,
        settings: {} // Return empty settings
      });
    }
    
    try {
      // Parse the settings JSON
      const settings = JSON.parse(results[0].settings_value);
      return res.json({ 
        success: true,
        settings
      });
    } catch (jsonError) {
      console.error('Error parsing settings JSON:', jsonError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to parse detection settings' 
      });
    }
  } catch (error) {
    console.error('Error fetching detection settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch detection settings',
      error: error.message
    });
  }
});

// Test endpoint to simulate ESP8266 button press (for development/testing)
app.post('/api/test/button-press', async (req, res) => {
  console.log('[TEST] Simulating ESP8266 button press for testing...');
  
  // Simulate the ESP8266 button press by calling our existing endpoint
  try {
    const testButtonData = {
      source: 'test_simulation',
      timestamp: new Date().toISOString(),
      ...req.body
    };
    
    // Call the actual button press handler
    const mockReq = {
      body: testButtonData,
      ip: req.ip
    };
    
    const mockRes = {
      json: (data) => {
        console.log('[TEST] Button press simulation result:', data);
        res.json({
          test: true,
          simulation: true,
          result: data,
          message: 'ESP8266 button press simulated successfully'
        });
      },
      status: (code) => ({
        json: (data) => {
          console.log('[TEST] Button press simulation error:', data);
          res.status(code).json({
            test: true,
            simulation: true,
            error: data,
            message: 'ESP8266 button press simulation failed'
          });
        }
      })
    };
    
    // Call the actual button press handler with mocked request/response
    await handleButtonPress(mockReq, mockRes);
    
  } catch (error) {
    console.error('[TEST] Error in button press simulation:', error);
    res.status(500).json({
      test: true,
      simulation: true,
      error: error.message,
      message: 'Button press simulation failed'
    });
  }
});

// Test endpoint to simulate all types of notifications
app.post('/api/test/notifications', async (req, res) => {
  console.log('[TEST] Testing notification system...');
  
  try {
    const { type = 'all' } = req.body;
    const timestamp = new Date().toISOString();
    const testResults = [];
    
    // Test door access notifications
    if (type === 'all' || type === 'door') {
      // 1. Someone at the door
      await sendMobileNotification({
        id: `test_door_button_${Date.now()}`,
        type: 'door_access',
        title: '🚪 Someone at the Door',
        message: 'TEST: Someone pressed the doorbell button',
        room: 'Front Door',
        timestamp,
        actions: ['View Camera', 'Dismiss'],
        timeout: 30,
        priority: 'high'
      });
      testResults.push('Door button notification sent');
      
      // 2. Access granted
      await sendMobileNotification({
        id: `test_access_granted_${Date.now()}`,
        type: 'door_access',
        title: '✅ Access Granted',
        message: 'TEST: Letting John in',
        room: 'Front Door',
        timestamp,
        actions: ['View Activity', 'OK'],
        timeout: 15,
        priority: 'high',
        success: true
      });
      testResults.push('Access granted notification sent');
      
      // 3. Intruder detected
      await sendMobileNotification({
        id: `test_intruder_${Date.now()}`,
        type: 'security_alert',
        title: '⚠️ Intruder Detected',
        message: 'TEST: Button pressed but no known person recognized',
        room: 'Front Door',
        timestamp,
        actions: ['View Camera', 'Call Security', 'Dismiss'],
        timeout: 0,
        priority: 'critical',
        alert: true
      });
      testResults.push('Intruder alert notification sent');
    }
    
    // Test smart lighting notifications
    if (type === 'all' || type === 'lighting') {
      const lightingSteps = [
        {
          step: 'motion_detected',
          title: '👀 Motion Detected',
          message: 'TEST: Motion detected in living room',
          priority: 'medium'
        },
        {
          step: 'person_detected',
          title: '🚶 Person Detected',
          message: 'TEST: Person detected in living room',
          priority: 'medium'
        },
        {
          step: 'lights_turned_on',
          title: '💡 Lights Turned On',
          message: 'TEST: Lights automatically turned on in living room',
          priority: 'low'
        },
        {
          step: 'lights_still_on',
          title: '⚡ Lights Still On',
          message: 'TEST: Lights have been on for 30 minutes in living room',
          priority: 'high'
        },
        {
          step: 'no_motion_detected',
          title: '😴 No Motion Detected',
          message: 'TEST: No motion for 15 minutes in living room',
          priority: 'medium'
        },
        {
          step: 'auto_turn_off',
          title: '🌙 Auto Turn Off',
          message: 'TEST: Automatically turning off lights in living room',
          priority: 'low'
        }
      ];
      
      for (let i = 0; i < lightingSteps.length; i++) {
        const stepData = lightingSteps[i];
        await sendMobileNotification({
          id: `test_lighting_${stepData.step}_${Date.now()}_${i}`,
          type: 'smart_lighting',
          title: stepData.title,
          message: stepData.message,
          room: 'Living Room',
          timestamp,
          actions: stepData.step.includes('lights_') ? ['Turn Off', 'Keep On'] : ['View Camera', 'Dismiss'],
          timeout: 60,
          priority: stepData.priority,
          metadata: {
            step: stepData.step,
            lightState: stepData.step.includes('on') ? 'on' : 'off',
            confidence: 0.95,
            brightness: 85
          }
        });
        
        // Small delay between notifications
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      testResults.push('All smart lighting notifications sent');
    }
    
    console.log('[TEST] All test notifications sent successfully');
    
    res.json({
      test: true,
      message: 'Test notifications sent successfully',
      results: testResults,
      timestamp,
      totalNotifications: testResults.length
    });
    
  } catch (error) {
    console.error('[TEST] Error sending test notifications:', error);
    res.status(500).json({
      test: true,
      error: error.message,
      message: 'Failed to send test notifications'
    });
  }
});

// Extract the button press logic into a separate function for reusability
async function handleButtonPress(req, res) {
  console.log('[ESP] Button press notification received:', req.body);
  
  try {
    const buttonPressTime = new Date();
    const sessionId = `door_${buttonPressTime.getTime()}`;
    console.log(`[DOOR ACCESS] Button pressed at: ${buttonPressTime.toISOString()}, Session: ${sessionId}`);
    
    // 🔔 NOTIFICATION 1: Immediate "Someone at the door" notification
    await sendMobileNotification({
      id: `door_button_${sessionId}`,
      type: 'door_access',
      title: '🚪 Someone at the Door',
      message: 'Someone pressed the doorbell button',
      room: 'Front Door',
      timestamp: buttonPressTime.toISOString(),
      actions: ['View Camera', 'Dismiss'],
      timeout: 30,
      priority: 'high'
    });
    
    // First, check for face matches in the past 2 minutes
    const twoMinutesAgo = new Date(buttonPressTime.getTime() - (2 * 60 * 1000));
    console.log(`[DOOR ACCESS] Checking past 2 minutes: ${twoMinutesAgo.toISOString()} to ${buttonPressTime.toISOString()}`);
    
    const pastFaceMatchResults = await checkRecentFaceMatches(twoMinutesAgo, buttonPressTime);
    
    if (pastFaceMatchResults.hasMatches) {
      // Known person detected in past 2 minutes - grant access immediately
      console.log(`[DOOR ACCESS] Known person found in past 2 minutes: ${pastFaceMatchResults.personNames.join(', ')}`);
      await grantDoorAccess(pastFaceMatchResults, buttonPressTime, 'past_detection', sessionId);
      
      res.json({ 
        success: true, 
        message: 'Door access granted - person recognized from recent detection',
        personNames: pastFaceMatchResults.personNames,
        doorOpened: true,
        detectionSource: 'past'
      });
      
    } else {
      // No matches in past 2 minutes - start monitoring for next 3 minutes
      console.log('[DOOR ACCESS] No matches in past 2 minutes. Starting 3-minute monitoring period...');
      
      // Send immediate response to ESP8266
      res.json({ 
        success: true, 
        message: 'Monitoring for face detection - please wait up to 3 minutes',
        doorOpened: false,
        monitoring: true,
        sessionId: sessionId
      });
      
      // Send notification to clients that we're monitoring
      io.emit('door-access-notification', {
        type: 'monitoring',
        message: 'Monitoring for face detection at front door...',
        timestamp: buttonPressTime.toISOString(),
        doorOpened: false,
        monitoring: true,
        sessionId: sessionId
      });
      
      // 🔔 NOTIFICATION 2: Monitoring notification
      await sendMobileNotification({
        id: `door_monitoring_${sessionId}`,
        type: 'door_access',
        title: '👁️ Analyzing Visitor',
        message: 'Checking for face recognition. Please wait...',
        room: 'Front Door',
        timestamp: buttonPressTime.toISOString(),
        actions: ['View Camera'],
        timeout: 180,
        priority: 'medium'
      });
      
      // Start the 3-minute monitoring process (don't await - run in background)
      startDoorAccessMonitoring(sessionId, buttonPressTime);
    }
    
  } catch (error) {
    console.error('[DOOR ACCESS] Error processing button press:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing door access request',
      error: error.message
    });
  }
}

// Update the original ESP8266 endpoint to use the extracted function
app.post('/api/esp/button-pressed', handleButtonPress);

// Light Detection Configuration API Endpoints

// Directory for light reference images
const lightReferencesDir = path.join(__dirname, 'light_references');
if (!fs.existsSync(lightReferencesDir)) {
  fs.mkdirSync(lightReferencesDir, { recursive: true });
}

// Multer setup for light reference images
const lightReferenceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, lightReferencesDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      cb(null, `light_ref_${timestamp}.jpg`);
    }
  })
});

// Dedicated endpoint for light reference image uploads
app.post('/upload-light-reference', lightReferenceUpload.single('image'), async (req, res) => {
  try {
    console.log('Received light reference image upload request');
    console.log('Request file:', req.file ? 'Present' : 'Missing');
    console.log('Request body metadata:', req.body.metadata ? 'Present' : 'Missing');
    
    if (!req.file) {
      console.error('No image file provided in light reference upload request');
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Parse metadata
    let metadata = {};
    try {
      if (req.body.metadata) {
        metadata = JSON.parse(req.body.metadata);
        console.log('Parsed light reference metadata:', metadata);
      }
    } catch (error) {
      console.error('Error parsing light reference metadata:', error);
      return res.status(400).json({ error: 'Invalid metadata format' });
    }
    
    const section = metadata.section;
    const imageType = metadata.imageType;
    
    if (!section || !imageType || !['day', 'night'].includes(section) || !['on', 'off'].includes(imageType)) {
      console.error('Invalid section or imageType in metadata:', { section, imageType });
      return res.status(400).json({ error: 'Invalid section or imageType in metadata' });
    }
    
    console.log(`Processing light reference image: section=${section}, type=${imageType}`);
    
    // Store the light reference image info in database
    if (dbPool) {
      try {
        console.log('Storing light reference in database with params:', {
          section,
          imageType,
          path: req.file.path,
          timestamp: metadata.timestamp || new Date().toISOString(),
          camera_ip: metadata.camera_ip || 'unknown',
          hostname: metadata.hostname || 'unknown'
        });
        
        await dbPool.execute(`
          INSERT INTO light_reference_images (section, image_type, image_path, timestamp, camera_ip, hostname)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            image_path = VALUES(image_path), 
            timestamp = VALUES(timestamp),
            camera_ip = VALUES(camera_ip),
            hostname = VALUES(hostname)
        `, [
          section,
          imageType,
          req.file.path,
          metadata.timestamp || new Date().toISOString(),
          metadata.camera_ip || 'unknown',
          metadata.hostname || 'unknown'
        ]);
        
        console.log(`Light reference image stored successfully: ${section}/${imageType}`);
      } catch (dbError) {
        console.error('Error storing light reference in database:', dbError);
        return res.status(500).json({ error: 'Database error storing light reference' });
      }
    } else {
      console.error('Database pool not available for storing light reference');
      return res.status(500).json({ error: 'Database not available' });
    }
    
    // Return the URL to access this image
    const imageUrl = `/api/light-references/${req.file.filename}`;
    
    const responseData = {
      success: true,
      message: 'Light reference image uploaded successfully',
      image_url: imageUrl,
      section: section,
      imageType: imageType,
      timestamp: metadata.timestamp || new Date().toISOString()
    };
    
    console.log('Sending light reference response:', responseData);
    res.json(responseData);
    
  } catch (error) {
    console.error('Error processing light reference image upload:', error);
    res.status(500).json({ error: 'Server error processing light reference upload' });
  }
});



// Get light detection configuration
app.get('/api/light-detection-config', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    // Get light reference images
    const [images] = await dbPool.execute(`
      SELECT section, image_type, image_path, timestamp 
      FROM light_reference_images 
      ORDER BY timestamp DESC
    `);
    
    // Get threshold configurations
    const [thresholds] = await dbPool.execute(`
      SELECT section, brightness_threshold_low, brightness_threshold_high, threshold_configured, updated_at
      FROM light_detection_thresholds
    `);
    
    // Build configuration object
    const config = {
      day: {
        threshold_configured: false,
        brightness_threshold_low: 50,
        brightness_threshold_high: 120
      },
      night: {
        threshold_configured: false,
        brightness_threshold_low: 25,
        brightness_threshold_high: 80
      }
    };
    
    // Add image information
    images.forEach(img => {
      const imageKey = `light_${img.image_type}_image`;
      const imageUrl = `/api/light-references/${path.basename(img.image_path)}`;
      config[img.section][imageKey] = imageUrl;
    });
    
    // Add threshold information
    thresholds.forEach(threshold => {
      config[threshold.section].threshold_configured = threshold.threshold_configured;
      config[threshold.section].brightness_threshold_low = threshold.brightness_threshold_low;
      config[threshold.section].brightness_threshold_high = threshold.brightness_threshold_high;
    });
    
    res.json(config);
    
  } catch (error) {
    console.error('Error fetching light detection config:', error);
    res.status(500).json({ error: 'Failed to fetch light detection configuration' });
  }
});

// Calculate light detection thresholds based on reference images
app.post('/api/calculate-light-thresholds', async (req, res) => {
  try {
    const { section } = req.body;
    
    if (!section || !['day', 'night'].includes(section)) {
      return res.status(400).json({ error: 'Invalid section. Must be "day" or "night"' });
    }
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    // Get the reference images for this section
    const [images] = await dbPool.execute(`
      SELECT image_type, image_path 
      FROM light_reference_images 
      WHERE section = ?
      ORDER BY timestamp DESC
      LIMIT 2
    `, [section]);
    
    if (images.length < 2) {
      return res.status(400).json({ 
        error: 'Both lights ON and OFF reference images are required' 
      });
    }
    
    // Find the on and off images
    const onImage = images.find(img => img.image_type === 'on');
    const offImage = images.find(img => img.image_type === 'off');
    
    if (!onImage || !offImage) {
      return res.status(400).json({ 
        error: 'Both lights ON and OFF reference images are required' 
      });
    }
    
    // Use Python script to calculate thresholds
    const { spawn } = require('child_process');
    const pythonScript = path.join(__dirname, 'calculate_light_thresholds.py');
    
    // Use the virtual environment Python executable
    const pythonExe = path.join(__dirname, 'env', 'bin', 'python');
    
    const python = spawn(pythonExe, [
      pythonScript,
      onImage.image_path,
      offImage.image_path,
      section
    ]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Error calculating thresholds: ${errorOutput}`);
        return res.status(500).json({ 
          error: 'Failed to calculate thresholds',
          details: errorOutput
        });
      }
      
      try {
        const result = JSON.parse(output);
        
        // Store the calculated thresholds in database
        await dbPool.execute(`
          INSERT INTO light_detection_thresholds 
          (section, brightness_threshold_low, brightness_threshold_high, threshold_configured, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            brightness_threshold_low = VALUES(brightness_threshold_low),
            brightness_threshold_high = VALUES(brightness_threshold_high),
            threshold_configured = VALUES(threshold_configured),
            updated_at = VALUES(updated_at)
        `, [
          section,
          result.brightness_threshold_low,
          result.brightness_threshold_high,
          true,
          new Date()
        ]);
        
        console.log(`Light detection thresholds calculated for ${section}:`, result);
        res.json(result);
        
      } catch (parseError) {
        console.error('Error parsing threshold calculation result:', parseError);
        res.status(500).json({ error: 'Failed to parse threshold calculation result' });
      }
    });
    
  } catch (error) {
    console.error('Error calculating light thresholds:', error);
    res.status(500).json({ error: 'Failed to calculate light detection thresholds' });
  }
});

// Clear light reference images
app.post('/api/clear-light-references', async (req, res) => {
  try {
    const { section } = req.body;
    
    if (!section || !['day', 'night'].includes(section)) {
      return res.status(400).json({ error: 'Invalid section. Must be "day" or "night"' });
    }
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    // Get reference images to delete files
    const [images] = await dbPool.execute(`
      SELECT image_path FROM light_reference_images WHERE section = ?
    `, [section]);
    
    // Delete image files
    images.forEach(img => {
      try {
        if (fs.existsSync(img.image_path)) {
          fs.unlinkSync(img.image_path);
        }
      } catch (fileError) {
        console.error('Error deleting image file:', fileError);
      }
    });
    
    // Remove from database
    await dbPool.execute(`
      DELETE FROM light_reference_images WHERE section = ?
    `, [section]);
    
    await dbPool.execute(`
      DELETE FROM light_detection_thresholds WHERE section = ?
    `, [section]);
    
    console.log(`Light references cleared for ${section}`);
    res.json({ success: true, message: `${section} light references cleared` });
    
  } catch (error) {
    console.error('Error clearing light references:', error);
    res.status(500).json({ error: 'Failed to clear light references' });
  }
});

// Serve light reference images
app.use('/api/light-references', express.static(lightReferencesDir));

// Store notifications in memory for demo purposes
const activeNotifications = new Map();

// Store push notification tokens
const pushTokens = new Set();

// Register push notification token
app.post('/api/register-push-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  pushTokens.add(token);
  console.log('📱 Registered push token:', token);
  
  res.json({ success: true });
});

// Unregister push notification token
app.post('/api/unregister-push-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  pushTokens.delete(token);
  console.log('📱 Unregistered push token:', token);
  
  res.json({ success: true });
});

// Unified mobile notification function
async function sendMobileNotification(notificationData) {
  try {
    const {
      id,
      type = 'general',
      title,
      message,
      room = 'Unknown',
      timestamp = new Date().toISOString(),
      actions = ['OK'],
      timeout = 30,
      priority = 'medium',
      success = false,
      alert = false
    } = notificationData;
    
    console.log(`🔔 Sending Mobile Notification [${priority.toUpperCase()}]: ${title}`);
    console.log(`   Message: ${message}`);
    console.log(`   Room: ${room}`);
    console.log(`   Actions: ${actions.join(', ')}`);
    
    // Create notification object
    const notification = {
      id,
      type,
      title,
      message,
      room,
      timestamp,
      actions,
      timeout,
      priority,
      success,
      alert,
      status: 'pending'
    };
    
    // Store notification in active notifications
    activeNotifications.set(id, notification);
    
    // Auto-remove notification after timeout (if timeout > 0)
    if (timeout > 0) {
      setTimeout(() => {
        if (activeNotifications.has(id)) {
          const notif = activeNotifications.get(id);
          if (notif.status === 'pending') {
            notif.status = 'timeout';
            activeNotifications.set(id, notif);
            console.log(`📱 Notification ${id} timed out`);
          }
        }
      }, timeout * 1000);
    }
    
    // Store notification in database for history
    if (dbPool) {
      try {
        await dbPool.execute(`
          INSERT INTO notifications_log 
          (notification_id, type, title, message, room, priority, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, type, title, message, room, priority, new Date()]);
      } catch (dbError) {
        if (!dbError.message.includes("doesn't exist")) {
          console.error('Error storing notification in database:', dbError);
        }
      }
    }
    
    // Send push notifications to all registered devices
    if (pushTokens.size > 0) {
      const messages = Array.from(pushTokens).map(token => ({
        to: token,
        sound: 'default',
        title,
        body: message,
        data: {
          id,
          type,
          room,
          priority,
          actions
        },
      }));
      
      try {
        const chunks = messages.reduce((acc, _, i) => {
          if (i % 100 === 0) acc.push(messages.slice(i, i + 100));
          return acc;
        }, []);
        
        for (const chunk of chunks) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk),
          });
        }
        
        console.log(`📱 Push notifications sent to ${pushTokens.size} devices`);
      } catch (error) {
        console.error('Error sending push notifications:', error);
      }
    }
    
    // Emit to connected clients via Socket.IO
    io.emit('mobile-notification', notification);
    
    // Also emit specific event types for backwards compatibility
    if (type === 'door_access' || type === 'security_alert') {
      io.emit('door-access-notification', notification);
    } else if (type === 'smart_lighting') {
      io.emit('smart-lighting-notification', notification);
    }
    
    console.log(`📱 Mobile notification sent successfully: ${id}`);
    return true;
    
  } catch (error) {
    console.error('Error sending mobile notification:', error);
    return false;
  }
}

// Smart Lighting Automation - Enhanced Notification endpoint
app.post('/api/notifications', async (req, res) => {
  try {
    const { 
      id, 
      type, 
      room, 
      message, 
      timestamp, 
      timeout, 
      actions,
      step, // New field to track smart lighting steps
      lightState, // New field to track light state
      confidence, // New field for detection confidence
      brightness // New field for brightness level
    } = req.body;
    
    console.log('🔔 Smart Lighting Notification Received:');
    console.log(`   ID: ${id}`);
    console.log(`   Type: ${type}`);
    console.log(`   Room: ${room}`);
    console.log(`   Message: ${message}`);
    console.log(`   Step: ${step || 'unknown'}`);
    console.log(`   Light State: ${lightState || 'unknown'}`);
    console.log(`   Timeout: ${timeout}s`);
    console.log(`   Actions: ${actions?.join(', ')}`);
    
    // Store notification in database for tracking
    if (dbPool) {
      try {
        await dbPool.execute(`
          INSERT INTO lighting_automation_log 
          (room, action, description, timestamp)
          VALUES (?, ?, ?, ?)
        `, [room, step || 'notification_sent', message, new Date()]);
      } catch (dbError) {
        console.error('Error storing notification log:', dbError);
      }
    }
    
    // Determine notification title and priority based on step
    let title = 'Smart Lighting Alert';
    let priority = 'medium';
    let notificationActions = actions || ['Turn Off', 'Keep On'];
    
    if (step) {
      switch (step) {
        case 'motion_detected':
          title = '👀 Motion Detected';
          priority = 'medium';
          notificationActions = ['View Camera', 'Dismiss'];
          break;
        case 'person_detected':
          title = '🚶 Person Detected';
          priority = 'medium';
          notificationActions = ['View Camera', 'Dismiss'];
          break;
        case 'lights_turned_on':
          title = '💡 Lights Turned On';
          priority = 'low';
          notificationActions = ['Turn Off', 'Keep On'];
          break;
        case 'lights_still_on':
          title = '⚡ Lights Still On';
          priority = 'high';
          notificationActions = ['Turn Off', 'Keep On', 'Snooze 30min'];
          break;
        case 'no_motion_detected':
          title = '😴 No Motion Detected';
          priority = 'medium';
          notificationActions = ['Turn Off', 'Keep On', 'Extend Timer'];
          break;
        case 'auto_turn_off':
          title = '🌙 Auto Turn Off';
          priority = 'low';
          notificationActions = ['Turn Back On', 'OK'];
          break;
        default:
          title = 'Smart Lighting Alert';
          priority = 'medium';
      }
    }
    
    // 🔔 SMART LIGHTING NOTIFICATIONS: Send detailed notifications for each step
    await sendMobileNotification({
      id,
      type: 'smart_lighting',
      title,
      message,
      room,
      timestamp: timestamp || new Date().toISOString(),
      actions: notificationActions,
      timeout: timeout || 60,
      priority,
      metadata: {
        step,
        lightState,
        confidence,
        brightness
      }
    });
    
    console.log('📱 Smart Lighting notification sent successfully');
    
    res.json({ 
      success: true, 
      notification_id: id,
      message: 'Smart lighting notification sent successfully'
    });
    
  } catch (error) {
    console.error('Error handling smart lighting notification:', error);
    res.status(500).json({ error: 'Failed to send smart lighting notification' });
  }
});

// Get all mobile notifications
app.get('/api/mobile/notifications', (req, res) => {
  try {
    const { type, priority, status, limit = 50 } = req.query;
    
    let notifications = Array.from(activeNotifications.values());
    
    // Filter by type if specified
    if (type) {
      notifications = notifications.filter(n => n.type === type);
    }
    
    // Filter by priority if specified
    if (priority) {
      notifications = notifications.filter(n => n.priority === priority);
    }
    
    // Filter by status if specified
    if (status) {
      notifications = notifications.filter(n => n.status === status);
    }
    
    // Sort by timestamp (newest first)
    notifications = notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    const parsedLimit = parseInt(limit, 10) || 50;
    notifications = notifications.slice(0, parsedLimit);
    
    console.log(`📱 Mobile app requesting notifications: ${notifications.length} found`);
    
    res.json({
      success: true,
      notifications,
      count: notifications.length,
      filters: { type, priority, status, limit: parsedLimit }
    });
  } catch (error) {
    console.error('Error fetching mobile notifications:', error);
    res.status(500).json({ error: 'Failed to fetch mobile notifications' });
  }
});

// Get smart lighting notifications for mobile app (backwards compatibility)
app.get('/api/smart-lighting/notifications', (req, res) => {
  try {
    const notifications = Array.from(activeNotifications.values())
      .filter(n => n.type === 'smart_lighting')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    console.log(`📱 Mobile app requesting smart lighting notifications: ${notifications.length} found`);
    
    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error fetching smart lighting notifications:', error);
    res.status(500).json({ error: 'Failed to fetch smart lighting notifications' });
  }
});

// Smart Lighting Automation - Handle user response
app.post('/api/notifications/:notificationId/response', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { action } = req.body; // 'Turn Off', 'Keep On', etc.
    
    console.log(`📱 User response received for notification ${notificationId}: ${action}`);
    
    // Update notification status
    if (activeNotifications.has(notificationId)) {
      const notification = activeNotifications.get(notificationId);
      notification.status = 'responded';
      notification.userResponse = action;
      notification.responseTime = new Date().toISOString();
      activeNotifications.set(notificationId, notification);
      
      console.log(`📱 Notification ${notificationId} updated with user response: ${action}`);
      
      // Add auto turn-off notification for "Turn Off" action
      if (action.toLowerCase().includes('off')) {
        // Create a follow-up notification for lights turned off
        const followUpId = `${notificationId}_auto_off`;
        const followUpNotification = {
          id: followUpId,
          type: 'smart_lighting',
          title: 'Smart Lighting Action',
          message: `Lights turned off in ${notification.room} as requested`,
          room: notification.room,
          timestamp: new Date().toISOString(),
          actions: [],
          timeout: 0,
          status: 'auto_resolved'
        };
        
        activeNotifications.set(followUpId, followUpNotification);
        console.log(`📱 Created follow-up notification: Lights turned off in ${notification.room}`);
      }
    }
    
    // Log user response
    if (dbPool) {
      try {
        await dbPool.execute(`
          INSERT INTO lighting_automation_log 
          (room, action, description, timestamp)
          VALUES (?, ?, ?, ?)
        `, [
          activeNotifications.get(notificationId)?.room || 'unknown', 
          `user_response_${action.toLowerCase().replace(/\s+/g, '_')}`, 
          `User responded: ${action} to notification ${notificationId}`, 
          new Date()
        ]);
      } catch (dbError) {
        console.error('Error storing user response log:', dbError);
      }
    }
    
    res.json({ 
      success: true, 
      message: `User response '${action}' recorded for notification ${notificationId}`,
      followUpAction: action.toLowerCase().includes('off') ? 'lights_turned_off' : 'no_action'
    });
    
  } catch (error) {
    console.error('Error handling user response:', error);
    res.status(500).json({ error: 'Failed to handle user response' });
  }
});

// Delete a specific face image
app.delete('/api/faces/:id/images/:imageId', async (req, res) => {
  try {
    const { id: faceId, imageId } = req.params;
    const conn = await dbPool.getConnection();
    
    // Start transaction
    await conn.beginTransaction();
    
    try {
      // Get the image path first
      const [images] = await conn.execute(
        `SELECT image_path FROM face_images WHERE known_face_id = ? AND image_id = ?`,
        [faceId, imageId]
      );
      
      if (images.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'Image not found' });
      }
      
      const imagePath = images[0].image_path;
      
      // Delete from database
      await conn.execute(
        `DELETE FROM face_images WHERE known_face_id = ? AND image_id = ?`,
        [faceId, imageId]
      );
      
      // Delete the file from filesystem
      const fullImagePath = path.join(faceImagesDir, imagePath);
      if (fs.existsSync(fullImagePath)) {
        fs.unlinkSync(fullImagePath);
      }
      
      await conn.commit();
      conn.release();
      
      res.json({ message: 'Face image deleted successfully' });
    } catch (transactionError) {
      await conn.rollback();
      conn.release();
      throw transactionError;
    }
  } catch (err) {
    console.error('Error deleting face image:', err);
    res.status(500).json({ error: 'Failed to delete face image' });
  }
});

// Create thumbnails directory if it doesn't exist
const thumbnailsDir = path.join(__dirname, 'thumbnails');
if (!fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  console.log('Created thumbnails directory:', thumbnailsDir);
}

// Serve thumbnails statically
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// Function to generate thumbnail for a video
async function generateThumbnail(videoPath, filename) {
  const thumbnailPath = path.join(thumbnailsDir, `thumb_${filename.replace('.mp4', '.jpg')}`);
  
  // Check if thumbnail already exists
  if (fs.existsSync(thumbnailPath)) {
    return `/thumbnails/thumb_${filename.replace('.mp4', '.jpg')}`;
  }
  
  // Generate thumbnail at 1 second mark
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [1],
        filename: `thumb_${filename.replace('.mp4', '.jpg')}`,
        folder: thumbnailsDir,
        size: '400x225'
      })
      .on('end', () => {
        resolve(`/thumbnails/thumb_${filename.replace('.mp4', '.jpg')}`);
      })
      .on('error', (err) => {
        console.error('Error generating thumbnail:', err);
        reject(err);
      });
  });
}

async function controlGasValve(action) {
  try {
    const espIp = await getEspIpAddress(); // You'll need to implement this function to get ESP's IP
    if (!espIp) {
      console.error('ESP8266 IP address not found');
      return false;
    }

    const response = await axios.post(`http://${espIp}/gas-control`, 
      querystring.stringify({ action: action }), 
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Gas valve ${action} response:`, response.data);
    return response.status === 200;
  } catch (error) {
    console.error('Error controlling gas valve:', error);
    return false;
  }
}

async function controlWaterTap(action) {
  try {
    const espIp = await getEspIpAddress(); // You'll need to implement this function to get ESP's IP
    if (!espIp) {
      console.error('ESP8266 IP address not found');
      return false;
    }

    const response = await axios.post(`http://${espIp}/water-control`, 
      querystring.stringify({ action: action }), 
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Water tap ${action} response:`, response.data);
    return response.status === 200;
  } catch (error) {
    console.error('Error controlling water tap:', error);
    return false;
  }
}

// Add these routes to your Express app
app.post('/api/gas/control', async (req, res) => {
  const { action } = req.body;
  
  if (!action || !['open', 'close'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action specified' });
  }

  const success = await controlGasValve(action);
  if (success) {
    res.json({ message: `Gas valve ${action} command sent successfully` });
  } else {
    res.status(500).json({ error: 'Failed to control gas valve' });
  }
});

app.post('/api/water/control', async (req, res) => {
  const { action } = req.body;
  
  if (!action || !['open', 'close'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action specified' });
  }

  const success = await controlWaterTap(action);
  if (success) {
    res.json({ message: `Water tap ${action} command sent successfully` });
  } else {
    res.status(500).json({ error: 'Failed to control water tap' });
  }
});

// Helper function to get ESP IP address
async function getEspIpAddress() {
  // You should implement this based on how you store/track the ESP's IP
  // For example, you might store it in a config file or database
  return '192.168.0.XXX'; // Replace with actual ESP IP or lookup logic
}