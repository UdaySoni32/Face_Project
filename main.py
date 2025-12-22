import cv2
import pickle
import face_recognition
import numpy as np
import os
import asyncio
import sqlite3
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from typing import List, Set, Dict

# --- Constants & Globals ---
DATABASE_FILE = "log.db"
DATASET_DIR = "dataset"
ENCODINGS_FILE = "face_encodings.pickle"
PROCESS_FRAME_EVERY_N_FRAMES = 2
# Cooldown period in seconds before logging the same person again
EVENT_COOLDOWN_SECONDS = 60 

app = FastAPI()
KNOWN_FACE_ENCODINGS = []
KNOWN_FACE_NAMES = []
# --- State for Event Detection ---
# Tracks the last time a name was logged to prevent spam
LAST_LOGGED_TIMESTAMP: Dict[str, datetime] = {}

# --- Database Functions ---
def init_db():
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
    now = datetime.now()
    # Check if the person is on cooldown
    if name in LAST_LOGGED_TIMESTAMP:
        last_logged = LAST_LOGGED_TIMESTAMP[name]
        if (now - last_logged).total_seconds() < EVENT_COOLDOWN_SECONDS:
            return # On cooldown, so don't log

    timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO events (name, timestamp) VALUES (?, ?)", (name, timestamp_str))
    conn.commit()
    conn.close()
    
    # Update the last logged timestamp for this person
    LAST_LOGGED_TIMESTAMP[name] = now
    print(f"Event logged: {name} at {timestamp_str}")

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
    # (Same as before)
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
# (Same as before)
async def enroll_person(name: str = Form(...), files: List[UploadFile] = File(...)):
    print(f"Received enrollment request for: {name}")
    person_dir = os.path.join(DATASET_DIR, name); os.makedirs(person_dir, exist_ok=True)
    for i, file in enumerate(files):
        file_path = os.path.join(person_dir, f"{i}.png")
        with open(file_path, "wb") as buffer: buffer.write(await file.read())
    print(f"Saved {len(files)} images for {name}. Now re-encoding all faces.")
    run_encoding_process()
    return JSONResponse(status_code=200, content={"message": f"Successfully enrolled {name}."})

@app.get("/events")
async def get_events():
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
    
    try:
        # More robust loop that checks connection state
        while websocket.client_state == WebSocketState.CONNECTED:
            ret, frame = video_capture.read()
            if not ret: 
                await asyncio.sleep(0.1)
                continue

            # Process frame
            small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)[:, :, ::-1]
            face_locations = face_recognition.face_locations(small_frame)
            face_encodings = face_recognition.face_encodings(small_frame, face_locations)
            
            for face_encoding in face_encodings:
                matches = face_recognition.compare_faces(KNOWN_FACE_ENCODINGS, face_encoding, 0.6)
                name = "Unknown"
                if True in matches:
                    face_distances = face_recognition.face_distance(KNOWN_FACE_ENCODINGS, face_encoding)
                    best_match_index = np.argmin(face_distances)
                    if matches[best_match_index]:
                        name = KNOWN_FACE_NAMES[best_match_index]
                        # --- Log Event with Cooldown ---
                        log_event(name)

                # --- Annotation Logic ---
                (top, right, bottom, left) = face_locations[0]
                top *= 4; right *= 4; bottom *= 4; left *= 4
                cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
                cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 255, 0), cv2.FILLED)
                cv2.putText(frame, name, (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 1)

            # Encode and send frame
            ret, buffer = cv2.imencode('.jpg', frame)
            if ret:
                await websocket.send_bytes(buffer.tobytes())
            
            await asyncio.sleep(0.05) # Yield control
            
    except WebSocketDisconnect:
        print("Client disconnected gracefully.")
    except Exception as e:
        print(f"An error occurred in WebSocket: {e}")
    finally:
        video_capture.release()
        print("Video capture released.")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
            print("WebSocket connection closed forcefully.")
