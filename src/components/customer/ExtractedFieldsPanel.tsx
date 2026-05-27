/**
 * SF-2 — ExtractedFieldsPanel.
 *
 * Surfaces the deterministic mock extraction (F-03) in the Customer
 * Workspace left pane, directly below the F-22 PdfViewerPanel. Reads
 * a DocumentRun captured from the F-23 UploadZonePanel's onDocumentRun
 * callback in the customer route; renders an empty-state until that
 * callback has fired (parallels the SF-1 viewer gating).
 *
 * N6 / N1 posture:
 *   - No new extraction library is imported. The DocumentRun is the
 *     EXISTING F-03 output, populated from the in-memory DAEJOO
 *     fixture (src/data/daejoo-extraction.fixture.json).
 *   - Below-threshold values arrive as `value: null` per F-03's
 *     confidence-gate (see simulateDocumentRun.projectField). The
 *     panel renders these as a muted "—" with a tooltip explaining
 *     the null without ever emitting the forbidden literal
 *     'Unsupported' under src/components/customer/** (N1 ESLint rule).
 *
 * Structural negative-contract posture:
 *   - Prop is narrow: `{ run: DocumentRun | null }`. ExtractedField
 *     does NOT carry ProductSignal, QualityMetric, or remark_freetext;
 *     by construction the customer view-model guard holds — the panel
 *     cannot render anything the type does not give it.
 *
 * Style parity with CompiledConfigPanel.tsx: same panel/heading/table
 * primitives + same inline-style conventions so the left + right panes
 * read as one visual system.
 */
import type { CSSProperties } from 'react';
import type { DocumentRun, ExtractedField } from '@domain/types';

interface Props {
  readonly run: DocumentRun | null;
}

const EVIDENCE_TRUNCATE_AT = 80;
// Tooltip text for the null-value cell. Phrased to explain the gate
// without leaking the forbidden customer-surface literal (N1).
const NULL_VALUE_TOOLTIP = 'Below confidence threshold';

function formatValue(value: ExtractedField['value']): string {
  if (value === null) return '—';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function truncateEvidence(evidence: string | null): string {
  if (!evidence) return '—';
  if (evidence.length <= EVIDENCE_TRUNCATE_AT) return evidence;
  return `${evidence.slice(0, EVIDENCE_TRUNCATE_AT)}…`;
}

export function ExtractedFieldsPanel({ run }: Props) {
  if (!run) {
    return (
      <section
        data-testid="customer-extracted-fields-panel-empty"
        style={panelStyle}
      >
        <h2 style={headingStyle}>Extracted fields</h2>
        <p style={emptyHeadlineStyle}>No fields extracted yet</p>
        <p style={emptySubStyle}>
          Upload a document to see extracted values here.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="customer-extracted-fields-panel" style={panelStyle}>
      <h2 style={headingStyle}>Extracted fields</h2>
      <div style={metaRowStyle}>
        <span><strong>Source:</strong> {run.source}</span>
        <span><strong>Fields:</strong> {run.extractedFields.length}</span>
      </div>
      <table data-testid="customer-extracted-fields-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Field</th>
            <th style={thStyle}>Value</th>
            <th style={thStyle}>Confidence</th>
            <th style={thStyle}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {run.extractedFields.map((f) => {
            const isNull = f.value === null;
            return (
              <tr
                key={f.name}
                data-testid={`customer-extracted-row-${f.name}`}
              >
                <td style={tdStyle}>{f.name}</td>
                <td
                  style={isNull ? tdNullStyle : tdStyle}
                  title={isNull ? NULL_VALUE_TOOLTIP : undefined}
                >
                  {formatValue(f.value)}
                </td>
                <td style={tdStyle}>{formatConfidence(f.confidence)}</td>
                <td style={tdStyle} title={f.evidence ?? undefined}>
                  {truncateEvidence(f.evidence)}
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
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  padding: '20px 24px',
  marginBottom: 16,
};
const headingStyle: CSSProperties = {
  fontSize: 18, fontWeight: 500, margin: '0 0 12px', color: '#32363a',
};
const emptyHeadlineStyle: CSSProperties = {
  margin: '0 0 4px', color: '#32363a', fontSize: 14, fontWeight: 500,
};
const emptySubStyle: CSSProperties = {
  margin: 0, color: '#6a6d70', fontSize: 13,
};
const metaRowStyle: CSSProperties = {
  display: 'flex', gap: 24, fontSize: 13, color: '#32363a', marginBottom: 12,
};
const tableStyle: CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
};
const thStyle: CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ccc', fontWeight: 600, color: '#32363a',
};
const tdStyle: CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid #eee', color: '#32363a', verticalAlign: 'top',
};
const tdNullStyle: CSSProperties = {
  ...tdStyle, color: '#a0a3a6', fontStyle: 'italic',
};
