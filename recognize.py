import face_recognition
import cv2
import numpy as np
import os
import pickle
import time

# --- Constants ---
ENCODINGS_FILE = "face_encodings.pickle"
PROCESS_FRAME_EVERY_N_FRAMES = 2 # Process every 2nd frame for speed

# --- Load known faces ---
if not os.path.exists(ENCODINGS_FILE):
    print(f"Error: {ENCODINGS_FILE} not found. Please run encode.py first.")
    exit()

with open(ENCODINGS_FILE, 'rb') as f:
    KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES = pickle.load(f)

if not KNOWN_FACE_ENCODINGS:
    print("Error: No face encodings found in the pickle file. Please ensure encode.py processed faces correctly.")
    exit()

print(f"Loaded {len(KNOWN_FACE_ENCODINGS)} known faces for recognition.")

# --- Initialize webcam ---
video_capture = cv2.VideoCapture(0)
if not video_capture.isOpened():
    print("Error: Could not open webcam.")
    exit()

# Initialize some variables
face_locations = []
face_encodings = []
face_names = []
frame_count = 0

print("\nStarting real-time face recognition. Press 'q' to quit.")

while True:
    ret, frame = video_capture.read()
    if not ret:
        print("Error: Can't receive frame (stream end?). Exiting ...")
        break

    # Only process every Nth frame to save CPU
    if frame_count % PROCESS_FRAME_EVERY_N_FRAMES == 0:
        # Resize frame of video to 1/4 size for faster face recognition processing
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)

        # Convert the image from BGR color (which OpenCV uses) to RGB color (which face_recognition uses)
        rgb_small_frame = small_frame[:, :, ::-1]
        
        # Find all the faces and face encodings in the current frame of video
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_names = []
        for face_encoding in face_encodings:
            # See if the face is a match for the known face(s)
            matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, tolerance=0.6) # Tolerance can be adjusted
            name = "Unknown"

            # Use the known face with the smallest distance to the new face
            face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
            best_match_index = np.argmin(face_distances)
            if matches[best_match_index]:
                name = KNOWN_FACE_NAMES[best_match_index]

            face_names.append(name)

    # Display the results
    for (top, right, bottom, left), name in zip(face_locations, face_names):
        # Scale back up face locations since the frame we detected in was scaled to 1/4 size
        top *= 4
        right *= 4
        bottom *= 4
        left *= 4

        # Draw a box around the face
        cv2.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)

        # Draw a label with a name below the face
        cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 0, 255), cv2.FILLED)
        font = cv2.FONT_HERSHEY_DUPLEX
        cv2.putText(frame, name, (left + 6, bottom - 6), font, 1.0, (255, 255, 255), 1)

    # Display the resulting image
    cv2.imshow('Face Recognition - Press "q" to quit', frame)

    frame_count += 1

    # Hit 'q' on the keyboard to quit!
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# --- Cleanup ---
video_capture.release()
cv2.destroyAllWindows()
print("\nRecognition stopped.")
