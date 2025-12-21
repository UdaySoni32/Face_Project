import cv2
import pickle
import face_recognition
import numpy as np
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

# --- Constants & Globals ---
ENCODINGS_FILE = "face_encodings.pickle"
PROCESS_FRAME_EVERY_N_FRAMES = 2

app = FastAPI()
KNOWN_FACE_ENCODINGS = []
KNOWN_FACE_NAMES = []

# --- Helper Functions ---
def load_known_faces():
    """Load face encodings from the pickle file."""
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES
    if not os.path.exists(ENCODINGS_FILE):
        print(f"WARNING: Encodings file not found at {ENCODINGS_FILE}. No faces will be recognized.")
        return

    with open(ENCODINGS_FILE, 'rb') as f:
        KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES = pickle.load(f)
    print(f"Successfully loaded {len(KNOWN_FACE_ENCODINGS)} known faces.")

# --- FastAPI App Events ---
@app.on_event("startup")
def startup_event():
    """Tasks to run when the application starts."""
    load_known_faces()

# --- WebSocket Endpoint ---
@app.websocket("/ws/video_feed")
async def video_feed(websocket: WebSocket):
    """
    Handles the video streaming WebSocket connection.
    Captures video from the webcam, performs face recognition,
    and streams the annotated frames to the client.
    """
    await websocket.accept()
    video_capture = cv2.VideoCapture(0)
    if not video_capture.isOpened():
        print("Error: Could not open webcam.")
        await websocket.close(code=1011, reason="Could not open webcam.")
        return

    frame_count = 0
    try:
        while True:
            ret, frame = video_capture.read()
            if not ret:
                break

            # Only process every Nth frame to save CPU
            if frame_count % PROCESS_FRAME_EVERY_N_FRAMES == 0:
                # Resize frame for faster processing
                small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                rgb_small_frame = small_frame[:, :, ::-1] # BGR to RGB

                # Find faces and encodings in the current frame
                face_locations = face_recognition.face_locations(rgb_small_frame)
                face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

                face_names = []
                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, tolerance=0.6)
                    name = "Unknown"

                    face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
                    if len(face_distances) > 0:
                        best_match_index = np.argmin(face_distances)
                        if matches[best_match_index]:
                            name = KNOWN_FACE_NAMES[best_match_index]
                    
                    face_names.append(name)

                # Annotate the original, full-size frame
                for (top, right, bottom, left), name in zip(face_locations, face_names):
                    # Scale back up face locations
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

            # Encode the frame as JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                continue
            
            # Stream the bytes to the client
            await websocket.send_bytes(buffer.tobytes())
            
            frame_count += 1
            await asyncio.sleep(0.01) # Yield control to allow other tasks

    except WebSocketDisconnect:
        print("Client disconnected.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        video_capture.release()
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
        print("Video stream stopped.")

@app.get("/")
async def root():
    return {"message": "Face Recognition API is running. Connect to the /ws/video_feed WebSocket endpoint to get the video stream."}
