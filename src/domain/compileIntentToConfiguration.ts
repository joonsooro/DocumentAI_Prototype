/**
 * F-04 (b) — Compile agent (A1).
 *
 * Contract pointer: U4. Spec invariants:
 *   - HAPPY-3 / A1: live SAP AI Core call, never a static template lookup;
 *     CompiledConfiguration.source === 'aiCore', templateUsed === false.
 *   - DEP-1 spend cap: model + max_tokens supplied for every call.
 *   - Strict JSON validation via zod — drift in AI Core's JSON shape becomes
 *     AgentFailure(schema_validation_failed), which F-08 will surface as a
 *     ClarificationRequest + QualityMetric.
 *
 * Acceptance (per app/feature-list.json):
 *   - Compile result has all 9 DAEJOO fields when given the DAEJOO intent.
 *   - source === 'aiCore' and templateUsed === false on the returned object.
 *   - tsc + eslint + vitest (mocked) green.
 *
 * Kill switch (20 min): if 5 consecutive compile calls fail to return
 * parseable JSON, halt and revisit AI Core JSON contract (OQ-1).
 */

import { z } from 'zod';
import type {
  CompiledConfiguration,
  CustomerIntent,
  ProcessingMode,
  SchemaField,
} from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Wire schema (what AI Core is asked to return)
//
// Kept intentionally loose at the top level (no id, no compiledAt — those are
// stamped by THIS module after the call returns). The wire shape mirrors only
// what the model must produce.
// ---------------------------------------------------------------------------

const ProcessingModeZ: z.ZodType<ProcessingMode> = z.enum(['auto_confirm', 'review_required', 'blocked']);

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

const CompiledConfigWireZ = z.object({
  schema: z.object({
    fields: z.array(SchemaFieldZ).min(1),
  }),
  processingMode: ProcessingModeZ,
});

type CompiledConfigWire = z.infer<typeof CompiledConfigWireZ>;

// ---------------------------------------------------------------------------
// Prompt — kept short, schema-constrained, refusal patterns explicit
// ---------------------------------------------------------------------------

const COMPILE_SYSTEM_PROMPT = `You are the Document AI Compile Agent.

Your only job: read messy customer intent describing what to extract from a document and produce a JSON CompiledConfiguration object that the Document AI runtime can consume.

Field-derivation rules (binding):
A. Treat the customer intent as describing what to extract FROM a real business document. The document carries fields by convention beyond what the intent explicitly names; you MUST include those conventional fields too.
B. For a commercial_invoice document, the canonical field set is exactly these 9 fields when the intent names supplier/PO/invoice-date/HS-code/payment-terms/payable-amount semantics: supplier, invoice_number, invoice_date, po_number, hs_code, payment_terms, total_amount, payable_amount, commercial_value_indicator.
   - invoice_number is always required on a commercial invoice even if the intent does not name it.
   - total_amount is the gross document total; payable_amount is what is owed after exclusions. Both fields are required when the intent distinguishes a payable from a total (e.g. "exclude no-commercial-value lines from payable validation").
   - commercial_value_indicator is required whenever the intent references commercial-value, sample-line, or no-commercial-value semantics; this is the line-level discriminator the downstream filter reads.
C. Do NOT include fields the intent neither names nor implies via document convention. Do NOT pad with speculative fields.
D. Auxiliary intent phrases that describe business actions on materials (auto-dispose, ship, return, store, etc.) are NOT schema fields — downstream agents route those separately. Do not add a field for them.

Output rules (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object MUST have exactly two top-level keys: "schema" and "processingMode".
3. "schema" MUST be { "fields": [...] } where each field has:
   { "name", "dataType", "required", "instruction", "validation", "regex", "confidenceThreshold", "enumValues"? }
4. "dataType" MUST be one of: "string", "number", "date", "boolean", "enum".
5. "processingMode" MUST be one of: "auto_confirm", "review_required", "blocked".
6. "confidenceThreshold" MUST be a number between 0 and 1 inclusive.
7. "validation" and "regex" MAY be null but the key MUST be present.
8. NEVER include capability commentary, "unsupported" notes, or recommendations to lower thresholds.
9. NEVER include explanatory prose, headers, or footers — JSON object only.

If the intent is ambiguous, still produce a best-effort configuration; downstream agents will route clarifications. Do not refuse.`;

function buildUserPrompt(intent: CustomerIntent): string {
  return `Document type: ${intent.documentType}
Captured at: ${intent.capturedAt}
Intent id: ${intent.id}

Customer intent (free-text):
---
${intent.raw}
---

Produce the JSON CompiledConfiguration now.`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const appSpecTyped = appSpec as {
  agent_client_contract: {
    default_models: { compile_or_reasoning_heavy: string; smallest_viable: string };
    default_max_tokens: { extraction_or_classification: number; free_text_generation: number };
  };
};

export interface CompileOptions {
  readonly model?: string;
  readonly max_tokens?: number;
  readonly nowIso?: string; // injectable for deterministic compiledAt in tests
  readonly idSuffix?: string; // injectable for deterministic id in tests
}

export async function compileIntentToConfiguration(
  intent: CustomerIntent,
  opts: CompileOptions = {},
): Promise<CompiledConfiguration> {
  const model = opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens = opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;

  const result = await callAgent<CompiledConfigWire>({
    agent: 'compile',
    model,
    max_tokens,
    system: COMPILE_SYSTEM_PROMPT,
    user: buildUserPrompt(intent),
    expect_json_schema: (parsed) => CompiledConfigWireZ.parse(parsed),
  });

  // Stamp invariants HERE — the wire schema deliberately omits these so the
  // model cannot lie about them. HAPPY-3 / A1: source always 'aiCore',
  // templateUsed literally false.
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const idSuffix = opts.idSuffix ?? nowIso;
  return Object.freeze({
    id: `cfg::${intent.id}::${idSuffix}`,
    intentId: intent.id,
    schema: result.value.schema,
    processingMode: result.value.processingMode,
    source: 'aiCore' as const,
    templateUsed: false as const,
    compiledAt: nowIso,
  }) satisfies CompiledConfiguration;
}
