/**
 * F-06 tests — routeCapabilityGaps (A3).
 *
 * Pure function — no fetch mocking needed (no AI Core call). Asserts:
 *   - DAEJOO disposal phrase → ProductSignal (RED-2 path).
 *   - Other gap fragments → ClarificationRequest with the 3 EDGE-1 prompts.
 *   - Supported / Supported-with-workaround rows are pass-through (ignored).
 *   - Every gap row appears in EXACTLY ONE destination (kill switch invariant).
 *   - Each gap row produces EXACTLY ONE routing-log entry.
 *   - ProductSignals are emitted ungoverned (governanceApprovedAt === null).
 */
import { describe, it, expect } from 'vitest';
import { routeCapabilityGaps } from '@domain/routeCapabilityGaps';
import type { CapabilityAssessment, CustomerIntent } from '@domain/types';

const DAEJOO_INTENT: CustomerIntent = {
  id: 'intent::daejoo::v0',
  raw: 'irrelevant for router — router does not read raw',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
};

function gap(id: string, fragment: string, fieldRefs: readonly string[] = []): CapabilityAssessment {
  return {
    id,
    intentFragment: fragment,
    status: 'capability_gap',
    customerVisible: false,
    workaroundDescription: null,
    fieldRefs,
  };
}

function supported(id: string, fragment: string): CapabilityAssessment {
  return {
    id,
    intentFragment: fragment,
    status: 'Supported',
    customerVisible: true,
    workaroundDescription: null,
    fieldRefs: ['some_field'],
  };
}

describe('F-06 routeCapabilityGaps — pass-through behaviour', () => {
  it('returns empty arrays when no rows are capability_gap', () => {
    const out = routeCapabilityGaps(
      [
        supported('cap::1', 'extract supplier'),
        supported('cap::2', 'extract PO'),
      ],
      DAEJOO_INTENT,
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(out.clarifications).toEqual([]);
    expect(out.signals).toEqual([]);
    expect(out.log).toEqual([]);
  });
});

describe('F-06 routeCapabilityGaps — RED-2 disposal phrase → ProductSignal', () => {
  it('routes the DAEJOO disposal phrase to ProductSignal (ungoverned)', () => {
    const out = routeCapabilityGaps(
      [gap('cap::gap::1', 'auto-dispose spent materials at the supplier dock')],
      DAEJOO_INTENT,
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(out.signals.length).toBe(1);
    expect(out.clarifications.length).toBe(0);
    const sig = out.signals[0];
    expect(sig.signalType).toBe('unsupported_free_text_business_condition');
    expect(sig.intentFragment).toContain('dispose');
    expect(sig.documentType).toBe('commercial_invoice');
    expect(sig.governanceApprovedAt).toBeNull(); // F-09 stamps this later
  });

  it('classifies multiple physical-action verbs as signals', () => {
    const out = routeCapabilityGaps(
      [
        gap('cap::g::1', 'dispose of damaged goods on receipt'),
        gap('cap::g::2', 'ship back rejected items same-day'),
        gap('cap::g::3', 'destroy spent solvents per local rule'),
      ],
      DAEJOO_INTENT,
    );
    expect(out.signals.length).toBe(3);
    expect(out.clarifications.length).toBe(0);
  });
});

describe('F-06 routeCapabilityGaps — non-business-condition gaps → ClarificationRequest', () => {
  it('routes a gap with no business-condition verb to ClarificationRequest', () => {
    const out = routeCapabilityGaps(
      [gap('cap::g::1', 'flag invoices with unusual currency conversions')],
      DAEJOO_INTENT,
    );
    expect(out.clarifications.length).toBe(1);
    expect(out.signals.length).toBe(0);
    const cr = out.clarifications[0];
    expect(cr.kind).toBe('missed_field');
    expect(cr.prompts.fieldMeaning).toContain('unusual currency');
    expect(cr.prompts.postingReviewReportingImpact).toMatch(/posting.*review.*reporting/i);
    expect(cr.prompts.supplierScopeApplicability).toMatch(/supplier|document/i);
  });

  it('routes a gap with fieldRefs to ClarificationRequest even if the fragment names a physical verb (fieldRefs override)', () => {
    // The predicate requires BOTH no fieldRefs AND a verb match. So a fragment
    // like "dispose of records older than 7 years" that happens to map to a
    // schema field (e.g. retention_date) should ask the customer how to
    // handle it, not silently become a roadmap signal.
    const out = routeCapabilityGaps(
      [gap('cap::g::1', 'dispose of records older than 7 years', ['retention_date'])],
      DAEJOO_INTENT,
    );
    expect(out.clarifications.length).toBe(1);
    expect(out.signals.length).toBe(0);
  });
});

describe('F-06 routeCapabilityGaps — kill-switch invariants (10-min)', () => {
  it('every gap fragment appears in EXACTLY ONE destination (never both, never neither)', () => {
    const gaps = [
      gap('cap::g::1', 'auto-dispose spent materials'),
      gap('cap::g::2', 'flag invoices with unusual currency conversions'),
      gap('cap::g::3', 'destroy paperwork after 5 years'),
      gap('cap::g::4', 'aggregate line items by HS chapter'),
    ];
    const out = routeCapabilityGaps(gaps, DAEJOO_INTENT, { nowIso: '2026-05-25T00:00:00Z' });
    // Total routed = total gaps
    expect(out.clarifications.length + out.signals.length).toBe(gaps.length);
    // No id collisions (would imply double-routing)
    const allIds = [...out.clarifications.map((c) => c.id), ...out.signals.map((s) => s.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('routing log has one entry per gap row with a recorded destination + rationale', () => {
    const gaps = [
      gap('cap::g::1', 'auto-dispose spent materials'),
      gap('cap::g::2', 'flag invoices with unusual currency conversions'),
    ];
    const out = routeCapabilityGaps(gaps, DAEJOO_INTENT);
    expect(out.log.length).toBe(2);
    for (const entry of out.log) {
      expect(['clarification', 'signal']).toContain(entry.destination);
      expect(entry.rationale.length).toBeGreaterThan(0);
      expect(entry.assessmentId).toMatch(/^cap::g::/);
    }
  });

  it('Supported and Supported-with-workaround rows are pass-through (never routed)', () => {
    const rows: CapabilityAssessment[] = [
      supported('cap::s::1', 'extract supplier'),
      {
        id: 'cap::w::1',
        intentFragment: 'exclude no-commercial-value lines',
        status: 'Supported with workaround',
        customerVisible: true,
        workaroundDescription: 'Filter line items where commercial_value_indicator === false.',
        fieldRefs: ['payable_amount', 'commercial_value_indicator'],
      },
      gap('cap::g::1', 'auto-dispose spent materials'),
    ];
    const out = routeCapabilityGaps(rows, DAEJOO_INTENT, { nowIso: '2026-05-25T00:00:00Z' });
    expect(out.log.length).toBe(1); // only the gap row routed
    expect(out.signals.length).toBe(1);
    expect(out.clarifications.length).toBe(0);
  });
});

describe('F-06 routeCapabilityGaps — id determinism', () => {
  it('ids are deterministic when nowIso is injected', () => {
    const gaps = [gap('cap::g::1', 'auto-dispose spent materials')];
    const a = routeCapabilityGaps(gaps, DAEJOO_INTENT, { nowIso: '2026-05-25T00:00:00Z' });
    const b = routeCapabilityGaps(gaps, DAEJOO_INTENT, { nowIso: '2026-05-25T00:00:00Z' });
    expect(a.signals[0].id).toBe(b.signals[0].id);
  });
});
