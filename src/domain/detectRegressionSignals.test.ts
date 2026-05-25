/**
 * F-17 tests — detectRegressionSignals.
 *
 * Pure module — no fetch. Asserts:
 *   - Synthetic regression fixture emits ≥1 RegressionSignal (acceptance).
 *   - No-change baseline emits [] (kill-switch invariant).
 *   - Drop below minDropDelta does not fire (statistical-noise guard).
 *   - Sample size below minSampleSize is skipped.
 *   - Mixed-kind cohort boundaries are skipped (no cross-kind signals).
 *   - 3-cohort sequence emits a signal for each regressive boundary.
 *   - Improvement (positive delta) NEVER fires.
 *   - 3-run soak on the no-change baseline (kill switch invariant proven empirically).
 *   - Stats helper computes successRate over an empty array as 0.
 */
import { describe, it, expect } from 'vitest';
import {
  detectRegressionSignals,
  _statsOfForTests,
  _successRateForTests,
  type MetricCohort,
} from '@domain/detectRegressionSignals';
import type { QualityMetric } from '@domain/types';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function metric(agent: string, status: 'success' | 'fail', n: number): QualityMetric {
  return {
    id: `qm::${agent}::${n}`,
    agent,
    status,
    latencyMs: 100,
    tokenUsage: null,
    model: null,
    maxTokens: 1024,
    error: status === 'fail' ? 'simulated' : null,
    loggedAt: '2026-05-25T00:00:00Z',
  };
}

function cohort(
  kind: 'prompt_version' | 'model_version',
  id: string,
  successes: number,
  failures: number,
): MetricCohort {
  const metrics: QualityMetric[] = [];
  for (let i = 0; i < successes; i += 1) metrics.push(metric(id, 'success', i));
  for (let j = 0; j < failures; j += 1) metrics.push(metric(id, 'fail', successes + j));
  return { kind, id, metrics };
}

// ---------------------------------------------------------------------------
// Stats helpers — small surface, exhaustive
// ---------------------------------------------------------------------------

describe('F-17 stats helpers', () => {
  it('successRate over empty array is 0', () => {
    expect(_successRateForTests([])).toBe(0);
  });

  it('successRate is success / total', () => {
    expect(_successRateForTests([metric('a', 'success', 0), metric('a', 'fail', 1)])).toBe(0.5);
  });

  it('statsOf reports sampleSize and successRate', () => {
    const c = cohort('prompt_version', 'v1', 8, 2);
    const s = _statsOfForTests(c);
    expect(s.sampleSize).toBe(10);
    expect(s.successRate).toBeCloseTo(0.8, 5);
  });
});

// ---------------------------------------------------------------------------
// Acceptance — synthetic regression fixture emits ≥1 signal
// ---------------------------------------------------------------------------

describe('F-17 acceptance — synthetic regression fixture', () => {
  it('emits ≥1 RegressionSignal when success rate drops materially', () => {
    // v1: 9 success / 1 fail = 0.9; v2: 5 success / 5 fail = 0.5; delta = -0.4
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 9, 1),
      cohort('prompt_version', 'v2', 5, 5),
    ];
    const out = detectRegressionSignals(cohorts, { nowIso: '2026-05-25T00:00:00Z' });
    expect(out.length).toBeGreaterThanOrEqual(1);
    const sig = out[0];
    expect(sig.metric).toBe('field_accuracy');
    expect(sig.boundary.kind).toBe('prompt_version');
    expect(sig.boundary.fromId).toBe('v1');
    expect(sig.boundary.toId).toBe('v2');
    expect(sig.delta).toBeLessThan(0);
    expect(sig.delta).toBeCloseTo(-0.4, 5);
    expect(sig.beforeValue).toBeCloseTo(0.9, 5);
    expect(sig.afterValue).toBeCloseTo(0.5, 5);
  });

  it('emits a signal at the model-version boundary too', () => {
    const cohorts: MetricCohort[] = [
      cohort('model_version', 'd-haiku-old', 10, 0),
      cohort('model_version', 'd-haiku-new', 3, 7),
    ];
    const out = detectRegressionSignals(cohorts);
    expect(out.length).toBe(1);
    expect(out[0].boundary.kind).toBe('model_version');
  });
});

// ---------------------------------------------------------------------------
// Kill-switch invariant — no-change baseline must NEVER fire
// ---------------------------------------------------------------------------

describe('F-17 kill switch — no-change baseline emits []', () => {
  it('identical success rates emit no signal', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 8, 2), // 0.8
      cohort('prompt_version', 'v2', 8, 2), // 0.8
    ];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });

  it('improvement (positive delta) emits no signal', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 5, 5), // 0.5
      cohort('prompt_version', 'v2', 9, 1), // 0.9
    ];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });

  it('3-run soak: no-change baseline fed 3 times in a row never flags', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 8, 2),
      cohort('prompt_version', 'v2', 8, 2),
    ];
    for (let i = 0; i < 3; i += 1) {
      expect(detectRegressionSignals(cohorts).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Statistical-noise guard — drop below minDropDelta does not fire
// ---------------------------------------------------------------------------

describe('F-17 statistical-noise guard', () => {
  it('a 2-point drop (under the default 5-point threshold) emits no signal', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 80, 20), // 0.80
      cohort('prompt_version', 'v2', 78, 22), // 0.78 — drop of 0.02
    ];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });

  it('a tightened threshold lets a 2-point drop through', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 80, 20),
      cohort('prompt_version', 'v2', 78, 22),
    ];
    const out = detectRegressionSignals(cohorts, { minDropDelta: 0.01 });
    expect(out.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sample-size guard
// ---------------------------------------------------------------------------

describe('F-17 sample-size guard', () => {
  it('cohorts below the min sample size are skipped', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 2, 0), // sample size 2 — too small at default 5
      cohort('prompt_version', 'v2', 0, 5),
    ];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });

  it('lowering min sample size makes the same data trigger a signal', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 2, 0),
      cohort('prompt_version', 'v2', 0, 5),
    ];
    const out = detectRegressionSignals(cohorts, { minSampleSize: 2 });
    expect(out.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed-kind boundaries
// ---------------------------------------------------------------------------

describe('F-17 mixed-kind boundaries', () => {
  it('a prompt-version cohort followed by a model-version cohort is skipped (no cross-kind signal)', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 10, 0),
      cohort('model_version', 'm1', 0, 10),
    ];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multi-boundary sequence
// ---------------------------------------------------------------------------

describe('F-17 multi-boundary sequence', () => {
  it('emits one signal per regressive boundary in a 3-cohort sequence', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 10, 0), // 1.0
      cohort('prompt_version', 'v2', 7, 3), // 0.7  — regression vs v1
      cohort('prompt_version', 'v3', 2, 8), // 0.2  — regression vs v2
    ];
    const out = detectRegressionSignals(cohorts, { nowIso: '2026-05-25T00:00:00Z' });
    expect(out.length).toBe(2);
    expect(out[0].boundary.fromId).toBe('v1');
    expect(out[0].boundary.toId).toBe('v2');
    expect(out[1].boundary.fromId).toBe('v2');
    expect(out[1].boundary.toId).toBe('v3');
  });

  it('a recovery in the middle is not flagged retroactively', () => {
    const cohorts: MetricCohort[] = [
      cohort('prompt_version', 'v1', 10, 0), // 1.0
      cohort('prompt_version', 'v2', 4, 6), // 0.4 — regression vs v1
      cohort('prompt_version', 'v3', 9, 1), // 0.9 — recovery, positive delta
    ];
    const out = detectRegressionSignals(cohorts);
    expect(out.length).toBe(1);
    expect(out[0].boundary.toId).toBe('v2');
  });
});

// ---------------------------------------------------------------------------
// Degenerate inputs
// ---------------------------------------------------------------------------

describe('F-17 degenerate inputs', () => {
  it('a single cohort emits no signals (nothing to compare)', () => {
    const cohorts: MetricCohort[] = [cohort('prompt_version', 'v1', 10, 0)];
    expect(detectRegressionSignals(cohorts)).toEqual([]);
  });

  it('an empty cohort list emits no signals', () => {
    expect(detectRegressionSignals([])).toEqual([]);
  });
});
