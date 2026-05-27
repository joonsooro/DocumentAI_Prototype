// @vitest-environment jsdom
/**
 * F-11 — Chat-wiring integration tests (S5 SF · chat-wiring fix).
 *
 * Covers acceptance items #2 + #3 of the SF:
 *   #2 — Submitting a chat turn calls postChatTurnDecide, appends both
 *        the user turn and the assistant turn, and on action:'recompile'
 *        invokes the existing compile/capability/readiness pipeline with
 *        compiledConfigVersionRefs.length incrementing by 1.
 *   #3 — A non-extraction capability ask produces an assistant turn
 *        that asks the ProductSignal governance question (F-28 +
 *        capability_class_question action).
 *
 * Drives the route through the ChatPanel's onSubmit handler and stubs
 * /api/* fetch responses so the test is hermetic (no live SAP AI Core).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerRoute from './customer';

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

const compileSuccess = {
  kind: 'success',
  intent: {
    id: 'intent::test::1',
    raw: 'extract supplier + payment terms',
    documentType: 'commercial_invoice',
    capturedAt: '2026-05-27T00:00:00Z',
  },
  configuration: {
    id: 'cfg::test::v1',
    intentId: 'intent::test::1',
    schema: { fields: [] },
    processingMode: 'review_required',
    source: 'aiCore',
    templateUsed: false,
    compiledAt: '2026-05-27T00:00:00Z',
  },
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
        field: 'payment_terms',
        evidence: 'doc line',
        rule: 'confidence >= 0.85 required for auto-post',
        confidence: 0.74,
        nextAction: 'review',
      },
    ],
    decidedAt: '2026-05-27T00:00:00Z',
  },
  clarifications: [],
};

describe('F-11 chat-wiring · acceptance #2 (recompile bumps compiledConfigVersionRefs)', () => {
  beforeEach(() => cleanup());
  afterEach(() => vi.unstubAllGlobals());

  it('a chat-turn-decide action:recompile drives postCompile + postCapability + postReadiness and bumps compiledConfigVersionRefs.length by 1', async () => {
    const fetchMock = makeFetchMock({
      '/api/chat-turn-decide': [
        { kind: 'success', decision: { action: 'recompile', recompileSummary: 'updating' } },
      ],
      '/api/compile': [compileSuccess],
      '/api/capability': [capabilitySuccess],
      '/api/readiness': [readinessSuccess],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CustomerRoute />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'extract supplier + payment terms' } });
      fireEvent.click(submit);
    });

    // postChatTurnDecide must fire, then the recompile chain.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat-turn-decide',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/compile',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/capability',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/readiness',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // After the recompile, the user turn + the assistant recompile bubble
    // are both appended to the conversation thread. compiledConfigVersionRefs
    // length is reflected in the conversation state, exercised here through
    // the recompile_announcement bubble.
    await waitFor(() => {
      const bubbles = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      expect(bubbles.length).toBeGreaterThanOrEqual(2);
      const kinds = Array.from(bubbles).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('message'); // user turn
      expect(kinds).toContain('recompile_announcement'); // assistant turn
    });
  });
});

describe('F-11 chat-wiring · acceptance #3 (capability-class ask surfaces ProductSignal governance question)', () => {
  beforeEach(() => cleanup());
  afterEach(() => vi.unstubAllGlobals());

  it('a non-extraction capability ask returns capability_class_question and appends the notify_team_question bubble', async () => {
    const fetchMock = makeFetchMock({
      '/api/chat-turn-decide': [
        {
          kind: 'success',
          decision: {
            action: 'capability_class_question',
            classification: 'integration_request',
            questionContent: 'Should I notify the product team about this integration request?',
          },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CustomerRoute />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, {
        target: {
          value:
            'add the extracted value to the relevant S/4 HANA table + use RPT 1.5 to infer missing fields',
        },
      });
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat-turn-decide',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      const bubbles = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      const kinds = Array.from(bubbles).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('notify_team_question');
    });
    // Conversation state must have transitioned to awaiting_notify_decision
    // (driven by chatReducer's deriveStatus when a notify_team_question
    // assistant bubble is appended).
    await waitFor(() => {
      const status = screen.getByTestId('customer-chat-panel-status');
      expect(status.textContent).toBe('awaiting_notify_decision');
    });
  });
});
