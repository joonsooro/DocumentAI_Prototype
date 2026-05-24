# Contract: artifact blueprint

Pattern: **the wiring diagram between spec and build.** The contract decomposes the spec into ordered, buildable units — each with what goes in, what comes out, when it's done, when to abandon it. S3 Build reads this verbatim — every loose phrase becomes an invented behaviour downstream.

The spec says *what*. The contract says *what to build, in what order, with what handoffs*. Verifiable and judge-required criteria don't live here — they live in S4, where the eval is actually run.

---

## Sections of contract.html

- **Header** — product one-liner + customer promise + negative contract + disclaimer banner. Copied verbatim from `tight-thesis.json`.
- **Decomposition** — ordered list of buildable units. One row per unit: name · what goes in · what comes out · how you know it's done · when to give up on it · where the output lands. Sourced from spec §5 Behaviour Contract (Always rules) and spec §8 Implementation Notes.
- **Screens** — one card per screen — layout zones (header / sidebar / main / footer), key components, primary user action.
- **Substrate** — cross-cutting infrastructure choices copied verbatim from spec §9.
- **Dependencies & skills** — external services the build will touch, design-system pointer (or `frontend-design` default), and any other Claude skills the build should invoke by name.

The LLM designs the HTML layout. Keep field names stable across runs so the S3 Initializer can parse position-by-position.

---

## Procedure

**Inputs:**
- SPEC: `app/spec.html`
- TIGHT-THESIS: `app/tight-thesis.json`

**Step 0 — Header.** Copy `customer_promise` + `negative_contract` verbatim from tight-thesis into the Header. Add the disclaimer banner.

**Step 1 — Read spec.**

**Step 2 — Decomposition.** Walk spec §5 Behaviour Contract Always rules and spec §8 Implementation Notes. For each, write one row: name · what goes in · what comes out · how the agent knows it's done · when to give up on it (the per-unit kill switch — numeric + time-bounded) · where the output lands.

Halt if any row is missing input, output, or kill switch. Halt if a kill switch lacks a number or a time window — soft language is not a kill switch, push back.

**Step 3 — UI surface.** AskUserQuestion on "How should the build handle UI?".
Options:

1. A named design system (capture the pointer + how the build invokes it).
2. The `frontend-design` skill as default (the Coder invokes it for every UI surface).

For each screen named in spec §8, capture one row: screen name · UI handler · any specific component or interaction the spec already names. The design system or the skill owns layout details — the contract does not interrogate per-zone choices.

Halt only if the spec implies a UI surface and the user gives no UI handler.

**Step 4 — Substrate.** Copy spec §9 verbatim into the Substrate section. Halt if anything diverges from the spec. No auto-derivation — substrate enforcement happens in S3 (Coder hard-stop) and S4 (eval check).

**Step 5 — Dependencies & skills.** Walk the spec's FAQ + Substrate rows and surface every external dependency the build will touch. For each, ask the user: name · purpose · access mechanism (API key / OAuth / public / none) · credential status (have it / need to provision / user must provide now). If credential status is "user must provide now," collect the credential in this turn — do not defer to S3.

Then ask: *"Do you have a design system you want to plug in?"* If yes, capture the pointer + how to invoke. If no, record `frontend-design skill (default)` so the build invokes it for every UI surface.

Then ask: *"Any other Claude skills the build should use?"* Capture one row each.

Halt if any dependency lacks an access mechanism. Halt if a credential status is "user must provide now" and the credential is not in the conversation. Halt if a live credential is destined for any file other than a gitignored one (typically `.env`). Halt if the named storage filename appears in `requirements.txt`, `.env.example`, `README.md`, source code, or any committed file. Halt if a UI surface is implied anywhere in the spec and Dependencies has no design-system row (default `frontend-design` row counts). Halt if a decided substrate row in spec §9 names a third-party provider that doesn't appear in Dependencies.

**Step 6 — Write `app/contract.html`** with all five sections. Render via the `frontend-design` skill — pass the sections as structured content; let the skill own layout and the disclaimer-banner styling. Don't hand-roll the HTML.

**Step 7 — Close out.** Append a RATIONALE entry to `app/claude-progress.txt`:
```
<ISO timestamp>  S2  contract.html landed  RATIONALE: <one sentence — decomposition rows authored + the kill switch most likely to trip + any unresolved dependency>
```
Do not update `CLAUDE.md` — the decomposition is product content, it lives in `contract.html`. CLAUDE.md only changes when a durable tenet surfaces, which is rare in S2.

---

**Output:** `app/contract.html` + appended entry to `app/claude-progress.txt`
