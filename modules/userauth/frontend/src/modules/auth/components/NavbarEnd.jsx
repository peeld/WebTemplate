import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function NavbarEnd() {
  const { user, logout } = useAuth()

  if (user) {
    return (
      <div className="navbar-item has-dropdown is-hoverable">
        <span className="navbar-link">{user.username}</span>
        <div className="navbar-dropdown is-right">
          <a className="navbar-item" onClick={logout}>
            Log out
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <NavLink to="/login" className={({ isActive }) => `navbar-item${isActive ? ' is-active' : ''}`}>
        Log in
      </NavLink>
      <div className="navbar-item">
        <NavLink to="/signup" className="button is-light is-small">
          Sign up
        </NavLink>
      </div>
    </>
  )
}
