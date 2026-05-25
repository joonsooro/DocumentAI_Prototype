/**
 * F-11 — Compiled configuration panel.
 *
 * Renders the CompiledConfiguration's schema fields with instructions,
 * validation, regex, thresholds, and processing mode. Read-only — the
 * customer reviews; edits are an admin action (F-12).
 */
import type { CompiledConfiguration } from '@domain/types';

interface Props {
  readonly configuration: CompiledConfiguration | null;
}

export function CompiledConfigPanel({ configuration }: Props) {
  if (!configuration) {
    return (
      <section data-testid="customer-compiled-config-panel" style={panelStyle}>
        <h2 style={headingStyle}>Compiled configuration</h2>
        <p style={emptyStyle}>Submit your intent to see the compiled configuration here.</p>
      </section>
    );
  }
  return (
    <section data-testid="customer-compiled-config-panel" style={panelStyle}>
      <h2 style={headingStyle}>Compiled configuration</h2>
      <div style={metaRowStyle}>
        <span><strong>Processing mode:</strong> {configuration.processingMode}</span>
        <span><strong>Fields:</strong> {configuration.schema.fields.length}</span>
      </div>
      <table data-testid="customer-compiled-config-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Required</th>
            <th style={thStyle}>Instruction</th>
            <th style={thStyle}>Threshold</th>
          </tr>
        </thead>
        <tbody>
          {configuration.schema.fields.map((f) => (
            <tr key={f.name} data-testid={`customer-config-row-${f.name}`}>
              <td style={tdStyle}>{f.name}</td>
              <td style={tdStyle}>{f.dataType}</td>
              <td style={tdStyle}>{f.required ? 'yes' : 'no'}</td>
              <td style={tdStyle}>{f.instruction}</td>
              <td style={tdStyle}>{f.confidenceThreshold.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  padding: '20px 24px',
  marginBottom: 16,
};
const headingStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 12px', color: '#32363a',
};
const emptyStyle: React.CSSProperties = { color: '#6a6d70', margin: 0 };
const metaRowStyle: React.CSSProperties = {
  display: 'flex', gap: 24, fontSize: 13, color: '#32363a', marginBottom: 12,
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ccc', fontWeight: 600, color: '#32363a',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid #eee', color: '#32363a', verticalAlign: 'top',
};
