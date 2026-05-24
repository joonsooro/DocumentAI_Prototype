# Workshop #2 — Session Flow

Run Claude Code from the kit root (`ws2-student-kit/`). Per session: paste **BUILD** so Claude reads the session blueprint and builds the matching skill/agent/command live, then paste **RUN** to run it on real material. All session outputs land in `app/` — one folder for everything the workshop produces. Blueprints and session docs stay in `modules/` (read-only reference).

**Conventions.** S1 has a **BUILD** step because it creates the `working-backwards` skill + `/spec` command; later sessions reuse those and need **RUN** only. S4 has an extra **OBSERVE** step that pushes verdicts to Langfuse. `bar-raiser-blueprint.md` and `deep-dive-blueprint.md` are invoked ad-hoc when a session escalates — not part of the main flow. `primary-sources.md` is background reading.

---

## S1 — Working Backwards

**BUILD** (creates the skill + `/spec` command, then stops):
```
Read @modules/s1-working-backwards/s1-working-backwards.md and @modules/s1-working-backwards/working-backwards-blueprint.md and build the working-backwards skill and the / spec slash command that invokes the skill
```

**RUN** (invokes the skill — it will ask you for PRODUCT / FEATURE / BROKE_OR_COULD_BREAK):
```
/spec
```

Build a stock shortlist tool. The user picks factors they care about (cheap vs earnings, pays a dividend, profitable, rising lately, low debt) and gets five US-listed stocks that score highest on exactly those factors, each with the underlying numbers, the source, and the date pulled.


Sample answers for the stock-picker demo:
- PRODUCT: A stock shortlist tool for a self-directed US retail investor.
- FEATURE: The user picks the factors they care about — cheap vs earnings, pays a dividend, profitable, rising lately, low debt — and gets five US-listed stocks that score highest on exactly those factors, each with the underlying numbers, the source, and the date pulled.
- BROKE_OR_COULD_BREAK: Picks built on stale numbers, claims without a source, or look-ahead bias. Or the tool quietly swapping in a factor I didn't pick when the universe gets thin.

**AUDIT** (one-shot prompt — not a skill, not a command):
```
Read @modules/s1-working-backwards/ambiguity-audit-blueprint.md and run the audit against app/spec.html. Write app/ambiguity-audit.html.
```

Close-out runs automatically as the blueprint's final step (appends to `claude-progress.txt`).

---

## S2 — Contract

**RUN** (Contract assembly — runs two interviews: Screens per zone, then Dependencies / credentials / skills):
```
Read @modules/s2-contract/contract-blueprint.md, @app/spec.html, and @app/tight-thesis.json. Follow the contract-blueprint procedure end-to-end. Write app/contract.html.

Ask user for any Dependencies / credentials / skills needed
```

Close-out runs automatically as the blueprint's final step (appends to `claude-progress.txt`, updates `CLAUDE.md` §3).

---

## S3 — Build

**Before you start: install the data library.**

```
pip install yfinance
```

**RUN** (Decomposer → Initializer → Coder chain — halts only on escalations):
```
Read @modules/s3-build/build-blueprint.md, @app/contract.html, and @app/claude-progress.txt. Follow the build-blueprint procedure end-to-end.
```

Note: Close-out runs automatically as the Coder's handoff condition (per-feature RATIONALE entries plus session-level close: appends to `claude-progress.txt`, updates `CLAUDE.md`).

---

## S4 — Evaluate

**Before you start: install Langfuse so OBSERVE works.** Run from `app/` (where `package.json` lives):

```
cd app && npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-trace-node
```

The `instrumentation.ts` entry-point is already wired in `app/` if S3 produced it; otherwise the Langfuse skill at `.claude/skills/langfuse/SKILL.md` can scaffold it. Langfuse credentials live in `.env` (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`).

**RUN** (Define criteria from spec, then Independent Judge applies them to the app's picks):
```
Read @modules/s4-evaluate/eval-blueprint.md, @app/spec.html, and @app/claude-progress.txt. Follow the eval-blueprint procedure end-to-end: first write app/eval-criteria.html from the spec, then run the Independent Judge against it. Write app/eval-results.html: one row per (criterion × pick), binary PASS/FAIL, with WHY on every FAIL.
```

**OBSERVE** (wire the eval into Langfuse so the verdicts land in a dashboard. Langfuse creds already in `.env`):

```
Read @app/eval-results.html and @.claude/skills/langfuse/references/instrumentation.md.

Push the verdicts to Langfuse as a traced eval run using the JS SDK:
- Wrap the whole run in `startActiveObservation('s4-eval-run', ...)` from `@langfuse/tracing`.
- Inside, create one child observation per (criterion × pick) row. Name it `<criterion-id>:<ticker>`. Attach a numeric score (1 = PASS, 0 = FAIL). On FAIL, set metadata `{ gulf, why }` from the eval-results row.
- After all children land, call `langfuseSpanProcessor.forceFlush()` and print the Langfuse run URL.

If the @langfuse/tracing import path or scoring API differs from what's in the reference, follow the reference — it's the latest.
```

Re-run **OBSERVE** after each S5 fix for the drift moment — same dashboard, new timestamped run.

Close-out: append a RATIONALE entry to `claude-progress.txt` with the Langfuse run URL, and update `CLAUDE.md` §4 Eval Bar with the failure modes surfaced.

---

## S5 — Debug

**RUN** (Surgical Fix loop — two routes, same discipline; token receipts on every fix):
```
Read @modules/s5-debug/surgical-fix-blueprint.md, @app/eval-results.html, @app/eval-criteria.html, @modules/s4-evaluate/eval-blueprint.md, and @app/claude-progress.txt.

Ask me first: "Debug from eval results, or describe a bug/change you want fixed?" If I describe a bug, take the manual route — locate the layer using the trace + feature-list + git log, quote back the exact feature ID and file:line before making any change. Otherwise walk the FAIL and N/A rows from eval-results.html.

Follow the surgical-fix-blueprint procedure end-to-end. Every entry in app/debug-log.html must carry tokens used + approximate cost — those are the receipts.
```

Close-out runs automatically as the blueprint's final step (per-fix RATIONALE entries appended to `claude-progress.txt`, `CLAUDE.md` updated with surviving tenets).

---

## S6 — Strip & Clinic

**RUN** (Model Recall + Strip discipline — time-box to 4 strips):
```
Read @modules/s6-strip-clinic/strip-blueprint.md, @app/claude-progress.txt, @app/eval-results.html, @app/debug-log.html, and app/. Pick a fictional new-model launch (e.g., "Opus 4.5"). Follow the strip-blueprint procedure end-to-end: write app/recall-notice.html, then walk up to 4 scaffolding components through the Strip discipline and write app/strip-page.html.
```

Close-out runs automatically as the blueprint's final step (per-strip RATIONALE entries appended to `claude-progress.txt`, `CLAUDE.md` §2 Durable Tenets updated).
