// @vitest-environment jsdom
/**
 * F-12 — Admin Control Plane REBUILD tests (S3.REBUILD).
 *
 * Asserts:
 *   - F-21 ObjectHeader with 5 tabs in the required label order.
 *   - F-12 5-KPI strip with verbatim labels.
 *   - RecommendationQueuePanel renders the 3 verbatim card titles.
 *   - F-24 ThresholdGovernancePanel mounted as a sub-panel.
 *   - admin-route DOM does not match /lower(ing)?\s+(the\s+)?threshold/i
 *     in any recommendation context.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AdminRoute from './admin';

const FIVE_TAB_LABELS = [
  'Recommendations',
  'Prompt versions',
  'Threshold governance',
  'Schema quality',
  'Correction trends',
] as const;

const FIVE_KPI_LABELS = [
  'STP rate',
  'Field accuracy',
  'Correction rate',
  'Workaround intents',
  'Pending recommendations',
] as const;

const THREE_VERBATIM_REC_TITLES = [
  'Add reusable rule for no-commercial-value line handling',
  'Create supplier-specific prompt version for DAEJOO commercial invoices',
  'Add field instruction for payable amount vs customs total',
] as const;

describe('F-12 AdminRoute REBUILD', () => {
  beforeEach(() => cleanup());

  it('mounts F-21 ObjectHeader with the 5 required tabs in the required order', () => {
    render(<AdminRoute />);
    const tablist = screen.getByRole('tablist');
    const tabs = tablist.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map((t) => t.textContent);
    expect(labels).toEqual([...FIVE_TAB_LABELS]);
  });

  it('renders exactly 5 KPI cards with the verbatim handoff labels', () => {
    render(<AdminRoute />);
    const cards = screen.getAllByTestId('admin-kpi-card');
    expect(cards.length).toBe(5);
    const labels = cards.map(
      (c) => (c.firstChild?.textContent ?? '').trim(),
    );
    expect(labels).toEqual([...FIVE_KPI_LABELS]);
  });

  it('RecommendationQueuePanel renders ≥3 cards including the 3 verbatim titles', () => {
    const { container } = render(<AdminRoute />);
    const html = container.textContent ?? '';
    for (const title of THREE_VERBATIM_REC_TITLES) {
      expect(html).toContain(title);
    }
  });

  it('mounts the F-24 ThresholdGovernancePanel as a sub-panel', () => {
    render(<AdminRoute />);
    expect(screen.getByTestId('admin-threshold-governance-panel')).toBeTruthy();
    expect(screen.getByTestId('admin-threshold-message-strip').textContent).toContain(
      'Threshold lowering is restricted',
    );
  });

  it('admin-route DOM does not match /lower(ing)?\\s+(the\\s+)?threshold/i in any recommendation context (N2)', () => {
    const { container } = render(<AdminRoute />);
    // The F-24 message strip says "Threshold lowering is restricted" —
    // reverse word order, does NOT match the regex.
    expect(container.textContent ?? '').not.toMatch(/lower(ing)?\s+(the\s+)?threshold/i);
  });

  it('HAPPY-6: admin-route carries no foreign customer- / internal- data-testids', () => {
    const { container } = render(<AdminRoute />);
    // The chrome's shell-bar-nav-customer / shell-bar-nav-internal live
    // OUTSIDE the admin-route element; here we only check within the
    // admin-route subtree.
    const root = screen.getByTestId('admin-route');
    expect(root.querySelector('[data-testid^="customer-"]')).toBeNull();
    expect(root.querySelector('[data-testid^="internal-"]')).toBeNull();
    void container;
  });
});
