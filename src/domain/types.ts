/**
 * Domain types — Document AI Self-Improvement Flywheel
 * Feature: F-01 (contract pointer: U1)
 *
 * Source of truth: app/spec.html §8 Implementation Notes.
 * Acceptance (per app/feature-list.json):
 *   - tsc --noEmit passes with all 14 types exported
 *   - each type imported by ≥1 other module (satisfied incrementally by F-02…F-20)
 *
 * Order below matches the spec §8 type list. Internal cross-references are
 * by type name, NOT by re-declaration, so each type is defined exactly once.
 */

// ---------------------------------------------------------------------------
// 1. CustomerIntent — free-text prose from the admin describing what the
//    extraction must capture. Consumed by F-04 compile agent and F-05 capability
//    assessment agent.
// ---------------------------------------------------------------------------
export interface CustomerIntent {
  readonly id: string;
  readonly raw: string;
  readonly documentType: 'commercial_invoice' | string;
  readonly capturedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// 2. CompiledConfiguration — output of F-04 compile agent. Carries schema
//    fields, instructions, validation, regex, thresholds, processing mode.
//    Consumed by F-05, F-07, F-10, F-03 (mock extractor reads schema only).
// ---------------------------------------------------------------------------
export type ProcessingMode = 'auto_confirm' | 'review_required' | 'blocked';

export interface SchemaField {
  readonly name: string;
  readonly dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  readonly required: boolean;
  readonly instruction: string;
  readonly validation: string | null;
  readonly regex: string | null;
  readonly confidenceThreshold: number;
  readonly enumValues?: readonly string[];
}

export interface CompiledConfiguration {
  readonly id: string;
  readonly intentId: CustomerIntent['id'];
  readonly schema: { readonly fields: readonly SchemaField[] };
  readonly processingMode: ProcessingMode;
  readonly source: 'aiCore' | 'mock';
  readonly templateUsed: false; // HAPPY-3 / A1: must never be a template lookup
  readonly compiledAt: string;
}

// ---------------------------------------------------------------------------
// 3. CapabilityAssessment — output of F-05. One row per requirement fragment.
//    Customer-visible statuses are constrained to "Supported" or "Supported with
//    workaround" only (HAPPY-4 / N1). Internal statuses (gap-routed to
//    ProductSignal) are tagged as `customerVisible: false` and never rendered
//    in the Customer Workspace.
// ---------------------------------------------------------------------------
export type CustomerVisibleStatus = 'Supported' | 'Supported with workaround';
export type InternalOnlyStatus = 'capability_gap'; // routed to ProductSignal, hidden from customer

export interface CapabilityAssessment {
  readonly id: string;
  readonly intentFragment: string;
  readonly status: CustomerVisibleStatus | InternalOnlyStatus;
  readonly customerVisible: boolean; // true => render in Customer Workspace
  readonly workaroundDescription: string | null;
  readonly fieldRefs: readonly string[]; // SchemaField.name list this fragment maps to
}

// ---------------------------------------------------------------------------
// 4. DocumentRun — output of F-03 mock extractor + downstream stamp from
//    F-10 readiness agent. Field values may be null when extraction missed
//    or low-confidence (triggers F-07 ClarificationRequest).
// ---------------------------------------------------------------------------
export interface ExtractedField {
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly confidence: number; // 0..1
  readonly evidence: string | null; // source text from the document
}

export interface DocumentRun {
  readonly id: string;
  readonly documentPath: string; // canonical asset path under app/assets — never the original local-download path (N8 / F-14)
  readonly configurationId: CompiledConfiguration['id'];
  readonly extractedFields: readonly ExtractedField[];
  readonly extractedAt: string;
  readonly source: 'mock' | 'live_ocr'; // v1 is always 'mock' per N6
}

// ---------------------------------------------------------------------------
// 5. ReadinessDecision — output of F-10. Status routes the document; reasons
//    carry the 5 mandatory keys (field, evidence, rule, confidence, nextAction)
//    per A7 / HAPPY-5.
// ---------------------------------------------------------------------------
export type ReadinessStatus = 'Ready' | 'Needs review' | 'Blocked' | 'Needs downstream validation';

export interface OperationalReason {
  readonly field: string;
  readonly evidence: string;
  readonly rule: string;
  readonly confidence: number;
  readonly nextAction: string;
}

export interface ReadinessDecision {
  readonly id: string;
  readonly documentRunId: DocumentRun['id'];
  readonly status: ReadinessStatus;
  readonly reasons: readonly OperationalReason[];
  readonly decidedAt: string;
}

// ---------------------------------------------------------------------------
// 6. ExceptionReason — typed cause carried by a failed agent path or a
//    rejected readiness decision. Distinct from OperationalReason (which is
//    the business-language reason rendered to the admin).
// ---------------------------------------------------------------------------
export type ExceptionKind =
  | 'agent_failure'
  | 'agent_timeout'
  | 'agent_malformed_json'
  | 'extraction_missing_required_field'
  | 'extraction_low_confidence'
  | 'workaround_unconfirmed_for_supplier'
  | 'threshold_not_met';

export interface ExceptionReason {
  readonly kind: ExceptionKind;
  readonly agent: string | null; // null when not agent-sourced
  readonly field: string | null;
  readonly detail: string;
  readonly raisedAt: string;
}

// ---------------------------------------------------------------------------
// 7. ClarificationRequest — output of F-07 (per missed/low-confidence field)
//    and F-08 (per agent failure). Customer-facing alternative to "Unsupported"
//    per HAPPY-4. Carries the 3 EDGE-1 prompts.
// ---------------------------------------------------------------------------
export type ClarificationKind = 'missed_field' | 'low_confidence' | 'agent_failure_surface';

export interface ClarificationPrompts {
  readonly fieldMeaning: string;
  readonly postingReviewReportingImpact: string;
  readonly supplierScopeApplicability: string;
}

export interface ClarificationRequest {
  readonly id: string;
  readonly kind: ClarificationKind;
  readonly field: string | null;
  readonly documentRunId: DocumentRun['id'] | null;
  readonly prompts: ClarificationPrompts;
  readonly operatorFacingError: string | null; // populated only for agent_failure_surface
  readonly raisedAt: string;
}

// ---------------------------------------------------------------------------
// 8. CorrectionEvent — operator-supplied field correction submitted via F-16.
//    Enters the governance queue but DOES NOT auto-promote to ProductSignal
//    (A6 / N5). Governance fields populated lazily by F-09.
// ---------------------------------------------------------------------------
export interface CorrectionEvent {
  readonly id: string;
  readonly documentRunId: DocumentRun['id'];
  readonly field: string;
  readonly oldValue: string | number | boolean | null;
  readonly newValue: string | number | boolean | null;
  readonly operator: string;
  readonly submittedAt: string;
  readonly governance: {
    readonly frequency: number | null;
    readonly customerImpact: 'low' | 'medium' | 'high' | null;
    readonly documentType: string;
    readonly supplier: string | null;
    readonly country: string | null;
  };
}

// ---------------------------------------------------------------------------
// 9. AdminRecommendation — output of F-15. Schema/prompt/instruction
//    recommendations only. `type === 'threshold_lower'` is forbidden by
//    N2/RED-1; the type union below intentionally omits it so the compiler
//    enforces the constraint at every callsite.
// ---------------------------------------------------------------------------
export type AdminRecommendationType =
  | 'add_field_instruction'
  | 'add_schema_field'
  | 'add_validation_rule'
  | 'add_regex_pattern'
  | 'create_supplier_prompt_version'
  | 'add_reusable_rule';
// NOTE: 'threshold_lower' is deliberately NOT in this union (N2 / RED-1).

export interface AdminRecommendation {
  readonly id: string;
  readonly type: AdminRecommendationType;
  readonly title: string;
  readonly body: string; // rendered text; ESLint forbids /lower(ing)?\s+threshold/i
  readonly scope: 'this_document' | 'this_supplier' | 'all_suppliers';
  readonly sourceCorrectionIds: readonly CorrectionEvent['id'][];
  readonly proposedAt: string;
}

// ---------------------------------------------------------------------------
// 10. PromptVersion — managed by the Admin Control Plane prompt-version UI.
//     Pairs with AdminRecommendation when a 'create_supplier_prompt_version'
//     recommendation is accepted.
// ---------------------------------------------------------------------------
export interface PromptVersion {
  readonly id: string;
  readonly agent: string; // e.g. 'compile', 'capability', 'readiness'
  readonly version: string; // semver-like
  readonly supplier: string | null; // null => default
  readonly promptText: string;
  readonly createdAt: string;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// 11. QualityMetric — F-18 observability log entry. Mirrored to browser
//     console and rendered in the Internal Product Intelligence workspace.
//     Every U4/U5/U6/U10/U11/U13 (i.e. F-04…F-15 agent) call appends ≥1.
// ---------------------------------------------------------------------------
export type QualityMetricStatus = 'success' | 'fail';

export interface QualityMetric {
  readonly id: string;
  readonly agent: string;
  readonly status: QualityMetricStatus;
  readonly latencyMs: number | null;
  readonly tokenUsage: { readonly input: number; readonly output: number } | null;
  readonly model: string | null;
  readonly maxTokens: number | null;
  readonly error: string | null; // populated when status === 'fail'
  readonly loggedAt: string;
}

// ---------------------------------------------------------------------------
// 12. ProductSignal — output of F-09 signal governance gate. Surfaced ONLY
//     in the Internal Product Intelligence workspace. The DAEJOO material-
//     disposal phrase, when seen, becomes one of these with
//     signalType: 'unsupported_free_text_business_condition' per RED-2.
// ---------------------------------------------------------------------------
export type ProductSignalType =
  | 'unsupported_free_text_business_condition'
  | 'capability_gap_workaround_heavy'
  | 'recurring_correction_pattern'
  | 'schema_field_ambiguity'
  | 'extraction_regression';

// F-27 amendment (S1.AMEND § 8): 6 new fields land on ProductSignal.
// All are marked optional here so the 17 features that construct
// ProductSignals (F-06 router emit, F-09 governance promotion via the
// F-16 escape hatch) keep compiling without per-call-site touch-ups.
// F-25 ranking consumes the 4 ranking fields via its own structural
// RoadmapRankingInput intersection type, so the optional shape here is
// safe. F-13 / F-29 surface the status + provenance fields when present.
export type ProductSignalStatus = 'provisional' | 'governance_approved';
export type ProductSignalProvenance =
  | 'governance_promotion'
  | 'conversational_notify_team'
  | 'curated_v1';
export type WorkaroundBurden = 'none' | 'low' | 'medium' | 'high';
export type ProductSignalActionability = 'low' | 'medium' | 'high';

export interface ProductSignal {
  readonly id: string;
  readonly signalType: ProductSignalType;
  readonly category: string; // e.g. 'commercial invoice / logistics compliance'
  readonly intentFragment: string | null;
  readonly suggestedProductArea: string;
  readonly frequency: number;
  readonly customerImpact: 'low' | 'medium' | 'high';
  readonly documentType: string;
  readonly supplier: string | null;
  readonly country: string | null;
  readonly sourceCorrectionIds: readonly CorrectionEvent['id'][];
  readonly governanceApprovedAt: string | null; // null until A6 gate clears

  // F-27 / S1.AMEND § 8 — optional in v1 so the existing F-06/F-09
  // emission paths keep compiling. F-25 ranking + F-29 status surface
  // both gracefully fall back when these are absent.
  readonly customerCount?: number;
  readonly workaroundBurden?: WorkaroundBurden;
  readonly actionability?: ProductSignalActionability;
  readonly expectedStpLift?: number;
  readonly status?: ProductSignalStatus;
  readonly provenance?: ProductSignalProvenance;
}

// ---------------------------------------------------------------------------
// 13. RegressionSignal — output of F-17. Detected when accuracy drops across
//     prompt-version or model-version boundaries. Rendered in the Internal
//     workspace regression panel.
// ---------------------------------------------------------------------------
export interface RegressionSignal {
  readonly id: string;
  readonly metric: 'field_accuracy' | 'readiness_precision' | 'clarification_rate';
  readonly field: string | null; // null when metric is aggregate
  readonly beforeValue: number;
  readonly afterValue: number;
  readonly delta: number; // afterValue - beforeValue; negative => regression
  readonly boundary: { readonly kind: 'prompt_version' | 'model_version'; readonly fromId: string; readonly toId: string };
  readonly detectedAt: string;
}

// ---------------------------------------------------------------------------
// 14. CapabilityGap — analytics-grade rollup over CapabilityAssessment +
//     ProductSignal, ranked by frequency × customerImpact × supplier-count.
//     Powers the Internal workspace "capability gap analytics" panel.
// ---------------------------------------------------------------------------
export interface CapabilityGap {
  readonly id: string;
  readonly description: string;
  readonly frequency: number;
  readonly customerImpact: 'low' | 'medium' | 'high';
  readonly documentTypes: readonly string[];
  readonly suppliers: readonly string[];
  readonly countries: readonly string[];
  readonly actionability: 'short_term' | 'medium_term' | 'long_term';
  readonly relatedSignalIds: readonly ProductSignal['id'][];
  readonly rolledUpAt: string;
}

// ---------------------------------------------------------------------------
// 15. ChatTurn — F-27 / S1.AMEND § 8. A single turn in the Customer
//     Workspace chat thread. The 6-kind union pins exactly which bubble
//     types F-27 ChatPanel renders + which the F-28 chat.turn_decide
//     agent can produce; new kinds require both a contract amendment
//     and a UI update.
// ---------------------------------------------------------------------------
export type ChatTurnKind =
  | 'message'
  | 'clarification_question'
  | 'recompile_announcement'
  | 'notify_team_question'
  | 'notify_team_confirmation'
  | 'success_summary';

export interface ChatTurnRefs {
  readonly fields?: readonly string[];
  readonly capabilityGapClass?: string;
}

export interface ChatTurn {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string; // ISO 8601
  readonly kind: ChatTurnKind;
  readonly refs?: ChatTurnRefs;
}

// ---------------------------------------------------------------------------
// 16. ConversationState — F-27 / S1.AMEND § 8. The full chat session
//     for the Customer Workspace. In-memory only per SUB-2 (scoped to
//     the browser tab; lost on reload). compiledConfigVersionRefs
//     orders the CompiledConfiguration ids produced as the conversation
//     progresses (length increments on each F-28 'recompile' decision).
// ---------------------------------------------------------------------------
export type ConversationStatus =
  | 'collecting'
  | 'recompiling'
  | 'success'
  | 'awaiting_notify_decision'
  | 'completed';

export interface ConversationState {
  readonly id: string;
  readonly turns: readonly ChatTurn[];
  readonly compiledConfigVersionRefs: readonly CompiledConfiguration['id'][];
  readonly status: ConversationStatus;
}
