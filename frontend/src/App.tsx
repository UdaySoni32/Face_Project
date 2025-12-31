import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import { EventLog } from './EventLog';
import './App.css';

// Import Netlify Identity Widget
import netlifyIdentity from 'netlify-identity-widget';

type Mode = 'recognize' | 'enroll';

function App() {
  const [mode, setMode] = useState<Mode>('recognize');
  const [recognitionResult, setRecognitionResult] = useState<string>('');
  const [snapshot, setSnapshot] = useState<string | null>(null);
  
  // State for Netlify Identity
  const [user, setUser] = useState<netlifyIdentity.User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Netlify Identity Initialization ---
  useEffect(() => {
    netlifyIdentity.init();

    // Event listeners for login/logout
    netlifyIdentity.on('login', (user) => {
      setUser(user);
      setIsLoggedIn(true);
      console.log('Logged in:', user);
    });

    netlifyIdentity.on('logout', () => {
      setUser(null);
      setIsLoggedIn(false);
      console.log('Logged out');
    });

    // Check current login status on mount
    const currentUser = netlifyIdentity.currentUser();
    if (currentUser) {
      setUser(currentUser);
      setIsLoggedIn(true);
    }

    return () => {
      netlifyIdentity.off('login');
      netlifyIdentity.off('logout');
    };
  }, []); // Run once on mount

  // --- Webcam handling for Recognition Mode ---
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (mode === 'recognize' && isLoggedIn) {
      const startWebcam = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
        }
      };
      startWebcam();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode, isLoggedIn]); // Re-run when mode or login status changes

  // --- Recognition Snapshot Logic ---
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
                // Get the JWT token from Netlify Identity
                const token = await netlifyIdentity.currentUser()?.jwt();

                const response = await fetch('/.netlify/functions/recognize', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` // Send the token
                    },
                    body: JSON.stringify({ image: dataUrl }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'An unknown error occurred during recognition.');
                }
                
                // Draw bounding box on the snapshot if a face was detected
                if (result.box) {
                    context.strokeStyle = 'lime';
                    context.lineWidth = 4;
                    // Scale factor based on original image dimensions vs canvas
                    const scaleX = canvas.width / result.originalWidth;
                    const scaleY = canvas.height / result.originalHeight;
                    context.strokeRect(result.box.x * scaleX, result.box.y * scaleY, result.box.width * scaleX, result.box.height * scaleY);
                    const annotatedUrl = canvas.toDataURL('image/png');
                    setSnapshot(annotatedUrl); // Update snapshot with annotated version
                }

                setRecognitionResult(`Recognized: ${result.label}`);
            } catch (err) {
                console.error('Recognition error:', err);
                setRecognitionResult(err instanceof Error ? err.message : 'Error during recognition.');
            }
        }
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>Face Recognition System</h1>
        <p>University Entry / Exit Panel</p>
        
        {/* Login/Logout Button */}
        <div className="auth-controls">
          {isLoggedIn ? (
            <>
              <span>Logged in as: {user?.email}</span>
              <button onClick={() => netlifyIdentity.logout()}>Logout</button>
            </>
          ) : (
            <button onClick={() => netlifyIdentity.open()}>Login</button>
          )}
        </div>

        {isLoggedIn && (
            <nav className="mode-switcher">
            <button onClick={() => setMode('recognize')} disabled={mode === 'recognize'}>
                Recognize
            </button>
            <button onClick={() => setMode('enroll')} disabled={mode === 'enroll'}>
                Enroll
            </button>
            </nav>
        )}
      </header>

      <main>
        {isLoggedIn ? (
            <>
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
            </>
        ) : (
            <div className="main-content">
                <h2>Please Login</h2>
                <p>You need to log in to access the Face Recognition System.</p>
                <button onClick={() => netlifyIdentity.open()}>Login / Sign Up</button>
            </div>
        )}
      </main>

      <footer className="App-footer">
        <p>Current Mode: {mode} | User Status: {isLoggedIn ? 'Logged In' : 'Logged Out'}</p>
      </footer>
    </div>
  );
}

export default App;
