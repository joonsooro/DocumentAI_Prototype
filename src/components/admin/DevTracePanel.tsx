/**
 * Cycle 2 (2026-05-28) — Dev-only agent trace panel.
 *
 * Mounted under /admin behind an import.meta.env.DEV gate. Renders
 * one row per devTraceLog entry with the FULL system + user prompts
 * and raw response — the pre-redaction view of the trace stream the
 * production F-30 Agent I/O Log shows in redacted form.
 *
 * This panel is for local dev debugging only. It MUST NEVER render in
 * a production build (the import.meta.env.DEV gate is statically
 * tree-shaken by Vite) and MUST NEVER render on /customer (the route
 * itself does not mount this component — N1 / N3 by construction).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import {
  getDevTraces,
  subscribeDevTraces,
  type DevTraceEntry,
} from '@runtime/devTraceLog';

export function DevTracePanel() {
  const [entries, setEntries] = useState<readonly DevTraceEntry[]>(() => getDevTraces());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeDevTraces(() => {
      setEntries(getDevTraces());
    });
    return unsubscribe;
  }, []);

  function toggleExpanded(timestamp: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) next.delete(timestamp);
      else next.add(timestamp);
      return next;
    });
  }

  return (
    <section data-testid="admin-dev-trace-panel" style={panelStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Dev Trace (pre-redaction)</h2>
        <span style={countStyle} data-testid="admin-dev-trace-count">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </header>
      <p style={subtitleStyle}>
        Local-dev mirror of every agent call. Production bundles tree-shake this panel.
      </p>
      {entries.length === 0 ? (
        <p style={emptyStyle} data-testid="admin-dev-trace-empty">
          No agent calls captured yet in this session.
        </p>
      ) : (
        <ul style={listStyle}>
          {entries.map((e, idx) => {
            const id = `${e.timestamp}-${idx}`;
            const isOpen = expanded.has(id);
            return (
              <li
                key={id}
                data-testid={`admin-dev-trace-row-${idx}`}
                style={rowStyle}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(id)}
                  style={rowHeaderButtonStyle}
                >
                  <span style={rowMetaStyle}>
                    <strong>{e.agent}</strong> · {e.model} · {e.status}
                    {e.latencyMs !== null ? ` · ${e.latencyMs}ms` : ''} · {e.timestamp}
                  </span>
                  <span style={chevronStyle}>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div style={detailStyle}>
                    <h4 style={detailHeadingStyle}>System prompt</h4>
                    <pre style={preStyle}>{e.systemPrompt}</pre>
                    <h4 style={detailHeadingStyle}>User prompt</h4>
                    <pre style={preStyle}>{e.userPrompt}</pre>
                    <h4 style={detailHeadingStyle}>Raw response</h4>
                    <pre style={preStyle}>{e.rawResponse}</pre>
                    {e.errorMessage && (
                      <>
                        <h4 style={detailHeadingStyle}>Error</h4>
                        <pre style={preStyle}>{e.errorMessage}</pre>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const panelStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  padding: '20px 24px',
};
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 6,
};
const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  margin: 0,
  color: '#32363a',
};
const countStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: '#6a6d70',
};
const subtitleStyle: CSSProperties = {
  margin: '0 0 12px',
  color: '#6a6d70',
  fontSize: 12,
};
const emptyStyle: CSSProperties = {
  margin: 0,
  color: '#6a6d70',
  fontSize: 13,
  fontStyle: 'italic',
};
const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const rowStyle: CSSProperties = {
  border: '1px solid #eee',
  borderRadius: 3,
  background: '#fafafa',
};
const rowHeaderButtonStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
};
const rowMetaStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11.5,
  color: '#32363a',
};
const chevronStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  color: '#6a6d70',
};
const detailStyle: CSSProperties = {
  padding: '4px 12px 12px',
  borderTop: '1px solid #eee',
};
const detailHeadingStyle: CSSProperties = {
  margin: '10px 0 4px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6a6d70',
};
const preStyle: CSSProperties = {
  margin: 0,
  padding: 8,
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 2,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
};
