// @vitest-environment jsdom
/**
 * F-13 — Internal Product Intelligence REBUILD tests (S3.REBUILD).
 *
 * Asserts:
 *   - F-21 ObjectHeader with 5 tabs in the verbatim order.
 *   - FlywheelDiagram renders exactly 5 nodes in the required label
 *     order with the 5th carrying a CSS class containing 'accent'.
 *   - HiddenSignalCard renders the 8-attribute grid + the literal
 *     label "Hidden internal signal · not shown to customer" + the
 *     root carries CSS class containing 'signal-card'.
 *   - RED-2 containment is preserved: the disposal phrase appears in
 *     internal-route DOM under the free-text card.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import InternalRoute from './internal';
import type { InternalViewModel } from '@components/internal/viewModel';
import type { ProductSignal } from '@domain/types';

const FIVE_TAB_LABELS = [
  'Flywheel',
  'Feedback queue',
  'Model regression',
  'Capability gaps',
  'Roadmap evidence',
] as const;

const FIVE_FLYWHEEL_LABELS = [
  'Customer intent',
  'Corrections + workarounds',
  'Governance queue',
  'Product signals',
  'Roadmap evidence',
] as const;

const DISPOSAL_SIGNAL: ProductSignal = {
  id: 'sig-daejoo-disposal',
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial invoice / logistics compliance',
  intentFragment: 'auto-dispose spent materials at the supplier dock',
  suggestedProductArea: 'free-text business-condition handler',
  frequency: 1,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: 'DAEJOO',
  country: null,
  sourceCorrectionIds: [],
  governanceApprovedAt: '2026-05-25T15:00:00Z',
  status: 'governance_approved',
  provenance: 'curated_v1',
};

const VM_WITH_SIGNAL: InternalViewModel = {
  governanceQueue: [],
  approvedSignals: [DISPOSAL_SIGNAL],
  regressionSignals: [],
  capabilityGaps: [],
  corrections: [],
};

describe('F-13 InternalRoute REBUILD', () => {
  beforeEach(() => cleanup());

  it('mounts F-21 ObjectHeader with the 5 required tabs in the verbatim order', () => {
    render(<InternalRoute />);
    const tablist = screen.getByRole('tablist');
    const tabs = tablist.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map((t) => t.textContent);
    expect(labels).toEqual([...FIVE_TAB_LABELS]);
  });

  it('FlywheelDiagram renders exactly 5 nodes in the required label order', () => {
    render(<InternalRoute />);
    expect(screen.getByTestId('internal-flywheel-diagram')).toBeTruthy();
    // The 5 nodes are testids 'internal-flywheel-node-<slug>'
    const nodes = [
      'customer-intent',
      'corrections-workarounds',
      'governance-queue',
      'product-signals',
      'roadmap-evidence',
    ];
    nodes.forEach((slug, idx) => {
      const node = screen.getByTestId(`internal-flywheel-node-${slug}`);
      expect(node).toBeTruthy();
      expect(node.getAttribute('data-node-position')).toBe(String(idx + 1));
      expect(node.textContent).toContain(FIVE_FLYWHEEL_LABELS[idx]);
    });
  });

  it('5th flywheel node (Roadmap evidence) carries a CSS class containing "accent"', () => {
    render(<InternalRoute />);
    const node = screen.getByTestId('internal-flywheel-node-roadmap-evidence');
    expect(node.className).toContain('accent');
  });

  it('HiddenSignalCard renders for free-text signals with 8 grid attributes and the literal label', () => {
    render(<InternalRoute initialViewModel={VM_WITH_SIGNAL} />);
    const card = screen.getByTestId('internal-hidden-signal-card-sig-daejoo-disposal');
    expect(card).toBeTruthy();
    expect(card.className).toContain('signal-card');

    const label = screen.getByTestId(
      'internal-hidden-signal-card-label-sig-daejoo-disposal',
    );
    expect(label.textContent).toBe('Hidden internal signal · not shown to customer');

    // 8 attribute labels — assert each appears
    const expectedAttrs = [
      'Signal type',
      'Category',
      'Affected doc type',
      'Customer segment',
      'Frequency',
      'Current workaround',
      'Candidate product area',
      'Roadmap actionability',
    ];
    for (let i = 0; i < expectedAttrs.length; i++) {
      const attrLabel = screen.getByTestId(
        `internal-hidden-signal-attr-label-${i}-sig-daejoo-disposal`,
      );
      expect(attrLabel.textContent).toBe(expectedAttrs[i]);
    }
  });

  it('RED-2: internal-route DOM contains both the disposal phrase AND the signal-type label', () => {
    const { container } = render(<InternalRoute initialViewModel={VM_WITH_SIGNAL} />);
    const html = container.textContent ?? '';
    expect(html).toContain('auto-dispose spent materials');
    expect(html).toContain('unsupported_free_text_business_condition');
  });

  it('HAPPY-6: internal-route subtree carries no foreign customer- / admin- data-testids', () => {
    render(<InternalRoute initialViewModel={VM_WITH_SIGNAL} />);
    const root = screen.getByTestId('internal-route');
    expect(root.querySelector('[data-testid^="customer-"]')).toBeNull();
    expect(root.querySelector('[data-testid^="admin-"]')).toBeNull();
  });
});
