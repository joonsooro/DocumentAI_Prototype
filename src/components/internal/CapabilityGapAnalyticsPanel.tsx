/**
 * F-13 — Capability gap analytics panel.
 *
 * Ranks CapabilityGap[] by frequency × customerImpact (high=3, medium=2,
 * low=1). v1 ships the table; the ranking score is shown explicitly so
 * the admin can see the ordering rationale.
 */
import type { CapabilityGap } from '@domain/types';

interface Props {
  readonly gaps: readonly CapabilityGap[];
}

function impactRank(impact: 'low' | 'medium' | 'high'): number {
  return impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
}

export function CapabilityGapAnalyticsPanel({ gaps }: Props) {
  if (gaps.length === 0) {
    return (
      <section data-testid="internal-capability-gap-panel" style={panelStyle}>
        <h2 style={headingStyle}>Capability gap analytics</h2>
        <p style={emptyStyle}>No gap rollups available.</p>
      </section>
    );
  }
  const ranked = [...gaps].sort(
    (a, b) =>
      b.frequency * impactRank(b.customerImpact) -
      a.frequency * impactRank(a.customerImpact),
  );
  return (
    <section data-testid="internal-capability-gap-panel" style={panelStyle}>
      <h2 style={headingStyle}>Capability gap analytics</h2>
      <table data-testid="internal-capability-gap-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Freq</th>
            <th style={thStyle}>Impact</th>
            <th style={thStyle}>Suppliers</th>
            <th style={thStyle}>Doc types</th>
            <th style={thStyle}>Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((g) => (
            <tr key={g.id} data-testid={`internal-capability-gap-row-${g.id}`}>
              <td style={tdStyle}>{g.description}</td>
              <td style={tdStyle}>{g.frequency}</td>
              <td style={tdStyle}>{g.customerImpact}</td>
              <td style={tdStyle}>{g.suppliers.length}</td>
              <td style={tdStyle}>{g.documentTypes.join(', ')}</td>
              <td style={tdStyle}>{g.frequency * impactRank(g.customerImpact)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
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
};
