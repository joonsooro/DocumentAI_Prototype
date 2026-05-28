// @vitest-environment jsdom
/**
 * F-20 — Walkthrough timing harness (EDGE-4).
 *
 * Scripts a /customer → /admin → /internal walkthrough using MemoryRouter
 * and times the full round-trip with performance.now(). The contract
 * acceptance is walkthroughDurationMs < 300_000 (5 minutes); the
 * realistic measurement here is in the order of tens of milliseconds —
 * the assertion is the upper-bound spec invariant, not a tight bound.
 *
 * Three runs total — the kill switch (30 min) trips if any one run
 * exceeds 300_000ms. In practice this would only fire if a route mount
 * deadlocks or the React tree blows up.
 *
 * Also exercises the SUPPLIER PORTABILITY clause of EDGE-4: adding a
 * second supplier fixture is a single-line registry edit in
 * src/data/assets.ts + a new fixture JSON; the control layer
 * (src/domain/*) does NOT change. The test proves this by:
 *   (a) constructing an in-memory Amazon configuration WITHOUT importing
 *       from src/domain/* (only @domain/types — pure types, not control).
 *   (b) demonstrating the same routes render against it.
 * If a future contributor needs to edit src/domain/* to onboard a
 * supplier, this test still passes — but the architectural promise has
 * been broken; that breakage is caught by code review, not vitest.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import type { CompiledConfiguration, CustomerIntent } from '@domain/types';
import CustomerRoute from '@routes/customer';

const ROUTES = ['/customer', '/admin', '/internal'] as const;

// EDGE-4 acceptance: walkthroughDurationMs < 300_000 (5 minutes).
const MAX_WALKTHROUGH_MS = 300_000;

function runWalkthroughOnce(): number {
  const start = performance.now();
  for (const path of ROUTES) {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>,
    );
    // Mount sanity check: the right route landed.
    const expectedTestId =
      path === '/customer'
        ? 'customer-route'
        : path === '/admin'
          ? 'admin-route'
          : 'internal-route';
    if (!container.querySelector(`[data-testid="${expectedTestId}"]`)) {
      throw new Error(`F-20 walkthrough: ${path} did not mount the expected route`);
    }
    cleanup();
  }
  return performance.now() - start;
}

beforeEach(() => {
  cleanup();
});
afterEach(() => {
  cleanup();
});

describe('F-20 walkthrough timing — EDGE-4 acceptance', () => {
  it('one walkthrough completes in under 300_000 ms', () => {
    const ms = runWalkthroughOnce();
    expect(ms).toBeLessThan(MAX_WALKTHROUGH_MS);
  });

  it('three consecutive walkthroughs all complete in under 300_000 ms', () => {
    const durations: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      durations.push(runWalkthroughOnce());
    }
    for (const d of durations) {
      expect(d).toBeLessThan(MAX_WALKTHROUGH_MS);
    }
    // Also surface the realistic numbers so a regression toward the
    // 5-minute bound becomes visible long before it trips the assertion.
    // (Vitest prints test names, not console.log by default; keep this
    // commented so it can be enabled when investigating slowdowns.)
    // console.log('F-20 walkthrough durations (ms):', durations);
  });
});

// ---------------------------------------------------------------------------
// EDGE-4 — supplier-portability sub-clause
// ---------------------------------------------------------------------------
// "adding a second supplier fixture in src/data/ does not require editing
// the control layer." This test constructs a stub Amazon configuration
// using ONLY @domain/types (which is pure type definitions, not control)
// and feeds it through the existing CustomerRoute. If the route renders
// the new supplier's intent + config without touching src/domain/* runtime
// modules, the architectural promise holds.

describe('F-20 supplier portability — EDGE-4 sub-clause', () => {
  it('a stub Amazon CompiledConfiguration renders through the existing customer route without editing the control layer', () => {
    const AMAZON_INTENT: CustomerIntent = {
      id: 'intent::amazon::v0',
      raw: 'Extract order_number, ship_date, line_items, tax_amount for Amazon vendor invoices.',
      documentType: 'amazon_vendor_invoice',
      capturedAt: '2026-05-25T00:00:00Z',
    };

    const AMAZON_CONFIG: CompiledConfiguration = {
      id: 'cfg::amazon::v0',
      intentId: AMAZON_INTENT.id,
      schema: {
        fields: [
          { name: 'order_number', dataType: 'string', required: true, instruction: 'Extract order number from the header.', validation: 'non-empty', regex: '^\\d{3}-\\d{7}-\\d{7}$', confidenceThreshold: 0.9 },
          { name: 'ship_date', dataType: 'date', required: true, instruction: 'Extract ship date from the dispatch block.', validation: 'date', regex: '.+', confidenceThreshold: 0.85 },
        ],
      },
      processingMode: 'auto_confirm',
      source: 'aiCore',
      templateUsed: false,
      compiledAt: '2026-05-25T00:00:00Z',
      extractionSystemPrompt:
        'You are an extraction agent. Extract order_number and ship_date from the document.',
    };

    const { getByTestId, container } = render(
      <CustomerRoute
        initialViewModel={{
          intent: AMAZON_INTENT,
          configuration: AMAZON_CONFIG,
          assessments: [],
          clarifications: [],
          readiness: null,
        }}
      />,
    );
    expect(getByTestId('customer-route')).toBeTruthy();
    expect(getByTestId('customer-compiled-config-panel')).toBeTruthy();
    // The Amazon-specific fields render in the config panel.
    expect(getByTestId('customer-config-row-order_number')).toBeTruthy();
    expect(getByTestId('customer-config-row-ship_date')).toBeTruthy();
    // Negative-contract guards still hold for the new supplier.
    const text = container.textContent ?? '';
    expect(text).not.toContain('Unsupported');
    expect(text).not.toContain('system:');
    expect(text).not.toContain('prompt:');
  });
});
