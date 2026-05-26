/**
 * F-21 — SideNav.
 *
 * Layout-only chrome. Collapsed 56px → expanded 236px via the F-26
 * tokens --sidenav-w-collapsed / --sidenav-w-expanded. Background reads
 * from --sidenav-bg. The expand affordance is hover-only per the design
 * handoff — there's no data-testid for a hover toggle because that's a
 * pure visual presentation concern.
 *
 * SideNav carries `aria-label='side-nav'` and exposes a small icon
 * column. No per-route data-testid lives here.
 */
import { useState } from 'react';

const SIDENAV_ITEMS = [
  { id: 'workspaces', label: 'Workspaces', glyph: '◧' },
  { id: 'recommendations', label: 'Recommendations', glyph: '◆' },
  { id: 'evidence', label: 'Roadmap evidence', glyph: '◇' },
  { id: 'log', label: 'Quality log', glyph: '≡' },
] as const;

export function SideNav() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      data-testid="side-nav"
      aria-label="side-nav"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        ...sideNavStyle,
        width: expanded ? 'var(--sidenav-w-expanded)' : 'var(--sidenav-w-collapsed)',
      }}
    >
      <ul data-testid="side-nav-list" style={sideNavListStyle}>
        {SIDENAV_ITEMS.map((item) => (
          <li
            key={item.id}
            data-testid={`side-nav-item-${item.id}`}
            style={sideNavItemStyle}
          >
            <span style={sideNavGlyphStyle}>{item.glyph}</span>
            {expanded && <span style={sideNavLabelStyle}>{item.label}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

const sideNavStyle: React.CSSProperties = {
  background: 'var(--sidenav-bg)',
  color: '#C7CED8',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
  transition: 'width var(--transition-sidenav) var(--transition-easing)',
  overflow: 'hidden',
  flexShrink: 0,
};

const sideNavListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: '12px 0',
};

const sideNavItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 18px',
  cursor: 'default',
};

const sideNavGlyphStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '20px',
  textAlign: 'center',
  color: '#8A95A4',
};

const sideNavLabelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  color: '#E1E4EA',
};
