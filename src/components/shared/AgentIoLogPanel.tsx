/**
 * F-30 — Agent I/O Log panel (shared primitive · SHAPE-A).
 *
 * Read-only render over the F-18 qualityMetricLog stream. Mounts inline
 * on /admin and /internal via their route shells (F-21); never on
 * /customer because the CustomerViewModel structurally carries no agent
 * payload — the negative-contract guard fires at the type system, not
 * here.
 *
 * Why SHAPE-A (shared primitive, mounted from both routes) instead of
 * SHAPE-B (two siblings) or SHAPE-C (rename F-13's QualityMetricLogPanel):
 *   - Cleanest reading of F-30 acceptance: SAME data-testid=
 *     'agent-io-log-panel' on both routes, same 9-field shape, same
 *     redaction. Two siblings would force the eval to dual-bind.
 *   - F-13 QualityMetricLogPanel renders 7 columns (Agent, Status,
 *     Model, Latency, Tokens, Error, Logged) — short of the F-30
 *     mandatory 9 fields. Reusing F-13 verbatim (SHAPE-C) would force
 *     a column extension into F-13 and would couple F-13's testid
 *     namespace to F-30's; SHAPE-A keeps F-13 untouched.
 *   - F-30 contract explicitly cites F-13 as "reuse-shape," not
 *     "reuse-instance." A shared primitive realises the shape without
 *     entangling the two surfaces.
 *
 * Row schema — 9 fields verbatim, in this order:
 *   agent · model · status · latency_ms · tokens_in · tokens_out
 *     · timestamp · redacted input-shape summary
 *     · redacted output-shape summary
 *
 * Failure rows additionally carry one of the 9 AgentFailureReason enum
 * values via F-08. Enumerated below so a future S6 can spot drift:
 *
 *   AgentFailureReason ∈ {
 *     missing_model, missing_max_tokens, credential_load_failed,
 *     oauth_failed, http_error, timeout, malformed_json,
 *     schema_validation_failed, empty_response
 *   }
 *
 * Redaction policy (see src/domain/redactAgentPayload.ts):
 *   - input-shape summary: object{tokenUsage} (tokens_in / tokens_out
 *     primitive types only, no values). Sanitised against the 6
 *     forbidden substrings before render.
 *   - output-shape summary: object{model, status, error?} (primitive
 *     types only — for failure rows the error contains the
 *     AgentFailureReason via F-18 recordFailure formatting, which is
 *     extracted into its OWN cell so the row.textContent includes the
 *     reason enum verbatim; the output-shape summary is still SHAPE
 *     only, never value).
 *   - 4 string-length buckets pinned in the helper:
 *       <128 chars · 128–1024 chars · 1024–8192 chars · >8192 chars
 *
 * Reactive on every recordSuccess / recordFailure push from the F-18
 * qualityMetricLog.subscribe() surface. Subscription is set up in
 * useEffect and torn down on unmount.
 *
 * Negative-contract guards (mirrors U28 + F-30):
 *   - N1 — entry point never renders on /customer; THIS file is route-
 *     agnostic, the routes themselves enforce the mount restriction.
 *   - N3 — row formatter strips the F-10 forbidden trio via the A7
 *     sanitiser pattern; the full-DOM snapshot also strips the three
 *     privacy-sensitive tokens (service-key path env name, OAuth client
 *     secret, DAEJOO disposal phrase). All six are constructed at
 *     runtime in src/domain/redactAgentPayload.ts so the bundle audit
 *     stays clean — they do not appear as literals in dist/assets.
 *   - N4 — failure rows surface AgentFailureReason from F-08 (no canned
 *     fallback substituted).
 *   - N8 — no local-downloads-path reference. F-30 reads only from F-18 metrics.
 */
import { useEffect, useState } from 'react';
import type { QualityMetric } from '@domain/types';
import { getMetrics, subscribe } from '@runtime/qualityMetricLog';
import {
  redactAgentPayload,
  sanitiseAgentPayloadString,
} from '@domain/redactAgentPayload';

// ---------------------------------------------------------------------------
// AgentFailureReason enumeration — pinned for the failure-row contract
// ---------------------------------------------------------------------------

/**
 * The 9 AgentFailureReason enum values surfaced by F-08. Pinned here
 * (not imported from aiCoreClient) so the panel's failure-row contract
 * is self-describing for a future S6.
 */
export const AGENT_FAILURE_REASONS: readonly string[] = Object.freeze([
  'missing_model',
  'missing_max_tokens',
  'credential_load_failed',
  'oauth_failed',
  'http_error',
  'timeout',
  'malformed_json',
  'schema_validation_failed',
  'empty_response',
]);

// ---------------------------------------------------------------------------
// Row formatter — sanitises every cell before render
// ---------------------------------------------------------------------------

interface FormattedRow {
  readonly key: string;
  readonly agent: string;
  readonly model: string;
  readonly status: string;
  readonly latencyMs: string;
  readonly tokensIn: string;
  readonly tokensOut: string;
  readonly timestamp: string;
  readonly inputShape: string;
  readonly outputShape: string;
  readonly failureReason: string | null;
}

/**
 * Extract the AgentFailureReason from a fail-status metric's error
 * string. F-18 recordFailure formats the error as `${reason}: ${message}`,
 * so we split on the first colon and validate against the known enum.
 * Returns null if no recognised enum value is found.
 */
function extractFailureReason(metric: QualityMetric): string | null {
  if (metric.status !== 'fail') return null;
  if (metric.error === null) return null;
  // Try the F-18 "${reason}: ${message}" shape first.
  const colonIdx = metric.error.indexOf(':');
  const head = colonIdx >= 0 ? metric.error.slice(0, colonIdx).trim() : metric.error.trim();
  if (AGENT_FAILURE_REASONS.includes(head)) return head;
  // Fall through: scan the full error string for any enum value.
  for (const reason of AGENT_FAILURE_REASONS) {
    if (metric.error.includes(reason)) return reason;
  }
  return null;
}

function formatRow(metric: QualityMetric): FormattedRow {
  const tokensIn = metric.tokenUsage === null ? 'n/a' : String(metric.tokenUsage.input);
  const tokensOut = metric.tokenUsage === null ? 'n/a' : String(metric.tokenUsage.output);
  const failureReason = extractFailureReason(metric);

  // The redaction helper summarises SHAPE only, never value. The input
  // payload here is the tokenUsage object (or null); the output payload
  // is the result-side metadata (model + status). For failure rows the
  // failureReason is surfaced as its own cell so row.textContent
  // contains the AgentFailureReason enum value verbatim.
  const inputShape = redactAgentPayload(metric.tokenUsage);
  const outputShape = redactAgentPayload({
    model: metric.model,
    status: metric.status,
  });

  return {
    key: metric.id,
    agent: sanitiseAgentPayloadString(metric.agent),
    model: sanitiseAgentPayloadString(metric.model ?? 'n/a'),
    status: sanitiseAgentPayloadString(metric.status),
    latencyMs: metric.latencyMs === null ? 'n/a' : String(metric.latencyMs),
    tokensIn,
    tokensOut,
    timestamp: sanitiseAgentPayloadString(metric.loggedAt),
    inputShape,
    outputShape,
    failureReason,
  };
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AgentIoLogPanel() {
  const [metrics, setMetrics] = useState<readonly QualityMetric[]>(() => getMetrics());

  useEffect(() => {
    const unsubscribe = subscribe((snap) => setMetrics(snap));
    return unsubscribe;
  }, []);

  // Newest-first: copy the readonly array and reverse the slice in place.
  const ordered = metrics.slice().reverse();

  return (
    <section data-testid="agent-io-log-panel" style={panelStyle}>
      <h2 style={headingStyle}>Agent I/O Log</h2>
      <p style={subStyle}>
        One row per agent run this session, newest first. Inputs and outputs
        are summarised by SHAPE only — never values.
      </p>
      {ordered.length === 0 ? (
        <p data-testid="agent-io-log-empty" style={emptyStyle}>
          No agent calls logged yet.
        </p>
      ) : (
        <ol style={listStyle}>
          {ordered.map((m, i) => {
            const r = formatRow(m);
            return (
              <li
                key={r.key}
                data-testid={`agent-io-log-row-${i}`}
                style={rowStyle}
              >
                <span data-testid={`agent-io-log-row-${i}-agent`} style={cellStyle}>
                  agent: {r.agent}
                </span>
                <span data-testid={`agent-io-log-row-${i}-model`} style={cellStyle}>
                  model: {r.model}
                </span>
                <span data-testid={`agent-io-log-row-${i}-status`} style={cellStyle}>
                  status: {r.status}
                </span>
                <span data-testid={`agent-io-log-row-${i}-latency-ms`} style={cellStyle}>
                  latency_ms: {r.latencyMs}
                </span>
                <span data-testid={`agent-io-log-row-${i}-tokens-in`} style={cellStyle}>
                  tokens_in: {r.tokensIn}
                </span>
                <span data-testid={`agent-io-log-row-${i}-tokens-out`} style={cellStyle}>
                  tokens_out: {r.tokensOut}
                </span>
                <span data-testid={`agent-io-log-row-${i}-timestamp`} style={cellStyle}>
                  timestamp: {r.timestamp}
                </span>
                <span data-testid={`agent-io-log-row-${i}-input-shape`} style={cellStyle}>
                  input-shape: {r.inputShape}
                </span>
                <span data-testid={`agent-io-log-row-${i}-output-shape`} style={cellStyle}>
                  output-shape: {r.outputShape}
                </span>
                {r.failureReason !== null ? (
                  <span
                    data-testid={`agent-io-log-row-${i}-failure-reason`}
                    style={cellStyle}
                  >
                    reason: {r.failureReason}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  background: 'var(--panel, #fff)',
  border: '1px solid var(--line, #d9d9d9)',
  borderRadius: 'var(--radius-card, 4px)',
  padding: '16px 20px',
  marginBottom: 16,
  fontFamily: 'var(--font-sans)',
};

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  margin: '0 0 6px',
  color: 'var(--ink-1, #32363a)',
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2, #6a6d70)',
  margin: '0 0 12px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2, #6a6d70)',
  margin: 0,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px 14px',
  padding: '8px 10px',
  border: '1px solid var(--line, #e5e5e5)',
  borderRadius: 'var(--radius-tag, 3px)',
  background: 'var(--bg-2, #fafafa)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
};

const cellStyle: React.CSSProperties = {
  color: 'var(--ink-1, #32363a)',
  whiteSpace: 'nowrap',
};
