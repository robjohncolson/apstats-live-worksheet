# Review task — slip layout (full width, 11pt) + TI-84 mastery check on the emulator

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Repo: this working directory. Two UNCOMMITTED changes (`git status --short`; `git diff -- <file>`):

A. `scripts/weekly-slips.mjs` + `tests/weekly-slips.test.js` — the printed grade slip re-laid-out to use the
   full page width at 11pt (two-column top block, full-width score strip and box plot below). The CONTENT
   (every sentence, colour, and order from `SLIPS_V2_SPEC.md` and `EFFORT_VISIBILITY_V2_SPEC.md`) must be unchanged.
B. `ti84-trainer-v2/app.js` (+ regenerated `ti84-trainer-v2/generated/*` and `ti84-trainer-v2/standalone.html`)
   + `tests/ti84-*.test.js` — the handheld mastery check now runs on the ON-SCREEN emulator as well as a real
   TI-84 (teacher: "the emulator exists so students can practice without a physical calculator").

## What to look for

A. Slips
1. Any content change: compare the rendered strings before/after (`git diff`): missing-work rows, the PC line and
   strategy sentence, the ahead line, the score strip lead/foot/key, the box-plot sentence, the plan, the footer.
   A dropped or reordered line is a finding.
2. Layout safety: the fixed slip height × 2 + gap must fit the text height for the chosen geometry; a slip with
   13 missing rows must not push the second slip off the page; adjustbox must be `max height` only (never
   shrink width); `\raggedright\sloppy` chips must not overflow the right margin (check the .log for Overfull
   boxes if a .log exists in `%USERPROFILE%\grade-backups\slips`; do not create files there).
3. `latexText` escaping still applied to every interpolated string in the new column macros; no name in tests.

B. Trainer
1. Identifiers untouched: `handheld-mastery` event, `recordHandheldMastery`, `TI84-<procedure>` item ids,
   `finishHandheldMastery`, `selfAttest` semantics (60% credit ONLY for physical-mode self-attest of unverifiable
   procedures — check that emulator-mode unverifiable checks do not silently become 100% credit without a
   verified result; report exactly what credit path the emulator confirm takes).
2. The emulator column is rendered during the check when `physicalMode` is false, and the physical card when
   true; the check's `Check` button still verifies typed values by recompute; `Later` still defers.
3. No remaining student-facing "real TI-84 / own TI-84 / proven on a real calculator" strings in the CHECK flow
   (the "Real TI-84" mode toggle and its title may keep those words); `generated/` and `standalone.html` are
   regenerated from the same source (spot-check one changed string appears in standalone.html).
4. Tests repinned, not deleted; the new test actually renders the handheld layout in emulator mode.

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|PRIVACY|TEST] <file>:<line> — <one sentence>
   Repro/why: <concrete input → wrong output>
   Fix: <one sentence>
2. ...
CHECKED-OK: <sections verified with no finding>
```

Only report content loss, layout that can spill or shrink width, a credit/identifier change, a remaining
"real calculator" requirement in the check flow, a stale build artifact, or lost coverage. No style nits.
