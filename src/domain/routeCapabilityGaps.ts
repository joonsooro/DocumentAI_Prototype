/**
 * F-06 — Capability-Gap Router (A3).
 *
 * Contract pointer: U6. Reads CapabilityAssessment[] (output of F-05) and the
 * original CustomerIntent, then routes every status='capability_gap' row to
 * EXACTLY ONE of:
 *   - ClarificationRequest[] — customer-facing, with the 3 EDGE-1 prompts.
 *   - ProductSignal[] (ungoverned) — internal-only candidate that F-09 will
 *     later gate against the OQ-2 governance thresholds. `governanceApprovedAt`
 *     is null on emission here; F-09 stamps it after the threshold check.
 *
 * Routing predicate (the load-bearing design call):
 *   A capability_gap fragment describes a "free-text business condition"
 *   (signal-track) when ALL of the following hold:
 *     (1) the fragment maps to NO SchemaField (fieldRefs is empty), AND
 *     (2) the fragment names an action that operates on PHYSICAL OR
 *         OPERATIONAL things outside the document data model — disposal,
 *         shipping, storage, handling, return, transport, destruction.
 *   Otherwise the gap is a clarification-track: the customer should be asked
 *   what they meant so we can add a schema field or instruction.
 *
 *   The DAEJOO material-disposal phrase (RED-2) hits this predicate by
 *   construction: it names "dispose" on a physical thing ("spent materials")
 *   and has no fieldRefs. It becomes a ProductSignal with
 *   signalType='unsupported_free_text_business_condition' and is HIDDEN from
 *   the Customer Workspace (contained per Internal screen's "containment"
 *   guard in app-spec.json#screens[2]).
 *
 * Done-when (per app/feature-list.json):
 *   - Every capability_gap CapabilityAssessment lands in EXACTLY ONE of
 *     clarifications | signals — never both, never neither.
 *   - Each route decision is recorded in the returned `routingLog` (one
 *     entry per gap row).
 *
 * Kill switch (10 min): if any single fragment routes to both or neither in
 * 2 of 3 test runs, halt and re-define the predicate. Enforced here at the
 * function level — the routing loop is total (every gap input produces
 * exactly one output) by construction.
 *
 * Non-goals:
 *   - F-06 does NOT promote ProductSignals to "approved" — that's F-09.
 *   - F-06 does NOT touch Supported / Supported-with-workaround rows.
 *   - F-06 is pure / deterministic / no AI Core call. Routing is rule-based;
 *     the prompt-based agent classification already happened in F-05.
 */

import type {
  CapabilityAssessment,
  ClarificationRequest,
  ClarificationPrompts,
  CustomerIntent,
  ProductSignal,
} from '@domain/types';

// ---------------------------------------------------------------------------
// Routing predicate
// ---------------------------------------------------------------------------

/**
 * Verbs that signal a "physical/operational action outside the data model".
 * Intentionally narrow — only verbs that, when paired with a noun describing
 * a tangible thing, mean "do something with stuff in the real world" rather
 * than "record/validate/extract a value on the document". Adjust ONLY when a
 * concrete new evidence row arrives; do not expand on hunches.
 */
const BUSINESS_CONDITION_VERB_PATTERNS: readonly RegExp[] = [
  /\bdispose(?:d|s|al)?\b/i,
  /\bdestroy(?:ed|s|ing)?\b/i,
  /\bship(?:ped|ping)?\b/i,
  /\bdeliver(?:ed|s|ing|y)?\b/i,
  /\btransport(?:ed|s|ing|ation)?\b/i,
  /\breturn(?:ed|s|ing)?\b/i,
  /\bstore(?:d|s|age)?\b/i,
  /\bhandle(?:d|s|ing)?\b/i,
  /\bauto-\w+/i, // "auto-dispose", "auto-route", "auto-ship"…
];

export type RouteDestination = 'clarification' | 'signal';

export interface RoutingLogEntry {
  readonly assessmentId: CapabilityAssessment['id'];
  readonly fragment: string;
  readonly destination: RouteDestination;
  readonly rationale: string;
}

export interface RoutingResult {
  readonly clarifications: readonly ClarificationRequest[];
  readonly signals: readonly ProductSignal[];
  readonly log: readonly RoutingLogEntry[];
}

export interface RouteOptions {
  /** Injectable for deterministic id stamping in tests. */
  readonly nowIso?: string;
}

function classify(row: CapabilityAssessment): {
  destination: RouteDestination;
  rationale: string;
} {
  const noFieldRef = row.fieldRefs.length === 0;
  const matchedVerb = BUSINESS_CONDITION_VERB_PATTERNS.find((re) =>
    re.test(row.intentFragment),
  );
  if (noFieldRef && matchedVerb) {
    return {
      destination: 'signal',
      rationale: `no fieldRefs + business-condition verb pattern matched (${matchedVerb.source})`,
    };
  }
  return {
    destination: 'clarification',
    rationale: noFieldRef
      ? 'no fieldRefs but no business-condition verb — ask customer to clarify schema mapping'
      : 'fieldRefs present — ask customer to clarify how to handle this requirement on those fields',
  };
}

// ---------------------------------------------------------------------------
// Builders — small + boring; no AI Core involved
// ---------------------------------------------------------------------------

function buildClarificationPrompts(fragment: string): ClarificationPrompts {
  // The 3 EDGE-1 prompts. F-07 will generate identical-shape prompts for
  // missed/low-confidence fields; here they're keyed off the intent
  // fragment rather than a field name.
  return {
    fieldMeaning: `What exactly does "${fragment}" mean in your business process?`,
    postingReviewReportingImpact: `How should this affect posting, review, or reporting decisions for the document?`,
    supplierScopeApplicability: `Does this apply to all suppliers, only this supplier, or only certain document types?`,
  };
}

function buildClarification(
  row: CapabilityAssessment,
  intent: CustomerIntent,
  nowIso: string,
  idx: number,
): ClarificationRequest {
  return {
    id: `clar::route::${row.id}::${idx}::${nowIso}`,
    kind: 'missed_field',
    field: null, // gap fragments don't map to a single field
    documentRunId: null, // pre-extraction; F-07 handles per-run clarifications
    prompts: buildClarificationPrompts(row.intentFragment),
    operatorFacingError: null,
    raisedAt: nowIso,
  };
  // intent retained as a parameter for future supplier-scoping signal; not
  // referenced in the current ClarificationRequest shape.
  void intent;
}

function buildProductSignal(
  row: CapabilityAssessment,
  intent: CustomerIntent,
  nowIso: string,
  idx: number,
): ProductSignal {
  return {
    id: `sig::route::${row.id}::${idx}::${nowIso}`,
    signalType: 'unsupported_free_text_business_condition',
    category: `${intent.documentType} / business-condition gap`,
    intentFragment: row.intentFragment,
    suggestedProductArea: 'document-ai roadmap intake',
    // Governance fields default to "unknown / unset". F-09 fills these in
    // and approves; until then, the signal is ungoverned and MUST stay
    // contained in the Internal workspace.
    frequency: 1,
    customerImpact: 'medium',
    documentType: intent.documentType,
    supplier: null,
    country: null,
    sourceCorrectionIds: [],
    governanceApprovedAt: null, // F-09 stamps this; null = ungoverned
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function routeCapabilityGaps(
  assessments: readonly CapabilityAssessment[],
  intent: CustomerIntent,
  opts: RouteOptions = {},
): RoutingResult {
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const clarifications: ClarificationRequest[] = [];
  const signals: ProductSignal[] = [];
  const log: RoutingLogEntry[] = [];

  // Filter to gap rows only. Supported / Supported-with-workaround rows are
  // pass-through — F-06 does not touch them. (They stay on the customer
  // surface where F-05 already classified them.)
  const gaps = assessments.filter((a) => a.status === 'capability_gap');

  gaps.forEach((row, idx) => {
    const { destination, rationale } = classify(row);
    log.push({
      assessmentId: row.id,
      fragment: row.intentFragment,
      destination,
      rationale,
    });
    if (destination === 'signal') {
      signals.push(buildProductSignal(row, intent, nowIso, idx));
    } else {
      clarifications.push(buildClarification(row, intent, nowIso, idx));
    }
  });

  return Object.freeze({ clarifications, signals, log });
}
