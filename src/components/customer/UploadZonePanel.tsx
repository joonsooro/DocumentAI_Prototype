/**
 * F-23 — UploadZonePanel.
 *
 * Honest UI, not honest behaviour (D2). The drop zone accepts any file
 * but only ever processes the canned DAEJOO fixture (per D2 + SUB-1 +
 * N6). v1 picks D2 option A: on drop or file-input change, the panel
 * announces the literal "Processing DAEJOO sample invoice" and invokes
 * F-03's simulateDocumentRun(DAEJOO_PDF_URL, configuration) unchanged —
 * no file content is ever read, no OCR / extraction library is
 * imported, no new dependency is added.
 *
 * The configuration prop is forwarded to F-03; when null (no compile
 * has happened yet) the drop still surfaces the announcement so the
 * customer sees the UI fire, but F-03 is not invoked because there is
 * no configuration to run against. F-11 wires the configuration in via
 * its view-model state.
 */
import { CSSProperties, DragEvent, useId, useState } from 'react';
import type { CompiledConfiguration, DocumentRun } from '@domain/types';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import { DAEJOO_PDF_URL } from '@data/assets';

const DROP_ANNOUNCEMENT = 'Processing DAEJOO sample invoice';

export type UploadZonePanelProps = {
  configuration?: CompiledConfiguration | null;
  onDocumentRun?: (run: DocumentRun) => void;
};

export function UploadZonePanel(props: UploadZonePanelProps) {
  const { configuration, onDocumentRun } = props;
  const inputId = useId();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleAccepted = () => {
    setAnnouncement(DROP_ANNOUNCEMENT);
    setDragging(false);
    if (configuration) {
      const run = simulateDocumentRun(DAEJOO_PDF_URL, configuration);
      onDocumentRun?.(run);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleAccepted();
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragging) setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  return (
    <section
      data-testid="customer-upload-zone"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        ...zoneStyle,
        ...(dragging ? zoneDraggingStyle : {}),
      }}
    >
      <div style={zoneInnerStyle}>
        <span data-testid="customer-upload-zone-glyph" style={glyphStyle}>
          ⤓
        </span>
        <p style={zoneHeadlineStyle}>Drop a document here</p>
        <p style={zoneSubStyle}>
          <label htmlFor={inputId} style={browseLinkStyle}>
            or browse files
          </label>
        </p>
        <input
          id={inputId}
          data-testid="customer-upload-zone-input"
          type="file"
          style={hiddenInputStyle}
          onChange={() => handleAccepted()}
        />
        {announcement && (
          <p
            data-testid="customer-upload-zone-announcement"
            role="status"
            aria-live="polite"
            style={announcementStyle}
          >
            {announcement}
          </p>
        )}
      </div>
    </section>
  );
}

const zoneStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px dashed var(--line)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--panel-2)',
  padding: '32px var(--card-padding)',
  textAlign: 'center',
  transition: 'border-color 120ms ease, background 120ms ease',
};

const zoneDraggingStyle: CSSProperties = {
  borderColor: 'var(--brand)',
  background: 'var(--brand-50)',
};

const zoneInnerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
};

const glyphStyle: CSSProperties = {
  fontSize: '28px',
  color: 'var(--ink-3)',
};

const zoneHeadlineStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: '14px',
  fontWeight: 500,
};

const zoneSubStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-3)',
  fontSize: '12px',
};

const browseLinkStyle: CSSProperties = {
  color: 'var(--brand)',
  cursor: 'pointer',
  textDecoration: 'underline',
};

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  border: 0,
};

const announcementStyle: CSSProperties = {
  margin: '6px 0 0',
  padding: '4px 12px',
  background: 'var(--brand-50)',
  color: 'var(--brand-700)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  borderRadius: 'var(--radius-tag)',
};
