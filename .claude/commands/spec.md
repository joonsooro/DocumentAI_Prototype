---
description: Run the Working Backwards chain to produce spec.html, CLAUDE.md, tight-thesis.json, and evals.md in app/.
---

Invoke the `working-backwards` skill.

Ask the user for the three one-sentence inputs before starting the chain:

- **PRODUCT** — one sentence.
- **FEATURE** — one sentence.
- **BROKE_OR_COULD_BREAK** — one sentence.

Then run the 6-step chain exactly as defined in the skill and in [`modules/s1-working-backwards/working-backwards-blueprint.md`](../../modules/s1-working-backwards/working-backwards-blueprint.md). Honor every halt condition (1–5). On the close-out, append one RATIONALE line per landed file to `app/claude-progress.txt`.
