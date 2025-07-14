-- Create tables for light detection configuration

-- Table to store light reference images
CREATE TABLE IF NOT EXISTS light_reference_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section ENUM('day', 'night') NOT NULL,
    image_type ENUM('on', 'off') NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    camera_ip VARCHAR(45),
    hostname VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_section_type (section, image_type),
    INDEX idx_section (section),
    INDEX idx_image_type (image_type),
    INDEX idx_timestamp (timestamp)
);

-- Create table for light detection thresholds
CREATE TABLE IF NOT EXISTS light_detection_thresholds (
    threshold_id INT AUTO_INCREMENT PRIMARY KEY,
    section ENUM('day', 'night') NOT NULL,
    brightness_threshold_low FLOAT NOT NULL,
    brightness_threshold_high FLOAT NOT NULL,
    bright_pixel_ratio_on FLOAT NOT NULL,
    bright_pixel_ratio_off FLOAT NOT NULL,
    threshold_configured BOOLEAN DEFAULT FALSE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY idx_section (section)
);

-- Create table for lighting events
CREATE TABLE IF NOT EXISTS lighting_events (
    lighting_event_id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT,
    frame_number INT,
    lighting_state ENUM('on', 'off', 'unknown'),
    previous_state ENUM('on', 'off', 'unknown'),
    confidence FLOAT,
    timestamp DATETIME,
    brightness_level FLOAT,
    detection_method VARCHAR(50),
    
    INDEX idx_video (video_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_state (lighting_state)
);

-- Create table for lighting automation log
CREATE TABLE IF NOT EXISTS lighting_automation_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_timestamp (timestamp),
    INDEX idx_action (action)
);

-- Insert default thresholds
INSERT INTO light_detection_thresholds 
    (section, brightness_threshold_low, brightness_threshold_high, bright_pixel_ratio_on, bright_pixel_ratio_off, threshold_configured)
VALUES 
    ('day', 50, 120, 0.15, 0.05, TRUE),
    ('night', 40, 100, 0.12, 0.04, TRUE)
ON DUPLICATE KEY UPDATE
    brightness_threshold_low = VALUES(brightness_threshold_low),
    brightness_threshold_high = VALUES(brightness_threshold_high),
    bright_pixel_ratio_on = VALUES(bright_pixel_ratio_on),
    bright_pixel_ratio_off = VALUES(bright_pixel_ratio_off),
    threshold_configured = VALUES(threshold_configured),
    last_updated = CURRENT_TIMESTAMP; 