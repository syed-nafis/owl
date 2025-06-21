const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

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

// Make sure storage directory exists
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

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
app.get('/videos-list', (req, res) => {
  fs.readdir(STORAGE_PATH, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read video directory' });
    }
    
    // Filter for video files and include metadata
    const videoFiles = files
      .filter(file => file.endsWith('.mp4'))
      .map(file => {
        const stats = fs.statSync(path.join(STORAGE_PATH, file));
        const videoSegment = videoSegments.find(segment => segment.filename === file);
        
        return {
          name: file,
          path: `/videos/${file}`,
          size: stats.size,
          created: stats.mtime,
          duration: null, // TODO: Implement video duration extraction
          cameraIp: videoSegment ? videoSegment.cameraIp : null,
          timestamp: videoSegment ? videoSegment.timestamp : stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created);
    
    res.json({ videos: videoFiles });
  });
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
  
  // Run ML processing in background if enabled
  processVideoWithML(segmentInfo);
  
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

// Schedule periodic storage cleanup
setInterval(checkAndCleanupStorage, CLEANUP_INTERVAL);

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Video storage path: ${STORAGE_PATH}`);
  console.log(`Max storage configured: ${MAX_STORAGE_GB} GB`);
}); 