import { useState } from 'react';
import API from '../api/axios';
import '../styles/CreateGroupModal.css';

export default function CreateGroupModal({ isOpen, onClose, chats, setChats, setSelectedChat, currentUserId }) {
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);

  if (!isOpen) return null;

  // Extract unique individual contacts from existing chats safely
  const availableUsersMap = new Map();
  chats.forEach((chat) => {
    if (!chat.isGroup && chat.members) {
      chat.members.forEach((m) => {
        if (!m) return;
        const mId = typeof m === 'string' ? m : (m._id || m.id);
        if (mId && String(mId) !== String(currentUserId)) {
          const userObj = typeof m === 'object' ? m : { _id: m };
          availableUsersMap.set(String(mId), userObj);
        }
      });
    }
  });
  const availableUsers = Array.from(availableUsersMap.values());

  const handleToggleUser = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      alert('Please enter a group name.');
      return;
    }
    if (selectedUsers.length < 2) {
      alert('Please select at least 2 members for a group chat.');
      return;
    }

    try {
      // Send array of selected user IDs to the backend
      const { data } = await API.post('/chats/group', {
        name: groupName.trim(),
        users: selectedUsers,
      });

      // Update local state to immediately show the group in creator's chat list
      setChats([data, ...chats]);
      setSelectedChat(data);
      setGroupName('');
      setSelectedUsers([]);
      onClose();
    } catch (err) {
      console.error('Failed to create group:', err);
      alert(err.response?.data?.message || 'Failed to create group');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Group Chat</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleCreateGroup}>
          <div className="form-group">
            <input
              type="text"
              placeholder="Group subject / name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="modal-text-input"
              autoFocus
            />
          </div>

          <div className="members-section-title">
            Select Members ({selectedUsers.length} selected, min 2)
          </div>

          <div className="user-selection-list">
            {availableUsers.length === 0 ? (
              <p className="no-users-text">No contacts found. Chat with individual users first to add them to groups!</p>
            ) : (
              availableUsers.map((user) => {
                const uId = user._id || user.id;
                const isChecked = selectedUsers.includes(uId);
                return (
                  <div 
                    key={uId} 
                    className={`user-select-item ${isChecked ? 'selected' : ''}`}
                    onClick={() => handleToggleUser(uId)}
                  >
                    <div className="user-select-avatar">
                      {user.avatar ? (
                        <img src={user.avatar} alt="Avatar" />
                      ) : (
                        (user.username || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="user-select-details">
                      <span className="user-select-name">{user.username || 'User'}</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={() => {}} 
                      className="user-checkbox" 
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="modal-footer-actions">
            <button type="button" className="modal-btn cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn submit">Create Group</button>
          </div>
        </form>
      </div>
    </div>
  );
}