import { Outlet, NavLink, Link } from "react-router-dom";
import "./Layout.css";

function Layout() {
  return (
    <div className="layout">
      <header className="header">
        <Link to="/" className="header-brand">
          <h1>BrickWise</h1>
        </Link>
        <nav className="header-nav">
          <NavLink to="/search" className="header-link" aria-label="Search">
            🔍
          </NavLink>
          <NavLink to="/login" className="header-link" aria-label="Account">
            👤
          </NavLink>
        </nav>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="footer">
        <Link to="/about" className="footer-legal">
          About &amp; Legal
        </Link>
      </footer>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavLink to="/" className="nav-item" end>
          <span className="nav-icon" aria-hidden="true">🏠</span>
          <span className="nav-label">Home</span>
        </NavLink>
        <NavLink to="/scan" className="nav-item">
          <span className="nav-icon" aria-hidden="true">📷</span>
          <span className="nav-label">Scan</span>
        </NavLink>
        <NavLink to="/inventory" className="nav-item">
          <span className="nav-icon" aria-hidden="true">🧱</span>
          <span className="nav-label">Inventory</span>
        </NavLink>
        <NavLink to="/sets" className="nav-item">
          <span className="nav-icon" aria-hidden="true">📦</span>
          <span className="nav-label">Sets</span>
        </NavLink>
        <NavLink to="/mocs" className="nav-item">
          <span className="nav-icon" aria-hidden="true">🎨</span>
          <span className="nav-label">MOCs</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default Layout;
