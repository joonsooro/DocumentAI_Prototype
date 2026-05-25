/**
 * F-11 — Clarification loop panel.
 *
 * Renders each ClarificationRequest with all 3 EDGE-1 prompts. operatorFacingError
 * is shown when present (kind='agent_failure_surface' from F-08). The customer
 * answers per-prompt; this component does NOT submit answers — F-19 / S4 wires
 * that. v1 lets the customer see the questions.
 */
import type { ClarificationRequest } from '@domain/types';

interface Props {
  readonly clarifications: readonly ClarificationRequest[];
}

export function ClarificationLoopPanel({ clarifications }: Props) {
  if (clarifications.length === 0) {
    return (
      <section data-testid="customer-clarification-panel" style={panelStyle}>
        <h2 style={headingStyle}>Clarifications</h2>
        <p style={emptyStyle}>No questions for you at the moment.</p>
      </section>
    );
  }
  return (
    <section data-testid="customer-clarification-panel" style={panelStyle}>
      <h2 style={headingStyle}>Clarifications</h2>
      <ul data-testid="customer-clarification-list" style={listStyle}>
        {clarifications.map((c) => (
          <li key={c.id} data-testid={`customer-clarification-${c.id}`} style={rowStyle}>
            <header style={requestHeaderStyle}>
              <span style={kindBadgeStyle}>{c.kind.replace(/_/g, ' ')}</span>
              {c.field ? <span style={fieldChipStyle}>{c.field}</span> : null}
            </header>
            {c.operatorFacingError ? (
              <p data-testid={`customer-clarification-error-${c.id}`} style={errorStyle}>
                {c.operatorFacingError}
              </p>
            ) : null}
            <dl style={promptsStyle}>
              <dt style={dtStyle}>Field meaning</dt>
              <dd
                data-testid={`customer-clarification-fieldmeaning-${c.id}`}
                style={ddStyle}
              >
                {c.prompts.fieldMeaning}
              </dd>
              <dt style={dtStyle}>Posting / review / reporting impact</dt>
              <dd
                data-testid={`customer-clarification-impact-${c.id}`}
                style={ddStyle}
              >
                {c.prompts.postingReviewReportingImpact}
              </dd>
              <dt style={dtStyle}>Supplier-scope applicability</dt>
              <dd
                data-testid={`customer-clarification-scope-${c.id}`}
                style={ddStyle}
              >
                {c.prompts.supplierScopeApplicability}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
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
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };
const rowStyle: React.CSSProperties = {
  padding: '14px 0', borderBottom: '1px solid #eee',
};
const requestHeaderStyle: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8,
};
const kindBadgeStyle: React.CSSProperties = {
  background: '#0a6ed1', color: '#fff', padding: '2px 10px',
  borderRadius: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
};
const fieldChipStyle: React.CSSProperties = {
  background: '#f0f1f2', color: '#32363a', padding: '2px 8px',
  borderRadius: 4, fontSize: 12, fontFamily: 'ui-monospace, monospace',
};
const errorStyle: React.CSSProperties = {
  background: '#fbecec', color: '#b00', borderLeft: '4px solid #b00',
  padding: '8px 12px', margin: '0 0 8px', fontSize: 13,
};
const promptsStyle: React.CSSProperties = { margin: 0 };
const dtStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#6a6d70', letterSpacing: '0.04em',
  textTransform: 'uppercase', marginTop: 6,
};
const ddStyle: React.CSSProperties = {
  margin: '2px 0 0', fontSize: 14, color: '#32363a',
};
