import face_recognition
import cv2
import numpy as np
import os
import pickle
import time

# --- Constants ---
DATASET_DIR = "dataset"
ENCODINGS_FILE = "face_encodings.pickle"
KNOWN_FACE_ENCODINGS = []
KNOWN_FACE_NAMES = []

print("Loading and encoding faces from dataset...")

# Loop through each person's directory in the dataset folder
for person_name in os.listdir(DATASET_DIR):
    person_dir = os.path.join(DATASET_DIR, person_name)
    if not os.path.isdir(person_dir):
        continue # Skip if it's not a directory

    print(f"Processing images for: {person_name}")
    for image_name in os.listdir(person_dir):
        image_path = os.path.join(person_dir, image_name)
        
        # Load the image
        image = face_recognition.load_image_file(image_path)
        
        # Find all the face locations and face encodings in the current image
        face_locations = face_recognition.face_locations(image)
        face_encodings = face_recognition.face_encodings(image, face_locations)

        if not face_encodings:
            print(f"  Warning: No face found in {image_path}. Skipping.")
            continue
        
        # Assuming one face per training image for simplicity
        # If multiple faces are found, it takes the first one.
        KNOWN_FACE_ENCODINGS.append(face_encodings[0])
        KNOWN_FACE_NAMES.append(person_name)
        print(f"  Encoded {image_path}")

print(f"\nFinished processing {len(KNOWN_FACE_ENCODINGS)} faces.")

# Save the known face encodings and names to a pickle file
with open(ENCODINGS_FILE, 'wb') as f:
    pickle.dump((KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES), f)

print(f"Known face encodings and names saved to {ENCODINGS_FILE}")
