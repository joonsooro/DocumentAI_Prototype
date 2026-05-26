/**
 * F-22 — PdfViewerPanel.
 *
 * Static viewer pointing at app/assets/daejoo-invoice.pdf via the
 * existing DAEJOO_PDF_URL constant from src/data/assets.ts. Renders a
 * toolbar with page-prev / page-next / zoom-in / zoom-out controls; the
 * handlers are intentional no-op stubs — functional zoom is not
 * required by F-22's acceptance and a working zoom would either need
 * pdf.js (a new dependency) or browser-native viewer behaviour we can't
 * rely on across the test harness.
 *
 * v1 ships the OPTIONAL 7-span evidence-highlight model as DEFERRED.
 * D1 specifies seven span keys: payable / total / no-comm /
 * payment-terms / po / hs-code / freetext. v2 will toggle a
 * data-active-span attribute on the viewer root when a clarification or
 * field name is hovered. The 'freetext' span is the load-bearing
 * RED-2 containment point — even when v2 ships, the freetext span's
 * product-signal interpretation never leaves /internal; the viewer only
 * highlights the location on the document.
 *
 * CustomerViewModel structural guard is preserved: this panel renders
 * static PDF content + toolbar; no signalType text, no raw prompt, no
 * disposal-phrase rendering outside the embedded PDF document itself.
 */
import { CSSProperties, useState } from 'react';
import { DAEJOO_PDF_URL } from '@data/assets';

export function PdfViewerPanel() {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  // Stub handlers — see header docs. These exist so the toolbar buttons
  // are functional click targets (clicks register, state updates) but
  // the embedded PDF itself does not scroll/zoom in v1. Functional
  // viewer behaviour ships in v2 alongside the D1 7-span model.
  const onPagePrev = () => setPage((p) => Math.max(1, p - 1));
  const onPageNext = () => setPage((p) => p + 1);
  const onZoomOut = () => setZoom((z) => Math.max(50, z - 10));
  const onZoomIn = () => setZoom((z) => Math.min(200, z + 10));

  return (
    <section data-testid="customer-pdf-viewer" style={viewerStyle}>
      <div data-testid="customer-pdf-viewer-toolbar" style={toolbarStyle}>
        <button
          type="button"
          data-testid="customer-pdf-viewer-page-prev"
          onClick={onPagePrev}
          style={toolbarBtn}
        >
          ‹ Prev
        </button>
        <span data-testid="customer-pdf-viewer-page-indicator" style={pageIndicator}>
          Page {page}
        </span>
        <button
          type="button"
          data-testid="customer-pdf-viewer-page-next"
          onClick={onPageNext}
          style={toolbarBtn}
        >
          Next ›
        </button>
        <span style={toolbarSpacer} />
        <button
          type="button"
          data-testid="customer-pdf-viewer-zoom-out"
          onClick={onZoomOut}
          style={toolbarBtn}
        >
          −
        </button>
        <span data-testid="customer-pdf-viewer-zoom-indicator" style={pageIndicator}>
          {zoom}%
        </span>
        <button
          type="button"
          data-testid="customer-pdf-viewer-zoom-in"
          onClick={onZoomIn}
          style={toolbarBtn}
        >
          +
        </button>
      </div>
      <embed
        data-testid="customer-pdf-viewer-embed"
        src={DAEJOO_PDF_URL}
        type="application/pdf"
        title="DAEJOO commercial invoice"
        style={embedStyle}
      />
    </section>
  );
}

const viewerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden',
  minHeight: '420px',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px var(--card-padding)',
  borderBottom: '1px solid var(--line-2)',
  background: 'var(--panel-2)',
  fontFamily: 'var(--font-sans)',
  fontSize: '12px',
};

const toolbarBtn: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--line)',
  background: 'var(--panel)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: '12px',
};

const toolbarSpacer: CSSProperties = { flex: 1 };

const pageIndicator: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  color: 'var(--ink-3)',
  padding: '0 4px',
};

const embedStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  minHeight: '380px',
  border: 'none',
};
