#!/usr/bin/env python3
import pickle
import os
import sys

FACE_DB_FILE = os.path.join('server', 'mediapipe_face_db.pkl')

def main():
    print('Face Database Information:')
    if not os.path.exists(FACE_DB_FILE):
        print(f"Error: Face database file not found at {FACE_DB_FILE}")
        return
    
    try:
        with open(FACE_DB_FILE, 'rb') as f:
            face_db = pickle.load(f)
        
        print(f'Number of known individuals: {len(face_db)}')
        print('\nIndividuals in database:')
        for name in face_db:
            print(f'- {name}')
            
            # Try to safely access face_db properties without numpy
            try:
                role = face_db[name].get('role', 'Unknown')
                print(f'  Role: {role}')
            except:
                pass
                
            try:
                emb = face_db[name].get('embeddings', [])
                print(f'  Number of embeddings: {len(emb)}')
            except:
                pass

            try:
                if 'access' in face_db[name]:
                    access = face_db[name]['access']
                    access_str = []
                    for k, v in access.items():
                        access_str.append(f"{k}={v}")
                    print(f'  Access permissions: {", ".join(access_str)}')
            except:
                pass
    
    except Exception as e:
        print(f"Error loading face database: {e}")
        
if __name__ == '__main__':
    main() 