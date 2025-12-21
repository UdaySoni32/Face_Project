import cv2
import os
import time

# --- Constants ---
DATASET_DIR = "dataset"
PERSON_NAME = ""
SAMPLE_COUNT = 20
IMAGE_WIDTH = 600
IMAGE_HEIGHT = 600

# --- Get person's name and create directory ---
while not PERSON_NAME:
    PERSON_NAME = input("Enter the name of the person: ").strip()
    if not PERSON_NAME:
        print("Name cannot be empty.")
    # Sanitize the name for directory creation
    PERSON_NAME = "".join(c for c in PERSON_NAME if c.isalnum() or c in (' ', '_')).rstrip()

output_folder = os.path.join(DATASET_DIR, PERSON_NAME)
if not os.path.exists(output_folder):
    os.makedirs(output_folder)
    print(f"Directory created: {output_folder}")
else:
    print(f"Directory already exists: {output_folder}")

# --- Initialize webcam ---
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("Error: Could not open webcam.")
    exit()

print("\nStarting image capture...")
print(f"Look at the camera. Press 'k' to capture an image. Press 'q' to quit.")
print("Try to capture varied expressions and slightly different angles.")

count = 0
while count < SAMPLE_COUNT:
    ret, frame = cap.read()
    if not ret:
        print("Error: Can't receive frame (stream end?). Exiting ...")
        break

    # Display the resulting frame
    cv2.imshow('Enrollment - Press "k" to capture, "q" to quit', frame)

    key = cv2.waitKey(1) & 0xFF

    if key == ord('q'):
        print("'q' pressed, quitting.")
        break
    elif key == ord('k'):
        # Create a square crop around the center
        h, w, _ = frame.shape
        center_x, center_y = w // 2, h // 2
        crop_size = min(h, w)
        
        start_x = center_x - crop_size // 2
        start_y = center_y - crop_size // 2
        end_x = start_x + crop_size
        end_y = start_y + crop_size

        cropped_frame = frame[start_y:end_y, start_x:end_x]
        
        # Resize to a standard size
        resized_frame = cv2.resize(cropped_frame, (IMAGE_WIDTH, IMAGE_HEIGHT))

        image_path = os.path.join(output_folder, f"{count}.png")
        cv2.imwrite(image_path, resized_frame)
        print(f"Saved {image_path} ({count + 1}/{SAMPLE_COUNT})")
        count += 1
        # Give user time to change expression
        time.sleep(0.5)

# --- Cleanup ---
cap.release()
cv2.destroyAllWindows()
print("\nCapture complete.")
if count < SAMPLE_COUNT:
    print(f"Warning: Only {count} images were captured.")
