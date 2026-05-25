# CLAUDE.md — Document AI Self-Improvement Flywheel

## 1. Spec-engineering preamble
This project follows spec engineering. `app/spec.html` is the canonical product input; `app/contract.html` will be the wiring diagram; `app/feature-list.json` will be the buildable units; `app/eval-criteria.html` will be the eval bar. Read upstream artifacts before writing downstream ones; never paraphrase a spec section into a contract or a contract into code. This file is META — durable rules about *how we build*, not product content.

## 2. Durable Tenets
One change per Surgical Fix; never bundle a refactor with a feature edit. Substrate substitution kills the build — the Coder never imports a non-approved substrate (see spec §9, currently SAP AI Core for every agent step and deterministic mocks for OCR + raw extraction only). Eval criteria come from `spec.html`, never from `contract.html`. Capability gaps are never surfaced to the customer as "unsupported" — they route to `ClarificationRequest` and to the hidden `ProductSignal` flywheel. Threshold management is a visible admin tool, never a recommended demo action. Agent failures surface as `ClarificationRequest` + `QualityMetric`, never as canned fallbacks. CLAUDE.md never carries product content; if a tenet starts citing FAQ rows, it belongs in `spec.html` or `contract.html`. Negative-contract guards are enforced STRUCTURALLY through view-model types — each UI surface consumes a view-model whose type shape excludes the forbidden fields (or only exposes them in the legitimate-containment workspace), so the screen literally cannot render content the type system does not give it; runtime regex post-filters are belt-and-braces, never the primary enforcement.

## 3. Workflow Map
S1 spec → S2 contract → S3 build → S4 eval → S5 debug → S6 strip. Each session reads from upstream artifacts only. S1 produces `spec.html`, `tight-thesis.json`, `evals.md`, and this file. S2 produces `contract.html` and `feature-list.json` by reading `spec.html`. S3 produces `app-spec.json` and the React + Vite + UI5 prototype by reading `contract.html` + `feature-list.json`. S4 produces `eval-results.html` by running Vitest against the binary cases in `evals.md` and `src/evals/`. S5 produces `debug-log.html`. S6 strips dead tenets and unused code. Every session appends a RATIONALE line per artifact to `claude-progress.txt`.

## 4. Artifact Map
| Artifact | Path | Contents | Writer |
|---|---|---|---|
| spec.html | `app/spec.html` | 9-section product spec, single source of truth | S1 |
| tight-thesis.json | `app/tight-thesis.json` | 9-key distilled thesis | S1 |
| evals.md | `app/evals.md` | 12 binary eval cases (1:1 with FAQ rows) | S1 |
| CLAUDE.md | `app/CLAUDE.md` | this file — META only | S1 (rev. by S5/S6) |
| contract.html | `app/contract.html` | wiring diagram: decomposition + substrate | S2 |
| feature-list.json | `app/feature-list.json` | buildable units, one per Always rule | S2 |
| app-spec.json | `app/app-spec.json` | concrete build manifest | S3 |
| eval-criteria.html | `app/eval-criteria.html` | binding eval bar | S2 |
| eval-results.html | `app/eval-results.html` | binary pass/fail report | S4 |
| debug-log.html | `app/debug-log.html` | Surgical Fix log | S5 |
| claude-progress.txt | `app/claude-progress.txt` | append-only RATIONALE trace | every session |

Every build artifact lives under `app/`. The DAEJOO PDF lives at `app/assets/daejoo-invoice.pdf`; the `~/Downloads` source is provenance only and is never read at runtime.

## 5. Cross-session rules
The Coder never invents a substrate — spec §9 is the closed list. The Eval session never reads from `contract.html` — eval bar comes from `spec.html` via `eval-criteria.html`. CLAUDE.md never carries product content (no FAQ rows, no behaviour rules with FAQ citations, no thesis text). Per-feature traceability runs through `feature-list.json` — every commit cites a feature id, every feature cites an Always rule, every Always rule cites a FAQ row. During every session, scan this file for rotting context and keep it under the token limit; if a tenet no longer fires, S6 strips it.
