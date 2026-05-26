/**
 * @vitest-environment jsdom
 *
 * F-24 — ThresholdGovernancePanel tests.
 *
 * EDGE-5 binding: a decrease-attempt click surfaces the tooltip with
 * the literal "Requires dual approval — v2" text + leaves every store
 * (corrections, signals, metrics) UNCHANGED.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThresholdGovernancePanel } from './ThresholdGovernancePanel';
import {
  getCorrections,
  getProductSignals,
  _resetCorrectionStoreForTests,
} from '@domain/submitCorrection';
import {
  getMetrics,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';

describe('F-24 ThresholdGovernancePanel', () => {
  beforeEach(() => {
    cleanup();
    _resetCorrectionStoreForTests();
    _resetQualityMetricLogForTests();
  });

  it("renders the panel with data-testid='admin-threshold-governance-panel'", () => {
    render(<ThresholdGovernancePanel />);
    expect(screen.getByTestId('admin-threshold-governance-panel')).toBeTruthy();
  });

  it('message strip carries the verbatim A10 informational text', () => {
    render(<ThresholdGovernancePanel />);
    const strip = screen.getByTestId('admin-threshold-message-strip');
    expect(strip.textContent).toBe(
      'Threshold lowering is restricted. Any decrease requires a recorded rationale and dual approval.',
    );
  });

  it('direction cells render exactly one of the three required strings', () => {
    render(<ThresholdGovernancePanel />);
    const cells = screen.getAllByTestId('admin-threshold-direction');
    const allowedDirections = ['↑ allowed', '— no change', '↓ requires approval'];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(allowedDirections).toContain(cell.textContent);
    }
  });

  it("default fixture includes at least one row with '↓ requires approval'", () => {
    render(<ThresholdGovernancePanel />);
    const cells = screen.getAllByTestId('admin-threshold-direction');
    expect(cells.some((c) => c.textContent === '↓ requires approval')).toBe(true);
  });

  it('EDGE-5: decrease-attempt click surfaces the tooltip with literal v2 text + leaves stores unchanged', () => {
    const correctionsBefore = getCorrections().length;
    const signalsBefore = getProductSignals().length;
    const metricsBefore = getMetrics().length;

    render(<ThresholdGovernancePanel />);

    // No tooltip rendered before any click
    expect(screen.queryByTestId('admin-threshold-decrease-tooltip')).toBeNull();

    const decreaseBtn = screen.getByTestId('admin-threshold-decrease-attempt-thr::payable_amount');
    fireEvent.click(decreaseBtn);

    const tooltip = screen.getByTestId('admin-threshold-decrease-tooltip');
    expect(tooltip.textContent).toContain('Requires dual approval — v2');

    // EDGE-5 store-unchanged invariant
    expect(getCorrections().length).toBe(correctionsBefore);
    expect(getProductSignals().length).toBe(signalsBefore);
    expect(getMetrics().length).toBe(metricsBefore);
  });

  it('panel DOM does NOT match /lower(ing)?\\s+(the\\s+)?threshold/i (N2 preserved)', () => {
    render(<ThresholdGovernancePanel />);
    const panel = screen.getByTestId('admin-threshold-governance-panel');
    // The forbidden phrase is "lower the threshold" / "lowering threshold" —
    // verbatim word order. The message strip says "Threshold lowering is
    // restricted" which is the REVERSE order, so the regex correctly does
    // NOT match.
    expect(panel.textContent ?? '').not.toMatch(/lower(ing)?\s+(the\s+)?threshold/i);
  });

  it('non-decrease rows render no action button (direction is informational only)', () => {
    render(<ThresholdGovernancePanel />);
    expect(screen.queryByTestId('admin-threshold-decrease-attempt-thr::supplier')).toBeNull();
    expect(screen.queryByTestId('admin-threshold-decrease-attempt-thr::payment_terms')).toBeNull();
  });
});
