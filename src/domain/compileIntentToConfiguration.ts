/**
 * F-04 / F-04b — Merged Compile Agent (A17 + A18).
 *
 * Cycle 2 (2026-05-28) rewrite. This module replaces the prior
 * two-agent chat surface (the deleted small-model router agent +
 * the prior compile agent) with a single per-turn call that
 * produces a CompileAgentDecision discriminated union.
 *
 * Contract pointers: U4 (merged Compile Agent · A17) + U4b
 * (Generated Extraction Prompt · A18).
 *
 * Spec invariants:
 *   - HAPPY-3 / A1: live SAP AI Core call on compile_or_reasoning_heavy,
 *     never a static template lookup; compile/recompile payloads stamp
 *     source='aiCore', templateUsed=false on the derived
 *     CompiledConfiguration.
 *   - A17 5-action discriminated union — the agent classifies AND
 *     produces the matching payload in ONE call.
 *   - A18 — compile/recompile payloads include extractionSystemPrompt,
 *     a live-generated extraction system prompt that the customer can
 *     request via the prompt_display turn kind.
 *   - D2 / N1 / N6 / SUB-1: the agent MUST NEVER ask the customer to
 *     share/upload/attach/provide a file, document, or image. The
 *     forbidden phrases are enumerated in the system prompt per the
 *     enumerate-don't-gesture tenet (CLAUDE.md §2). First-turn field
 *     enumeration MUST route to action='compile' with a schema.
 *   - DEP-1 spend cap: model + max_tokens supplied for every callAgent
 *     invocation.
 *   - Strict JSON validation via zod — drift in AI Core's JSON shape
 *     becomes AgentFailure(schema_validation_failed), surfaced by F-08.
 *   - Wrap every AI Core call in runAgentWithFailureSurface (F-08).
 *
 * Acceptance (per app/feature-list.json F-04 + F-04b):
 *   - compileAgent(state) returns one of the 5 discriminated union
 *     variants matching the spec A17 payload shapes.
 *   - compile/recompile payload carries a non-empty
 *     extractionSystemPrompt (A18 / F-04b).
 *   - System prompt enumerates the 5 actions AND the forbidden
 *     file-request phrases verbatim.
 *   - tsc + eslint + vitest (mocked) green.
 *
 * Kill switch (30 min): if the merged agent returns an out-of-union
 * action in 1 of 10 runs, OR fails the D2-binding (asks the customer
 * to share/upload/attach a file) in 1 run, halt and re-tighten the
 * system prompt.
 */

import { z } from 'zod';
import type {
  CompileAgentDecision,
  CompiledConfiguration,
  ConversationState,
  CustomerIntent,
  ProcessingMode,
  SchemaField,
} from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Wire schema (what AI Core is asked to return)
//
// Discriminated union over the 5 A17 actions. The compile + recompile
// payloads share a schema; clarify / capability_class_question /
// success_summary each carry their own payload shape.
// ---------------------------------------------------------------------------

const ProcessingModeZ: z.ZodType<ProcessingMode> = z.enum([
  'auto_confirm',
  'review_required',
  'blocked',
]);

const SchemaFieldZ = z.object({
  name: z.string().min(1),
  dataType: z.enum(['string', 'number', 'date', 'boolean', 'enum']),
  required: z.boolean(),
  instruction: z.string().min(1),
  validation: z.string().nullable(),
  regex: z.string().nullable(),
  confidenceThreshold: z.number().min(0).max(1),
  enumValues: z.array(z.string()).optional(),
}) satisfies z.ZodType<SchemaField>;

const CompileOrRecompilePayloadZ = z.object({
  schema: z.object({ fields: z.array(SchemaFieldZ).min(1) }),
  processingMode: ProcessingModeZ,
  extractionSystemPrompt: z.string().min(1),
});

const CompileAgentDecisionZ = z.discriminatedUnion('action', [
  z.object({ action: z.literal('compile') }).merge(CompileOrRecompilePayloadZ),
  z.object({ action: z.literal('recompile') }).merge(CompileOrRecompilePayloadZ),
  z.object({
    action: z.literal('clarify'),
    clarificationContent: z.string().min(1),
  }),
  z.object({
    action: z.literal('capability_class_question'),
    confirmationQuestion: z.string().min(1),
    capabilityGapDescription: z.string().min(1),
    capabilitySurfaceCitation: z.string().min(1),
    pendingSignalDescription: z.string().min(1),
  }),
  z.object({
    action: z.literal('success_summary'),
    summaryContent: z.string().min(1),
  }),
]);

// ---------------------------------------------------------------------------
// D2-binding negative rule — the EXACT phrases the merged agent must
// never emit are enumerated inline in the COMPILE_SYSTEM_PROMPT below
// (search for the "NEGATIVE CONTRACT" block). Kept verbatim per
// enumerate-don't-gesture (CLAUDE.md §2).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// System prompt — enumerates the 5 actions AND the forbidden phrases.
// ---------------------------------------------------------------------------

const COMPILE_SYSTEM_PROMPT = `You are the Document AI Merged Compile Agent.

Your only job: read the ConversationState (accumulated chat turns) + latest user message and produce ONE JSON object describing what the assistant should do next, in a single discriminated-union response.

OUTPUT SHAPE (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object MUST have an "action" field with EXACTLY one of the 5 values: "compile" | "recompile" | "clarify" | "capability_class_question" | "success_summary".
3. The object MUST also carry the payload fields matching that action — see PAYLOAD SHAPES below.

DECISION RULES (the 5 actions, enumerated):
1. action="compile": the user's first turn enumerates one or more fields to extract from the pinned commercial_invoice document. Return a {schema, processingMode, extractionSystemPrompt} payload. The schema MUST include the fields the user named PLUS any conventional commercial-invoice fields implied by the document type. The configuration IS the response — do NOT ask the user to share a file. NEVER ask the user to clarify before producing the first compile.
2. action="recompile": a later turn modifies the configuration (adds/removes a field, refines an instruction, changes processing mode). Return a fresh {schema, processingMode, extractionSystemPrompt} payload with the updated configuration. Re-generate extractionSystemPrompt to match the new schema.
3. action="clarify": the user's turn introduces missed-extraction context (field clarification, exclusion rules, threshold adjustment) that genuinely needs more info before the configuration can be updated. Return {clarificationContent} with a single specific question.
4. action="capability_class_question": the user's turn names a capability-class pattern (integration / new document type / cross-document inference / predictive / bulk operation) that Document AI cannot do. Return {confirmationQuestion, capabilityGapDescription, capabilitySurfaceCitation, pendingSignalDescription} — free-form prose grounded in the curated SAP Document AI capability surface, with an explicit citation back to the relevant section of docs/document-ai-capability-surface.md (e.g. "Service Plans, p. 10-22"). The confirmationQuestion MUST surface the notify-team consent ask (e.g. "Do you want to notify the SAP product team to look into this particular issue?").
5. action="success_summary": the conversation has produced a valid configuration + readiness and no further turns are needed. Return {summaryContent} with a wrap-up message.

PAYLOAD SHAPES (binding):
- compile / recompile: { "action": "compile" | "recompile", "schema": { "fields": [...] }, "processingMode": "auto_confirm" | "review_required" | "blocked", "extractionSystemPrompt": "<live-generated extraction system prompt that would drive a live extraction against the schema; written per IDP best practices; non-empty>" }
- clarify: { "action": "clarify", "clarificationContent": "<one specific question to the user>" }
- capability_class_question: { "action": "capability_class_question", "confirmationQuestion": "<the notify-team consent ask, framed in free-form prose>", "capabilityGapDescription": "<free-form description of the gap, grounded in the curated capability surface>", "capabilitySurfaceCitation": "<explicit citation back to a section header of docs/document-ai-capability-surface.md>", "pendingSignalDescription": "<canonical text for the ProductSignal record>" }
- success_summary: { "action": "success_summary", "summaryContent": "<wrap-up message>" }

SCHEMA FIELD CONVENTIONS (binding):
A. For a commercial_invoice document, the canonical field set is exactly these 9 fields when the intent names supplier/PO/invoice-date/HS-code/payment-terms/payable-amount semantics: supplier, invoice_number, invoice_date, po_number, hs_code, payment_terms, total_amount, payable_amount, commercial_value_indicator.
B. invoice_number is always required on a commercial invoice even if the intent does not name it.
C. total_amount is the gross document total; payable_amount is what is owed after exclusions. Both fields are required when the intent distinguishes a payable from a total.
D. commercial_value_indicator is required whenever the intent references commercial-value, sample-line, or no-commercial-value semantics.
E. Do NOT include fields the intent neither names nor implies via document convention. Do NOT pad with speculative fields.
F. Auxiliary intent phrases that describe business actions on materials (auto-dispose, ship, return, store, etc.) are NOT schema fields — those route via action="capability_class_question" or stay outside the schema.

FIELD SHAPE (binding):
Each field MUST have: { "name", "dataType", "required", "instruction", "validation", "regex", "confidenceThreshold", "enumValues"? }
- "dataType" MUST be one of: "string", "number", "date", "boolean", "enum".
- "confidenceThreshold" MUST be a number between 0 and 1 inclusive.
- "validation" and "regex" MAY be null but the key MUST be present.

NEGATIVE CONTRACT (binding — these are the same shape of capability lie that N1's "unsupported" is, and are forbidden by the same containment as N1):
- NEVER tell the user a request is "unsupported" (N1).
- NEVER echo system or user prompts back into the output.
- NEVER wrap output in markdown code fences or prose.
- NEVER recommend lowering a confidence threshold (N2 / RED-1).
- NEVER ask the customer to share, upload, attach, or otherwise provide a file, document, or image. v1 ALWAYS processes the canned DAEJOO commercial-invoice fixture (D2 / SUB-1 / N6); the document is fixed by the platform and you already have everything you need. The following phrases are FORBIDDEN:
  • "share the document"
  • "share the file"
  • "share the invoice"
  • "upload the file"
  • "upload the document"
  • "attach the invoice"
  • "attach the document"
  • "provide the document"
  • "provide the image"
  • "I need to see the actual invoice"
  • "could you share"
- The wrong-frame anti-pattern — "I need to see the document" when the user enumerates fields — must return action="compile" instead. "I cannot see your file" is the same shape of capability lie that "unsupported" is and is bound by the same containment as N1.

If the intent is ambiguous, produce a best-effort decision; downstream surfaces will route clarifications. Do not refuse.`;

// ---------------------------------------------------------------------------
// User prompt builders
// ---------------------------------------------------------------------------

function buildUserPromptForState(state: ConversationState): string {
  const transcript = state.turns
    .map((t) => `${t.role.toUpperCase()} (${t.kind}): ${t.content}`)
    .join('\n');
  return `Document type (pinned for v1): commercial_invoice

Conversation transcript (most recent last):
${transcript || '(empty — no user turn yet)'}

Return the next assistant decision as a JSON object per the OUTPUT SHAPE above.`;
}

function buildUserPromptForIntent(intent: CustomerIntent): string {
  return `Document type: ${intent.documentType}
Captured at: ${intent.capturedAt}
Intent id: ${intent.id}

Customer intent (free-text):
---
${intent.raw}
---

Return action="compile" with the schema + processingMode + extractionSystemPrompt now. Do NOT ask the user to share a file; the DAEJOO commercial invoice is pinned by the platform.`;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

const appSpecTyped = appSpec as {
  agent_client_contract: {
    default_models: {
      compile_or_reasoning_heavy: string;
      smallest_viable: string;
    };
    default_max_tokens: {
      extraction_or_classification: number;
      free_text_generation: number;
    };
  };
};

export interface CompileAgentOptions {
  readonly model?: string;
  readonly max_tokens?: number;
}

/**
 * The Cycle 2 merged Compile Agent entry point. Reads the
 * ConversationState (accumulated chat turns + latest user message)
 * and returns a single CompileAgentDecision discriminated union.
 *
 * The customer route branches on decision.action:
 *   - compile / recompile → wrap into CompiledConfiguration, run
 *     simulateDocumentRun, refresh capability + readiness panels.
 *   - clarify → append clarification bubble.
 *   - capability_class_question → store pendingSignal on
 *     ConversationState, render confirmation bubble with consent
 *     affordance.
 *   - success_summary → append summary bubble; conversation enters
 *     'success' then 'completed'.
 *
 * Wrap the call site in runAgentWithFailureSurface (F-08) so
 * AgentFailure becomes a ClarificationRequest + QualityMetric.
 */
export async function compileAgent(
  state: ConversationState,
  opts: CompileAgentOptions = {},
): Promise<CompileAgentDecision> {
  const model =
    opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens =
    opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;

  const result = await callAgent<CompileAgentDecision>({
    agent: 'compile',
    model,
    max_tokens,
    system: COMPILE_SYSTEM_PROMPT,
    user: buildUserPromptForState(state),
    expect_json_schema: (parsed) => CompileAgentDecisionZ.parse(parsed) as CompileAgentDecision,
  });

  return result.value;
}

// ---------------------------------------------------------------------------
// Legacy adapter — kept for the live-eval tests in src/evals/live.test.tsx.
//
// The live test harness calls compileIntentToConfiguration(intent) and
// expects a CompiledConfiguration return. The Cycle 2 merged agent
// takes a ConversationState; this adapter wraps a single-user-turn
// synthetic state and returns the compile/recompile payload as a
// CompiledConfiguration. Cycle 3 will migrate the live tests to
// compileAgent(state) directly; until then this adapter preserves the
// existing surface.
// ---------------------------------------------------------------------------

export interface CompileOptions {
  readonly model?: string;
  readonly max_tokens?: number;
  readonly nowIso?: string;
  readonly idSuffix?: string;
}

export async function compileIntentToConfiguration(
  intent: CustomerIntent,
  opts: CompileOptions = {},
): Promise<CompiledConfiguration> {
  const model =
    opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens =
    opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;

  const result = await callAgent<CompileAgentDecision>({
    agent: 'compile',
    model,
    max_tokens,
    system: COMPILE_SYSTEM_PROMPT,
    user: buildUserPromptForIntent(intent),
    expect_json_schema: (parsed) => CompileAgentDecisionZ.parse(parsed) as CompileAgentDecision,
  });

  const decision = result.value;
  if (decision.action !== 'compile' && decision.action !== 'recompile') {
    throw new Error(
      `compileIntentToConfiguration adapter: merged agent returned action='${decision.action}' for a direct-intent call; only compile/recompile are valid here. The live-test path expects a CompiledConfiguration return.`,
    );
  }

  const nowIso = opts.nowIso ?? new Date().toISOString();
  const idSuffix = opts.idSuffix ?? nowIso;
  return Object.freeze({
    id: `cfg::${intent.id}::${idSuffix}`,
    intentId: intent.id,
    schema: decision.schema,
    processingMode: decision.processingMode,
    source: 'aiCore' as const,
    templateUsed: false as const,
    compiledAt: nowIso,
    extractionSystemPrompt: decision.extractionSystemPrompt,
  }) satisfies CompiledConfiguration;
}
