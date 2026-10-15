import { Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import { useAuth } from './context/AuthContext';

// Protected Route Guard
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  const token = localStorage.getItem('token');

  if (!currentUser && !token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chats"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}