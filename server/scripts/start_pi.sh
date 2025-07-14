#!/bin/bash

# Owl Camera Script for Raspberry Pi
# This script helps start the camera script and connect to the server

echo "========================================"
echo "  Owl Pi Camera System"
echo "========================================"

# Create recordings directory if it doesn't exist
if [ ! -d "recordings" ]; then
  echo "Creating recordings directory..."
  mkdir -p recordings
fi

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
  echo "Error: Python3 is not installed. Please install Python3 first."
  exit 1
fi

# Display help for server IP input
echo ""
echo "You need to specify the IP address of your Owl server."
echo "Example: 192.168.1.100"
echo ""

# Ask for server IP
read -p "Enter server IP address: " SERVER_IP

if [ -z "$SERVER_IP" ]; then
  echo "Error: Server IP cannot be empty"
  exit 1
fi

# Display system info
echo ""
echo "System Information:"
echo "- Pi IP:       $(hostname -I | awk '{print $1}')"
echo "- Server IP:   $SERVER_IP"
echo "- Server Port: 9000"
echo "- Storage:     recordings/ directory"
echo ""

# Start the camera script
echo "Starting camera script..."
echo "Press Ctrl+C to stop the camera"
echo ""

# Run the camera script with the specified server IP
python3 pi_camera.py --server "http://$SERVER_IP:9000" 