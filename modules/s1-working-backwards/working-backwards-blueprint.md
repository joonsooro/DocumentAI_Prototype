# Working Backwards: artifact blueprint

Pattern: **prompt chaining with 5 programmatic conditions** — 6 sequential LLM calls separated by halt-conditions on intermediate output.

**Inputs (one sentence each):**
- PRODUCT
- FEATURE
- BROKE_OR_COULD_BREAK

| Step   | Action | Halt condition |
|--------|--------|----------------|
| Step 1 | Customer promise + negative contract. | — |
| Step 2 | FAQ → 12 assertion rows (6 HAPPY · 4 EDGE · 2 RED-team). Cover: customer identity · problem · solution fit · behavior change · competitive advantage · TAM/ROI · key constraints. | **Condition 1:** HALT IF any answer isn't "always/never/must" form. |
| Step 3 | Behaviour Contract (Always / Ask First / Never). | **Condition 2:** HALT IF any rule doesn't reference a specific FAQ row (HAPPY-N / EDGE-N / RED-N). |
| Step 4 | Substrate — enumerate cross-cutting infrastructure choices, one row per category.<br>**Required categories:** data sources · persistence · frontend / design system · hosting / runtime · auth · observability.<br>**Optional categories:** payments · search · queue · ML/AI providers · jobs · secrets management.<br>Each row: `id` (SUB-N) · `category` · `status` (decided \| open) · `choice` (or TBD) · `reason` · `owner` · `eta` (blank if decided). | **Condition 3:** HALT IF any required substrate category is missing OR any `decided` row lacks a `reason` OR any `open` row lacks `owner` + `eta`. |
| Step 5 | `spec.html` + `tight-thesis.json` assembled from steps 1–4, <120 lines. | **Condition 4:** HALT IF any Open Questions <3 rows OR any blank ETA. |
| Step 6 | `CLAUDE.md` generated from spec, <50 lines. | **Condition 5:** HALT IF any TBD / TODO / [fill in] (outside §9 Substrate's `open` rows, which legitimately carry TBD until they close). |

**Outputs:** `app/spec.html` · `app/CLAUDE.md` · `app/tight-thesis.json` · `app/evals.md`

Render `spec.html` via the `frontend-design` skill — pass the eight sections as structured content; let the skill own typography, layout, and visual hierarchy. Don't hand-roll the HTML.

---

## spec.html — <120 lines

| §  | Section | Note |
|----|---------|------|
| §1 | Problem & Opportunity | — |
| §2 | Customer Experience Contract | — |
| §3 | FAQ → assertion rows | not in standard PRDs |
| §4 | Non-Goals & Scope Boundaries | — |
| §5 | Behaviour Contract | not in standard PRDs |
| §6 | Constraints, Dependencies & Risks | — |
| §7 | Open Questions | — |
| §8 | Implementation Notes | — |
| §9 | Substrate | not in standard PRDs — cross-cutting infrastructure decisions, locked or owned |

### §9 Substrate — what gets pinned

Every build sits on substrate the spec must name explicitly, the same way it names factors or screens. Without it the Coder will pick silently in S3 — that is the substitution failure mode the negative contract is supposed to prevent.

Required rows (one per category):

| Category | Why it must be named |
|---|---|
| data sources       | every cell / row / event carries a provenance URL; the provider list is the thing being trusted. |
| persistence        | a swap from "in-memory only" to "Postgres" is invisible in the FAQ but reshapes the eval surface. |
| frontend / design system | Tailwind vs MUI vs vanilla is not a feature; it's the substrate every screen rides. |
| hosting / runtime  | local-only vs Vercel vs Lambda changes what the kill criteria can even measure. |
| auth               | "no auth" is a decision, not an oversight — name it. |
| observability      | the trace file, an APM, or "none" — pick one explicitly. |

Optional rows when the build uses them: payments · search · queue · ML/AI providers · jobs · secrets management.

Each row: `id` (SUB-N) · `category` · `status` (decided | open) · `choice` (or TBD) · `reason` (one sentence) · `owner` · `eta` (required when open, blank when decided). `open` rows mirror to §7 Open Questions; `decided` rows are copied verbatim into the contract's Substrate section in S2.

---

## CLAUDE.md — 5 sections, ≤2K tokens

CLAUDE.md is **persistent META about HOW we build** — the file Claude reads first every session to know *this is a spec-engineering project, here are the durable rules, here's the workflow, here's where every artifact lives*. Do not duplicate them here. Durinng every session, scan for rotting context and keep under token limit. Every file created during the build my be approiately categorised under /app.

Every section must survive a model swap. Write it as narrative, not a checklist.

| §  | Section | Content |
|----|---------|---------|
| §1 | Spec-engineering preamble | "This project follows spec engineering. `spec.html` is the canonical product input; `contract.html` is the wiring diagram; `feature-list.json` is the buildable units; `eval-criteria.html` is the eval bar." |
| §2 | Durable Tenets | Rules that survive multiple sessions and model swaps. Seeded by S1; augmented by S5 (surviving tenets) and S6 (post-strip tenets). Examples: *one change per Surgical Fix*; *substrate substitution kills the build*; *eval criteria come from spec, not contract*; *the Coder never imports a non-approved substrate*; *CLAUDE.md never carries product content*. |
| §3 | Workflow Map | S1 spec → S2 contract → S3 build → S4 eval → S5 debug → S6 strip. Each session reads from upstream artifacts only. |
| §4 | Artifact Map | One row per artifact (`spec.html` · `contract.html` · `feature-list.json` · `app-spec.json` · `eval-criteria.html` · `eval-results.html` · `debug-log.html` · `claude-progress.txt`). Each row names path + what lives there + which session writes it. |
| §5 | Cross-session rules | Short list. Examples: Coder never invents a substrate; Eval never reads from contract; CLAUDE.md never carries product content; per-feature traceability via feature-list. |

---

## tight-thesis.json — distilled thesis

| Field | Content |
|-------|---------|
| `customer_promise` | verbatim from Step 1 |
| `negative_contract` | verbatim from Step 1 |
| `customer` | one sentence — who they are |
| `problem` | one sentence — what hurts |
| `solution_fit` | one sentence — why this solves it |
| `behavior_change` | one sentence — what they do differently after |
| `advantage` | one sentence — what competitors can't copy |
| `tam_roi` | one sentence — size of the prize |
| `constraints` | one sentence — the binding limits |

---

## evals.md — 12 cases minimum

6 happy path · 4 edge cases · 2 red-team

Each row: Case ID · scenario · expected output · assertion · FAQ source row

---

## How the files connect

spec §3 rows → evals.md: harvested one-to-one after the chain runs
spec §1–§2 → tight-thesis.json: customer_promise + negative_contract pulled verbatim; remaining keys distilled one-per-FAQ-coverage-area
spec §5 → contract.html Decomposition: Always rules become buildable units (one row per Always rule)
spec §9 → contract.html Substrate: copied verbatim (no auto-derivation; substrate enforcement lives in S3 Coder hard-stop + S4 eval check)
spec §9 `open` rows → spec §7 Open Questions: each open substrate mirrors as an Open Question with the same owner + eta
CLAUDE.md does NOT mirror spec content. CLAUDE.md is META — durable tenets, workflow map, artifact map, cross-session rules.

---

## Final step — close out

After Condition 4 passes and all four files are written, append the first RATIONALE entries to `app/claude-progress.txt` — one line per output file landed:

```
<ISO timestamp>  S1  spec.html landed         RATIONALE: <one sentence>
<ISO timestamp>  S1  CLAUDE.md landed         RATIONALE: <one sentence>
<ISO timestamp>  S1  tight-thesis.json landed RATIONALE: <one sentence>
<ISO timestamp>  S1  evals.md landed          RATIONALE: <one sentence>
```

CLAUDE.md is itself an output of the chain — no separate update step needed.
