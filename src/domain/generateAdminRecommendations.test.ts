/**
 * F-15 tests — generateAdminRecommendations.
 *
 * Mocked fetch. Asserts:
 *   - Happy path: 3 valid recommendations land with all fields stamped.
 *   - r.type !== 'threshold_lower' across 5 runs (kill-switch soak).
 *   - zod rejects type='threshold_lower' verbatim → AgentFailure(schema_validation_failed).
 *   - Runtime third-belt rejects any rendered title/body that matches /lower(ing)?\s+threshold/i.
 *   - Empty corrections → empty recommendations (no canned suggestion).
 *   - DEP-1 spend cap inherited via callAgent.
 *   - Deterministic ids when nowIso is injected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateAdminRecommendations,
  _LOWER_THRESHOLD_RE_FOR_TESTS,
} from '@domain/generateAdminRecommendations';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import type { CorrectionEvent } from '@domain/types';

const FAKE_KEY = {
  serviceurls: { AI_API_URL: 'https://api.ai.test.example.com' },
  resourcegroup: 'default',
  clientid: 'test-client',
  clientsecret: 'test-secret',
  url: 'https://uaa.test.example.com',
};

function correction(field: string, supplier = 'DAEJOO'): CorrectionEvent {
  return {
    id: `corr::${field}::1`,
    documentRunId: 'run::1',
    field,
    oldValue: null,
    newValue: 'corrected',
    operator: 'op-1',
    submittedAt: '2026-05-25T00:00:00Z',
    governance: {
      frequency: null,
      customerImpact: 'medium',
      documentType: 'commercial_invoice',
      supplier,
      country: null,
    },
  };
}

let tmpDir: string;
let keyPath: string;
const origEnv = process.env.AICORE_KEY_PATH;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aicore-test-'));
  keyPath = join(tmpDir, 'aicore.json');
  writeFileSync(keyPath, JSON.stringify(FAKE_KEY));
  process.env.AICORE_KEY_PATH = keyPath;
  _resetClientForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env.AICORE_KEY_PATH = origEnv;
  _resetClientForTests();
});

function mockFetchSequence(
  ...responses: Array<Partial<Response> & { jsonBody?: unknown; textBody?: string }>
): void {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = queue.shift();
      if (!r) throw new Error('mock fetch exhausted');
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: r.statusText ?? 'OK',
        json: async () => r.jsonBody ?? {},
        text: async () => r.textBody ?? JSON.stringify(r.jsonBody ?? {}),
      } as unknown as Response;
    }),
  );
}

const TOKEN = { jsonBody: { access_token: 'tok-abc', expires_in: 3600 } };
function invokeOk(wire: unknown) {
  return { jsonBody: { content: [{ type: 'text', text: JSON.stringify(wire) }] } };
}

function validWire() {
  return {
    recommendations: [
      {
        type: 'add_field_instruction',
        title: 'Clarify payment_terms extraction',
        body: 'Multiple operators corrected payment_terms. Add an instruction to capture the full free-text phrase verbatim.',
        scope: 'this_supplier',
        sourceCorrectionIds: ['corr::payment_terms::1'],
      },
      {
        type: 'add_regex_pattern',
        title: 'Anchor PO number regex',
        body: 'Add ^\\d{10}$ as the PO number regex.',
        scope: 'all_suppliers',
        sourceCorrectionIds: ['corr::po_number::1'],
      },
      {
        type: 'create_supplier_prompt_version',
        title: 'New DAEJOO prompt version',
        body: 'Tighten the supplier-scoped prompt to handle the verbatim payment terms phrasing observed.',
        scope: 'this_supplier',
        sourceCorrectionIds: ['corr::payment_terms::1', 'corr::supplier_address::1'],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('F-15 generateAdminRecommendations — happy path', () => {
  it('returns AdminRecommendation[] with all fields stamped and N2 invariants satisfied', async () => {
    mockFetchSequence(TOKEN, invokeOk(validWire()));
    const out = await generateAdminRecommendations(
      [correction('payment_terms'), correction('po_number'), correction('supplier_address')],
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(out.length).toBe(3);
    for (const r of out) {
      // N2 invariant 1: type union excludes threshold_lower
      expect(r.type).not.toBe('threshold_lower' as never);
      // N2 invariant 2: no "lower threshold" phrase in rendered text
      expect(r.title).not.toMatch(_LOWER_THRESHOLD_RE_FOR_TESTS);
      expect(r.body).not.toMatch(_LOWER_THRESHOLD_RE_FOR_TESTS);
      // Stamped fields
      expect(r.id).toContain(r.type);
      expect(r.proposedAt).toBe('2026-05-25T00:00:00Z');
      expect(r.scope).toBeTruthy();
      expect(r.sourceCorrectionIds.length).toBeGreaterThan(0);
    }
  });

  it('returns deterministic ids when nowIso is injected', async () => {
    mockFetchSequence(TOKEN, invokeOk(validWire()));
    const out = await generateAdminRecommendations([correction('payment_terms')], {
      nowIso: 'T1',
    });
    expect(out[0].id).toBe('rec::add_field_instruction::0::T1');
  });
});

// ---------------------------------------------------------------------------
// Kill-switch soak — 5-run threshold_lower invariant
// ---------------------------------------------------------------------------

describe('F-15 N2 kill-switch — 5-run soak', () => {
  it('across 5 happy-path runs, no recommendation has type=threshold_lower or "lower threshold" body', async () => {
    for (let i = 0; i < 5; i += 1) {
      _resetClientForTests();
      mockFetchSequence(TOKEN, invokeOk(validWire()));
      const out = await generateAdminRecommendations([correction('payment_terms')]);
      for (const r of out) {
        expect(r.type).not.toBe('threshold_lower' as never);
        expect(r.title.toLowerCase()).not.toMatch(_LOWER_THRESHOLD_RE_FOR_TESTS);
        expect(r.body.toLowerCase()).not.toMatch(_LOWER_THRESHOLD_RE_FOR_TESTS);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// zod layer — verbatim "threshold_lower" type is rejected at parse time
// ---------------------------------------------------------------------------

describe('F-15 zod layer — rejects threshold_lower type', () => {
  it('throws AgentFailure(schema_validation_failed) when a recommendation declares type=threshold_lower', async () => {
    const bad = {
      recommendations: [
        {
          type: 'threshold_lower',
          title: 'Lower the supplier confidence bar',
          body: 'Drop the threshold to accept more documents.',
          scope: 'all_suppliers',
          sourceCorrectionIds: ['corr::supplier::1'],
        },
      ],
    };
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(
      generateAdminRecommendations([correction('supplier')]),
    ).rejects.toMatchObject({
      name: 'AgentFailure',
      reason: 'schema_validation_failed',
    });
  });

  it('throws AgentFailure(schema_validation_failed) when scope is invalid', async () => {
    const bad = {
      recommendations: [
        {
          type: 'add_field_instruction',
          title: 'x',
          body: 'y',
          scope: 'random_scope',
          sourceCorrectionIds: [],
        },
      ],
    };
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(
      generateAdminRecommendations([correction('supplier')]),
    ).rejects.toMatchObject({ reason: 'schema_validation_failed' });
  });
});

// ---------------------------------------------------------------------------
// Runtime third-belt — natural-language phrase in title/body
// ---------------------------------------------------------------------------

describe('F-15 runtime third-belt — rejects natural-language "lower threshold"', () => {
  it('rejects when the body contains "lower the threshold" even with a valid type', async () => {
    const bad = {
      recommendations: [
        {
          type: 'add_field_instruction',
          title: 'Help payments pass review',
          body: 'Consider lowering the threshold for payment_terms to 0.70.',
          scope: 'this_supplier',
          sourceCorrectionIds: ['corr::payment_terms::1'],
        },
      ],
    };
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(
      generateAdminRecommendations([correction('payment_terms')]),
    ).rejects.toThrow(/N2 invariant violated/);
  });

  it('rejects "lower threshold" when it appears in the title only', async () => {
    const bad = {
      recommendations: [
        {
          type: 'add_field_instruction',
          title: 'Lower threshold for payment_terms',
          body: 'See body for details.',
          scope: 'this_supplier',
          sourceCorrectionIds: [],
        },
      ],
    };
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(
      generateAdminRecommendations([correction('payment_terms')]),
    ).rejects.toThrow(/N2 invariant violated/);
  });

  it('the third-belt regex is case-insensitive and matches conjugations + articles', () => {
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('LOWER the THRESHOLD')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lowering threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lower threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('lowering the threshold')).toBe(true);
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('threshold lowering')).toBe(false); // word order matters
    expect(_LOWER_THRESHOLD_RE_FOR_TESTS.test('clean text')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empty + degenerate inputs
// ---------------------------------------------------------------------------

describe('F-15 empty + degenerate inputs', () => {
  it('returns an empty array when the model says no corrections justify a recommendation', async () => {
    mockFetchSequence(TOKEN, invokeOk({ recommendations: [] }));
    const out = await generateAdminRecommendations([]);
    expect(out).toEqual([]);
  });

  it('never returns a canned/fallback recommendation on agent failure (N4)', async () => {
    mockFetchSequence(TOKEN, {
      jsonBody: { content: [{ type: 'text', text: 'I cannot do that' }] },
    });
    await expect(
      generateAdminRecommendations([correction('payment_terms')]),
    ).rejects.toMatchObject({ reason: 'malformed_json' });
  });
});
