// @vitest-environment jsdom
/**
 * F-11 — Customer Workspace smoke tests (S5 SF · chat-wiring fix).
 *
 * Asserts the route mounts under the chat-first surface (A12), respects
 * ALL negative-contract guards from app/contract.html §2 Screen 1, and
 * preserves three-workspace separation. The legacy IntentInputPanel +
 * ClarificationLoopPanel testids are GONE — the SF removed those mounts
 * per F-11 acceptance ("the prior IntentInputPanel + ClarificationLoopPanel
 * split is removed — no element matches data-testid='customer-clarification-
 * loop'").
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import CustomerRoute from './customer';
import type { CustomerViewModel } from '@components/customer/viewModel';
import type { CompiledConfiguration, CustomerIntent } from '@domain/types';

// ---------------------------------------------------------------------------
// Fixtures — a populated view-model with every panel filled in
// ---------------------------------------------------------------------------

const INTENT: CustomerIntent = {
  id: 'intent::daejoo::v0',
  raw: 'Extract supplier, PO, payment terms, payable amount; exclude no-commercial-value samples.',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
};

const CONFIG: CompiledConfiguration = {
  id: 'cfg::test::1',
  intentId: INTENT.id,
  schema: {
    fields: [
      { name: 'supplier', dataType: 'string', required: true, instruction: 'Extract supplier name', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payment_terms', dataType: 'string', required: true, instruction: 'Extract payment terms verbatim', validation: null, regex: null, confidenceThreshold: 0.85 },
    ],
  },
  processingMode: 'review_required',
  source: 'aiCore',
  templateUsed: false,
  compiledAt: '2026-05-25T00:00:00Z',
};

const VIEW_MODEL: CustomerViewModel = {
  intent: INTENT,
  configuration: CONFIG,
  assessments: [
    { id: 'cap-1', intentFragment: 'extract supplier', status: 'Supported', workaroundDescription: null, fieldRefs: ['supplier'] },
    { id: 'cap-2', intentFragment: 'exclude no-commercial-value samples', status: 'Supported with workaround', workaroundDescription: 'filter line items where commercial_value_indicator === false', fieldRefs: ['payable_amount', 'commercial_value_indicator'] },
  ],
  clarifications: [],
  readiness: {
    id: 'ready-1',
    documentRunId: 'run::1',
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
  },
};

// ---------------------------------------------------------------------------
// Negative-contract guard strings
// ---------------------------------------------------------------------------

const FORBIDDEN_LITERALS = [
  'Unsupported',
  'material disposal',
  'unsupported_free_text_business_condition',
  'system:',
  'prompt:',
  '<|',
];

// ---------------------------------------------------------------------------
// Mount tests
// ---------------------------------------------------------------------------

describe('F-11 CustomerRoute — mounts the chat surface + auxiliary panels', () => {
  it('mounts the route with the empty view-model; chat panel is the input surface', () => {
    const { getByTestId, container } = render(<CustomerRoute />);
    expect(getByTestId('customer-route')).toBeTruthy();
    expect(getByTestId('customer-chat-panel')).toBeTruthy();
    expect(getByTestId('customer-chat-panel-input')).toBeTruthy();
    expect(getByTestId('customer-chat-panel-submit')).toBeTruthy();
    expect(getByTestId('customer-compiled-config-panel')).toBeTruthy();
    expect(getByTestId('customer-capability-panel')).toBeTruthy();
    expect(getByTestId('customer-readiness-panel')).toBeTruthy();
    // Empty model: configuration panel renders its prompt-to-submit body.
    expect(container.textContent).toMatch(/Submit your intent/i);
  });

  it('mounts the route with a populated view-model and renders every auxiliary component', () => {
    const { getByTestId, queryAllByTestId } = render(
      <CustomerRoute initialViewModel={VIEW_MODEL} />,
    );
    const capRows = queryAllByTestId(/^customer-capability-row-/);
    expect(capRows.length).toBe(2);
    expect(getByTestId('customer-readiness-status')).toBeTruthy();
    const reasons = queryAllByTestId(/^customer-readiness-reason-\d+$/);
    expect(reasons.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Legacy-panel absence — the load-bearing F-11 acceptance assertion
// ---------------------------------------------------------------------------

describe('F-11 CustomerRoute — legacy panels are unmounted (A12 / F-11 acceptance)', () => {
  it('does NOT render the legacy IntentInputPanel testids', () => {
    const { queryByTestId } = render(<CustomerRoute />);
    expect(queryByTestId('customer-intent-panel')).toBeNull();
    expect(queryByTestId('customer-intent-textarea')).toBeNull();
    expect(queryByTestId('customer-intent-submit')).toBeNull();
  });

  it('does NOT render the legacy ClarificationLoopPanel testids', () => {
    const { queryByTestId } = render(<CustomerRoute initialViewModel={VIEW_MODEL} />);
    expect(queryByTestId('customer-clarification-panel')).toBeNull();
    expect(queryByTestId('customer-clarification-loop')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Negative-contract guards — the load-bearing acceptance assertions
// ---------------------------------------------------------------------------

describe('F-11 CustomerRoute — negative-contract guards', () => {
  it('with an empty view-model, the DOM contains no forbidden literals', () => {
    const { container } = render(<CustomerRoute />);
    for (const bad of FORBIDDEN_LITERALS) {
      expect(container.textContent ?? '').not.toContain(bad);
    }
  });

  it('with a populated view-model, the DOM still contains no forbidden literals', () => {
    const { container } = render(<CustomerRoute initialViewModel={VIEW_MODEL} />);
    for (const bad of FORBIDDEN_LITERALS) {
      expect(container.textContent ?? '').not.toContain(bad);
    }
  });

  it('renders the supported-with-workaround badge for the workaround row', () => {
    const { getByTestId } = render(<CustomerRoute initialViewModel={VIEW_MODEL} />);
    const badge = getByTestId('customer-capability-status-cap-2');
    expect(badge.textContent).toBe('Supported with workaround');
  });
});

// ---------------------------------------------------------------------------
// HAPPY-6 — three-workspace separation
// ---------------------------------------------------------------------------

describe('F-11 three-workspace separation (HAPPY-6)', () => {
  it('the customer route DOM contains no admin or internal data-testids', () => {
    const { container } = render(<CustomerRoute initialViewModel={VIEW_MODEL} />);
    expect(container.querySelector('[data-testid^="admin-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="internal-"]')).toBeNull();
  });

  it('the App router mounts /admin and /internal at their routes; /customer renders only customer panels', () => {
    const { container: customerContainer } = render(
      <MemoryRouter initialEntries={['/customer']}><App /></MemoryRouter>,
    );
    expect(customerContainer.querySelector('[data-testid="customer-route"]')).not.toBeNull();
    expect(customerContainer.querySelector('[data-testid="admin-route"]')).toBeNull();
    expect(customerContainer.querySelector('[data-testid="internal-route"]')).toBeNull();

    const { container: adminContainer } = render(
      <MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>,
    );
    expect(adminContainer.querySelector('[data-testid="admin-route"]')).not.toBeNull();
    expect(adminContainer.querySelector('[data-testid="customer-route"]')).toBeNull();
    expect(adminContainer.querySelector('[data-testid="internal-route"]')).toBeNull();

    const { container: internalContainer } = render(
      <MemoryRouter initialEntries={['/internal']}><App /></MemoryRouter>,
    );
    expect(internalContainer.querySelector('[data-testid="internal-route"]')).not.toBeNull();
    expect(internalContainer.querySelector('[data-testid="customer-route"]')).toBeNull();
    expect(internalContainer.querySelector('[data-testid="admin-route"]')).toBeNull();
  });

  it('the App default path redirects to /customer', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="customer-route"]')).not.toBeNull();
  });
});
