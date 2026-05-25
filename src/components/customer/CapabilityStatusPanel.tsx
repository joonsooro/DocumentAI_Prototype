/**
 * F-11 — Capability status panel.
 *
 * Renders only the customer-visible assessment rows. The CustomerVisibleCapabilityAssessment
 * type narrows status to 'Supported' | 'Supported with workaround' — by construction this
 * component CANNOT render the forbidden 'capability_gap' bucket (the N1 / HAPPY-4 invariant
 * is enforced at the type system, not at render time).
 */
import type { CustomerVisibleCapabilityAssessment } from './viewModel';

interface Props {
  readonly assessments: readonly CustomerVisibleCapabilityAssessment[];
}

export function CapabilityStatusPanel({ assessments }: Props) {
  if (assessments.length === 0) {
    return (
      <section data-testid="customer-capability-panel" style={panelStyle}>
        <h2 style={headingStyle}>Capability assessment</h2>
        <p style={emptyStyle}>Submit your intent to see the capability assessment here.</p>
      </section>
    );
  }
  return (
    <section data-testid="customer-capability-panel" style={panelStyle}>
      <h2 style={headingStyle}>Capability assessment</h2>
      <ul data-testid="customer-capability-list" style={listStyle}>
        {assessments.map((a) => (
          <li key={a.id} data-testid={`customer-capability-row-${a.id}`} style={rowStyle}>
            <div style={statusRowStyle}>
              <span style={badgeStyle(a.status)} data-testid={`customer-capability-status-${a.id}`}>
                {a.status}
              </span>
              <span style={fragmentStyle}>{a.intentFragment}</span>
            </div>
            {a.workaroundDescription ? (
              <p data-testid={`customer-capability-workaround-${a.id}`} style={workaroundStyle}>
                Workaround: {a.workaroundDescription}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function badgeStyle(status: CustomerVisibleCapabilityAssessment['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: '#fff',
    minWidth: 110,
    textAlign: 'center',
  };
  if (status === 'Supported') return { ...base, background: '#107e3e' };
  return { ...base, background: '#e9730c' };
}

const panelStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
  padding: '20px 24px', marginBottom: 16,
};
const headingStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 12px', color: '#32363a',
};
const emptyStyle: React.CSSProperties = { color: '#6a6d70', margin: 0 };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };
const rowStyle: React.CSSProperties = { padding: '10px 0', borderBottom: '1px solid #eee' };
const statusRowStyle: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'baseline' };
const fragmentStyle: React.CSSProperties = { fontSize: 14, color: '#32363a' };
const workaroundStyle: React.CSSProperties = {
  fontSize: 13, color: '#5a6168', margin: '6px 0 0 124px',
};
