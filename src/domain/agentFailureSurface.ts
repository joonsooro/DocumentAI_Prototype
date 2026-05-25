/**
 * F-08 — Agent-failure surface (A5).
 *
 * Contract pointer: U8. Whenever an agentic call in F-04/F-05/F-06/F-10/F-15
 * throws, F-08 routes the failure into TWO artifacts atomically:
 *   1. ClarificationRequest with kind='agent_failure_surface', carrying the
 *      operator-facing error string so the customer sees a question, not a
 *      crash.
 *   2. QualityMetric with status='fail', so the Internal Product
 *      Intelligence workspace (F-13) renders the failure on the telemetry
 *      panel.
 *
 * EDGE-2 / N4 invariant: NEVER substitute a canned fallback for the failed
 * agent call. The wrapper just throws the failure onward AFTER both
 * artifacts are emitted, so callers know the work didn't complete. Every
 * agentic call site that wants the F-08 routing wraps its callAgent
 * invocation in runAgentWithFailureSurface() instead of plain try/catch.
 *
 * Kill switch (15 min): if any failure path silently drops EITHER the
 * ClarificationRequest OR the QualityMetric across 5 fault-injection runs,
 * halt. Enforced by construction: surfaceAgentFailure() emits both before
 * returning. The runAgent wrapper calls surfaceAgentFailure() in its catch
 * block — there is no code path that bypasses one artifact.
 *
 * Coercion policy: F-08 accepts EITHER an AgentFailure (preferred — the
 * aiCoreClient's structured error) OR a plain Error / unknown throw, which
 * is coerced into an AgentFailure with reason='http_error' as a catch-all.
 * Tests cover both paths.
 */

import type {
  ClarificationPrompts,
  ClarificationRequest,
  QualityMetric,
} from '@domain/types';
import { AgentFailure } from '@runtime/aiCoreClient';
import { recordFailure } from '@runtime/qualityMetricLog';

// ---------------------------------------------------------------------------
// Prompts for the agent-failure surface
//
// These are operator-facing rather than customer-facing — F-13/F-11 will
// decide rendering. They use the SAME ClarificationPrompts shape so the
// downstream UI doesn't branch on kind.
// ---------------------------------------------------------------------------

function buildAgentFailurePrompts(failure: AgentFailure): ClarificationPrompts {
  return {
    fieldMeaning: `An automated step ("${failure.agent}") could not complete and returned: ${failure.reason}. What did you expect this step to produce?`,
    postingReviewReportingImpact: `While "${failure.agent}" is unavailable, should this document be held for review, blocked from posting, or excluded from reporting?`,
    supplierScopeApplicability: `Is "${failure.agent}" required for all suppliers and document types, or is it expected to be flaky for some of them?`,
  };
}

// ---------------------------------------------------------------------------
// Failure coercion — anything thrown becomes an AgentFailure
// ---------------------------------------------------------------------------

/**
 * Coerce any thrown value into a typed AgentFailure. Real AgentFailures are
 * returned as-is; everything else is wrapped with reason='http_error' (the
 * generic catch-all) so the surface emits a consistent shape regardless of
 * what blew up underneath.
 */
export function coerceToAgentFailure(err: unknown, agent: string): AgentFailure {
  if (err instanceof AgentFailure) return err;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'unknown thrown value';
  return new AgentFailure({
    agent,
    reason: 'http_error',
    message,
  });
}

// ---------------------------------------------------------------------------
// Public surface entry point
// ---------------------------------------------------------------------------

export interface SurfaceOptions {
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
  /** Optional documentRun association — null when the failure happened pre-extraction. */
  readonly documentRunId?: string | null;
}

export interface SurfacedFailure {
  readonly clarification: ClarificationRequest;
  readonly metric: QualityMetric;
}

/**
 * Convert an AgentFailure into BOTH a ClarificationRequest and a
 * QualityMetric. Both are emitted atomically: the metric is pushed to the
 * F-18 store, the ClarificationRequest is returned by reference.
 *
 * Acceptance: every simulated failure produces both artifacts. The function
 * cannot return without both — there is no early-return branch in between.
 */
export function surfaceAgentFailure(
  failure: AgentFailure,
  opts: SurfaceOptions = {},
): SurfacedFailure {
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const clarification: ClarificationRequest = {
    id: `clar::agentfail::${failure.agent}::${failure.reason}::${nowIso}`,
    kind: 'agent_failure_surface',
    field: null, // failure is at the agent level, not per-field
    documentRunId: opts.documentRunId ?? null,
    prompts: buildAgentFailurePrompts(failure),
    operatorFacingError: `${failure.agent} failed: ${failure.reason} — ${failure.message}`,
    raisedAt: nowIso,
  };

  // F-18 store push — recordFailure mirrors to console + notifies subscribers.
  const metric = recordFailure(failure, { nowIso });

  return Object.freeze({ clarification, metric });
}

// ---------------------------------------------------------------------------
// Higher-order wrapper for agent call sites
// ---------------------------------------------------------------------------

export interface RunAgentResult<T> {
  readonly kind: 'success';
  readonly value: T;
}

export interface RunAgentFailure {
  readonly kind: 'failure';
  readonly clarification: ClarificationRequest;
  readonly metric: QualityMetric;
  readonly failure: AgentFailure;
}

export type RunAgentOutcome<T> = RunAgentResult<T> | RunAgentFailure;

/**
 * Wrap any async agent invocation so failures auto-surface via F-08.
 * Returns a discriminated union: on success { kind: 'success', value };
 * on failure { kind: 'failure', clarification, metric, failure }.
 *
 * This is the recommended entry point for F-04/F-05/F-10/F-15 call sites
 * once F-08 is wired into them. It NEVER returns a fake/canned value (N4).
 */
export async function runAgentWithFailureSurface<T>(
  agent: string,
  fn: () => Promise<T>,
  opts: SurfaceOptions = {},
): Promise<RunAgentOutcome<T>> {
  try {
    const value = await fn();
    return { kind: 'success', value };
  } catch (err) {
    const failure = coerceToAgentFailure(err, agent);
    const { clarification, metric } = surfaceAgentFailure(failure, opts);
    return { kind: 'failure', clarification, metric, failure };
  }
}
