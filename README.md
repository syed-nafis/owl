# 🦉 Owl Security System

A comprehensive home security system with AI-powered face recognition, object detection, smart lighting automation, and mobile app integration.

## 🚀 Features

### 🔐 Security & Surveillance
- **Real-time Video Recording** - Continuous video capture with motion detection
- **AI Face Recognition** - Identify known individuals using InsightFace and MediaPipe
- **Object Detection** - Detect people, animals, vehicles using YOLOv8
- **Access Control** - Room-based permissions for different individuals
- **Event Timeline** - Complete history of all security events

### 💡 Smart Lighting
- **Day/Night Detection** - Automatic light state detection based on time
- **Smart Automation** - Control lights based on occupancy and time
- **ESP8266 Integration** - WiFi-enabled light control modules
- **Energy Efficiency** - Optimize lighting based on natural light levels

### 📱 Mobile App
- **React Native App** - Cross-platform mobile application
- **Real-time Notifications** - Push notifications for security events
- **Live Video Streaming** - View camera feeds remotely
- **Face Management** - Add/remove authorized individuals
- **Settings Control** - Configure system parameters

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Raspberry Pi  │    │   ESP8266       │    │   Mobile App    │
│   (Server)      │◄──►│   (Lighting)    │◄──►│   (React Native)│
│                 │    │                 │    │                 │
│ • Video Capture │    │ • Light Control │    │ • Live View     │
│ • Face Detection│    │ • WiFi Module   │    │ • Notifications │
│ • AI Processing │    │ • Sensors       │    │ • Settings      │
│ • Database      │    │ • Automation    │    │ • Face Mgmt     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

### Hardware Requirements
- **Raspberry Pi 4** (4GB RAM recommended)
- **Pi Camera Module** (v2 or v3)
- **ESP8266 Modules** (for smart lighting)
- **LED Strips/Lights** (for automation)
- **MicroSD Card** (32GB+ recommended)

### Software Requirements
- **Python 3.8+**
- **Node.js 16+**
- **MySQL 8.0+**
- **OpenCV**
- **TensorFlow/PyTorch**

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/owl-security-system.git
cd owl-security-system
```

### 2. Server Setup (Raspberry Pi)

#### Install Dependencies
```bash
cd server
python -m venv env
source env/bin/activate  # On Windows: env\Scripts\activate
pip install -r requirements.txt
```

#### Database Setup
```bash
# Install MySQL
sudo apt-get install mysql-server

# Create database
mysql -u root -p < owl_security_db.sql
```

#### Download AI Models
```bash
# Download YOLOv8 model
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt

# Download InsightFace models (if needed)
# Models will be downloaded automatically on first run
```

#### Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials and settings
```

### 3. ESP8266 Setup

#### Install Arduino IDE
1. Download Arduino IDE
2. Add ESP8266 board support
3. Install required libraries:
   - ESP8266WiFi
   - ESP8266WebServer
   - ArduinoJson

#### Upload Code
1. Open `esp8266_control_panel.ino`
2. Configure WiFi credentials
3. Upload to ESP8266 module

### 4. Mobile App Setup

#### Install Dependencies
```bash
cd owl
npm install
```

#### Configure Expo
```bash
npx expo install
```

#### Start Development Server
```bash
npx expo start
```

## 🚀 Usage

### Starting the System

#### 1. Start Server
```bash
cd server
python server.js
```

#### 2. Start Mobile App
```bash
cd owl
npx expo start
```

#### 3. Access Web Interface
Open browser to `http://localhost:3000`

### Adding Known Faces

1. **Via Mobile App:**
   - Open app → Faces tab
   - Tap "Add Person"
   - Take photo or select from gallery
   - Enter name and permissions

2. **Via Web Interface:**
   - Go to `/admin/faces`
   - Upload face images
   - Configure access permissions

### Configuring Smart Lighting

1. **Setup ESP8266:**
   - Connect to WiFi
   - Note IP address
   - Configure light zones

2. **Configure Automation:**
   - Set light detection thresholds
   - Define automation rules
   - Test light control

## 📊 Database Schema

The system uses MySQL with the following main tables:

- **`videos`** - Video recordings and metadata
- **`known_faces`** - Authorized individuals
- **`face_images`** - Reference face images
- **`detections`** - Object detection events
- **`faces`** - Detected faces in videos
- **`lighting_events`** - Light state changes
- **`access_logs`** - Entry/exit events

## 🔧 Configuration

### Server Configuration (`server/config.py`)
```python
# Database settings
DB_HOST = 'localhost'
DB_USER = 'owl_user'
DB_PASS = 'your_password'
DB_NAME = 'owl_security'

# Camera settings
CAMERA_RESOLUTION = (1920, 1080)
CAMERA_FPS = 30

# AI settings
FACE_RECOGNITION_THRESHOLD = 0.6
OBJECT_DETECTION_CONFIDENCE = 0.5
```

### ESP8266 Configuration (`esp8266_control_panel.ino`)
```cpp
// WiFi settings
const char* ssid = "YourWiFiSSID";
const char* password = "YourWiFiPassword";

// Server settings
const char* serverHost = "192.168.1.100";
const int serverPort = 3000;
```

## 🧪 Testing

### Run Test Suite
```bash
cd server/tests
python -m pytest
```

### Test Individual Components
```bash
# Test face detection
python test_face_detection.py

# Test light detection
python test_light_detection.py

# Test ESP8266 communication
python test_esp_button.py
```

## 📱 API Endpoints

### Security Endpoints
- `GET /api/videos` - List recorded videos
- `POST /api/faces` - Add new face
- `GET /api/detections` - Get detection events
- `POST /api/access` - Log access event

### Lighting Endpoints
- `GET /api/lights` - Get light status
- `POST /api/lights` - Control lights
- `GET /api/automation` - Get automation rules

### Mobile App Endpoints
- `GET /api/stream` - Live video stream
- `POST /api/notifications` - Send notifications
- `GET /api/settings` - Get system settings

## 🔒 Security Considerations

- **Encryption** - All communications use HTTPS
- **Authentication** - JWT-based API authentication
- **Access Control** - Role-based permissions
- **Data Privacy** - Face data is encrypted at rest
- **Network Security** - Firewall and VPN recommendations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenCV** - Computer vision library
- **InsightFace** - Face recognition models
- **YOLOv8** - Object detection
- **React Native** - Mobile app framework
- **ESP8266** - IoT microcontroller

## 📞 Support

- **Documentation**: [Wiki](https://github.com/yourusername/owl-security-system/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/owl-security-system/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/owl-security-system/discussions)

## 🔄 Version History

- **v1.0.0** - Initial release with basic security features
- **v1.1.0** - Added smart lighting automation
- **v1.2.0** - Mobile app integration
- **v1.3.0** - Enhanced AI models and performance

---

**Made with ❤️ for home security** 