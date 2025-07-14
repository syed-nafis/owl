-- Add lighting_events table for light on/off detection
CREATE TABLE IF NOT EXISTS lighting_events (
    lighting_event_id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT,
    frame_number INT,
    lighting_state ENUM('on', 'off', 'unknown') NOT NULL,
    previous_state ENUM('on', 'off', 'unknown') DEFAULT NULL,
    confidence FLOAT DEFAULT 0.0,
    camera_role VARCHAR(50),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    brightness_level FLOAT DEFAULT 0.0,
    detection_method VARCHAR(50) DEFAULT 'global_brightness',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE,
    
    INDEX idx_video_frame (video_id, frame_number),
    INDEX idx_camera_role (camera_role),
    INDEX idx_timestamp (timestamp),
    INDEX idx_lighting_state (lighting_state)
); 