/**
 * Internal Product Intelligence route (/internal) — F-13 placeholder.
 *
 * F-13 will replace the body with the feedback governance queue, the
 * model regression signals panel, the QualityMetric log table, the
 * capability gap analytics, and the DAEJOO material-disposal phrase
 * surfaced ONLY here as signal_type='unsupported_free_text_business_condition'.
 */
export default function InternalRoute() {
  return (
    <div data-testid="internal-route" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 8px', color: '#32363a' }}>
        Internal Product Intelligence
      </h1>
      <p style={{ fontSize: 14, color: '#5a6168', margin: 0 }}>
        F-13 will land here: governance queue, regression signals, QualityMetric log, gap analytics.
      </p>
    </div>
  );
}
