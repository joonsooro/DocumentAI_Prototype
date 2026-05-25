/**
 * F-13 — Governance queue panel.
 *
 * Renders F-09 candidate decisions: each row shows the candidate key
 * (documentType + field), the frequency / distinct suppliers / aggregate
 * impact, and whether F-09 approved or held the candidate (with the
 * gating reason from the F-09 decision log).
 */
import type { InternalViewModel } from './viewModel';

interface Props {
  readonly queue: InternalViewModel['governanceQueue'];
}

export function GovernanceQueuePanel({ queue }: Props) {
  if (queue.length === 0) {
    return (
      <section data-testid="internal-governance-queue-panel" style={panelStyle}>
        <h2 style={headingStyle}>Governance queue</h2>
        <p style={emptyStyle}>No candidate signals in the queue.</p>
      </section>
    );
  }
  return (
    <section data-testid="internal-governance-queue-panel" style={panelStyle}>
      <h2 style={headingStyle}>Governance queue</h2>
      <table data-testid="internal-governance-queue-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Candidate</th>
            <th style={thStyle}>Fragment</th>
            <th style={thStyle}>Freq</th>
            <th style={thStyle}>Suppliers</th>
            <th style={thStyle}>Impact</th>
            <th style={thStyle}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((r) => (
            <tr key={r.candidateKey} data-testid={`internal-governance-row-${r.candidateKey}`}>
              <td style={tdStyle}>{r.candidateKey}</td>
              <td style={tdStyle}>{r.fragment ?? '—'}</td>
              <td style={tdStyle}>{r.frequency}</td>
              <td style={tdStyle}>{r.distinctSuppliers}</td>
              <td style={tdStyle}>{r.aggregateImpact ?? '—'}</td>
              <td style={tdStyle}>
                <span
                  data-testid={`internal-governance-verdict-${r.candidateKey}`}
                  style={badgeStyle(r.approved)}
                >
                  {r.approved ? 'approved' : 'held'}
                </span>
                <div style={reasonStyle}>{r.reason}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function badgeStyle(approved: boolean): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: '#fff',
    background: approved ? '#107e3e' : '#e9730c',
  };
}

const panelStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
  padding: '20px 24px', marginBottom: 16,
};
const headingStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 12px', color: '#32363a',
};
const emptyStyle: React.CSSProperties = { color: '#6a6d70', margin: 0 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ccc',
  fontWeight: 600, color: '#32363a',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid #eee', color: '#32363a',
  verticalAlign: 'top',
};
const reasonStyle: React.CSSProperties = {
  fontSize: 11, color: '#6a6d70', marginTop: 4, fontFamily: 'ui-monospace, monospace',
};
