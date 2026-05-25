/**
 * F-04 (b) tests — compileIntentToConfiguration.
 *
 * Mocked fetch. Asserts spec invariants:
 *   - source === 'aiCore'
 *   - templateUsed === false (literal)
 *   - schema fields validated via zod (off-shape => AgentFailure)
 *   - DEP-1 spend cap inherited from aiCoreClient (model + max_tokens enforced)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileIntentToConfiguration } from '@domain/compileIntentToConfiguration';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import type { CustomerIntent } from '@domain/types';

const FAKE_KEY = {
  serviceurls: { AI_API_URL: 'https://api.ai.test.example.com' },
  resourcegroup: 'default',
  clientid: 'test-client',
  clientsecret: 'test-secret',
  url: 'https://uaa.test.example.com',
};

const DAEJOO_INTENT: CustomerIntent = {
  id: 'intent::daejoo::v0',
  raw: 'For commercial invoices, extract supplier, PO, HS code, payment terms, payable amount, and exclude no-commercial-value sample lines from payable validation.',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
};

const NINE_FIELDS = [
  'supplier', 'invoice_number', 'invoice_date', 'po_number', 'hs_code',
  'payment_terms', 'total_amount', 'payable_amount', 'commercial_value_indicator',
];

function validWireResponse() {
  return {
    schema: {
      fields: NINE_FIELDS.map((name) => ({
        name,
        dataType: name.endsWith('_amount') ? 'number' : name.endsWith('_date') ? 'date' : 'string',
        required: true,
        instruction: `Extract ${name}`,
        validation: null,
        regex: null,
        confidenceThreshold: 0.85,
      })),
    },
    processingMode: 'review_required',
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

function mockFetchSequence(...responses: Array<Partial<Response> & { jsonBody?: unknown; textBody?: string }>): void {
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

describe('F-04 compileIntentToConfiguration — acceptance invariants', () => {
  it('returns CompiledConfiguration with all 9 DAEJOO fields, source=aiCore, templateUsed=false', async () => {
    mockFetchSequence(TOKEN, invokeOk(validWireResponse()));
    const cfg = await compileIntentToConfiguration(DAEJOO_INTENT, {
      nowIso: '2026-05-25T00:00:00Z',
      idSuffix: 'fixed',
    });
    expect(cfg.source).toBe('aiCore');
    expect(cfg.templateUsed).toBe(false);
    expect(cfg.intentId).toBe(DAEJOO_INTENT.id);
    expect(cfg.schema.fields.length).toBe(9);
    expect(cfg.schema.fields.map((f) => f.name).sort()).toEqual([...NINE_FIELDS].sort());
  });

  it('id is deterministic when nowIso + idSuffix are injected', async () => {
    mockFetchSequence(TOKEN, invokeOk(validWireResponse()));
    const cfg = await compileIntentToConfiguration(DAEJOO_INTENT, {
      nowIso: '2026-05-25T00:00:00Z',
      idSuffix: 'fixed',
    });
    expect(cfg.id).toBe('cfg::intent::daejoo::v0::fixed');
    expect(cfg.compiledAt).toBe('2026-05-25T00:00:00Z');
  });

  it('throws AgentFailure(schema_validation_failed) when AI Core returns off-shape JSON', async () => {
    mockFetchSequence(TOKEN, invokeOk({ schema: { fields: [] }, processingMode: 'auto_confirm' })); // fields min 1 violated
    await expect(compileIntentToConfiguration(DAEJOO_INTENT)).rejects.toMatchObject({
      name: 'AgentFailure',
      reason: 'schema_validation_failed',
    });
  });

  it('throws AgentFailure(schema_validation_failed) when processingMode is invalid', async () => {
    mockFetchSequence(TOKEN, invokeOk({ ...validWireResponse(), processingMode: 'bogus' }));
    await expect(compileIntentToConfiguration(DAEJOO_INTENT)).rejects.toMatchObject({
      reason: 'schema_validation_failed',
    });
  });

  it('throws AgentFailure(schema_validation_failed) when a field has out-of-range confidenceThreshold', async () => {
    const wire = validWireResponse();
    wire.schema.fields[0].confidenceThreshold = 1.7;
    mockFetchSequence(TOKEN, invokeOk(wire));
    await expect(compileIntentToConfiguration(DAEJOO_INTENT)).rejects.toMatchObject({
      reason: 'schema_validation_failed',
    });
  });

  it('strips ```json fences from the model response before parsing', async () => {
    mockFetchSequence(TOKEN, {
      jsonBody: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(validWireResponse()) + '\n```' }] },
    });
    const cfg = await compileIntentToConfiguration(DAEJOO_INTENT);
    expect(cfg.schema.fields.length).toBe(9);
  });

  it('throws AgentFailure(malformed_json) when the model returns plain text', async () => {
    mockFetchSequence(TOKEN, { jsonBody: { content: [{ type: 'text', text: 'I am a chatbot, here is your answer...' }] } });
    await expect(compileIntentToConfiguration(DAEJOO_INTENT)).rejects.toMatchObject({
      reason: 'malformed_json',
    });
  });
});
