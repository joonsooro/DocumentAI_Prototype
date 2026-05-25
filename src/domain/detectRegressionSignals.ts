/**
 * F-17 — Regression detector.
 *
 * Contract pointer: U15. Reads a partitioned view of QualityMetric history
 * (one cohort per prompt-version or model-version) and emits a
 * RegressionSignal whenever the field-accuracy / readiness-precision /
 * clarification-rate of one cohort drops materially below the previous
 * one.
 *
 * Why partitioned input (not raw QualityMetric[])?
 *   QualityMetric carries `model` but no explicit prompt-version field —
 *   prompt versions are managed by F-12's PromptVersion store. To keep
 *   F-17 decoupled from how versions are identified, callers hand the
 *   detector cohorts with an explicit { kind, id, metrics } shape. The
 *   detector compares adjacent cohorts pairwise.
 *
 * Spec invariants enforced here:
 *   - Returns ≥1 RegressionSignal when a synthetic regression cohort is
 *     fed.
 *   - Returns [] when the baseline cohort and the "next" cohort have the
 *     same (or higher) success rate. This is the kill-switch invariant:
 *     a no-change baseline must NEVER flag.
 *   - Threshold + min sample size are configurable (defaults pinned in
 *     code) so S4 OBSERVE can tune without touching the detector logic.
 *
 * Acceptance (per app/feature-list.json F-17):
 *   - Detector returns ≥1 signal when a synthetic regression fixture is fed.
 *   - Returns [] otherwise.
 *
 * Kill switch (15 min): if detector flags a no-change baseline in 2 of 3
 * runs, halt. Enforced by construction: a delta of zero (afterSuccessRate
 * === beforeSuccessRate) cannot exceed the strictly-positive drop
 * threshold; equality also fails the strict less-than check.
 *
 * Non-goals:
 *   - F-17 is NOT the alerting surface. It produces signals; F-13 renders
 *     them on the Internal Product Intelligence regression panel.
 *   - F-17 does NOT call AI Core. The agentic step (if any) is to ask the
 *     reasoning agent to explain a regression after it's detected — that
 *     is a future-version concern, not v1.
 */

import type { QualityMetric, RegressionSignal } from '@domain/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CohortKind = 'prompt_version' | 'model_version';

export interface MetricCohort {
  readonly kind: CohortKind;
  /** Stable identifier for this cohort: a prompt version id, a model name, etc. */
  readonly id: string;
  /** All QualityMetric entries collected while this cohort was active. */
  readonly metrics: readonly QualityMetric[];
}

export interface DetectOptions {
  /**
   * Minimum delta below which a drop is NOT a regression. Default 0.05 —
   * a five-percentage-point success-rate drop is the smallest signal F-17
   * emits. Below this is statistical noise on small samples.
   */
  readonly minDropDelta?: number;
  /**
   * Minimum sample size per cohort — fewer than this, the comparison is
   * skipped (the cohort lacks statistical weight to fire a signal).
   * Default 5.
   */
  readonly minSampleSize?: number;
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
}

// ---------------------------------------------------------------------------
// Cohort stats
// ---------------------------------------------------------------------------

interface CohortStats {
  readonly id: string;
  readonly kind: CohortKind;
  readonly sampleSize: number;
  readonly successRate: number; // 0..1
}

function successRate(metrics: readonly QualityMetric[]): number {
  if (metrics.length === 0) return 0;
  const success = metrics.filter((m) => m.status === 'success').length;
  return success / metrics.length;
}

function statsOf(c: MetricCohort): CohortStats {
  return {
    id: c.id,
    kind: c.kind,
    sampleSize: c.metrics.length,
    successRate: successRate(c.metrics),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Walk adjacent cohort pairs and emit a RegressionSignal whenever the
 * "after" cohort's success rate is STRICTLY less than the "before" cohort
 * by at least minDropDelta, provided both cohorts have at least
 * minSampleSize samples.
 *
 * Cohorts MUST be passed in chronological order — F-17 does NOT sort them;
 * the caller knows which version came first.
 *
 * Returns RegressionSignal[] keyed on the (boundary.fromId, boundary.toId)
 * pair. Each signal carries the field-accuracy metric (the canonical proxy
 * for "agent quality" v1; readiness-precision and clarification-rate are
 * v2 concerns) and the numeric delta.
 */
export function detectRegressionSignals(
  cohorts: readonly MetricCohort[],
  opts: DetectOptions = {},
): readonly RegressionSignal[] {
  const minDropDelta = opts.minDropDelta ?? 0.05;
  const minSampleSize = opts.minSampleSize ?? 5;
  const nowIso = opts.nowIso ?? new Date().toISOString();

  if (cohorts.length < 2) return [];

  const stats = cohorts.map(statsOf);
  const signals: RegressionSignal[] = [];

  for (let i = 1; i < stats.length; i += 1) {
    const before = stats[i - 1];
    const after = stats[i];

    // Mixed kinds are not comparable (e.g. a prompt-version boundary
    // immediately followed by a model swap). Skip — F-17 does not
    // synthesise cross-kind signals.
    if (before.kind !== after.kind) continue;

    if (before.sampleSize < minSampleSize || after.sampleSize < minSampleSize) continue;

    const delta = after.successRate - before.successRate;
    // Strict less-than: a no-change baseline (delta === 0) MUST NOT fire,
    // which is the kill-switch invariant.
    if (delta >= 0) continue;
    // Drop is statistically meaningful?
    if (Math.abs(delta) < minDropDelta) continue;

    signals.push({
      id: `reg::${before.kind}::${before.id}->${after.id}::${nowIso}`,
      metric: 'field_accuracy',
      field: null, // v1 aggregates across all fields; per-field rollups land in v2
      beforeValue: before.successRate,
      afterValue: after.successRate,
      delta,
      boundary: { kind: before.kind, fromId: before.id, toId: after.id },
      detectedAt: nowIso,
    });
  }

  return Object.freeze(signals);
}

// Re-exported for tests
export const _statsOfForTests = statsOf;
export const _successRateForTests = successRate;
