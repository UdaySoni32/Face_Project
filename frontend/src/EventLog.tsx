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

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // This request is proxied by Vite to the backend's /api/events endpoint
        const response = await fetch('/api/events');
        if (!response.ok) {
          throw new Error(`Failed to fetch events: ${response.status}`);
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
      }
    };

    // Fetch immediately on component mount
    fetchEvents();

    // Then, set up an interval to fetch periodically
    const intervalId = setInterval(fetchEvents, REFRESH_INTERVAL_MS);

    // Cleanup function: clear the interval when the component is unmounted
    return () => {
      clearInterval(intervalId);
    };
  }, []); // Empty dependency array means this effect runs once on mount

  return (
    <div className="event-log-container">
      <h3>Recognition Events</h3>
      {error && <p className="error-message">Could not load events: {error}</p>}
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
  );
};
