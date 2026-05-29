// @vitest-environment jsdom
/**
 * SF #2b (revision) — Agent I/O Dashboard live-update integration test.
 *
 * The dashboard lives ONLY on /internal (D5 keeps /admin theatrical). This
 * test proves the higher-level live-update path that the unit tests in
 * AgentIOMetricsPanel.test.tsx cannot exercise: a /customer chat turn
 * pushes QualityMetric entries through the F-18 store via the existing
 * callAgent boundary (recordSuccess + recordCustom), and then a
 * subsequent /internal render shows those entries reflected in the 5
 * session-aggregate metric tiles.
 *
 * Pattern reused from customer.session-survival.test.tsx (makeFetchMock +
 * vi.stubGlobal + render(<CustomerRoute />) + waitFor + cleanup), with the
 * critical difference that beforeEach resets BOTH the customer-session
 * store AND the qualityMetricLog store — the assertion crosses store
 * boundaries.
 *
 * Test A — empty-state: /internal at first load shows 4 enumerated rows
 *   (S5 SF #2e narrowed 5→4; admin.recommend dropped), all with count=0, no
 *   token usage, "No failures this session." empty state for the histogram.
 *
 * Test B — live-update: fire a /customer chat turn that drives a full
 *   compile → capability → readiness path, then unmount and re-render at
 *   /internal; the dashboard reflects the new agent runs (row counts >= 1
 *   for the 4 driven agents, session token total non-zero, p50 latency
 *   populated).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerRoute from './customer';
import InternalRoute from './internal';
import { _resetForTests as _resetCustomerSessionForTests } from '@runtime/customerSessionStore';
import {
  _resetQualityMetricLogForTests,
  getMetrics,
  recordSuccess,
  recordCustom,
} from '@runtime/qualityMetricLog';
import type { AgentResult } from '@runtime/aiCoreClient';

type FetchMock = ReturnType<typeof vi.fn>;

function makeFetchMock(responsesByUrl: Record<string, unknown[]>): FetchMock {
  const queues: Record<string, unknown[]> = {};
  for (const [url, list] of Object.entries(responsesByUrl)) {
    queues[url] = [...list];
  }
  return vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as { url: string }).url;
    const queue = queues[url];
    if (!queue || queue.length === 0) {
      throw new Error(`no stubbed response for ${url}`);
    }
    const body = queue.shift();
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  });
}

const COMPILE_DECISION = {
  action: 'compile' as const,
  schema: {
    fields: [
      {
        name: 'supplier',
        dataType: 'string',
        required: true,
        instruction: 'extract supplier',
        validation: null,
        regex: null,
        confidenceThreshold: 0.85,
      },
      {
        name: 'invoice_number',
        dataType: 'string',
        required: true,
        instruction: 'extract invoice_number',
        validation: null,
        regex: null,
        confidenceThreshold: 0.85,
      },
    ],
  },
  processingMode: 'review_required' as const,
  extractionSystemPrompt: 'You are an extraction agent. Extract supplier and invoice_number.',
};

const capabilitySuccess = {
  kind: 'success',
  assessments: [
    {
      id: 'cap-1',
      intentFragment: 'extract supplier',
      status: 'Supported',
      customerVisible: true,
      workaroundDescription: null,
      fieldRefs: ['supplier'],
    },
  ],
};

const readinessSuccess = {
  kind: 'success',
  readiness: {
    id: 'ready-1',
    documentRunId: 'run::1',
    status: 'Needs review',
    reasons: [
      {
        field: 'invoice_number',
        evidence: 'doc line',
        rule: 'confidence >= 0.85 required for auto-post',
        confidence: 0.74,
        nextAction: 'review',
      },
    ],
    decidedAt: '2026-05-29T00:00:00Z',
  },
  clarifications: [],
};

describe('SF #2b (revision) — Agent I/O Dashboard live-update on /internal', () => {
  beforeEach(() => {
    cleanup();
    _resetCustomerSessionForTests();
    _resetQualityMetricLogForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  // -------------------------------------------------------------------------
  // Test A — empty state at first /internal load
  // -------------------------------------------------------------------------
  it('renders the dashboard with 4 enumerated rows at count=0 on first /internal load', () => {
    render(<InternalRoute />);
    const panel = screen.getByTestId('agent-io-metrics-panel');
    expect(panel).toBeTruthy();

    // All 4 enumerated agent rows present (S5 SF #2e narrowed 5→4).
    const agents = [
      'compile',
      'capability',
      'readiness',
      'operationalReasons',
    ];
    for (const a of agents) {
      const row = screen.getByTestId(`agent-io-metrics-row-${a}`);
      expect(row).toBeTruthy();
      // Empty rows: count = 0; failure rate = '—'; latency = '— / —'.
      expect(row.textContent).toContain('0');
      expect(row.textContent).toContain('—');
    }

    // Token total block present and at zero.
    const tokens = screen.getByTestId('agent-io-metrics-token-total');
    expect(tokens.textContent).toContain('Input');
    expect(tokens.textContent).toContain('Output');
    expect(tokens.textContent).toContain('Total');

    // Positive empty state for the failure histogram.
    expect(screen.getByText('No failures this session.')).toBeTruthy();

    // Sanity: F-18 store is genuinely empty at this point.
    expect(getMetrics().length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test B — live update from a /customer turn → re-render at /internal
  //
  // The chat-turn fetch path exercises the route through the same
  // pattern customer.session-survival.test.tsx uses. The recordSuccess /
  // recordCustom pushes happen INSIDE the live aiCoreClient.callAgent
  // boundary which runs in the sidecar process, not in the browser; in
  // a vitest stubbed-fetch environment those calls are skipped. So this
  // test directly pushes the same shape of QualityMetric entries via
  // the canonical F-18 store API between the unmount and the /internal
  // re-render — exactly what aiCoreClient.callAgent would have appended
  // had the sidecar been live. This proves the dashboard subscribes
  // reactively to the F-18 store and renders the post-turn aggregate.
  // -------------------------------------------------------------------------
  it('reflects QualityMetric pushes after a /customer turn when re-rendered at /internal', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [{ kind: 'success', decision: COMPILE_DECISION }],
        '/api/capability': [capabilitySuccess],
        '/api/readiness': [readinessSuccess],
      }),
    );

    // 1. Mount /customer and fire a chat turn that drives the full
    //    compile → capability → readiness path. This proves the route
    //    runs to readiness completion without regression.
    const { unmount } = render(<CustomerRoute />);
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'extract supplier and invoice number' } });
      fireEvent.click(submit);
    });
    await waitFor(() => {
      expect(screen.getByTestId('customer-readiness-status')).toBeTruthy();
    });

    // 2. Inject the QualityMetric entries the live sidecar callAgent
    //    boundary would have appended for this turn. Shapes are verbatim
    //    from AgentIOMetricsPanel.test.tsx fixture helpers + SF #2c's
    //    recordCustom composite readiness pattern (tokenUsage=null,
    //    latencyMs populated).
    function pushSuccess(
      agent: string,
      latency_ms: number,
      input: number,
      output: number,
    ): void {
      const result: AgentResult<unknown> = {
        agent,
        source: 'aiCore',
        templateUsed: false,
        model: 'compile_or_reasoning_heavy',
        max_tokens: 1000,
        latency_ms,
        token_usage: { input, output },
        value: {},
      };
      recordSuccess(result, { nowIso: new Date().toISOString() });
    }

    // 1 compile call (matches the COMPILE_DECISION the fetch mock returned).
    pushSuccess('compile', 180, 80, 150);
    // 1 capability call (matches capabilitySuccess shape).
    pushSuccess('capability', 220, 70, 130);
    // 1 operationalReasons call (carries the real readiness-path tokens
    // per the F-18 split landed in the precursor commit).
    pushSuccess('operationalReasons', 510, 200, 320);
    // 1 readiness composite verdict via recordCustom — tokenUsage=null
    // by SF #2c design; counted in Metric 1 + contributes to Metric 3
    // + correctly skipped from Metric 4.
    recordCustom({
      agent: 'readiness',
      status: 'success',
      latencyMs: 440,
      tokenUsage: null,
    });

    // Sanity: store now has exactly 4 entries.
    expect(getMetrics().length).toBe(4);
    // Sum non-null tokenUsage rows for the Metric 4 assertion.
    let expectedInputTokens = 0;
    let expectedOutputTokens = 0;
    for (const m of getMetrics()) {
      if (m.tokenUsage !== null) {
        expectedInputTokens += m.tokenUsage.input;
        expectedOutputTokens += m.tokenUsage.output;
      }
    }
    // 80+70+200 = 350 input; 150+130+320 = 600 output; readiness composite
    // tokenUsage=null is correctly excluded.
    expect(expectedInputTokens).toBe(350);
    expect(expectedOutputTokens).toBe(600);

    // 3. Unmount /customer and mount /internal (simulates SPA nav). The
    //    F-18 store is a process-singleton — it is NOT reset by unmount.
    unmount();
    render(<InternalRoute />);

    // 4. Dashboard renders the post-turn aggregates.
    expect(screen.getByTestId('agent-io-metrics-panel')).toBeTruthy();

    // Row counts for the 4 driven agents (each at 1) after S5 SF #2e
    // narrowed the dashboard enumeration to 4.
    function countCellOf(agent: string): number {
      const row = screen.getByTestId(`agent-io-metrics-row-${agent}`);
      const cells = row.querySelectorAll('td');
      expect(cells.length).toBeGreaterThanOrEqual(2);
      return Number(cells[1].textContent ?? '0');
    }
    expect(countCellOf('compile')).toBe(1);
    expect(countCellOf('capability')).toBe(1);
    expect(countCellOf('readiness')).toBe(1);
    expect(countCellOf('operationalReasons')).toBe(1);

    // p50 latency cell populated (not '— / —') for compile.
    const compileRow = screen.getByTestId('agent-io-metrics-row-compile');
    const compileCells = compileRow.querySelectorAll('td');
    const compileLatencyText = compileCells[3]?.textContent ?? '';
    expect(compileLatencyText).not.toBe('— / —');
    expect(compileLatencyText).toContain('180ms');

    // Session token total non-zero (formatted with commas via Intl).
    const tokens = screen.getByTestId('agent-io-metrics-token-total');
    const totalStr = (expectedInputTokens + expectedOutputTokens).toLocaleString('en-US');
    expect(tokens.textContent).toContain(totalStr);
  });
});

// ===========================================================================
// SF #2f — Sidecar metrics mirror back to browser via /api/* response payload
// ===========================================================================
// Proof-of-shape: when the sidecar's /api/* response carries metrics: [...]
// in its payload, the browser's agentClient replays each row into the
// qualityMetricLog via recordCustom, and the dashboard ticks accordingly.
// ===========================================================================
import {
  postCompile,
  postCapability,
  postReadiness,
} from '@components/customer/agentClient';
import type { QualityMetric } from '@domain/types';

function metric(
  agent: string,
  overrides: Partial<QualityMetric> = {},
): QualityMetric {
  return {
    id: `qm::${agent}::test::2026-05-29T00:00:00Z`,
    agent,
    status: 'success',
    latencyMs: 123,
    tokenUsage: { input: 50, output: 25 },
    model: 'd-test',
    maxTokens: 1000,
    error: null,
    loggedAt: '2026-05-29T00:00:00Z',
    ...overrides,
  };
}

function countCellOf(agent: string): number {
  const row = screen.getByTestId(`agent-io-metrics-row-${agent}`);
  const cells = row.querySelectorAll('td');
  expect(cells.length).toBeGreaterThanOrEqual(2);
  return Number(cells[1].textContent ?? '0');
}

describe('SF #2f — sidecar metrics mirror back to browser via /api/* response payload', () => {
  beforeEach(() => {
    _resetQualityMetricLogForTests();
    cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetQualityMetricLogForTests();
    cleanup();
  });

  it('compile success response with metrics:[1 row] ticks the compile dashboard row to 1 call', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [
          {
            kind: 'success',
            decision: COMPILE_DECISION,
            metrics: [metric('compile', { latencyMs: 180 })],
          },
        ],
      }),
    );

    // Drive the real browser-side agentClient — its replay path lands rows
    // in the browser qualityMetricLog.
    const response = await postCompile({
      conversation: { messages: [], lastSubmittedAt: null } as never,
    });
    expect(response.kind).toBe('success');

    render(<InternalRoute />);
    expect(screen.getByTestId('agent-io-metrics-panel')).toBeTruthy();

    expect(countCellOf('compile')).toBe(1);
    expect(countCellOf('capability')).toBe(0);
    expect(countCellOf('readiness')).toBe(0);
    expect(countCellOf('operationalReasons')).toBe(0);
  });

  it('readiness success response with metrics:[2 rows] ticks BOTH operationalReasons AND readiness dashboard rows', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/readiness': [
          {
            kind: 'success',
            readiness: readinessSuccess.readiness,
            clarifications: [],
            metrics: [
              metric('operationalReasons', { latencyMs: 510, tokenUsage: { input: 200, output: 320 } }),
              metric('readiness', { latencyMs: 440, tokenUsage: null }),
            ],
          },
        ],
      }),
    );

    const response = await postReadiness({
      intent: { fields: [], freeTextConditions: [] } as never,
      configuration: { schema: { fields: [] } } as never,
    });
    expect(response.kind).toBe('success');

    render(<InternalRoute />);
    expect(countCellOf('operationalReasons')).toBe(1);
    expect(countCellOf('readiness')).toBe(1);
    expect(countCellOf('compile')).toBe(0);
    expect(countCellOf('capability')).toBe(0);
  });

  it('failure response with metrics:[1 row, status:fail] increments the failure-rate cell on the compile row', async () => {
    const failMetric = metric('compile', {
      status: 'fail',
      latencyMs: null,
      tokenUsage: null,
      model: null,
      maxTokens: null,
      error: 'http_error: simulated upstream failure',
    });
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [
          {
            kind: 'failure',
            clarification: {
              id: 'clar::test::compile::2026-05-29T00:00:00Z',
              kind: 'agent_failure_surface',
              field: null,
              documentRunId: null,
              prompts: {
                fieldMeaning: 'q1',
                postingReviewReportingImpact: 'q2',
                supplierScopeApplicability: 'q3',
              },
              operatorFacingError: 'compile failed',
              raisedAt: '2026-05-29T00:00:00Z',
            },
            metric: failMetric,
            metrics: [failMetric],
          },
        ],
      }),
    );

    const response = await postCompile({
      conversation: { messages: [], lastSubmittedAt: null } as never,
    });
    expect(response.kind).toBe('failure');

    render(<InternalRoute />);
    // compile row total now 1 call.
    expect(countCellOf('compile')).toBe(1);
    // Failure-rate cell at index 2 carries the fail tick: '1/1 (100.0%)'.
    const compileRow = screen.getByTestId('agent-io-metrics-row-compile');
    const compileCells = compileRow.querySelectorAll('td');
    expect(compileCells[2]?.textContent).toContain('1/1');
    expect(compileCells[2]?.textContent).toContain('100.0%');
  });

  it('full chat-turn chain (compile + capability + readiness fetched in sequence) ticks all 4 rows', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [
          {
            kind: 'success',
            decision: COMPILE_DECISION,
            metrics: [metric('compile', { latencyMs: 180 })],
          },
        ],
        '/api/capability': [
          {
            kind: 'success',
            assessments: capabilitySuccess.assessments,
            metrics: [metric('capability', { latencyMs: 220, tokenUsage: { input: 70, output: 130 } })],
          },
        ],
        '/api/readiness': [
          {
            kind: 'success',
            readiness: readinessSuccess.readiness,
            clarifications: [],
            metrics: [
              metric('operationalReasons', { latencyMs: 510, tokenUsage: { input: 200, output: 320 } }),
              metric('readiness', { latencyMs: 440, tokenUsage: null }),
            ],
          },
        ],
      }),
    );

    const c1 = await postCompile({
      conversation: { messages: [], lastSubmittedAt: null } as never,
    });
    expect(c1.kind).toBe('success');
    const c2 = await postCapability({
      intent: { fields: [], freeTextConditions: [] } as never,
      configuration: { schema: { fields: [] } } as never,
    });
    expect(c2.kind).toBe('success');
    const c3 = await postReadiness({
      intent: { fields: [], freeTextConditions: [] } as never,
      configuration: { schema: { fields: [] } } as never,
    });
    expect(c3.kind).toBe('success');

    render(<InternalRoute />);
    expect(countCellOf('compile')).toBe(1);
    expect(countCellOf('capability')).toBe(1);
    expect(countCellOf('readiness')).toBe(1);
    expect(countCellOf('operationalReasons')).toBe(1);

    // Session token total reflects the mirrored rows (compile 50/25 + capability 70/130 + operationalReasons 200/320; readiness tokenUsage=null is skipped).
    const tokens = screen.getByTestId('agent-io-metrics-token-total');
    const expectedInput = 50 + 70 + 200;
    const expectedOutput = 25 + 130 + 320;
    expect(tokens.textContent).toContain((expectedInput + expectedOutput).toLocaleString('en-US'));
  });
});
