/**
 * F-18 — Observability log surface (SUB-6).
 *
 * Contract pointer: U16. The browser-console-mirrored in-memory
 * QualityMetric[] that the Internal Product Intelligence workspace (F-13)
 * renders as the "Product quality telemetry" panel. Every agentic call in
 * F-04 / F-05 / F-10 / F-15 appends ≥1 entry; F-08 (agent-failure surface)
 * will be the canonical write path for failures, paired with a
 * ClarificationRequest per N4.
 *
 * Design choices:
 *   - Process-singleton store (module-level array). v1 is a single-operator
 *     deterministic demo (SUB-5 / SUB-2); there is no multi-tenant or
 *     persistence concern. Tests reset via _resetQualityMetricLogForTests().
 *   - Append-only. Mutators only push; readers always get a frozen snapshot.
 *     This makes the "logSurface dropped >5% of calls" kill switch
 *     structurally impossible — every record() call is a single push.
 *   - Browser console mirror is fire-and-forget. Console output goes to
 *     console.info / console.error keyed off status; if console is
 *     unavailable (Node test env, JSDOM without spy), the push still lands.
 *   - Subscribers are simple callbacks. The F-13 Internal view will use
 *     this to re-render when new metrics arrive. Wired separately when
 *     F-13 lands; F-18 owns only the store + helpers.
 *   - record() accepts either an AgentResult (success) or an AgentFailure
 *     (fail). Both paths produce a QualityMetric — no canned fallback,
 *     consistent with N4.
 *
 * Acceptance (per app/feature-list.json F-18):
 *   - Every F-04/F-05/F-06/F-10/F-15 call appends ≥1 entry (proven once
 *     those agents wire log() into their flow — F-18 surfaces the API).
 *   - Drop rate < 5% in soak (structurally 0 — append-only).
 *
 * Non-goals:
 *   - F-18 is NOT the agent-failure router. F-08 will read AgentFailure,
 *     emit ClarificationRequest, and call recordFailure() here. F-18 is
 *     the store; F-08 is the routing policy.
 *   - F-18 does NOT render UI. F-13 reads from getMetrics() / subscribe().
 */

import type {
  AgentFailure,
  AgentFailureReason,
  AgentResult,
} from '@runtime/aiCoreClient';
import { recordQualityMetricEvent } from '@runtime/langfuseClient';
import type { QualityMetric, QualityMetricStatus } from '@domain/types';

// ---------------------------------------------------------------------------
// Module-level store — single instance per process (browser tab or Node test
// run). Tests reset via _resetQualityMetricLogForTests().
// ---------------------------------------------------------------------------

const metrics: QualityMetric[] = [];
type Subscriber = (latest: readonly QualityMetric[]) => void;
const subscribers = new Set<Subscriber>();

let idCounter = 0;
function nextId(agent: string, nowIso: string): string {
  // Stable, monotonic, no entropy. Format: qm::<agent>::<n>::<iso>.
  idCounter += 1;
  return `qm::${agent}::${idCounter}::${nowIso}`;
}

// ---------------------------------------------------------------------------
// Append helpers — the public write surface
// ---------------------------------------------------------------------------

export interface RecordOptions {
  /** Injectable for deterministic loggedAt stamping in tests. */
  readonly nowIso?: string;
}

/** Record a successful AgentResult. */
export function recordSuccess<T>(result: AgentResult<T>, opts: RecordOptions = {}): QualityMetric {
  const loggedAt = opts.nowIso ?? new Date().toISOString();
  const entry: QualityMetric = {
    id: nextId(result.agent, loggedAt),
    agent: result.agent,
    status: 'success',
    latencyMs: result.latency_ms,
    tokenUsage: result.token_usage,
    model: result.model,
    maxTokens: result.max_tokens,
    error: null,
    loggedAt,
  };
  return pushAndMirror(entry);
}

/** Record an AgentFailure thrown by callAgent. */
export function recordFailure(failure: AgentFailure, opts: RecordOptions = {}): QualityMetric {
  const loggedAt = opts.nowIso ?? new Date().toISOString();
  const entry: QualityMetric = {
    id: nextId(failure.agent, loggedAt),
    agent: failure.agent,
    status: 'fail',
    latencyMs: null,
    tokenUsage: null,
    model: null,
    maxTokens: null,
    error: `${failure.reason}: ${failure.message}`,
    loggedAt,
  };
  return pushAndMirror(entry);
}

/**
 * Lower-level write hook for cases where the caller has neither an
 * AgentResult nor an AgentFailure (e.g. a non-agent operation that we
 * still want surfaced in the log). Most callers should prefer
 * recordSuccess / recordFailure.
 */
export interface RecordCustomParams {
  readonly agent: string;
  readonly status: QualityMetricStatus;
  readonly latencyMs?: number | null;
  readonly tokenUsage?: { readonly input: number; readonly output: number } | null;
  readonly model?: string | null;
  readonly maxTokens?: number | null;
  readonly error?: string | null;
  readonly errorReason?: AgentFailureReason | null;
}

export function recordCustom(params: RecordCustomParams, opts: RecordOptions = {}): QualityMetric {
  const loggedAt = opts.nowIso ?? new Date().toISOString();
  const errorText =
    params.error ??
    (params.errorReason ? `${params.errorReason}: (no message)` : null);
  const entry: QualityMetric = {
    id: nextId(params.agent, loggedAt),
    agent: params.agent,
    status: params.status,
    latencyMs: params.latencyMs ?? null,
    tokenUsage: params.tokenUsage ?? null,
    model: params.model ?? null,
    maxTokens: params.maxTokens ?? null,
    error: errorText,
    loggedAt,
  };
  return pushAndMirror(entry);
}

function pushAndMirror(entry: QualityMetric): QualityMetric {
  metrics.push(entry);
  mirrorToConsole(entry);
  notifySubscribers();
  return entry;
}

function mirrorToConsole(entry: QualityMetric): void {
  // Fire-and-forget. We deliberately do NOT echo the prompt or response —
  // N4 / the agent_client_contract.must_not list forbid leaking prompts.
  // Only the metadata (agent, status, latency, tokens, error reason) goes
  // to console.
  try {
    if (entry.status === 'fail') {
      console.error('[qualityMetric]', {
        agent: entry.agent,
        status: entry.status,
        model: entry.model,
        error: entry.error,
        loggedAt: entry.loggedAt,
      });
    } else {
      console.info('[qualityMetric]', {
        agent: entry.agent,
        status: entry.status,
        model: entry.model,
        latencyMs: entry.latencyMs,
        tokenUsage: entry.tokenUsage,
        loggedAt: entry.loggedAt,
      });
    }
  } catch {
    // Console unavailable — drop silently. The store push already happened.
  }
}

// ---------------------------------------------------------------------------
// Read surface
// ---------------------------------------------------------------------------

/** Frozen snapshot of the full log. Consumers should not mutate the array. */
export function getMetrics(): readonly QualityMetric[] {
  return Object.freeze(metrics.slice());
}

/** Convenience: count entries matching agent + status. */
export function countMetrics(filter?: {
  readonly agent?: string;
  readonly status?: QualityMetricStatus;
}): number {
  if (!filter) return metrics.length;
  return metrics.filter(
    (m) =>
      (filter.agent === undefined || m.agent === filter.agent) &&
      (filter.status === undefined || m.status === filter.status),
  ).length;
}

// ---------------------------------------------------------------------------
// Subscription surface (for F-13 Internal view re-render)
// ---------------------------------------------------------------------------

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notifySubscribers(): void {
  if (subscribers.size === 0) return;
  const snapshot = getMetrics();
  for (const fn of subscribers) {
    try {
      fn(snapshot);
    } catch {
      // Subscriber threw — we don't let a downstream renderer break the log.
    }
  }
}

// ---------------------------------------------------------------------------
// Request-local capture helper — SF #2f (2026-05-29)
//
// Wraps an async fn so every QualityMetric pushed during fn()'s lifetime is
// collected into a buffer and returned alongside fn's result. The seam is the
// existing subscribe() surface: we register a request-local subscriber, run
// fn, then unsubscribe in finally so the listener never leaks past the
// request. The sidecar dev-server processes /api/* requests serially (Node
// single-threaded event loop + sequential POSTs from the customer flow), so a
// request-local subscriber over a serial-handler regime is safe.
//
// Diff-based capture: the Subscriber callback receives the FULL snapshot on
// every push (per notifySubscribers above), so we diff against the previous
// length to extract only the new tail rows. Even if two pushes happen between
// listener invocations (theoretically impossible single-threaded but defensive)
// the diff still picks both up.
//
// Acceptance (SF #2f wire contract):
//   - Every recordSuccess / recordFailure / recordCustom push during fn() is
//     captured in order.
//   - On fn() throw, captured rows are STILL attached (caller may inspect
//     them in a catch block). The current sidecar handler pattern doesn't
//     need this — devAgentMiddleware wraps in runAgentWithFailureSurface
//     which never throws — but the contract supports it for symmetry.
//   - Unsubscribe always fires (finally block).
// ---------------------------------------------------------------------------
export async function captureMetricsDuring<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; metrics: readonly QualityMetric[] }> {
  const captured: QualityMetric[] = [];
  let lastLength = metrics.length;
  const listener: Subscriber = (snapshot) => {
    // snapshot is frozen full-store; diff by length to extract new tail.
    if (snapshot.length > lastLength) {
      for (let i = lastLength; i < snapshot.length; i += 1) {
        captured.push(snapshot[i]);
      }
      lastLength = snapshot.length;
    }
  };
  subscribers.add(listener);
  try {
    const result = await fn();
    return { result, metrics: Object.freeze(captured.slice()) };
  } finally {
    subscribers.delete(listener);
  }
}

// ---------------------------------------------------------------------------
// Langfuse mirror sink — S4.5 OBSERVE-WIRE step 4
//
// Server boot (scripts/dev-agent-server.ts) calls registerLangfuseSink() once
// after initLangfuseTracerProvider. From that point every recordSuccess /
// recordFailure / recordCustom push also emits a Langfuse event carrying
// ONLY safe metadata (agent, status, latencyMs, tokenUsage counts, error
// reason, model deployment id, loggedAt) — never prompt content, never
// response text, never the OAuth token, never the service-key path.
//
// Sink is fire-and-forget: every Langfuse SDK throw is caught at the
// langfuseClient boundary; here we additionally guard against the subscribe
// path itself. The in-memory store + the F-18 Internal panel + the Vitest
// eval report are unchanged in shape — Langfuse is an additional sink, not
// a substitute (SUB-6 stays the system of record).
//
// Idempotent: calling registerLangfuseSink() a second time is a no-op (the
// subscriber Set dedupes the same function reference).
// ---------------------------------------------------------------------------

const langfuseMirrorSubscriber: Subscriber = (snapshot) => {
  // The latest push is always the tail entry — that's what we mirror.
  const tail = snapshot[snapshot.length - 1];
  if (!tail) return;
  recordQualityMetricEvent(tail);
};

let langfuseSinkRegistered = false;

export function registerLangfuseSink(): void {
  if (langfuseSinkRegistered) return;
  langfuseSinkRegistered = true;
  subscribers.add(langfuseMirrorSubscriber);
}

export function _unregisterLangfuseSinkForTests(): void {
  subscribers.delete(langfuseMirrorSubscriber);
  langfuseSinkRegistered = false;
}

// ---------------------------------------------------------------------------
// Test-only reset
// ---------------------------------------------------------------------------

export function _resetQualityMetricLogForTests(): void {
  metrics.length = 0;
  subscribers.clear();
  idCounter = 0;
  langfuseSinkRegistered = false;
}
