#!/bin/bash

echo "Setting up Owl Security Face Detection System"
echo "============================================="

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d " " -f 2)
echo "Detected Python version: $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "env" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv env
fi

# Activate virtual environment
echo "Activating virtual environment..."
source env/bin/activate

# Install setuptools first (helps with Python 3.13)
echo "Installing/upgrading setuptools..."
pip install --upgrade pip setuptools wheel

# Check if running on macOS with Apple Silicon
if [[ "$(uname)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    echo "Detected macOS on Apple Silicon"
    
    # Install OpenCV and NumPy first
    echo "Installing NumPy and OpenCV..."
    pip install numpy>=1.26.0 opencv-python>=4.8.0
    
    echo "Note: Face recognition will use OpenCV fallback on Apple Silicon"
    # Skip dlib and face_recognition as they're problematic on Apple Silicon
else
    # Install all requirements
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
fi

# Install ultralytics for YOLOv11x support
echo "Installing ultralytics for YOLOv11x support..."
pip install ultralytics

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install mysql2

# Check if MySQL is installed
if command -v mysql &> /dev/null; then
    echo "MySQL is installed"
    
    # Ask for MySQL credentials
    read -p "MySQL username (default: root): " MYSQL_USER
    MYSQL_USER=${MYSQL_USER:-root}
    read -sp "MySQL password: " MYSQL_PASSWORD
    echo ""
    
    # Create database
    echo "Creating database..."
    mysql -u $MYSQL_USER -p$MYSQL_PASSWORD -e "CREATE DATABASE IF NOT EXISTS owl_security;"
    
    # Import schema
    echo "Importing database schema..."
    mysql -u $MYSQL_USER -p$MYSQL_PASSWORD owl_security < owl_security_db.sql
    
    # Update server.js with credentials
    echo "Updating server.js with database credentials..."
    sed -i.bak "s/'password': ''/'password': '$MYSQL_PASSWORD'/g" server.js
else
    echo "MySQL not found. Please install MySQL and run:"
    echo "  mysql -u root -p < owl_security_db.sql"
fi

# Create directories if they don't exist
mkdir -p videos

echo ""
echo "Setup complete!"
echo "To start the server, run: node server.js"
echo "To process videos manually, run: python video_processor.py --video <path_to_video>"
echo "" 