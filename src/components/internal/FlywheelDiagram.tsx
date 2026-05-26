/**
 * F-13 — Flywheel diagram (handoff-derived 5-node structural detail).
 *
 * Renders exactly 5 nodes in the verbatim label order:
 *   1. Customer intent
 *   2. Corrections + workarounds
 *   3. Governance queue
 *   4. Product signals
 *   5. Roadmap evidence  (5th node carries CSS class containing 'accent')
 *
 * The handoff inventory is canonicalised here as a const array — the
 * F-13 acceptance test reads the rendered order to confirm.
 */
import { CSSProperties } from 'react';

const NODES = [
  { id: 'customer-intent', label: 'Customer intent' },
  { id: 'corrections-workarounds', label: 'Corrections + workarounds' },
  { id: 'governance-queue', label: 'Governance queue' },
  { id: 'product-signals', label: 'Product signals' },
  { id: 'roadmap-evidence', label: 'Roadmap evidence', accent: true },
] as const;

export function FlywheelDiagram() {
  return (
    <section data-testid="internal-flywheel-diagram" style={diagramStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Self-improvement flywheel</h2>
      </header>
      <ol style={listStyle}>
        {NODES.map((node, idx) => (
          <li
            key={node.id}
            data-testid={`internal-flywheel-node-${node.id}`}
            data-node-position={idx + 1}
            className={`flywheel-node${'accent' in node && node.accent ? ' flywheel-node--accent' : ''}`}
            style={{
              ...nodeStyle,
              ...('accent' in node && node.accent ? nodeAccentStyle : {}),
            }}
          >
            <span style={posBadgeStyle}>{idx + 1}</span>
            <span style={nodeLabelStyle}>{node.label}</span>
            {idx < NODES.length - 1 && <span style={connectorStyle}>→</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

const diagramStyle: CSSProperties = {
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
  flexWrap: 'wrap',
  gap: '6px',
  alignItems: 'center',
};

const nodeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: 'var(--radius-card)',
  background: 'var(--panel-2)',
  border: '1px solid var(--line-2)',
  color: 'var(--ink-1)',
  fontSize: 'var(--body-size)',
};

const nodeAccentStyle: CSSProperties = {
  background: 'var(--brand-50)',
  border: '1px solid var(--brand)',
  color: 'var(--brand-700)',
  fontWeight: 600,
};

const posBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  background: 'var(--ink-1)',
  color: '#FFFFFF',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
};

const nodeLabelStyle: CSSProperties = {
  whiteSpace: 'nowrap',
};

const connectorStyle: CSSProperties = {
  color: 'var(--ink-4)',
  fontFamily: 'var(--font-mono)',
};
