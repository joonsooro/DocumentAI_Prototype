/**
 * F-11 — Readiness panel.
 *
 * Renders the ReadinessDecision with its 5-key reason objects (field /
 * evidence / rule / confidence / nextAction). F-10's sanitiser has already
 * stripped 'system:' / 'prompt:' / '<|' before this component runs.
 */
import type { ReadinessDecision } from '@domain/types';

interface Props {
  readonly readiness: ReadinessDecision | null;
}

export function ReadinessPanel({ readiness }: Props) {
  if (!readiness) {
    return (
      <section data-testid="customer-readiness-panel" style={panelStyle}>
        <h2 style={headingStyle}>Readiness</h2>
        <p style={emptyStyle}>Readiness will appear here after the document is processed.</p>
      </section>
    );
  }
  return (
    <section data-testid="customer-readiness-panel" style={panelStyle}>
      <h2 style={headingStyle}>Readiness</h2>
      <div data-testid="customer-readiness-status" style={statusRowStyle}>
        <span style={statusBadgeStyle(readiness.status)}>{readiness.status}</span>
        <span style={decidedAtStyle}>decided {readiness.decidedAt}</span>
      </div>
      <ol data-testid="customer-readiness-reasons" style={reasonsListStyle}>
        {readiness.reasons.map((r, idx) => (
          <li key={`${r.field}-${idx}`} data-testid={`customer-readiness-reason-${idx}`} style={reasonRowStyle}>
            <div style={reasonFieldStyle}>
              <span style={fieldChipStyle}>{r.field}</span>
              <span style={confidenceStyle}>confidence {(r.confidence * 100).toFixed(0)}%</span>
            </div>
            <dl style={kvStyle}>
              <dt style={dtStyle}>Evidence</dt>
              <dd style={ddStyle} data-testid={`customer-readiness-reason-${idx}-evidence`}>{r.evidence}</dd>
              <dt style={dtStyle}>Rule</dt>
              <dd style={ddStyle} data-testid={`customer-readiness-reason-${idx}-rule`}>{r.rule}</dd>
              <dt style={dtStyle}>Next action</dt>
              <dd style={ddStyle} data-testid={`customer-readiness-reason-${idx}-nextaction`}>{r.nextAction}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function statusBadgeStyle(status: ReadinessDecision['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600,
    letterSpacing: '0.02em', color: '#fff',
  };
  const palette: Record<ReadinessDecision['status'], string> = {
    Ready: '#107e3e',
    'Needs review': '#e9730c',
    Blocked: '#b00',
    'Needs downstream validation': '#0a6ed1',
  };
  return { ...base, background: palette[status] ?? '#5a6168' };
}

const panelStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
  padding: '20px 24px', marginBottom: 16,
};
const headingStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 12px', color: '#32363a',
};
const emptyStyle: React.CSSProperties = { color: '#6a6d70', margin: 0 };
const statusRowStyle: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14,
};
const decidedAtStyle: React.CSSProperties = {
  fontSize: 12, color: '#6a6d70', fontFamily: 'ui-monospace, monospace',
};
const reasonsListStyle: React.CSSProperties = {
  margin: 0, padding: 0, listStyle: 'none',
};
const reasonRowStyle: React.CSSProperties = {
  padding: '12px 0', borderBottom: '1px solid #eee',
};
const reasonFieldStyle: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6,
};
const fieldChipStyle: React.CSSProperties = {
  background: '#f0f1f2', color: '#32363a', padding: '2px 8px',
  borderRadius: 4, fontSize: 12, fontFamily: 'ui-monospace, monospace',
};
const confidenceStyle: React.CSSProperties = {
  fontSize: 12, color: '#6a6d70',
};
const kvStyle: React.CSSProperties = { margin: 0 };
const dtStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6a6d70', letterSpacing: '0.04em',
  textTransform: 'uppercase', marginTop: 6,
};
const ddStyle: React.CSSProperties = {
  margin: '2px 0 0', fontSize: 13, color: '#32363a',
};
