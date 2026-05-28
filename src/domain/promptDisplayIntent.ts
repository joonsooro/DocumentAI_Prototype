/**
 * Cycle 3 SF (HAPPY-17 non-terminal) — shared "show me the prompt"
 * intent detection.
 *
 * Single source of truth used by BOTH:
 *   (a) src/domain/compileIntentToConfiguration.ts —
 *       COMPILE_SYSTEM_PROMPT enumerates these phrases verbatim in the
 *       NEGATIVE CONTRACT block so the merged Compile Agent NEVER
 *       returns action='success_summary' on a prompt-display ask.
 *   (b) src/routes/customer.tsx — the route consults
 *       `isPromptDisplayIntent(userMessage)` after the agent returns a
 *       non-terminal action; on a match (and a non-empty
 *       vm.configuration.extractionSystemPrompt) the route appends a
 *       `prompt_display` ChatTurn so the customer sees the live A18
 *       prompt regardless of which non-terminal action the agent
 *       picked.
 *
 * Per CLAUDE.md §2 ("enumerate, don't gesture"): list the trigger
 * phrases verbatim. The merged agent's system prompt embeds the same
 * list so a model that hasn't seen this helper still has the
 * enumeration in-context.
 *
 * Background — Cycle 3 (commit 658fb59) live evals observed the merged
 * agent stably returning action='success_summary' on "show me the
 * prompt" across both runs. success_summary carries
 * ConversationState.status='completed' semantics, which structurally
 * ends the conversation. The goal-state demo in
 * docs/handoff-2026-05-28.md §6 requires the conversation to STAY
 * OPEN after the prompt is rendered (step 4 → step 5: show prompt →
 * S/4 HANA ask). This SF binds prompt-display asks to a non-terminal
 * action and routes the bubble emission through the route.
 */

/**
 * The verbatim list of informational prompt-display trigger phrases.
 * Re-exported as a readonly array so the COMPILE_SYSTEM_PROMPT
 * enumeration can interpolate the same list rather than duplicating
 * it. New phrases require a single edit here.
 */
export const PROMPT_DISPLAY_TRIGGER_PHRASES: readonly string[] = Object.freeze([
  'show me the prompt',
  "what's the prompt",
  'what is the prompt',
  'display the prompt',
  'let me see the prompt',
  'can i see the prompt',
  'show prompt',
]);

/**
 * Case-insensitive substring match against the trigger phrases.
 * Returns true iff the user message contains any one of the
 * enumerated phrases (or trivial variants captured by the substring
 * match, e.g. "show me the prompt please" → true).
 *
 * Intentionally permissive — false positives here cost the customer
 * an extra prompt_display bubble, never a wrong decision.action.
 * False negatives would cause the customer to miss the prompt
 * surface, which is the bug we're fixing.
 */
export function isPromptDisplayIntent(userMessage: string): boolean {
  if (typeof userMessage !== 'string' || userMessage.length === 0) return false;
  const haystack = userMessage.toLowerCase();
  for (const needle of PROMPT_DISPLAY_TRIGGER_PHRASES) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}

/**
 * Verbatim list of terminal-satisfaction phrases. The COMPILE_SYSTEM_PROMPT
 * uses this list to scope the success_summary trigger; only these
 * phrases (and similar terminal-satisfaction signals) should produce
 * action='success_summary'. Exposed here so a future SF can extend or
 * relax the list in one place.
 */
export const TERMINAL_SATISFACTION_TRIGGER_PHRASES: readonly string[] = Object.freeze([
  'looks good',
  "that's all",
  'that is all',
  "we're done",
  'we are done',
  'thanks',
  'thank you',
  'perfect',
  'great, that works',
  'great that works',
  'nothing else',
]);
