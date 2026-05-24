# Module file rules

Module files (`sN-*.md`) and `session-flow.md` are live-demo scripts. The instructor reads the header, pastes the block, moves on. Cut anything that doesn't change what the user types, pastes, or stops doing next.

---

## Short script + separate blueprint

The module file is the demo script. The blueprint is the artifact pattern — prompts, schemas, door-map sections, halt conditions. Never inline a blueprint inside a module file. The script paste-references the blueprint by `@`-path; the blueprint lives folder-local (`modules/<sN>/<name>-blueprint.md`) or at kit level if shared across sessions (`modules/<name>-blueprint.md`, like `bar-raiser-blueprint.md`).

Test: a module file longer than ~50 lines is wrong. Move the long content into a blueprint.

---

## Required structure — every module file

Three kinds of stages, in this order. Build first, run second, close last.

### Build stage — create the skill / command / prompt from a blueprint

    ## Stage 1 — Build the <artifact>   (demo move)

    ```
    Read @modules/<sN-name>/<sN-name>.md and @modules/<blueprint>.md and build the <artifact>.
    ```

    Expected artifacts:
    - `.claude/skills/<name>/SKILL.md` — codified from `<blueprint>.md`
    - `.claude/commands/<name>.md` — loads the skill

    Stop here.

### Run stage — invoke + input + output + target folder

    ## Stage 2 — Invoke `/<command>`

    ```
    /<command>
    ```

    What it asks: <PRODUCT / FEATURE / BROKE_OR_COULD_BREAK — one sentence each>
    OR
    Reads: `<input file 1>` · `<input file 2>`

    Outputs (in `modules/<sN-name>/`):
    - `<file 1>` · `<file 2>` · `<file 3>`

    Stop here.

### Close stage — update CLAUDE.md and claude-progress.txt

    ## Stage N — Close out

    ```
    Update app/CLAUDE.md with any new tenets / contracts / open items introduced this session. Append a RATIONALE entry to app/claude-progress.txt: timestamp · session ID · artifact that landed · key decision.
    ```

S1 creates `CLAUDE.md` and `claude-progress.txt`. S2+ append. No close stage = the next session inherits no context.

---

## Cut

```
stage intros                       "Spec engineers build their own skills."
why-this-matters framing           "The audit is the independent critic..."
"Paste:" labels                    the fenced block IS the instruction
declarations of what isn't         "Not a skill. Not a command."
bold for emphasis                  flat prose only
prose duplicating the table        build chain carries the artifact ledger
restated framing per stage         one line at the file top is enough
sample inputs inside the module    those live in session-flow.md
inline blueprints                  move them to a separate <name>-blueprint.md
```

## Keep

```
artifact paths that land           ".claude/skills/working-backwards/SKILL.md"
what the user will be asked        "the skill will ask for PRODUCT / FEATURE / ..."
halt instructions                  "don't push past a halt"
"Stop here"                        instructor cue, not narrative
the build chain table              one row per artifact, no prose around it
@-path references to blueprints    the script never repeats the blueprint inline
```

---

## Test

Read it aloud as if on stage. If a sentence doesn't tell the instructor what to type, paste, click, or stop doing — cut it. If the file is over ~50 lines, a blueprint is hiding inside it.
