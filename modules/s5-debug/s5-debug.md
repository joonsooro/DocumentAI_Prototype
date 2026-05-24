# S5 — Debug

Eval FAILs → repaired prototype.

---

## Stages

1. Run — Surgical Fix vs. [`./surgical-fix-blueprint.md`](./surgical-fix-blueprint.md) reading eval-results + progress; one change per FAIL at the named layer → `debug-log.html` + live edits in the named layer
2. Close — (runs as the blueprint's final step) append per-fix RATIONALE to `claude-progress.txt` and update `CLAUDE.md` with surviving tenets

---

## Build chain

| Artifact         | Path                                               |
|------------------|----------------------------------------------------|
| Debug log        | `app/debug-log.html`                               |
| Trace (appended) | `app/claude-progress.txt`                          |
