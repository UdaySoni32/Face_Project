import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import { EventLog } from './EventLog';
import './App.css';

type Mode = 'recognize' | 'enroll';

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [status, setStatus] = useState<string>('Disconnected');
  const [mode, setMode] = useState<Mode>('recognize');
  
  const imageUrlRef = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const connectWebSocket = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    if (!baseUrl) {
      setStatus('Error: API URL not configured.');
      console.error('VITE_API_BASE_URL is not set.');
      return;
    }

    // Convert http/https URL to ws/wss
    const wsUrl = baseUrl.replace(/^(http)/, 'ws') + '/ws/video_feed';

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
        <div className="main-content">
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
        </div>
        <aside className="sidebar">
          <EventLog />
        </aside>
      </main>

      <footer className="App-footer">
        <p>System Status: {status}</p>
      </footer>
    </div>
  );
}

export default App;