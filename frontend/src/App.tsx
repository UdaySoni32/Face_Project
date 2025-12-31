import { useState, useEffect, useRef } from 'react';
import { EnrollmentForm } from './EnrollmentForm';
import { RegistrationForm } from './RegistrationForm';
import { EventLog } from './EventLog';
import './App.css';

type Mode = 'recognize' | 'enroll' | 'register';

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [status, setStatus] = useState<string>('Disconnected');
  const [mode, setMode] = useState<Mode>('recognize');
  
  const imageUrlRef = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const connectWebSocket = () => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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

      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = newUrl;
    };
  };

  const disconnectWebSocket = () => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.close();
    }
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    setVideoSrc('');
  };

  useEffect(() => {
    if (mode === 'recognize') {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }
    // This return statement acts as a cleanup function
    return () => disconnectWebSocket();
  }, [mode]);

  const renderContent = () => {
    switch(mode) {
      case 'recognize':
        return (
          <div className="video-container">
            <h2>Live Feed</h2>
            <div className="video-wrapper">
              {videoSrc ? <img src={videoSrc} alt="Live video feed" /> : <div className="video-placeholder"><p>Connecting...</p></div>}
            </div>
          </div>
        );
      case 'enroll':
        return (
          <div className="controls-container">
            <h2>Enroll Faces for Existing Student</h2>
            <EnrollmentForm />
          </div>
        );
      case 'register':
        return (
          <div className="controls-container">
            <h2>Register New Student</h2>
            <p>Add a new student to the mock student database.</p>
            <RegistrationForm />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Face Recognition System</h1>
        <p>University Entry / Exit Panel</p>
        <nav className="mode-switcher">
          <button onClick={() => setMode('recognize')} disabled={mode === 'recognize'}>Recognize</button>
          <button onClick={() => setMode('register')} disabled={mode === 'register'}>Register Student</button>
          <button onClick={() => setMode('enroll')} disabled={mode === 'enroll'}>Enroll Faces</button>
        </nav>
      </header>

      <main>
        <div className="main-content">
          {renderContent()}
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
