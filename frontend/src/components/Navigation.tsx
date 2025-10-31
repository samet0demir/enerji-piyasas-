import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

export function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h1>⚡ EPİAŞ Analiz</h1>
      </div>
      <div className="nav-links">
        <Link
          to="/"
          className={`nav-link ${isActive('/') ? 'active' : ''}`}
        >
          📊 Genel Bakış
        </Link>
        <Link
          to="/production"
          className={`nav-link ${isActive('/production') ? 'active' : ''}`}
        >
          ⚡ Üretim Analizi
        </Link>
        <Link
          to="/consumption"
          className={`nav-link ${isActive('/consumption') ? 'active' : ''}`}
        >
          📈 Tüketim Analizi
        </Link>
      </div>
    </nav>
  );
}
