# Test Files

This directory contains all test files for the Owl Security System server.

## Test Categories

### Face Recognition Tests
- `test_face_recognition.py` - Tests for face recognition functionality
- `test_face_detection.py` - Tests for face detection algorithms
- `test_mediapipe_face.py` - Tests for MediaPipe face processing
- `test_mediapipe_face_temp.py` - Temporary face processing tests
- `test_insightface.py` - Tests for InsightFace model
- `test_recognition_fix.py` - Tests for face recognition fixes
- `test_embedding_fix.py` - Tests for face embedding fixes

### Video Processing Tests
- `test_video_recognition.py` - Tests for video face recognition
- `test_video_recognition_no_alignment.py` - Tests without face alignment
- `test_video_smart_lighting.py` - Tests for smart lighting with video
- `test_multi_video_smart_lighting.py` - Tests for multiple video processing

### Lighting System Tests
- `test_light_detection.py` - Tests for light detection system
- `test_light_advanced.py` - Advanced lighting tests
- `test_light_advanced_broken.py` - Broken lighting tests (for debugging)
- `test_smart_lighting.py` - Tests for smart lighting automation
- `test_quick_lighting.py` - Quick lighting tests

### System Tests
- `test_enhanced_pipeline.py` - Tests for enhanced processing pipeline
- `test_system.sh` - System integration tests
- `test_esp_button.py` - Tests for ESP8266 button functionality
- `test_door_access.js` - Tests for door access control

## Running Tests

To run all tests:
```bash
cd server/tests
python -m pytest
```

To run specific test files:
```bash
python test_face_recognition.py
python test_light_detection.py
``` 