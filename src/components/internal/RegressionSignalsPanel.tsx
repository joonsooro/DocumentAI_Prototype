/**
 * F-13 — Model regression signals panel.
 *
 * Renders RegressionSignal[] from F-17 (a prompt-version or model-version
 * boundary where the success rate dropped materially). Each row shows the
 * boundary (fromId -> toId), the before/after values, the delta, and the
 * detection timestamp.
 */
import type { RegressionSignal } from '@domain/types';

interface Props {
  readonly signals: readonly RegressionSignal[];
}

export function RegressionSignalsPanel({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <section data-testid="internal-regression-panel" style={panelStyle}>
        <h2 style={headingStyle}>Model regression signals</h2>
        <p style={emptyStyle}>No regressions detected.</p>
      </section>
    );
  }
  return (
    <section data-testid="internal-regression-panel" style={panelStyle}>
      <h2 style={headingStyle}>Model regression signals</h2>
      <table data-testid="internal-regression-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Boundary</th>
            <th style={thStyle}>Metric</th>
            <th style={thStyle}>Before</th>
            <th style={thStyle}>After</th>
            <th style={thStyle}>Delta</th>
            <th style={thStyle}>Detected</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} data-testid={`internal-regression-row-${s.id}`}>
              <td style={tdStyle}>
                <span style={kindChipStyle}>{s.boundary.kind.replace(/_/g, ' ')}</span>
                <div style={boundaryDetailStyle}>
                  {s.boundary.fromId} → {s.boundary.toId}
                </div>
              </td>
              <td style={tdStyle}>{s.metric.replace(/_/g, ' ')}</td>
              <td style={tdStyle}>{(s.beforeValue * 100).toFixed(1)}%</td>
              <td style={tdStyle}>{(s.afterValue * 100).toFixed(1)}%</td>
              <td style={deltaTdStyle}>{(s.delta * 100).toFixed(1)} pp</td>
              <td style={tdStyle}>{s.detectedAt}</td>
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
  verticalAlign: 'top',
};
const deltaTdStyle: React.CSSProperties = {
  ...{ padding: '8px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' },
  color: '#b00', fontWeight: 600,
};
const kindChipStyle: React.CSSProperties = {
  background: '#f0f1f2', color: '#32363a', padding: '2px 8px',
  borderRadius: 4, fontSize: 11, fontFamily: 'ui-monospace, monospace',
};
const boundaryDetailStyle: React.CSSProperties = {
  fontSize: 11, color: '#6a6d70', marginTop: 4, fontFamily: 'ui-monospace, monospace',
};
