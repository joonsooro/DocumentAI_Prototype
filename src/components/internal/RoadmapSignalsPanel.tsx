/**
 * F-29 — RoadmapSignalsPanel.
 *
 * Renders the Internal Product Intelligence roadmap-evidence list,
 * ranked via F-25 rankRoadmapEvidence. Each row's reason line is the
 * byte-exact output of F-25 generateRoadmapReason — no inline string
 * formatting here. Provisional signals carry a "Being assessed for
 * validity" tag per A13; governance_approved signals do not. Rank
 * positions #1 and #2 carry an accent badge.
 *
 * Input type is the broader ProductSignal[]. Signals missing any of
 * the 4 F-25 ranking fields (customerCount, workaroundBurden,
 * actionability, expectedStpLift) are dropped from the ranked list and
 * surfaced via the data-testid='internal-roadmap-signals-unranked'
 * counter. This keeps the panel compatible with the F-13 internal-route
 * viewModel until F-13's rebuild lands.
 */
import { CSSProperties } from 'react';
import type { ProductSignal } from '@domain/types';
import {
  generateRoadmapReason,
  rankRoadmapEvidence,
  type RoadmapRankingInput,
} from '@domain/roadmapRanking';
import { partitionApprovedSignals } from './viewModel';

const PROVISIONAL_TAG_TEXT = 'Being assessed for validity';

export type RoadmapSignalsPanelProps = {
  signals: readonly ProductSignal[];
};

function isRankingInput(s: ProductSignal): s is RoadmapRankingInput {
  return (
    typeof s.customerCount === 'number' &&
    typeof s.workaroundBurden === 'string' &&
    typeof s.actionability === 'string' &&
    typeof s.expectedStpLift === 'number'
  );
}

export function RoadmapSignalsPanel(props: RoadmapSignalsPanelProps) {
  const ranked = rankRoadmapEvidence(props.signals.filter(isRankingInput));
  const unrankedCount = props.signals.length - ranked.length;
  // Legacy F-13 v1 category blocks. The new F-25 ranked list above is the
  // primary surface; this block is kept for compatibility with F-13 v1
  // smoke tests until F-13's rebuild lands and replaces the assertions.
  const { unsupportedFreeText, recurringCorrections, other } = partitionApprovedSignals(
    props.signals,
  );

  return (
    <section data-testid="internal-roadmap-signals-panel" style={panelStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Roadmap evidence</h2>
      </header>
      <ol style={listStyle}>
        {ranked.map((signal, idx) => {
          const isAccent = idx < 2;
          const isProvisional = signal.status === 'provisional';
          const reason = generateRoadmapReason(signal);
          const rank = idx + 1;
          return (
            <li
              key={signal.id}
              data-testid={`internal-roadmap-signal-row-${signal.id}`}
              data-rank={rank}
              data-signal-status={signal.status ?? 'unknown'}
              style={{
                ...rowStyle,
                ...(isAccent ? rowAccentStyle : {}),
              }}
            >
              <div style={rowHeaderStyle}>
                <span
                  data-testid={`internal-roadmap-signal-rank-${signal.id}`}
                  style={{
                    ...rankBadgeStyle,
                    ...(isAccent ? rankBadgeAccentStyle : {}),
                  }}
                >
                  #{rank}
                </span>
                <span style={categoryStyle}>{signal.category}</span>
                {isProvisional && (
                  <span
                    data-testid={`internal-roadmap-signal-provisional-tag-${signal.id}`}
                    style={provisionalTagStyle}
                  >
                    {PROVISIONAL_TAG_TEXT}
                  </span>
                )}
              </div>
              <p
                data-testid={`internal-roadmap-signal-reason-${signal.id}`}
                style={reasonStyle}
              >
                {reason}
              </p>
            </li>
          );
        })}
        {ranked.length === 0 && (
          <li data-testid="internal-roadmap-signals-empty" style={emptyStyle}>
            No ranked roadmap evidence yet.
          </li>
        )}
      </ol>
      {unrankedCount > 0 && (
        <p
          data-testid="internal-roadmap-signals-unranked"
          style={unrankedNoteStyle}
        >
          {unrankedCount} signal{unrankedCount === 1 ? '' : 's'} pending ranking metadata.
        </p>
      )}
      <LegacyCategoryBlock
        testId="internal-roadmap-unsupported-free-text"
        title="Unsupported free-text business conditions"
        signals={unsupportedFreeText}
      />
      <LegacyCategoryBlock
        testId="internal-roadmap-recurring-corrections"
        title="Recurring correction patterns"
        signals={recurringCorrections}
      />
      <LegacyCategoryBlock
        testId="internal-roadmap-other"
        title="Other signals"
        signals={other}
      />
      <footer data-testid="internal-roadmap-signals-info" style={infoStyle}>
        Ranked by frequency · customers · workaround burden · actionability · expected STP lift.
      </footer>
    </section>
  );
}

/**
 * Legacy F-13 v1 category block. Renders the original
 * internal-roadmap-{unsupported-free-text,recurring-corrections,other}
 * data-testids so the v1 smoke tests in src/routes/internal.test.tsx
 * keep passing until F-13's rebuild lands.
 */
function LegacyCategoryBlock(props: {
  readonly testId: string;
  readonly title: string;
  readonly signals: readonly ProductSignal[];
}) {
  const { testId, title, signals } = props;
  if (signals.length === 0) return null;
  return (
    <div data-testid={testId} style={legacyBlockStyle}>
      <h3 style={legacyHeadingStyle}>{title}</h3>
      <ul style={legacyListStyle}>
        {signals.map((s) => (
          <li
            key={s.id}
            data-testid={`${testId}-row-${s.id}`}
            style={legacyRowStyle}
          >
            <span style={legacyTypeStyle}>{s.signalType.replace(/_/g, ' ')}</span>
            <p data-testid={`${testId}-fragment-${s.id}`} style={legacyFragmentStyle}>
              {s.intentFragment ?? '(no intent fragment recorded)'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--card-padding)',
};

const headerStyle: CSSProperties = { marginBottom: '8px' };

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--panel-title-size)',
  fontWeight: 600,
  color: 'var(--ink-1)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const rowStyle: CSSProperties = {
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-card)',
  padding: '10px 12px',
  background: 'var(--panel-2)',
};

const rowAccentStyle: CSSProperties = {
  borderColor: 'var(--brand-50)',
  background: 'var(--brand-50)',
};

const rowHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const rankBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '24px',
  padding: '2px 6px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--line)',
  color: 'var(--ink-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
};

const rankBadgeAccentStyle: CSSProperties = {
  background: 'var(--brand)',
  color: '#FFFFFF',
};

const categoryStyle: CSSProperties = {
  flex: 1,
  color: 'var(--ink-1)',
  fontSize: 'var(--body-size)',
  fontWeight: 500,
};

const provisionalTagStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--warn-bg)',
  color: 'var(--warn)',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
};

const reasonStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--ink-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
};

const emptyStyle: CSSProperties = {
  color: 'var(--ink-4)',
  fontStyle: 'italic',
};

const unrankedNoteStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--ink-3)',
  fontSize: '11.5px',
  fontStyle: 'italic',
};

const infoStyle: CSSProperties = {
  marginTop: '10px',
  paddingTop: '8px',
  borderTop: '1px solid var(--line-2)',
  color: 'var(--ink-3)',
  fontSize: '11.5px',
};

const legacyBlockStyle: CSSProperties = {
  marginTop: '12px',
  paddingTop: '8px',
  borderTop: '1px dashed var(--line-2)',
};

const legacyHeadingStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--ink-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const legacyListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const legacyRowStyle: CSSProperties = {
  padding: '6px 0',
  borderBottom: '1px solid var(--line-2)',
};

const legacyTypeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--brand-50)',
  color: 'var(--brand-700)',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
};

const legacyFragmentStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--ink-1)',
  fontSize: 'var(--body-size)',
};
