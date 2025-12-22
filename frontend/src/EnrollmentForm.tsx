import React, { useState, useRef, useEffect } from 'react';

const IMAGE_CAPTURE_COUNT = 30;
const CAPTURE_INTERVAL_MS = 150;

type Status = 'idle' | 'capturing' | 'uploading' | 'success' | 'error';

export const EnrollmentForm: React.FC = () => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [feedback, setFeedback] = useState('');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedImages = useRef<Blob[]>([]);

  useEffect(() => {
    // Start webcam stream
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setStatus('error');
        setFeedback('Could not access webcam. Please check permissions.');
      }
    };
    startWebcam();

    // Cleanup: stop webcam on unmount
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!name.trim()) {
      setFeedback('Please enter a name first.');
      return;
    }
    
    setStatus('capturing');
    setFeedback(`Capturing ${IMAGE_CAPTURE_COUNT} images...`);
    capturedImages.current = [];
    setProgress(0);

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              capturedImages.current.push(blob);
              setProgress(p => p + 1);
            }
          }, 'image/png');
        }
      }

      if (capturedImages.current.length >= IMAGE_CAPTURE_COUNT) {
        clearInterval(interval);
        handleSubmit();
      }
    }, CAPTURE_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    setStatus('uploading');
    setFeedback('Uploading images and training model...');

    const formData = new FormData();
    formData.append('name', name);
    capturedImages.current.forEach((blob, index) => {
      formData.append('files', blob, `${index}.png`);
    });

    try {
      // The request will be proxied by Vite to http://localhost:8000/enroll
      const response = await fetch('/api/enroll', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const result = await response.json();
      setStatus('success');
      setFeedback(result.message || 'Enrollment successful!');
      setName(''); // Clear name for next enrollment
    } catch (err) {
      console.error("Error during enrollment:", err);
      setStatus('error');
      setFeedback('Enrollment failed. See console for details.');
    } finally {
        capturedImages.current = [];
        setProgress(0);
    }
  };

  const isButtonDisabled = status === 'capturing' || status === 'uploading';

  return (
    <div className="enrollment-form">
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxWidth: '400px', border: '1px solid grey' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div className="form-controls">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter person's name"
          disabled={isButtonDisabled}
        />
        <button onClick={handleCapture} disabled={isButtonDisabled}>
          {status === 'capturing' ? `Capturing... (${progress}/${IMAGE_CAPTURE_COUNT})` : 'Start Enrollment'}
        </button>
      </div>
      
      {feedback && (
        <p className={`feedback-message status-${status}`}>
          {status === 'uploading' ? 'Processing... please wait.' : feedback}
        </p>
      )}
    </div>
  );
};
