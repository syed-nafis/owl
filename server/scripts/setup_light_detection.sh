#!/bin/bash

# Setup script for Light Detection Day/Night Configuration Feature

echo "🌞🌙 Setting up Light Detection Day/Night Configuration..."

# Make Python scripts executable
chmod +x calculate_light_thresholds.py

# Create the database tables
echo "📊 Creating database tables..."
mysql -u root -p owl_security < create_light_detection_tables.sql

if [ $? -eq 0 ]; then
    echo "✅ Database tables created successfully!"
else
    echo "❌ Error creating database tables. Please check your MySQL connection."
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p light_references
mkdir -p captures/light_references

echo "✅ Setup complete!"
echo ""
echo "🚀 Light Detection Day/Night Configuration is now ready!"
echo ""
echo "📋 Next steps:"
echo "1. Go to Settings in your app"
echo "2. Find the 'Detect Light On/Off' section"
echo "3. Configure Day settings by capturing reference images"
echo "4. Configure Night settings by capturing reference images"
echo "5. The system will automatically use appropriate thresholds based on time of day"
echo ""
echo "ℹ️  Day time is considered 6AM - 8PM"
echo "ℹ️  Night time is considered 8PM - 6AM"
echo "" 