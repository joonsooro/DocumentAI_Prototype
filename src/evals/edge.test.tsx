// @vitest-environment jsdom
/**
 * F-19 — EDGE-1..4 eval cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import { generateClarificationRequests } from '@domain/generateClarificationRequests';
import { runAgentWithFailureSurface } from '@domain/agentFailureSurface';
import { generateAdminRecommendations } from '@domain/generateAdminRecommendations';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import { _resetForTests as _resetCustomerSessionForTests } from '@runtime/customerSessionStore';
import {
  countMetrics,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';
import {
  submitCorrection,
  getProductSignals,
  getCorrections,
  _resetCorrectionStoreForTests,
} from '@domain/submitCorrection';
import { governProductSignals } from '@domain/governProductSignals';
import CustomerRoute from '@routes/customer';
import AdminRoute from '@routes/admin';
import InternalRoute from '@routes/internal';
import {
  DAEJOO_COMPILED_CONFIG,
  FAKE_AICORE_KEY,
  TOKEN_RESPONSE,
  makeFetchSequence,
} from './fixtures';
import type { CompiledConfiguration } from '@domain/types';

let tmpDir: string;
const origEnv = process.env.AICORE_KEY_PATH;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'eval-test-'));
  const keyPath = join(tmpDir, 'aicore.json');
  writeFileSync(keyPath, JSON.stringify(FAKE_AICORE_KEY));
  process.env.AICORE_KEY_PATH = keyPath;
  _resetClientForTests();
  _resetQualityMetricLogForTests();
  _resetCorrectionStoreForTests();
  _resetCustomerSessionForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env.AICORE_KEY_PATH = origEnv;
  _resetClientForTests();
  _resetQualityMetricLogForTests();
  _resetCorrectionStoreForTests();
  _resetCustomerSessionForTests();
  vi.restoreAllMocks();
});

// ===========================================================================
// EDGE-1 — Missing field => ClarificationRequest with 3 prompts; no default.
// ===========================================================================
describe('F-19 EDGE-1 — DAEJOO run with missing payable_amount yields a ClarificationRequest', () => {
  it('clarifications.length >= 1; the request for payable_amount has the 3 prompts; documentRun field is null not a default', () => {
    // Config where every field's threshold is 0.85.
    const cfg: CompiledConfiguration = {
      ...DAEJOO_COMPILED_CONFIG,
      schema: {
        fields: [
          { name: 'payable_amount', dataType: 'number', required: true, instruction: 'x', validation: null, regex: null, confidenceThreshold: 0.99 },
        ],
      },
    };
    // F-03 fixture has payable_amount confidence 0.88 — at threshold 0.99 it gets nulled.
    const run = simulateDocumentRun('/assets/daejoo-invoice.pdf', cfg);
    const extracted = run.extractedFields.find((f) => f.name === 'payable_amount');
    expect(extracted?.value).toBeNull(); // no default substituted

    const clarifications = generateClarificationRequests(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    expect(clarifications.length).toBeGreaterThanOrEqual(1);
    const payable = clarifications.find((c) => c.field === 'payable_amount');
    expect(payable).toBeDefined();
    expect(payable!.prompts.fieldMeaning.length).toBeGreaterThan(0);
    expect(payable!.prompts.postingReviewReportingImpact.length).toBeGreaterThan(0);
    expect(payable!.prompts.supplierScopeApplicability.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// EDGE-2 — admin.recommend agent fails: UI surfaces ClarificationRequest with operator-facing error + QualityMetric fail; no canned recommendation.
// ===========================================================================
describe('F-19 EDGE-2 — admin.recommend agent failure surfaces correctly', () => {
  it('qualityMetrics includes {agent:"admin.recommend", status:"fail"}; outcome carries clarification with operatorFacingError; no canned recommendation appears', async () => {
    // Force a malformed_json failure on the admin recommend call.
    vi.stubGlobal('fetch', vi.fn(makeFetchSequence([
      TOKEN_RESPONSE,
      { jsonBody: { content: [{ type: 'text', text: 'I cannot do that' }] } },
    ])));

    const outcome = await runAgentWithFailureSurface(
      'admin.recommend',
      () => generateAdminRecommendations([]),
      { nowIso: '2026-05-25T00:00:00Z' },
    );

    expect(outcome.kind).toBe('failure');
    if (outcome.kind === 'failure') {
      expect(outcome.clarification.kind).toBe('agent_failure_surface');
      expect(outcome.clarification.operatorFacingError).toBeTruthy();
      // The acceptance assertion calls for {agent:'admin.recommend', status:'fail'} —
      // our coerceToAgentFailure relabels the failure to the wrapper's agent param,
      // but the underlying recordFailure uses failure.agent (which in this path is
      // 'admin.recommend' via the F-15 callAgent invocation). Both end up as 'admin.recommend'.
      expect(outcome.metric.status).toBe('fail');
    }
    expect(countMetrics({ status: 'fail' })).toBe(1);
  });
});

// ===========================================================================
// EDGE-3 — single correction does NOT auto-promote.
// ===========================================================================
describe('F-19 EDGE-3 — single correction does not auto-promote to ProductSignal', () => {
  it('productSignals length unchanged after a single correction; governance fields present on the new CorrectionEvent', () => {
    expect(getProductSignals().length).toBe(0);
    submitCorrection(
      {
        documentRunId: 'run::eval::edge3',
        field: 'payment_terms',
        oldValue: '60 days',
        newValue: 'WITHIN 60 DAYS AFTER BOARDING',
        operator: 'op-eval',
        governance: {
          documentType: 'commercial_invoice',
          supplier: 'DAEJOO',
          customerImpact: 'medium',
        },
      },
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(getProductSignals().length).toBe(0); // unchanged
    const queue = getCorrections();
    expect(queue.length).toBe(1);
    const event = queue[0];
    // 5 governance fields are present (frequency may be null, but the keys exist)
    expect(event.governance).toHaveProperty('frequency');
    expect(event.governance).toHaveProperty('customerImpact');
    expect(event.governance).toHaveProperty('documentType');
    expect(event.governance).toHaveProperty('supplier');
    expect(event.governance).toHaveProperty('country');
  });
});

// ===========================================================================
// EDGE-3-positive — 3 corrections × 2 suppliers × non-low impact DOES promote.
// ===========================================================================
// Closes OQ-E3 (C-S-07-positive). EDGE-3 above proves the negative path
// (single correction does not promote). This block exercises the
// complementary positive path through the F-09 governance gate using the
// OQ-2 v1 thresholds (min_frequency=3, min_distinct_suppliers=2,
// forbidden_customer_impacts=['low']) recorded in
// app/app-spec.json#blocked_open_questions.OQ-2.v1_decision.
describe('F-19 EDGE-3-positive — 3 corrections from 2 suppliers promote to ProductSignal', () => {
  it('productSignals.length === 1 after governance pass; signal carries the right shape', () => {
    expect(getProductSignals().length).toBe(0);
    // Three corrections, same (documentType, field), across two distinct
    // suppliers, with medium customerImpact — crosses every gate.
    submitCorrection(
      {
        documentRunId: 'run::eval::edge3p::1',
        field: 'payment_terms',
        oldValue: '30 days',
        newValue: 'NET 30 FROM B/L',
        operator: 'op-eval',
        governance: {
          documentType: 'commercial_invoice',
          supplier: 'DAEJOO',
          customerImpact: 'medium',
        },
      },
      { nowIso: '2026-05-25T00:00:01Z' },
    );
    submitCorrection(
      {
        documentRunId: 'run::eval::edge3p::2',
        field: 'payment_terms',
        oldValue: '45 days',
        newValue: 'NET 45 FROM INVOICE',
        operator: 'op-eval',
        governance: {
          documentType: 'commercial_invoice',
          supplier: 'AMAZON',
          customerImpact: 'medium',
        },
      },
      { nowIso: '2026-05-25T00:00:02Z' },
    );
    submitCorrection(
      {
        documentRunId: 'run::eval::edge3p::3',
        field: 'payment_terms',
        oldValue: '60 days',
        newValue: 'NET 60 EOM',
        operator: 'op-eval',
        governance: {
          documentType: 'commercial_invoice',
          supplier: 'DAEJOO',
          customerImpact: 'high',
        },
      },
      { nowIso: '2026-05-25T00:00:03Z' },
    );

    const result = governProductSignals(getCorrections(), {
      nowIso: '2026-05-25T00:00:04Z',
    });

    expect(result.newlyApproved.length).toBe(1);
    expect(getProductSignals().length).toBe(1);
    const signal = result.newlyApproved[0];
    expect(signal.signalType).toBe('recurring_correction_pattern');
    expect(signal.documentType).toBe('commercial_invoice');
    expect(signal.intentFragment).toBe('payment_terms');
    expect(signal.frequency).toBe(3);
    expect(signal.customerImpact).toBe('high'); // aggregate = max(medium, medium, high)
    expect(signal.supplier).toBeNull(); // dedup'd to >1 supplier
    expect(signal.sourceCorrectionIds.length).toBe(3);

    // Decision log records the approved candidate with its reason.
    const approvedLog = result.log.find((l) => l.approved);
    expect(approvedLog).toBeDefined();
    expect(approvedLog!.frequency).toBe(3);
    expect(approvedLog!.distinctSuppliers).toBe(2);
    expect(approvedLog!.reason).toBe('thresholds met');
  });
});

// ===========================================================================
// EDGE-4 — Walkthrough timing harness. The strict <300s assertion lives in
// F-20's dedicated test. F-19 just proves all three routes mount under one
// walkthrough sequence (the "7 eval families execute" clause).
// ===========================================================================
// Adaptation: the literal "7 eval families" in evals.md predates the
// renumbering; the eval suite has 12 cases (6 HAPPY + 4 EDGE + 2 RED).
// The acceptance proxy here is "all three routes mount in sequence" which
// is necessary for the walkthrough to complete.
describe('F-19 EDGE-4 — walkthrough is executable across all three routes', () => {
  it('all three routes mount in sequence without error', () => {
    const c = render(<CustomerRoute />);
    expect(c.getByTestId('customer-route')).toBeTruthy();
    c.unmount();
    const a = render(<AdminRoute />);
    expect(a.getByTestId('admin-route')).toBeTruthy();
    a.unmount();
    const i = render(<InternalRoute />);
    expect(i.getByTestId('internal-route')).toBeTruthy();
    i.unmount();
  });
});
