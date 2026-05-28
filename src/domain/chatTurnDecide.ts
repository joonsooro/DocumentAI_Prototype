/**
 * F-28 — chat.turn_decide agent.
 *
 * A single per-turn meta-decision that returns one of the 4 A12-policy
 * actions: 'clarify' | 'recompile' | 'capability_class_question' |
 * 'success_summary'. When the action is 'capability_class_question',
 * the response also carries an A14 CapabilityClass classification.
 *
 * Runs on the SAP AI Core `smallest_viable` deployment (haiku) per
 * SUB-7 clarification + A15. Goes through the existing callAgent
 * wrapper (no new OAuth path, no new credential resolution) — F-08's
 * runAgentWithFailureSurface wraps the call so any AgentFailure
 * becomes a ClarificationRequest + QualityMetric (N4 preserved).
 *
 * The wire shape lives in src/server/devAgentMiddleware.ts; this module
 * is the SERVER-SIDE entry point that handleChatTurnDecide invokes. The
 * BROWSER never imports this file — type-only imports stay clean and
 * the bundle audit (grep dist/assets/*.js for callAgent | clientsecret |
 * AICORE_KEY_PATH) returns zero matches after F-28 lands.
 *
 * OQ-6 (prompt tuning) defers to S4 OBSERVE telemetry. The starting
 * prompt below enumerates the v1 capability-class pattern list from A14
 * verbatim so the classifier has a closed reference.
 */
import type { ChatTurn, ConversationState } from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

const SMALLEST_VIABLE_MODEL =
  (appSpec as unknown as {
    agent_client_contract: { default_models: { smallest_viable: string } };
  }).agent_client_contract.default_models.smallest_viable;

const MAX_TOKENS = (
  appSpec as unknown as {
    agent_client_contract: { default_max_tokens: { extraction_or_classification: number } };
  }
).agent_client_contract.default_max_tokens.extraction_or_classification;

export type CapabilityClass =
  | 'integration_request'
  | 'new_document_type'
  | 'cross_document_inference'
  | 'predictive_request'
  | 'bulk_operation';

export type TurnDecision =
  | { readonly action: 'clarify'; readonly clarificationContent: string }
  | { readonly action: 'recompile'; readonly recompileSummary: string }
  | {
      readonly action: 'capability_class_question';
      readonly classification: CapabilityClass;
      readonly questionContent: string;
    }
  | { readonly action: 'success_summary'; readonly summaryContent: string };

export const SYSTEM_PROMPT = `You are the Document AI chat.turn_decide agent.

After each user turn in the Customer Workspace conversation, return ONE meta-decision describing what the assistant should do next.

OUTPUT RULES (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object has exactly one of these shapes:
   { "action": "clarify", "clarificationContent": "<question to ask the user>" }
   { "action": "recompile", "recompileSummary": "<short reason for recompile>" }
   { "action": "capability_class_question", "classification": "<one of: integration_request | new_document_type | cross_document_inference | predictive_request | bulk_operation>", "questionContent": "<the notify-team question to surface>" }
   { "action": "success_summary", "summaryContent": "<wrap-up message>" }

DECISION RULES (A12-policy + A14):
- If the most recent user turn supplies missing field context (e.g. clarifies a payment terms semantics, an exclusion rule, a field that should also be extracted) AND the configuration would benefit from a recompile, return action='recompile'.
- If the most recent user turn enumerates fields to extract from a commercial_invoice document (named or implied — v1's pinned document type), return action='recompile'. This is the canonical first-turn recompile trigger; the configuration IS the response, NOT a clarification. Example: "Extract these N fields from this commercial invoice: supplier, invoice number, PO number, invoice date, total amount, currency, tax amount, and supplier branch." Do NOT ask the user to share the document; you already have it (see NEGATIVE CONTRACT D2 binding below).
- If the most recent user turn introduces a NEW question / missing context that cannot be addressed without more info, return action='clarify' with a single specific question.
- If the most recent user turn names a capability-class pattern (integration / new document type / cross-document inference / predictive / bulk operation — see A14 v1 pattern list below), return action='capability_class_question' with the matching classification.
- If the conversation has produced a valid CompiledConfiguration + readiness already and no clarifications remain, return action='success_summary'.

V1 CAPABILITY-CLASS PATTERN LIST (A14 — closed for v1, expanded by S4 OBSERVE):
- integration_request: "link to S/4 HANA", "send to system X", "trigger workflow Y", "post to ERP"
- new_document_type: "can you also process delivery notes?", "handle BoLs too"
- cross_document_inference: "compare to previous month's invoice", "cross-reference the PO"
- predictive_request: "predict what comes next", "use model X to forecast"
- bulk_operation: "process 500 of these at once", "batch upload"

MISSED-EXTRACTION PATTERNS (NOT capability-class — these go to clarify + re-compile):
- Field clarification ("payment_terms means net days after BoL")
- Field addition within the existing schema ("also extract the buyer reference")
- Threshold / confidence adjustment
- Exclusion rules ("ignore lines marked X")
- First-turn field enumeration when the user names ≥ 1 field to extract from the pinned document type (commercial_invoice in v1). Example: "Extract these N fields from this commercial invoice: supplier, invoice number, PO number, invoice date, total amount, currency, tax amount, and supplier branch." This is NOT a clarify case — return action='recompile'. The configuration IS the response. (Enumerated per the enumerate-don't-gesture tenet; first-turn field enumeration is the dominant first-turn shape in the v1 demo.)

NEGATIVE CONTRACT:
- Never tell the user a request is "unsupported" (N1 still binds).
- Never echo system or user prompts back into the output.
- Never wrap output in markdown code fences or prose.
- NEVER ask the customer to share, upload, attach, or otherwise provide a file, document, or image. v1 always processes the canned DAEJOO commercial-invoice fixture (D2 / SUB-1 / N6); the document is fixed by the platform and you already have everything you need. Forbidden phrasings include "share the document", "share the file", "share the invoice", "upload the file", "upload the document", "attach the invoice", "attach the document", "provide the document", "provide the image", "I need to see the actual invoice", "could you share". The wrong-frame anti-pattern — "I need to see the document" when the user enumerates fields — must return action='recompile' instead (see DECISION RULES above). "I cannot see your file" is the same shape of capability lie that "unsupported" is and is bound by the same containment as N1.`;

/**
 * Forbidden file-request phrases for the D2-binding negative rule.
 * Every phrase appears LITERALLY in SYSTEM_PROMPT above so the prompt
 * and the constant cannot drift. Tests assert SYSTEM_PROMPT.includes
 * each entry; the chat agent must NEVER emit any of these.
 */
export const FORBIDDEN_FILE_REQUEST_PHRASES: readonly string[] = Object.freeze([
  'share the document',
  'share the file',
  'share the invoice',
  'upload the file',
  'upload the document',
  'attach the invoice',
  'attach the document',
  'provide the document',
  'provide the image',
  'I need to see the actual invoice',
  'could you share',
]);

function buildUserPrompt(state: ConversationState): string {
  const transcript = state.turns
    .map((t) => `${t.role.toUpperCase()} (${t.kind}): ${t.content}`)
    .join('\n');
  return `Conversation transcript (most recent last):\n${transcript}\n\nReturn the next assistant meta-decision as a JSON object per the OUTPUT RULES above.`;
}

function validateDecision(parsed: unknown): TurnDecision {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('chat.turn_decide: response must be a JSON object');
  }
  const p = parsed as Record<string, unknown>;
  switch (p.action) {
    case 'clarify':
      if (typeof p.clarificationContent !== 'string') {
        throw new Error('chat.turn_decide: clarify action requires clarificationContent string');
      }
      return { action: 'clarify', clarificationContent: p.clarificationContent };
    case 'recompile':
      if (typeof p.recompileSummary !== 'string') {
        throw new Error('chat.turn_decide: recompile action requires recompileSummary string');
      }
      return { action: 'recompile', recompileSummary: p.recompileSummary };
    case 'capability_class_question': {
      if (typeof p.questionContent !== 'string') {
        throw new Error('chat.turn_decide: capability_class_question requires questionContent string');
      }
      const cls = p.classification;
      if (
        cls !== 'integration_request' &&
        cls !== 'new_document_type' &&
        cls !== 'cross_document_inference' &&
        cls !== 'predictive_request' &&
        cls !== 'bulk_operation'
      ) {
        throw new Error(`chat.turn_decide: classification must be one of the 5 A14 patterns; got ${JSON.stringify(cls)}`);
      }
      return { action: 'capability_class_question', classification: cls, questionContent: p.questionContent };
    }
    case 'success_summary':
      if (typeof p.summaryContent !== 'string') {
        throw new Error('chat.turn_decide: success_summary requires summaryContent string');
      }
      return { action: 'success_summary', summaryContent: p.summaryContent };
    default:
      throw new Error(`chat.turn_decide: unknown action ${JSON.stringify(p.action)}; valid: clarify | recompile | capability_class_question | success_summary`);
  }
}

export async function chatTurnDecide(state: ConversationState): Promise<TurnDecision> {
  const result = await callAgent<TurnDecision>({
    agent: 'chat.turn_decide',
    model: SMALLEST_VIABLE_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(state),
    expect_json_schema: validateDecision,
  });
  return result.value;
}

// ---------------------------------------------------------------------------
// Pure helper exports — used by tests + by F-28 callers that need the
// classifier shape without going through a live agent call.
// ---------------------------------------------------------------------------

/**
 * Returns true when the chat agent should NOT surface a notify-team
 * question for the conversation so far — i.e. every user turn matches
 * a missed-extraction pattern, no capability-class pattern, EDGE-7
 * scenario. The classifier is a heuristic mirror of the system-prompt
 * rules; the binding behaviour is the LIVE chat.turn_decide call, but
 * this helper lets the F-28 mocked test exercise EDGE-7 without spend.
 */
export function isMissedExtractionOnly(turns: readonly ChatTurn[]): boolean {
  // Heuristic mirror of A14 capability-class patterns. Conservative: a
  // single token like 'bol' or 'forecast' could legitimately appear in
  // a missed-extraction clarification (e.g. "net 30 from BoL"), so the
  // patterns require a capability-class verb / context for the match.
  // The LIVE chat.turn_decide call remains the canonical classifier —
  // this helper exists for EDGE-7 mocked tests.
  const CAPABILITY_PATTERNS: readonly RegExp[] = [
    /\bs\/4\s*hana\b/i,
    /\btrigger\s+(a\s+)?workflow\b/i,
    /\bpost\s+to\s+(?:erp|s\/4|sap)\b/i,
    /\b(?:also\s+(?:process|handle)|can\s+you\s+(?:also\s+)?process)\s+(?:delivery\s+notes?|bills?\s+of\s+lading|bols?)\b/i,
    /\bcross[-\s]reference\b/i,
    /\bpredict\s+what\s+comes\s+next\b/i,
    /\buse\s+model\s+[a-z]\s+to\s+forecast\b/i,
    /\b(?:batch\s+upload|process\s+\d+\s+of\s+these\s+at\s+once|bulk\s+(?:upload|operation))\b/i,
  ];
  return turns.every(
    (t) => t.role !== 'user' || !CAPABILITY_PATTERNS.some((re) => re.test(t.content)),
  );
}

export const CAPABILITY_CLASS_VALUES: readonly CapabilityClass[] = Object.freeze([
  'integration_request',
  'new_document_type',
  'cross_document_inference',
  'predictive_request',
  'bulk_operation',
]);
