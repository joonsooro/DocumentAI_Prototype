/**
 * F-18 tests — qualityMetricLog observability surface.
 *
 * Pure module — no fetch. Asserts:
 *   - record* APIs append exactly one entry per call.
 *   - Snapshot is frozen and decoupled from the underlying array.
 *   - Subscribers fire on push with a snapshot.
 *   - Subscriber unsubscribe stops further notifications.
 *   - Failure records carry status='fail' and an error string (no canned fallback / N4).
 *   - Reset clears entries, subscribers, and the id counter.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordSuccess,
  recordFailure,
  recordCustom,
  getMetrics,
  countMetrics,
  subscribe,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';
import { AgentFailure } from '@runtime/aiCoreClient';
import type { AgentResult } from '@runtime/aiCoreClient';

function fakeSuccess(agent = 'compile'): AgentResult<string> {
  return {
    agent,
    source: 'aiCore',
    templateUsed: false,
    latency_ms: 123,
    token_usage: { input: 10, output: 5 },
    model: 'd-deploy-haiku',
    max_tokens: 1024,
    value: 'ok',
  };
}

beforeEach(() => {
  _resetQualityMetricLogForTests();
  // Silence console mirror in tests so the output stays clean.
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('F-18 qualityMetricLog — append surface', () => {
  it('recordSuccess appends a success entry with full stamping', () => {
    const m = recordSuccess(fakeSuccess(), { nowIso: '2026-05-25T00:00:00Z' });
    expect(m.status).toBe('success');
    expect(m.agent).toBe('compile');
    expect(m.latencyMs).toBe(123);
    expect(m.tokenUsage).toEqual({ input: 10, output: 5 });
    expect(m.model).toBe('d-deploy-haiku');
    expect(m.maxTokens).toBe(1024);
    expect(m.error).toBeNull();
    expect(m.loggedAt).toBe('2026-05-25T00:00:00Z');
    expect(getMetrics().length).toBe(1);
  });

  it('recordFailure appends a fail entry carrying reason + message', () => {
    const f = new AgentFailure({
      agent: 'compile',
      reason: 'malformed_json',
      message: 'assistant text was not parseable',
    });
    const m = recordFailure(f, { nowIso: '2026-05-25T00:00:00Z' });
    expect(m.status).toBe('fail');
    expect(m.agent).toBe('compile');
    expect(m.error).toContain('malformed_json');
    expect(m.error).toContain('assistant text was not parseable');
    expect(m.latencyMs).toBeNull();
    expect(m.tokenUsage).toBeNull();
    expect(m.model).toBeNull();
    expect(m.maxTokens).toBeNull();
  });

  it('recordCustom accepts non-agent surfaces with a free-form error', () => {
    const m = recordCustom(
      { agent: 'extractor', status: 'fail', error: 'fixture missing for path' },
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(m.status).toBe('fail');
    expect(m.error).toBe('fixture missing for path');
  });

  it('every record* call appends exactly one entry — kill-switch invariant', () => {
    recordSuccess(fakeSuccess('a'));
    recordSuccess(fakeSuccess('b'));
    recordFailure(new AgentFailure({ agent: 'c', reason: 'http_error', message: '500' }));
    recordCustom({ agent: 'd', status: 'success' });
    expect(getMetrics().length).toBe(4);
    // No drops: count by agent matches push count.
    expect(countMetrics({ agent: 'a' })).toBe(1);
    expect(countMetrics({ agent: 'b' })).toBe(1);
    expect(countMetrics({ agent: 'c', status: 'fail' })).toBe(1);
    expect(countMetrics({ agent: 'd', status: 'success' })).toBe(1);
  });
});

describe('F-18 qualityMetricLog — read surface', () => {
  it('getMetrics returns a frozen snapshot that does not aliasing-mutate the store', () => {
    recordSuccess(fakeSuccess('a'));
    const snap = getMetrics();
    expect(Object.isFrozen(snap)).toBe(true);
    // Adding a new entry should NOT change the previous snapshot length.
    recordSuccess(fakeSuccess('b'));
    expect(snap.length).toBe(1);
    expect(getMetrics().length).toBe(2);
  });

  it('countMetrics filters by agent and status independently', () => {
    recordSuccess(fakeSuccess('compile'));
    recordSuccess(fakeSuccess('compile'));
    recordFailure(new AgentFailure({ agent: 'compile', reason: 'oauth_failed', message: 'x' }));
    recordSuccess(fakeSuccess('capability'));
    expect(countMetrics({ agent: 'compile' })).toBe(3);
    expect(countMetrics({ agent: 'compile', status: 'success' })).toBe(2);
    expect(countMetrics({ status: 'fail' })).toBe(1);
    expect(countMetrics()).toBe(4);
  });
});

describe('F-18 qualityMetricLog — subscription surface', () => {
  it('subscribers fire after every push with the latest snapshot', () => {
    const seen: number[] = [];
    subscribe((snap) => {
      seen.push(snap.length);
    });
    recordSuccess(fakeSuccess('a'));
    recordSuccess(fakeSuccess('b'));
    recordSuccess(fakeSuccess('c'));
    expect(seen).toEqual([1, 2, 3]);
  });

  it('unsubscribe stops further notifications', () => {
    const fn = vi.fn();
    const unsub = subscribe(fn);
    recordSuccess(fakeSuccess('a'));
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    recordSuccess(fakeSuccess('b'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not break the log push', () => {
    subscribe(() => {
      throw new Error('renderer blew up');
    });
    expect(() => recordSuccess(fakeSuccess('a'))).not.toThrow();
    expect(getMetrics().length).toBe(1);
  });
});

describe('F-18 qualityMetricLog — N4 invariant (no canned fallback)', () => {
  it('a failure path produces a QualityMetric instead of a fake success', () => {
    const f = new AgentFailure({
      agent: 'capability',
      reason: 'schema_validation_failed',
      message: 'shape',
    });
    const m = recordFailure(f);
    expect(m.status).toBe('fail');
    expect(m.error).toMatch(/schema_validation_failed/);
    // No success entry should sneak in alongside.
    expect(countMetrics({ agent: 'capability', status: 'success' })).toBe(0);
  });
});

describe('F-18 qualityMetricLog — test reset hook', () => {
  it('_resetQualityMetricLogForTests clears entries and the id counter', () => {
    const a = recordSuccess(fakeSuccess('x'), { nowIso: 'T1' });
    _resetQualityMetricLogForTests();
    const b = recordSuccess(fakeSuccess('x'), { nowIso: 'T1' });
    // After reset the id counter restarts, so the same inputs produce the same id.
    expect(a.id).toBe(b.id);
    expect(getMetrics().length).toBe(1);
  });
});
