import cv2
import pickle
import face_recognition
import numpy as np
import os
import asyncio
import sqlite3
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from typing import List, Set

# --- Constants & Globals ---
DATABASE_FILE = "log.db"
DATASET_DIR = "dataset"
ENCODINGS_FILE = "face_encodings.pickle"
PROCESS_FRAME_EVERY_N_FRAMES = 4 # Slow down processing a bit to make event detection more stable
NAME_PERSISTENCE_FRAMES = 5

app = FastAPI()
KNOWN_FACE_ENCODINGS = []
KNOWN_FACE_NAMES = []
# --- State for Event Detection ---
CURRENTLY_SEEN_NAMES: Set[str] = set()

# --- Database Functions ---
def init_db():
    """Initializes the database and creates the events table if it doesn't exist."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            timestamp DATETIME NOT NULL
        )
    ''')
    conn.commit()
    conn.close()
    print("Database initialized.")

def log_event(name: str):
    """Logs a new recognition event to the database."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO events (name, timestamp) VALUES (?, ?)", (name, timestamp))
    conn.commit()
    conn.close()
    print(f"Event logged: {name} at {timestamp}")

# --- Helper Functions ---
def run_encoding_process():
    # (Same as before)
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES; print("Starting face encoding process...")
    known_encodings, known_names = [], []; os.makedirs(DATASET_DIR, exist_ok=True)
    for person_name in os.listdir(DATASET_DIR):
        person_dir = os.path.join(DATASET_DIR, person_name)
        if not os.path.isdir(person_dir): continue
        for image_name in os.listdir(person_dir):
            image_path = os.path.join(person_dir, image_name)
            try:
                image = face_recognition.load_image_file(image_path)
                face_encodings = face_recognition.face_encodings(image)
                if face_encodings: known_encodings.append(face_encodings[0]); known_names.append(person_name)
            except Exception as e: print(f"Error processing {image_path}: {e}")
    with open(ENCODINGS_FILE, 'wb') as f: pickle.dump((known_encodings, known_names), f)
    print(f"Finished encoding process. Total faces: {len(known_encodings)}")
    load_known_faces()

def load_known_faces():
    # (Same as before, with minor tweaks for robustness)
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES
    if not os.path.exists(ENCODINGS_FILE): run_encoding_process(); return
    with open(ENCODINGS_FILE, 'rb') as f:
        try:
            KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES = pickle.load(f)
            print(f"Successfully loaded {len(KNOWN_FACE_ENCODINGS)} known faces.")
        except Exception: run_encoding_process()

# --- FastAPI App Events ---
@app.on_event("startup")
def startup_event():
    init_db()
    load_known_faces()

# --- API Endpoints ---
@app.post("/api/enroll")
# (Changed endpoint to match proxy)
async def enroll_person(name: str = Form(...), files: List[UploadFile] = File(...)):
    # (Same as before)
    print(f"Received enrollment request for: {name}")
    person_dir = os.path.join(DATASET_DIR, name); os.makedirs(person_dir, exist_ok=True)
    for i, file in enumerate(files):
        file_path = os.path.join(person_dir, f"{i}.png")
        with open(file_path, "wb") as buffer: buffer.write(await file.read())
    print(f"Saved {len(files)} images for {name}. Now re-encoding all faces.")
    run_encoding_process()
    return JSONResponse(status_code=200, content={"message": f"Successfully enrolled {name}."})

@app.get("/api/events")
async def get_events():
    """Retrieves the last 20 recognition events from the database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT name, timestamp FROM events ORDER BY timestamp DESC LIMIT 20")
    events = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return events

@app.get("/")
# (Same as before)
async def root(): return {"message": "Face Recognition API running."}

# --- WebSocket Endpoint ---
@app.websocket("/ws/video_feed")
async def video_feed(websocket: WebSocket):
    await websocket.accept()
    video_capture = cv2.VideoCapture(0)
    if not video_capture.isOpened(): await websocket.close(code=1011, reason="Could not open webcam."); return
    
    frame_count = 0; last_known_names = []; frames_since_seen = []
    try:
        while True:
            ret, frame = video_capture.read()
            if not ret: break
            
            processed_frame = frame.copy()
            if frame_count % PROCESS_FRAME_EVERY_N_FRAMES == 0:
                small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)[:, :, ::-1]
                face_locations = face_recognition.face_locations(small_frame)
                face_encodings = face_recognition.face_encodings(small_frame, face_locations)
                
                current_names_in_frame = set()
                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, 0.6)
                    name = "Unknown"
                    if True in matches:
                        face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
                        best_match_index = np.argmin(face_distances)
                        if matches[best_match_index]:
                            name = KNOWN_FACE_NAMES[best_match_index]
                            current_names_in_frame.add(name)
                
                # --- Event Detection Logic ---
                newly_seen = current_names_in_frame - CURRENTLY_SEEN_NAMES
                for name in newly_seen:
                    log_event(name)
                
                CURRENTLY_SEEN_NAMES.update(current_names_in_frame)
                # Simple logic for "exit": if no known faces are seen, clear the set.
                if not current_names_in_frame:
                    CURRENTLY_SEEN_NAMES.clear()
                
            # Annotation logic (can be simplified if not needed in real-time)
            # ... we can skip drawing for now to keep it clean ...

            ret, buffer = cv2.imencode('.jpg', processed_frame)
            if not ret: continue
            await websocket.send_bytes(buffer.tobytes())
            frame_count += 1
            await asyncio.sleep(0.03) # Slightly more sleep
    except WebSocketDisconnect: print("Client disconnected.")
    except Exception as e: print(f"An error occurred: {e}")
    finally:
        video_capture.release()
        CURRENTLY_SEEN_NAMES.clear()
        if websocket.client_state != WebSocketState.DISCONNECTED: await websocket.close()
        print("Video stream stopped.")