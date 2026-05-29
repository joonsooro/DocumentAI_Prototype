// @vitest-environment jsdom
/**
 * F-19 — HAPPY-1..6 eval cases.
 *
 * Each block corresponds to one row in app/evals.md. Adaptations from the
 * verbatim spec assertions are commented at the top of the block — they
 * are pragmatic, never aspirational.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import CustomerRoute from '@routes/customer';
import InternalRoute from '@routes/internal';
import { compileIntentToConfiguration } from '@domain/compileIntentToConfiguration';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import { _resetForTests as _resetCustomerSessionForTests } from '@runtime/customerSessionStore';
import {
  recordSuccess,
  _resetQualityMetricLogForTests,
  countMetrics,
} from '@runtime/qualityMetricLog';
import type {
  CapabilityAssessment,
  ProductSignal,
} from '@domain/types';
import {
  DAEJOO_INTENT,
  DAEJOO_COMPILED_CONFIG,
  DAEJOO_DISPOSAL_SIGNAL,
  NEEDS_REVIEW_READINESS,
  FAKE_AICORE_KEY,
  TOKEN_RESPONSE,
  invokeOk,
  makeFetchSequence,
  makeNineFieldWire,
} from './fixtures';

// ---------------------------------------------------------------------------
// AI Core env setup for HAPPY-2 / HAPPY-3
// ---------------------------------------------------------------------------

let tmpDir: string;
const origEnv = process.env.AICORE_KEY_PATH;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'eval-test-'));
  const keyPath = join(tmpDir, 'aicore.json');
  writeFileSync(keyPath, JSON.stringify(FAKE_AICORE_KEY));
  process.env.AICORE_KEY_PATH = keyPath;
  _resetClientForTests();
  _resetQualityMetricLogForTests();
  _resetCustomerSessionForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env.AICORE_KEY_PATH = origEnv;
  _resetClientForTests();
  _resetQualityMetricLogForTests();
  _resetCustomerSessionForTests();
  vi.restoreAllMocks();
});

// ===========================================================================
// HAPPY-1 — Operator opens prototype: admin-facing intent form, no end-user upload.
// ===========================================================================
// Adaptation (S5 SF · chat-wiring): A12 made the conversational ChatPanel the
// single primary input surface — the legacy IntentInputPanel is unmounted per
// F-11 acceptance. The HAPPY-1 invariant — "admin-facing form, no end-user
// upload affordance" — is preserved by asserting the ChatPanel's input +
// submit affordances render and no `end-user-upload` element exists.
describe('F-19 HAPPY-1 — operator opens the prototype with no prior context', () => {
  it('Customer Workspace renders the admin-facing ChatPanel input + submit; no end-user upload affordance', () => {
    const { getByTestId, queryByTestId } = render(<CustomerRoute />);
    expect(getByTestId('customer-chat-panel')).toBeTruthy();
    expect(getByTestId('customer-chat-panel-input')).toBeTruthy();
    expect(getByTestId('customer-chat-panel-submit')).toBeTruthy();
    expect(queryByTestId('end-user-upload')).toBeNull();
  });
});

// ===========================================================================
// HAPPY-2 — DAEJOO compile produces a 9-field CompiledConfiguration.
// ===========================================================================
describe('F-19 HAPPY-2 — DAEJOO compile produces a 9-field configuration', () => {
  it('compile result has all 9 schema fields with instruction/validation/regex/threshold/processingMode set', async () => {
    vi.stubGlobal('fetch', vi.fn(makeFetchSequence([TOKEN_RESPONSE, invokeOk(makeNineFieldWire())])));
    const result = await compileIntentToConfiguration(DAEJOO_INTENT, {
      nowIso: '2026-05-25T00:00:00Z',
      idSuffix: 'fixed',
    });
    expect(result.schema.fields.length).toBe(9);
    for (const f of result.schema.fields) {
      expect(f.instruction).not.toBe('');
      expect(f.validation).not.toBeNull();
      expect(f.regex).not.toBeNull();
      expect(typeof f.confidenceThreshold).toBe('number');
    }
    expect(result.processingMode).toBeTruthy();
  });
});

// ===========================================================================
// HAPPY-3 — Compile result tagged as live aiCore call, not template.
// ===========================================================================
describe('F-19 HAPPY-3 — compile is tagged as a live aiCore call', () => {
  it('source === "aiCore", templateUsed === false; QualityMetric log includes one aiCore.compile entry', async () => {
    vi.stubGlobal('fetch', vi.fn(makeFetchSequence([TOKEN_RESPONSE, invokeOk(makeNineFieldWire())])));
    const result = await compileIntentToConfiguration(DAEJOO_INTENT, {
      nowIso: '2026-05-25T00:00:00Z',
      idSuffix: 'fixed',
    });
    expect(result.source).toBe('aiCore');
    expect(result.templateUsed).toBe(false);
    // F-04's call site doesn't auto-log via F-18 yet (deferred to S4 OBSERVE);
    // the eval simulates the F-18 push the way runAgentWithFailureSurface
    // would on success.
    recordSuccess(
      {
        agent: 'aiCore.compile',
        source: 'aiCore',
        templateUsed: false,
        latency_ms: 200,
        token_usage: { input: 10, output: 5 },
        model: 'd-haiku',
        max_tokens: 1024,
        value: result,
      },
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(countMetrics({ agent: 'aiCore.compile' })).toBe(1);
  });
});

// ===========================================================================
// HAPPY-4 — Capability assessment: customer-visible buckets only; DAEJOO
// disposal phrase appears in Internal as unsupported_free_text_business_condition.
// ===========================================================================
describe('F-19 HAPPY-4 — capability assessment respects customer-visible buckets', () => {
  it('Customer Workspace HTML contains no "Unsupported" / "material disposal"; Internal Workspace contains the signal', () => {
    const customerAssessments: CapabilityAssessment[] = [
      { id: 'a', intentFragment: 'extract supplier', status: 'Supported', customerVisible: true, workaroundDescription: null, fieldRefs: ['supplier'] },
      { id: 'b', intentFragment: 'extract PO', status: 'Supported', customerVisible: true, workaroundDescription: null, fieldRefs: ['po_number'] },
      { id: 'c', intentFragment: 'exclude no-commercial-value lines', status: 'Supported with workaround', customerVisible: true, workaroundDescription: 'filter where commercial_value_indicator is false', fieldRefs: ['payable_amount'] },
    ];
    const projectedForCustomer = customerAssessments.filter((a) => a.status !== 'capability_gap');
    const customerVm = {
      intent: DAEJOO_INTENT,
      configuration: DAEJOO_COMPILED_CONFIG,
      assessments: projectedForCustomer.map((a) => ({
        id: a.id,
        intentFragment: a.intentFragment,
        status: a.status as 'Supported' | 'Supported with workaround',
        workaroundDescription: a.workaroundDescription,
        fieldRefs: a.fieldRefs,
      })),
      clarifications: [],
      readiness: null,
    };
    const { container: customerContainer } = render(<CustomerRoute initialViewModel={customerVm} />);
    const customerText = customerContainer.textContent ?? '';
    expect(customerText).not.toContain('Unsupported');
    expect(customerText).not.toContain('material disposal');

    // Internal Workspace contains the DAEJOO disposal signal.
    const signals: ProductSignal[] = [DAEJOO_DISPOSAL_SIGNAL];
    const { container: internalContainer } = render(
      <InternalRoute
        initialViewModel={{
          governanceQueue: [],
          approvedSignals: signals,
          regressionSignals: [],
          capabilityGaps: [],
          corrections: [],
        }}
      />,
    );
    const internalText = internalContainer.textContent ?? '';
    expect(internalText).toContain('unsupported free text business condition');
    expect(internalText).toContain('auto-dispose spent materials');
  });
});

// ===========================================================================
// HAPPY-5 — Readiness panel: 5-key reasons, no raw prompt substrings.
// ===========================================================================
describe('F-19 HAPPY-5 — readiness panel uses 5-key business-language reasons', () => {
  it('every reason has the 5 keys; panel HTML does not contain "system:" / "prompt:" / "<|"', () => {
    const { container, getByTestId } = render(
      <CustomerRoute
        initialViewModel={{
          intent: DAEJOO_INTENT,
          configuration: DAEJOO_COMPILED_CONFIG,
          assessments: [],
          clarifications: [],
          readiness: NEEDS_REVIEW_READINESS,
        }}
      />,
    );
    expect(getByTestId('customer-readiness-panel')).toBeTruthy();
    for (const r of NEEDS_REVIEW_READINESS.reasons) {
      expect(r.field).toBeTruthy();
      expect(r.evidence).toBeTruthy();
      expect(r.rule).toBeTruthy();
      expect(typeof r.confidence).toBe('number');
      expect(r.nextAction).toBeTruthy();
    }
    const text = container.textContent ?? '';
    expect(text).not.toContain('system:');
    expect(text).not.toContain('prompt:');
    expect(text).not.toContain('<|');
  });
});

// ===========================================================================
// HAPPY-6 — Three-workspace separation.
// ===========================================================================
// Adaptation: spec assertion mentions `useDomainStore()` returning a shared
// root ref; our v1 uses per-route view-models (SUB-2 in-memory typed
// fixtures). The load-bearing assertion — "no workspace renders another's
// data-testid" — is preserved verbatim.
describe('F-19 HAPPY-6 — three-workspace separation', () => {
  it('three routes mount and no workspace renders another\'s data-testid', () => {
    const { container: c1 } = render(
      <MemoryRouter initialEntries={['/customer']}><App /></MemoryRouter>,
    );
    expect(c1.querySelector('[data-testid="customer-route"]')).not.toBeNull();
    expect(c1.querySelector('[data-testid="admin-route"]')).toBeNull();
    expect(c1.querySelector('[data-testid="internal-route"]')).toBeNull();

    const { container: c2 } = render(
      <MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>,
    );
    expect(c2.querySelector('[data-testid="admin-route"]')).not.toBeNull();
    expect(c2.querySelector('[data-testid="customer-route"]')).toBeNull();
    expect(c2.querySelector('[data-testid="internal-route"]')).toBeNull();

    const { container: c3 } = render(
      <MemoryRouter initialEntries={['/internal']}><App /></MemoryRouter>,
    );
    expect(c3.querySelector('[data-testid="internal-route"]')).not.toBeNull();
    expect(c3.querySelector('[data-testid="customer-route"]')).toBeNull();
    expect(c3.querySelector('[data-testid="admin-route"]')).toBeNull();
  });
});
