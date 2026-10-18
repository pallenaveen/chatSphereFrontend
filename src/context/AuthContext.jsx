import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('chatUser') || localStorage.getItem('userInfo');
      if (!savedUser) return null;
      const parsed = JSON.parse(savedUser);
      
      // Normalize: if user data is nested under a 'user' property, extract it or flatten it
      // so components can consistently access properties like currentUser.avatar or currentUser.username
      return parsed.user ? { ...parsed.user, token: parsed.token || localStorage.getItem('token') } : parsed;
    } catch (error) {
      console.error('Error parsing user from localStorage:', error);
      return null;
    }
  });

  // Automatically sync currentUser changes to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('chatUser', JSON.stringify(currentUser));
      localStorage.setItem('userInfo', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('chatUser');
      localStorage.removeItem('userInfo');
    }
  }, [currentUser]);

  const loginUser = (userData) => {
    if (userData && userData.token) {
      localStorage.setItem('token', userData.token);
    }
    
    // Normalize user data on login as well
    const normalizedUser = userData?.user 
      ? { ...userData.user, token: userData.token } 
      : userData;

    localStorage.setItem('chatUser', JSON.stringify(normalizedUser));
    localStorage.setItem('userInfo', JSON.stringify(normalizedUser));
    setCurrentUser(normalizedUser);
  };

  const logoutUser = () => {
    const userId = currentUser?._id || currentUser?.id;
    if (userId) {
      localStorage.removeItem(`activeChat_${userId}`);
      localStorage.removeItem(`cached_chats_${userId}`);
    }

    for (const storage of [localStorage, sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith(`messages_${userId}_`)) {
          storage.removeItem(key);
        }
      }
    }

    localStorage.removeItem('chatUser');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('activeChat');
    sessionStorage.removeItem(`activeChat_${userId}`);
    localStorage.removeItem('token');
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, loginUser, logoutUser, logout: logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};