/**
 * Cycle 2 (2026-05-28) — Dev-only agent trace log.
 *
 * Captures the FULL system prompt, user prompt, and raw response for
 * every callAgent invocation BEFORE the production redaction layer
 * strips them. Renders in a dev-only panel under /admin (mounted only
 * when import.meta.env.DEV is true; statically tree-shaken from
 * production bundles).
 *
 * This module is the dev-time mirror of the redacted production
 * stream — it does NOT replace src/runtime/qualityMetricLog.ts (which
 * still owns the redacted F-18 surface that Langfuse mirrors and that
 * the F-30 Agent I/O Log reads from). The two paths coexist:
 *
 *   - callAgent → recordSuccess/recordFailure → qualityMetricLog
 *     (REDACTED — N3 / N8 still bind; production-safe; Langfuse-bound)
 *   - callAgent → (DEV only) recordDevTrace → devTraceLog
 *     (UNREDACTED — local dev only; never shipped; gated on
 *     import.meta.env.DEV at every call site)
 *
 * The production redaction layer in src/domain/redactAgentPayload.ts
 * is unchanged. Customer-surface views never read from this store —
 * the DevTracePanel mounts only on /admin behind an env.DEV gate.
 */

export interface DevTraceEntry {
  readonly agent: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly rawResponse: string;
  readonly latencyMs: number | null;
  readonly status: 'success' | 'fail';
  readonly errorMessage: string | null;
  readonly timestamp: string;
}

type Listener = () => void;

const entries: DevTraceEntry[] = [];
const listeners = new Set<Listener>();

/**
 * Append a dev trace entry. Callers MUST wrap this invocation in an
 * `if (import.meta.env.DEV) { ... }` block so production builds
 * tree-shake the dev path away. The runtime guard inside this
 * function is a belt-and-braces fallback — if a caller forgets the
 * gate, the entry is silently dropped in production.
 */
export function recordDevTrace(entry: Omit<DevTraceEntry, 'timestamp'> & { timestamp?: string }): void {
  if (!isDev()) return;
  const stamped: DevTraceEntry = Object.freeze({
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });
  entries.push(stamped);
  for (const l of listeners) l();
}

export function getDevTraces(): readonly DevTraceEntry[] {
  return entries.slice().reverse(); // newest first
}

export function subscribeDevTraces(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function _resetDevTraceLogForTests(): void {
  entries.length = 0;
  listeners.clear();
}

/**
 * Best-effort check for Vite's dev-mode flag. `import.meta.env.DEV` is
 * statically resolvable by Vite's tree-shaker, so a guard wrapped
 * around the call site collapses to nothing in production. This
 * function returns true under jsdom / vitest / dev as a runtime
 * fallback when callers omit the gate.
 */
function isDev(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = import.meta as any;
    if (m?.env?.DEV === true) return true;
    if (m?.env?.PROD === true) return false;
  } catch {
    // ignore — import.meta may be unavailable in some contexts
  }
  // Default to true for unknown contexts (tests run in dev-like mode).
  return true;
}
