/**
 * F-11 — Customer Workspace view-model.
 *
 * The customer screen ONLY renders fields that pass through this
 * view-model. The screen has no other source of state, so anything the
 * customer sees was demonstrably approved by the projection step. This
 * makes the negative-contract guards a property of the type system, not
 * a property of render code.
 *
 * Negative-contract guards (from app/contract.html §2 Screen 1):
 *   - no "Unsupported" — the projection drops every CapabilityAssessment
 *     where customerVisible === false. status is then narrowed to
 *     CustomerVisibleStatus only.
 *   - no raw prompts — the readiness reasons are run through F-10's
 *     generateOperationalReasons sanitiser before they get here.
 *   - no DAEJOO material-disposal phrase — that phrase travels as a
 *     ProductSignal (Internal-only). It is NOT in the customer
 *     view-model; the type system forbids ProductSignal here.
 *   - no roadmap-candidate signals — same shape: ProductSignal is not
 *     in this type at all.
 */
import type {
  CapabilityAssessment,
  ClarificationRequest,
  CompiledConfiguration,
  CustomerIntent,
  CustomerVisibleStatus,
  ReadinessDecision,
} from '@domain/types';

/**
 * A capability row that has already been narrowed to the customer-visible
 * status union. By construction this CANNOT carry 'capability_gap' (which
 * is InternalOnlyStatus in @domain/types).
 */
export interface CustomerVisibleCapabilityAssessment {
  readonly id: string;
  readonly intentFragment: string;
  readonly status: CustomerVisibleStatus; // 'Supported' | 'Supported with workaround'
  readonly workaroundDescription: string | null;
  readonly fieldRefs: readonly string[];
}

/**
 * The complete customer-surface state. NOTE: no ProductSignal field,
 * no QualityMetric, no remark_freetext — all four negative-contract
 * guards are enforced structurally.
 */
export interface CustomerViewModel {
  readonly intent: CustomerIntent | null;
  readonly configuration: CompiledConfiguration | null;
  readonly assessments: readonly CustomerVisibleCapabilityAssessment[];
  readonly clarifications: readonly ClarificationRequest[];
  readonly readiness: ReadinessDecision | null;
}

/**
 * Project an unsanitised CapabilityAssessment[] (which may contain
 * capability_gap rows) into the customer-safe subset. This is the
 * one place where the negative-contract guard fires.
 *
 * The function name is deliberately verbose so the call site reads
 * like an audit statement.
 */
export function projectCapabilitiesForCustomerSurface(
  assessments: readonly CapabilityAssessment[],
): readonly CustomerVisibleCapabilityAssessment[] {
  return assessments
    .filter((a): a is CapabilityAssessment & { status: CustomerVisibleStatus } =>
      a.customerVisible && a.status !== 'capability_gap',
    )
    .map((a) => ({
      id: a.id,
      intentFragment: a.intentFragment,
      status: a.status,
      workaroundDescription: a.workaroundDescription,
      fieldRefs: a.fieldRefs,
    }));
}

/** Empty view-model — initial render state before any compile call lands. */
export const EMPTY_CUSTOMER_VIEW_MODEL: CustomerViewModel = Object.freeze({
  intent: null,
  configuration: null,
  assessments: [],
  clarifications: [],
  readiness: null,
});
