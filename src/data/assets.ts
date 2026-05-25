/**
 * Static-asset registry — F-02 (contract pointer U2).
 *
 * The canonical runtime path for the DAEJOO anchor PDF. Vite serves
 * app/assets/* from the site root (publicDir=app in vite.config.ts),
 * so the URL is /assets/daejoo-invoice.pdf at runtime.
 *
 * Per spec N8 / contract A9 / F-14: source code MUST NEVER reference
 * the original ~/Downloads path. Use DAEJOO_PDF_URL below.
 *
 * Also: imports `DocumentRun` from @domain so that types.ts is consumed
 * by at least one other module — this closes F-01's acceptance clause (b)
 * ("each type imported by ≥1 other module") naturally, without inventing
 * a stub barrel. F-03 (deterministic mock extractor) will use this asset
 * registry as its document source.
 */

import type { DocumentRun } from '@domain/types';

/** Canonical Vite-served URL for the DAEJOO anchor PDF (F-14). */
export const DAEJOO_PDF_URL = '/assets/daejoo-invoice.pdf' as const;

/** Provenance metadata for the DAEJOO anchor PDF — pinned by app/assets/README.md. */
export interface AssetProvenance {
  readonly url: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly sourceFilename: string;
  readonly capturedAt: string; // ISO date
}

export const DAEJOO_ASSET: AssetProvenance = {
  url: DAEJOO_PDF_URL,
  sha256: 'fc719ecf1e3b8220c8638d87347ffb79945f45d38611a09f2f85c8d849fa29ae',
  sizeBytes: 1_263_264,
  sourceFilename: '03_6002108560-000.Receiving Invoice-INVOICE_DAEJOO PO 6282.pdf',
  capturedAt: '2026-05-25',
} as const;

/**
 * Helper that lets a DocumentRun be tagged with the canonical asset path
 * (consumed by F-03 mock extractor and F-12 internal log surface). The
 * type-import above is what closes F-01 acceptance clause (b).
 */
export function isDaejooDocument(doc: Pick<DocumentRun, 'documentPath'>): boolean {
  return doc.documentPath === DAEJOO_PDF_URL;
}
