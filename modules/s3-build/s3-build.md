# S3 — Build

Contract → working app + trace.

---

## Stages

1. Run — Decomposer → Initializer → Coder chain vs. [`./build-blueprint.md`](./build-blueprint.md) reading contract + progress, builds the app feature-by-feature → `src/app.py` · `feature-list.json` · `app-spec.json`
2. Close — (runs as the Coder's handoff condition) append session-level RATIONALE to `claude-progress.txt` and update `CLAUDE.md`

---

## Build chain

| Artifact         | Path                                               |
|------------------|----------------------------------------------------|
| Feature list     | `app/feature-list.json`                            |
| App spec         | `app/app-spec.json`                                |
| App              | `app/` (the Coder picks the conventional layout for the chosen language — e.g. `app/src/app.py` for Python, `app/api/`+`app/lib/`+`app/components/` for Next.js) |
| Trace (appended) | `app/claude-progress.txt`                          |
