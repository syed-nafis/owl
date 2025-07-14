# Utility Scripts

This directory contains utility scripts for the Owl Security System server.

## Database Scripts
- `check_db_stats.js` - Check database statistics and health
- `check_face_db.py` - Check face database integrity

## Setup Scripts
- `setup.sh` - Main setup script for the server
- `setup_insightface.py` - Setup InsightFace model
- `setup_light_detection.sh` - Setup light detection system
- `start.sh` - Start the server
- `start_pi.sh` - Start the server on Raspberry Pi

## Utility Scripts
- `calculate_light_thresholds.py` - Calculate optimal light detection thresholds
- `extract_face.py` - Extract faces from images
- `fix_face_embeddings.py` - Fix face embedding issues
- `fix_pickle_db.py` - Fix pickle database corruption
- `check_embeddings.py` - Check face embedding quality
- `reenroll_faces.py` - Re-enroll faces in the database
- `process_all_videos.py` - Process all videos in batch
- `update_detection_settings.py` - Update detection settings

## Usage

Make scripts executable:
```bash
chmod +x *.sh
```

Run setup:
```bash
./setup.sh
```

Start server:
```bash
./start.sh
``` 