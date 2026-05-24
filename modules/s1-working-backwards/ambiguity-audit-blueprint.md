# Ambiguity Audit: artifact blueprint

Pattern: **independent critic over a finished spec** — single scan with three flag classes (entities, actions, qualifiers) and three halt conditions.

**Input:** `SPEC = a draft spec.md / spec.html`

| Step | Action | Flag condition |
|------|--------|----------------|
| 1 | Scan the spec linearly. | — |
| 2 | For every entity name (user / stock / filter / exclusion), mark first introduction. | If referenced before defined → flag. |
| 3 | For every action verb ("the agent shall X," "the system will Y," "the user can Z"), mark whether the corresponding HOW is specified. | If missing → flag. |
| 4 | For every qualifier (numeric range, time window, ratio, percentage), mark whether unit / direction / boundary is explicit. | If "high margin" without threshold, "recent" without date, or "small-cap" without range → flag. |
| 5 | Output `ambiguity-audit.html` with three columns: term/action/qualifier · location · flag reason. | Failures rendered in red. All-clean rows omitted. Pass/fail count in header callout. |

**Output:** `app/ambiguity-audit.html` — render via the `frontend-design` skill (pass the flagged rows + pass/fail count; let the skill own table styling and the red-flag treatment).

---

## Halt conditions

- HALT IF any entity is referenced before introduction → audit FAILS, return to spec, define the entity
- HALT IF any "shall / will" verb has no HOW → audit FAILS, specify the HOW
- HALT IF any qualifier has no unit / boundary → audit FAILS, bound it

---

## How this connects to Working Backwards

The Working Backwards chain produces a spec that *reads* complete because every sentence is grammatical. The audit is the independent critic. Run it after the chain halts cleanly — never inside the chain. A spec that passes Working Backwards but fails the audit is the normal case, not the exception.
