/**
 * F-05 — Capability Assessment Agent (A2).
 *
 * Contract pointer: U5. Spec invariants:
 *   - HAPPY-4 / N1: every customer-visible row is "Supported" or
 *     "Supported with workaround". The string "Unsupported" never reaches
 *     the Customer Workspace.
 *   - Gaps that the customer should not see are tagged status='capability_gap'
 *     + customerVisible=false. F-06 (router) is the one that turns those into
 *     ProductSignals; F-05 just classifies and emits the row.
 *   - DEP-1 spend cap: model + max_tokens supplied for every callAgent invocation.
 *   - Strict JSON validation via zod — drift in AI Core's JSON shape becomes
 *     AgentFailure(schema_validation_failed), which F-08 will surface as a
 *     ClarificationRequest + QualityMetric.
 *
 * Acceptance (per app/feature-list.json):
 *   - Every requirement fragment lands in exactly one bucket.
 *   - No rendered status string equals "Unsupported".
 *   - customerVisible=true ⇒ status ∈ {'Supported','Supported with workaround'}.
 *   - customerVisible=false ⇒ status === 'capability_gap'.
 *   - tsc + eslint + vitest (mocked) green.
 *
 * Kill switch (15 min): if the agent returns "Unsupported" in any of 3
 * consecutive runs, halt and tighten the prompt constraint. Enforced
 * defensively in code: any wire row whose status is 'Unsupported' (or any
 * case variant) gets re-tagged to 'capability_gap' + customerVisible=false
 * — a belt-and-braces guard so a model regression cannot leak the forbidden
 * string into the customer-facing array.
 */

import { z } from 'zod';
import type {
  CapabilityAssessment,
  CompiledConfiguration,
  CustomerIntent,
  CustomerVisibleStatus,
} from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };
// A2 amendment / F-05 — Cycle 2 (2026-05-28). Curated SAP Document AI
// capability surface (~6K tokens, 6 sections) imported as a static
// string at build time via Vite's ?raw query suffix. No retrieval, no
// chunking, no graph store in v1. Revisit conditions for swapping to
// RAG / graph-RAG (Cognee) are tracked in OQ-8.
import capabilitySurface from '../../docs/document-ai-capability-surface.md?raw';

// Fail-fast sanity check at module load time. If the curated artifact
// is missing, truncated, or the ?raw import silently produced an empty
// string, throw rather than ship empty grounding context.
if (typeof capabilitySurface !== 'string' || capabilitySurface.length < 5000) {
  throw new Error(
    `assessCapabilities: curated capability surface failed length sanity check ` +
      `(expected >5000 chars, got ${typeof capabilitySurface === 'string' ? capabilitySurface.length : 'non-string'}). ` +
      `Check docs/document-ai-capability-surface.md and Vite ?raw import.`,
  );
}

// ---------------------------------------------------------------------------
// Wire schema — what AI Core is asked to return
//
// Kept narrow: customer-visible rows MUST carry one of the two allowed
// status strings; gap rows MUST carry status='capability_gap'. id, raisedAt,
// and the customerVisible flag are stamped HERE so the model cannot lie
// about routing.
// ---------------------------------------------------------------------------

const CustomerVisibleStatusZ: z.ZodType<CustomerVisibleStatus> = z.enum([
  'Supported',
  'Supported with workaround',
]);

const WireRowZ = z.object({
  intentFragment: z.string().min(1),
  // Customer-visible OR capability_gap; "Unsupported" deliberately not in the union.
  status: z.union([CustomerVisibleStatusZ, z.literal('capability_gap')]),
  workaroundDescription: z.string().nullable(),
  fieldRefs: z.array(z.string()),
});

const WireResponseZ = z.object({
  rows: z.array(WireRowZ).min(1),
});

type WireRow = z.infer<typeof WireRowZ>;

// ---------------------------------------------------------------------------
// Prompt — short, schema-constrained, negative-contract explicit
// ---------------------------------------------------------------------------

const ASSESS_SYSTEM_PROMPT = `You are the Document AI Grounded Capability Assessment Agent.

Job: read the customer's free-text intent plus the compiled configuration and produce one row per requirement fragment indicating whether the system can deliver it. You have access to the curated SAP Document AI capability surface (below) as static grounding context — use it to classify capability-class requests and to cite the relevant section when a fragment falls outside the product's scope.

Output rules (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object MUST have exactly one top-level key: "rows".
3. Each row MUST have keys: "intentFragment", "status", "workaroundDescription", "fieldRefs".
4. "status" MUST be one of EXACTLY these three values:
   - "Supported" — the configuration covers this fragment directly per the curated capability surface.
   - "Supported with workaround" — the configuration covers it via a workaround (describe in workaroundDescription).
   - "capability_gap" — the configuration cannot cover it AND a workaround is not possible per the curated surface. This row will be hidden from the customer and routed internally.
5. NEVER emit "Unsupported" (or "unsupported", "UNSUPPORTED", "not supported", etc.) as the status. If the fragment is not coverable, use "capability_gap".
6. "workaroundDescription" is a non-empty string when status === "Supported with workaround", otherwise null.
7. "fieldRefs" is an array of SchemaField.name strings the fragment maps to (may be empty for capability_gap rows).
8. NEVER include capability commentary, customer-facing recommendations to lower thresholds, or roadmap signals.

Decompose the intent into atomic fragments — one row per logically-distinct requirement. If the intent contains an obvious "exclude X" clause and a clean workaround exists (e.g. a per-field filter or an extraction rule), use "Supported with workaround" rather than "capability_gap". When a fragment names a capability-class pattern that is out-of-scope per the curated surface (integration beyond documented · cross-document · predictive · bulk · unsupported document type), use "capability_gap" and rely on downstream A17 capability_class_question handling for citation.

CURATED SAP DOCUMENT AI CAPABILITY SURFACE (A2 amendment · static grounding context · docs/document-ai-capability-surface.md):
---
${capabilitySurface}
---

End of curated capability surface. Use it as the authoritative reference for what Document AI can and cannot do.`;

function buildUserPrompt(
  intent: CustomerIntent,
  config: CompiledConfiguration,
): string {
  const fieldNames = config.schema.fields.map((f) => f.name).join(', ');
  return `Document type: ${intent.documentType}
Captured at: ${intent.capturedAt}
Intent id: ${intent.id}

Customer intent (free-text):
---
${intent.raw}
---

Compiled configuration schema fields (id=${config.id}):
${fieldNames}

Produce the JSON rows now.`;
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

export interface AssessOptions {
  readonly model?: string;
  readonly max_tokens?: number;
  /** Injectable for deterministic row.id stamping in tests. */
  readonly nowIso?: string;
}

/**
 * Defensive belt-and-braces guard. The prompt forbids "Unsupported" and the
 * zod schema rejects any status outside the allowed three — but if a future
 * model regression somehow drifts the status into a string like "Unsupported"
 * via a synonym path the schema couldn't anticipate, this guard re-tags the
 * row to 'capability_gap' + customerVisible=false. We never let the forbidden
 * string reach a customer-visible CapabilityAssessment.
 */
function isUnsupportedLeak(s: string): boolean {
  return /^\s*unsupported\s*$/i.test(s) || /not\s+supported/i.test(s);
}

export async function assessCapabilities(
  intent: CustomerIntent,
  config: CompiledConfiguration,
  opts: AssessOptions = {},
): Promise<readonly CapabilityAssessment[]> {
  const model =
    opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens =
    opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;

  const result = await callAgent<z.infer<typeof WireResponseZ>>({
    agent: 'capability',
    model,
    max_tokens,
    system: ASSESS_SYSTEM_PROMPT,
    user: buildUserPrompt(intent, config),
    expect_json_schema: (parsed) => WireResponseZ.parse(parsed),
  });

  const nowIso = opts.nowIso ?? new Date().toISOString();

  return result.value.rows.map((row: WireRow, idx) => {
    // Belt-and-braces: if a status synonym snuck past zod, re-tag.
    const safeStatus =
      typeof row.status === 'string' && isUnsupportedLeak(row.status)
        ? 'capability_gap'
        : row.status;

    const customerVisible = safeStatus !== 'capability_gap';

    const assessment: CapabilityAssessment = {
      id: `cap::${intent.id}::${idx}::${nowIso}`,
      intentFragment: row.intentFragment,
      status: safeStatus,
      customerVisible,
      workaroundDescription:
        safeStatus === 'Supported with workaround' ? row.workaroundDescription : null,
      fieldRefs: row.fieldRefs,
    };
    return assessment;
  });
}
