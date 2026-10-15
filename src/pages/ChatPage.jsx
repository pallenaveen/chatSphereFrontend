import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ChatBox from '../components/ChatBox';
import CreateGroupModal from '../components/CreateGroupModal';
import UserProfileDrawer from '../components/UserProfileDrawer';
import CallModal from '../components/CallModal';
import API from '../api/axios';
import '../styles/ChatPage.css';

const ENDPOINT = 'http://localhost:5000';

export default function ChatPage() {
  const { currentUser } = useAuth();
  const [socket, setSocket] = useState(null);
  const [chats, setChats] = useState([]);
  
  const [selectedChat, setSelectedChat] = useState(() => {
    try {
      const saved = sessionStorage.getItem('activeChat') || localStorage.getItem('activeChat');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to load active chat from storage:', e);
      return null;
    }
  });

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notification, setNotification] = useState(null);

  // Active WebRTC Call State
  const [activeCall, setActiveCall] = useState(null);

  // Modal & Drawer Visibility States
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);

  // Close profile drawer automatically when switching conversations
  useEffect(() => {
    setIsUserProfileOpen(false);
  }, [selectedChat?._id]);

  const selectedChatRef = useRef(selectedChat);
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const extractId = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj._id || obj.id || String(obj);
  };

  const currentUserId = extractId(currentUser?.user || currentUser);

  // Safe storage sync preventing QuotaExceededError by omitting heavy base64 strings
  useEffect(() => {
    try {
      if (selectedChat) {
        const lightChat = {
          _id: selectedChat._id,
          isGroup: selectedChat.isGroup,
          chatName: selectedChat.chatName,
          members: selectedChat.members?.map(m => typeof m === 'string' ? m : (m._id || m.id))
        };
        const serialized = JSON.stringify(lightChat);
        sessionStorage.setItem('activeChat', serialized);
        localStorage.setItem('activeChat', serialized);
      } else {
        sessionStorage.removeItem('activeChat');
        localStorage.removeItem('activeChat');
      }
    } catch (e) {
      console.warn('Storage quota skipped for active chat payload');
    }
  }, [selectedChat]);

  // Handle Initiating Voice / Video Calls
  const handleStartCall = (targetUserId, callType = 'audio') => {
    if (!socket || !targetUserId) return;

    const callerName = currentUser?.user?.username || currentUser?.username || currentUser?.name || 'User';

    console.log(`📞 Initiating ${callType} call to user:`, targetUserId);

    setActiveCall({
      isCaller: true,
      targetUserId,
      callType,
      status: 'calling',
    });

    socket.emit('call_user', {
      userToCall: targetUserId,
      from: currentUserId,
      callType,
      name: callerName
    });
  };

  // Socket setup & event listeners
  useEffect(() => {
    if (!currentUserId) return;

    const newSocket = io(ENDPOINT);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected successfully with ID:', newSocket.id);
      newSocket.emit('setup_user', currentUserId);
    });

    newSocket.on('get_online_users', (users) => {
      setOnlineUsers(users);
    });

    const handleIncomingMessage = (newMessage) => {
      console.log('--> RECEIVED SOCKET MESSAGE:', newMessage);

      const senderId = extractId(newMessage.sender);
      const activeChatId = extractId(selectedChatRef.current?._id || selectedChatRef.current);
      const messageChatId = extractId(newMessage.conversationId?._id || newMessage.conversationId || newMessage.chat?._id || newMessage.chat);

      if (activeChatId !== messageChatId && senderId !== currentUserId) {
        const senderName = newMessage.sender?.username || newMessage.sender?.name || 'New Message';
        const senderAvatar = newMessage.sender?.avatar || '';

        setNotification({
          id: newMessage._id,
          senderName,
          avatar: senderAvatar,
          content: newMessage.content || 'Attachment received',
          chatId: messageChatId
        });

        setUnreadCounts((prev) => ({
          ...prev,
          [messageChatId]: (prev[messageChatId] || 0) + 1,
        }));

        setTimeout(() => {
          setNotification(null);
        }, 4000);
      }
    };

    const handleGroupUpdated = (updatedChat) => {
      setChats((prev) =>
        prev.map((c) => (extractId(c._id) === extractId(updatedChat._id) ? updatedChat : c))
      );

      if (selectedChatRef.current && extractId(selectedChatRef.current._id || selectedChatRef.current) === extractId(updatedChat._id)) {
        setSelectedChat(updatedChat);
      }
    };

    const handleGroupCreated = (newGroupChat) => {
      setChats((prev) => {
        if (prev.some((c) => extractId(c._id) === extractId(newGroupChat._id))) return prev;
        return [newGroupChat, ...prev];
      });
    };

    // WebRTC Signaling Event Listeners
    const handleIncomingCall = (data) => {
      console.log('📞 Incoming call signal received:', data);
      setActiveCall({
        isCaller: false,
        from: data.from,
        name: data.name,
        callType: data.callType,
        signal: data.signal,
        status: 'incoming'
      });
    };

    const handleCallAccepted = (signal) => {
      console.log('✅ Call accepted signal received');
      setActiveCall((prev) => prev ? { ...prev, status: 'connected', signal } : null);
    };

    const handleCallEnded = () => {
      console.log('❌ Call ended signal received');
      setActiveCall(null);
    };

    newSocket.on('receive_message', handleIncomingMessage);
    newSocket.on('group_updated', handleGroupUpdated);
    newSocket.on('group_created', handleGroupCreated);
    newSocket.on('incoming_call', handleIncomingCall);
    newSocket.on('call_accepted', handleCallAccepted);
    newSocket.on('call_ended', handleCallEnded);

    return () => {
      newSocket.off('get_online_users');
      newSocket.off('receive_message', handleIncomingMessage);
      newSocket.off('group_updated', handleGroupUpdated);
      newSocket.off('group_created', handleGroupCreated);
      newSocket.off('incoming_call', handleIncomingCall);
      newSocket.off('call_accepted', handleCallAccepted);
      newSocket.off('call_ended', handleCallEnded);
      newSocket.disconnect();
    };
  }, [currentUserId]);

  // Fetch chats from backend
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const { data } = await API.get('/chats');
        console.log('🔍 DEBUG: Fetched chats from backend:', data);
        setChats(data);

        const initialUnread = {};
        data.forEach((chat) => {
          if (chat.unreadCount > 0) {
            initialUnread[chat._id] = chat.unreadCount;
          }
        });
        
        setUnreadCounts((prev) => ({ ...initialUnread, ...prev }));

        if (selectedChat) {
          const matchedChat = data.find(
            (c) => extractId(c) === extractId(selectedChat)
          );
          if (matchedChat) {
            setSelectedChat(matchedChat);
          }
        }
      } catch (err) {
        console.error('Failed to load chats:', err);
      }
    };

    fetchChats();
  }, []);

  return (
    <div className={`chat-page-container ${selectedChat ? 'chat-selected' : ''}`}>
      {notification && (
        <div 
          className="whatsapp-toast-notification"
          onClick={() => {
            const targetChat = chats.find(c => extractId(c._id) === notification.chatId);
            if (targetChat) {
              setSelectedChat(targetChat);
              setUnreadCounts(prev => ({ ...prev, [targetChat._id]: 0 }));
              API.put(`/chats/read/${targetChat._id}`).catch(err => console.error(err));
            }
            setNotification(null);
          }}
        >
          <div className="toast-avatar">
            {notification.avatar ? (
              <img src={notification.avatar} alt="Avatar" />
            ) : (
              notification.senderName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="toast-content">
            <h4>{notification.senderName}</h4>
            <p>{notification.content}</p>
          </div>
        </div>
      )}

      <Sidebar
        socket={socket}
        chats={chats}
        setChats={setChats}
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        onlineUsers={onlineUsers}
        unreadCounts={unreadCounts}
        setUnreadCounts={setUnreadCounts}
        onOpenCreateGroup={() => setIsGroupModalOpen(true)}
        onStartCall={handleStartCall}
      />

      <ChatBox
        socket={socket}
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        chats={chats}
        setChats={setChats}
        onlineUsers={onlineUsers}
        onOpenProfile={() => setIsUserProfileOpen(true)}
      />

      {/* Standalone 1-on-1 User Profile Drawer */}
      <UserProfileDrawer
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        selectedChat={selectedChat}
        currentUserId={currentUserId}
        onlineUsers={onlineUsers}
        onStartCall={handleStartCall}
      />

      {/* Group Creation Popup Modal */}
      <CreateGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        chats={chats}
        setChats={setChats}
        setSelectedChat={setSelectedChat}
        currentUserId={currentUserId}
      />
      {/* Active WebRTC Call Popup Modal */}
      {activeCall && (
        <CallModal
          activeCall={activeCall}
          socket={socket}
          currentUserId={currentUserId}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  );
}