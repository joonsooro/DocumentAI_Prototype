/**
 * F-14 tests — DAEJOO asset binding (A9).
 *
 * Two acceptance assertions from app/feature-list.json F-14:
 *
 *   1. Static asset import resolves to a deterministic /assets/... URL
 *      (Vite serves app/assets/ via publicDir; the build never bundles or
 *      reads the PDF from ~/Downloads).
 *
 *   2. grep across src/ returns ZERO matches for '~/Downloads'.
 *
 *      The ESLint no-restricted-syntax rule in eslint.config.js enforces
 *      this at lint time; this test enforces it at runtime against the
 *      actual filesystem, so a future drift that bypasses lint (e.g. via
 *      a string that compiles past the AST selector) is still caught.
 *
 * Kill switch (30 min): if any '~/Downloads' reference lands in src/
 * during a 30-minute build window, halt. Enforced by THIS test running
 * on every npm test.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAEJOO_PDF_URL, DAEJOO_ASSET, isDaejooDocument } from '@data/assets';

// ---------------------------------------------------------------------------
// (1) Static asset binding resolves to the spec'd canonical URL
// ---------------------------------------------------------------------------

describe('F-14 DAEJOO asset binding — static import resolves', () => {
  it('DAEJOO_PDF_URL is the Vite-served canonical path', () => {
    // The contract pins this exact URL: /assets/daejoo-invoice.pdf
    // (publicDir=app in vite.config.ts strips the app/ prefix.)
    expect(DAEJOO_PDF_URL).toBe('/assets/daejoo-invoice.pdf');
  });

  it('DAEJOO_ASSET carries provenance pinned to the canonical URL', () => {
    expect(DAEJOO_ASSET.url).toBe(DAEJOO_PDF_URL);
    // SHA + size locked in by F-02.
    expect(DAEJOO_ASSET.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(DAEJOO_ASSET.sizeBytes).toBeGreaterThan(0);
    // Source filename is provenance only — it MAY reference the original
    // ~/Downloads path because it's metadata, not a runtime import. It
    // must not be read by any code path; only displayed.
    expect(DAEJOO_ASSET.sourceFilename).toContain('DAEJOO');
  });

  it('isDaejooDocument returns true for the canonical URL and false otherwise', () => {
    expect(isDaejooDocument({ documentPath: DAEJOO_PDF_URL })).toBe(true);
    expect(isDaejooDocument({ documentPath: '/assets/other.pdf' })).toBe(false);
    expect(isDaejooDocument({ documentPath: '~/Downloads/whatever.pdf' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (2) src/ tree contains zero '~/Downloads' references — runtime guard
// ---------------------------------------------------------------------------

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

interface FoundReference {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (s.isFile() && /\.(ts|tsx|js|jsx|json|md)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findReferences(needle: RegExp): FoundReference[] {
  const files = walk(SRC_ROOT);
  const hits: FoundReference[] = [];
  for (const f of files) {
    // Skip THIS test file — it intentionally mentions the forbidden token
    // in string-form for documentation and via the regex above.
    if (f.endsWith('assetBinding.test.ts')) continue;
    const text = readFileSync(f, 'utf8');
    if (!needle.test(text)) continue;
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (needle.test(line)) {
        hits.push({
          path: relative(SRC_ROOT, f),
          line: idx + 1,
          text: line.trim(),
        });
      }
    });
  }
  return hits;
}

describe('F-14 DAEJOO asset binding — N8 runtime invariant', () => {
  it('no file under src/ references "~/Downloads"', () => {
    const hits = findReferences(/~\/Downloads/);
    expect(hits, `forbidden ~/Downloads references found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  it('no file under src/ references "Downloads/aicore"', () => {
    const hits = findReferences(/Downloads\/aicore/);
    expect(hits, `forbidden Downloads/aicore references found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });
});
