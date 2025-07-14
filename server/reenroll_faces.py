#!/usr/bin/env python3
"""
Re-enroll Face Images

This script focuses on re-enrolling specific face identities (Nafis and Nafis v2)
that are not being correctly recognized after the embedding standardization.
"""
import os
import sys
import cv2
import logging
import pickle
import glob
from mediapipe_face import (
    init_face_recognition,
    extract_faces_from_image,
    add_face_to_database,
    recognize_face,
    load_known_faces_from_db,
    get_db_connection,
    face_database,
    encode_face_for_json,
    FACE_DB_FILE
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def reenroll_person(name, image_path, role="Person"):
    """Re-enroll a person using a specific image"""
    print(f"\nRe-enrolling {name} with image: {image_path}")
    
    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        return False
    
    # Extract faces from image
    faces = extract_faces_from_image(image_path)
    
    if not faces:
        print(f"No faces detected in {image_path}")
        return False
    
    print(f"Detected {len(faces)} faces")
    
    # Use the largest face (usually the main subject)
    best_face = max(faces, key=lambda f: 
        (f['bbox'][2] - f['bbox'][0]) * (f['bbox'][3] - f['bbox'][1]))
    
    # Get embedding and check shape
    embedding = best_face['embedding']
    print(f"Embedding shape: {embedding.shape}")
    
    # Add to database
    result = add_face_to_database(name, role, best_face, {
        'bedroom': True,
        'living_room': True,
        'kitchen': True,
        'front_door': True
    })
    
    if result:
        print(f"Successfully re-enrolled {name}")
        
        # Also update the MySQL database
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor(dictionary=True)
                
                # Check if person exists
                cursor.execute("SELECT * FROM known_faces WHERE name = %s", (name,))
                existing = cursor.fetchone()
                
                # Encode the embedding for storage
                encoded_embedding = encode_face_for_json(embedding)
                
                if existing:
                    # Update existing person
                    cursor.execute(
                        "UPDATE known_faces SET face_encoding = %s WHERE known_face_id = %s",
                        (encoded_embedding, existing['known_face_id'])
                    )
                    print(f"Updated {name} in MySQL database")
                else:
                    # Insert new person
                    cursor.execute(
                        """INSERT INTO known_faces 
                           (name, role, face_encoding, access_bedroom, access_living_room, access_kitchen, access_front_door) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                        (name, role, encoded_embedding, True, True, True, True)
                    )
                    print(f"Added {name} to MySQL database")
                
                conn.commit()
                cursor.close()
                conn.close()
            except Exception as e:
                print(f"Error updating MySQL database: {e}")
                if conn:
                    conn.close()
        
        # Save a visual result
        result_img = cv2.imread(image_path)
        x1, y1, x2, y2 = [int(v) for v in best_face['bbox']]
        cv2.rectangle(result_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(result_img, name, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        result_path = os.path.join(os.path.dirname(image_path), f"enrolled_{os.path.basename(image_path)}")
        cv2.imwrite(result_path, result_img)
        print(f"Saved enrollment result to {result_path}")
        
        return True
    else:
        print(f"Failed to re-enroll {name}")
        return False

def main():
    """Main function"""
    # Initialize face recognition
    print("Initializing face recognition system...")
    if not init_face_recognition():
        print("Failed to initialize face recognition")
        return
    
    # Persons to re-enroll
    persons_to_enroll = [
        # Nafis
        {
            'name': 'Nafis',
            'image_path': 'face_images/temp/nafis/1750693254658-capture_Nafis_20250623_064054.jpg',
            'role': 'Family'
        },
        # Nafis v2
        {
            'name': 'Nafis v2',
            'image_path': 'face_images/temp/nafis_v2/1750696857489-face.jpg',
            'role': 'Family'
        }
    ]
    
    # Re-enroll each person
    for person in persons_to_enroll:
        reenroll_person(person['name'], person['image_path'], person['role'])
    
    # Reload the database and verify
    print("\nReloading database...")
    load_known_faces_from_db()
    
    # Test recognition
    print("\nTesting recognition after re-enrollment...")
    for person in persons_to_enroll:
        name = person['name']
        image_path = person['image_path']
        
        print(f"\nTesting recognition for {name} with {image_path}")
        faces = extract_faces_from_image(image_path)
        
        if not faces:
            print(f"No faces detected in {image_path}")
            continue
        
        best_face = max(faces, key=lambda f: 
            (f['bbox'][2] - f['bbox'][0]) * (f['bbox'][3] - f['bbox'][1]))
        
        recognition = recognize_face(best_face['embedding'])
        
        print(f"Recognition result:")
        print(f"  - Name: {recognition['name']}")
        print(f"  - Similarity: {recognition['similarity']:.4f}")
        print(f"  - Is known: {recognition['is_known']}")
        
        if recognition['name'] == name:
            print(f"✅ Success! Correctly recognized as {name}")
        else:
            print(f"❌ Failed! Expected {name}, got {recognition['name']}")
    
    print("\nRe-enrollment completed.")

if __name__ == "__main__":
    main() 