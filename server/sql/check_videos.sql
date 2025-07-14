-- Check videos and their processing status
USE owl_security;

-- Count total videos
SELECT COUNT(*) AS total_videos FROM videos;

-- Count unprocessed videos
SELECT COUNT(*) AS unprocessed_videos FROM videos WHERE processed = false OR processed IS NULL;

-- Count processed videos
SELECT COUNT(*) AS processed_videos FROM videos WHERE processed = true; 