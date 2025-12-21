import './App.css';

function App() {

  return (
    <div className="App">
      <header className="App-header">
        <h1>Face Recognition System</h1>
        <p>University Entry / Exit Panel</p>
      </header>

      <main>
        <div className="video-container">
          <h2>Live Feed</h2>
          {/* The video feed from the WebSocket will be rendered here in a later phase */}
          <div className="video-placeholder">
            <p>Video stream will appear here.</p>
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
        <p>System Status: Disconnected</p>
      </footer>
    </div>
  );
}

export default App;