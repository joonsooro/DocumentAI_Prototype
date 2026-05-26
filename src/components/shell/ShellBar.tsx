/**
 * F-21 — ShellBar.
 *
 * Layout-only chrome. Renders the top sticky bar (48px navy) with three
 * route-nav buttons (Customer / Admin / Internal). Backgrounds read from
 * F-26 tokens (--shell-bg) — no hard-coded color literal here.
 *
 * No per-route data-testid lives on this component, so the HAPPY-6
 * three-workspace separation invariant is preserved when ShellBar wraps
 * every route via AppLayout.
 */
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/customer', label: 'Customer' },
  { to: '/admin', label: 'Admin' },
  { to: '/internal', label: 'Internal' },
] as const;

export function ShellBar() {
  return (
    <header data-testid="shell-bar" style={shellBarStyle}>
      <div style={brandStyle}>
        <span data-testid="shell-bar-brand-mark" style={brandMarkStyle} />
        <span style={brandTextStyle}>Document AI</span>
        <span style={brandTenantStyle}>Tenant: demo</span>
      </div>
      <nav data-testid="shell-bar-nav" style={navStyle}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`shell-bar-nav-${item.label.toLowerCase()}`}
            style={({ isActive }) => ({
              ...navLinkStyle,
              ...(isActive ? navLinkActiveStyle : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

const shellBarStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 'var(--shell-bar-h)',
  padding: '0 var(--app-padding-x)',
  background: 'var(--shell-bg)',
  color: '#FFFFFF',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const brandMarkStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '14px',
  height: '14px',
  borderRadius: '3px',
  background: 'var(--brand)',
};

const brandTextStyle: React.CSSProperties = {
  fontWeight: 600,
  letterSpacing: '0.02em',
};

const brandTenantStyle: React.CSSProperties = {
  marginLeft: '16px',
  paddingLeft: '16px',
  borderLeft: '1px solid rgba(255,255,255,0.18)',
  color: '#A8B1BD',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
};

const navLinkStyle: React.CSSProperties = {
  color: '#C7CED8',
  textDecoration: 'none',
  fontSize: 'var(--body-size)',
  letterSpacing: '0.02em',
  padding: '6px 10px',
  borderRadius: 'var(--radius-button)',
};

const navLinkActiveStyle: React.CSSProperties = {
  color: '#FFFFFF',
  background: 'rgba(10,95,255,0.18)',
};
