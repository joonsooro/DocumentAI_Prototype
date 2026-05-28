/**
 * F-27 — Pure chat reducer.
 *
 * applyChatTurn(state, turn) returns a NEW ConversationState — same
 * inputs always return identical state (no Date(), no Math.random(),
 * no clock; the caller supplies the turn's timestamp + id).
 *
 * Status transitions are derived from the turn shape:
 *   - assistant 'recompile_announcement'    → 'recompiling'
 *   - assistant 'notify_team_question'      → 'awaiting_notify_decision'
 *   - assistant 'success_summary'           → 'success'
 *   - assistant 'notify_team_confirmation'  → 'completed'
 *   - any other turn                        → status unchanged
 *
 * compiledConfigVersionRefs is grown by recordCompiledConfig() — a
 * companion pure function — so the reducer stays focused on turn
 * append + status transition.
 */
import type {
  ChatTurn,
  CompiledConfiguration,
  ConversationState,
  ConversationStatus,
  PendingSignalSeed,
} from '@domain/types';

export function applyChatTurn(state: ConversationState, turn: ChatTurn): ConversationState {
  const nextTurns = [...state.turns, turn];
  const nextStatus = deriveStatus(state.status, turn);
  return Object.freeze({
    id: state.id,
    turns: Object.freeze(nextTurns),
    compiledConfigVersionRefs: state.compiledConfigVersionRefs,
    status: nextStatus,
    pendingSignal: state.pendingSignal,
  });
}

/**
 * Companion pure function — appends a CompiledConfiguration id to the
 * conversation's version-ref list. F-28's reducer calls this after a
 * recompile completes; the F-11 customer route surfaces the count via
 * compiledConfigVersionRefs.length (HAPPY-11 binding).
 */
export function recordCompiledConfig(
  state: ConversationState,
  configId: CompiledConfiguration['id'],
): ConversationState {
  return Object.freeze({
    id: state.id,
    turns: state.turns,
    compiledConfigVersionRefs: Object.freeze([...state.compiledConfigVersionRefs, configId]),
    status: state.status,
    pendingSignal: state.pendingSignal,
  });
}

export function createConversation(id: string): ConversationState {
  return Object.freeze({
    id,
    turns: Object.freeze([] as readonly ChatTurn[]),
    compiledConfigVersionRefs: Object.freeze([] as readonly CompiledConfiguration['id'][]),
    status: 'collecting' as ConversationStatus,
    pendingSignal: null,
  });
}

// D6 / F-31 — Cycle 2 (2026-05-28). Companion pure reducers for the
// PendingSignalSeed lifecycle. The customer route uses these to set/clear
// the seed on capability_class_question / consent-no transitions without
// touching the turns or status fields directly.
export function setPendingSignal(
  state: ConversationState,
  seed: PendingSignalSeed,
): ConversationState {
  return Object.freeze({
    id: state.id,
    turns: state.turns,
    compiledConfigVersionRefs: state.compiledConfigVersionRefs,
    status: state.status,
    pendingSignal: seed,
  });
}

export function clearPendingSignal(state: ConversationState): ConversationState {
  return Object.freeze({
    id: state.id,
    turns: state.turns,
    compiledConfigVersionRefs: state.compiledConfigVersionRefs,
    status: state.status,
    pendingSignal: null,
  });
}

function deriveStatus(current: ConversationStatus, turn: ChatTurn): ConversationStatus {
  if (turn.role !== 'assistant') return current;
  switch (turn.kind) {
    case 'recompile_announcement':
      return 'recompiling';
    case 'notify_team_question':
      return 'awaiting_notify_decision';
    case 'success_summary':
      return 'success';
    case 'notify_team_confirmation':
      return 'completed';
    case 'message':
    case 'clarification_question':
    case 'prompt_display':
      // prompt_display (A18 / F-04b) is a display-only kind — rendering the
      // generated extractionSystemPrompt does not transition the chat status.
      return current;
  }
}
