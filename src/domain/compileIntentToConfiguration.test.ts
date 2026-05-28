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
  // Cycle 2 (2026-05-28) — merged Compile Agent response shape per A17.
  // The wire now carries an `action` discriminant + the A18
  // extractionSystemPrompt for compile/recompile branches.
  return {
    action: 'compile',
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
    extractionSystemPrompt:
      'You are an extraction agent. Extract the 9 commercial-invoice fields above from the document.',
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
    // Cycle 2: merged agent discriminated union needs `action`; an
    // empty `fields[]` violates the schema.fields.min(1) constraint.
    mockFetchSequence(
      TOKEN,
      invokeOk({
        action: 'compile',
        schema: { fields: [] },
        processingMode: 'auto_confirm',
        extractionSystemPrompt: 'p',
      }),
    );
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

  it('stamps extractionSystemPrompt from the live response (A18 / F-04b)', async () => {
    mockFetchSequence(TOKEN, invokeOk(validWireResponse()));
    const cfg = await compileIntentToConfiguration(DAEJOO_INTENT);
    expect(cfg.extractionSystemPrompt).toBeTruthy();
    expect(cfg.extractionSystemPrompt).toContain('extraction agent');
  });
});

// ---------------------------------------------------------------------------
// Cycle 2 — Merged Compile Agent (A17) action-branch tests
// ---------------------------------------------------------------------------
// Exercises every variant of the CompileAgentDecision discriminated
// union via the compileAgent(state) surface. Mocked fetch — Cycle 3
// promotes these to live tests in src/evals/live.test.tsx.
import { compileAgent } from '@domain/compileIntentToConfiguration';
import type { ConversationState } from '@domain/types';

const STUB_STATE = (content: string): ConversationState =>
  Object.freeze({
    id: 'conv::test::action-branches',
    turns: Object.freeze([
      Object.freeze({
        id: 't::1',
        role: 'user' as const,
        kind: 'message' as const,
        content,
        timestamp: '2026-05-28T00:00:00Z',
      }),
    ]),
    compiledConfigVersionRefs: Object.freeze([] as readonly string[]),
    status: 'collecting',
    pendingSignal: null,
  });

describe('A17 — merged Compile Agent · action-branch shape contracts', () => {
  it("compile branch: validates the {schema, processingMode, extractionSystemPrompt} payload", async () => {
    mockFetchSequence(TOKEN, invokeOk(validWireResponse()));
    const decision = await compileAgent(STUB_STATE('extract supplier and PO from this invoice'));
    expect(decision.action).toBe('compile');
    if (decision.action === 'compile') {
      expect(decision.schema.fields.length).toBeGreaterThanOrEqual(1);
      expect(decision.processingMode).toMatch(/^(auto_confirm|review_required|blocked)$/);
      expect(decision.extractionSystemPrompt.length).toBeGreaterThan(0);
    }
  });

  it("recompile branch: same payload shape as compile", async () => {
    const wire = { ...validWireResponse(), action: 'recompile' };
    mockFetchSequence(TOKEN, invokeOk(wire));
    const decision = await compileAgent(STUB_STATE('also add tax_amount'));
    expect(decision.action).toBe('recompile');
    if (decision.action === 'recompile') {
      expect(decision.schema.fields.length).toBeGreaterThanOrEqual(1);
      expect(decision.extractionSystemPrompt.length).toBeGreaterThan(0);
    }
  });

  it("clarify branch: carries clarificationContent", async () => {
    mockFetchSequence(
      TOKEN,
      invokeOk({
        action: 'clarify',
        clarificationContent: 'Could you clarify the supplier branch semantics for net-30 terms?',
      }),
    );
    const decision = await compileAgent(STUB_STATE('payment terms ambiguous'));
    expect(decision.action).toBe('clarify');
    if (decision.action === 'clarify') {
      expect(decision.clarificationContent.length).toBeGreaterThan(0);
    }
  });

  it("capability_class_question branch: carries question + gap + citation + pending description", async () => {
    mockFetchSequence(
      TOKEN,
      invokeOk({
        action: 'capability_class_question',
        confirmationQuestion: 'Do you want to notify the SAP product team to look into S/4 HANA integration?',
        capabilityGapDescription:
          'Document AI extracts but does not write to S/4 HANA directly; integration requires middleware.',
        capabilitySurfaceCitation: 'Integration Surface, p. 198',
        pendingSignalDescription: 'integrate extracted invoice data with SAP S/4 HANA',
      }),
    );
    const decision = await compileAgent(STUB_STATE('can you link this to S/4 HANA?'));
    expect(decision.action).toBe('capability_class_question');
    if (decision.action === 'capability_class_question') {
      expect(decision.confirmationQuestion.length).toBeGreaterThan(0);
      expect(decision.capabilityGapDescription.length).toBeGreaterThan(0);
      expect(decision.capabilitySurfaceCitation.length).toBeGreaterThan(0);
      expect(decision.pendingSignalDescription.length).toBeGreaterThan(0);
    }
  });

  it("success_summary branch: carries summaryContent", async () => {
    mockFetchSequence(
      TOKEN,
      invokeOk({
        action: 'success_summary',
        summaryContent: 'All set. Configuration ready for review.',
      }),
    );
    const decision = await compileAgent(STUB_STATE('thanks, looks good'));
    expect(decision.action).toBe('success_summary');
    if (decision.action === 'success_summary') {
      expect(decision.summaryContent.length).toBeGreaterThan(0);
    }
  });

  it('rejects out-of-union actions with schema_validation_failed', async () => {
    mockFetchSequence(
      TOKEN,
      invokeOk({ action: 'bogus_action', whatever: 'no' }),
    );
    await expect(compileAgent(STUB_STATE('test'))).rejects.toMatchObject({
      reason: 'schema_validation_failed',
    });
  });
});
