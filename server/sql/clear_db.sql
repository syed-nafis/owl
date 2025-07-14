-- SQL script to clear tables and reset videos
USE owl_security;

-- Disable foreign key checks to avoid constraint errors
SET FOREIGN_KEY_CHECKS=0;

-- Clear data from all tables except known_faces, face_images, and videos
DELETE FROM face_matches;
DELETE FROM faces;
DELETE FROM detections;
DELETE FROM events;

-- Update all videos to set processed=false
UPDATE videos SET processed = false;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS=1;

-- Report completion
SELECT 'Database reset: All tables cleared except known_faces, face_images, and videos. All videos marked as unprocessed.' AS Message; 