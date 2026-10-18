import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Sidebar.css';

export default function Sidebar({
  socket,
  chats,
  setChats,
  selectedChat,
  setSelectedChat,
  onlineUsers = [],
  unreadCounts,
  setUnreadCounts,
  chatTheme,
  setChatTheme,
  onOpenCreateGroup,
  onStartCall,
  onOpenCallHistory, // 📞 Added prop for opening call history
}) {
  const { currentUser, logoutUser, setCurrentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeChatMenuId, setActiveChatMenuId] = useState(null);
  const [chatMenuPosition, setChatMenuPosition] = useState(null);

  // Settings Dropdown State
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Filter Tab State ('All', 'Unread', 'Favorites', 'Groups', 'Calls')
  const [activeFilter, setActiveFilter] = useState('All');

  // Username & Status editing states
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [statusMessage, setStatusMessage] = useState(() => {
    return currentUser?.bio || '';
  });
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const fileInputRef = useRef(null);

  const extractId = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj._id || obj.id || String(obj);
  };

  const currentUserId = extractId(currentUser?.user || currentUser);
  const cachedChatsKey = `cached_chats_${currentUserId}`;
  const currentUsername = currentUser?.username || currentUser?.user?.username || currentUser?.name || 'User';
  const currentAvatar = currentUser?.avatar || currentUser?.user?.avatar || '';

  useEffect(() => {
    const cachedChats = localStorage.getItem(cachedChatsKey);
    if (cachedChats) {
      try {
        setChats(JSON.parse(cachedChats));
      } catch (e) {
        console.error('Failed to parse cached chats:', e);
      }
    }
  }, [cachedChatsKey, setChats]);

  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem(cachedChatsKey, JSON.stringify(chats));
    }
  }, [cachedChatsKey, chats]);

  useEffect(() => {
    const handleNewGroup = (event) => {
      const newGroup = event.detail;
      setChats((prevChats) => {
        if (prevChats.some((c) => String(c._id) === String(newGroup._id))) {
          return prevChats;
        }
        return [newGroup, ...prevChats];
      });
    };

    window.addEventListener('new_group_added', handleNewGroup);
    return () => {
      window.removeEventListener('new_group_added', handleNewGroup);
    };
  }, [setChats]);

  useEffect(() => {
    const handleUnreadEvent = (e) => {
      const { chatId } = e.detail;
      const activeChatId = extractId(selectedChat?._id || selectedChat);

      if (activeChatId !== chatId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || 0) + 1,
        }));
      }
    };

    window.addEventListener('unread_message_received', handleUnreadEvent);
    return () => {
      window.removeEventListener('unread_message_received', handleUnreadEvent);
    };
  }, [selectedChat, setUnreadCounts]);

  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await API.get(`/users?search=${query}`);
      const filtered = data.filter((u) => extractId(u) !== currentUserId);
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search failed:', err);
      const matchingChats = chats.filter(c => getChatName(c).toLowerCase().includes(query.toLowerCase()));
      const fallbackUsers = matchingChats.map(c => c.members?.find(m => extractId(m) !== currentUserId)).filter(Boolean);
      setSearchResults(fallbackUsers);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    setSearchResults([]);
  };

  const getPartnerId = (chat) => {
    const partner = chat.members?.find((m) => extractId(m) !== currentUserId);
    return extractId(partner);
  };

  const handleSelectUser = async (user) => {
    try {
      const targetUserId = extractId(user);
      const existingChat = chats.find((c) => !c.isGroup && getPartnerId(c) === targetUserId);
      if (existingChat) {
        setSelectedChat(existingChat);
        handleClearSearch();
        setUnreadCounts((prev) => ({ ...prev, [existingChat._id]: 0 }));
        await API.put(`/chats/read/${existingChat._id}`);
        return;
      }

      const { data } = await API.post('/chats', { userId: targetUserId });
      if (!chats.some((c) => extractId(c._id) === extractId(data._id))) {
        setChats([data, ...chats]);
      }
      setSelectedChat(data);
      handleClearSearch();
      setUnreadCounts((prev) => ({ ...prev, [data._id]: 0 }));
    } catch (err) {
      console.error('Failed to open chat:', err);
      alert('Cannot create new chat while offline.');
    }
  };

  const getChatName = (chat) => {
    if (chat.isGroup) return chat.chatName;
    if (chat.chatName && chat.chatName !== 'sender') return chat.chatName;
    const partner = chat.members?.find((m) => extractId(m) !== currentUserId);
    if (partner && typeof partner === 'object') {
      return partner.username || partner.name || partner.email || 'Chat Partner';
    }
    return chat.chatName || 'Chat Partner';
  };

  const isChatPartnerOnline = (chat) => {
    if (chat.isGroup) return false;
    const partner = chat.members?.find((m) => extractId(m) !== currentUserId);
    return onlineUsers.map(String).includes(String(extractId(partner)));
  };

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    setUnreadCounts((prev) => ({ ...prev, [chat._id]: 0 }));
    try {
      await API.put(`/chats/read/${chat._id}`);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleToggleFavorite = async (e, chat) => {
    e.stopPropagation();
    setActiveChatMenuId(null);
    const updatedIsFavorite = !chat.isFavorite;

    setChats((prev) =>
      prev.map((c) => (c._id === chat._id ? { ...c, isFavorite: updatedIsFavorite } : c))
    );

    try {
      await API.put(`/chats/favorite/${chat._id}`, { isFavorite: updatedIsFavorite });
    } catch (err) {
      console.error('Failed to toggle favorite on server:', err);
    }
  };

  const handleEditChat = async (e, chat) => {
    e.stopPropagation();
    setActiveChatMenuId(null);
    const currentName = getChatName(chat);
    const newName = prompt('Enter new chat name:', currentName);
    if (!newName || !newName.trim()) return;

    try {
      const { data } = await API.put('/chats/rename', {
        chatId: chat._id,
        chatName: newName.trim(),
      });
      setChats((prev) => prev.map((c) => (c._id === chat._id ? data : c)));
      if (selectedChat && extractId(selectedChat._id) === extractId(chat._id)) {
        setSelectedChat(data);
      }
    } catch (err) {
      console.error('Failed to edit chat name:', err);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    setActiveChatMenuId(null);
    if (!window.confirm('Are you sure you want to delete this entire conversation?')) return;

    try {
      await API.delete(`/chats/${chatId}`);
      setChats((prev) => prev.filter((c) => c._id !== chatId));
      if (extractId(selectedChat?._id) === chatId) {
        setSelectedChat(null);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    try {
      const { data } = await API.put('/users/profile', { username: newUsername });
      if (setCurrentUser) {
        setCurrentUser((prev) => ({
          ...prev,
          username: data.username || newUsername,
          user: prev?.user ? { ...prev.user, username: data.username || newUsername } : undefined,
        }));
      }
      setIsEditingUsername(false);
      setNewUsername('');
    } catch (err) {
      console.error('Failed to update username:', err);
    }
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    const bio = newStatus.trim();
    if (bio.length > 139) {
      alert('Bio cannot exceed 139 characters.');
      return;
    }

    try {
      const { data } = await API.put('/users/profile', { bio });
      if (data.bio !== bio) {
        throw new Error('The server did not confirm the bio update. Restart the backend and try again.');
      }
      const savedBio = data.bio;
      setStatusMessage(savedBio);
      setCurrentUser((prev) => prev ? {
        ...prev,
        bio: savedBio,
        user: prev.user ? { ...prev.user, bio: savedBio } : undefined,
      } : prev);
      setIsEditingStatus(false);
      setNewStatus('');
    } catch (err) {
      console.error('Failed to update bio:', err);
      alert(err.response?.data?.message || err.message || 'Could not update your bio. Please try again.');
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result;
      try {
        const { data } = await API.put('/users/profile', { avatar: base64Image });
        const newAvatarUrl = data.avatar || base64Image;

        if (setCurrentUser) {
          setCurrentUser((prev) => ({
            ...prev,
            avatar: newAvatarUrl,
            user: prev?.user ? { ...prev.user, avatar: newAvatarUrl } : undefined,
          }));
        }
      } catch (err) {
        console.error('Failed to update profile picture:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const formateMessageDate = (timestamp) => {
    if (!timestamp) return '';
    const messageDate = new Date(timestamp);
    const today = new Date();
    const isToday = 
      messageDate.getDate() === today.getDate() &&
      messageDate.getMonth() === today.getMonth() &&
      messageDate.getFullYear() === today.getFullYear();
    
    if (isToday) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
           messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
  };

  const filteredChats = chats.filter((chat) => {
    if (activeFilter === 'Unread') return (unreadCounts[chat._id] || 0) > 0;
    if (activeFilter === 'Favorites') return chat.isFavorite === true;
    if (activeFilter === 'Groups') return chat.isGroup === true;
    if (activeFilter === 'Calls') return !chat.isGroup;
    return true;
  });

  return (
    <div 
      className="sidebar-container" 
      onClick={() => { 
        setActiveChatMenuId(null); 
        setShowSettingsMenu(false); 
      }}
    >
      <div className="sidebar-header">
        <div className="sidebar-top-row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleImageChange}
          />

          <h2 className="app-brand-title">ChatSphere</h2>

          <div className="sidebar-settings-wrapper" onClick={(e) => e.stopPropagation()}>
            <button 
              className={`icon-action-btn ${showSettingsMenu ? 'active' : ''}`}
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              title="Settings & Options"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>

            {showSettingsMenu && (
              <div className="sidebar-settings-dropdown">
                <div className="settings-profile-card">
                  <div 
                    className="settings-avatar"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change Avatar"
                  >
                    {currentAvatar ? (
                      <img src={currentAvatar} alt="Profile" />
                    ) : (
                      currentUsername.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="settings-user-info">
                    <h4>{currentUsername}</h4>
                    <span className="settings-status-text">
                      {statusMessage ? `"${statusMessage}"` : 'Add a short bio'}
                    </span>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-menu-item" style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'default' }}>
                  <span style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>🔔 Call Ringtone</span>
                  <label 
                    htmlFor="sidebar-ringtone-input" 
                    style={{ 
                      backgroundColor: '#00a884', 
                      color: '#fff', 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '11px', 
                      cursor: 'pointer',
                      display: 'inline-block'
                    }}
                  >
                    📁 Change Ringtone
                  </label>
                  <input 
                    id="sidebar-ringtone-input" 
                    type="file" 
                    accept="audio/*" 
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (uploadEvent) => {
                          localStorage.setItem('chatsphere_custom_ringtone', uploadEvent.target.result);
                          alert('Custom ringtone saved successfully!');
                          setShowSettingsMenu(false);
                        };
                        reader.readAsDataURL(file);
                      }
                    }} 
                    style={{ display: 'none' }} 
                  />
                </div>

                <div className="settings-divider" />

                <button 
                  className="settings-menu-item"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    if (onOpenCreateGroup) onOpenCreateGroup();
                  }}
                >
                  👥 Create New Group
                </button>

                {/* 📞 Call History Option in Dropdown */}
                <button 
                  className="settings-menu-item"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    if (onOpenCallHistory) onOpenCallHistory();
                  }}
                >
                  📞 View Call Logs
                </button>

                <div className="settings-divider" />

                {isEditingUsername ? (
                  <form onSubmit={handleUpdateUsername} className="settings-inline-form">
                    <input
                      type="text"
                      value={newUsername}
                      placeholder={currentUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="save-btn">✓</button>
                    <button type="button" className="cancel-btn" onClick={() => setIsEditingUsername(false)}>✕</button>
                  </form>
                ) : (
                  <button 
                    className="settings-menu-item"
                    onClick={() => { setNewUsername(currentUsername); setIsEditingUsername(true); }}
                  >
                    ✎ Edit Username
                  </button>
                )}

                {isEditingStatus ? (
                  <form onSubmit={handleUpdateStatus} className="settings-inline-form">
                    <input
                      type="text"
                      maxLength={139}
                      value={newStatus}
                      placeholder={statusMessage || 'Add a short bio'}
                      onChange={(e) => setNewStatus(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="save-btn">✓</button>
                    <button type="button" className="cancel-btn" onClick={() => setIsEditingStatus(false)}>✕</button>
                  </form>
                ) : (
                  <button 
                    className="settings-menu-item"
                    onClick={() => { setNewStatus(statusMessage); setIsEditingStatus(true); }}
                  >
                    💬 Edit About / Status
                  </button>
                )}

                <button 
                  className="settings-menu-item"
                  onClick={() => fileInputRef.current?.click()}
                >
                  🕵 Change Profile Photo
                </button>

                {setChatTheme && (
                  <button 
                    className="settings-menu-item"
                    onClick={() => setChatTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  >
                    {chatTheme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                  </button>
                )}

                <div className="settings-divider" />

                <button 
                  className="settings-menu-item danger" 
                  onClick={logoutUser}
                >
                  ➜] Logout
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="search-bar-form">
          <div className="search-input-wrapper">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button type="button" className="clear-search-btn" onClick={handleClearSearch}>
                ×
              </button>
            )}
          </div>
        </div>

        {!isSearching && (
          <div className="filter-pills-row">
            {['All', 'Unread', 'Favorites', 'Groups', 'Calls'].map((filterName) => (
              <button
                key={filterName}
                className={`filter-pill ${activeFilter === filterName ? 'active' : ''}`}
                onClick={() => {
                  setActiveFilter(filterName);
                  // 📞 Open Call History Modal when clicking the Calls pill
                  if (filterName === 'Calls' && onOpenCallHistory) {
                    onOpenCallHistory();
                  }
                }}
              >
                {filterName === 'Calls' ? '📞 Calls' : filterName}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="chat-list"
        onScroll={() => {
          if (activeChatMenuId) {
            setActiveChatMenuId(null);
            setChatMenuPosition(null);
          }
        }}
      >
        {isSearching ? (
          <div className="search-results-section">
            <div className="section-title">Search Results</div>
            {searchResults.length === 0 ? (
              <div className="empty-search">No users found</div>
            ) : (
              searchResults.map((user) => {
                const userId = extractId(user._id || user);
                return (
                  <div key={userId} className="chat-item" onClick={() => handleSelectUser(user)}>
                    <div className="chat-avatar" style={{ overflow: 'hidden' }}>
                      {user.avatar ? (
                        <img src={user.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        user.username?.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="chat-details">
                      <h4 className="chat-name">{user.username || 'User'}</h4>
                      <span className="chat-subtext">{user.bio || 'Start a conversation'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="empty-chats">
            <p>No conversations found.</p>
            <span>Try switching filters or search for a user above!</span>
          </div>
        ) : (
          <>
            {filteredChats.map((chat) => {
              const isSelected = extractId(selectedChat?._id) === extractId(chat._id);
              const isOnline = isChatPartnerOnline(chat);
              const unreadCount = unreadCounts[chat._id] || 0;
              const partner = chat.members?.find((m) => extractId(m) !== currentUserId);
              const targetUserId = partner?._id || partner?.id || partner;
              const partnerAvatar = partner?.avatar || '';

              return (
                <div
                  key={chat._id}
                  className={`chat-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectChat(chat)}
                >
                  <div className="chat-avatar" style={{ overflow: 'hidden' }}>
                    {chat.isGroup ? (
                      chat.avatar ? (
                        <img src={chat.avatar} alt="Group Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div className="group-avatar-fallback" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00a884', color: '#fff', fontWeight: 'bold' }}>
                          {chat.chatName ? chat.chatName.charAt(0).toUpperCase() : 'G'}
                        </div>
                      )
                    ) : partner && typeof partner === 'object' && partner.avatar ? (
                      <img src={partner.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getChatName(chat).charAt(0).toUpperCase()
                    )}
                    {isOnline && <span className="avatar-online-dot" />}
                  </div>

                  <div className="chat-details">
                    <div className="chat-row-top">
                      <h4 className="chat-name">
                        {chat.isFavorite && <span className="favorite-star-icon">★ </span>}
                        {getChatName(chat)}
                      </h4>
                      {chat.latestMessage && activeFilter !== 'Calls' && (
                        <span className="chat-time">
                          {formateMessageDate(chat.latestMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="chat-row-bottom">
                      <p className="latest-message">
                        {activeFilter === 'Calls' ? 'Tap icon to place call' : (chat.latestMessage?.content || 'Tap to chat')}
                      </p>
                      {unreadCount > 0 && activeFilter !== 'Calls' && <span className="unread-dot" />}
                    </div>
                  </div>

                  {activeFilter === 'Calls' && !chat.isGroup ? (
                    <div className="chat-item-options-wrapper" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => {
                          if (onStartCall) onStartCall(targetUserId, 'audio', partnerAvatar);
                        }}
                        title="Voice Call"
                        style={{
                          backgroundColor: '#e7f8f5',
                          color: '#00a884',
                          border: 'none',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        📞
                      </button>
                      <button
                        onClick={() => {
                          if (onStartCall) onStartCall(targetUserId, 'video', partnerAvatar);
                        }}
                        title="Video Call"
                        style={{
                          backgroundColor: '#e7f8f5',
                          color: '#00a884',
                          border: 'none',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        📹
                      </button>
                    </div>
                  ) : (
                    <div className="chat-item-options-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="chat-item-options-trigger"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeChatMenuId === chat._id) {
                            setActiveChatMenuId(null);
                            setChatMenuPosition(null);
                            return;
                          }
                          const bounds = e.currentTarget.getBoundingClientRect();
                          const menuHeight = 144;
                          const top = bounds.bottom + menuHeight < window.innerHeight
                            ? bounds.bottom + 6
                            : Math.max(12, bounds.top - menuHeight - 6);
                          setChatMenuPosition({
                            top,
                            right: Math.max(12, window.innerWidth - bounds.right),
                          });
                          setActiveChatMenuId(chat._id);
                        }}
                        aria-label={`Options for ${getChatName(chat)}`}
                        aria-expanded={activeChatMenuId === chat._id}
                      >
                        ⋮
                      </button>
                      {activeChatMenuId === chat._id && (
                        <div
                          className="chat-dropdown-menu"
                          style={chatMenuPosition ? {
                            top: `${chatMenuPosition.top}px`,
                            right: `${chatMenuPosition.right}px`,
                          } : undefined}
                        >
                          <button onClick={(e) => handleToggleFavorite(e, chat)}>
                            {chat.isFavorite ? '★ Remove Favorite' : '☆ Add to Favorites'}
                          </button>
                          <button onClick={(e) => handleEditChat(e, chat)}>
                            Edit Chat
                          </button>
                          <button onClick={(e) => handleDeleteChat(e, chat._id)}>
                            Delete Chat
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="sidebar-footer-note">
              <span>Chat messages are stored in the app database; end-to-end encryption is not enabled.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}