import { useAuth } from '../context/AuthContext';
import '../styles/Navbar.css';

export default function Navbar() {
  const { currentUser, logoutUser } = useAuth();

  // Inspect the exact structure in DevTools Console
  console.log('Navbar currentUser:', currentUser);

  // Safely extract username across various backend response formats
  const displayName =
    currentUser?.username ||
    currentUser?.user?.username ||
    currentUser?.name ||
    currentUser?.user?.name ||
    'User';

  return (
    <nav className="navbar">
      <h2 className="navbar-brand">ChatSphere</h2>
      <div className="navbar-user-section">
        <span className="navbar-username">
          Welcome, <strong>{displayName}</strong>
        </span>
        <button onClick={logoutUser} className="logout-btn">
          Logout
        </button>
      </div>
    </nav>
  );
}