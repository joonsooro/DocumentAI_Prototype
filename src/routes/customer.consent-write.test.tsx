// @vitest-environment jsdom
/**
 * F-31 — Route-level consent-write integration test.
 *
 * Closes the Cycle 4 §6 step-7 regression gap. Cycle 2's S3 wired the
 * customer route's consent handler to call _writeProvisionalSignal
 * (the N9/RED-3 guard + signal-shaper) but discarded decision.signal —
 * the route never invoked _appendApprovedSignalForF09, so the chat
 * confirmation bubble fired correctly while the in-memory
 * productSignals array stayed empty. /internal had nothing to show.
 *
 * This was invisible from the test bar because:
 *   - Component tests (ChatPanel.test.tsx) don't render the route.
 *   - Chat-wiring tests (customer.chat-wiring.test.tsx) don't drive
 *     the consent click.
 *   - Live HAPPY-18 (src/evals/live.test.tsx) calls
 *     _appendApprovedSignalForF09 DIRECTLY after _writeProvisionalSignal
 *     (comment at line 562-564 acknowledges this is "via the existing
 *     escape hatch so the post-yes store-shape assertion mirrors what
 *     the customer route would do downstream" — the test author knew
 *     the route didn't do it).
 *
 * This file is the missing route → store integration layer:
 *   - Drive the "Yes" / "No" consent buttons through their real testids.
 *   - Observe getProductSignals() before and after.
 *   - Bind via testids + DOM strings per CLAUDE.md "bind evals to
 *     testids" tenet — no component traversal, no class-name lookups.
 *
 * Pattern reused from customer.chat-wiring.test.tsx (makeFetchMock,
 * vi.stubGlobal, the standard cleanup + unstubAllGlobals afterEach).
 * Store reset pattern reused from src/components/admin/ThresholdGovernancePanel.test.tsx
 * and src/evals/edge.test.tsx (_resetCorrectionStoreForTests in beforeEach).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerRoute from './customer';
import {
  _resetCorrectionStoreForTests,
  getProductSignals,
} from '@domain/submitCorrection';

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

// Stable compile-agent decision shape for a capability_class_question
// turn. Mirrors the shape in customer.chat-wiring.test.tsx (acceptance
// #3) so the route's branch under test is the same one the chat-wiring
// suite already exercises at the UX layer.
const S4HANA_DECISION = {
  action: 'capability_class_question' as const,
  confirmationQuestion:
    'Do you want to notify the SAP product team about S/4 HANA integration?',
  capabilityGapDescription:
    'Document AI extracts but does not write to S/4 HANA directly; integration requires middleware.',
  capabilitySurfaceCitation: 'Integration Surface, p. 198',
  pendingSignalDescription: 'integrate extracted invoice data with SAP S/4 HANA',
};

describe('F-31 — route consent-write integration (closes Cycle 2 S3 gap)', () => {
  beforeEach(() => {
    cleanup();
    // The productSignals array in src/domain/submitCorrection.ts is
    // module-level — it persists across tests in the same vitest run.
    // Reset it so each test starts at zero (the standard pattern from
    // edge.test.tsx / ThresholdGovernancePanel.test.tsx).
    _resetCorrectionStoreForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function driveCapabilityClassQuestionThenSettle(): Promise<void> {
    const textarea = screen.getByTestId(
      'customer-chat-panel-input',
    ) as HTMLTextAreaElement;
    const submit = screen.getByTestId(
      'customer-chat-panel-submit',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'can you link this to S/4 HANA?' },
      });
      fireEvent.click(submit);
    });
    // Wait for the capability_class_question branch to surface the
    // consent affordance — same pattern as chat-wiring acceptance #3.
    await waitFor(() => {
      expect(screen.getByTestId('customer-chat-consent-yes')).toBeTruthy();
      expect(screen.getByTestId('customer-chat-consent-no')).toBeTruthy();
    });
  }

  it("YES path — clicking the consent 'Yes' button appends ONE provisional ProductSignal with provenance='conversational_notify_team' AND fires the confirmation bubble AND transitions status to 'completed'", async () => {
    const fetchMock = makeFetchMock({
      '/api/compile': [{ kind: 'success', decision: S4HANA_DECISION }],
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(getProductSignals().length).toBe(0);

    render(<CustomerRoute />);
    await driveCapabilityClassQuestionThenSettle();

    // Click the Yes consent button — the SAME affordance the live demo
    // user clicks. Bound via testid per CLAUDE.md tenet, not via
    // component traversal.
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-chat-consent-yes'));
    });

    // Invariant (a) — confirmation bubble lands (UX path).
    await waitFor(() => {
      const bubbles = document.querySelectorAll(
        '[data-testid^="chat-bubble-"]',
      );
      const kinds = Array.from(bubbles).map((b) =>
        b.getAttribute('data-turn-kind'),
      );
      expect(kinds).toContain('notify_team_confirmation');
    });

    // Invariant (b) — conversation status transitions to 'completed'.
    await waitFor(() => {
      const status = screen.getByTestId('customer-chat-panel-status');
      expect(status.textContent).toBe('completed');
    });

    // Invariant (c) — the regression fence. The in-memory
    // productSignals store grew by EXACTLY ONE, and the appended
    // signal carries the conversational provenance + provisional status
    // that A6 / N9 / D6 require.
    const signals = getProductSignals();
    expect(signals.length).toBe(1);
    expect(signals[0].status).toBe('provisional');
    expect(signals[0].provenance).toBe('conversational_notify_team');
    expect(signals[0].signalType).toBe('unsupported_free_text_business_condition');
    expect(signals[0].intentFragment).toBe(S4HANA_DECISION.pendingSignalDescription);
    expect(signals[0].suggestedProductArea).toBe(
      S4HANA_DECISION.capabilitySurfaceCitation,
    );
  });

  it("NO path — clicking the consent 'No' button fires the no-thanks confirmation bubble AND writes ZERO signals to the store", async () => {
    const fetchMock = makeFetchMock({
      '/api/compile': [{ kind: 'success', decision: S4HANA_DECISION }],
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(getProductSignals().length).toBe(0);

    render(<CustomerRoute />);
    await driveCapabilityClassQuestionThenSettle();

    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-chat-consent-no'));
    });

    // A notify_team_confirmation bubble still lands on the No path
    // (the route emits a "No problem..." bubble) — but the store
    // MUST NOT grow.
    await waitFor(() => {
      const bubbles = document.querySelectorAll(
        '[data-testid^="chat-bubble-"]',
      );
      const kinds = Array.from(bubbles).map((b) =>
        b.getAttribute('data-turn-kind'),
      );
      expect(kinds).toContain('notify_team_confirmation');
    });

    // The regression fence on the negative path — No must never write.
    expect(getProductSignals().length).toBe(0);
  });
});
