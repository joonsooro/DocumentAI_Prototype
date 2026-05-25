/**
 * App shell — top-level router. Each of the three workspaces is its own
 * route; the navigation strip is the only place the workspaces meet.
 *
 * F-11 / F-12 / F-13 own the three children. The default '/' route
 * redirects to /customer because the customer workspace is the demo
 * entry point.
 */
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import CustomerRoute from '@routes/customer';
import AdminRoute from '@routes/admin';
import InternalRoute from '@routes/internal';

export default function App() {
  return (
    <div data-testid="app-shell" style={shellStyle}>
      <nav data-testid="app-nav" style={navStyle}>
        <Link to="/customer" style={linkStyle}>
          Customer
        </Link>
        <Link to="/admin" style={linkStyle}>
          Admin
        </Link>
        <Link to="/internal" style={linkStyle}>
          Internal
        </Link>
      </nav>
      <main data-testid="app-main" style={mainStyle}>
        <Routes>
          <Route path="/" element={<Navigate to="/customer" replace />} />
          <Route path="/customer" element={<CustomerRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/internal" element={<InternalRoute />} />
        </Routes>
      </main>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  background: '#f5f6f7',
  minHeight: '100vh',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '24px',
  padding: '12px 24px',
  background: '#354a5f',
  color: '#fff',
};

const linkStyle: React.CSSProperties = {
  color: '#fff',
  textDecoration: 'none',
  fontSize: '14px',
  letterSpacing: '0.04em',
};

const mainStyle: React.CSSProperties = {
  padding: '24px',
};
