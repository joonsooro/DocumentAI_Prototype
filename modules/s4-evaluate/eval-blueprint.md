# Eval: artifact blueprint

Pattern: **define criteria from spec → independent judge applies them.** Two steps. Self-evaluation fails structurally — the same model biases toward favourable scoring of work it just produced. The fix is a separate inference call, not a better prompt.

Anthropic's framing: the Evaluator role tests functionality through actual interaction and grades against criteria. The workshop runs it as a cross-session split so the eval has no allegiance to the model that produced the output.

Failure taxonomy: the **Three Gulfs** — Comprehension (model misread the spec), Specification (spec was ambiguous), Generalization (right answer for this case, wrong reasoning for the next). Every FAIL gets tagged with one.

Research note: judge prompts with 3 critique examples land ~15–20% higher human/model agreement than a plain LLM-judge.

---

## Step 1 — Define criteria

**Input:** `app/spec.html` (Behaviour Contract + FAQ + Substrate + Constraints).

Walk the spec's Behaviour Contract and FAQ rows. For each, decide: can the model self-check this (numeric, list, regex)? Or does it need a human judge? Tag the judge-required rows with one of the Three Gulfs.

Pull the spec's substrate decisions in as self-checks — substitution counts as failure.

Pull eval-level kill rows from spec §6 Constraints — these must be numeric and time-bounded. Soft language is not a kill criterion — push back.

**Push-back via Open Questions.** When a criterion lives in the spec but can't be operationalized (ambiguous threshold, missing number, missing time window), do not invent a value. Record an Open Question in `eval-criteria.html` with an id (`OQ-E#`), the gap in one sentence, and a suggested resolution date. The corresponding verdict in `eval-results.html` is **N/A** with a pointer to the OQ — N/A means *"the spec hasn't authorised a verdict yet,"* not PASS and not FAIL. Until the OQ closes, that criterion stays undefined.

**Output:** `app/eval-criteria.html` — sections for self-check rows, judge-required rows, eval-level kill rows, and Open Questions (`OQ-E#`). The LLM designs the shape; the Judge reads it in Step 2.

---

## Step 2 — Independent Judge

**Inputs:**

| Input | Path / source |
|---|---|
| OUTPUT | The artifacts the running app produces. **Don't assume a language or entry point** — S3 could have built Python, Next.js, Rust, anything. Read `app/claude-progress.txt` for the build trace (it names the entry point + run command), scan `app/` for the source. If multiple plausible entry points exist, ask the user before choosing. |
| CRITERIA | `app/eval-criteria.html` (from Step 1) |

A fresh inference call plays the role of an independent reviewer with no allegiance to the model that produced the output. The judge applies each criterion from `eval-criteria.html` to each output item, returns a binary PASS / FAIL / N/A verdict per (criterion × item), and tags every FAIL with one of the Three Gulfs plus a one-sentence why.

The judge prompt carries 3 critique examples — one per Gulf — so the model knows what good critique looks like:

| Gulf | Example |
|---|---|
| Comprehension | "The model misread a clear spec constraint — asked for X, delivered Y." |
| Specification | "The model picked one plausible reading of an ambiguous spec phrase; the other reading would have been equally valid." |
| Generalization | "The output is right for this case, but the underlying logic won't hold on the next case." |

---

## Output — `app/eval-results.html`

Pass the verdict table as structured data; let the `frontend-design` skill own table styling, the PASS / FAIL / N/A color treatment, and the header callout.

| Criterion | Item | Verdict | Gulf (if FAIL) | Why |
|---|---|---|---|---|
| `<criterion-A>` | `<item-1>` | PASS | — | — |
| `<criterion-A>` | `<item-2>` | **FAIL** | Specification | `<one-sentence why>` |
| `<criterion-B>` | `<item-1>` | **N/A** | — | `OQ-E1: <gap statement>. Resolution suggested by <date>.` Until `OQ-E1` lands, verdict is undefined. |
| … | … | … | … | … |

If the spec defines any eval-level summary criteria (e.g., a portfolio-level threshold for a financial spec, a corpus-level metric for a content spec), the judge produces one summary row per such criterion using the same verdict legend. The blueprint does not name domain-specific summaries — the spec does.

**Verdict legend:** PASS · FAIL · N/A. Every FAIL row names a Gulf + Why. Every N/A row names the OQ id + the resolution path. N/A is not a failure — it's a flag that the spec hasn't authorised a verdict yet.

---

## Close out

After `eval-results.html` is written:

1. Append a RATIONALE entry to `app/claude-progress.txt`:
   `<ISO timestamp>  S4  eval-results.html landed  RATIONALE: <overall verdict + the one Gulf that dominated the FAILs>`
2. Failure modes live in `eval-results.html` — do not mirror them into `CLAUDE.md`. CLAUDE.md §2 Durable Tenets is updated **only** if the eval surfaces a tenet that survives a model swap. Most runs add nothing.
