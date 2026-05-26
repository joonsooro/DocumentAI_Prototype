/**
 * F-13 — Hidden internal signal card (handoff-derived 8-attribute grid).
 *
 * Renders the DAEJOO disposal phrase (or any future free-text business
 * condition) under signalType='unsupported_free_text_business_condition'
 * as a single dark-themed card with the exact 8 grid attributes:
 *
 *   1. Signal type
 *   2. Category
 *   3. Affected doc type
 *   4. Customer segment
 *   5. Frequency
 *   6. Current workaround
 *   7. Candidate product area
 *   8. Roadmap actionability
 *
 * Root carries CSS class containing 'signal-card'. Label "Hidden
 * internal signal · not shown to customer" is rendered as an
 * accessibility-visible element. RED-2 containment preserved: the
 * disposal phrase renders HERE ONLY; the customer + admin route smoke
 * tests assert their DOMs carry no internal- data-testids.
 */
import { CSSProperties } from 'react';
import type { ProductSignal } from '@domain/types';

export type HiddenSignalCardProps = {
  signal: ProductSignal;
  customerSegment?: string;
  currentWorkaround?: string;
  candidateProductArea?: string;
  roadmapActionability?: string;
};

const ATTR_LABELS = [
  'Signal type',
  'Category',
  'Affected doc type',
  'Customer segment',
  'Frequency',
  'Current workaround',
  'Candidate product area',
  'Roadmap actionability',
] as const;

export function HiddenSignalCard(props: HiddenSignalCardProps) {
  const { signal, customerSegment, currentWorkaround, candidateProductArea, roadmapActionability } = props;
  const values: readonly string[] = [
    signal.signalType,
    signal.category,
    signal.documentType,
    customerSegment ?? `customers seen: ${signal.customerCount ?? '—'}`,
    String(signal.frequency),
    currentWorkaround ?? '(none recorded)',
    candidateProductArea ?? signal.suggestedProductArea,
    roadmapActionability ?? (signal.actionability ?? '—'),
  ];

  return (
    <section
      data-testid={`internal-hidden-signal-card-${signal.id}`}
      className="signal-card"
      style={cardStyle}
    >
      <header style={headerStyle}>
        <span
          data-testid={`internal-hidden-signal-card-label-${signal.id}`}
          style={labelStyle}
        >
          Hidden internal signal · not shown to customer
        </span>
        <span style={signalIdStyle}>{signal.id}</span>
      </header>
      <p
        data-testid={`internal-hidden-signal-card-fragment-${signal.id}`}
        style={fragmentStyle}
      >
        {signal.intentFragment ?? '(no intent fragment recorded)'}
      </p>
      <dl
        data-testid={`internal-hidden-signal-card-grid-${signal.id}`}
        style={gridStyle}
      >
        {ATTR_LABELS.map((attr, idx) => (
          <div key={attr} style={cellStyle}>
            <dt
              data-testid={`internal-hidden-signal-attr-label-${idx}-${signal.id}`}
              style={dtStyle}
            >
              {attr}
            </dt>
            <dd
              data-testid={`internal-hidden-signal-attr-value-${idx}-${signal.id}`}
              style={ddStyle}
            >
              {values[idx]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--shell-bg)',
  color: '#E1E4EA',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--card-padding)',
  border: '1px solid var(--sidenav-bg)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
  paddingBottom: '8px',
  borderBottom: '1px solid #1F2A3D',
};

const labelStyle: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#8A95A4',
};

const signalIdStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: '#5F6B7A',
};

const fragmentStyle: CSSProperties = {
  margin: '0 0 12px',
  color: '#FFFFFF',
  fontFamily: 'var(--font-sans)',
  fontSize: '14px',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '8px',
  margin: 0,
};

const cellStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.04)',
  borderRadius: 'var(--radius-button)',
  padding: '6px 10px',
};

const dtStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#8A95A4',
  marginBottom: '2px',
};

const ddStyle: CSSProperties = {
  margin: 0,
  color: '#E1E4EA',
  fontSize: '12px',
};
