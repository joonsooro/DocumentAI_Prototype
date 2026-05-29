/**
 * SF #2b — Agent I/O Dashboard.
 *
 * Read-only aggregate view over the F-18 qualityMetricLog stream. Subscribes
 * to the in-memory store and renders 5 session-aggregate metrics:
 *   1. Calls per agent (5-row tally; empty rows preserved)
 *   2. Failure rate per agent (fraction + percentage)
 *   3. p50 / p95 latency per agent (ms < 1s, s with one decimal otherwise)
 *   4. Session token total (input / output / total — null-skip)
 *   5. AgentFailure reason histogram (top 5; positive empty state)
 *
 * Architectural locks:
 *   - The 5 agent names are a HARD-CODED const readonly array, NOT derived
 *     from the stream. The source-of-truth literals are:
 *       'compile'             (compileIntentToConfiguration.ts)
 *       'capability'          (assessCapabilities.ts)
 *       'readiness'           (decideReadiness.ts — composite verdict per SF #2c)
 *       'operationalReasons'  (generateOperationalReasons.ts)
 *       'admin.recommend'     (generateAdminRecommendations.ts — note the dot)
 *
 *   - The 'readiness' row counts COMPOSITE verdicts (recordCustom) and is
 *     emitted with tokenUsage=null by design — the inner 'operationalReasons'
 *     row carries the real spend. Metric 1 counts it; Metric 3 uses its
 *     latency; Metric 4 correctly skips it via the null-guard.
 *
 *   - 'admin.recommend' contains a literal dot. CSS attribute selectors
 *     [data-testid="agent-io-metrics-row-admin.recommend"] handle this fine;
 *     react-testing-library's screen.getByTestId also handles it.
 *
 *   - This is purely a render layer. No new data sources, no new domain
 *     types, no new dependencies. D5 binds.
 *
 *   - Render-time redaction belt is a defensive second layer; the F-18 store
 *     already strips forbidden substrings upstream (N3 / N8).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { QualityMetric } from '@domain/types';
import { getMetrics, subscribe } from '@runtime/qualityMetricLog';

// ---------------------------------------------------------------------------
// The 5 enumerated agents — hard-coded source-of-truth literals.
// Do NOT derive from the metrics stream. Do NOT shorten.
// ---------------------------------------------------------------------------

const AGENT_NAMES = [
  'compile',
  'capability',
  'readiness',
  'operationalReasons',
  'admin.recommend',
] as const;

type AgentName = (typeof AGENT_NAMES)[number];

// ---------------------------------------------------------------------------
// Render-time redaction belt — defensive second layer over F-18's upstream
// stripping. If a poisoned error string somehow lands in the store, the
// rendered DOM still cannot contain the forbidden substrings.
// ---------------------------------------------------------------------------

const FORBIDDEN_SUBSTRINGS: readonly string[] = ['system:', 'prompt:', '<|'];

// AICORE_KEY_PATH-shaped: any path-like fragment ending in .json or .key.
const AICORE_KEY_PATH_PATTERN = /\/[^\s]+\.(json|key)/gi;

// The DAEJOO material-disposal phrase — kept here as the explicit
// belt-and-suspenders redactor target (the upstream store should never
// surface it, but a defensive layer is cheap).
const DAEJOO_DISPOSAL_PHRASE = 'material disposal';

function redactForRender(input: string | null): string {
  if (input === null || input === undefined) return '';
  let out = input;
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    while (out.toLowerCase().includes(needle)) {
      const idx = out.toLowerCase().indexOf(needle);
      out = out.slice(0, idx) + '[redacted]' + out.slice(idx + needle.length);
    }
  }
  out = out.replace(AICORE_KEY_PATH_PATTERN, '[redacted]');
  // Case-insensitive replace for the disposal phrase.
  const lowered = out.toLowerCase();
  let idx = lowered.indexOf(DAEJOO_DISPOSAL_PHRASE);
  while (idx !== -1) {
    out = out.slice(0, idx) + '[redacted]' + out.slice(idx + DAEJOO_DISPOSAL_PHRASE.length);
    idx = out.toLowerCase().indexOf(DAEJOO_DISPOSAL_PHRASE);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure compute helpers — operate on the QualityMetric[] snapshot.
// ---------------------------------------------------------------------------

type CallsByAgent = Record<AgentName, number>;
type FailureRate = Record<AgentName, { fail: number; total: number }>;
type Percentiles = Record<AgentName, { p50: number | null; p95: number | null }>;

function emptyCalls(): CallsByAgent {
  return {
    compile: 0,
    capability: 0,
    readiness: 0,
    operationalReasons: 0,
    'admin.recommend': 0,
  };
}

function emptyFailureRate(): FailureRate {
  return {
    compile: { fail: 0, total: 0 },
    capability: { fail: 0, total: 0 },
    readiness: { fail: 0, total: 0 },
    operationalReasons: { fail: 0, total: 0 },
    'admin.recommend': { fail: 0, total: 0 },
  };
}

function emptyPercentiles(): Percentiles {
  return {
    compile: { p50: null, p95: null },
    capability: { p50: null, p95: null },
    readiness: { p50: null, p95: null },
    operationalReasons: { p50: null, p95: null },
    'admin.recommend': { p50: null, p95: null },
  };
}

function isEnumeratedAgent(agent: string): agent is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(agent);
}

function computeCallsPerAgent(metrics: readonly QualityMetric[]): CallsByAgent {
  const out = emptyCalls();
  for (const m of metrics) {
    if (isEnumeratedAgent(m.agent)) {
      out[m.agent] += 1;
    }
  }
  return out;
}

function computeFailureRate(metrics: readonly QualityMetric[]): FailureRate {
  const out = emptyFailureRate();
  for (const m of metrics) {
    if (isEnumeratedAgent(m.agent)) {
      out[m.agent].total += 1;
      if (m.status === 'fail') out[m.agent].fail += 1;
    }
  }
  return out;
}

/**
 * p50 / p95 latency per agent, computed from rows with non-null latencyMs.
 * Convention: p50 = sorted[floor(0.5*len)], p95 = sorted[floor(0.95*len)].
 * When len < 20, p95 falls back to sorted[len-1] (max) because the
 * floor(0.95*n) index for very small n collapses to the same as p50 or
 * worse; max is the most informative tail signal at small N.
 */
function computeLatencyPercentiles(metrics: readonly QualityMetric[]): Percentiles {
  const buckets: Record<AgentName, number[]> = {
    compile: [],
    capability: [],
    readiness: [],
    operationalReasons: [],
    'admin.recommend': [],
  };
  for (const m of metrics) {
    if (isEnumeratedAgent(m.agent) && m.latencyMs !== null) {
      buckets[m.agent].push(m.latencyMs);
    }
  }
  const out = emptyPercentiles();
  for (const agent of AGENT_NAMES) {
    const samples = buckets[agent];
    if (samples.length === 0) {
      out[agent] = { p50: null, p95: null };
      continue;
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(0.5 * sorted.length)] ?? null;
    const p95 =
      sorted.length < 20
        ? (sorted[sorted.length - 1] ?? null)
        : (sorted[Math.floor(0.95 * sorted.length)] ?? null);
    out[agent] = { p50, p95 };
  }
  return out;
}

function computeSessionTokenTotal(
  metrics: readonly QualityMetric[],
): { input: number; output: number } {
  let input = 0;
  let output = 0;
  for (const m of metrics) {
    if (m.tokenUsage !== null) {
      input += m.tokenUsage.input;
      output += m.tokenUsage.output;
    }
  }
  return { input, output };
}

function computeFailureHistogram(
  metrics: readonly QualityMetric[],
): Array<{ reason: string; count: number }> {
  const tally = new Map<string, number>();
  for (const m of metrics) {
    if (m.status === 'fail' && m.error !== null) {
      tally.set(m.error, (tally.get(m.error) ?? 0) + 1);
    }
  }
  return Array.from(tally.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatFailureRate(rate: { fail: number; total: number }): string {
  if (rate.total === 0) return '—';
  const pct = (rate.fail / rate.total) * 100;
  return `${rate.fail}/${rate.total} (${pct.toFixed(1)}%)`;
}

function toReasonSlug(reason: string): string {
  return reason.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentIOMetricsPanel() {
  // Verbatim subscriber lifecycle pattern from QualityMetricLogPanel.tsx:18-25
  // and AgentIoLogPanel.tsx:171-176. F-18 subscribe() returns the unsubscribe
  // function; React cleanup calls it on unmount.
  const [metrics, setMetrics] = useState<readonly QualityMetric[]>(() => getMetrics());

  useEffect(() => {
    const unsubscribe = subscribe((snap) => setMetrics(snap));
    return unsubscribe;
  }, []);

  const calls = computeCallsPerAgent(metrics);
  const failureRate = computeFailureRate(metrics);
  const percentiles = computeLatencyPercentiles(metrics);
  const tokenTotal = computeSessionTokenTotal(metrics);
  const failureHistogram = computeFailureHistogram(metrics);

  return (
    <section data-testid="agent-io-metrics-panel" style={panelStyle}>
      <h2 style={headingStyle}>Session metrics</h2>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Calls</th>
            <th style={thStyle}>Failure rate</th>
            <th style={thStyle}>p50 / p95 latency</th>
          </tr>
        </thead>
        <tbody>
          {AGENT_NAMES.map((agent) => {
            const count = calls[agent];
            const rate = failureRate[agent];
            const lat = percentiles[agent];
            const muted = count === 0;
            return (
              <tr
                key={agent}
                data-testid={`agent-io-metrics-row-${agent}`}
                style={muted ? rowMutedStyle : rowStyle}
              >
                <td style={tdAgentStyle}>{agent}</td>
                <td style={tdNumStyle}>{count}</td>
                <td style={tdNumStyle}>{formatFailureRate(rate)}</td>
                <td style={tdNumStyle}>
                  {formatLatency(lat.p50)} / {formatLatency(lat.p95)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={footnoteStyle}>p95 falls back to max() when n &lt; 20</p>

      <div data-testid="agent-io-metrics-token-total" style={tokenBlockStyle}>
        <h3 style={subHeadingStyle}>Session token usage</h3>
        <dl style={tokenDlStyle}>
          <dt style={tokenLabelStyle}>Input</dt>
          <dd style={tokenValueStyle}>{NUMBER_FORMAT.format(tokenTotal.input)}</dd>
          <dt style={tokenLabelStyle}>Output</dt>
          <dd style={tokenValueStyle}>{NUMBER_FORMAT.format(tokenTotal.output)}</dd>
          <dt style={tokenLabelStyle}>Total</dt>
          <dd style={tokenValueStyle}>
            {NUMBER_FORMAT.format(tokenTotal.input + tokenTotal.output)}
          </dd>
        </dl>
      </div>

      <div style={histogramBlockStyle}>
        <h3 style={subHeadingStyle}>Top failure reasons</h3>
        {failureHistogram.length === 0 ? (
          <p style={emptyStyle}>No failures this session.</p>
        ) : (
          <ul style={histogramListStyle}>
            {failureHistogram.map(({ reason, count }) => (
              <li
                key={reason}
                data-testid={`agent-io-metrics-failure-${toReasonSlug(reason)}`}
                style={histogramRowStyle}
              >
                <span style={histogramReasonStyle}>{redactForRender(reason)}</span>
                <span style={histogramCountStyle}>× {count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles — design-token-based, matching the existing panel idiom
// (compare ThresholdGovernancePanel.tsx).
// ---------------------------------------------------------------------------

const panelStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--card-padding)',
  fontFamily: 'var(--font-sans)',
};

const headingStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  margin: '0 0 12px',
  color: 'var(--ink-1)',
};

const subHeadingStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 8px',
  color: 'var(--ink-2)',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--body-size)',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 'var(--table-head-size)',
  letterSpacing: 'var(--table-head-tracking)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};

const rowStyle: CSSProperties = {
  color: 'var(--ink-1)',
};

const rowMutedStyle: CSSProperties = {
  color: 'var(--ink-4)',
};

const tdAgentStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid var(--line-2)',
  fontFamily: 'var(--font-mono)',
};

const tdNumStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid var(--line-2)',
  fontFamily: 'var(--font-mono)',
};

const footnoteStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-4)',
  margin: '6px 0 14px',
};

const tokenBlockStyle: CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  background: 'var(--panel-2)',
  borderRadius: 'var(--radius-button)',
};

const tokenDlStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 12,
  rowGap: 4,
  margin: 0,
};

const tokenLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-3)',
  margin: 0,
};

const tokenValueStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'var(--ink-1)',
  margin: 0,
};

const histogramBlockStyle: CSSProperties = {
  marginTop: 14,
};

const emptyStyle: CSSProperties = {
  color: 'var(--ink-3)',
  margin: 0,
  fontSize: 13,
};

const histogramListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const histogramRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  borderBottom: '1px solid var(--line-2)',
  fontSize: 13,
  color: 'var(--ink-1)',
};

const histogramReasonStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
};

const histogramCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--ink-3)',
};
