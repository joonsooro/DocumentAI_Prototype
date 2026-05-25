/**
 * Admin Control Plane route (/admin) — F-12 placeholder.
 *
 * F-11 ships the router with all three routes mounted so the three-
 * workspace separation invariant (HAPPY-6) can be smoke-tested today.
 * F-12 will replace the body with the prompt-version-management UI,
 * threshold-management tool, auto-confirm criteria editor, schema
 * quality monitoring, correction trend, and recommendation queue.
 */
export default function AdminRoute() {
  return (
    <div data-testid="admin-route" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 8px', color: '#32363a' }}>
        Admin Control Plane
      </h1>
      <p style={{ fontSize: 14, color: '#5a6168', margin: 0 }}>
        F-12 will land here: prompt versions, auto-confirm criteria, recommendation queue.
      </p>
    </div>
  );
}
