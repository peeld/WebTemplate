import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AccountSection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="card">
        <header className="card-header">
          <p className="card-header-title">Account</p>
        </header>
        <div className="card-content">
          <p><Link to="/login">Log in</Link> to view your account.</p>
        </div>
      </div>
    );
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="card">
      <header className="card-header">
        <p className="card-header-title">Account</p>
      </header>
      <div className="card-content">
        <p>
          <span className="has-text-grey">Signed in as </span>
          <strong>{user.username}</strong>
        </p>
      </div>
      <footer className="card-footer">
        <Link to="/forgot-password" className="card-footer-item">Reset Password</Link>
        <button className="card-footer-item button is-ghost has-text-danger" onClick={handleLogout}>
          Log Out
        </button>
      </footer>
    </div>
  );
}
