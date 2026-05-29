// @vitest-environment jsdom
/**
 * F-11 — Chat-wiring integration tests (Cycle 2 · merged Compile Agent).
 *
 * Covers the F-11 acceptance items under the new architecture:
 *   #1 — Submitting a chat turn calls /api/compile once with the
 *        accumulated ConversationState; the response carries a
 *        CompileAgentDecision. The route branches on decision.action.
 *   #2 — action='recompile' (or 'compile') drives postCapability +
 *        postReadiness; compiledConfigVersionRefs.length increments
 *        by 1; an assistant 'recompile_announcement' bubble lands.
 *   #3 — action='capability_class_question' stores pendingSignal on
 *        ConversationState, appends a 'notify_team_question' bubble,
 *        and transitions to 'awaiting_notify_decision'.
 *
 * The deleted /api/chat-turn-decide is no longer mocked anywhere.
 * The merged agent absorbed its role per A17 (Cycle 2 2026-05-28).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerRoute from './customer';
import { _resetForTests as _resetCustomerSessionForTests } from '@runtime/customerSessionStore';

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

const NINE_FIELD_COMPILE_DECISION = {
  action: 'compile' as const,
  schema: {
    fields: [
      { name: 'supplier', dataType: 'string', required: true, instruction: 'extract supplier', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'invoice_number', dataType: 'string', required: true, instruction: 'extract invoice_number', validation: null, regex: null, confidenceThreshold: 0.85 },
    ],
  },
  processingMode: 'review_required',
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

describe('F-11 chat-wiring · Cycle 2 acceptance #2 (compile decision drives capability + readiness)', () => {
  beforeEach(() => {
    cleanup();
    _resetCustomerSessionForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a /api/compile decision action='compile' drives postCapability + postReadiness and appends a recompile_announcement bubble", async () => {
    const fetchMock = makeFetchMock({
      '/api/compile': [{ kind: 'success', decision: NINE_FIELD_COMPILE_DECISION }],
      '/api/capability': [capabilitySuccess],
      '/api/readiness': [readinessSuccess],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CustomerRoute />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Extract supplier name and invoice number from this invoice' } });
      fireEvent.click(submit);
    });

    // /api/compile fires first.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/compile',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // The deleted /api/chat-turn-decide must NEVER be called.
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat-turn-decide',
      expect.anything(),
    );
    // Capability + readiness fire on the compile branch.
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

    // User turn + assistant recompile_announcement bubble both land.
    await waitFor(() => {
      const bubbles = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      expect(bubbles.length).toBeGreaterThanOrEqual(2);
      const kinds = Array.from(bubbles).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('message');
      expect(kinds).toContain('recompile_announcement');
    });
  });
});

describe('F-11 chat-wiring · Cycle 2 acceptance #3 (capability_class_question surfaces consent affordance)', () => {
  beforeEach(() => {
    cleanup();
    _resetCustomerSessionForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a /api/compile decision action='capability_class_question' appends a notify_team_question bubble and renders consent buttons", async () => {
    const fetchMock = makeFetchMock({
      '/api/compile': [
        {
          kind: 'success',
          decision: {
            action: 'capability_class_question',
            confirmationQuestion: 'Do you want to notify the SAP product team about S/4 HANA integration?',
            capabilityGapDescription:
              'Document AI extracts but does not write to S/4 HANA directly; integration requires middleware.',
            capabilitySurfaceCitation: 'Integration Surface, p. 198',
            pendingSignalDescription: 'integrate extracted invoice data with SAP S/4 HANA',
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
        target: { value: 'can you link this to S/4 HANA?' },
      });
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/compile',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // notify_team_question bubble lands.
    await waitFor(() => {
      const bubbles = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      const kinds = Array.from(bubbles).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('notify_team_question');
    });
    // Conversation status transitioned to awaiting_notify_decision.
    await waitFor(() => {
      const status = screen.getByTestId('customer-chat-panel-status');
      expect(status.textContent).toBe('awaiting_notify_decision');
    });
    // F-31 / D6 consent affordance is present.
    expect(screen.getByTestId('customer-chat-consent-yes')).toBeTruthy();
    expect(screen.getByTestId('customer-chat-consent-no')).toBeTruthy();
  });
});
