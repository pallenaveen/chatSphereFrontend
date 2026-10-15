import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import '../styles/GroupInfoDrawer.css';

export default function UserProfileDrawer({ isOpen, onClose, selectedChat, currentUserId, onlineUsers = [] }) {
  const [sharedDocs, setSharedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Safe fetch effect (All hooks MUST be declared before any early returns)
  useEffect(() => {
    let isMounted = true;

    const fetchSharedDocs = async () => {
      if (!isOpen || !selectedChat?._id || selectedChat.isGroup) return;
      setLoadingDocs(true);
      try {
        const { data } = await API.get(`/messages/${selectedChat._id}`);
        if (!isMounted) return;

        const messageList = Array.isArray(data) ? data : [];
        const docs = messageList.filter(
          (msg) =>
            msg?.fileUrl ||
            msg?.mediaUrl ||
            msg?.attachment ||
            (typeof msg?.content === 'string' && msg.content.match(/\.(pdf|docx?|xlsx?|png|jpe?g|gif|webp)$/i))
        );
        setSharedDocs(docs);
      } catch (err) {
        console.error('Failed to fetch shared attachments:', err);
        if (isMounted) setSharedDocs([]);
      } finally {
        if (isMounted) setLoadingDocs(false);
      }
    };

    if (isOpen) {
      fetchSharedDocs();
    } else {
      setSharedDocs([]);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedChat]);

  // Early return is now safely AFTER all hook declarations
  if (!isOpen || !selectedChat || selectedChat.isGroup) return null;

  const membersList = Array.isArray(selectedChat?.members) ? selectedChat.members : [];
  const partner = membersList.find((m) => {
    const mId = typeof m === 'object' ? (m?._id || m?.id) : m;
    return String(mId) !== String(currentUserId);
  });

  const username = partner?.username || partner?.name || selectedChat?.chatName || 'User';
  const email = partner?.email || 'No email provided';
  const avatar = partner?.avatar || selectedChat?.avatar || '';
  
  const partnerId = partner?._id || partner?.id || partner;
  const safeOnlineUsers = Array.isArray(onlineUsers) ? onlineUsers : [];
  const isOnline = safeOnlineUsers.map(String).includes(String(partnerId));

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Offline';
    
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // midnight (0) becomes 12
    const formattedHours = String(hours).padStart(2, '0');
    const timeStr = `${formattedHours}:${minutes} ${ampm}`;

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `last seen today at ${timeStr}`;
    if (isYesterday) return `last seen yesterday at ${timeStr}`;
    
    return `last seen on ${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} at ${timeStr}`;
  };

  return (
    <div className="group-drawer-overlay" onClick={onClose}>
      <div className="group-drawer-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Drawer Header */}
        <div className="group-drawer-header">
          <h3>Contact Info</h3>
          <button className="drawer-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Profile Banner */}
        <div className="group-profile-banner">
          <div className="group-profile-avatar-wrapper">
            {avatar ? (
              <img src={avatar} alt={username} />
            ) : (
              <span>{username.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="group-title-row">
            <h2>{username}</h2>
          </div>

          <p className="group-members-count">
            {isOnline ? (
              <span style={{ color: '#00a884', fontWeight: 600 }}>● Online</span>
            ) : (
              partner?.lastSeen ? formatLastSeen(partner.lastSeen) : 'Offline'
            )}
          </p>
        </div>

        <div className="drawer-divider" />

        {/* Email Section */}
        <div className="members-list-container">
          <div className="members-header-row">
            <h4>Email Address</h4>
          </div>
          <p className="drawer-description-text" style={{ padding: '0 4px' }}>
            {email}
          </p>
        </div>

        <div className="drawer-divider" />

        {/* Media / Attachments Section */}
        <div className="members-list-container">
          <div className="members-header-row">
            <h4>Media, links and docs ({sharedDocs.length})</h4>
          </div>

          {loadingDocs ? (
            <p className="drawer-loading-text">Loading shared files...</p>
          ) : sharedDocs.length > 0 ? (
            <div className="shared-docs-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {sharedDocs.map((doc, idx) => {
                const fileTarget = doc?.fileUrl || doc?.mediaUrl || doc?.attachment || doc?.content || '';
                const fileName = doc?.fileName || (typeof fileTarget === 'string' ? fileTarget.split('/').pop() : `Document_${idx + 1}.pdf`);
                return (
                  <a
                    key={doc?._id || idx}
                    href={fileTarget}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shared-doc-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      backgroundColor: 'var(--drawer-item-bg, #f5f6f8)',
                      border: '1px solid #e9edef'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📄</span>
                    <span style={{ fontSize: '13.5px', color: '#00a884', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fileName}
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="drawer-media-placeholder">
              <p>No media shared yet</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}