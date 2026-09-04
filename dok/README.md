# dok/ — one DOK-3 problem per AP Stats lesson day

Spec: `../APS_DOK_LADDER_SPEC.md`. Class flow: board slide at the bell → students write a
**first take** → video follow-along → finish parts (a)(b)(c) → turn in. Every lesson, 1.1
included, carries a DOK-3 (§1.3). Three editions per day: student sheet (2 sides), board
slide (1 landscape page), teacher key (≤ 3 pages, E/P/I scoring on part (c)).

## Author one lesson (≈ 30 min once you have the problem)

1. **Registry row** — append ONE line to `registry.jsonl` (`aps-{topic}-d3-1`, `role: focus`).
   Copy `aps-1.6-d3-1` and change everything. Rules that the tests enforce:
   `dok: 3`; `parts` (a)(b)(c) with non-decreasing `dok` ending at 3; `first_take`;
   `frq_pattern` (kebab-case description of the released-FRQ pattern, never the item);
   `dok_rationale` ≥ 40 chars naming the KIND of thinking (no *hard/easy/difficult*);
   `answers` for every part; `scoring.expectedElements` + `scoringGuide.{E,P,I}`;
   `hypothetical: true` if the stem has numbers; a `skill` code from the CED (`1.A`–`4.E`).
   Optional: a second row `aps-{topic}-d2-1` with `role: reinforcement`.
2. **Lesson YAML** — copy `lessons/1.6.yaml` to `lessons/{topic}.yaml`. Keep `topic` = the
   OLD topic key from `data/lesson-schedule.json`; put the NEW CED label in `ced2026`.
   `worksheet` = the follow-along filename (printed as link + QR on the board slide).
   `visuals` carry data + labels only (`pgfplot_hist`, `dotplot`, `boxplot`, `two_way_table`,
   `scatter`, `raw_tikz`).
3. **Delete the topic's row from `PENDING.md`.**
4. **Build + compile**: `powershell -NoProfile -File dok/compile.ps1 {topic}` (or
   `bash dok/compile.sh {topic}`). PDFs land in `pdf/`; `manifest.json` updates for `index.html`.
5. **Check pages**: student 2, board 1, teacher ≤ 3 (`grep "pages" tex/aps_{topic}_*.log`).
   Tune `space:` in the YAML if part (c) needs more room.
6. `npm test -- tests/dok-` and `python -m pytest tests/test_dok_build.py -q`, then commit
   the YAML, the registry line, `PENDING.md`, `manifest.json`, and the three PDFs.

Calibration anchors per NEW unit live in `calibration/unit{n}.json` — read the unit's
`dok3_anchors` and `not_dok3` before writing part (c).

## Files

| Path | What |
|---|---|
| `registry.jsonl` | item bank, one JSON object per line, ids unique |
| `lessons/{topic}.yaml` | one per dated lesson day |
| `calibration/unit{n}.json` | what DOK-2 / DOK-3 look like in this unit |
| `build_ladder.py` | YAML + registry → `tex/aps_{topic}_{student,board,teacher}.tex`; `--validate`; `--all` |
| `tex/preamble.sty` | copied from Lesson_planning (A2) + ladder macros at the end; edit here only |
| `compile.ps1` / `compile.sh` | pdflatex × 2 per edition → `pdf/` |
| `pdf/` | committed PDFs — GitHub Pages serves them, so `index.html` opens the board slide on the projector |
| `index.html` + `manifest.json` | the teacher's morning tab: today's row, board + key links |
| `PENDING.md` | dated days without a ladder yet; the coverage test reads it |

## Where the DOK-3 comes from on a mechanics-only day

Never "the mechanic, harder." The judgment around it: which display / summary / procedure /
conclusion is warranted, and what the alternative would mislead a reader into. Pattern:
**choose / critique / bound.** Examples for 1.1 and 1.3 are in the spec §1.3.
