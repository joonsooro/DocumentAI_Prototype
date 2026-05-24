# Deep Dive: artifact blueprint

Pattern: **orchestrator-workers** — a conversational loop where each Why's shape emerges from the prior answer. Subtasks are not pre-defined; the orchestrator decides what to probe next based on what the PM just said.

```
Input
──────────────────────────────────────────────────────
User provides fuzzy incident paragraph   no structure required
──────────────────────────────────────────────────────

Loop
  Step 1   Restate incident in one sentence · ask Why 1 · stop
  [User's turn]  Step 2   User provides Why-N answer with cited evidence
  Step 3   Apply depth rubric · if shallow, refuse and re-ask the same Why one layer down
  Step 4   Paraphrase the user's last answer · ask Why N+1 naming the noun the answer introduced · stop
  Step 5   After Why 3 — counterfactual probe ("what evidence would make us reject this chain?") · stop
  Step 6   Continue until Why 5, or whenever a rubric criterion is satisfied

Rule: one question per turn. After asking Why N, stop and output nothing else.

Compile
  Step 7  Collect full transcript from Steps 1 to 6
  Step 8   Dispatch 5 workers in parallel · each receives full transcript · fills only assigned sections of the deep-dive report · writes [NEEDS_INPUT] for any gap · invents nothing
  Step 9  Compile final report


Output
──────────────────────────────────────────────────────
deep-dive-report.md  (or appended to claude-progress.txt as a trace entry)
──────────────────────────────────────────────────────
```

---

## Worker assignments — one sub-agent per slice of the report

```
W1   §2 Executive Summary + §3 Impact
W2   §4 Timeline
W3   §5 5 Whys narrative + named root cause + rubric criterion
W4   §6 Guardrails + §7 Corrective Actions
W5   §8 Open Questions + §9 Lessons Learned + §10 Appendix
```

Orchestrator writes §1 Header and assembles §1–§10. Each worker fills only its assigned sections from transcript evidence. `[NEEDS_INPUT — not covered in conversation]` for every gap.

---

## Depth rubric — an answer is deep enough only when it names ONE of

```
  missing guardrail or validation
  missing monitoring or alerting
  broken handoff between teams
  unclear ownership boundary
  process gap that predictably repeats
  missing test, review gate, or runbook
```

Terminal answers to refuse on sight: "we forgot," "human error," "they should have known," "communication gap" without a named mechanism.

---

## Usage in Workshop #2

This same orchestrator-workers 5-Whys pattern is invoked across two Workshop #2 sessions:

- **S3 Build (Black Box):** when the trace surfaces an incident worth investigating, invoke `/deep-dive` with the fuzzy incident. Output appends to the trace (`app/claude-progress.txt`) so the next session inherits the lesson.
- **S5 Debug (Surgical Fix):** when the layer to fix is ambiguous on a surviving FAIL, re-invoke `/deep-dive` — the rubric surfaces which layer (spec / contract / screen / substrate / prompt / data) actually owns the bug. Output appends to `claude-progress.txt` as a trace entry.

The technique and rubric are unchanged across sessions. Only the input (which incident) and where the output lands (which artifact) differ.
