import cv2
import pickle
import face_recognition
import numpy as np
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from typing import List

# --- Constants & Globals ---
DATASET_DIR = "dataset"
ENCODINGS_FILE = "face_encodings.pickle"
PROCESS_FRAME_EVERY_N_FRAMES = 2
NAME_PERSISTENCE_FRAMES = 5

app = FastAPI()
KNOWN_FACE_ENCODINGS = []
KNOWN_FACE_NAMES = []

# --- Helper Functions ---
def run_encoding_process():
    """Scans the dataset directory, encodes faces, and saves them to a pickle file."""
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES
    print("Starting face encoding process...")
    
    known_encodings = []
    known_names = []

    if not os.path.exists(DATASET_DIR):
        os.makedirs(DATASET_DIR)

    for person_name in os.listdir(DATASET_DIR):
        person_dir = os.path.join(DATASET_DIR, person_name)
        if not os.path.isdir(person_dir):
            continue

        for image_name in os.listdir(person_dir):
            image_path = os.path.join(person_dir, image_name)
            try:
                image = face_recognition.load_image_file(image_path)
                face_encodings = face_recognition.face_encodings(image)
                if face_encodings:
                    known_encodings.append(face_encodings[0])
                    known_names.append(person_name)
            except Exception as e:
                print(f"Error processing {image_path}: {e}")

    with open(ENCODINGS_FILE, 'wb') as f:
        pickle.dump((known_encodings, known_names), f)
    
    print(f"Finished encoding process. Total faces encoded: {len(known_encodings)}")
    # Reload faces into memory
    load_known_faces()

def load_known_faces():
    """Load face encodings from the pickle file into memory."""
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES
    if not os.path.exists(ENCODINGS_FILE):
        print(f"WARNING: {ENCODINGS_FILE} not found. Running encoding process.")
        run_encoding_process()
        return

    with open(ENCODINGS_FILE, 'rb') as f:
        try:
            KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES = pickle.load(f)
            print(f"Successfully loaded {len(KNOWN_FACE_ENCODINGS)} known faces.")
        except (pickle.UnpicklingError, EOFError):
            print(f"WARNING: {ENCODINGS_FILE} is corrupt or empty. Re-running encoding process.")
            run_encoding_process()


# --- FastAPI App Events ---
@app.on_event("startup")
def startup_event():
    """Tasks to run when the application starts."""
    load_known_faces()

# --- API Endpoints ---
@app.post("/enroll")
async def enroll_person(name: str = Form(...), files: List[UploadFile] = File(...)):
    """Enrolls a new person by saving their images and re-running the encoding process."""
    print(f"Received enrollment request for: {name}")
    person_dir = os.path.join(DATASET_DIR, name)
    os.makedirs(person_dir, exist_ok=True)

    for i, file in enumerate(files):
        file_path = os.path.join(person_dir, f"{i}.png")
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
    
    print(f"Saved {len(files)} images for {name}. Now re-encoding all faces.")
    run_encoding_process()
    
    return JSONResponse(status_code=200, content={"message": f"Successfully enrolled {name}."})

@app.get("/")
async def root():
    return {"message": "Face Recognition API is running. Connect to the /ws/video_feed WebSocket endpoint to get the video stream."}


# --- WebSocket Endpoint ---
@app.websocket("/ws/video_feed")
async def video_feed(websocket: WebSocket):
    # (The existing WebSocket code from the previous step remains here)
    # ... (omitted for brevity, but it's the same as before)
    await websocket.accept()
    video_capture = cv2.VideoCapture(0)
    if not video_capture.isOpened():
        await websocket.close(code=1011, reason="Could not open webcam.")
        return

    frame_count = 0; last_known_names = []; frames_since_seen = []
    try:
        while True:
            ret, frame = video_capture.read()
            if not ret: break
            rgb_frame = frame[:, :, ::-1]
            if frame_count % PROCESS_FRAME_EVERY_N_FRAMES == 0:
                small_frame = cv2.resize(rgb_frame, (0, 0), fx=0.25, fy=0.25)
                face_locations = face_recognition.face_locations(small_frame)
                face_encodings = face_recognition.face_encodings(small_frame, face_locations)
                current_names = []
                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, 0.6)
                    name = "Unknown"
                    face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
                    if len(face_distances) > 0:
                        best_match_index = np.argmin(face_distances)
                        if matches[best_match_index]: name = KNOWN_FACE_NAMES[best_match_index]
                    current_names.append(name)
                if len(current_names) == len(last_known_names):
                    for i, name in enumerate(current_names):
                        if name != "Unknown": last_known_names[i] = name; frames_since_seen[i] = 0
                        elif frames_since_seen[i] < NAME_PERSISTENCE_FRAMES: frames_since_seen[i] += 1
                        else: last_known_names[i] = "Unknown"
                else:
                    last_known_names = current_names; frames_since_seen = [0] * len(current_names)
            for (top, right, bottom, left), name in zip(face_locations, last_known_names):
                top *= 4; right *= 4; bottom *= 4; left *= 4
                cv2.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)
                cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 0, 255), cv2.FILLED)
                cv2.putText(frame, name, (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 1)
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret: continue
            await websocket.send_bytes(buffer.tobytes())
            frame_count += 1
            await asyncio.sleep(0.01)
    except WebSocketDisconnect: print("Client disconnected.")
    except Exception as e: print(f"An error occurred: {e}")
    finally:
        video_capture.release()
        if websocket.client_state != WebSocketState.DISCONNECTED: await websocket.close()
        print("Video stream stopped.")
