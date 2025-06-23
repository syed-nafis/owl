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

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Video storage path: ${STORAGE_PATH}`);
  console.log(`Max storage configured: ${MAX_STORAGE_GB} GB`);
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
  
  // Run the processing script
  const command = `python3 ${scriptPath} --video "${videoPath}" --camera-role "${cameraRole}"`;
  
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

// Add these new API endpoints for the detection system

// Get timeline events
app.get('/timeline', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const { startDate, endDate, type, camera } = req.query;
    
    let query = `
      SELECT d.*, v.filename, v.path 
      FROM detections d
      JOIN videos v ON d.video_id = v.video_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND d.detection_time >= ?';
      params.push(new Date(startDate));
    }
    
    if (endDate) {
      query += ' AND d.detection_time <= ?';
      params.push(new Date(endDate));
    }
    
    if (type) {
      query += ' AND d.detection_type = ?';
      params.push(type);
    }
    
    if (camera) {
      query += ' AND d.camera_role = ?';
      params.push(camera);
    }
    
    query += ' ORDER BY d.detection_time DESC LIMIT 100';
    
    const [rows] = await dbPool.execute(query, params);
    
    res.json({ timeline: rows });
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
    const { name, startDate, endDate, camera } = req.query;
    
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
    
    exec(`python3 ${scriptPath} "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error.message}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      try {
        // Parse the face encoding from stdout
        const face_encoding = stdout.trim();
        
        if (!face_encoding || face_encoding === 'No face detected') {
          return res.status(400).json({ error: 'No face detected in the image' });
        }
        
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
    
    // Process the face image to extract encodings
    const imagePath = req.file.path;
    const pythonScript = path.join(__dirname, 'extract_face.py');
    
    exec(`python3 "${pythonScript}" "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      try {
        // Parse the face encoding from python script output
        const faceData = JSON.parse(stdout);
        if (!faceData.success) {
          return res.status(400).json({ error: faceData.error || 'No face detected in the image' });
        }
        
        const faceEncoding = JSON.stringify(faceData.encoding);
        
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
              name, 
              role || 'Unknown', 
              faceEncoding,
              access_bedroom === 'true',
              access_living_room === 'true',
              access_kitchen === 'true',
              access_front_door === 'true'
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
              - Name: ${name}
              - Role: ${role}
              - Image: ${req.file.filename}
              - Access: bedroom=${access_bedroom}, living_room=${access_living_room}, kitchen=${access_kitchen}, front_door=${access_front_door}
            `;
            console.log('\x1b[32m%s\x1b[0m', successMessage); // Green color
            
            res.status(201).json({ 
              id: knownFaceId, 
              name, 
              role,
              image: `/api/face_images/${knownFaceId}/${req.file.filename}`,
              message: 'Face registered successfully',
              accessAreas: {
                bedroom: access_bedroom === 'true',
                living_room: access_living_room === 'true',
                kitchen: access_kitchen === 'true',
                front_door: access_front_door === 'true'
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
    
    // Get the face images
    const [faceImages] = await conn.execute(
      `SELECT image_path FROM face_images WHERE known_face_id = ?`,
      [faceId]
    );
    
    // Delete from database
    await conn.execute(
      `DELETE FROM face_images WHERE known_face_id = ?`,
      [faceId]
    );
    
    await conn.execute(
      `DELETE FROM known_faces WHERE known_face_id = ?`,
      [faceId]
    );
    
    conn.release();
    
    // Delete image files
    const faceFolderPath = path.join(faceImagesDir, faceId.toString());
    if (fs.existsSync(faceFolderPath)) {
      fs.rmSync(faceFolderPath, { recursive: true, force: true });
    }
    
    res.json({ message: 'Face deleted successfully' });
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
    
    exec(`python ${pythonScript} "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error extracting face: ${error}`);
        return res.status(500).json({ error: 'Failed to process face image' });
      }
      
      try {
        // Parse the face encoding from python script output
        const faceData = JSON.parse(stdout);
        if (!faceData.success) {
          return res.status(400).json({ error: 'No face detected in the image' });
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
        const conn = await dbPool.getConnection();
        const [result] = await conn.execute(
          `INSERT INTO face_images (known_face_id, image_path) VALUES (?, ?)`,
          [faceId, path.join(faceId.toString(), req.file.filename)]
        );
        conn.release();
        
        res.status(201).json({
          id: result.insertId,
          url: `/api/face_images/${faceId}/${req.file.filename}`,
          message: 'Face image added successfully'
        });
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ error: 'Failed to store face image in database' });
      }
    });
  } catch (err) {
    console.error('Error adding face image:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve face images
app.use('/api/face_images', express.static(faceImagesDir));

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
  const streamProcess = spawn('python', [
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
    exec(`python ${__dirname}/pi_camera.py --capture "${outputPath}"`, (error, stdout, stderr) => {
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
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Parse metadata if available
    let metadata = {};
    try {
      if (req.body.metadata) {
        metadata = JSON.parse(req.body.metadata);
      }
    } catch (error) {
      console.error('Error parsing metadata:', error);
    }
    
    // Get name from metadata or use a default
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
    
  } catch (error) {
    console.error('Error processing face image upload:', error);
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

    // Get detection and video info with correct column order
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
      console.log(`No detection found for ID ${detectionId}`);
      return res.status(404).json({ error: 'Detection not found' });
    }

    const detection = detections[0];
    console.log('Detection found:', detection);

    // Handle both absolute and relative paths
    let videoPath = detection.path;
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
    const startFrame = Math.max(0, detection.start_frame - (fps * paddingSeconds));
    const endFrame = detection.end_frame + (fps * paddingSeconds);
    
    console.log('Generating clip with params:', {
      videoPath,
      clipPath,
      startFrame,
      endFrame,
      fps,
      duration: detection.duration_seconds
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

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/clips', express.static(path.join(__dirname, 'clips')));
app.use('/api/face-temp', express.static(path.join(faceImagesDir, 'temp'))); 