/**
 * F-12 — Admin view-model projection tests.
 *
 * Pure module. Asserts filterRecommendationsForAdminSurface() drops the
 * forbidden N2 / RED-1 entries even if the type system was bypassed via
 * a cast or a JSON load (defensive — the F-15 agent already has three
 * upstream layers).
 */
import { describe, it, expect } from 'vitest';
import {
  filterRecommendationsForAdminSurface,
  EMPTY_ADMIN_VIEW_MODEL,
  _LOWER_THRESHOLD_RE_FOR_TESTS,
} from '@components/admin/viewModel';
import type { AdminRecommendation, AdminRecommendationType } from '@domain/types';

function rec(
  id: string,
  type: AdminRecommendationType | 'threshold_lower',
  title: string,
  body: string,
): AdminRecommendation {
  return {
    id,
    type: type as AdminRecommendationType,
    title,
    body,
    scope: 'all_suppliers',
    sourceCorrectionIds: [],
    proposedAt: '2026-05-25T00:00:00Z',
  };
}

describe('F-12 filterRecommendationsForAdminSurface', () => {
  it('keeps recommendations with allowed types and clean text', () => {
    const out = filterRecommendationsForAdminSurface([
      rec('a', 'add_field_instruction', 'Clarify payment_terms', 'Add a clearer instruction.'),
      rec('b', 'add_regex_pattern', 'Anchor PO regex', 'Add ^\\d{10}$.'),
    ]);
    expect(out.length).toBe(2);
  });

  it('drops a recommendation whose type was cast to "threshold_lower" (TS bypass via JSON load)', () => {
    const out = filterRecommendationsForAdminSurface([
      rec('a', 'add_field_instruction', 'ok title', 'ok body'),
      rec('b', 'threshold_lower', 'looks innocuous', 'no synonym either'),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('a');
  });

  it('drops a recommendation whose title matches /lower(ing)? (the )?threshold/i', () => {
    const out = filterRecommendationsForAdminSurface([
      rec('a', 'add_field_instruction', 'Lower the threshold for payment_terms', 'see body'),
      rec('b', 'add_field_instruction', 'clean title', 'clean body'),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('b');
  });

  it('drops a recommendation whose body matches the forbidden phrase (any case)', () => {
    const out = filterRecommendationsForAdminSurface([
      rec('a', 'add_field_instruction', 'clean', 'Consider lowering the threshold for payment_terms.'),
      rec('b', 'add_field_instruction', 'clean', 'Other recommendation.'),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('b');
  });

  it('regex matches conjugations + optional article', () => {
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lower threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lowering threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('LOWER the THRESHOLD')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lowering the threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('threshold lowering')).toBe(false);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('clean text')).toBe(false);
  });

  it('EMPTY_ADMIN_VIEW_MODEL is frozen and has the expected shape', () => {
    expect(Object.isFrozen(EMPTY_ADMIN_VIEW_MODEL)).toBe(true);
    expect(EMPTY_ADMIN_VIEW_MODEL.promptVersions).toEqual([]);
    expect(EMPTY_ADMIN_VIEW_MODEL.thresholdInspector.configuration).toBeNull();
    expect(EMPTY_ADMIN_VIEW_MODEL.thresholdInspector.stagedOverrides).toEqual([]);
    expect(EMPTY_ADMIN_VIEW_MODEL.autoConfirmCriteria).toEqual([]);
    expect(EMPTY_ADMIN_VIEW_MODEL.schemaQuality).toEqual([]);
    expect(EMPTY_ADMIN_VIEW_MODEL.correctionTrend).toEqual([]);
    expect(EMPTY_ADMIN_VIEW_MODEL.recommendations).toEqual([]);
  });
});
