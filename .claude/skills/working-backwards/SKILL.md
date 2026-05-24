---
name: working-backwards
description: Run the Working Backwards 6-step prompt chain to turn a vague brief into a spec an agent can build from. Use when the user invokes /spec, says "working backwards", "write a spec", "do a working-backwards doc", or provides PRODUCT / FEATURE / BROKE_OR_COULD_BREAK inputs. Produces four artifacts in app/: spec.html, CLAUDE.md, tight-thesis.json, evals.md. Enforces 5 halt conditions between steps.
---

# Working Backwards

Vague brief → spec an agent can build from. 6 sequential LLM steps, 5 programmatic halt conditions, 4 output files.

The canonical chain definition is the blueprint at [`modules/s1-working-backwards/working-backwards-blueprint.md`](../../../modules/s1-working-backwards/working-backwards-blueprint.md). Read it before running — do not run from memory. The stage map is at [`modules/s1-working-backwards/s1-working-backwards.md`](../../../modules/s1-working-backwards/s1-working-backwards.md).

---

## Inputs

Ask the student for three one-sentence inputs. Do not invent them. If any are missing or vague, prompt for them before starting the chain.

- **PRODUCT** — one sentence.
- **FEATURE** — one sentence.
- **BROKE_OR_COULD_BREAK** — one sentence on what broke (or what would break the trust contract if it did).

---

## The chain

Run the steps in order. Do not push past a halt — surface the failed condition and the offending row(s) to the user and stop.

**Step 1 — Customer promise + negative contract.**
One paragraph of customer promise. One paragraph of negative contract (what we will never do, even if asked).

**Step 2 — FAQ → 12 assertion rows.**
6 HAPPY · 4 EDGE · 2 RED-team. Cover all seven areas: customer identity · problem · solution fit · behavior change · competitive advantage · TAM/ROI · key constraints. Each row gets an ID: HAPPY-1…HAPPY-6, EDGE-1…EDGE-4, RED-1, RED-2.

**Condition 1 — HALT IF** any answer isn't in "always / never / must" form. Soft language ("usually", "tends to", "we try to", "should") fails this halt.

**Step 3 — Behaviour Contract.** Three columns: Always · Ask First · Never.

**Condition 2 — HALT IF** any rule doesn't reference a specific FAQ row by ID (HAPPY-N / EDGE-N / RED-N). A rule with no source row fails.

**Step 4 — Substrate.** Enumerate cross-cutting infrastructure choices, one row per category. Each row: `id` (SUB-N) · `category` · `status` (decided | open) · `choice` (or TBD) · `reason` (one sentence) · `owner` · `eta` (required when open, blank when decided).

Required categories (all six must appear):

| Category | Why it must be named |
|---|---|
| data sources       | every cell / row / event carries a provenance URL; the provider list is the thing being trusted. |
| persistence        | a swap from "in-memory only" to "Postgres" is invisible in the FAQ but reshapes the eval surface. |
| frontend / design system | Tailwind vs MUI vs vanilla is not a feature; it's the substrate every screen rides. |
| hosting / runtime  | local-only vs Vercel vs Lambda changes what the kill criteria can even measure. |
| auth               | "no auth" is a decision, not an oversight — name it. |
| observability      | the trace file, an APM, or "none" — pick one explicitly. |

Optional categories when the build uses them: payments · search · queue · ML/AI providers · jobs · secrets management.

**Condition 3 — HALT IF** any required substrate category is missing OR any `decided` row lacks a `reason` OR any `open` row lacks `owner` + `eta`.

**Step 5 — Assemble `spec.html` + `tight-thesis.json`** from Steps 1–4. `spec.html` is under 120 lines, 9 sections, in this order:

1. Problem & Opportunity
2. Customer Experience Contract
3. FAQ → assertion rows (the 12 rows from Step 2, with IDs)
4. Non-Goals & Scope Boundaries
5. Behaviour Contract (from Step 3)
6. Constraints, Dependencies & Risks
7. Open Questions (≥3 rows, each with an owner and an ETA date) — must include every §9 `open` substrate row mirrored here
8. Implementation Notes
9. Substrate (from Step 4) — all required categories present, each row carries id · category · status · choice · reason · owner · eta

Render `spec.html` via the `frontend-design` skill. Pass the nine sections as structured content and let that skill own typography, layout, and visual hierarchy. Do not hand-roll HTML.

`tight-thesis.json` — exactly these 9 keys:
- `customer_promise` — verbatim from Step 1
- `negative_contract` — verbatim from Step 1
- `customer` — one sentence, who they are
- `problem` — one sentence, what hurts
- `solution_fit` — one sentence, why this solves it
- `behavior_change` — one sentence, what they do differently after
- `advantage` — one sentence, what competitors can't copy
- `tam_roi` — one sentence, size of the prize
- `constraints` — one sentence, the binding limits

**Condition 4 — HALT IF** Open Questions has fewer than 3 rows OR any ETA is blank.

**Step 6 — Generate `CLAUDE.md` from the spec.**
Under 50 lines, ≤2K tokens. Narrative prose, not a checklist. CLAUDE.md is persistent META about *how we build* — durable rules, workflow, artifact locations. It does NOT mirror product content from the spec.

Five sections, in this order:

1. **Spec-engineering preamble** — "This project follows spec engineering. `spec.html` is the canonical product input; `contract.html` is the wiring diagram; `feature-list.json` is the buildable units; `eval-criteria.html` is the eval bar."
2. **Durable Tenets** — rules that survive multiple sessions and model swaps (seeded by S1; augmented by S5/S6 later). Examples: *one change per Surgical Fix*; *substrate substitution kills the build*; *eval criteria come from spec, not contract*; *the Coder never imports a non-approved substrate*; *CLAUDE.md never carries product content*.
3. **Workflow Map** — S1 spec → S2 contract → S3 build → S4 eval → S5 debug → S6 strip. Each session reads from upstream artifacts only.
4. **Artifact Map** — one row per artifact (`spec.html` · `contract.html` · `feature-list.json` · `app-spec.json` · `eval-criteria.html` · `eval-results.html` · `debug-log.html` · `claude-progress.txt`). Each row names path + what lives there + which session writes it.
5. **Cross-session rules** — short list. Examples: Coder never invents a substrate; Eval never reads from contract; CLAUDE.md never carries product content; per-feature traceability via feature-list.

Every section must survive a model swap. Every file created during the build must be categorised under `app/`.

**Condition 5 — HALT IF** any TBD / TODO / [fill in] / placeholder remains anywhere except §9 Substrate `open` rows (which legitimately carry TBD until they close).

---

## evals.md

After Condition 5 passes, harvest the 12 FAQ rows from spec §3 one-to-one into `evals.md`. Each row: **Case ID · scenario · expected output · assertion · FAQ source row**.

Distribution: 6 happy path · 4 edge · 2 red-team — same IDs as spec §3.

---

## Cross-file linkage

- spec §3 rows → `evals.md` rows (one-to-one, same IDs).
- spec §5 (Behaviour Contract) → S2 contract.html Decomposition: each Always rule becomes a buildable unit (downstream, not this skill).
- spec §9 (Substrate) → S2 contract.html Substrate: copied verbatim downstream (substrate enforcement lives in S3 Coder hard-stop + S4 eval check).
- spec §9 `open` rows → spec §7 Open Questions: every open substrate is mirrored as an Open Question with the same owner + eta.
- spec §1–§2 → `tight-thesis.json` — `customer_promise` and `negative_contract` are verbatim; the other 7 keys are distilled one per FAQ coverage area.
- `CLAUDE.md` is META — it does NOT mirror spec content.

---

## Outputs

All four land in `app/`. Filenames verbatim:

- `app/spec.html`
- `app/CLAUDE.md`
- `app/tight-thesis.json`
- `app/evals.md`

---

## Close-out

After Condition 5 passes and all four files are written, append one RATIONALE line per file to `app/claude-progress.txt`:

```
<ISO timestamp>  S1  spec.html landed         RATIONALE: <one sentence>
<ISO timestamp>  S1  CLAUDE.md landed         RATIONALE: <one sentence>
<ISO timestamp>  S1  tight-thesis.json landed RATIONALE: <one sentence>
<ISO timestamp>  S1  evals.md landed          RATIONALE: <one sentence>
```

Append, never overwrite. CLAUDE.md is itself an output of the chain — no separate update step.

---

## Halt behavior

On any halt: stop, name the failed condition (1–5), quote the offending row(s), and wait for the user. Do not paper over a halt by softening the spec — the halt is the point.

---

## Out of scope

- The ambiguity audit is a separate one-shot prompt that runs *after* the chain halts cleanly, against [`modules/s1-working-backwards/ambiguity-audit-blueprint.md`](../../../modules/s1-working-backwards/ambiguity-audit-blueprint.md). Do not run it inside this skill.
- Downstream stages (S2 contract, S3 build, S4 eval, S5 debug, S6 strip) are not this skill's job.
