import React, { useState } from 'react';

export const RegistrationForm: React.FC = () => {
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setFeedback('Registering student...');

    const studentData = {
      student_id: studentId,
      name: name,
      parent_email: parentEmail,
    };

    try {
      const response = await fetch('/api/mock-camu/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(studentData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'An unknown error occurred.');
      }
      
      setStatus('success');
      setFeedback(`Success: ${result.message}`);
      // Clear form
      setStudentId('');
      setName('');
      setParentEmail('');
    } catch (err) {
      setStatus('error');
      if (err instanceof Error) {
        setFeedback(`Error: ${err.message}`);
      } else {
        setFeedback('An unknown registration error occurred.');
      }
    }
  };

  return (
    <div className="registration-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="studentId">Student ID</label>
          <input
            id="studentId"
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="parentEmail">Parent's Email</label>
          <input
            id="parentEmail"
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Registering...' : 'Register Student'}
        </button>
      </form>
      {feedback && (
        <p className={`feedback-message status-${status}`}>
          {feedback}
        </p>
      )}
    </div>
  );
};
