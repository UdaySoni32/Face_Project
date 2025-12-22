import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [status, setStatus] = useState<string>('Disconnected');
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Construct WebSocket URL. It will be proxied by Vite dev server.
    const wsProtocol = window.location.protocol === 'https-:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/video_feed`;

    setStatus('Connecting...');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setStatus('Connected');
    };

    ws.onmessage = (event) => {
      // The backend sends JPEG image data as a binary blob.
      const blob = event.data as Blob;
      
      // To display it, we create a temporary URL for the blob.
      const newUrl = URL.createObjectURL(blob);
      
      // Update the video source state with the new URL.
      setVideoSrc(newUrl);

      // Clean up the previous temporary URL to prevent memory leaks.
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      imageUrlRef.current = newUrl;
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setStatus('Disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Error');
    };

    // Cleanup function to close the WebSocket connection when the component unmounts.
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      // Also clean up the last URL on unmount.
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []); // The empty dependency array ensures this effect runs only once on mount.

  return (
    <div className="App">
      <header className="App-header">
        <h1>Face Recognition System</h1>
        <p>University Entry / Exit Panel</p>
      </header>

      <main>
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

        <div className="controls-container">
          <h2>Enroll New Person</h2>
          {/* The enrollment form and controls will be built here in a later phase */}
          <div className="enrollment-placeholder">
            <p>Enrollment controls will be here.</p>
          </div>
        </div>
      </main>

      <footer className="App-footer">
        <p>System Status: {status}</p>
      </footer>
    </div>
  );
}

export default App;
