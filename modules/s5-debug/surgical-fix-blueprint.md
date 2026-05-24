# Surgical Fix: artifact blueprint

Pattern: **name the layer → make ONE change → re-eval → verify → log.** One change, one re-eval, one verification, one token receipt. Anything else is poking.

Debug is the standout that separates spec engineering from vibe coding. Vibe-coders sweep plausible changes and hope. Spec engineers run the discipline and show the receipts.

Anthropic's framing: every component in a harness encodes an assumption about what the model can't do on its own. The layer you fix is the assumption you're correcting.

---

## Step 0 — Route at the start

The agent reads the input and picks one of two routes. Both routes run the same NAME → MAKE → RE-RUN → VERIFY → LOG discipline; only the entry point differs.

| Input | Route |
|---|---|
| `app/eval-results.html` has FAIL or N/A rows | **Eval-driven** — walk each row through the discipline |
| User provides an ad-hoc bug or change request (free-text) | **Manual** — locate the layer first, then run the discipline |

The agent already has the spec, contract, feature-list, app-spec, source, trace, eval-results, eval-criteria — no file map needed.

---

## Manual route — locate before fixing

Before NAMING the layer, the agent walks back from the user's description to the exact step in the build. 

| Step | Action |
|---|---|
| M1 | Read `app/claude-progress.txt` — find the trace entry whose RATIONALE matches the user's description |
| M2 | Read `app/feature-list.json` — identify which feature ID owns the behaviour |
| M3 | Read `git log` (or `app/feature-list.json` status fields) — locate the commit that landed the feature |
| M4 | Read the file/line in `app/` (wherever S3 wrote the source — depends on language). |
| M5 | Quote back to the user: *"You said `<user description>`. I'm fixing `<feature ID>` at `<file:line>`, landed in commit `<sha>`. Proposed change: `<one line>`."* |

The user confirms (or redirects) before the agent makes any change. Then the discipline runs.

---

## Discipline — both routes

For each work item (a FAIL/N/A row, or a confirmed manual fix):

| Step | Action |
|---|---|
| 1 | **NAME** the layer. Use the FAIL Gulf tag + contract pointer (eval-driven) or the M5 quote (manual). If the layer is ambiguous, invoke `/deep-dive` — the 5-Whys rubric will name it. |
| 2 | **MAKE** the change. One change, the smallest one that addresses the work item. Never two changes in one entry. If you can't write the entry as one before/change/after row, you didn't make one change. |
| 3 | **RE-RUN** the eval (S4's Independent Judge — see `../s4-evaluate/eval-blueprint.md`). Same criteria, new layer state, before/after verdict. |
| 4 | **VERIFY**. Failure gone → **closed**. Still there → **still open** (write a new fix entry; `/deep-dive` if the layer is unclear). New failure mode appeared → **regression** — roll back, re-think. |
| 5 | **LOG** to `debug-log.html`: before · change (verbatim diff) · after · eval delta · verdict · **tokens used · approx cost** (the receipt). |

---

## Token receipts — the spec-engineering proof

Every entry in `debug-log.html` carries the LLM token cost of the fix: input tokens · output tokens · model name · approximate cost in dollars. No receipts means no accountability — that's the vibe-coding failure mode. The Coder reports tokens; the fix log carries them. Show the receipt.

---

## Close out

After the work items are processed:

- Append one RATIONALE entry to `app/claude-progress.txt` per fix: `<ISO timestamp>  S5  <layer> fix landed  RATIONALE: <one sentence — before/after eval delta + verdict>`
- Update `app/CLAUDE.md` §2 Durable Tenets with any tenets that survived the fix (and any newly-disproved tenets the fix exposed). Only durable rules — fix details live in `debug-log.html`.

Render `app/debug-log.html` via the `frontend-design` skill — pass each fix entry as structured content (before · change · after · verdict · tokens · cost); let the skill own the closed/still-open/regression treatment.

**Output:** `app/debug-log.html` + appended entries to `claude-progress.txt` + updated `CLAUDE.md` §2.
