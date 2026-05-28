/**
 * F-19 — Shared fixtures for the eval harness.
 *
 * Canned data the eval cases reuse so the assertion code reads like the
 * scenario row in app/evals.md.
 */
import type {
  AdminRecommendation,
  CompiledConfiguration,
  CustomerIntent,
  ProductSignal,
  ReadinessDecision,
} from '@domain/types';

export const DAEJOO_INTENT: CustomerIntent = {
  id: 'intent::daejoo::v0',
  raw: 'Extract supplier, PO, invoice date, HS code, payment terms, payable amount. Exclude no-commercial-value sample lines from payable validation. Also: spent materials should be auto-disposed at the supplier dock.',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
};

// Nine schema fields per HAPPY-2 acceptance.
export const DAEJOO_NINE_FIELDS = [
  'supplier',
  'invoice_number',
  'invoice_date',
  'po_number',
  'hs_code',
  'payment_terms',
  'total_amount',
  'payable_amount',
  'commercial_value_indicator',
];

export function makeNineFieldWire() {
  // Cycle 2 (2026-05-28) — merged Compile Agent response shape per A17.
  // The wire now carries an `action` discriminant + the A18
  // extractionSystemPrompt for compile/recompile branches.
  return {
    action: 'compile',
    schema: {
      fields: DAEJOO_NINE_FIELDS.map((name) => ({
        name,
        dataType: name.endsWith('_amount') ? 'number' : name.endsWith('_date') ? 'date' : 'string',
        required: true,
        instruction: `Extract ${name} from the document header or line items.`,
        validation: 'non-empty',
        regex: '.+',
        confidenceThreshold: 0.85,
      })),
    },
    processingMode: 'review_required',
    extractionSystemPrompt:
      'You are an extraction agent. Extract the 9 commercial-invoice fields above from the document.',
  };
}

export const FAKE_AICORE_KEY = {
  serviceurls: { AI_API_URL: 'https://api.ai.test.example.com' },
  resourcegroup: 'default',
  clientid: 'test-client',
  clientsecret: 'test-secret',
  url: 'https://uaa.test.example.com',
};

export const DAEJOO_COMPILED_CONFIG: CompiledConfiguration = {
  id: 'cfg::eval::1',
  intentId: DAEJOO_INTENT.id,
  schema: {
    fields: [
      { name: 'supplier', dataType: 'string', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'po_number', dataType: 'string', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'invoice_date', dataType: 'date', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payment_terms', dataType: 'string', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payable_amount', dataType: 'number', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'commercial_value_indicator', dataType: 'string', required: false, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.62 },
    ],
  },
  processingMode: 'review_required',
  source: 'aiCore',
  templateUsed: false,
  compiledAt: '2026-05-25T00:00:00Z',
  extractionSystemPrompt:
    'You are an extraction agent. Extract the schema fields from the DAEJOO commercial invoice document. Follow IDP best practices: scan each field instruction, locate the matching value in the document, and emit value + confidence.',
};

// A DAEJOO ProductSignal carrying the disposal phrase (RED-2 / HAPPY-4).
export const DAEJOO_DISPOSAL_SIGNAL: ProductSignal = {
  id: 'sig-daejoo-disposal',
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial_invoice / business-condition gap',
  intentFragment: 'auto-dispose spent materials at the supplier dock',
  suggestedProductArea: 'document-ai roadmap intake',
  frequency: 1,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: 'DAEJOO',
  country: 'KR',
  sourceCorrectionIds: [],
  governanceApprovedAt: '2026-05-25T00:00:00Z',
};

// A "Needs review" readiness with a 5-key reason for a low-confidence field.
export const NEEDS_REVIEW_READINESS: ReadinessDecision = {
  id: 'ready::eval::1',
  documentRunId: 'run::eval::1',
  status: 'Needs review',
  reasons: [
    {
      field: 'payment_terms',
      evidence: 'Document line: WITHIN 60 DAYS AFTER BOARDING',
      rule: 'confidence >= 0.85 required for auto-post',
      confidence: 0.74,
      nextAction: 'review',
    },
  ],
  decidedAt: '2026-05-25T00:00:00Z',
};

// An AdminRecommendation that respects RED-1 (no threshold_lower).
export const CLEAN_ADMIN_REC: AdminRecommendation = {
  id: 'rec-1',
  type: 'add_field_instruction',
  title: 'Clarify payment_terms extraction',
  body: 'Multiple operators corrected payment_terms. Add an instruction to capture the full phrase verbatim.',
  scope: 'this_supplier',
  sourceCorrectionIds: ['corr-1'],
  proposedAt: '2026-05-25T00:00:00Z',
};

// Helper used by the eval cases to mock a fetch sequence for one or more
// AI Core call cycles.
export function makeFetchSequence(
  responses: Array<Partial<Response> & { jsonBody?: unknown; textBody?: string }>,
) {
  const queue = [...responses];
  return async () => {
    const r = queue.shift();
    if (!r) throw new Error('eval fetch sequence exhausted');
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? 'OK',
      json: async () => r.jsonBody ?? {},
      text: async () => r.textBody ?? JSON.stringify(r.jsonBody ?? {}),
    } as unknown as Response;
  };
}

export const TOKEN_RESPONSE = { jsonBody: { access_token: 'tok-abc', expires_in: 3600 } };

export function invokeOk(wire: unknown) {
  return { jsonBody: { content: [{ type: 'text', text: JSON.stringify(wire) }] } };
}
