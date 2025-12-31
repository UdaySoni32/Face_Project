import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import { EventLog } from './EventLog';
import './App.css';

type Mode = 'recognize' | 'enroll';

// Define the shape of the recognition result from our new function
interface RecognitionResult {
  box: { x: number; y: number; width: number; height: number; };
  label: string;
}

function App() {
  const [mode, setMode] = useState<Mode>('recognize');
  const [recognitionResult, setRecognitionResult] = useState<string>('');
  const [snapshot, setSnapshot] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Start webcam stream only when in recognize mode
    if (mode === 'recognize') {
      const startWebcam = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
        }
      };
      startWebcam();

      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [mode]);

  const handleRecognize = async () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            setSnapshot(dataUrl); // Show the snapshot
            setRecognitionResult('Processing...');

            try {
                const response = await fetch('/.netlify/functions/recognize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: dataUrl }),
                });

                const results: RecognitionResult[] = await response.json();

                if (results.length > 0) {
                    const firstResult = results[0];
                    setRecognitionResult(`Recognized: ${firstResult.label}`);
                    
                    // Draw bounding box on the snapshot
                    context.strokeStyle = 'lime';
                    context.lineWidth = 4;
                    context.strokeRect(firstResult.box.x, firstResult.box.y, firstResult.box.width, firstResult.box.height);
                    const annotatedUrl = canvas.toDataURL('image/png');
                    setSnapshot(annotatedUrl);

                } else {
                    setRecognitionResult('No face recognized.');
                }
            } catch (err) {
                console.error('Recognition error:', err);
                setRecognitionResult('Error during recognition.');
            }
        }
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>Face Recognition System</h1>
        <p>University Entry / Exit Panel</p>
        <nav className="mode-switcher">
          <button onClick={() => setMode('recognize')} disabled={mode === 'recognize'}>
            Recognize
          </button>
          <button onClick={() => setMode('enroll')} disabled={mode === 'enroll'}>
            Enroll
          </button>
        </nav>
      </header>

      <main>
        <div className="main-content">
          {mode === 'recognize' ? (
            <div className="recognition-container">
              <h2>Recognition Mode</h2>
              <div className="instructional-text">
                <p>Ensure you have enrolled people first. Position a face in the webcam preview below and click "Recognize Snapshot" to identify them.</p>
              </div>
              <video ref={videoRef} autoPlay playsInline muted />
              <button onClick={handleRecognize}>Recognize Snapshot</button>
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {snapshot && (
                <div className="snapshot-result">
                  <h3>Last Snapshot:</h3>
                  <img src={snapshot} alt="Snapshot" />
                  <p>{recognitionResult}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="controls-container">
              <h2>Enroll New Person</h2>
              <div className="instructional-text">
                <p>Use this form to add a new person to the recognition system. Enter their name, take a clear, forward-facing snapshot, and then submit.</p>
              </div>
              <EnrollmentForm />
            </div>
          )}
        </div>
        <aside className="sidebar">
          <EventLog />
        </aside>
      </main>

      <footer className="App-footer">
        {/* The status footer is less relevant now, but can be kept for general state */}
        <p>Current Mode: {mode}</p>
      </footer>
    </div>
  );
}

export default App;