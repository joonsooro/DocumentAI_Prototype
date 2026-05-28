/**
 * F-27 — N9 signal-write guard.
 *
 * _writeProvisionalSignal(state, signalSeed) is the canonical entry
 * point for any code path that would land a provisional ProductSignal
 * from the chat layer. The function returns a discriminated union:
 *   { rejected: true; reason: string }   — guard tripped
 *   { rejected: false; signal: ProductSignal } — accepted
 *
 * Per A12-policy + A14 + N9 + RED-3, a provisional ProductSignal may
 * land ONLY when:
 *   (a) state.status === 'awaiting_notify_decision', AND
 *   (b) the LAST user turn's content matches /^\s*yes\b/i.
 *
 * Direct calls without that guard return { rejected: true } and the
 * caller MUST NOT push anything to the in-memory signal store (the
 * function itself does not touch the store — A6's _appendApprovedSignalForF09
 * is still the only writer; F-29 will own the conversational-signal
 * append site on top of the rejected/accepted result here).
 *
 * RED-3 is enforced at the DATA LAYER (this module), not just at the
 * chat UX layer — so even an attacker bypassing the F-27 ChatPanel
 * can't land a signal without the guard.
 */
import type {
  ConversationState,
  ProductSignal,
  ProductSignalProvenance,
  ProductSignalStatus,
} from '@domain/types';

export type WriteProvisionalSignalDecision =
  | { readonly rejected: true; readonly reason: string }
  | { readonly rejected: false; readonly signal: ProductSignal };

/**
 * Minimum information needed to materialise a provisional signal.
 * The customer route (F-31 / D6) builds this seed from the merged
 * Compile Agent's capability_class_question payload; F-27 / F-29
 * then call this guard before appending.
 */
export type ProvisionalSignalSeed = {
  readonly id: string;
  readonly signalType: ProductSignal['signalType'];
  readonly category: string;
  readonly intentFragment: string | null;
  readonly suggestedProductArea: string;
  readonly documentType: string;
  readonly supplier?: string | null;
  readonly country?: string | null;
  readonly customerCount?: number;
  readonly workaroundBurden?: ProductSignal['workaroundBurden'];
  readonly actionability?: ProductSignal['actionability'];
  readonly expectedStpLift?: number;
};

const YES_RE = /^\s*yes\b/i;

export function _writeProvisionalSignal(
  state: ConversationState,
  seed: ProvisionalSignalSeed,
): WriteProvisionalSignalDecision {
  if (state.status !== 'awaiting_notify_decision') {
    return Object.freeze({
      rejected: true,
      reason: `N9 guard tripped: ConversationState.status is '${state.status}', must be 'awaiting_notify_decision' for a provisional signal to land.`,
    });
  }
  const lastUserTurn = [...state.turns].reverse().find((t) => t.role === 'user');
  if (!lastUserTurn) {
    return Object.freeze({
      rejected: true,
      reason: 'N9 guard tripped: no user turn in conversation yet — explicit consent required.',
    });
  }
  if (!YES_RE.test(lastUserTurn.content)) {
    return Object.freeze({
      rejected: true,
      reason: `N9 guard tripped: last user turn does not match /^\\s*yes\\b/i — explicit consent required (got: ${JSON.stringify(lastUserTurn.content.slice(0, 64))}).`,
    });
  }

  const status: ProductSignalStatus = 'provisional';
  const provenance: ProductSignalProvenance = 'conversational_notify_team';

  const signal: ProductSignal = Object.freeze({
    id: seed.id,
    signalType: seed.signalType,
    category: seed.category,
    intentFragment: seed.intentFragment,
    suggestedProductArea: seed.suggestedProductArea,
    frequency: 1, // single conversational origin
    customerImpact: 'medium', // curated default for v1 (OQ-5)
    documentType: seed.documentType,
    supplier: seed.supplier ?? null,
    country: seed.country ?? null,
    sourceCorrectionIds: Object.freeze([] as readonly string[]),
    governanceApprovedAt: null, // provisional → null until F-29 governance second-stream promotes
    customerCount: seed.customerCount ?? 1,
    workaroundBurden: seed.workaroundBurden ?? 'medium',
    actionability: seed.actionability ?? 'medium',
    expectedStpLift: seed.expectedStpLift ?? 0,
    status,
    provenance,
  });

  return Object.freeze({ rejected: false, signal });
}
