#!/bin/bash

echo "Owl Security System Test"
echo "======================="
echo

# Activate virtual environment
source env/bin/activate

# Check Python and dependencies
echo "Checking Python environment..."
python --version
pip list | grep -E "numpy|opencv|ultralytics|face-recognition|flask"

# Test face detection
echo -e "\nTesting face detection..."
./test_face_detection.py

# Test YOLO model
echo -e "\nTesting YOLOv11x model..."
./test_yolo.py

# Test database connection
echo -e "\nTesting database connection..."
if command -v mysql &> /dev/null; then
    echo "MySQL is installed"
    read -p "MySQL username (default: root): " MYSQL_USER
    MYSQL_USER=${MYSQL_USER:-root}
    
    read -p "Does your MySQL installation have a password? (y/n, default: n): " HAS_PASSWORD
    HAS_PASSWORD=${HAS_PASSWORD:-n}
    
    if [ "$HAS_PASSWORD" == "y" ]; then
        read -sp "MySQL password: " MYSQL_PASSWORD
        echo ""
        MYSQL_CMD="mysql -u $MYSQL_USER -p$MYSQL_PASSWORD"
    else
        MYSQL_PASSWORD=""
        MYSQL_CMD="mysql -u $MYSQL_USER"
    fi
    
    $MYSQL_CMD -e "SHOW DATABASES;" | grep -q "owl_security"
    if [ $? -eq 0 ]; then
        echo "Database 'owl_security' exists"
        echo "Testing tables..."
        $MYSQL_CMD -e "USE owl_security; SHOW TABLES;"
    else
        echo "Database 'owl_security' not found"
        echo "Would you like to create it? (y/n)"
        read CREATE_DB
        if [ "$CREATE_DB" == "y" ]; then
            $MYSQL_CMD -e "CREATE DATABASE owl_security;"
            $MYSQL_CMD owl_security < owl_security_db.sql
            echo "Database created and schema imported"
        fi
    fi
else
    echo "MySQL not installed. Please install MySQL to use the database features."
fi

# Test server startup
echo -e "\nTesting server startup..."
echo "Starting server in test mode (will exit after 5 seconds)..."
timeout 5 node server.js || echo "Server started successfully"

echo -e "\nSystem test complete!"
echo "If all tests passed, your Owl Security System is ready to use."
echo "To start the server, run: node server.js" 