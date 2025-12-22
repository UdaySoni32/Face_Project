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
# Simple smoothing: Keep last name for this many frames if recognition is lost
NAME_PERSISTENCE_FRAMES = 5 

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
    # --- State for smoothing logic ---
    last_known_names = []
    frames_since_seen = []

    try:
        while True:
            ret, frame = video_capture.read()
            if not ret:
                break

            rgb_frame = frame[:, :, ::-1] # BGR to RGB for processing

            # Only process every Nth frame to save CPU
            if frame_count % PROCESS_FRAME_EVERY_N_FRAMES == 0:
                # Resize frame for faster processing
                small_frame = cv2.resize(rgb_frame, (0, 0), fx=0.25, fy=0.25)

                # Find all the faces and face encodings in the current frame of video
                face_locations = face_recognition.face_locations(small_frame)
                face_encodings = face_recognition.face_encodings(small_frame, face_locations)

                current_names = []
                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, tolerance=0.6)
                    name = "Unknown"

                    face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
                    if len(face_distances) > 0:
                        best_match_index = np.argmin(face_distances)
                        if matches[best_match_index]:
                            name = KNOWN_FACE_NAMES[best_match_index]
                    
                    current_names.append(name)
                
                # --- Update smoothing state ---
                # This is a very simple tracker, it assumes the number of faces doesn't change wildly
                if len(current_names) == len(last_known_names):
                    for i, name in enumerate(current_names):
                        if name != "Unknown":
                            last_known_names[i] = name
                            frames_since_seen[i] = 0
                        elif frames_since_seen[i] < NAME_PERSISTENCE_FRAMES:
                            frames_since_seen[i] += 1
                        else:
                            last_known_names[i] = "Unknown"
                else:
                    # If number of faces changes, reset the tracking
                    last_known_names = current_names
                    frames_since_seen = [0] * len(current_names)

            # Annotate the original, full-size frame using the smoothed names
            for (top, right, bottom, left), name in zip(face_locations, last_known_names):
                top *= 4; right *= 4; bottom *= 4; left *= 4
                cv2.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)
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
            await asyncio.sleep(0.01)

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