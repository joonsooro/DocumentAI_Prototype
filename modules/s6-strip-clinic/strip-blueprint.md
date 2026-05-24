# Strip: artifact blueprint

Pattern: **new-model launch fires a Model Recall → strip with traces, not hope.** Every harness of the affected type gets re-inspected when a new model lands.

Anthropic Managed Agents framing: *"Harnesses encode assumptions that go stale as models improve."* Canonical example: Sonnet 4.5 had *"context anxiety"* — wrapping tasks up prematurely as it sensed the context limit. Resets were added. Same harness on Opus 4.5 → behavior gone → resets became dead weight. Counter-discipline from Willison's March 2026 Claude Code postmortem: harness *"improvements"* caused real regressions. **Strip because you ran traces, not because a model shipped.**

---

## Model Recall

**Inputs:**

| Input     | Source                                                                     |
|-----------|----------------------------------------------------------------------------|
| NEW MODEL | name + launch date (real or fictional for the demo)                        |
| HARNESS   | the build to re-inspect — `app/` (the project root S3 produced; could be any language). |

**Recall notice structure:**

| §  | Section             | Content                                                                                       |
|----|---------------------|-----------------------------------------------------------------------------------------------|
| §1 | Header              | Recall ID · trigger model · launch date · effective date                                      |
| §2 | Inspection scope    | Which scaffolding categories to re-inspect: pre-baked data lookups · sentiment / signal integrations · cross-validation passes · UI scaffolding · prompt-engineering kludges |
| §3 | Inspection criteria | Per category: can the new model do this directly now? Yes → strip candidate · No → keep with traces-link · Partially → modify with traces-link |
| §4 | Decision column     | Per component: DECISION (strip / keep / modify) · TRACES LINK (required for keep + modify) · WHY (one line — the evidence) |

**Output:** `app/recall-notice.html` — render via the `frontend-design` skill (pass the §1–§4 sections + the per-component decision rows as structured content; let the skill own layout, the DECISION column treatment, and the trigger-model header).

---

## Strip discipline

**Stripping is destructive. The agent never strips on its own — every candidate goes through an explicit user review gate before it lands in `strip-page.html`.**

For each scaffolding component identified in the recall notice:

| Step | Action |
|------|--------|
| 1 | Look at the trace (`app/claude-progress.txt`) — does this scaffolding fire? When? |
| 2 | Look at the FAIL rows in `app/eval-results.html` — did this scaffolding catch the failure mode the eval surfaced? |
| 3 | Look at the debug log (`app/debug-log.html`) — did any Surgical Fix touch this scaffolding? |
| 4 | Run the build WITHOUT this scaffolding on the new model. Capture: eval delta (pass-rate before/after), trace fires before/after, debug-log touches. **Do not commit anything yet.** This step gathers evidence; it does not decide. |
| 5 | Render the candidates as `app/strip-plan.html` via the `frontend-design` skill — one card per candidate (component name · evidence from steps 1–4 · proposed verdict STRIP / KEEP / MODIFY · the WHY). This is the pre-review artifact the user reads. |
| 6 | **REVIEW GATE — HALT.** Open `strip-plan.html`. Walk the user through each candidate. The user confirms or overrides each proposed verdict. The agent never proceeds to Step 7 without an explicit user verdict on every card. |
| 7 | Render the user's confirmed verdicts into `app/strip-page.html` as cards via the `frontend-design` skill — pass each card's content (Title · WHY I CUT IT / WHY I KEPT IT · WHY SOMEONE WITH A DIFFERENT PRODUCT MIGHT KEEP IT · TRACES LINK) as structured data; let the skill own card layout and the strip/keep/modify treatment. Don't hand-roll the HTML. |

Time-box to 4 strips per session. Depth per card beats count.

---

## Final step — close out

After the user-confirmed strips are rendered in `strip-page.html`:

1. Append a RATIONALE entry to `app/claude-progress.txt` for each strip:
   `<ISO timestamp>  S6  <component> <strip|kept|modify>  RATIONALE: <one sentence — what the traces showed + user's call>`
2. Update `app/CLAUDE.md` §2 Durable Tenets — surface the tenets that survived stripping (and any tenets the stripping disproved). Only durable rules.

**Output:** `app/strip-plan.html` (pre-review candidates) + `app/strip-page.html` (post-review confirmed strips) + appended entries to `claude-progress.txt` + updated `CLAUDE.md` §2.
