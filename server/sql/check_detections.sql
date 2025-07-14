-- Check detections and faces found so far
USE owl_security;

-- Count detections by type
SELECT detection_type, COUNT(*) AS count 
FROM detections 
GROUP BY detection_type;

-- Count faces by name
SELECT person_name, COUNT(*) AS count 
FROM faces 
GROUP BY person_name 
ORDER BY count DESC;

-- Show object classes detected
SELECT object_class, COUNT(*) AS count
FROM detections
GROUP BY object_class
ORDER BY count DESC;

-- Sample of the most recent detections
SELECT detection_id, detection_type, object_class, confidence, camera_role
FROM detections 
ORDER BY detection_id DESC 
LIMIT 10;

-- Sample of the most recent faces
SELECT face_id, person_name, confidence, camera_role
FROM faces 
ORDER BY face_id DESC 
LIMIT 10; 