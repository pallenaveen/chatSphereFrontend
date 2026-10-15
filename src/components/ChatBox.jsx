import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import '../styles/ChatBox.css';
import { playNotificationSound } from '../utils/sound';
import GroupInfoDrawer from './GroupInfoDrawer';

export default function ChatBox({ socket, selectedChat, setSelectedChat, chats = [], setChats, onlineUsers = [], onOpenProfile }) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const [presenceByUserId, setPresenceByUserId] = useState({});

  // Group Info Drawer state
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);

  // States for editing, options, image, audio recording, and floating toast notification
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [floatingMessage, setFloatingMessage] = useState(null);

  // Chat Header Settings Menu & Theme/Background States
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [chatTheme, setChatTheme] = useState(() => {
    return sessionStorage.getItem('chat_theme') || localStorage.getItem('chat_theme') || 'light';
  });
  const [chatBgImage, setChatBgImage] = useState(() => {
    return sessionStorage.getItem('chat_wallpaper') || localStorage.getItem('chat_wallpaper') || '';
  });

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const floatingTimeoutRef = useRef(null);

  const messagesEndRef = useRef(null);
  const selectedChatRef = useRef(selectedChat);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const bgInputRef = useRef(null);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Sync theme to storage
  useEffect(() => {
    try {
      sessionStorage.setItem('chat_theme', chatTheme);
      localStorage.setItem('chat_theme', chatTheme);
    } catch (e) {
      console.error('Failed to save chat theme:', e);
    }
  }, [chatTheme]);

  // Sync background wallpaper to storage
  useEffect(() => {
    try {
      if (chatBgImage) {
        sessionStorage.setItem('chat_wallpaper', chatBgImage);
        localStorage.setItem('chat_wallpaper', chatBgImage);
      } else {
        sessionStorage.removeItem('chat_wallpaper');
        localStorage.removeItem('chat_wallpaper');
      }
    } catch (e) {
      console.error('Failed to save chat wallpaper:', e);
      alert('Image size is too large for storage.');
    }
  }, [chatBgImage]);

  const extractId = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj._id || obj.id || String(obj);
  };

  const currentUserId = extractId(currentUser?.user || currentUser);
  const currentUsername = currentUser?.username || currentUser?.user?.username || currentUser?.name || 'Someone';
  const activeChatId = extractId(selectedChat);

  const scrollToBottom = (behavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  useEffect(() => {
    if (messages.length > 0 || isTyping) {
      scrollToBottom('smooth');
    }
  }, [messages, isTyping]);

  const formatTimeOnly = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatFileSize = (size) => {
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    return `${(size / (1024 ** unitIndex)).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const formatDateDivider = (timestamp) => {
    if (!timestamp) return '';
    const messageDate = new Date(timestamp);
    const today = new Date();

    const isToday =
      messageDate.getDate() === today.getDate() &&
      messageDate.getMonth() === today.getMonth() &&
      messageDate.getFullYear() === today.getFullYear();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday =
      messageDate.getDate() === yesterday.getDate() &&
      messageDate.getMonth() === yesterday.getMonth() &&
      messageDate.getFullYear() === yesterday.getFullYear();

    if (isToday) return 'TODAY';
    if (isYesterday) return 'YESTERDAY';

    return messageDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isNewDay = (currentTimestamp, previousTimestamp) => {
    if (!previousTimestamp) return true;
    const d1 = new Date(currentTimestamp);
    const d2 = new Date(previousTimestamp);
    return (
      d1.getDate() !== d2.getDate() ||
      d1.getMonth() !== d2.getMonth() ||
      d1.getFullYear() !== d2.getFullYear()
    );
  };

  const safeSetSessionStorage = (key, value) => {
    try {
      if (value && value.length > 50000) return; 
      sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn('Storage quota skipped for large payload');
    }
  };

  // Fetch messages & join room
  useEffect(() => {
    if (!activeChatId) return;

    setIsTyping(false);
    setTypingUser('');
    setActiveMenuId(null);
    setEditingMessageId(null);
    setSelectedAttachment(null);
    setAudioBlobUrl(null);
    setIsRecording(false);
    setShowChatSettings(false);
    setIsGroupInfoOpen(false);

    const cacheKey = `messages_${activeChatId}`;
    const cachedMessages = sessionStorage.getItem(cacheKey);
    if (cachedMessages) {
      try {
        setMessages(JSON.parse(cachedMessages));
      } catch (e) {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }

    const fetchMessages = async () => {
      try {
        setLoading(true);
        const { data } = await API.get(`/messages/${activeChatId}`);
        setMessages(data);
        safeSetSessionStorage(cacheKey, JSON.stringify(data));

        if (socket) {
          socket.emit('join_room', activeChatId);
        }
        scrollToBottom('auto');
      } catch (err) {
        console.error('Network error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [activeChatId, currentUserId, socket]);

  // Listen for background unread messages
  useEffect(() => {
    const handleUnreadMessage = (event) => {
      const { chatId, message } = event.detail;
      setFloatingMessage({ chatId, message });

      if (floatingTimeoutRef.current) clearTimeout(floatingTimeoutRef.current);
      floatingTimeoutRef.current = setTimeout(() => {
        setFloatingMessage(null);
      }, 5000);
    };

    window.addEventListener('unread_message_received', handleUnreadMessage);
    return () => {
      window.removeEventListener('unread_message_received', handleUnreadMessage);
      if (floatingTimeoutRef.current) clearTimeout(floatingTimeoutRef.current);
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (incomingMsg) => {
      playNotificationSound();

      const activeChat = selectedChatRef.current;
      const incomingChatId = extractId(incomingMsg.conversationId?._id || incomingMsg.conversationId);
      const currentActiveId = extractId(activeChat);

      if (currentActiveId && currentActiveId === incomingChatId) {
        setMessages((prev) => {
          if (prev.some((msg) => msg._id === incomingMsg._id)) return prev;
          const updated = [...prev, incomingMsg];
          safeSetSessionStorage(`messages_${currentActiveId}`, JSON.stringify(updated));
          return updated;
        });
        setIsTyping(false);
        setTypingUser('');

        const isMobileScreen = window.innerWidth <= 900;
        const container = document.querySelector('.chat-page-container');
        const isChatVisible = !isMobileScreen || (container && container.classList.contains('chat-selected'));

        if (isChatVisible) {
          API.put(`/chats/read/${currentActiveId}`).catch(err => console.error(err));
          socket.emit('mark_chat_as_read', {
            conversationId: currentActiveId,
            userId: currentUserId,
          });
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('unread_message_received', {
            detail: { chatId: incomingChatId, message: incomingMsg },
          })
        );
      }
    };

    const handleChatMarkedRead = ({ conversationId, userId }) => {
      const activeChat = selectedChatRef.current;
      const currentActiveId = extractId(activeChat);
      const incomingConvId = extractId(conversationId);

      if (currentActiveId === incomingConvId && extractId(userId) !== currentUserId) {
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            const currentReadBy = (msg.readBy || []).map(id => extractId(id));
            const newUserId = extractId(userId);

            if (!currentReadBy.includes(newUserId)) {
              return {
                ...msg,
                isRead: true,
                status: 'read',
                readBy: [...(msg.readBy || []), userId]
              };
            }
            return msg;
          });
          safeSetSessionStorage(`messages_${currentActiveId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleMessageEdited = (updatedMsg) => {
      const activeChat = selectedChatRef.current;
      const currentActiveId = extractId(activeChat);

      setMessages((prev) => {
        const updated = prev.map((msg) => (msg._id === updatedMsg._id ? updatedMsg : msg));
        if (currentActiveId) {
          safeSetSessionStorage(`messages_${currentActiveId}`, JSON.stringify(updated));
        }
        return updated;
      });
    };

    const handleMessageDeleted = ({ messageId }) => {
      const activeChat = selectedChatRef.current;
      const currentActiveId = extractId(activeChat);

      setMessages((prev) => {
        const updated = prev.filter((msg) => msg._id !== messageId);
        if (currentActiveId) {
          safeSetSessionStorage(`messages_${currentActiveId}`, JSON.stringify(updated));
        }
        return updated;
      });
    };

    const handleTyping = ({ room, username }) => {
      const activeChat = selectedChatRef.current;
      const currentActiveId = extractId(activeChat);

      if (currentActiveId === room) {
        setIsTyping(true);
        setTypingUser(username || 'Someone');
      }
    };

    const handleStopTyping = ({ room }) => {
      const activeChat = selectedChatRef.current;
      const currentActiveId = extractId(activeChat);

      if (currentActiveId === room) {
        setIsTyping(false);
        setTypingUser('');
      }
    };

    const handleUserStatusChange = ({ userId, isOnline, lastSeen }) => {
      const presenceUserId = extractId(userId);
      if (!presenceUserId) return;

      setPresenceByUserId((prev) => ({
        ...prev,
        [presenceUserId]: {
          isOnline: Boolean(isOnline),
          lastSeen: lastSeen || prev[presenceUserId]?.lastSeen || null,
        },
      }));
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('chat_marked_read', handleChatMarkedRead);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);
    socket.on('user_status_change', handleUserStatusChange);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('chat_marked_read', handleChatMarkedRead);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('typing', handleTyping);
      socket.off('stop_typing', handleStopTyping);
      socket.off('user_status_change', handleUserStatusChange);
    };
  }, [socket, currentUserId]);

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);

    if (!socket || !activeChatId) return;

    socket.emit('typing', {
      room: activeChatId,
      username: currentUsername,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { room: activeChatId });
    }, 2000);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('Attachments must be 10 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        alert('Could not read this file.');
        return;
      }
      setSelectedAttachment({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data: reader.result,
      });
    };
    reader.onerror = () => alert('Could not read this file.');
    reader.readAsDataURL(file);
  };

  const handleBgImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 800;
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

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setChatBgImage(compressedDataUrl);
        setShowChatSettings(false);

        try {
          sessionStorage.setItem('chat_wallpaper', compressedDataUrl);
          localStorage.setItem('chat_wallpaper', compressedDataUrl);
        } catch (err) {
          console.error('Storage quota exceeded:', err);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => setAudioBlobUrl(reader.result);
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !selectedAttachment && !audioBlobUrl) || !selectedChat) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket?.emit('stop_typing', { room: activeChatId });

    try {
      const { data } = await API.post('/messages', {
        content: newMessage,
        image: "",
        audio: audioBlobUrl || "",
        attachment: selectedAttachment || undefined,
        conversationId: activeChatId,
      });

      setMessages((prev) => {
        const updated = [...prev, data];
        safeSetSessionStorage(`messages_${activeChatId}`, JSON.stringify(updated));
        return updated;
      });

      setNewMessage('');
      setSelectedAttachment(null);
      setAudioBlobUrl(null);

      if (socket) socket.emit('send_message', data);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await API.delete(`/messages/${messageId}`);
      setMessages((prev) => {
        const updated = prev.filter((msg) => msg._id !== messageId);
        safeSetSessionStorage(`messages_${activeChatId}`, JSON.stringify(updated));
        return updated;
      });
      socket?.emit('delete_message', { messageId, conversationId: activeChatId });
      setActiveMenuId(null);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleSaveEdit = async (messageId) => {
    if (!editContent.trim()) return;
    try {
      const { data } = await API.put(`/messages/${messageId}`, { content: editContent });
      
      setMessages((prev) => {
        const updated = prev.map((msg) => {
          if (msg._id === messageId) {
            return {
              ...data,
              isRead: msg.isRead,
              status: msg.status,
              readBy: msg.readBy
            };
          }
          return msg;
        });
        safeSetSessionStorage(`messages_${activeChatId}`, JSON.stringify(updated));
        return updated;
      });

      socket?.emit('edit_message', data);
      setEditingMessageId(null);
      setEditContent('');
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const getChatHeaderName = () => {
    if (!selectedChat) return '';
    if (selectedChat.isGroup) return selectedChat.chatName || 'Group Chat';
    const partner = selectedChat.members?.find((m) => extractId(m) !== currentUserId);
    if (partner && typeof partner === 'object') {
      return partner.username || partner.name || partner.email || 'Chat Partner';
    }
    return selectedChat.chatName || 'Chat Partner';
  };

  const getPartnerAvatar = () => {
    if (!selectedChat || selectedChat.isGroup) return '';
    const partner = selectedChat.members?.find((m) => extractId(m) !== currentUserId);
    if (partner && typeof partner === 'object' && partner.avatar) return partner.avatar;
    if (selectedChat.avatar) return selectedChat.avatar;
    return '';
  };

  const getChatPartner = () => {
    if (!selectedChat || selectedChat.isGroup) return null;
    const partner = selectedChat.members?.find((m) => extractId(m) !== currentUserId);
    return partner && typeof partner === 'object' ? partner : null;
  };

  const isPartnerOnline = () => {
    const partner = getChatPartner();
    if (!partner) return false;
    const partnerId = extractId(partner);
    return (
      onlineUsers.map(String).includes(String(partnerId)) ||
      presenceByUserId[partnerId]?.isOnline === true
    );
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'last seen recently';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'last seen recently';

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // midnight (0) becomes 12
    const time = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `last seen today at ${time}`;
    if (isYesterday) return `last seen yesterday at ${time}`;

    const dateOptions = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== today.getFullYear()) dateOptions.year = 'numeric';
    return `last seen ${date.toLocaleDateString([], dateOptions)} at ${time}`;
  };

  const getPartnerLastSeen = () => {
    const partnerId = extractId(getChatPartner());
    return presenceByUserId[partnerId]?.lastSeen || getChatPartner()?.lastSeen;
  };

  // Helper function to check if all members read the message (Option A)
  const areAllMembersRead = (msg, chat, currentUserId) => {
    if (!msg || !chat) return false;

    // For 1-on-1 chats: true if read by the recipient
    if (!chat.isGroup) {
      return msg.readBy && msg.readBy.some(id => extractId(id) !== currentUserId);
    }

    // For Group chats: true if every member (other than sender) has read it
    const groupMembers = chat.members || [];
    const senderId = extractId(msg.sender);
    
    // Everyone except the sender
    const requiredReaders = groupMembers.filter(m => extractId(m) !== senderId);
    if (requiredReaders.length === 0) return true;

    // Check if every required reader's ID is in msg.readBy
    const readBySet = new Set((msg.readBy || []).map(id => extractId(id)));
    return requiredReaders.every(member => readBySet.has(extractId(member)));
  };

  // Group-aware read receipts (Option A: WhatsApp Style)
  const renderTicks = (msg, isMine) => {
    if (!isMine) return null;

    if (areAllMembersRead(msg, selectedChat, currentUserId)) {
      return <span className="message-ticks read">✓✓</span>; // Blue Double Ticks when all members read
    }

    const hasBeenReadBySome = msg.readBy && msg.readBy.some(id => extractId(id) !== currentUserId);
    if (hasBeenReadBySome || msg.isRead || msg.status === 'read') {
      return <span className="message-ticks">✓✓</span>; // Grey Double Ticks if partially read
    }

    return <span className="message-ticks">✓</span>; // Single Grey Tick
  };

  if (!selectedChat) {
    return (
      <div className="chatbox-container no-chat-selected">
        <div className="welcome-box">
          <h2>WebChat Messenger</h2>
          <p>Select a conversation from the sidebar or search for a friend to start chatting securely in real-time.</p>
        </div>
      </div>
    );
  }

  const partnerAvatar = getPartnerAvatar();

  return (
    <div className={`chatbox-container theme-${chatTheme}`} onClick={() => { setActiveMenuId(null); setShowChatSettings(false); }}>
      <input
        type="file"
        ref={bgInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleBgImageSelect}
      />
       
      {/* Floating Toast Notification Banner */}
      {floatingMessage && (
        <div 
          className={`floating-message-notification theme-${chatTheme}`}
          onClick={() => {
            if (setSelectedChat && floatingMessage.message.conversationId) {
              setSelectedChat(floatingMessage.message.conversationId);
            }
            setFloatingMessage(null);
          }}
        >
          <div className="floating-notification-content">
            <div className="floating-notification-title">New Background Message</div>
            <div className="floating-notification-message">
              {floatingMessage.message.content || 'Attachment received'}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFloatingMessage(null);
            }}
            className="floating-notification-close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="chat-header">
        <button 
          className="back-btn" 
          onClick={() => {
            sessionStorage.removeItem('activeChat');
            localStorage.removeItem('activeChat');
            setSelectedChat(null);
          }}
        >
          ←
        </button>

        <div 
          className="chat-header-contact"
          onClick={() => {
            if (selectedChat?.isGroup) {
              setIsGroupInfoOpen(true);
            }else if(onOpenProfile) {
              onOpenProfile();
            }
          }}
          style={{ cursor: 'pointer'}}
        >
          <div className="chat-header-avatar" style={{ overflow: 'hidden' }}>
            {selectedChat?.isGroup ? (
              selectedChat.avatar ? (
                <img src={selectedChat.avatar} alt="Group Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div 
                  className="group-header-avatar" 
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#00a884',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.2rem'
                  }}
                >
                  {selectedChat.chatName ? selectedChat.chatName.charAt(0).toUpperCase() : 'G'}
                </div>
              )
            ) : partnerAvatar ? (
              <img src={partnerAvatar} alt="Partner Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              getChatHeaderName().charAt(0).toUpperCase()
            )}
          </div>

          <div className="chat-header-info">
            <h3>{getChatHeaderName()}</h3>
            <div className="chat-status-indicator">
              {isTyping ? (
                <span className="typing-text">{typingUser ? `${typingUser} is typing...` : 'typing...'}</span>
              ) : selectedChat?.isGroup ? (
                <span className="group-subtitle">
                  {selectedChat.members
                    ?.map((m) => (typeof m === 'object' ? m.username || m.email : 'User'))
                    .filter(Boolean)
                    .join(', ') || 'Tap for group info'}
                </span>
              ) : (
                <>
                  {isPartnerOnline() ? (
                    <>
                      <span className="status-dot online" />
                      <span className="status-label online">Online</span>
                    </>
                  ) : (
                    <span className="status-label offline last-seen-label">
                      {formatLastSeen(getPartnerLastSeen())}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            className="chat-settings-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setShowChatSettings((prev) => !prev);
            }}
            title="Chat Settings & Theme"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c-.5.38-1.03.7-1.62.94l-.36 2.54c-.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>

          {showChatSettings && (
            <div className="chat-settings-dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="chat-settings-section-title">Theme</div>
              <button 
                onClick={() => { setChatTheme('light'); setShowChatSettings(false); }}
                className={`chat-settings-option ${chatTheme === 'light' ? 'selected' : ''}`}
              >
                ☀️ Light Theme
              </button>
              <button 
                onClick={() => { setChatTheme('dark'); setShowChatSettings(false); }}
                className={`chat-settings-option ${chatTheme === 'dark' ? 'selected' : ''}`}
              >
                🌙 Dark Theme
              </button>
              
              <div className="chat-settings-divider" />
              
              <div className="chat-settings-section-title">Wallpaper</div>
              <button 
                onClick={() => bgInputRef.current?.click()}
                className="chat-settings-option"
              >
                🖼️ Change Background Image
              </button>
              {chatBgImage && (
                <button 
                  onClick={() => { setChatBgImage(''); setShowChatSettings(false); }}
                  className="chat-settings-option danger"
                >
                  ✕ Remove Wallpaper
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages Body */}
      <div 
        className={`messages-body ${chatBgImage ? 'has-wallpaper' : ''}`} 
        style={chatBgImage ? {
          backgroundImage: `url(${chatBgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        } : {}}
      >
        {loading && messages.length === 0 ? (
          <div className="loading-state">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="empty-messages">
            <p>No messages in this conversation yet. Say hello! 👋</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMine = extractId(msg.sender) === currentUserId;
            const msgTimestamp = msg.createdAt || msg.updatedAt || Date.now();
            const prevMsgTimestamp = index > 0 ? (messages[index - 1].createdAt || messages[index - 1].updatedAt || Date.now()) : null;
            const showDateDivider = isNewDay(msgTimestamp, prevMsgTimestamp);
            const isEditing = editingMessageId === msg._id;

            return (
              <div key={msg._id || index}>
                {showDateDivider && (
                  <div className="message-date-divider">
                    <span>{formatDateDivider(msgTimestamp)}</span>
                  </div>
                )}

                <div className={`message-row ${isMine ? 'mine' : 'other'}`}>
                  <div className={`message-bubble ${isMine ? 'mine' : 'other'}`}>
                    
                    {!isMine && selectedChat?.isGroup && (
                      <span className="group-sender-name">
                        {typeof msg.sender === 'object' ? msg.sender.username || msg.sender.email : 'Member'}
                      </span>
                    )}

                    {isMine && !isEditing && (
                      <div className="message-options-wrapper">
                        <button
                          className="message-options-trigger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === msg._id ? null : msg._id);
                          }}
                        >
                          ⋮
                        </button>
                        {activeMenuId === msg._id && (
                          <div className="message-dropdown-menu">
                            <button onClick={() => { setEditingMessageId(msg._id); setEditContent(msg.content); setActiveMenuId(null); }}>
                              Edit
                            </button>
                            <button onClick={() => handleDeleteMessage(msg._id)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.image && (
                      <div style={{ position: 'relative', marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', maxWidth: '240px' }}>
                        <a href={msg.image} target="_blank" rel="noopener noreferrer">
                          <img src={msg.image} alt="Attachment" style={{ width: '100%', display: 'block', borderRadius: '8px' }} />
                        </a>
                      </div>
                    )}

                    {msg.attachment && (
                      <div className="message-attachment">
                        {msg.attachment.mimeType?.startsWith('image/') ? (
                          <a href={msg.attachment.data} target="_blank" rel="noopener noreferrer">
                            <img
                              className="message-attachment-image"
                              src={msg.attachment.data}
                              alt={msg.attachment.name}
                            />
                          </a>
                        ) : msg.attachment.mimeType?.startsWith('video/') ? (
                          <video
                            className="message-attachment-video"
                            controls
                            preload="metadata"
                            src={msg.attachment.data}
                          />
                        ) : msg.attachment.mimeType?.startsWith('audio/') ? (
                          <audio controls src={msg.attachment.data} />
                        ) : (
                          <a
                            className="message-attachment-download"
                            href={msg.attachment.data}
                            download={msg.attachment.name}
                          >
                            <span aria-hidden="true">📎</span>
                            <span className="message-attachment-details">
                              <strong>{msg.attachment.name}</strong>
                              <small>{formatFileSize(msg.attachment.size)}</small>
                            </span>
                            <span aria-hidden="true">↓</span>
                          </a>
                        )}
                      </div>
                    )}

                    {msg.audio && (
                      <div style={{ marginBottom: '6px', minWidth: '220px' }}>
                        <audio controls src={msg.audio} style={{ width: '100%', height: '36px' }} />
                      </div>
                    )}

                    {isEditing ? (
                      <div className="edit-message-box">
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button onClick={() => handleSaveEdit(msg._id)}>Save</button>
                          <button onClick={() => setEditingMessageId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      msg.content && <span className="message-text">{msg.content}</span>
                    )}

                    <div className="message-footer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', float: 'right', marginLeft: '8px' }}>
                      {msg.isEdited && <span className="edited-tag">(edited)</span>}
                      <span className="message-time">
                        {formatTimeOnly(msgTimestamp)}
                      </span>
                      {renderTicks(msg, isMine)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {isTyping && (
          <div className="message-row other">
            <div className="message-bubble other typing-bubble">
              <span className="typing-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {selectedAttachment && (
        <div className="attachment-preview image-preview">
          {selectedAttachment.mimeType.startsWith('image/') ? (
            <img className="preview-thumbnail" src={selectedAttachment.data} alt="" />
          ) : (
            <span className="attachment-file-icon" aria-hidden="true">📎</span>
          )}
          <span className="preview-label">
            <strong>{selectedAttachment.name}</strong>
            <small>{formatFileSize(selectedAttachment.size)}</small>
          </span>
          <button type="button" className="preview-close" aria-label="Remove attachment" onClick={() => setSelectedAttachment(null)}>✕</button>
        </div>
      )}

      {audioBlobUrl && !isRecording && (
        <div className="attachment-preview audio-preview">
          <audio controls src={audioBlobUrl} />
          <button type="button" className="voice-send-btn" onClick={handleSendMessage}>Send Voice</button>
          <button type="button" className="preview-close" onClick={() => setAudioBlobUrl(null)}>✕</button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="chat-input-form">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file"
          aria-label="Attach a file"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M21.5 12.89l-9.19 9.19a5.35 5.35 0 01-7.56-7.56l9.53-9.53a3.57 3.57 0 015.04 5.04l-9.53 9.53a1.78 1.78 0 01-2.52-2.52l8.48-8.48" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {isRecording ? (
          <div className="recording-controls">
            <span className="recording-status">● Recording ({recordingTime}s)</span>
            <button type="button" className="recording-stop-btn" onClick={stopRecording}>Stop</button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={startRecording}
              title="Record Voice Note"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.23 14.47 16 12 16s-4.52-1.77-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20h2v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            </button>

            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={handleInputChange}
              style={{ flex: 1 }}
            />
          </>
        )}

        <button type="submit">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
          </svg>
        </button>
      </form>

      {/* Group Info Drawer Panel */}
      <GroupInfoDrawer
        isOpen={isGroupInfoOpen}
        onClose={() => setIsGroupInfoOpen(false)}
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        currentUserId={currentUserId}
        chats={chats}
        setChats={setChats}
      />
      
    </div>

  );
}