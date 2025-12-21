# Use an official Python runtime as a parent image
# Using a specific version is good practice
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Install system-level dependencies required for dlib and other libraries
# cmake is for building dlib, git is for cloning face_recognition_models
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    # These are common dependencies for OpenCV's UI functions
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6

# Copy the file that lists our Python dependencies
COPY requirements.txt .

# Install the Python dependencies
# --no-cache-dir keeps the image size down
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of our application code into the container
COPY . .

# The default command to run when the container starts.
# We will override this for different tasks.
CMD ["python", "recognize.py"]
