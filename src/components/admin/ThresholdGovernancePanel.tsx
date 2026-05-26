/**
 * F-24 — Admin Threshold Governance dual-approval informational surface.
 *
 * Renders a top message strip with the verbatim text required by the
 * acceptance criterion (A10 informational guard) + a direction-tag
 * column carrying one of three exact strings: '↑ allowed' / '— no change'
 * / '↓ requires approval'. The decrease action button is intentionally
 * non-destructive: clicking it surfaces a tooltip with the literal
 * "Requires dual approval — v2" text and mutates NO entity store
 * (corrections, signals, metrics, threshold map all unchanged).
 *
 * v1 is informational ONLY — the dual-approval workflow itself is
 * OQ-4 (blocked on SUB-5 auth resolution), deferred to v2. The N2
 * invariant (never recommend lowering thresholds) is preserved because
 * this panel is a GOVERNANCE TOOL, not a recommendation surface.
 *
 * Local in-memory threshold store is a frozen seed; the no-op click
 * path proves the store reference is unchanged after a decrease attempt
 * (EDGE-5 store-unchanged binding).
 */
import { CSSProperties, useState } from 'react';

const MESSAGE_STRIP_TEXT =
  'Threshold lowering is restricted. Any decrease requires a recorded rationale and dual approval.';

const TOOLTIP_TEXT = 'Requires dual approval — v2';

export type ThresholdDirection = '↑ allowed' | '— no change' | '↓ requires approval';

export type ThresholdRow = {
  readonly id: string;
  readonly field: string;
  readonly currentThreshold: number;
  readonly proposedThreshold: number | null;
  readonly direction: ThresholdDirection;
};

export type ThresholdGovernancePanelProps = {
  rows?: readonly ThresholdRow[];
};

const DEFAULT_ROWS: readonly ThresholdRow[] = Object.freeze([
  {
    id: 'thr::payment_terms',
    field: 'payment_terms',
    currentThreshold: 0.85,
    proposedThreshold: 0.9,
    direction: '↑ allowed' as const,
  },
  {
    id: 'thr::supplier',
    field: 'supplier',
    currentThreshold: 0.85,
    proposedThreshold: 0.85,
    direction: '— no change' as const,
  },
  {
    id: 'thr::payable_amount',
    field: 'payable_amount',
    currentThreshold: 0.85,
    proposedThreshold: 0.7,
    direction: '↓ requires approval' as const,
  },
]);

export function ThresholdGovernancePanel(props: ThresholdGovernancePanelProps) {
  const rows = props.rows ?? DEFAULT_ROWS;
  const [tooltipForRow, setTooltipForRow] = useState<string | null>(null);

  const onDecreaseAttempt = (rowId: string) => {
    // No-op: surface the tooltip + leave every store untouched. The N9
    // / N2 invariants are preserved structurally — this handler never
    // touches the in-memory threshold map, corrections, signals, or
    // metrics. The EDGE-5 store-unchanged invariant is asserted in the
    // test by comparing snapshots before + after this click.
    setTooltipForRow(rowId);
  };

  return (
    <section
      data-testid="admin-threshold-governance-panel"
      style={panelStyle}
    >
      <div data-testid="admin-threshold-message-strip" role="status" style={stripStyle}>
        {MESSAGE_STRIP_TEXT}
      </div>
      <table data-testid="admin-threshold-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Current</th>
            <th style={thStyle}>Proposed</th>
            <th style={thStyle}>Direction</th>
            <th style={thStyle}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isDecrease = row.direction === '↓ requires approval';
            return (
              <tr key={row.id} data-testid={`admin-threshold-row-${row.id}`}>
                <td style={tdStyle}>{row.field}</td>
                <td style={tdMonoStyle}>{row.currentThreshold.toFixed(2)}</td>
                <td style={tdMonoStyle}>
                  {row.proposedThreshold === null ? '—' : row.proposedThreshold.toFixed(2)}
                </td>
                <td
                  data-testid="admin-threshold-direction"
                  style={tdDirectionStyle(row.direction)}
                >
                  {row.direction}
                </td>
                <td style={tdStyle}>
                  {isDecrease ? (
                    <>
                      <button
                        type="button"
                        data-testid={`admin-threshold-decrease-attempt-${row.id}`}
                        onClick={() => onDecreaseAttempt(row.id)}
                        style={decreaseBtnStyle}
                      >
                        Submit decrease
                      </button>
                      {tooltipForRow === row.id && (
                        <span
                          data-testid="admin-threshold-decrease-tooltip"
                          role="tooltip"
                          style={tooltipStyle}
                        >
                          {TOOLTIP_TEXT}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={mutedStyle}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const panelStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--card-padding)',
  fontFamily: 'var(--font-sans)',
};

const stripStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-button)',
  background: 'var(--warn-bg)',
  color: 'var(--warn)',
  fontSize: 'var(--body-size)',
  marginBottom: '12px',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--body-size)',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--line)',
  fontSize: 'var(--table-head-size)',
  letterSpacing: 'var(--table-head-tracking)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};

const tdStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid var(--line-2)',
  color: 'var(--ink-1)',
};

const tdMonoStyle: CSSProperties = {
  ...tdStyle,
  fontFamily: 'var(--font-mono)',
  color: 'var(--ink-2)',
};

const tdDirectionStyle = (direction: ThresholdDirection): CSSProperties => ({
  ...tdStyle,
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
  color:
    direction === '↑ allowed'
      ? 'var(--ok)'
      : direction === '↓ requires approval'
        ? 'var(--err)'
        : 'var(--ink-3)',
});

const decreaseBtnStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--line)',
  background: 'var(--panel-2)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: '12px',
};

const tooltipStyle: CSSProperties = {
  display: 'inline-block',
  marginLeft: '8px',
  padding: '2px 8px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--err-bg)',
  color: 'var(--err)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const mutedStyle: CSSProperties = {
  color: 'var(--ink-4)',
  fontFamily: 'var(--font-mono)',
};
