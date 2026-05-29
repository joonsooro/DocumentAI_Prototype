// @vitest-environment jsdom
/**
 * SF #2d — Session-survival integration test.
 *
 * The load-bearing test for SF #2d. Proves that the customer-session
 * store survives a CustomerRoute unmount → remount cycle (which is what
 * SPA navigation does under react-router-dom): when the operator
 * navigates away from /customer and comes back, the chat history,
 * compiled configuration, and extracted-fields panel must still be
 * populated, because the store retained the snapshot.
 *
 * Pattern reused from customer.chat-wiring.test.tsx (makeFetchMock +
 * vi.stubGlobal + render(<CustomerRoute />) + waitFor + cleanup).
 *
 * The remount path uses Testing Library's cleanup() then a second
 * render() — the second render mounts a fresh CustomerRoute component
 * with NO React state from the first mount, simulating exactly what
 * react-router-dom's <Routes> does on a route-change unmount/remount.
 * If the store wiring is correct, the second mount reads from
 * getCustomerSession() and re-displays the persisted snapshot.
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

describe('SF #2d — /customer session survives unmount → remount', () => {
  beforeEach(() => {
    cleanup();
    _resetCustomerSessionForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('chat history persists across an unmount → remount cycle', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [
          { kind: 'success', decision: { action: 'success_summary', summaryContent: 'All set.' } },
        ],
      }),
    );

    // First mount — submit a chat turn.
    const { unmount } = render(<CustomerRoute />);
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'thanks, looks good' } });
      fireEvent.click(submit);
    });

    // Wait until at least one user bubble and one assistant bubble are present.
    await waitFor(() => {
      const bubbles = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      const kinds = Array.from(bubbles).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('message');
      expect(kinds).toContain('success_summary');
    });
    const bubblesBefore = document.querySelectorAll('[data-testid^="chat-bubble-"]').length;
    expect(bubblesBefore).toBeGreaterThanOrEqual(2);

    // Unmount the route (simulates SPA nav away from /customer).
    unmount();
    expect(document.querySelector('[data-testid="customer-route"]')).toBeNull();

    // Re-mount (simulates SPA nav back to /customer).
    render(<CustomerRoute />);

    // The chat history must be repopulated from the store.
    await waitFor(() => {
      const bubblesAfter = document.querySelectorAll('[data-testid^="chat-bubble-"]');
      expect(bubblesAfter.length).toBe(bubblesBefore);
      const kinds = Array.from(bubblesAfter).map((b) => b.getAttribute('data-turn-kind'));
      expect(kinds).toContain('message');
      expect(kinds).toContain('success_summary');
    });
  });

  it('compiled configuration + extracted run + readiness verdict survive unmount → remount', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        '/api/compile': [{ kind: 'success', decision: COMPILE_DECISION }],
        '/api/capability': [capabilitySuccess],
        '/api/readiness': [readinessSuccess],
      }),
    );

    const { unmount } = render(<CustomerRoute />);
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'extract supplier and invoice number' } });
      fireEvent.click(submit);
    });

    // Wait for the compile flow to populate compiled-config + extracted + readiness panels.
    await waitFor(() => {
      expect(screen.getByTestId('customer-compiled-config-panel')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('customer-readiness-status')).toBeTruthy();
    });

    // Capture a load-bearing string from the configured-fields panel
    // (the live extractionSystemPrompt was generated by the agent stub).
    const configPanelTextBefore = screen.getByTestId('customer-compiled-config-panel').textContent ?? '';
    expect(configPanelTextBefore.length).toBeGreaterThan(0);
    const readinessStatusBefore = screen.getByTestId('customer-readiness-status').textContent ?? '';
    expect(readinessStatusBefore).toContain('Needs review');

    // Unmount → remount.
    unmount();
    render(<CustomerRoute />);

    // All three panels must be present and carry the same content.
    await waitFor(() => {
      expect(screen.getByTestId('customer-compiled-config-panel')).toBeTruthy();
      expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy();
      expect(screen.getByTestId('customer-readiness-status')).toBeTruthy();
    });
    expect(screen.getByTestId('customer-compiled-config-panel').textContent).toBe(configPanelTextBefore);
    expect(screen.getByTestId('customer-readiness-status').textContent).toBe(readinessStatusBefore);
    // Extracted-fields panel is populated (not in its empty state).
    expect(screen.queryByTestId('customer-extracted-fields-panel-empty')).toBeNull();
  });

  it('after _resetForTests the next mount renders the empty surface (reset hygiene)', () => {
    _resetCustomerSessionForTests();
    render(<CustomerRoute />);
    // No chat bubbles, no readiness status, no extracted-fields panel — pure empty state.
    expect(document.querySelectorAll('[data-testid^="chat-bubble-"]').length).toBe(0);
    expect(screen.queryByTestId('customer-readiness-status')).toBeNull();
    expect(screen.queryByTestId('customer-extracted-fields-panel')).toBeNull();
    expect(screen.getByTestId('customer-extracted-fields-panel-empty')).toBeTruthy();
  });
});
