# app/assets/

Static assets served by Vite from this directory (configured as `publicDir`
in `vite.config.ts`). At runtime, paths resolve relative to the site root:
`app/assets/daejoo-invoice.pdf` → `/assets/daejoo-invoice.pdf`.

Per spec **N8** / contract **A9** / feature **F-14**: source code MUST NEVER
reference the original `~/Downloads` path. The ESLint rule
`no-restricted-syntax` in `eslint.config.js` enforces this.

---

## daejoo-invoice.pdf

DAEJOO Receiving Invoice — PO 6282. Anchor document for the DAEJOO scenario
per spec §3 **EDGE-4** and contract §3 **SUB-1**. All v1 evals (12 cases in
`app/evals.md`) are pinned to the extraction surface of this exact PDF.

| Field            | Value                                                                |
|------------------|----------------------------------------------------------------------|
| Source filename  | `03_6002108560-000.Receiving Invoice-INVOICE_DAEJOO PO 6282.pdf`     |
| Source provenance | User-provided SAP-Ariba receiving-invoice export (May 2026)         |
| Format           | PDF 1.7                                                              |
| Size             | 1,263,264 bytes                                                      |
| SHA-256          | `fc719ecf1e3b8220c8638d87347ffb79945f45d38611a09f2f85c8d849fa29ae`   |
| Copied at        | 2026-05-25                                                           |
| Feature          | F-02 (contract pointer U2)                                           |

### Why the SHA is recorded

1. **Provenance check.** Anyone can verify the in-repo file is identical to
   what F-02 captured: `shasum -a 256 app/assets/daejoo-invoice.pdf` and
   compare to the value above.
2. **Eval determinism.** `src/data/daejoo-extraction.fixture.json` (landed
   by F-03) carries canned extraction values pinned to this exact PDF. If
   the PDF changes silently, the SHA mismatch is the early warning that
   the fixture is stale.
3. **N8 enforcement.** The canonical in-repo path is the only path source
   code may reference. The original `~/Downloads` path is provenance metadata
   here, not a runtime source.

### Re-verifying

```sh
shasum -a 256 app/assets/daejoo-invoice.pdf
# expected: fc719ecf1e3b8220c8638d87347ffb79945f45d38611a09f2f85c8d849fa29ae
```
