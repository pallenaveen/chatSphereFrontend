import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Auth.css';

export default function Auth() {
  const [isLoginTab, setIsLoginTab] = useState(true);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleTabSwitch = (isLogin) => {
    setIsLoginTab(isLogin);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const endpoint = isLoginTab ? '/auth/login' : '/auth/register';
    const payload = isLoginTab ? { email, password } : { username, email, password };

    try {
      const { data } = await API.post(endpoint, payload);

      // Store JWT token in sessionStorage to match AuthContext isolation
      if (data.token) {
        sessionStorage.setItem('token', data.token);
      }

      // Extract user object
      let userToSave = data.user || data;

      // Fallback: If logging in doesn't return username, infer it from email or store the email prefix
      if (!userToSave.username && userToSave.email) {
        userToSave.username = userToSave.email.split('@')[0];
      }

      if (data.token) {
        userToSave.token = data.token;
      }

      loginUser(userToSave);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed. Try again.');
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card-wrapper">
        {/* LEFT PANEL: Form & Controls */}
        <div className="auth-left-panel">
          <div className="brand-header">
            <span className="chat-icon">💬</span>
            <h2>ChatSphere</h2>
          </div>

          <div className="auth-toggle-tabs">
            <button
              className={`toggle-tab ${isLoginTab ? 'active' : ''}`}
              onClick={() => handleTabSwitch(true)}
            >
              Sign In
            </button>
            <button
              className={`toggle-tab ${!isLoginTab ? 'active' : ''}`}
              onClick={() => handleTabSwitch(false)}
            >
              Create Account
            </button>
          </div>

          <div className="auth-welcome">
            <h3>{isLoginTab ? 'Welcome Back!' : 'Get Started'}</h3>
            <p>
              {isLoginTab
                ? 'Please enter your details to connect.'
                : 'Sign up to start chatting with your friends.'}
            </p>
          </div>

          {error && <div className="error-badge">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form-body">
            {!isLoginTab && (
              <div className="input-group">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="e.g. john_doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="auth-primary-btn">
              {isLoginTab ? 'Login to Chat' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* RIGHT PANEL: Chat Hero Graphic */}
        <div className="auth-right-panel">
          <div className="hero-content">
            <div className="floating-chat-bubble bubble-1">
              👋 Hey! Welcome to ChatSphere
            </div>
            <div className="floating-chat-bubble bubble-2">
              Ready to start messaging? 🚀
            </div>
            <div className="hero-text-overlay">
              <h3>Real-time Conversations</h3>
              <p>Connect instantly with anyone, anywhere.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}