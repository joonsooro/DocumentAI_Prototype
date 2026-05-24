# Build: artifact blueprint

Pattern: **three single-responsibility prompts on one harness, with file-based handoffs.** Decomposer → Initializer → Coder. Each prompt labeled TWO-WAY (reversible) or ONE-WAY (irreversible, requires written defense).

Anthropic's harness-design framing: Planner / Generator / Evaluator on one harness. The workshop maps Decomposer + Initializer to the Planner role (split for traceability), Coder to the Generator. The Evaluator role lives in S4 as the Independent Judge — a deliberate cross-session split so the build harness stays focused.

Cost shape: a full 3-prompt harness runs ~20× the tokens/cost of a single-chat build (Anthropic: ~$200 vs ~$9 for representative tasks). The justification is durability across context resets and per-feature traceability into S4 FAIL rows, not raw capability.

Principle: "find the simplest solution possible, and only increase complexity when needed" (Anthropic). The Decomposer is the workshop's complexity addition — keep it while debugging into S5 needs per-feature granularity; strip it in S6 if a future model handles whole-app builds reliably.

---

## Agent Owner

Each prompt owns one thing. The boundary is what it reads and what it writes — nothing crosses without a file.

| Agent       | Owns                                                       | Reads                                                                     | Writes                                                                                       |
|-------------|------------------------------------------------------------|---------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Decomposer  | Rendering contract decomposition rows into a feature list  | `app/contract.html` (Decomposition + Screens), `app/claude-progress.txt`  | `app/feature-list.json`                                                                      |
| Initializer | Translating contract into cross-cutting config             | `app/contract.html`, `app/feature-list.json`, `app/claude-progress.txt`   | `app/app-spec.json`                                                                          |
| Coder       | Building features one-by-one with traceability             | `app/app-spec.json`, `app/feature-list.json`, `app/claude-progress.txt`, `git log` | `app/` (conventional layout for the chosen language — `app/src/` for Python, `app/api/`+`app/lib/`+`app/components/` for Next.js), `app/claude-progress.txt` (append), `app/feature-list.json` (status field) |

---

## Task decomposition (`feature-list.json`)

**Input:** `app/contract.html` (Header + Decomposition + Screens + Substrate + Dependencies). The contract already carries everything S3 needs — the spec lives upstream of the contract and isn't read in this session.

**Decomposer prompt** — single responsibility: render the contract's Decomposition rows (already decomposed in S2) into `feature-list.json`. One feature per decomposition row, plus one feature per screen component when a row is multi-faceted. Mechanical translation, not invention.

| Phase | Reversibility | Detail |
|---|---|---|
| **WHAT it can do** | TWO-WAY | Read contract (Decomposition + Screens) |
|  | TWO-WAY | Write `feature-list.json` (write-only) |
|  | TWO-WAY | Enumerate features, point each at a Decomposition row, set `status=todo`, carry the per-unit kill switch through onto each feature |
|  | ONE-WAY | Never invent a feature without a contract Decomposition pointer |
| **WHEN it stops** | TWO-WAY | Handoff: every Decomposition row has at least one feature pointing at it |
|  | ONE-WAY | If a Decomposition row has no extractable feature, halt and ask |
|  | ONE-WAY | If `feature-list.json` fails schema validation, halt |
| **IF it breaks** | TWO-WAY | Rollback: discard `feature-list.json`, re-run with fresh context |
|  | TWO-WAY | Success signal: every feature has `{id, name, acceptance, kill_switch, status=todo}` |
|  | ONE-WAY | Change control: feature additions during build require a Surgical Fix log entry |

**Output:** `app/feature-list.json` — ordered list of buildable units, each with status + kill switch. The Coder reads this to know what to build next; the human reads it to see build progress without scrolling the trace.

The Decomposer fires before the Initializer. *Without it, the Coder builds the whole app in one pass and the trace can't tell you which feature regressed when an eval FAILs in S4.*

---

## Initializer / Coder split

**Input:** `app/contract.html` (Screens + Substrate + Dependencies) + `app/feature-list.json`.

### Initializer prompt

Single responsibility: read contract + feature-list, write `app-spec.json` — the cross-cutting config the Coder reads alongside the feature list.

| Phase | Reversibility | Detail |
|---|---|---|
| **WHAT it can do** | TWO-WAY | Read contract (Screens + Substrate + Dependencies) and feature-list (read-only) |
|  | TWO-WAY | Write `app-spec.json` (write-only) |
|  | TWO-WAY | Parse, extract, structure |
|  | TWO-WAY | Copy the contract's Substrate and Dependencies verbatim into `app-spec.json` |
|  | ONE-WAY | Never invent a filter, substrate row, or dependency row |
| **WHEN it stops** | TWO-WAY | Handoff: `app-spec.json` written with substrate + dependencies + screens populated |
|  | ONE-WAY | Escalation: if the contract is empty or sparse, halt and ask the user |
|  | ONE-WAY | Halt if `app-spec.json` fails schema validation |
|  | ONE-WAY | Halt if any dependency has `credential_status: user must provide now` and the credential is not resolvable from env or `app-spec.json` |
|  | ONE-WAY | Halt if any external-service storage filename is missing from `.gitignore`, or appears in `requirements.txt` / `.env.example` / `README.md` / any committed source file |
| **IF it breaks** | TWO-WAY | Rollback: discard `app-spec.json`, re-run with fresh context |
|  | TWO-WAY | Success signal: `app-spec.json` valid + Screens + Substrate + Dependencies present |
|  | ONE-WAY | Change control: schema changes require user sign-off |

**Output:** `app/app-spec.json` — captures the contract's Screens, Substrate, and Dependencies plus the cross-cutting config the Coder needs (filter set, data-layer config). The LLM designs the field shape; the Initializer's job is to copy, not invent. Per-unit kill switches live inside `feature-list.json`, not here.

### Coder prompt

Single responsibility: read `app/app-spec.json` + `app/feature-list.json` + `app/claude-progress.txt` + `git log`, build the app feature by feature into `app/` using the conventional layout for the substrate named in `app-spec.json` (e.g. `app/src/app.py` for Python, `app/api/`+`app/lib/`+`app/components/` for Next.js), tick statuses as each lands.

| Phase | Reversibility | Detail |
|---|---|---|
| **WHAT it can do** | TWO-WAY | Read app-spec + feature-list + trace + git |
|  | TWO-WAY | Write Python, render HTML, append to the trace, tick feature statuses (todo → doing → done), commit |
|  | TWO-WAY | For any UI surface, invoke the design-system pointer in `app-spec.json.dependencies` if non-null; otherwise invoke the `frontend-design` Claude skill. Never hand-roll UI |
|  | TWO-WAY | For any other skill listed in `app-spec.json.dependencies`, invoke it when its trigger fires — do not duplicate its work inline |
|  | ONE-WAY | Follow the Screens section verbatim — if ambiguous, surface a question |
|  | ONE-WAY | Enforce the per-unit kill switch on each feature (from `feature-list.json`) — exit with code 3 if any tripped |
|  | ONE-WAY | Disclaimer banner auto-appends to every output |
|  | ONE-WAY | Never set a feature to `done` without a trace entry naming the feature ID + RATIONALE |
|  | ONE-WAY | Never import, call, or persist through a substrate not listed in `app-spec.json` — if a feature needs one that isn't there, halt and ask |
|  | ONE-WAY | Never start a feature whose required dependency has `credential_status` other than `have` — halt and ask, do not stub |
| **WHEN it stops** | TWO-WAY | Handoff: every feature in `feature-list.json` is `done`; app runs; `claude-progress.txt` has one RATIONALE per feature; commit lands. After the last feature: append a session-level RATIONALE entry to `claude-progress.txt`. Update `app/CLAUDE.md` §2 Durable Tenets **only** if a tenet that survives a model swap surfaced during the build — most runs add nothing |
|  | ONE-WAY | If the Screens section is ambiguous on a feature, halt and ask |
|  | ONE-WAY | If a required credential is missing at build time, halt and ask — do not stub |
|  | ONE-WAY | If a per-unit kill switch trips, exit 3 + log to the trace |
| **IF it breaks** | TWO-WAY | Rollback: `git revert`; re-run; reset affected feature statuses to `todo` |
|  | TWO-WAY | Success signal: app runs + acceptance signals pass + feature-list all `done` |
|  | ONE-WAY | Change control: changes to data layer or kill enforcement require user sign-off |

**Output:** the app source under `app/` (layout per substrate — `app/src/app.py` for Python, `app/api/`+`app/lib/`+`app/components/` for Next.js) + engine modules + data layer · per-feature RATIONALE entries appended to `app/claude-progress.txt` + session-level close entry · `feature-list.json` status updates · one git commit per feature · `app/CLAUDE.md` §2 touched only if a durable tenet surfaced (rare).

---

## Black Box (Trace Log)

| File | Role | Path | Each entry |
|---|---|---|---|
| `claude-progress.txt` | Narrative trace (why-not-what) | `app/claude-progress.txt` | timestamp · actor (S1 / S2 / S3.INIT / S3.CODER / S4 / S5 / S6) · event · RATIONALE (one sentence — why) |
| `git log` | State-change trail | repo root | atomic state change per commit · message names what + why |

Rationale is mandatory in `claude-progress.txt`; bare facts (file written, exit code) live in git log.

Reading the trace after incidents: when the eval fails in S4, open `claude-progress.txt` and look for the entry whose RATIONALE explains the failure path. If the trace doesn't surface the cause, it was too thin — invoke `/deep-dive` on the fuzzy incident; the output appends to the trace.

---

## Anti-pattern — don't skip decomposition

A Coder that reads only `app-spec.json` (the config) without `feature-list.json` builds the whole app in one pass. The trace can't then tell you which feature regressed when an eval FAILs in S4 — and S5's Surgical Fix has nowhere to land.
