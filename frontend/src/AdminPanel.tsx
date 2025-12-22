import React, { useState } from 'react';

export const AdminPanel: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'unauthorized' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleCheckAccess = async () => {
    setStatus('checking');
    setMessage('Checking access...');

    try {
      const response = await fetch('/api/admin/status', {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setStatus('success');
        setMessage(result.message || 'Admin access granted!');
      } else if (response.status === 401) {
        setStatus('unauthorized');
        setMessage('Access Denied: Invalid API Key.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
      setStatus('error');
      setMessage('Failed to check access. See console for details.');
    }
  };

  const statusClass = (s: typeof status) => {
    switch(s) {
      case 'success': return 'status-success';
      case 'unauthorized': return 'status-error';
      case 'error': return 'status-error';
      default: return '';
    }
  };

  return (
    <div className="admin-panel">
      <h3>Admin Access Check</h3>
      <div className="form-controls">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter Admin API Key"
          disabled={status === 'checking'}
        />
        <button onClick={handleCheckAccess} disabled={status === 'checking'}>
          {status === 'checking' ? 'Checking...' : 'Check Access'}
        </button>
      </div>
      {message && (
        <p className={`feedback-message ${statusClass(status)}`}>
          {message}
        </p>
      )}
    </div>
  );
};
