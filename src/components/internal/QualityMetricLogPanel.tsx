/**
 * F-13 — QualityMetric log table.
 *
 * Subscribes to the F-18 quality-metric store (src/runtime/qualityMetricLog)
 * and re-renders on every push. The subscribe() return is the unsubscribe
 * function — used in useEffect cleanup.
 *
 * This panel is the customer-facing-of-internal-staff view of every
 * agent call: success/fail status, latency, model, error reason.
 * Prompt text is NEVER mirrored — F-18's console mirror already strips
 * it; this table doesn't have access to it either.
 */
import { useEffect, useState } from 'react';
import type { QualityMetric } from '@domain/types';
import { getMetrics, subscribe } from '@runtime/qualityMetricLog';

export function QualityMetricLogPanel() {
  const [metrics, setMetrics] = useState<readonly QualityMetric[]>(() => getMetrics());

  useEffect(() => {
    // F-18 subscribe returns the unsubscribe function; React cleanup
    // calls it on unmount.
    const unsubscribe = subscribe((snap) => setMetrics(snap));
    return unsubscribe;
  }, []);

  if (metrics.length === 0) {
    return (
      <section data-testid="internal-quality-log-panel" style={panelStyle}>
        <h2 style={headingStyle}>Quality metric log</h2>
        <p style={emptyStyle}>No agent calls logged yet.</p>
      </section>
    );
  }
  return (
    <section data-testid="internal-quality-log-panel" style={panelStyle}>
      <h2 style={headingStyle}>Quality metric log</h2>
      <table data-testid="internal-quality-log-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Model</th>
            <th style={thStyle}>Latency</th>
            <th style={thStyle}>Tokens</th>
            <th style={thStyle}>Error</th>
            <th style={thStyle}>Logged</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.id} data-testid={`internal-quality-row-${m.id}`}>
              <td style={tdStyle}>{m.agent}</td>
              <td style={tdStyle}>
                <span data-testid={`internal-quality-status-${m.id}`} style={statusBadgeStyle(m.status)}>
                  {m.status}
                </span>
              </td>
              <td style={tdStyle}>{m.model ?? '—'}</td>
              <td style={tdStyle}>{m.latencyMs === null ? '—' : `${m.latencyMs} ms`}</td>
              <td style={tdStyle}>
                {m.tokenUsage === null ? '—' : `${m.tokenUsage.input} → ${m.tokenUsage.output}`}
              </td>
              <td style={tdStyle}>{m.error ?? '—'}</td>
              <td style={tdStyle}>{m.loggedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function statusBadgeStyle(status: QualityMetric['status']): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: '#fff',
    background: status === 'success' ? '#107e3e' : '#b00',
  };
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
  verticalAlign: 'top',
};
