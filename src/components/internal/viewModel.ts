/**
 * F-13 — Internal Product Intelligence view-model.
 *
 * Same projection pattern as F-11 (customer) and F-12 (admin). The
 * Internal workspace is the ONE place where hidden-from-customer
 * signals are allowed to surface — RED-2's containment guard. So this
 * view-model intentionally INCLUDES ProductSignal, RegressionSignal,
 * the QualityMetric log, and the DAEJOO material-disposal phrase
 * (rendered as a signal_type='unsupported_free_text_business_condition'
 * row in the dedicated panel, NEVER as raw remark text).
 *
 * The containment direction is enforced by the THREE-WORKSPACE
 * SEPARATION test on the customer + admin routes: those route DOMs
 * have no internal- data-testids, so anything rendered here cannot
 * leak back.
 *
 * QualityMetric history is NOT held in the view-model directly — the
 * route subscribes to the F-18 log store and re-renders. This lets
 * the Internal workspace stay reactive without the eval harness having
 * to snapshot the log into the model.
 */
import type {
  CapabilityGap,
  CorrectionEvent,
  ProductSignal,
  RegressionSignal,
} from '@domain/types';

export interface InternalViewModel {
  /** ProductSignals awaiting governance approval — F-09 candidate row + reason. */
  readonly governanceQueue: readonly {
    readonly candidateKey: string;
    readonly fragment: string | null;
    readonly frequency: number;
    readonly distinctSuppliers: number;
    readonly aggregateImpact: 'low' | 'medium' | 'high' | null;
    readonly approved: boolean;
    readonly reason: string;
  }[];
  /** All approved signals — F-09 output stored via F-16's escape hatch. */
  readonly approvedSignals: readonly ProductSignal[];
  /** Regression detector output (F-17). */
  readonly regressionSignals: readonly RegressionSignal[];
  /** Aggregate gap rollups (CapabilityGap from @domain/types). */
  readonly capabilityGaps: readonly CapabilityGap[];
  /** All in-store corrections (for the governance queue context). */
  readonly corrections: readonly CorrectionEvent[];
}

export const EMPTY_INTERNAL_VIEW_MODEL: InternalViewModel = Object.freeze({
  governanceQueue: [],
  approvedSignals: [],
  regressionSignals: [],
  capabilityGaps: [],
  corrections: [],
});

/**
 * Partition approvedSignals into the four signal-type categories we render
 * separately. The DAEJOO disposal-phrase signal renders in its own panel
 * per RED-2.
 */
export function partitionApprovedSignals(
  signals: readonly ProductSignal[],
): {
  readonly unsupportedFreeText: readonly ProductSignal[];
  readonly recurringCorrections: readonly ProductSignal[];
  readonly other: readonly ProductSignal[];
} {
  const unsupportedFreeText: ProductSignal[] = [];
  const recurringCorrections: ProductSignal[] = [];
  const other: ProductSignal[] = [];
  for (const s of signals) {
    if (s.signalType === 'unsupported_free_text_business_condition') {
      unsupportedFreeText.push(s);
    } else if (s.signalType === 'recurring_correction_pattern') {
      recurringCorrections.push(s);
    } else {
      other.push(s);
    }
  }
  return { unsupportedFreeText, recurringCorrections, other };
}
