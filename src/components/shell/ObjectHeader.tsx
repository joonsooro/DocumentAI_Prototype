/**
 * F-21 — ObjectHeader.
 *
 * Generic SAP-Fiori-style object-page header. The 3 routes pass their
 * own props ({ crumbs, title, sub, status, actions, tabs, activeTab,
 * onTab }) — the component just renders structure. The tabs strip
 * exposes a tablist role for screen readers; activeTab is the controlled
 * tab id and onTab is the controlled-tab setter.
 *
 * No per-route data-testid lives on this component; the per-route
 * panels still carry their own (customer-pdf-viewer / admin-kpi-card /
 * internal-flywheel-node, etc.).
 */
import { CSSProperties, MouseEvent } from 'react';

export type ObjectHeaderTab = {
  id: string;
  label: string;
  disabled?: boolean;
  disabledTooltip?: string;
};

export type ObjectHeaderAction = {
  id: string;
  label: string;
  emphasis?: 'primary' | 'default';
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

export type ObjectHeaderProps = {
  crumbs: readonly string[];
  title: string;
  sub?: string;
  status?: string;
  actions?: readonly ObjectHeaderAction[];
  tabs: readonly ObjectHeaderTab[];
  activeTab: string;
  onTab?: (tabId: string) => void;
};

export function ObjectHeader(props: ObjectHeaderProps) {
  const { crumbs, title, sub, status, actions, tabs, activeTab, onTab } = props;

  return (
    <section data-testid="object-header" style={objectHeaderStyle}>
      <nav aria-label="breadcrumb" data-testid="object-header-breadcrumb" style={breadcrumbStyle}>
        {crumbs.map((crumb, i) => (
          <span key={`${crumb}-${i}`} style={breadcrumbCrumbStyle}>
            {crumb}
            {i < crumbs.length - 1 && <span style={breadcrumbSepStyle}> · </span>}
          </span>
        ))}
      </nav>
      <div style={titleRowStyle}>
        <h1 data-testid="object-header-title" style={titleStyle}>
          {title}
        </h1>
        {status && (
          <span data-testid="object-header-status" style={statusPillStyle}>
            {status}
          </span>
        )}
        {actions && actions.length > 0 && (
          <div data-testid="object-header-actions" style={actionsRowStyle}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                data-testid={`object-header-action-${action.id}`}
                onClick={action.onClick}
                style={action.emphasis === 'primary' ? actionPrimaryStyle : actionDefaultStyle}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {sub && (
        <p data-testid="object-header-sub" style={subStyle}>
          {sub}
        </p>
      )}
      <div role="tablist" data-testid="object-header-tablist" style={tablistStyle}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-disabled={tab.disabled || undefined}
              disabled={tab.disabled}
              title={tab.disabled ? tab.disabledTooltip : undefined}
              data-testid={`object-header-tab-${tab.id}`}
              onClick={() => !tab.disabled && onTab?.(tab.id)}
              style={{
                ...tabStyle,
                ...(isActive ? tabActiveStyle : {}),
                ...(tab.disabled ? tabDisabledStyle : {}),
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const objectHeaderStyle: CSSProperties = {
  background: 'var(--panel)',
  borderBottom: '1px solid var(--line)',
  padding: '14px var(--app-padding-x) 0',
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
};

const breadcrumbStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--ink-3)',
  marginBottom: '6px',
};

const breadcrumbCrumbStyle: CSSProperties = {
  color: 'var(--ink-3)',
};

const breadcrumbSepStyle: CSSProperties = {
  color: 'var(--ink-4)',
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--object-title-size)',
  fontWeight: 600,
  letterSpacing: '-0.012em',
  color: 'var(--ink-1)',
};

const statusPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--brand-50)',
  color: 'var(--brand-700)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const actionsRowStyle: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  gap: '8px',
};

const actionDefaultStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--line)',
  background: 'var(--panel)',
  color: 'var(--ink-1)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
};

const actionPrimaryStyle: CSSProperties = {
  ...actionDefaultStyle,
  background: 'var(--brand)',
  borderColor: 'var(--brand)',
  color: '#FFFFFF',
};

const subStyle: CSSProperties = {
  margin: '6px 0 12px',
  color: 'var(--ink-3)',
  fontSize: 'var(--body-size)',
};

const tablistStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginTop: '12px',
  borderTop: '1px solid var(--line-2)',
  paddingTop: '4px',
};

const tabStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--ink-2)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
  cursor: 'pointer',
};

const tabActiveStyle: CSSProperties = {
  color: 'var(--brand-700)',
  borderBottom: '2px solid var(--brand)',
  fontWeight: 600,
};

const tabDisabledStyle: CSSProperties = {
  color: 'var(--ink-4)',
  cursor: 'not-allowed',
};
