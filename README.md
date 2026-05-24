# Workshop #2 — Student Kit

**The Product Builder Certification: From Vibe Coding to Spec Engineering**

May 23, 2026 ·  Saturday · 4 hours live · 6 sessions

---

## Start here

1. Complete the install steps in [`pre-course-setup.md`](pre-course-setup.md) **before May 23**. Takes 20–30 minutes.
2. Show up on May 23. Bring your laptop. We build everything live.

---

## The arc

```
S1  Working Backwards    →  spec.html + tight-thesis.json + CLAUDE.md + evals.md
S2  Contract             →  contract.html (incl. Screens, Substrate, Dependencies)
S3  Build                →  src/app.py + feature-list.json + app-spec.json
S4  Evaluate             →  eval-results.html (independent judge per pick)
S5  Debug                →  debug-log.html (one Surgical Fix per FAIL)
S6  Strip & Clinic       →  recall-notice.html + strip-page.html
```

Across all six, one trace — **claude-progress.txt** — accumulates the rationale for every decision. The next session reads it.

---

## What each session teaches

### S1 — Working Backwards · *prompt chaining*

[Session blueprint →](modules/s1-working-backwards/s1-working-backwards.md)

Five sequential LLM calls with four halt conditions between them: customer promise + negative contract → FAQ assertions → behaviour contract → spec.html + tight-thesis.json → CLAUDE.md. Each halt stops the chain when the upstream is too soft for the downstream to use. You walk out with a spec the next session can read verbatim, the CLAUDE.md that primes every future session, and 12 eval cases the app will be measured against.

### S2 — Contract · *structured artifact + per-screen interview*

[Session blueprint →](modules/s2-contract/s2-contract.md)

The contract extracts verifiable + needs-eval + kill criteria from the spec, then runs a per-screen interview to author the Screens section one question at a time. The new §6 Dependencies / credentials / skills step surfaces every external API, credential, and Claude skill the build will need — before the build hits a wall. You walk out with a contract.html the build harness can read verbatim, and no missing API keys at build time.

### S3 — Build · *three single-responsibility agents on one harness*

[Session blueprint →](modules/s3-build/s3-build.md)

Decomposer → Initializer → Coder. The Decomposer translates contract acceptance rows into discrete buildable features. The Initializer translates the contract into cross-cutting config (substrate, dependencies, skills to invoke). The Coder builds one feature at a time and writes a RATIONALE entry to the trace per feature. UI surfaces invoke the `frontend-design` skill (or the design system you named in the contract). You walk out with a running app and a trace that names which feature owns which decision.

### S4 — Evaluate · *independent judge (cross-session split)*

[Session blueprint →](modules/s4-evaluate/s4-evaluate.md)

A fresh inference call — separate from the build harness — applies the contract's verifiable + needs-eval criteria to the app's outputs. Binary PASS / FAIL per (criterion × pick). Every FAIL gets tagged with one of the Three Gulfs (Comprehension / Specification / Generalization). You walk out with eval-results.html — the FAIL rows are the work for S5.

### S5 — Debug · *Surgical Fix — one change at the named layer*

[Session blueprint →](modules/s5-debug/s5-debug.md)

For each FAIL row: name the layer (spec / contract / screen / substrate / prompt / data), make one targeted change, re-run the eval, log the before/after. One change per entry. If the layer is ambiguous, `deep-dive` surfaces it. You walk out with debug-log.html — one entry per fix — and a prototype that passes the eval bar.

### S6 — Strip & Clinic · *Model Recall + Strip discipline*

[Session blueprint →](modules/s6-strip-clinic/s6-strip-clinic.md)

A new model launch fires a Model Recall on your harness. For each piece of scaffolding (pre-baked lookups, sentiment passes, cross-validation, UI scaffolding, prompt kludges), the trace tells you whether the new model still needs it. Strip when the traces say so, keep when they say otherwise. You walk out with a stripped harness and the discipline to do this every time a new model ships.

---

## How the workshop runs

The run-of-show lives in [`modules/session-flow.md`](modules/session-flow.md). For each session:

1. **Paste the BUILD prompt.** Claude reads the session blueprint and produces the matching skill / agent / command into `.claude/`.
2. **Paste the INPUT.** The freshly built skill runs on real material — your spec, your contract, your eval FAILs.
3. **The artifact lands in `app/`.** The next session reads it from there.

Every artifact appears in front of you. Nothing is shown that hasn't been built live.

---

## What your kit looks like at the end of the day

```
ws2-student-kit/
├── README.md
├── DISCLAIMER.md
├── requirements.txt                  (Python deps for the daily refresh script)
├── .env                              (your FMP_API_KEY + ANTHROPIC_API_KEY + LANGFUSE_* keys)
├── modules/                          (read-only reference — blueprints + session docs)
│   ├── session-flow.md               (the run-of-show — paste these prompts)
│   ├── primary-sources.md            (background reading)
│   ├── bar-raiser-blueprint.md       (ad-hoc, when a session needs a harder critique)
│   ├── deep-dive-blueprint.md        (ad-hoc, when a layer is ambiguous)
│   ├── s1-working-backwards/
│   ├── s2-contract/
│   ├── s3-build/
│   ├── s4-evaluate/
│   ├── s5-debug/
│   └── s6-strip-clinic/
├── .claude/                          (everything you built live)
│   ├── skills/
│   │   ├── working-backwards/        (S1)
│   │   └── langfuse/                 (S4 OBSERVE — pulled from github.com/langfuse/skills)
│   ├── commands/
│   │   ├── spec.md                   (S1)
│   │   └── deep-dive.md              (ad-hoc, when invoked)
│   └── agents/                       (any sub-agents the build wired in)
└── app/                              (the project S3 built + every artifact the workshop produced)
    ├── pre-course-setup.md           (install steps you ran before May 23)
    ├── package.json                  (S3 — Node/Next.js build manifest)
    ├── tsconfig.json                 (S3)
    ├── next.config.mjs               (S3)
    ├── tailwind.config.ts            (S3)
    ├── postcss.config.mjs            (S3)
    ├── instrumentation.ts            (S4 — Langfuse OTel wiring)
    ├── layout.tsx, page.tsx, globals.css   (S3 — Next.js shell)
    ├── api/, lib/, components/       (S3 — source the Coder produced)
    ├── scripts/                      (S3 — data-refresh job + helpers)
    ├── data/                         (snapshot.db + trace.jsonl — gitignored)
    ├── CLAUDE.md                     (S1, updated every session)
    ├── claude-progress.txt           (the running trace — every session appends)
    ├── spec.html                     (S1)
    ├── tight-thesis.json             (S1)
    ├── evals.md                      (S1)
    ├── ambiguity-audit.html          (S1)
    ├── contract.html                 (S2)
    ├── feature-list.json             (S3)
    ├── app-spec.json                 (S3)
    ├── eval-criteria.html            (S4 — Step 1, criteria derived from spec)
    ├── eval-results.html             (S4 — Step 2, independent judge per pick)
    ├── debug-log.html                (S5)
    ├── recall-notice.html            (S6)
    └── strip-page.html               (S6)
```

Monday morning you open `/spec` on your own problem.

---

## Worked example — S4 on the stock-shortlist demo

A concrete trace of how S4 runs end-to-end. The procedure is the same on any spec; the picks below are what the demo produced on 2026-05-23.

```
spec.html ─┐
CLAUDE.md  │   (1) read intent             (2) derive criteria
contract   │ ───────────────────────►  eval-criteria.html
evals.md  ─┘                                    │
                                                ▼
snapshot.db  ──(3) reproduce picks──►  N tickers (criterion × pick judged)
                                                │
                                                ▼
                                       eval-results.html
                                                │
                                                ├──(4) OBSERVE──►  Langfuse dashboard
                                                │                  (re-run after every S5 fix)
                                                ▼
                                   claude-progress.txt
                                   CLAUDE.md §4 updated
```

**Step 1 — Define criteria.** Walk every Behaviour Contract rule and FAQ assertion in `spec.html` and sort each into one of three buckets:
- *Self-check* (machine-verifiable): "every cell has a non-null source" → SC-1..SC-10.
- *Judge-required* (needs spec-intent reading): "picks look like stocks to a beginner" → JR-1..JR-5, each tagged with the Gulf its FAIL would belong to (Comprehension / Specification / Generalization).
- *Eval-level kill* (numeric + time-bounded): if the spec has no row of the shape "3 of 5 picks underperform SPY by >15% over 12 months", push back — do not invent one.

Output: `app/eval-criteria.html` with the three sections + a substrate-substitution table.

**Step 2 — Reproduce the picks independently.** The eval must not depend on the running app being healthy. Read `app/data/snapshot.db` directly, replicate the ranker logic (`app/lib/ranker.ts`: z-score, threshold pre-filters, equal-weight composite), print the top N.
Example:

| Rank | Ticker | Company | Composite |
|---|---|---|---|
| 1 | CII | BlackRock Enhanced Large Cap Core Fund, Inc. | 0.596 |
| 2 | BCV | Bancroft Fund Ltd. | 0.496 |
| 3 | BOE | BlackRock Enhanced Global Dividend Trust | 0.352 |
| 4 | BDJ | BlackRock Enhanced Equity Dividend Trust | 0.267 |
| 5 | BGY | BlackRock Enhanced International Dividend Trust | 0.263 |

Pool size after threshold pre-filters: 13 out of 3,000 universe rows.

**Step 3 — Apply each criterion to each pick.** Per-pick verdicts go in a `criterion × pick` table — 11 per-pick criteria × 5 picks = 55 rows. Each FAIL carries the Gulf and a one-sentence reason. Call-level checks (banned-words scan, empty-factor 400 behaviour, pool-size adequacy) sit in a separate 4-row table.

Result on this run:

| Bucket | Verdict |
|---|---|
| Self-check (SC-1..SC-10) | 40 / 40 PASS — provenance, freshness, exchange allowlist, no padding, source literal all upheld |
| JR-1 operating-company equity | **5 / 5 FAIL** — every pick is a closed-end fund · Gulf: Comprehension |
| JR-2 label↔metric coherence | **5 / 5 FAIL** — "profitable" on a fund means realised gains, not operating profit · Gulf: Specification |
| JR-3 generalization | **5 / 5 FAIL** — pool of 13 collapses the top-N onto a fund corner; different factors flip the answer wholesale · Gulf: Generalization |
| JR-4 no-advice framing | 5 / 5 PASS |
| JR-5 pool-size adequacy | **1 / 1 FAIL** — snapshot shipped at 59% coverage; the U2 80% kill switch did not gate · Gulf: Specification |

**Step 4 — OBSERVE.** Push every (criterion × pick) verdict into Langfuse as one observation per row with a pass/fail score and the FAIL reason as metadata. The S4 run becomes a timestamped dashboard the workshop can re-run after each S5 fix — the same dashboard shows the drift, side by side. Langfuse credentials live in `.env`; the prompt is in `modules/session-flow.md` under **OBSERVE**.

**Step 5 — Headline + close out.** Dominant Gulf: Comprehension at the F-U1 universe layer. The SEC EDGAR loader pulled closed-end funds, BDCs, and royalty trusts into the universe; spec §4 Non-Goals excluded ETFs but did not enumerate the broader pooled-vehicle bucket. Three RATIONALE lines appended to `app/claude-progress.txt`; `app/CLAUDE.md §4` updated with the three failure modes. S5 reads from there.

**What the example teaches.** Self-checks find shape problems (missing fields, stale dates, bad counts). Judge rows find *intent* problems (the math is right but the answer isn't what the spec asked for). Both are needed — passing every self-check while failing every judge row is what a build that drifted from intent looks like.

---

*Educational. Not investment advice. The stock picker demo is a worked example for teaching spec engineering — not a recommendation to buy or hold any security.*
