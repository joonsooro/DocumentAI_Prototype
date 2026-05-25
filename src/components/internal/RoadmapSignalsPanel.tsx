/**
 * F-13 — Roadmap signals panel.
 *
 * Renders the DAEJOO material-disposal phrase (and any future
 * unsupported_free_text_business_condition signals) HERE ONLY.
 * Per RED-2 / spec §5 N3: this is the containment boundary — the
 * phrase enters the system as F-06's free-text routing decision, is
 * gated by F-09, and finally surfaces as a row in this table. It
 * NEVER leaks back to /customer or /admin (enforced by the three-
 * workspace separation smoke tests on those routes).
 *
 * The "recurring_correction_pattern" category and "other" category
 * are also rendered here so admins can see what's been approved across
 * the board.
 */
import type { ProductSignal } from '@domain/types';
import { partitionApprovedSignals } from './viewModel';

interface Props {
  readonly signals: readonly ProductSignal[];
}

export function RoadmapSignalsPanel({ signals }: Props) {
  const { unsupportedFreeText, recurringCorrections, other } = partitionApprovedSignals(signals);

  return (
    <section data-testid="internal-roadmap-signals-panel" style={panelStyle}>
      <h2 style={headingStyle}>Roadmap signals</h2>
      <p style={subStyle}>
        Free-text business conditions and recurring correction patterns that need product attention.
        These signals surface here only — they are never shown on the customer or admin surfaces.
      </p>

      <CategoryBlock
        testId="internal-roadmap-unsupported-free-text"
        title="Unsupported free-text business conditions"
        signals={unsupportedFreeText}
        empty="None — no free-text business conditions have crossed governance yet."
      />
      <CategoryBlock
        testId="internal-roadmap-recurring-corrections"
        title="Recurring correction patterns"
        signals={recurringCorrections}
        empty="None — no recurring correction patterns have crossed governance yet."
      />
      <CategoryBlock
        testId="internal-roadmap-other"
        title="Other signals"
        signals={other}
        empty="None."
      />
    </section>
  );
}

function CategoryBlock({
  testId, title, signals, empty,
}: {
  testId: string;
  title: string;
  signals: readonly ProductSignal[];
  empty: string;
}) {
  return (
    <div data-testid={testId} style={blockStyle}>
      <h3 style={blockHeadingStyle}>{title}</h3>
      {signals.length === 0 ? (
        <p style={emptyStyle}>{empty}</p>
      ) : (
        <ul style={listStyle}>
          {signals.map((s) => (
            <li key={s.id} data-testid={`${testId}-row-${s.id}`} style={rowStyle}>
              <div style={titleLineStyle}>
                <span style={signalTypeBadge}>{s.signalType.replace(/_/g, ' ')}</span>
                <span style={impactChip(s.customerImpact)}>{s.customerImpact}</span>
                <span style={freqStyle}>freq {s.frequency}</span>
              </div>
              <p data-testid={`${testId}-fragment-${s.id}`} style={fragmentStyle}>
                {s.intentFragment ?? '(no intent fragment recorded)'}
              </p>
              <div style={metaStyle}>
                <span>doc {s.documentType}</span>
                {s.supplier ? <span>supplier {s.supplier}</span> : null}
                {s.country ? <span>country {s.country}</span> : null}
                {s.governanceApprovedAt ? <span>approved {s.governanceApprovedAt}</span> : null}
                <span>{s.suggestedProductArea}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function impactChip(impact: 'low' | 'medium' | 'high'): React.CSSProperties {
  return {
    background: impact === 'high' ? '#b00' : impact === 'medium' ? '#e9730c' : '#5a6168',
    color: '#fff', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
  };
}

const panelStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
  padding: '20px 24px', marginBottom: 16,
};
const headingStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: '#32363a',
};
const subStyle: React.CSSProperties = { fontSize: 13, color: '#6a6d70', margin: '0 0 16px' };
const blockStyle: React.CSSProperties = { marginBottom: 18 };
const blockHeadingStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: '#32363a',
};
const emptyStyle: React.CSSProperties = { color: '#6a6d70', fontSize: 13, margin: 0 };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };
const rowStyle: React.CSSProperties = {
  padding: '10px 0', borderBottom: '1px solid #eee',
};
const titleLineStyle: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6,
};
const signalTypeBadge: React.CSSProperties = {
  background: '#0a6ed1', color: '#fff', padding: '2px 8px',
  borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
};
const freqStyle: React.CSSProperties = {
  fontSize: 11, color: '#6a6d70', fontFamily: 'ui-monospace, monospace',
};
const fragmentStyle: React.CSSProperties = {
  margin: '6px 0', fontSize: 13, color: '#32363a',
};
const metaStyle: React.CSSProperties = {
  display: 'flex', gap: 16, fontSize: 11, color: '#6a6d70',
  fontFamily: 'ui-monospace, monospace', flexWrap: 'wrap',
};
