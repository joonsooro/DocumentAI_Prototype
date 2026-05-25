/**
 * F-12 — Prompt version management panel.
 *
 * Lists PromptVersion rows from F-15's PromptVersion store (when F-15
 * lands the writer; F-12 just reads). v1 is read-only — the diff view
 * is text-only side-by-side, not a real diff library.
 */
import type { PromptVersion } from '@domain/types';

interface Props {
  readonly versions: readonly PromptVersion[];
}

export function PromptVersionPanel({ versions }: Props) {
  if (versions.length === 0) {
    return (
      <section data-testid="admin-prompt-versions-panel" style={panelStyle}>
        <h2 style={headingStyle}>Prompt versions</h2>
        <p style={emptyStyle}>No prompt versions yet. Versions appear here as the admin promotes them.</p>
      </section>
    );
  }
  return (
    <section data-testid="admin-prompt-versions-panel" style={panelStyle}>
      <h2 style={headingStyle}>Prompt versions</h2>
      <table data-testid="admin-prompt-versions-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Version</th>
            <th style={thStyle}>Supplier</th>
            <th style={thStyle}>Created</th>
            <th style={thStyle}>Active</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} data-testid={`admin-prompt-version-${v.id}`}>
              <td style={tdStyle}>{v.agent}</td>
              <td style={tdStyle}>{v.version}</td>
              <td style={tdStyle}>{v.supplier ?? '— default —'}</td>
              <td style={tdStyle}>{v.createdAt}</td>
              <td style={tdStyle}>{v.active ? 'active' : ''}</td>
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
