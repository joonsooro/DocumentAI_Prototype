/**
 * F-12 — Recommendation queue.
 *
 * Renders the AdminRecommendation[] from the view-model. The view-model
 * has ALREADY been filtered by filterRecommendationsForAdminSurface()
 * — this panel does not re-check. The filter is the boundary; if a
 * forbidden recommendation made it past F-15's three layers AND past
 * the view-model projection, that's a build invariant failure (covered
 * by the smoke test).
 *
 * N2 enforcement layers (recap):
 *   1. TS: AdminRecommendationType union excludes 'threshold_lower'.
 *   2. zod (F-15): wire schema rejects type='threshold_lower'.
 *   3. Runtime (F-15): regex scan on title+body.
 *   4. View-model projection (here / F-12): defensive filter on the
 *      rendering boundary. This panel renders only what survives.
 *   5. ESLint: literals 'lower(ing)? threshold' forbidden in this file
 *      and src/components/admin/**.
 */
import type { AdminRecommendation } from '@domain/types';

interface Props {
  readonly recommendations: readonly AdminRecommendation[];
}

export function RecommendationQueuePanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <section data-testid="admin-recommendation-queue-panel" style={panelStyle}>
        <h2 style={headingStyle}>Recommendation queue</h2>
        <p style={emptyStyle}>No recommendations awaiting review.</p>
      </section>
    );
  }
  return (
    <section data-testid="admin-recommendation-queue-panel" style={panelStyle}>
      <h2 style={headingStyle}>Recommendation queue</h2>
      <ul data-testid="admin-recommendation-list" style={listStyle}>
        {recommendations.map((r) => (
          <li key={r.id} data-testid={`admin-recommendation-${r.id}`} style={rowStyle}>
            <header style={recHeaderStyle}>
              <span style={typeBadgeStyle}>{r.type.replace(/_/g, ' ')}</span>
              <span style={scopeChipStyle}>{r.scope.replace(/_/g, ' ')}</span>
            </header>
            <h3 data-testid={`admin-recommendation-title-${r.id}`} style={titleStyle}>{r.title}</h3>
            <p data-testid={`admin-recommendation-body-${r.id}`} style={bodyStyle}>{r.body}</p>
            <footer style={footerStyle}>
              <span>Proposed {r.proposedAt}</span>
              <span>Sources: {r.sourceCorrectionIds.length}</span>
            </footer>
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
const recHeaderStyle: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8,
};
const typeBadgeStyle: React.CSSProperties = {
  background: '#0a6ed1', color: '#fff', padding: '2px 10px',
  borderRadius: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
};
const scopeChipStyle: React.CSSProperties = {
  background: '#f0f1f2', color: '#32363a', padding: '2px 8px',
  borderRadius: 4, fontSize: 12,
};
const titleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: '#32363a',
};
const bodyStyle: React.CSSProperties = {
  fontSize: 13, color: '#5a6168', margin: 0, lineHeight: 1.4,
};
const footerStyle: React.CSSProperties = {
  display: 'flex', gap: 16, fontSize: 11, color: '#6a6d70', marginTop: 8,
  fontFamily: 'ui-monospace, monospace',
};
