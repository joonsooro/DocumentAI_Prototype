/**
 * F-11 — viewModel projection tests.
 *
 * Pure module — no jsdom needed. Asserts that the customer-surface
 * projection strips capability_gap rows and customerVisible=false rows,
 * which is the structural enforcement for N1 / HAPPY-4.
 */
import { describe, it, expect } from 'vitest';
import {
  projectCapabilitiesForCustomerSurface,
  EMPTY_CUSTOMER_VIEW_MODEL,
} from '@components/customer/viewModel';
import type { CapabilityAssessment } from '@domain/types';

function row(
  id: string,
  status: CapabilityAssessment['status'],
  customerVisible: boolean,
): CapabilityAssessment {
  return {
    id,
    intentFragment: `fragment ${id}`,
    status,
    customerVisible,
    workaroundDescription: status === 'Supported with workaround' ? 'workaround text' : null,
    fieldRefs: [],
  };
}

describe('F-11 projectCapabilitiesForCustomerSurface', () => {
  it('keeps Supported rows', () => {
    const out = projectCapabilitiesForCustomerSurface([row('a', 'Supported', true)]);
    expect(out.length).toBe(1);
    expect(out[0].status).toBe('Supported');
  });

  it('keeps Supported with workaround rows and preserves workaroundDescription', () => {
    const out = projectCapabilitiesForCustomerSurface([row('a', 'Supported with workaround', true)]);
    expect(out.length).toBe(1);
    expect(out[0].status).toBe('Supported with workaround');
    expect(out[0].workaroundDescription).toBe('workaround text');
  });

  it('drops capability_gap rows', () => {
    const out = projectCapabilitiesForCustomerSurface([row('gap-1', 'capability_gap', false)]);
    expect(out).toEqual([]);
  });

  it('drops customerVisible=false rows even if their status looks customer-safe', () => {
    // Defensive: if someone constructs a row with status=Supported but flips
    // customerVisible=false, the projection still respects the flag.
    const out = projectCapabilitiesForCustomerSurface([row('a', 'Supported', false)]);
    expect(out).toEqual([]);
  });

  it('keeps customer-visible rows and drops gaps in a mixed list', () => {
    const out = projectCapabilitiesForCustomerSurface([
      row('s1', 'Supported', true),
      row('g1', 'capability_gap', false),
      row('w1', 'Supported with workaround', true),
      row('g2', 'capability_gap', false),
    ]);
    expect(out.length).toBe(2);
    expect(out.map((r) => r.id).sort()).toEqual(['s1', 'w1']);
  });

  it('EMPTY_CUSTOMER_VIEW_MODEL is frozen and has the expected shape', () => {
    expect(Object.isFrozen(EMPTY_CUSTOMER_VIEW_MODEL)).toBe(true);
    expect(EMPTY_CUSTOMER_VIEW_MODEL.intent).toBeNull();
    expect(EMPTY_CUSTOMER_VIEW_MODEL.configuration).toBeNull();
    expect(EMPTY_CUSTOMER_VIEW_MODEL.assessments).toEqual([]);
    expect(EMPTY_CUSTOMER_VIEW_MODEL.clarifications).toEqual([]);
    expect(EMPTY_CUSTOMER_VIEW_MODEL.readiness).toBeNull();
  });
});
