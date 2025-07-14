#!/usr/bin/env python3
"""
Fix Pickle Database File

This script updates the pickle database file to match the MySQL database,
ensuring consistent embedding dimensions.
"""
import os
import pickle
import numpy as np
import mysql.connector
import json
import sys

# Standardized embedding size to use
STANDARD_EMBEDDING_SIZE = 512  # InsightFace w600k_r50 model typically outputs 512-dim embeddings

def get_db_connection():
    try:
        return mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="owl_security"
        )
    except Exception as e:
        print(f"Database connection error: {e}")
        return None

def update_pickle_db():
    """Update the pickle database to match MySQL database"""
    pickle_file = 'mediapipe_face_db.pkl'
    backup_file = 'mediapipe_face_db.pkl.bak'
    
    # First create a backup
    if os.path.exists(pickle_file):
        try:
            with open(pickle_file, 'rb') as f:
                db = pickle.load(f)
            
            # Make a backup
            with open(backup_file, 'wb') as f:
                pickle.dump(db, f)
            print(f"Created backup of pickle database: {backup_file}")
        except Exception as e:
            print(f"Error backing up pickle database: {e}")
            return False
    else:
        print(f"Pickle database file not found: {pickle_file}")
        db = {}
    
    # Connect to MySQL database
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database")
        return False
    
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM known_faces")
    known_faces = cursor.fetchall()
    
    print(f"Found {len(known_faces)} faces in MySQL database")
    
    # Update pickle database with MySQL data
    updated_db = {}
    for face in known_faces:
        try:
            name = face.get('name', 'Unknown')
            face_encoding_str = face.get('face_encoding', '')
            
            if face_encoding_str:
                # Convert to string if it's not already
                if not isinstance(face_encoding_str, str):
                    face_encoding_str = str(face_encoding_str)
                
                # Parse the face encoding
                embedding = np.array(json.loads(face_encoding_str))
                
                # Get existing data or create new
                if name in db:
                    role = db[name].get('role', 'Person')
                    access = db[name].get('access', {
                        'bedroom': bool(face.get('access_bedroom', False)),
                        'living_room': bool(face.get('access_living_room', False)),
                        'kitchen': bool(face.get('access_kitchen', False)),
                        'front_door': bool(face.get('access_front_door', False))
                    })
                else:
                    role = 'Person'
                    access = {
                        'bedroom': bool(face.get('access_bedroom', False)),
                        'living_room': bool(face.get('access_living_room', False)),
                        'kitchen': bool(face.get('access_kitchen', False)),
                        'front_door': bool(face.get('access_front_door', False))
                    }
                
                # Update database entry
                updated_db[name] = {
                    'role': role,
                    'embeddings': [embedding],
                    'access': access
                }
                
                print(f"Updated {name} in pickle database with embedding shape {embedding.shape}")
            else:
                print(f"No encoding found for {name}, skipping")
        except Exception as e:
            print(f"Error processing face {face.get('name', 'Unknown')}: {e}")
    
    cursor.close()
    conn.close()
    
    # Add back any test entries
    for name, data in db.items():
        if name.startswith('Test_Size_'):
            updated_db[name] = data
            print(f"Preserved test entry: {name}")
    
    # Save updated database
    with open(pickle_file, 'wb') as f:
        pickle.dump(updated_db, f)
    
    print(f"Updated pickle database saved to {pickle_file}")
    return True

if __name__ == "__main__":
    print("Updating pickle database to match MySQL database...")
    if update_pickle_db():
        print("\nSuccess! Pickle database updated successfully.")
    else:
        print("\nFailed to update pickle database.")
    
    # Verify the update
    try:
        with open('mediapipe_face_db.pkl', 'rb') as f:
            db = pickle.load(f)
        
        print(f"\nVerification: Pickle database now contains {len(db)} faces:")
        for name, data in db.items():
            embeddings = data['embeddings']
            shapes = [e.shape for e in embeddings]
            print(f"- {name}: {len(embeddings)} embeddings with shapes {shapes}")
    except Exception as e:
        print(f"Error verifying pickle database: {e}") 