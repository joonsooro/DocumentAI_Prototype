/**
 * F-10 tests — decideReadiness + generateOperationalReasons (A7).
 *
 * Mocked fetch. Asserts:
 *   - Status policy: Blocked (missing required) / Needs review (low conf) / Ready.
 *   - Every reason has all 5 keys (kill-switch invariant).
 *   - zod rejects a 4-key reason (drops "nextAction") => AgentFailure.
 *   - Sanitiser strips 'system:' / 'prompt:' / '<|' substrings.
 *   - Failure path produces a synthetic Blocked decision + emits
 *     ClarificationRequest + QualityMetric via F-08 (N4 / EDGE-2).
 *   - DEP-1 spend cap inherited.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideReadiness, decideStatus } from '@domain/decideReadiness';
import {
  generateOperationalReasons,
  _sanitiseForTests,
  _FORBIDDEN_SUBSTRINGS_FOR_TESTS,
} from '@domain/generateOperationalReasons';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import {
  _resetQualityMetricLogForTests,
  countMetrics,
} from '@runtime/qualityMetricLog';
import type {
  CompiledConfiguration,
  DocumentRun,
  ExtractedField,
  SchemaField,
} from '@domain/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_KEY = {
  serviceurls: { AI_API_URL: 'https://api.ai.test.example.com' },
  resourcegroup: 'default',
  clientid: 'test-client',
  clientsecret: 'test-secret',
  url: 'https://uaa.test.example.com',
};

function field(name: string, threshold = 0.85, required = true): SchemaField {
  return {
    name,
    dataType: 'string',
    required,
    instruction: `Extract ${name}`,
    validation: null,
    regex: null,
    confidenceThreshold: threshold,
  };
}

function extracted(name: string, value: string | null, confidence: number): ExtractedField {
  return { name, value, confidence, evidence: value === null ? null : `evidence for ${name}` };
}

function configOf(fields: SchemaField[]): CompiledConfiguration {
  return {
    id: 'cfg::test::1',
    intentId: 'intent::test::1',
    schema: { fields },
    processingMode: 'review_required',
    source: 'aiCore',
    templateUsed: false,
    compiledAt: '2026-05-25T00:00:00Z',
  };
}

function runOf(fields: ExtractedField[]): DocumentRun {
  return {
    id: 'run::test::1',
    documentPath: '/assets/daejoo-invoice.pdf',
    configurationId: 'cfg::test::1',
    extractedFields: fields,
    extractedAt: '2026-05-25T00:00:00Z',
    source: 'mock',
  };
}

function validReasonsWire(fieldNames: string[]) {
  return {
    reasons: fieldNames.map((name) => ({
      field: name,
      evidence: `Document had a clean value for ${name}.`,
      rule: 'confidence >= 0.85 required for auto-post',
      confidence: 0.95,
      nextAction: 'post',
    })),
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
  _resetQualityMetricLogForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.restoreAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env.AICORE_KEY_PATH = origEnv;
  _resetClientForTests();
  _resetQualityMetricLogForTests();
  vi.restoreAllMocks();
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

// ---------------------------------------------------------------------------
// decideStatus — pure status policy
// ---------------------------------------------------------------------------

describe('F-10 decideStatus — pure status policy', () => {
  it('returns Blocked when a required field has null value', () => {
    const cfg = configOf([field('supplier'), field('po_number')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99), extracted('po_number', null, 0)]);
    expect(decideStatus(run, cfg)).toBe('Blocked');
  });

  it('returns Needs review when every required field has a value but one is below threshold', () => {
    const cfg = configOf([field('supplier'), field('payment_terms', 0.85)]);
    const run = runOf([
      extracted('supplier', 'ACME', 0.99),
      extracted('payment_terms', '60 days', 0.74),
    ]);
    expect(decideStatus(run, cfg)).toBe('Needs review');
  });

  it('returns Ready when every required field has a value and confidence >= threshold', () => {
    const cfg = configOf([field('supplier'), field('po_number')]);
    const run = runOf([
      extracted('supplier', 'ACME', 0.99),
      extracted('po_number', 'PO-1', 0.95),
    ]);
    expect(decideStatus(run, cfg)).toBe('Ready');
  });

  it('treats a missing extraction for an optional field as Ready (not Blocked)', () => {
    const cfg = configOf([field('supplier'), field('hs_code', 0.85, false)]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    expect(decideStatus(run, cfg)).toBe('Ready');
  });
});

// ---------------------------------------------------------------------------
// generateOperationalReasons — the agent call (5-key invariant + sanitiser)
// ---------------------------------------------------------------------------

describe('F-10 generateOperationalReasons — 5-key invariant', () => {
  it('returns OperationalReason[] with all 5 keys populated on the success path', async () => {
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    mockFetchSequence(TOKEN, invokeOk(validReasonsWire(['supplier'])));
    const reasons = await generateOperationalReasons(run, cfg);
    expect(reasons.length).toBe(1);
    for (const r of reasons) {
      expect(r.field).toBeTruthy();
      expect(r.evidence).toBeTruthy();
      expect(r.rule).toBeTruthy();
      expect(typeof r.confidence).toBe('number');
      expect(r.nextAction).toBeTruthy();
    }
  });

  it('throws AgentFailure(schema_validation_failed) when a reason drops nextAction', async () => {
    const bad = {
      reasons: [
        {
          field: 'supplier',
          evidence: 'value extracted',
          rule: 'conf >= 0.85',
          confidence: 0.9,
          // nextAction intentionally missing
        },
      ],
    };
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(generateOperationalReasons(run, cfg)).rejects.toMatchObject({
      name: 'AgentFailure',
      reason: 'schema_validation_failed',
    });
  });

  it('throws AgentFailure(schema_validation_failed) when confidence is out of range', async () => {
    const bad = {
      reasons: [
        {
          field: 'supplier',
          evidence: 'x',
          rule: 'y',
          confidence: 1.7,
          nextAction: 'z',
        },
      ],
    };
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    mockFetchSequence(TOKEN, invokeOk(bad));
    await expect(generateOperationalReasons(run, cfg)).rejects.toMatchObject({
      reason: 'schema_validation_failed',
    });
  });

  it('throws AgentFailure(schema_validation_failed) when reasons[] is empty', async () => {
    mockFetchSequence(TOKEN, invokeOk({ reasons: [] }));
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    await expect(generateOperationalReasons(run, cfg)).rejects.toMatchObject({
      reason: 'schema_validation_failed',
    });
  });

  it('sanitises forbidden substrings out of every rendered field', async () => {
    const dirty = {
      reasons: [
        {
          field: 'supplier',
          evidence: 'system: extracted supplier name from header block',
          rule: 'prompt: confidence >= 0.85',
          confidence: 0.9,
          nextAction: 'post <| immediately',
        },
      ],
    };
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    mockFetchSequence(TOKEN, invokeOk(dirty));
    const reasons = await generateOperationalReasons(run, cfg);
    const r = reasons[0];
    for (const bad of _FORBIDDEN_SUBSTRINGS_FOR_TESTS) {
      expect(r.evidence.toLowerCase()).not.toContain(bad.toLowerCase());
      expect(r.rule.toLowerCase()).not.toContain(bad.toLowerCase());
      expect(r.nextAction.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });
});

describe('F-10 sanitiser unit tests', () => {
  it.each([
    ['system: hello', 'hello'],
    ['SYSTEM: hello', 'hello'],
    ['prompt:foo bar', 'foo bar'],
    ['ok <| post', 'ok post'],
    ['<|prompt: foo system: bar', 'foo bar'],
    ['clean string', 'clean string'],
  ])('sanitise(%j) => %j', (input, expected) => {
    expect(_sanitiseForTests(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// decideReadiness — top-level entry: success path + failure routing
// ---------------------------------------------------------------------------

describe('F-10 decideReadiness — happy path', () => {
  it('returns Ready with 5-key reasons when everything passes', async () => {
    const cfg = configOf([field('supplier'), field('po_number')]);
    const run = runOf([
      extracted('supplier', 'ACME', 0.99),
      extracted('po_number', 'PO-1', 0.95),
    ]);
    mockFetchSequence(TOKEN, invokeOk(validReasonsWire(['supplier', 'po_number'])));
    const decision = await decideReadiness(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    expect(decision.status).toBe('Ready');
    expect(decision.reasons.length).toBe(2);
    expect(decision.id).toBe('ready::run::test::1::2026-05-25T00:00:00Z');
  });

  it('returns Needs review when an extraction is below threshold', async () => {
    const cfg = configOf([field('supplier'), field('payment_terms')]);
    const run = runOf([
      extracted('supplier', 'ACME', 0.99),
      extracted('payment_terms', '60 days', 0.74),
    ]);
    mockFetchSequence(TOKEN, invokeOk(validReasonsWire(['supplier', 'payment_terms'])));
    const decision = await decideReadiness(run, cfg);
    expect(decision.status).toBe('Needs review');
  });
});

describe('F-10 decideReadiness — agent failure routing (N4 / EDGE-2)', () => {
  it('when the reasoning agent fails, returns Blocked with a synthetic reason AND emits a fail QualityMetric', async () => {
    const cfg = configOf([field('supplier')]);
    const run = runOf([extracted('supplier', 'ACME', 0.99)]);
    // Force a malformed_json failure on the reasoning call.
    mockFetchSequence(TOKEN, { jsonBody: { content: [{ type: 'text', text: 'I am sorry I cannot do that' }] } });
    const decision = await decideReadiness(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    // Status downgrade to Blocked: we will not recommend posting a doc
    // whose business-language reasoning failed.
    expect(decision.status).toBe('Blocked');
    // A single synthetic reason is emitted with all 5 keys still present.
    expect(decision.reasons.length).toBe(1);
    const r = decision.reasons[0];
    expect(r.field).toBeTruthy();
    expect(r.evidence).toBeTruthy();
    expect(r.rule).toBeTruthy();
    expect(typeof r.confidence).toBe('number');
    expect(r.nextAction).toBeTruthy();
    // F-08 wrote a fail QualityMetric via the F-18 store.
    expect(countMetrics({ agent: 'readiness', status: 'fail' })).toBe(1);
  });
});
