#!/usr/bin/env node

const mysql = require('mysql2/promise');

// Database configuration
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'owl_security'
};

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('Connected to database successfully\n');

    // 1. Count detections by type
    console.log('OBJECT DETECTIONS BY TYPE:');
    const [detectionTypes] = await connection.query(`
      SELECT detection_type, COUNT(*) AS count 
      FROM detections 
      GROUP BY detection_type
    `);
    console.table(detectionTypes);

    // 2. Count all object classes detected
    console.log('\nOBJECT CLASSES DETECTED:');
    const [objectClasses] = await connection.query(`
      SELECT object_class, COUNT(*) AS count
      FROM detections
      GROUP BY object_class
      ORDER BY count DESC
    `);
    console.table(objectClasses);

    // 3. Count faces by name
    console.log('\nFACE RECOGNITIONS BY NAME:');
    const [facesByName] = await connection.query(`
      SELECT person_name, COUNT(*) AS count 
      FROM faces 
      GROUP BY person_name 
      ORDER BY count DESC
    `);
    console.table(facesByName);

    // 4. Known faces in database
    console.log('\nKNOWN FACES IN DATABASE:');
    const [knownFaces] = await connection.query(`
      SELECT known_face_id, name, role, date_added 
      FROM known_faces
      ORDER BY date_added DESC
    `);
    console.table(knownFaces);

    // 5. Summary statistics
    console.log('\nSUMMARY STATISTICS:');
    const [totalDetections] = await connection.query('SELECT COUNT(*) AS count FROM detections');
    const [totalFaces] = await connection.query('SELECT COUNT(*) AS count FROM faces');
    const [totalKnownFaces] = await connection.query('SELECT COUNT(*) AS count FROM known_faces');
    const [totalVideos] = await connection.query('SELECT COUNT(*) AS count FROM videos');
    
    console.log(`Total object detections: ${totalDetections[0].count}`);
    console.log(`Total face detections: ${totalFaces[0].count}`);
    console.log(`Total known individuals: ${totalKnownFaces[0].count}`);
    console.log(`Total videos in database: ${totalVideos[0].count}`);

  } catch (error) {
    console.error('Error querying database:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nDatabase connection closed');
    }
  }
}

main(); 