import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import '../styles/GroupInfoDrawer.css';

export default function GroupInfoDrawer({ 
  isOpen, 
  onClose, 
  selectedChat, 
  setSelectedChat, 
  currentUserId, 
  setChats 
}) {
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedNewUsers, setSelectedNewUsers] = useState([]);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const groupAvatarInputRef = useRef(null);

  useEffect(() => {
    if (selectedChat) {
      setGroupNameInput(selectedChat.chatName || '');
    }
  }, [selectedChat]);

  // Fetch all registered system users when "Add Members" is toggled
  useEffect(() => {
    if (isAddingMembers && selectedChat) {
      const fetchAllUsers = async () => {
        setLoadingUsers(true);
        try {
          const { data } = await API.get('/users');
          // Filter out current user and existing group members
          const existingMemberIds = new Set(
            (selectedChat.members || []).map((m) => String(m._id || m.id || m))
          );
          
          const filtered = data.filter(
            (u) => !existingMemberIds.has(String(u._id || u.id)) && String(u._id || u.id) !== String(currentUserId)
          );
          setAvailableUsers(filtered);
        } catch (err) {
          console.error('Failed to fetch contacts:', err);
        } finally {
          setLoadingUsers(false);
        }
      };

      fetchAllUsers();
    }
  }, [isAddingMembers, selectedChat, currentUserId]);

  if (!isOpen || !selectedChat || !selectedChat.isGroup) return null;

  const isAdmin = String(selectedChat.groupAdmin?._id || selectedChat.groupAdmin) === String(currentUserId);

  const handleGroupAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = (error) => console.error("FileReader error:", error);
    
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = (err) => console.error("Image loading failed:", err);
      
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height *= MAX_DIMENSION / width;
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width *= MAX_DIMENSION / height;
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

        setIsSubmitting(true);
        try {
          const { data } = await API.put('/chats/rename', {
            chatId: selectedChat._id,
            avatar: compressedBase64,
          });

          // Force new object instance so React triggers an immediate re-render
          const updatedChatObj = { ...data };
          setSelectedChat(updatedChatObj);
          
          if (typeof setChats === 'function') {
            setChats((prev) =>
              prev.map((c) => (String(c._id) === String(data._id) ? updatedChatObj : c))
            );
          }
        } catch (err) {
          console.error('Failed to update group avatar:', err);
          alert(err.response?.data?.message || 'Failed to update group picture');
        } finally {
          setIsSubmitting(false);
          if (e.target) e.target.value = ''; // Reset input target to allow selecting the same file again
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRenameGroup = async (e) => {
    if (e) e.preventDefault();
    if (!groupNameInput.trim()) return;

    setIsSubmitting(true);
    try {
      const { data } = await API.put('/chats/rename', {
        chatId: selectedChat._id,
        chatName: groupNameInput.trim(),
      });

      const updatedChatObj = { ...data };
      setSelectedChat(updatedChatObj);
      if (typeof setChats === 'function') {
        setChats((prev) =>
          prev.map((c) => (String(c._id) === String(data._id) ? updatedChatObj : c))
        );
      }
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to rename group:', err);
      alert(err.response?.data?.message || 'Server connection failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSelectUser = (userId) => {
    if (selectedNewUsers.includes(userId)) {
      setSelectedNewUsers(selectedNewUsers.filter((id) => id !== userId));
    } else {
      setSelectedNewUsers([...selectedNewUsers, userId]);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (selectedNewUsers.length === 0) return;

    setIsSubmitting(true);
    try {
      let updatedChat = selectedChat;
      for (const userId of selectedNewUsers) {
        const { data } = await API.put('/chats/group/add', {
          chatId: selectedChat._id,
          userId: userId,
        });
        updatedChat = data;
      }

      const updatedChatObj = { ...updatedChat };
      setSelectedChat(updatedChatObj);
      if (typeof setChats === 'function') {
        setChats((prev) =>
          prev.map((c) => (String(c._id) === String(updatedChat._id) ? updatedChatObj : c))
        );
      }
      setSelectedNewUsers([]);
      setIsAddingMembers(false);
    } catch (err) {
      console.error('Failed to add members:', err);
      alert('Failed to add members to group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member from the group?')) return;

    try {
      const { data } = await API.put('/chats/group/remove', {
        chatId: selectedChat._id,
        userId: memberId,
      });

      const updatedChatObj = { ...data };
      setSelectedChat(updatedChatObj);
      if (typeof setChats === 'function') {
        setChats((prev) =>
          prev.map((c) => (String(c._id) === String(data._id) ? updatedChatObj : c))
        );
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('Failed to remove member');
    }
  };

  return (
    <div className="group-drawer-overlay" onClick={onClose}>
      <div className="group-drawer-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Drawer Header */}
        <div className="group-drawer-header">
          <h3>Group Info</h3>
          <button className="drawer-close-btn" onClick={onClose}>✕</button>
        </div>

        <input 
          type="file" 
          ref={groupAvatarInputRef} 
          style={{ display: 'none' }} 
          accept="image/*" 
          onChange={handleGroupAvatarChange} 
        />

        {/* Group Profile Banner */}
        <div className="group-profile-banner">
          <div 
            className={`group-profile-avatar-wrapper ${isAdmin ? 'is-admin-clickable' : ''}`}
            onClick={() => isAdmin && !isSubmitting && groupAvatarInputRef.current?.click()}
            title={isAdmin ? "Click to change Group Photo" : ""}
          >
            {selectedChat.avatar ? (
              <img src={selectedChat.avatar} alt="Group Avatar" />
            ) : (
              <div className="group-avatar-initial">
                {selectedChat.chatName?.charAt(0).toUpperCase() || 'G'}
              </div>
            )}
            {isAdmin && <div className="camera-overlay">📷 Edit</div>}
          </div>

          {isEditingName ? (
            <form onSubmit={handleRenameGroup} className="group-rename-form">
              <input 
                type="text" 
                value={groupNameInput} 
                onChange={(e) => setGroupNameInput(e.target.value)} 
                autoFocus 
              />
              <button type="submit" className="save-btn" disabled={isSubmitting}>✓</button>
              <button type="button" className="cancel-btn" onClick={() => setIsEditingName(false)}>✕</button>
            </form>
          ) : (
            <div className="group-title-row">
              <h2>{selectedChat.chatName}</h2>
              {isAdmin && (
                <button 
                  className="edit-name-btn" 
                  onClick={() => { setGroupNameInput(selectedChat.chatName); setIsEditingName(true); }}
                  title="Rename Group"
                >
                  ✎
                </button>
              )}
            </div>
          )}
          <span className="group-members-count">
            {selectedChat.members?.length || 0} members
          </span>
        </div>

        <div className="drawer-divider" />

        {/* Add Members Section */}
        {isAddingMembers ? (
          <div className="add-members-section">
            <div className="add-members-header">
              <h4>Select Contacts to Add</h4>
              <button className="back-link-btn" onClick={() => setIsAddingMembers(false)}>← Back</button>
            </div>

            <div className="add-members-list">
              {loadingUsers ? (
                <div className="drawer-loading-text">Loading contacts...</div>
              ) : availableUsers.length === 0 ? (
                <p className="no-contacts-text">All registered users are already in this group.</p>
              ) : (
                availableUsers.map((u) => {
                  const uId = u._id || u.id;
                  const isChecked = selectedNewUsers.includes(uId);
                  return (
                    <div 
                      key={uId} 
                      className={`add-member-item ${isChecked ? 'selected' : ''}`}
                      onClick={() => handleToggleSelectUser(uId)}
                    >
                      <div className="add-member-user-info">
                        <div className="small-user-avatar">
                          {u.avatar ? <img src={u.avatar} alt="Avatar" /> : (u.username || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="add-member-details">
                          <span className="add-member-name">{u.username || 'User'}</span>
                          <span className="add-member-email">{u.email}</span>
                        </div>
                      </div>
                      <input type="checkbox" checked={isChecked} readOnly />
                    </div>
                  );
                })
              )}
            </div>

            <div className="add-members-actions">
              <button className="cancel-btn" onClick={() => setIsAddingMembers(false)}>Cancel</button>
              <button 
                className="submit-btn" 
                onClick={handleAddSelectedMembers}
                disabled={selectedNewUsers.length === 0 || isSubmitting}
              >
                {isSubmitting ? 'Adding...' : `Add Selected (${selectedNewUsers.length})`}
              </button>
            </div>
          </div>
        ) : (
          <div className="members-list-container">
            <div className="members-header-row">
              <h4>Group Participants ({selectedChat.members?.length})</h4>
              {isAdmin && (
                <button className="add-participant-btn" onClick={() => setIsAddingMembers(true)}>
                  + Add Member
                </button>
              )}
            </div>

            <div className="members-scroll-list">
              {selectedChat.members?.map((member) => {
                const mId = typeof member === 'string' ? member : (member._id || member.id);
                const isMemberAdmin = String(mId) === String(selectedChat.groupAdmin?._id || selectedChat.groupAdmin);
                const isMe = String(mId) === String(currentUserId);
                const memberName = typeof member === 'object' ? member.username || member.email : 'User';
                const memberAvatar = typeof member === 'object' ? member.avatar : null;

                return (
                  <div key={mId} className="member-list-item">
                    <div className="member-avatar">
                      {memberAvatar ? <img src={memberAvatar} alt="Avatar" /> : memberName.charAt(0).toUpperCase()}
                    </div>
                    <div className="member-info">
                      <span className="member-name">
                        {memberName} {isMe && '(You)'}
                      </span>
                      {isMemberAdmin && <span className="admin-badge">👑 Group Admin</span>}
                    </div>
                    {isAdmin && !isMe && (
                      <button className="remove-member-btn" onClick={() => handleRemoveMember(mId)}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}