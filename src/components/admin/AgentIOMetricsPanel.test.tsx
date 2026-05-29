/**
 * @vitest-environment jsdom
 *
 * SF #2b — AgentIOMetricsPanel tests.
 *
 * Verifies the 5 session-aggregate metrics over the F-18 qualityMetricLog
 * stream, the subscriber lifecycle, the render-time redaction belt, and the
 * SF #2c readiness-composite shape (recordCustom row with tokenUsage=null
 * and a real latencyMs).
 *
 * Fixture injection goes through the real F-18 store API (recordSuccess /
 * recordFailure / recordCustom) — no module mocking. Each test resets the
 * store in beforeEach via the existing test-only helper.
 *
 * S5 SF #2e (2026-05-29): the dashboard enumerates 4 agents driven by the
 * customer flow (compile, capability, readiness, operationalReasons);
 * 'admin.recommend' is no longer enumerated.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AgentIOMetricsPanel } from './AgentIOMetricsPanel';
import {
  recordSuccess,
  recordFailure,
  recordCustom,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';
import { AgentFailure, type AgentFailureReason, type AgentResult } from '@runtime/aiCoreClient';

// ---------------------------------------------------------------------------
// Fixture helpers — build the AgentResult / AgentFailure shapes the store
// expects. The store only reads a handful of fields; the rest are filled in
// with stable test values so the round-trip is deterministic.
// ---------------------------------------------------------------------------

function buildSuccess(
  agent: string,
  opts: { latency_ms?: number; input?: number; output?: number } = {},
): AgentResult<unknown> {
  return {
    agent,
    source: 'aiCore',
    templateUsed: false,
    model: 'test-model',
    max_tokens: 100,
    latency_ms: opts.latency_ms ?? 100,
    token_usage: { input: opts.input ?? 10, output: opts.output ?? 20 },
    value: {},
  };
}

function buildFailure(
  agent: string,
  reason: AgentFailureReason,
  message: string,
): AgentFailure {
  return new AgentFailure({ agent, reason, message });
}

describe('SF #2b AgentIOMetricsPanel', () => {
  beforeEach(() => {
    _resetQualityMetricLogForTests();
  });

  afterEach(() => {
    cleanup();
  });

  // -------------------------------------------------------------------------
  // CASE 1 — empty state
  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('renders the outer panel and all 4 enumerated agent rows with count=0', () => {
      render(<AgentIOMetricsPanel />);
      expect(screen.getByTestId('agent-io-metrics-panel')).toBeTruthy();

      const agents = [
        'compile',
        'capability',
        'readiness',
        'operationalReasons',
      ];
      for (const a of agents) {
        const row = screen.getByTestId(`agent-io-metrics-row-${a}`);
        expect(row).toBeTruthy();
        // Empty rows show count "0", failure rate "—", latency "— / —"
        expect(row.textContent).toContain('0');
        expect(row.textContent).toContain('—');
      }
    });

    it('renders token total with Input/Output/Total all formatted as 0', () => {
      render(<AgentIOMetricsPanel />);
      const tokens = screen.getByTestId('agent-io-metrics-token-total');
      expect(tokens.textContent).toContain('Input');
      expect(tokens.textContent).toContain('Output');
      expect(tokens.textContent).toContain('Total');
      // No metrics pushed → grand total formatted is "0".
      expect(tokens.textContent).toMatch(/0/);
    });

    it('renders positive empty state for the failure histogram', () => {
      render(<AgentIOMetricsPanel />);
      expect(screen.getByText('No failures this session.')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // CASE 2 — mixed-metrics fixture
  // -------------------------------------------------------------------------
  describe('mixed-metrics fixture', () => {
    function seedMixed(): void {
      // 3 compile successes with non-null tokenUsage
      recordSuccess(buildSuccess('compile', { latency_ms: 100, input: 50, output: 100 }));
      recordSuccess(buildSuccess('compile', { latency_ms: 200, input: 60, output: 120 }));
      recordSuccess(buildSuccess('compile', { latency_ms: 300, input: 70, output: 140 }));

      // 1 capability failure
      recordFailure(buildFailure('capability', 'schema_validation_failed', 'malformed JSON'));

      // 2 operationalReasons successes (carry the real readiness-path tokens)
      recordSuccess(
        buildSuccess('operationalReasons', { latency_ms: 500, input: 200, output: 300 }),
      );
      recordSuccess(
        buildSuccess('operationalReasons', { latency_ms: 700, input: 220, output: 320 }),
      );

      // 2 readiness composite successes (recordCustom; tokenUsage NULL by SF #2c design)
      recordCustom({
        agent: 'readiness',
        status: 'success',
        latencyMs: 420,
        tokenUsage: null,
      });
      recordCustom({
        agent: 'readiness',
        status: 'success',
        latencyMs: 460,
        tokenUsage: null,
      });

    }

    it('Metric 1: calls tally counts each agent (readiness counted; 4-agent enumeration after SF #2e)', () => {
      seedMixed();
      render(<AgentIOMetricsPanel />);
      expect(screen.getByTestId('agent-io-metrics-row-compile').textContent).toContain('3');
      expect(screen.getByTestId('agent-io-metrics-row-capability').textContent).toContain('1');
      expect(screen.getByTestId('agent-io-metrics-row-readiness').textContent).toContain('2');
      expect(
        screen.getByTestId('agent-io-metrics-row-operationalReasons').textContent,
      ).toContain('2');
    });

    it('Metric 2: failure rate shows fraction + percentage (capability 1/1 100%)', () => {
      seedMixed();
      render(<AgentIOMetricsPanel />);
      expect(screen.getByTestId('agent-io-metrics-row-capability').textContent).toContain(
        '1/1 (100.0%)',
      );
      expect(screen.getByTestId('agent-io-metrics-row-compile').textContent).toContain(
        '0/3 (0.0%)',
      );
    });

    it('Metric 3: p50 latency rendered for compile, operationalReasons, readiness', () => {
      seedMixed();
      render(<AgentIOMetricsPanel />);
      // compile p50 = sorted[floor(0.5*3)] = sorted[1] = 200ms
      expect(screen.getByTestId('agent-io-metrics-row-compile').textContent).toContain('200ms');
      // operationalReasons p50 = sorted[1] = 700ms
      expect(
        screen.getByTestId('agent-io-metrics-row-operationalReasons').textContent,
      ).toContain('700ms');
      // readiness composite latencies are present (SF #2c contract)
      expect(screen.getByTestId('agent-io-metrics-row-readiness').textContent).toContain(
        '460ms',
      );
    });

    it('Metric 4: session token total sums ONLY non-null tokenUsage rows (readiness excluded)', () => {
      seedMixed();
      render(<AgentIOMetricsPanel />);
      const tokens = screen.getByTestId('agent-io-metrics-token-total');
      // compile: 50+60+70 = 180 input; 100+120+140 = 360 output
      // operationalReasons: 200+220 = 420 input; 300+320 = 620 output
      // capability failure: tokenUsage null (failures don't carry tokens) → skipped
      // readiness composites: tokenUsage null → skipped
      // Expected Input = 180+420 = 600; Output = 360+620 = 980; Total = 1580
      expect(tokens.textContent).toContain('600');
      expect(tokens.textContent).toContain('980');
      expect(tokens.textContent).toContain('1,580');
    });

    it('Metric 5: failure histogram shows schema_validation_failed × 1', () => {
      seedMixed();
      render(<AgentIOMetricsPanel />);
      // The error field is "<reason>: <message>", so the slug includes both parts.
      const row = screen.getByTestId(
        'agent-io-metrics-failure-schema_validation_failed__malformed_json',
      );
      expect(row.textContent).toContain('× 1');
      expect(row.textContent).toContain('schema_validation_failed');
    });
  });

  // -------------------------------------------------------------------------
  // CASE 3 — subscribe lifecycle (re-render on store push)
  // -------------------------------------------------------------------------
  describe('subscribe lifecycle', () => {
    it('re-renders when a new metric is pushed without explicit rerender()', () => {
      render(<AgentIOMetricsPanel />);
      // At mount the compile row count is 0.
      expect(screen.getByTestId('agent-io-metrics-row-compile').textContent).toContain('0');

      // Push a metric via the real store API; the subscriber fires
      // synchronously, but React state updates must be wrapped in act() so
      // the renderer flushes before our assertion.
      act(() => {
        recordSuccess(buildSuccess('compile', { latency_ms: 50, input: 1, output: 2 }));
      });

      expect(screen.getByTestId('agent-io-metrics-row-compile').textContent).toContain('1');
    });
  });

  // -------------------------------------------------------------------------
  // CASE 4 — render-time redaction belt
  // -------------------------------------------------------------------------
  describe('redaction belt', () => {
    it('does not render the literal "system:" substring even if the error contains it', () => {
      // Synthetic poisoned input — the upstream store should never surface
      // this, but the defensive belt has to hold.
      recordCustom({
        agent: 'capability',
        status: 'fail',
        latencyMs: null,
        tokenUsage: null,
        error: 'system: leaked prompt fragment here',
      });
      render(<AgentIOMetricsPanel />);
      const panel = screen.getByTestId('agent-io-metrics-panel');
      expect(panel.textContent).not.toContain('system:');
      expect(panel.textContent).toContain('[redacted]');
    });
  });

  // -------------------------------------------------------------------------
  // CASE 5 — readiness composite shape (SF #2c contract)
  // -------------------------------------------------------------------------
  describe('readiness composite shape', () => {
    it('counts the row in Metric 1, includes latency in Metric 3, and skips it from Metric 4', () => {
      recordCustom({
        agent: 'readiness',
        status: 'success',
        latencyMs: 420,
        tokenUsage: null,
      });
      render(<AgentIOMetricsPanel />);

      // Metric 1: counted.
      expect(screen.getByTestId('agent-io-metrics-row-readiness').textContent).toContain('1');
      // Metric 3: latency cell shows 420ms (not "—").
      const readinessRow = screen.getByTestId('agent-io-metrics-row-readiness');
      expect(readinessRow.textContent).toContain('420ms');
      // Metric 4: token total stays 0.
      const tokens = screen.getByTestId('agent-io-metrics-token-total');
      // No "1" / "2" digits should appear in the token totals — only zeros.
      // The Input/Output/Total values should each be "0".
      const numbers = (tokens.textContent ?? '').match(/\d+/g) ?? [];
      // All extracted numbers should be 0.
      for (const n of numbers) {
        expect(n).toBe('0');
      }
    });
  });
});
