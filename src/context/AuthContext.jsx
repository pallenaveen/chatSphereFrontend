import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('chatUser') || localStorage.getItem('userInfo');
      return savedUser ? JSON.parse(savedUser) : null;
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
    // FIX: Save the token explicitly so Axios requests can authenticate with the backend
    if (userData && userData.token) {
      localStorage.setItem('token', userData.token);
    }
    localStorage.setItem('chatUser', JSON.stringify(userData));
    localStorage.setItem('userInfo', JSON.stringify(userData));
    setCurrentUser(userData);
  };

  const logoutUser = () => {
    localStorage.removeItem('chatUser');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('activeChat');
    localStorage.removeItem('token'); // Clear the token on logout
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, loginUser, logoutUser, logout: logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};