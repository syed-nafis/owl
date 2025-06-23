CREATE DATABASE IF NOT EXISTS owl_security;
USE owl_security;

CREATE TABLE IF NOT EXISTS `videos` (
  `video_id` INT NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(255) NOT NULL,
  `path` VARCHAR(255) NOT NULL,
  `camera_role` VARCHAR(50) DEFAULT 'unknown',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `duration_seconds` INT DEFAULT NULL,
  `processed` BOOLEAN DEFAULT false,
  PRIMARY KEY (`video_id`),
  INDEX `idx_camera_role` (`camera_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `known_faces` (
  `known_face_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'Unknown',
  `face_encoding` TEXT DEFAULT NULL,
  `image_path` VARCHAR(255) DEFAULT NULL,
  `date_added` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `access_bedroom` BOOLEAN DEFAULT false,
  `access_living_room` BOOLEAN DEFAULT false,
  `access_kitchen` BOOLEAN DEFAULT false,
  `access_front_door` BOOLEAN DEFAULT false,
  PRIMARY KEY (`known_face_id`),
  INDEX `idx_name` (`name`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `face_images` (
  `image_id` INT NOT NULL AUTO_INCREMENT,
  `known_face_id` INT NOT NULL,
  `image_path` VARCHAR(255) NOT NULL,
  `date_added` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  FOREIGN KEY (`known_face_id`) REFERENCES `known_faces` (`known_face_id`) ON DELETE CASCADE,
  INDEX `idx_known_face` (`known_face_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `detections` (
  `detection_id` INT NOT NULL AUTO_INCREMENT,
  `video_id` INT NOT NULL,
  `detection_type` VARCHAR(20) NOT NULL, -- 'person', 'animal', 'object', etc.
  `object_class` VARCHAR(50) DEFAULT NULL, -- specific class if available
  `confidence` FLOAT DEFAULT 0,
  `frame_number` INT DEFAULT NULL,
  `bounding_box` JSON DEFAULT NULL, -- Store as JSON: {x1, y1, x2, y2}
  `camera_role` VARCHAR(50) DEFAULT 'unknown',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `start_frame` INT DEFAULT NULL,
  `end_frame` INT DEFAULT NULL,
  PRIMARY KEY (`detection_id`),
  FOREIGN KEY (`video_id`) REFERENCES `videos` (`video_id`) ON DELETE CASCADE,
  INDEX `idx_video_detection` (`video_id`, `detection_type`),
  INDEX `idx_camera` (`camera_role`),
  INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faces` (
  `face_id` INT NOT NULL AUTO_INCREMENT,
  `video_id` INT NOT NULL,
  `frame_number` INT DEFAULT NULL,
  `person_name` VARCHAR(100) DEFAULT 'Unknown',
  `confidence` FLOAT DEFAULT 0,
  `bounding_box` JSON DEFAULT NULL, -- Store as JSON: {x1, y1, x2, y2}
  `camera_role` VARCHAR(50) DEFAULT 'unknown',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `start_frame` INT DEFAULT NULL,
  `end_frame` INT DEFAULT NULL,
  PRIMARY KEY (`face_id`),
  FOREIGN KEY (`video_id`) REFERENCES `videos` (`video_id`) ON DELETE CASCADE,
  INDEX `idx_video` (`video_id`),
  INDEX `idx_person` (`person_name`),
  INDEX `idx_camera` (`camera_role`),
  INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `face_matches` (
  `match_id` INT NOT NULL AUTO_INCREMENT,
  `face_id` INT NOT NULL,
  `known_face_id` INT NOT NULL,
  `similarity_score` FLOAT DEFAULT 0,
  `is_authorized` BOOLEAN DEFAULT false,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`match_id`),
  FOREIGN KEY (`face_id`) REFERENCES `faces` (`face_id`) ON DELETE CASCADE,
  FOREIGN KEY (`known_face_id`) REFERENCES `known_faces` (`known_face_id`) ON DELETE CASCADE,
  INDEX `idx_face_match` (`face_id`, `known_face_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `events` (
  `event_id` INT NOT NULL AUTO_INCREMENT,
  `event_type` VARCHAR(50) NOT NULL, -- 'motion', 'face_detected', 'unauthorized_access', etc.
  `camera_role` VARCHAR(50) NOT NULL,
  `detection_id` INT DEFAULT NULL,
  `face_id` INT DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `notification_sent` BOOLEAN DEFAULT false,
  PRIMARY KEY (`event_id`),
  INDEX `idx_timestamp` (`timestamp`),
  INDEX `idx_type` (`event_type`),
  INDEX `idx_camera` (`camera_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 