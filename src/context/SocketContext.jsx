import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL } from '../config';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, currentUser }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notification, setNotification] = useState(null);
  const [updatedProfiles, setUpdatedProfiles] = useState({});

  const extractId = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    const resolved = obj.user || obj;
    return resolved._id || resolved.id || String(resolved);
  };

  const currentUserId = extractId(currentUser);

  useEffect(() => {
    if (!currentUser || !currentUserId) {
      if (socket) {
        socket.close();
        setSocket(null);
      }
      return;
    }

    const newSocket = io(SERVER_URL, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      if (currentUserId) {
        newSocket.emit('setup_user', currentUserId);
      }
    });

    newSocket.on('get_online_users', (users) => {
      setOnlineUsers(users);
    });

    // Listen for live profile updates from other users
    newSocket.on('user_profile_updated', (updatedData) => {
      setUpdatedProfiles((prev) => ({
        ...prev,
        [updatedData.userId]: updatedData,
      }));
    });

    // === LISTEN FOR NEW GROUP CREATION ===
    newSocket.on('group_created', (newGroupChat) => {
      window.dispatchEvent(new CustomEvent('new_group_added', { detail: newGroupChat }));
    });
    // =====================================

    return () => {
      newSocket.close();
    };
  }, [currentUser, currentUserId]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, notification, setNotification, currentUserId, updatedProfiles }}>
      {children}
    </SocketContext.Provider>
  );
};