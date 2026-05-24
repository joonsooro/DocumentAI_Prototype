# Bar Raiser: artifact blueprint

Pattern: **evaluator-optimizer composed with parallelization (sectioning)** — 4 parallel sub-evaluators, aggregator, one-shot fix-and-re-evaluate loop.

```
Input
──────────────────────────────────────────────────────
ARTIFACT    path to any PM artifact
            spec.md · coe.md · brief.md · PRD
──────────────────────────────────────────────────────

Step 1  Read artifact · identify doc-type / persona
Step 2  Dispatch 4 evaluators IN PARALLEL (one call, four sub-agents)
            ├─ Customer evaluator   ✓/✗ + ≤2-line cite
            ├─ Data evaluator       ✓/✗ + ≤2-line cite
            ├─ Bet evaluator        ✓/✗ + ≤2-line cite
            └─ Owner evaluator      ✓/✗ + ≤2-line cite
Step 3  Aggregate · print initial CONDITION CHECK //
            all ✓  →  Verdict: press send · stop
            any ✗  →  continue
Step 4  Print BAR RAISER // bullets on failing conditions only
Step 5  Print FIXED // patches  (line ref → replacement text)
Step 6  Re-dispatch the 4 evaluators against the patched text
Step 7  Print POST-FIX CONDITION CHECK // + Verdict

Output
──────────────────────────────────────────────────────
CONDITION CHECK //  ·  BAR RAISER //  ·  FIXED //  ·  POST-FIX CONDITION CHECK //
──────────────────────────────────────────────────────
```

---

## Output — up to 4 blocks

```
EVALUATING AS   [persona] for [audience]

CONDITION CHECK //
✓/✗ Customer · ✓/✗ Data · ✓/✗ Bet · ✓/✗ Owner   (one line each)

BAR RAISER //   (omit entirely if all 4 pass)
5–7 surgical bullets · each names a specific line or section

FIXED //   (omit entirely if all 4 pass)
per failing condition: source line/section → replacement text

POST-FIX CONDITION CHECK //   (omit entirely if all 4 pass)
✓/✗ Customer · ✓/✗ Data · ✓/✗ Bet · ✓/✗ Owner

Verdict: press send / not ready
```

---

## The 4-condition approve check — one evaluator per condition

```
Each sub-evaluator owns ONE consideration. ALL four must be ✓ for press send:

1   Customer     named segment + named problem · behavior change expected is plausible
2   Data         specific number, metric, or volume signal · TAM/ROI named if this is a spec
3   Bet          which dimension better/cheaper/faster · what is NOT being built · trade-off stated
4   Owner        named role or person (not "the team") · key constraints (business/technical/legal) surfaced
```

---

## Voice anchors — what the BAR RAISER bullets sound like

```
Used deliberately, one or two per rip:

  "So what?"
  "Where's the customer feel that?"
  "Where's the data?"
  "What's the bet?"
  "Single-threaded owner?"
  "What changes Monday?"
  "Bullets aren't thought. Narrative."
```

---

## Anti-patterns — what gets flagged

```
  vague verbs              "explore," "consider," "address"
  bullets-as-thought       list where a conclusion should be
  missing customer         segment named but problem absent
  missing data             assertion without a number or volume signal
  missing single-threaded leader
  scope creep dressed as ambition
```

---

## Loop discipline

One fix-and-re-evaluate pass. If POST-FIX CONDITION CHECK still has any ✗, the agent prints `Verdict: not ready · PM revises and re-invokes` and stops.
