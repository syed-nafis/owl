#!/usr/bin/env python3
"""
Check the dimensions of face embeddings in the database
"""
import os
import pickle
import numpy as np
import mysql.connector
import json
import sys

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

def check_pickle_db():
    """Check the pickle database file"""
    pickle_file = 'mediapipe_face_db.pkl'
    
    if not os.path.exists(pickle_file):
        print(f"Pickle database file not found: {pickle_file}")
        return
    
    try:
        with open(pickle_file, 'rb') as f:
            db = pickle.load(f)
        
        print(f"Pickle database contains {len(db)} faces:")
        for name, data in db.items():
            embeddings = data['embeddings']
            shapes = [e.shape for e in embeddings]
            print(f"- {name}: {len(embeddings)} embeddings with shapes {shapes}")
    except Exception as e:
        print(f"Error reading pickle database: {e}")

def check_mysql_db():
    """Check the MySQL database"""
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database")
        return
    
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM known_faces")
    known_faces = cursor.fetchall()
    
    print(f"\nMySQL database contains {len(known_faces)} faces:")
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
                shape = embedding.shape
                
                print(f"- {name}: embedding shape {shape}")
            else:
                print(f"- {name}: No encoding found")
        except Exception as e:
            print(f"- Error processing face {face.get('name', 'Unknown')}: {e}")
    
    cursor.close()
    conn.close()

if __name__ == "__main__":
    print("Checking face embedding dimensions...")
    print("\n1. Checking pickle database:")
    check_pickle_db()
    
    print("\n2. Checking MySQL database:")
    check_mysql_db() 