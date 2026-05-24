# S1 — Working Backwards

Vague brief → spec an agent can build from reliably.

---

## Stages

1. Build — skill + `/spec` from [`./working-backwards-blueprint.md`](./working-backwards-blueprint.md)
2. Run — `/spec` → `spec.html` · `CLAUDE.md` · `tight-thesis.json` · `evals.md`
3. Audit — one-shot vs. [`./ambiguity-audit-blueprint.md`](./ambiguity-audit-blueprint.md) → `ambiguity-audit.html`
4. Close — append to `claude-progress.txt`

---

## Build chain

| Artifact                | Path                                                                |
|-------------------------|---------------------------------------------------------------------|
| Working Backwards skill | `.claude/skills/working-backwards/SKILL.md`                         |
| `/spec` command         | `.claude/commands/spec.md`                                          |
| Spec                    | `app/spec.html`                                                     |
| CLAUDE.md               | `app/CLAUDE.md`                                                     |
| Tight thesis            | `app/tight-thesis.json`                                             |
| Evals                   | `app/evals.md`                                                      |
| Ambiguity audit         | `app/ambiguity-audit.html`                                          |
| Progress trace          | `app/claude-progress.txt`                                           |
