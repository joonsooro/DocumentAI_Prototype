/**
 * F-12 — Auto-confirm criteria editor (v1 read-only view).
 *
 * Pairs with the threshold inspector: shows the per-field criterion that
 * lets a value auto-confirm. v1 is a read view; editing is deferred.
 */
interface Props {
  readonly criteria: readonly { readonly field: string; readonly criterion: string }[];
}

export function AutoConfirmCriteriaPanel({ criteria }: Props) {
  if (criteria.length === 0) {
    return (
      <section data-testid="admin-autoconfirm-panel" style={panelStyle}>
        <h2 style={headingStyle}>Auto-confirm criteria</h2>
        <p style={emptyStyle}>No criteria defined yet.</p>
      </section>
    );
  }
  return (
    <section data-testid="admin-autoconfirm-panel" style={panelStyle}>
      <h2 style={headingStyle}>Auto-confirm criteria</h2>
      <dl data-testid="admin-autoconfirm-list" style={listStyle}>
        {criteria.map((c) => (
          <div key={c.field} data-testid={`admin-autoconfirm-${c.field}`} style={rowStyle}>
            <dt style={dtStyle}>{c.field}</dt>
            <dd style={ddStyle}>{c.criterion}</dd>
          </div>
        ))}
      </dl>
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
const listStyle: React.CSSProperties = { margin: 0 };
const rowStyle: React.CSSProperties = {
  padding: '8px 0', borderBottom: '1px solid #eee',
};
const dtStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#32363a',
  fontFamily: 'ui-monospace, monospace',
};
const ddStyle: React.CSSProperties = {
  margin: '2px 0 0', fontSize: 13, color: '#5a6168',
};
