/**
 * F-12 — Schema quality monitoring.
 *
 * Per-field health snapshot: recent success rate + recent correction count.
 * v1 shows a static snapshot from the AdminViewModel.schemaQuality field;
 * F-19 / S4 will feed live data here.
 */
interface Props {
  readonly fields: readonly {
    readonly field: string;
    readonly recentSuccessRate: number;
    readonly recentCorrectionCount: number;
  }[];
}

export function SchemaQualityPanel({ fields }: Props) {
  if (fields.length === 0) {
    return (
      <section data-testid="admin-schema-quality-panel" style={panelStyle}>
        <h2 style={headingStyle}>Schema quality</h2>
        <p style={emptyStyle}>No telemetry yet.</p>
      </section>
    );
  }
  return (
    <section data-testid="admin-schema-quality-panel" style={panelStyle}>
      <h2 style={headingStyle}>Schema quality</h2>
      <table data-testid="admin-schema-quality-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Recent success</th>
            <th style={thStyle}>Recent corrections</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.field} data-testid={`admin-schema-quality-row-${f.field}`}>
              <td style={tdStyle}>{f.field}</td>
              <td style={tdStyle}>{(f.recentSuccessRate * 100).toFixed(0)}%</td>
              <td style={tdStyle}>{f.recentCorrectionCount}</td>
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
