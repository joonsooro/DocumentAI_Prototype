/**
 * F-08 tests — agentFailureSurface (A5).
 *
 * Asserts:
 *   - surfaceAgentFailure emits BOTH a ClarificationRequest AND a QualityMetric (kill switch).
 *   - The metric is actually pushed into the F-18 store.
 *   - kind === 'agent_failure_surface' on the clarification; status === 'fail' on the metric.
 *   - operatorFacingError carries agent + reason + message.
 *   - 3 EDGE-1 prompts always present.
 *   - coerceToAgentFailure wraps plain Error / string / unknown into AgentFailure.
 *   - runAgentWithFailureSurface returns success on a clean call.
 *   - runAgentWithFailureSurface returns failure + both artifacts on a thrown call.
 *   - 5 fault-injection runs each produce both artifacts (kill-switch soak).
 *   - N4: failure path NEVER returns a canned/fake value.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  surfaceAgentFailure,
  coerceToAgentFailure,
  runAgentWithFailureSurface,
} from '@domain/agentFailureSurface';
import { AgentFailure } from '@runtime/aiCoreClient';
import {
  getMetrics,
  countMetrics,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';

beforeEach(() => {
  _resetQualityMetricLogForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('F-08 surfaceAgentFailure — atomic dual emission', () => {
  it('emits a ClarificationRequest with kind=agent_failure_surface and a fail QualityMetric', () => {
    const f = new AgentFailure({
      agent: 'compile',
      reason: 'malformed_json',
      message: 'response was plain text',
    });
    const { clarification, metric } = surfaceAgentFailure(f, {
      nowIso: '2026-05-25T00:00:00Z',
      documentRunId: 'run::abc',
    });

    expect(clarification.kind).toBe('agent_failure_surface');
    expect(clarification.documentRunId).toBe('run::abc');
    expect(clarification.field).toBeNull();
    expect(clarification.operatorFacingError).toContain('compile');
    expect(clarification.operatorFacingError).toContain('malformed_json');
    expect(clarification.operatorFacingError).toContain('response was plain text');
    expect(clarification.raisedAt).toBe('2026-05-25T00:00:00Z');

    expect(metric.status).toBe('fail');
    expect(metric.agent).toBe('compile');
    expect(metric.error).toContain('malformed_json');

    // F-18 store actually received the push (not just the returned value).
    expect(getMetrics().length).toBe(1);
    expect(countMetrics({ agent: 'compile', status: 'fail' })).toBe(1);
  });

  it('every emitted ClarificationRequest carries all 3 EDGE-1 prompts', () => {
    const f = new AgentFailure({ agent: 'capability', reason: 'oauth_failed', message: 'x' });
    const { clarification } = surfaceAgentFailure(f);
    expect(clarification.prompts.fieldMeaning.length).toBeGreaterThan(0);
    expect(clarification.prompts.postingReviewReportingImpact.length).toBeGreaterThan(0);
    expect(clarification.prompts.supplierScopeApplicability.length).toBeGreaterThan(0);
  });

  it('documentRunId defaults to null when not provided (pre-extraction failures)', () => {
    const f = new AgentFailure({ agent: 'compile', reason: 'http_error', message: '500' });
    const { clarification } = surfaceAgentFailure(f);
    expect(clarification.documentRunId).toBeNull();
  });

  it('cannot return without both artifacts — kill-switch invariant', () => {
    const f = new AgentFailure({ agent: 'x', reason: 'timeout', message: 'aborted' });
    const out = surfaceAgentFailure(f);
    // Both fields are present on the frozen result. Object is frozen.
    expect(out.clarification).toBeDefined();
    expect(out.metric).toBeDefined();
    expect(Object.isFrozen(out)).toBe(true);
  });
});

describe('F-08 coerceToAgentFailure — coercion of plain throws', () => {
  it('passes through an AgentFailure unchanged', () => {
    const f = new AgentFailure({ agent: 'a', reason: 'schema_validation_failed', message: 'x' });
    expect(coerceToAgentFailure(f, 'b')).toBe(f);
    // Agent on the original AgentFailure is preserved (we don't relabel).
    expect(coerceToAgentFailure(f, 'b').agent).toBe('a');
  });

  it('wraps a plain Error with reason=http_error', () => {
    const e = new Error('connection refused');
    const wrapped = coerceToAgentFailure(e, 'compile');
    expect(wrapped).toBeInstanceOf(AgentFailure);
    expect(wrapped.agent).toBe('compile');
    expect(wrapped.reason).toBe('http_error');
    expect(wrapped.message).toBe('connection refused');
  });

  it('wraps a thrown string', () => {
    const wrapped = coerceToAgentFailure('something broke', 'compile');
    expect(wrapped.message).toBe('something broke');
    expect(wrapped.reason).toBe('http_error');
  });

  it('wraps a thrown unknown value with a placeholder message', () => {
    const wrapped = coerceToAgentFailure({ weird: 'object' }, 'compile');
    expect(wrapped.message).toBe('unknown thrown value');
  });
});

describe('F-08 runAgentWithFailureSurface — higher-order wrapper', () => {
  it('returns kind=success with the value when the call resolves', async () => {
    const out = await runAgentWithFailureSurface('compile', async () => 42);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.value).toBe(42);
    }
    // No metric was appended (we did not surface anything).
    expect(getMetrics().length).toBe(0);
  });

  it('returns kind=failure with clarification + metric when the call throws an AgentFailure', async () => {
    const f = new AgentFailure({
      agent: 'compile',
      reason: 'schema_validation_failed',
      message: 'shape',
    });
    const out = await runAgentWithFailureSurface('compile', async () => {
      throw f;
    });
    expect(out.kind).toBe('failure');
    if (out.kind === 'failure') {
      expect(out.failure).toBe(f);
      expect(out.clarification.kind).toBe('agent_failure_surface');
      expect(out.metric.status).toBe('fail');
    }
    expect(getMetrics().length).toBe(1);
  });

  it('coerces a plain Error and still surfaces both artifacts', async () => {
    const out = await runAgentWithFailureSurface('capability', async () => {
      throw new Error('network down');
    });
    expect(out.kind).toBe('failure');
    if (out.kind === 'failure') {
      expect(out.failure.reason).toBe('http_error');
      expect(out.failure.message).toBe('network down');
      expect(out.metric.error).toContain('network down');
    }
  });

  it('NEVER returns a canned/fake success on failure (N4 / EDGE-2)', async () => {
    const out = await runAgentWithFailureSurface<number>('compile', async () => {
      throw new AgentFailure({ agent: 'compile', reason: 'empty_response', message: '' });
    });
    expect(out.kind).toBe('failure');
    // No `value` field on the failure branch — discriminated union prevents fake success.
    expect((out as { value?: unknown }).value).toBeUndefined();
  });
});

describe('F-08 — 5-run fault-injection soak (kill-switch invariant)', () => {
  it('every one of 5 simulated failures produces BOTH artifacts', async () => {
    const reasons = ['malformed_json', 'oauth_failed', 'http_error', 'timeout', 'empty_response'] as const;
    let clarifications = 0;
    for (const reason of reasons) {
      const out = await runAgentWithFailureSurface('compile', async () => {
        throw new AgentFailure({ agent: 'compile', reason, message: `simulated ${reason}` });
      });
      expect(out.kind).toBe('failure');
      if (out.kind === 'failure') {
        clarifications += 1;
        expect(out.clarification.kind).toBe('agent_failure_surface');
        expect(out.metric.status).toBe('fail');
      }
    }
    expect(clarifications).toBe(5);
    expect(countMetrics({ status: 'fail' })).toBe(5);
  });
});
