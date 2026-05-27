// @vitest-environment jsdom
/**
 * F-30 — AgentIoLogPanel unit tests (HAPPY-13 acceptance bindings).
 *
 * Covers:
 *   1. Mounts under data-testid='agent-io-log-panel'.
 *   2. Renders one row per metric, newest-first.
 *   3. row count === getMetrics().length across 3 sequential recordSuccess pushes.
 *   4. Every row's textContent enumerates the 9 fields verbatim.
 *   5. Failure rows include an AgentFailure.reason enum value.
 *   6. Full-DOM snapshot does NOT contain any of the 6 forbidden substrings.
 *   7. Re-renders on subscribe push.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { AgentIoLogPanel, AGENT_FAILURE_REASONS } from './AgentIoLogPanel';
import {
  _resetQualityMetricLogForTests,
  recordFailure,
  recordSuccess,
  getMetrics,
} from '@runtime/qualityMetricLog';
import { AgentFailure } from '@runtime/aiCoreClient';

const NINE_FIELD_TOKENS = [
  'agent:',
  'model:',
  'status:',
  'latency_ms:',
  'tokens_in:',
  'tokens_out:',
  'timestamp:',
  'input-shape:',
  'output-shape:',
];

const FORBIDDEN_LITERALS = [
  'system:',
  'prompt:',
  '<|',
  'AICORE_KEY_PATH',
  'clientsecret',
  'material disposal',
];

function pushSuccess(agent: string, nowIso: string) {
  return recordSuccess(
    {
      agent,
      source: 'aiCore',
      templateUsed: false,
      latency_ms: 200,
      token_usage: { input: 10, output: 5 },
      model: 'd-haiku',
      max_tokens: 1024,
      value: 'ok',
    },
    { nowIso },
  );
}

beforeEach(() => {
  _resetQualityMetricLogForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  _resetQualityMetricLogForTests();
  vi.restoreAllMocks();
});

describe('F-30 AgentIoLogPanel — mount + empty state', () => {
  it('mounts under data-testid="agent-io-log-panel"', () => {
    const { getByTestId } = render(<AgentIoLogPanel />);
    expect(getByTestId('agent-io-log-panel')).toBeTruthy();
  });

  it('renders an empty-state cue when the log is empty', () => {
    const { getByTestId, queryAllByTestId } = render(<AgentIoLogPanel />);
    expect(getByTestId('agent-io-log-empty')).toBeTruthy();
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(0);
  });
});

describe('F-30 AgentIoLogPanel — row count tracks getMetrics().length', () => {
  it('row count === getMetrics().length across 3 sequential recordSuccess pushes', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(0);
    expect(getMetrics().length).toBe(0);

    act(() => {
      pushSuccess('compile', '2026-05-27T00:00:01Z');
    });
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(1);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(getMetrics().length);

    act(() => {
      pushSuccess('capability', '2026-05-27T00:00:02Z');
    });
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(2);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(getMetrics().length);

    act(() => {
      pushSuccess('readiness', '2026-05-27T00:00:03Z');
    });
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(3);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(getMetrics().length);
  });

  it('rows are ordered newest-first', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    act(() => {
      pushSuccess('compile', '2026-05-27T00:00:01Z');
      pushSuccess('capability', '2026-05-27T00:00:02Z');
      pushSuccess('readiness', '2026-05-27T00:00:03Z');
    });
    const rows = queryAllByTestId(/^agent-io-log-row-\d+$/);
    expect(rows.length).toBe(3);
    // The first row in DOM order is the most recently pushed metric.
    expect(rows[0]?.textContent).toContain('agent: readiness');
    expect(rows[1]?.textContent).toContain('agent: capability');
    expect(rows[2]?.textContent).toContain('agent: compile');
  });
});

describe('F-30 AgentIoLogPanel — 9-field shape per row', () => {
  it('every row textContent enumerates all 9 fields verbatim', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    act(() => {
      pushSuccess('compile', '2026-05-27T00:00:01Z');
      pushSuccess('capability', '2026-05-27T00:00:02Z');
    });
    const rows = queryAllByTestId(/^agent-io-log-row-\d+$/);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const text = row.textContent ?? '';
      for (const field of NINE_FIELD_TOKENS) {
        expect(text).toContain(field);
      }
    }
  });
});

describe('F-30 AgentIoLogPanel — failure rows surface AgentFailureReason', () => {
  it('failure-row textContent includes one of the 9 AgentFailureReason enum values', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    act(() => {
      recordFailure(
        new AgentFailure({ agent: 'compile', reason: 'malformed_json', message: 'not json' }),
        { nowIso: '2026-05-27T00:00:04Z' },
      );
    });
    const rows = queryAllByTestId(/^agent-io-log-row-\d+$/);
    expect(rows.length).toBe(1);
    const text = rows[0]?.textContent ?? '';
    const matchedReason = AGENT_FAILURE_REASONS.find((r) => text.includes(r));
    expect(matchedReason).toBeDefined();
    expect(matchedReason).toBe('malformed_json');
  });

  it('each of the 9 AgentFailureReason enum values renders on a failure row', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    act(() => {
      for (const reason of AGENT_FAILURE_REASONS) {
        recordFailure(
          new AgentFailure({
            agent: 'compile',
            reason: reason as 'malformed_json',
            message: 'fixture',
          }),
          { nowIso: `2026-05-27T00:00:${reason.length.toString().padStart(2, '0')}Z` },
        );
      }
    });
    const rows = queryAllByTestId(/^agent-io-log-row-\d+$/);
    expect(rows.length).toBe(AGENT_FAILURE_REASONS.length);
    const joined = rows.map((r) => r.textContent ?? '').join(' ');
    for (const reason of AGENT_FAILURE_REASONS) {
      expect(joined).toContain(reason);
    }
  });
});

describe('F-30 AgentIoLogPanel — forbidden-substring guard', () => {
  it('full-DOM snapshot does NOT contain any of the 6 forbidden substrings (empty log)', () => {
    const { container } = render(<AgentIoLogPanel />);
    for (const bad of FORBIDDEN_LITERALS) {
      expect(container.textContent ?? '').not.toContain(bad);
    }
  });

  it('full-DOM snapshot does NOT contain any forbidden substrings after pushes', () => {
    const { container } = render(<AgentIoLogPanel />);
    act(() => {
      pushSuccess('compile', '2026-05-27T00:00:01Z');
      pushSuccess('capability', '2026-05-27T00:00:02Z');
      recordFailure(
        new AgentFailure({ agent: 'readiness', reason: 'http_error', message: 'boom' }),
        { nowIso: '2026-05-27T00:00:03Z' },
      );
    });
    for (const bad of FORBIDDEN_LITERALS) {
      expect(container.textContent ?? '').not.toContain(bad);
    }
  });
});

describe('F-30 AgentIoLogPanel — reactive subscribe', () => {
  it('re-renders when recordSuccess pushes after mount', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(0);
    act(() => {
      pushSuccess('compile', '2026-05-27T00:00:01Z');
    });
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(1);
  });

  it('re-renders when recordFailure pushes after mount', () => {
    const { queryAllByTestId } = render(<AgentIoLogPanel />);
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(0);
    act(() => {
      recordFailure(
        new AgentFailure({ agent: 'compile', reason: 'timeout', message: 'slow' }),
        { nowIso: '2026-05-27T00:00:05Z' },
      );
    });
    expect(queryAllByTestId(/^agent-io-log-row-\d+$/).length).toBe(1);
  });
});
