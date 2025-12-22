import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import { EventLog } from './EventLog';
import { AdminPanel } from './AdminPanel'; // New import
import './App.css';

type Mode = 'recognize' | 'enroll' | 'admin'; // Updated type

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [status, setStatus] = useState<string>('Disconnected');
  const [mode, setMode] = useState<Mode>('recognize');
  
  const imageUrlRef = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const connectWebSocket = () => {
    // Only connect if in recognize mode and not already connecting/connected
    if (mode !== 'recognize' || (webSocketRef.current && (webSocketRef.current.readyState === WebSocket.OPEN || webSocketRef.current.readyState === WebSocket.CONNECTING))) {
      return;
    }

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
      webSocketRef.current = null; // Clear ref after closing
    }
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null; // Clear ref after revoking
    }
    setVideoSrc('');
  };

  useEffect(() => {
    if (mode === 'recognize') {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }

    return () => {
      disconnectWebSocket();
    };
  }, [mode]);

  return (
    <div className="App">
      <div className="app-container">
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
            <button onClick={() => setMode('admin')} disabled={mode === 'admin'}> {/* New Admin Button */}
              Admin
            </button>
          </nav>
        </header>

        <main>
          <div className="main-content">
            {mode === 'recognize' && (
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
            )}
            {mode === 'enroll' && (
              <div className="controls-container">
                <h2>Enroll New Person</h2>
                <EnrollmentForm />
              </div>
            )}
            {mode === 'admin' && ( /* New Admin Panel Rendering */
              <div className="controls-container">
                <h2>Admin Panel</h2>
                <AdminPanel />
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
    </div>
  );
}

export default App;