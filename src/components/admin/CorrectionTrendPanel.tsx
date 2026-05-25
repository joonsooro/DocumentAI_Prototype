/**
 * F-12 — Correction trend review.
 *
 * Renders recent CorrectionEvents (freshest first per the view-model)
 * so the admin can see what operators have been fixing. v1 read-only.
 */
import type { CorrectionEvent } from '@domain/types';

interface Props {
  readonly corrections: readonly CorrectionEvent[];
}

export function CorrectionTrendPanel({ corrections }: Props) {
  if (corrections.length === 0) {
    return (
      <section data-testid="admin-correction-trend-panel" style={panelStyle}>
        <h2 style={headingStyle}>Correction trend</h2>
        <p style={emptyStyle}>No corrections submitted yet.</p>
      </section>
    );
  }
  return (
    <section data-testid="admin-correction-trend-panel" style={panelStyle}>
      <h2 style={headingStyle}>Correction trend</h2>
      <table data-testid="admin-correction-trend-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Old</th>
            <th style={thStyle}>New</th>
            <th style={thStyle}>Supplier</th>
            <th style={thStyle}>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {corrections.map((c) => (
            <tr key={c.id} data-testid={`admin-correction-row-${c.id}`}>
              <td style={tdStyle}>{c.field}</td>
              <td style={tdStyle}>{String(c.oldValue ?? '—')}</td>
              <td style={tdStyle}>{String(c.newValue ?? '—')}</td>
              <td style={tdStyle}>{c.governance.supplier ?? '—'}</td>
              <td style={tdStyle}>{c.submittedAt}</td>
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
