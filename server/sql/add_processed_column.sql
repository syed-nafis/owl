-- Add processed column to videos table
USE owl_security;

-- Try to add the processed column (will succeed if it doesn't exist, fail if it does)
ALTER TABLE videos ADD COLUMN processed BOOLEAN DEFAULT false;

-- Update all videos to set processed=false
UPDATE videos SET processed = false;

-- Report completion
SELECT 'All videos marked as unprocessed.' AS Message; 