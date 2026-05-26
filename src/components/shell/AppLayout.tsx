/**
 * F-21 — AppLayout.
 *
 * Wraps every route in ShellBar (top) + SideNav (left) + main content
 * pane. The 3 routes (/customer /admin /internal) consume this layout
 * via React-Router's <Outlet> so the chrome renders once and the route
 * body slots in.
 *
 * The HAPPY-6 invariant — each route's main panel renders no foreign
 * data-testid — is preserved because AppLayout only emits shell-bar /
 * side-nav / app-content testids; per-route panels keep their own.
 */
import { Outlet } from 'react-router-dom';
import { ShellBar } from './ShellBar';
import { SideNav } from './SideNav';

export function AppLayout() {
  return (
    <div data-testid="app-layout" style={layoutStyle}>
      <ShellBar />
      <div style={bodyStyle}>
        <SideNav />
        <main data-testid="app-content" style={contentStyle}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const layoutStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
  lineHeight: 'var(--body-line-height)',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  minHeight: 'calc(100vh - var(--shell-bar-h))',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '0',
  overflow: 'auto',
};
