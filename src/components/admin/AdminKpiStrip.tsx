/**
 * F-12 — Admin KPI strip (handoff-derived inventory).
 *
 * Renders exactly 5 KPI cards with the verbatim labels:
 *   STP rate · Field accuracy · Correction rate · Workaround intents ·
 *   Pending recommendations
 *
 * Values are illustrative — the design handoff's "78.4% STP" is
 * reference-only and not a behaviour bound. Real KPI telemetry binding
 * is S4 OBSERVE work.
 */
import { CSSProperties } from 'react';

export type AdminKpi = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
};

const DEFAULT_KPIS: readonly AdminKpi[] = Object.freeze([
  { id: 'stp-rate', label: 'STP rate', value: '78.4%', hint: 'last 30 days' },
  { id: 'field-accuracy', label: 'Field accuracy', value: '92.1%', hint: 'avg across 9 fields' },
  { id: 'correction-rate', label: 'Correction rate', value: '4.7%', hint: 'corrections / runs' },
  { id: 'workaround-intents', label: 'Workaround intents', value: '12', hint: 'active' },
  { id: 'pending-recommendations', label: 'Pending recommendations', value: '3', hint: 'in queue' },
]);

export type AdminKpiStripProps = {
  kpis?: readonly AdminKpi[];
};

export function AdminKpiStrip(props: AdminKpiStripProps) {
  const kpis = props.kpis ?? DEFAULT_KPIS;
  return (
    <section
      data-testid="admin-kpi-strip"
      style={stripStyle}
      aria-label="Key performance indicators"
    >
      {kpis.map((kpi) => (
        <article
          key={kpi.id}
          data-testid="admin-kpi-card"
          data-kpi-id={kpi.id}
          style={cardStyle}
        >
          <span style={labelStyle}>{kpi.label}</span>
          <span style={valueStyle}>{kpi.value}</span>
          {kpi.hint && <span style={hintStyle}>{kpi.hint}</span>}
        </article>
      ))}
    </section>
  );
}

const stripStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: '8px',
  padding: '0 var(--app-padding-x)',
};

const cardStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  padding: '12px var(--card-padding)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--table-head-size)',
  letterSpacing: 'var(--table-head-tracking)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};

const valueStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--kpi-value-size)',
  fontWeight: 600,
  color: 'var(--ink-1)',
};

const hintStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--ink-4)',
};
