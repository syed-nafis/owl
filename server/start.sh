#!/bin/bash

# Owl Home Security Camera System Starter Script
# This script helps start the server and provides instructions for the Pi camera

echo "========================================"
echo "  Owl Home Security Camera System"
echo "========================================"

# Create videos directory if it doesn't exist
if [ ! -d "videos" ]; then
  echo "Creating videos directory..."
  mkdir -p videos
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed. Please install Node.js first."
  exit 1
fi

# Display system info
echo ""
echo "System Information:"
echo "- Server IP:   $(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)"
echo "- Server Port: 9000"
echo "- Storage:     videos/ directory"
echo ""

# Start the server
echo "Starting Owl server..."
echo "Press Ctrl+C to stop the server"
echo ""
node server.js

# Note: This script doesn't handle termination gracefully since node will run in foreground 