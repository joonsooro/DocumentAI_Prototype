/**
 * F-12 — Threshold inspector (a TOOL, not a recommendation).
 *
 * Per contract §2 Screen 2: "Field-level threshold management (visible as
 * a tool; never recommended action)". This panel is the visible tool —
 * the admin CAN read and stage threshold overrides here. The N2 invariant
 * is about RECOMMENDATIONS, not about the tool's existence. F-12 ships
 * the read view; staged overrides are display-only in v1.
 *
 * The panel's heading is deliberately neutral — "Field thresholds" — and
 * does NOT use the word "lower" anywhere. The ESLint N2 rule scoped to
 * src/components/admin/** would reject "lower the threshold" as a
 * literal regardless.
 */
import type { CompiledConfiguration } from '@domain/types';

interface Props {
  readonly inspector: {
    readonly configuration: CompiledConfiguration | null;
    readonly stagedOverrides: readonly { field: string; staged: number }[];
  };
}

export function ThresholdInspectorPanel({ inspector }: Props) {
  const { configuration, stagedOverrides } = inspector;
  if (!configuration) {
    return (
      <section data-testid="admin-threshold-inspector-panel" style={panelStyle}>
        <h2 style={headingStyle}>Field thresholds</h2>
        <p style={emptyStyle}>
          Load a configuration to inspect per-field thresholds. Threshold management is a tool,
          never a recommended action.
        </p>
      </section>
    );
  }
  const overrideByField = new Map(stagedOverrides.map((o) => [o.field, o.staged]));
  return (
    <section data-testid="admin-threshold-inspector-panel" style={panelStyle}>
      <h2 style={headingStyle}>Field thresholds</h2>
      <p style={subStyle}>Inspect or stage overrides per field. This is an inspection tool.</p>
      <table data-testid="admin-threshold-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Current</th>
            <th style={thStyle}>Staged override</th>
          </tr>
        </thead>
        <tbody>
          {configuration.schema.fields.map((f) => {
            const staged = overrideByField.get(f.name);
            return (
              <tr key={f.name} data-testid={`admin-threshold-row-${f.name}`}>
                <td style={tdStyle}>{f.name}</td>
                <td style={tdStyle}>{f.confidenceThreshold.toFixed(2)}</td>
                <td style={tdStyle}>{staged === undefined ? '—' : staged.toFixed(2)}</td>
              </tr>
            );
          })}
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
  fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: '#32363a',
};
const subStyle: React.CSSProperties = { fontSize: 13, color: '#6a6d70', margin: '0 0 12px' };
const emptyStyle: React.CSSProperties = { color: '#6a6d70', margin: 0 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ccc',
  fontWeight: 600, color: '#32363a',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid #eee', color: '#32363a',
};
