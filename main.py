import cv2
import pickle
import face_recognition
import numpy as np
import os
import asyncio
import sqlite3
from datetime import datetime, date
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from typing import List, Set, Dict, Any, Optional
from pydantic import BaseModel, EmailStr

# --- Pydantic Models ---
class Student(BaseModel):
    student_id: str
    name: str
    parent_email: EmailStr
    is_active: bool = True

class LeaveRequest(BaseModel):
    name: str
    roll_number: str
    application_number: str
    leave_date: date
    return_date: date
    father_contact: str
    mother_contact: str
    status: str = "Pending"

# --- Constants & Globals ---
DATABASE_FILE = "log.db"
DATASET_DIR = "dataset"
ENCODINGS_FILE = "face_encodings.pickle"

app = FastAPI()

# --- Database Functions ---
def init_db():
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    # Create events table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, name TEXT NOT NULL, timestamp DATETIME NOT NULL)''')
    # Create leave_requests table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, roll_number TEXT, application_number TEXT, 
            leave_date DATE, return_date DATE, father_contact TEXT, mother_contact TEXT, status TEXT, created_at DATETIME)''')
    # Create students table (for persistent mock CAMU data)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            student_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_active BOOLEAN, parent_email TEXT)''')
    conn.commit()
    conn.close()
    print("Database initialized.")

def add_student_to_db(student: Student):
    with sqlite3.connect(DATABASE_FILE) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("INSERT INTO students (student_id, name, is_active, parent_email) VALUES (?, ?, ?, ?)",
                           (student.student_id, student.name, student.is_active, student.parent_email))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail=f"Student with ID '{student.student_id}' or name '{student.name}' already exists.")

def get_student_from_db_by_name(name: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DATABASE_FILE) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT student_id, name, is_active, parent_email FROM students WHERE name = ?", (name,))
        result = cursor.fetchone()
        return dict(result) if result else None

def get_student_from_db_by_id(student_id: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DATABASE_FILE) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT student_id, name, is_active, parent_email FROM students WHERE student_id = ?", (student_id,))
        result = cursor.fetchone()
        return dict(result) if result else None

def log_event(name: str):
    student_info = get_student_from_db_by_name(name)
    if not student_info:
        print(f"Event for '{name}' not logged: Name not found in persistent student DB.")
        return
        
    student_id = student_info.get("student_id")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DATABASE_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO events (student_id, name, timestamp) VALUES (?, ?, ?)", (student_id, name, timestamp))
        conn.commit()
    print(f"Event logged: {name} (ID: {student_id}) at {timestamp}")

# Other core logic functions are unchanged... (omitted for brevity)
def run_encoding_process():
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES; print("Starting face encoding process...")
    known_encodings, known_names = [], []; os.makedirs(DATASET_DIR, exist_ok=True)
    for person_name in os.listdir(DATASET_DIR):
        person_dir = os.path.join(DATASET_DIR, person_name)
        if not os.path.isdir(person_dir): continue
        for image_name in os.listdir(person_dir):
            try:
                image = face_recognition.load_image_file(os.path.join(person_dir, image_name))
                face_encodings = face_recognition.face_encodings(image)
                if face_encodings: known_encodings.append(face_encodings[0]); known_names.append(person_name)
            except Exception as e: print(f"Error processing {os.path.join(person_dir, image_name)}: {e}")
    with open(ENCODINGS_FILE, 'wb') as f: pickle.dump((known_encodings, known_names), f)
    print(f"Finished encoding process. Total faces: {len(known_encodings)}")
    load_known_faces()

def load_known_faces():
    global KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES
    if not os.path.exists(ENCODINGS_FILE): run_encoding_process(); return
    try:
        with open(ENCODINGS_FILE, 'rb') as f:
            KNOWN_FACE_ENCODINGS, KNOWN_FACE_NAMES = pickle.load(f)
            print(f"Successfully loaded {len(KNOWN_FACE_ENCODINGS)} known faces.")
    except Exception: run_encoding_process()

# --- FastAPI App Events ---
@app.on_event("startup")
def startup_event(): init_db(); load_known_faces()

# --- API Endpoints ---
@app.post("/api/enroll")
async def enroll_person(name: str = Form(...), files: List[UploadFile] = File(...)):
    print(f"Received enrollment request for: {name}")
    person_dir = os.path.join(DATASET_DIR, name); os.makedirs(person_dir, exist_ok=True)
    for i, file in enumerate(files):
        with open(os.path.join(person_dir, f"{i}.png"), "wb") as buffer: buffer.write(await file.read())
    print(f"Saved {len(files)} images for {name}. Now re-encoding all faces.")
    run_encoding_process()
    return JSONResponse(status_code=200, content={"message": f"Successfully enrolled {name}."})

@app.get("/api/events")
async def get_events():
    with sqlite3.connect(DATABASE_FILE) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT student_id, name, timestamp FROM events ORDER BY timestamp DESC LIMIT 20")
        return [dict(row) for row in cursor.fetchall()]

@app.get("/api/mock-camu/student/{name}")
async def get_mock_student_details_api(name: str):
    """Retrieves fake student details from the persistent database."""
    student_info = get_student_from_db_by_name(name)
    if not student_info: raise HTTPException(status_code=404, detail="Student not found in Mock CAMU DB")
    return student_info

@app.post("/api/mock-camu/register")
async def register_mock_student_api(student: Student):
    """Adds a new student to the persistent mock CAMU database."""
    try:
        add_student_to_db(student)
        return {"message": f"Student {student.name} registered successfully."}
    except HTTPException as e:
        raise e

@app.post("/api/leave-requests")
async def submit_leave_request(request: LeaveRequest):
    created_at = datetime.now()
    with sqlite3.connect(DATABASE_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO leave_requests (name, roll_number, application_number, leave_date, return_date, father_contact, mother_contact, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (request.name, request.roll_number, request.application_number, request.leave_date, request.return_date, request.father_contact, request.mother_contact, request.status, created_at))
        conn.commit()
    return {"message": "Leave request submitted successfully."}

@app.get("/api/leave-requests")
async def get_leave_requests():
    with sqlite3.connect(DATABASE_FILE) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM leave_requests ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

@app.get("/")
async def root(): return {"message": "Face Recognition API running."}

# --- WebSocket Video Stream ---
@app.websocket("/ws/video_feed")
async def video_feed(websocket: WebSocket):
    # This logic is identical to the previous version
    await websocket.accept()
    video_capture = cv2.VideoCapture(0)
    if not video_capture.isOpened(): await websocket.close(code=1011, reason="Could not open webcam."); return
    frame_count = 0; last_known_names = []; frames_since_seen = []
    try:
        while True:
            ret, frame = video_capture.read()
            if not ret: break
            if frame_count % 4 == 0:
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
                newly_seen = current_names_in_frame - CURRENTLY_SEEN_NAMES
                for name in newly_seen: log_event(name)
                CURRENTLY_SEEN_NAMES.clear(); CURRENTLY_SEEN_NAMES.update(current_names_in_frame)
            face_locations = face_recognition.face_locations(cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)[:, :, ::-1])
            # For simplicity, just draw names from CURRENTLY_SEEN_NAMES
            names_to_draw = list(CURRENTLY_SEEN_NAMES)
            for i, (top, right, bottom, left) in enumerate(face_locations):
                if i < len(names_to_draw):
                    name = names_to_draw[i]
                else:
                    name = "Unknown" # Fallback if more faces than seen names, though unlikely with our logic
                top *= 4; right *= 4; bottom *= 4; left *= 4
                cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
                cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 255, 0), cv2.FILLED)
                cv2.putText(frame, name, (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 1)
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret: continue
            await websocket.send_bytes(buffer.tobytes())
            frame_count += 1
            await asyncio.sleep(0.03)
    except WebSocketDisconnect: print("Client disconnected.")
    except Exception as e: print(f"An error occurred: {e}")
    finally:
        video_capture.release()
        CURRENTLY_SEEN_NAMES.clear()
        if websocket.client_state != WebSocketState.DISCONNECTED: await websocket.close()
        print("Video stream stopped.")