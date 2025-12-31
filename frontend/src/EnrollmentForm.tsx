import React, { useState, useRef, useEffect } from 'react';

type Status = 'idle' | 'snapshot' | 'uploading' | 'success' | 'error';

export const EnrollmentForm: React.FC = () => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [feedback, setFeedback] = useState('');
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setFeedback('Could not access webcam. Please check permissions.');
      }
    };
    startWebcam();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleTakeSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setSnapshot(dataUrl);
        setStatus('snapshot');
        setFeedback('Snapshot taken. Ready to submit.');
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !snapshot) {
      setFeedback('Please enter a name and take a snapshot.');
      return;
    }

    setStatus('uploading');
    setFeedback('Uploading and processing...');

    try {
      // The request will be proxied by `netlify dev`
      const response = await fetch('/.netlify/functions/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image: snapshot }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'An unknown error occurred.');
      }

      setStatus('success');
      setFeedback(result.message);
      setName('');
      setSnapshot(null);
    } catch (err) {
      console.error("Error during enrollment:", err);
      setStatus('error');
      setFeedback(err instanceof Error ? err.message : 'Enrollment failed.');
    }
  };
  
  const resetForm = () => {
    setStatus('idle');
    setSnapshot(null);
    setFeedback('');
  }

  const isButtonDisabled = status === 'uploading';

  return (
    <div className="enrollment-form">
      <div className="webcam-preview">
        <video ref={videoRef} autoPlay playsInline muted />
        {snapshot && <img src={snapshot} alt="Snapshot preview" className="snapshot-preview" />}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div className="form-controls">
        {status !== 'snapshot' && status !== 'uploading' ? (
            <>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter person's name"
                    disabled={isButtonDisabled}
                />
                <button onClick={handleTakeSnapshot} disabled={!name.trim()}>
                    Take Snapshot
                </button>
            </>
        ) : (
            <>
                <button onClick={handleSubmit} disabled={isButtonDisabled}>
                    Submit Enrollment
                </button>
                <button onClick={resetForm} disabled={isButtonDisabled} className="secondary">
                    Retake
                </button>
            </>
        )}
      </div>
      
      {feedback && (
        <p className={`feedback-message status-${status}`}>
          {status === 'uploading' ? 'Processing... this may take a moment.' : feedback}
        </p>
      )}
    </div>
  );
};
