import React, { useState } from 'react';
import '../styles/SettingsModal.css';

export default function SettingsModal({ isOpen, onClose }) {
  const [ringtoneName, setRingtoneName] = useState(() => {
    return localStorage.getItem('chatsphere_ringtone_filename') || 'Default Ringtone';
  });

  if (!isOpen) return null;

  const handleRingtoneUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Audio = event.target.result;
        localStorage.setItem('chatsphere_custom_ringtone', base64Audio);
        localStorage.setItem('chatsphere_ringtone_filename', file.name);
        setRingtoneName(file.name);
        alert('Custom incoming call ringtone updated!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetRingtone = () => {
    localStorage.removeItem('chatsphere_custom_ringtone');
    localStorage.removeItem('chatsphere_ringtone_filename');
    setRingtoneName('Default Ringtone');
    alert('Reset to default ringtone.');
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <h3>🔔 Call Notifications & Ringtone</h3>
          <p className="settings-desc">Upload a custom `.mp3` or `.wav` file to play when receiving incoming voice and video calls.</p>
          
          <div className="ringtone-card">
            <span className="current-ringtone-label">Current Ringtone:</span>
            <strong className="ringtone-name">{ringtoneName}</strong>

            <div className="ringtone-actions">
              <label htmlFor="settings-ringtone-file" className="settings-upload-btn">
                🎵 Change Ringtone
              </label>
              <input 
                id="settings-ringtone-file" 
                type="file" 
                accept="audio/*" 
                onChange={handleRingtoneUpload} 
                style={{ display: 'none' }} 
              />

              {ringtoneName !== 'Default Ringtone' && (
                <button className="settings-reset-btn" onClick={handleResetRingtone}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}