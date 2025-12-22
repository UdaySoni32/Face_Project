import React, { useState, useEffect } from 'react';

// Define the shape of an event object
interface RecognitionEvent {
  name: string;
  timestamp: string;
}

const REFRESH_INTERVAL_MS = 5000; // Refresh every 5 seconds

export const EventLog: React.FC = () => {
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true); // Start loading
      try {
        const response = await fetch('/api/events');
        if (!response.ok) {
          throw new Error(`Failed to fetch events: ${response.statusText}`);
        }
        const data: RecognitionEvent[] = await response.json();
        setEvents(data);
        setError(null);
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError("An unknown error occurred.");
        }
      } finally {
        setIsLoading(false); // Stop loading regardless of outcome
      }
    };

    fetchEvents(); // Initial fetch
    const intervalId = setInterval(fetchEvents, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId); // Cleanup on unmount
    };
  }, []);

  return (
    <div className="event-log-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Recognition Events</h3>
        {isLoading && <div className="spinner"></div>}
      </div>
      
      {error && <p className="feedback-message status-error">Could not load events: {error}</p>}
      
      <div className="event-table-wrapper">
        <table className="event-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {events.length > 0 ? (
              events.map((event, index) => (
                <tr key={index}>
                  <td>{event.name}</td>
                  <td>{event.timestamp}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No recognition events logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};