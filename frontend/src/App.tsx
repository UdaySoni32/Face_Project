import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import './App.css';

type Mode = 'recognize' | 'enroll';

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [status, setStatus] = useState<string>('Disconnected');
  const [mode, setMode] = useState<Mode>('recognize');
  
  const imageUrlRef = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const connectWebSocket = () => {
    // Construct WebSocket URL. It will be proxied by Vite dev server.
    const wsProtocol = window.location.protocol === 'https-:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/video_feed`;

    setStatus('Connecting...');
    const ws = new WebSocket(wsUrl);
    webSocketRef.current = ws;

    ws.onopen = () => setStatus('Connected');
    ws.onclose = () => setStatus('Disconnected');
    ws.onerror = () => setStatus('Error');

    ws.onmessage = (event) => {
      const blob = event.data as Blob;
      const newUrl = URL.createObjectURL(blob);
      setVideoSrc(newUrl);

      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      imageUrlRef.current = newUrl;
    };
  };

  const disconnectWebSocket = () => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.close();
    }
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    setVideoSrc('');
  };

  useEffect(() => {
    if (mode === 'recognize') {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }

    // Cleanup function when the component unmounts or mode changes
    return () => {
      disconnectWebSocket();
    };
  }, [mode]);

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
        {mode === 'recognize' ? (
          <div className="video-container">
            <h2>Live Feed</h2>
            <div className="video-wrapper">
              {videoSrc ? (
                <img src={videoSrc} alt="Live video feed" />
              ) : (
                <div className="video-placeholder">
                  <p>Connecting to video stream...</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="controls-container">
            <h2>Enroll New Person</h2>
            <EnrollmentForm />
          </div>
        )}
      </main>

      <footer className="App-footer">
        <p>System Status: {status}</p>
      </footer>
    </div>
  );
}

export default App;