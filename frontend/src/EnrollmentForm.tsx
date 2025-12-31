import React, { useState, useRef, useEffect } from 'react';

const IMAGE_CAPTURE_COUNT = 30;
const CAPTURE_INTERVAL_MS = 150;

type Status = 'lookup' | 'ready_to_capture' | 'capturing' | 'uploading' | 'success' | 'error';

interface Student {
  name: string;
  student_id: string;
}

export const EnrollmentForm: React.FC = () => {
  const [lookupName, setLookupName] = useState('');
  const [foundStudent, setFoundStudent] = useState<Student | null>(null);
  const [status, setStatus] = useState<Status>('lookup');
  const [feedback, setFeedback] = useState('Enter a name to find a student to enroll.');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedImages = useRef<Blob[]>([]);

  // Effect to manage webcam stream
  useEffect(() => {
    const shouldStartWebcam = status === 'ready_to_capture' || status === 'capturing';
    if (shouldStartWebcam && !videoRef.current?.srcObject) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.error("Error accessing webcam:", err);
          setStatus('error');
          setFeedback('Could not access webcam. Please check permissions.');
        });
    } else if (!shouldStartWebcam && videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, [status]);
  
  const handleLookup = async () => {
    setStatus('lookup');
    setFeedback(`Searching for "${lookupName}"...`);
    try {
      const response = await fetch(`/api/mock-camu/student/${lookupName}`);
      if (!response.ok) {
        throw new Error('Student not found.');
      }
      const data: Student = await response.json();
      setFoundStudent(data);
      setStatus('ready_to_capture');
      setFeedback(`Student "${data.name}" found. Ready to capture face images.`);
    } catch (err) {
      setFeedback(`Error: ${(err as Error).message}`);
    }
  };

  const handleCapture = () => {
    if (!foundStudent) return;
    
    setStatus('capturing');
    setFeedback(`Capturing ${IMAGE_CAPTURE_COUNT} images for ${foundStudent.name}...`);
    capturedImages.current = [];
    setProgress(0);

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        // Capture logic (same as before)
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => { if (blob) capturedImages.current.push(blob); }, 'image/png');
          setProgress(p => p + 1);
        }
      }

      if (capturedImages.current.length >= IMAGE_CAPTURE_COUNT) {
        clearInterval(interval);
        handleSubmit();
      }
    }, CAPTURE_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    if (!foundStudent) return;
    setStatus('uploading');
    setFeedback(`Uploading images and training model for ${foundStudent.name}...`);

    const formData = new FormData();
    formData.append('name', foundStudent.name);
    capturedImages.current.forEach((blob, index) => {
      formData.append('files', blob, `${index}.png`);
    });

    try {
      const response = await fetch('/api/enroll', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
      const result = await response.json();
      setStatus('success');
      setFeedback(result.message || 'Enrollment successful!');
      setTimeout(() => { // Reset form after a delay
        setStatus('lookup');
        setFoundStudent(null);
        setLookupName('');
        setFeedback('Enter a name to find a student to enroll.');
      }, 5000);
    } catch (err) {
      console.error("Error during enrollment:", err);
      setStatus('error');
      setFeedback('Enrollment failed. See console for details.');
    }
  };
  
  return (
    <div className="enrollment-form">
      {status === 'lookup' && (
        <div className="form-controls">
          <input
            type="text"
            value={lookupName}
            onChange={(e) => setLookupName(e.target.value)}
            placeholder="Enter student's full name"
          />
          <button onClick={handleLookup}>Find Student</button>
        </div>
      )}

      {foundStudent && (status === 'ready_to_capture' || status === 'capturing' || status === 'uploading') && (
        <div>
          <h4>Enrolling: {foundStudent.name} (ID: {foundStudent.student_id})</h4>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxWidth: '400px', border: '1px solid grey' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="form-controls">
            <button onClick={handleCapture} disabled={status !== 'ready_to_capture'}>
              {status === 'capturing' ? `Capturing... (${progress}/${IMAGE_CAPTURE_COUNT})` : 'Start Face Enrollment'}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p className={`feedback-message status-${status}`}>
          {status === 'uploading' ? 'Processing... this may take a moment.' : feedback}
        </p>
      )}
    </div>
  );
};