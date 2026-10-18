import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import '../styles/CallHistory.css';

const getId = (value) => {
  if (!value) return '';
  return String(typeof value === 'object' ? (value._id || value.id || '') : value);
};

const formatDuration = (duration = 0) => {
  const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
  const seconds = (duration % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export default function CallHistoryModal({ isOpen, onClose, onStartCall, currentUserId }) {
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchCallLogs() {
    try {
      setLoading(true);
      setError('');
      const { data } = await API.get('/calls');
      setCallLogs(data);
    } catch (err) {
      console.error('Failed to fetch call history:', err);
      setError('Could not load call history. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchCallLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="call-history-overlay" onClick={onClose}>
      <div className="call-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="call-history-header">
          <h3>Call History</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="call-history-list">
          {loading ? (
            <div className="loading-text">Loading call logs...</div>
          ) : error ? (
            <div className="no-calls">{error}</div>
          ) : callLogs.length === 0 ? (
            <div className="no-calls">No past calls found.</div>
          ) : (
            callLogs.map((log) => {
              const isIncoming = getId(log.receiver) === getId(currentUserId);
              const contact = isIncoming ? log.caller : log.receiver;
              const contactId = getId(contact);
              const contactName = contact?.username || contact?.name || 'Unknown contact';
              const statusLabel = log.status === 'missed'
                ? 'Missed'
                : log.status === 'rejected'
                  ? 'Declined'
                  : log.status === 'completed'
                    ? (isIncoming ? 'Incoming' : 'Outgoing')
                    : 'Outgoing';

              return (
                <div key={log._id} className="call-history-item">
                  <div className="call-avatar">
                    {contact?.avatar ? (
                      <img src={contact.avatar} alt="" />
                    ) : (
                      <span className="letter-avatar">{contactName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="call-details">
                    <h4>{contactName}</h4>
                    <p>
                      <span className={`status-${log.status}`}>{statusLabel}</span>
                      {' · '}
                      {log.callType === 'video' ? 'Video call' : 'Voice call'}
                      {log.status === 'completed' && ` · ${formatDuration(log.duration)}`}
                    </p>
                    <p>{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                  {onStartCall && contactId && (
                    <button
                      className="call-history-action"
                      onClick={() => onStartCall(contactId, log.callType, contact?.avatar, contactName)}
                      aria-label={`Call ${contactName}`}
                    >
                      📞
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}