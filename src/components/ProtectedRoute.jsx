import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();

  // If there is no logged-in user, redirect to the authentication page
  if (!currentUser) {
    return <Navigate to="/auth" replace />;
  }

  // Otherwise, render the protected component (e.g., ChatPage)
  return children;
}