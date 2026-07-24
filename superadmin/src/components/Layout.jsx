import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>1020 Bingo</h1>
        <nav>
          <NavLink to="/shops" className={({ isActive }) => (isActive ? 'active' : '')}>
            Shops
          </NavLink>
          <NavLink to="/overview" className={({ isActive }) => (isActive ? 'active' : '')}>
            Cross-shop Reports
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
            Profile
          </NavLink>
        </nav>
        <button className="logout" onClick={logout}>
          Log out{user ? ` (${user.name})` : ''}
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
