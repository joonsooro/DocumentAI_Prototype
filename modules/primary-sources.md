# Primary sources — Workshop #2

Sources the workshop draws from. Tagged by session. Students don't need to read these in advance; they're here so the reasoning behind each technique is traceable.

---

## Sources

| Source | Sessions |
|---|---|
| Anthropic Engineering — harness research (initializer/coder split, independent eval, managed agents, the strip discipline) | S3, S4, S6 |
| Anthropic Engineering — *Effective harnesses for long-running agents* (footnote: "two agents" = two prompts on the same harness) | S3 |
| Anthropic Engineering — *Scaling Managed Agents* ("Harnesses encode assumptions that go stale as models improve") | S6 |
| Industry research on judge prompts (~15–20% higher human/model agreement with critique examples in the judge prompt) | S4 |
| Three Gulfs framework — Comprehension / Specification / Generalization (mental model for eval design) | S4 |
| Working Backwards + PR-FAQ — Amazon discipline (the FAQ-as-*why*) | S1 |
| Bar Raiser — Amazon hiring discipline, 4-evaluator parallel | S2, S4 |
| Two-way doors — Amazon decision discipline | S3 |
| HTML-over-Markdown for plans / reviews / artifacts — now the Claude Code default for long structured outputs | S1–S6 (artifact convention) |
| Antecedent basis discipline — every entity defined before it's referenced; every "the agent shall X" specifies the corresponding HOW | S1, S2 (screens) |
| 5-Whys / orchestrator-workers pattern — Workshop #1 carryover, reused as `/deep-dive` | S3, S4, S5 |
| Surgical Fix discipline — change one layer at a time, re-eval, verify, log | S5 |
| Model Recall (auto-recall analogy) — new AI model launch triggers re-inspection of every harness | S6 |

---

## How to use this file

- **GK reference, not student pre-read.** Students see the techniques on stage; this file documents the source so future sessions can re-derive.
- **Quotes verbatim where possible** — if you cite a source on stage, eyeball the primary before quoting.
- **Gaps flagged explicitly.** If a session's technique doesn't have a citable primary source (e.g., the workshop-coined Surgical Fix), note it as workshop-original.

---

## Workshop-original techniques (not sourced from outside)

The following techniques were named or operationalized inside the workshop and don't have an external primary source:

- **Ambiguity Audit** — operationalization of antecedent basis as a spec drill. Workshop-coined branding for §112-style rigor.
- **Black Box (Trace Log)** — naming convention applied to `claude-progress.txt` + git log. The discipline of *reading the trace after incidents* (not just recording) is the workshop's framing.
- **Surgical Fix** — the *one change, one re-eval, one verification* discipline is workshop-coined.
- **Model Recall** — the auto-recall analogy for AI model launches is workshop-coined.

Each lands where it fits in the 6-session arc. Full inventory + when-each-fires lives in the section blueprints.
