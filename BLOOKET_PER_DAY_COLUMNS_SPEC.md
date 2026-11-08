# Blooket per-day columns in Schoology (spec, 2026-11-08)

**Decision (teacher, 2026-11-08):** a per-day flashcard group gets ONE Schoology Blooket column PER DAY, the
same slots the grade engine counts. Every other worksheet group keeps its one group column. Old keys (`4.7`)
are storage ids. Students only ever see CED titles.

## 1. Which groups, and the deadline

A group is per-day when it has two or more topics, its deck CSV is in `data/blooket-deck-slices.json`, and its
earliest zero date for the section (class day + 13) is on or after `BLOOKET_PER_DAY_FROM` = 2026-11-13
(`roster-server/lesson-grade.js perDayDeckGroups`). With today's schedule that gives **B and E: `4|7-8`
(2.8-2.9) and `4|10-12` (2.10)**. `4|1-2` and `4|3-4-5` zero before 11/13, so they keep one score.

Today `component_columns` makes ONE `BL:<group>` column, dated by the group's earliest class day. The sync
creates it on that day (`filter_scope_through`: `due_date <= today`) and files it by `filing_date` (zero date + 1):

| Section / group | Group column today | First zero in it today |
|---|---|---|
| B 4.7-8 | **already exists**: `2.8-2.9 Blooket`, id 8641235937, MP2 (1173889), created on 11/06 | Fri 11/20 (4.7 zero date 11/19) |
| E 4.7-8 | would be created **Mon 11/09** (16:45 run) | Mon 11/23 |
| E 4.10-12 | would be created **Fri 11/13** | Fri 11/27 |
| B 4.10-12 | would be created **Mon 11/16** | Mon 11/30 |

**Correction:** the flashcard slices spec (§11) says B's 4.7-8 column never zeroes. That was true before
39cbb6ea. Under the quarter line by zero date, B 4.7 (zero date 11/19) is a regular Q2 lesson, so `/class/grades`
gives it `zeroDate.B = 2026-11-19`, and `group_zero_due` would zero B's group column from the **Fri 11/20 B run**.

**Deadline:** land the change before the Mon 11/09 16:30 run. That stops E's group column from being created.
If the change is not reviewed by then, do NOT land it in a rush before the Wed 11/11 final Q1 sync. Land it on
Thu 11/12. E's `2.8-2.9 Blooket` is then retired like B's (§5). Hard stop: Thu 11/19, before B's first zero.

## 2. Titles (only from `scripts/build-ced-column-titles.mjs`)

Per-day key = `BL:<topic>`. A topic inside a combined group never matches a group label, so the key cannot
collide. The builder adds one entry per topic of every group that is per-day in either section. It finds them
with the engine's own `perDayDeckGroups` + `blooketPerDayFrom`, and names them with the same `cedPrefix([topic])`
path the per-topic Quiz titles use. Set `schoologyColumn: true` and `old` = `ced`: these columns are new, so the
rename tool and `unrenamed_old_titles` skip them. The build already fails on a duplicate, a non-ASCII title or a
title containing ", ". `lib/ced-label.js cedColumnTitle('blooket', key)` returns the same strings (checked):

| Key | Title | Key | Title |
|---|---|---|---|
| `BL:4.7` | `2.8 Blooket` | `BL:4.10` | `2.10 Day 1 Blooket` |
| `BL:4.8` | `2.9 Blooket` | `BL:4.11` | `2.10 Day 2 Blooket` |
| | | `BL:4.12` | `Beyond the Exam: Geometric distribution Blooket` (no class day, so never created) |

**Settled (implementation 2026-11-08):** each per-day entry carries `"perDayDeck": true` (and a matching line in
the file's `rules`). The builder imports `perDayDeckGroups`, `blooketPerDayFrom` and `PHASE3_CONFIG` from
`roster-server/` (read-only) and reads `data/blooket-deck-slices.json`. The group entries (`BL:4.7-8`,
`BL:4.10-12`) stay in the file, because B's retired column still exists. `lib/ced-label.js` needed no change: the
builder's cross-check and `lib/ced-label.test.js` agree on all five. The old-title mode (`ced=False`) still prints
`4.7 Blooket` from `bl_title`. That mode cannot run live: `rename_gate` refuses it once the rename is done. So
`test_old_titles_are_todays_live_titles` skips the `perDayDeck` entries instead.

## 3. Value of Day N's column (mirrors the engine)

Day N's cell = that topic's `/class/grades` row `blooket`. That is the engine's own value:
max(game score, best whole-deck `DESK_DONE`, best `DESK_DAY` of THAT day). The game score and `DESK_DONE` are
shared across the group, so a whole-deck or game score fills every day column. A day-slice score fills only its
own day. No 80% mark: the point-for-point score is the cell.
- **Day not yet due** (between its class day and its zero date): the column shows the day's own score if it has
  one. It is blank otherwise, never 0. The engine counts the not-yet-due days as one shared slot worth their best.
  Schoology shows each day's own score instead, because a shared best written into one cell could later stand
  above that day's own score, and best-wins would freeze it there. This differs from the engine only for a student
  who played two slices, at different scores, before both were due. It ends at that day's zero date.
- 4.12 has no class day: no column. It is also outside the engine's required Blooket set, so it never counts.

**Settled (implementation 2026-11-08): the doc does tell a day's own score apart.** In a per-day group the row's
`blooket` is max(game, `DESK_DONE`, THAT day's `DESK_DAY`) (`lesson-grade.js shareBlooketAcrossWorksheetGroups`
copies the game and whole-deck bests to every day, but never another day's `DESK_DAY`). The engine's "shared
slot worth the best" is formed later, in the quarter track, and never reaches the row. So the rule implemented is
the one above: Day N's cell = its own row's `blooket` when present. Otherwise it is 0 once that row's zero date
has passed (and zeros are on), and blank before that. A game or whole-deck score fills every day early. That is
safe for best-wins, because the same score stays inside each day's own engine value after the day is due. The
fallback rule (write nothing before the day is due) was not needed.

## 4. Zero date per column

Each day column uses ITS OWN row: zero from the run after `zeroDate[period]` (B 4.7 11/20, B 4.8 11/23,
B 4.10 11/30, B 4.11 12/01; E 4.7 and 4.8 11/23; E 4.10 and 4.11 11/27). Each column has its own `due_date`
(class day), `filing_date` (+14) and `lesson_quarter`. All of them are Q2 (MP2). They are no longer decided by
`group_deciders`. Best-wins stays as it is: a 0 is replaced when work lands, and a higher hand entry is kept.
The zero comment names the day: "Not a permanent 0. Missing: 2.10 Day 2 flashcards ..."
(`lesson_label_for_comment`).

## 5. Existing group columns, and the fixture builder

- `tools/.schoology-sync-state.json` has exactly one affected group column: **PeriodB/BL:4.7-8
  `2.8-2.9 Blooket`, id 8641235937, MP2**. E 4.7-8, E 4.10-12 and B 4.10-12 have none yet.
- Once the change lands, the column is out of B's scope, so the sync never writes it again. Its state row stays
  as history. The column must not keep counting next to the day cells, because the nightly official override
  reads Schoology's MP2 work calc. After the first LIVE run shows `2.8 Blooket` / `2.9 Blooket`, the teacher
  checks the column by hand: any cell higher than both of that student's day cells was hand-entered and is copied
  into the Day 1 cell first (never lower). Then the teacher deletes the column in Schoology. No tool deletes it.
- **The fixture builder changes.** `component_grades_from_class_doc` now emits `BL:4.7`/`BL:4.8` (no
  `BL:4.7-8`) for a per-day group. `build_schoology_fixture.py` loads the slices file, passes it on, and
  `--inspect` prints each section's per-day groups (`"per_day_blooket_groups": {"PeriodB": ["4.10-12", "4.7-8"], ...}`).
- **Settled:** `deck_slices=None` means "the engine's file" in `component_columns`, `component_grades_from_class_doc`,
  `component_comments_from_class_doc` and `build_component_scope`, so no caller can disagree by forgetting it.
  `{}` turns per-day groups off; the tests use it to show that Quarter 1 is byte-identical. A missing slices file
  raises, and nothing falls back to the group column. `per_day_groups` returns group labels (`4.7-8`), not the
  engine's `4|7-8`. It uses the constant `BLOOKET_PER_DAY_FROM` and never the doc's config, so the columns (built
  from the schedule) and the grades (built from the doc) can never use different cutoffs.

## 6. Files, tests, rollout, risk

**Files:**
- `tools/schoology_components.py`: `BLOOKET_PER_DAY_FROM` mirror, `load_deck_slices`, `per_day_groups(lessons,
  period, slices)` (one helper for schedule entries and doc rows), plus `component_columns`, the producer and
  the comments.
- `tools/build_schoology_fixture.py` and `tools/schoology_sync_section.py` (`build_component_scope` passes the
  slices; the plan logic is unchanged).
- `scripts/build-ced-column-titles.mjs`, then regenerate `data/ced-column-titles.json`.
- Follow-on in a separate push: `roster-server/gradebook-grid.js` (the 1:1 in-app grid; display only; auto-deploys,
  so never during a B or E block).
- `tools/schoology_ops.py` is not touched.

**Tests:**
- `test_schoology_components.py`: the per-day set from the real schedule is {4|7-8, 4|10-12} for B and E, 4|1-2
  and 4|3-4-5 are excluded, and the constant equals the one parsed from `grade-config.js`. The columns and titles
  are the ones in §2, with each column's own due and filing dates, and `BL:4.12` absent. Day values: 60 and 95
  stay apart; a shared score fills both days; a not-yet-due day is blank; B 4.7 is 0 on 11/20 while 4.8 stays
  blank; the comment names the day. The Q1 pass output is byte-identical on a fixed doc.
- `test_build_schoology_fixture.py`: the keys and the `--inspect` output.
- `test_schoology_sync_section.py` (fakes): B never writes 8641235937; it creates `2.9 Blooket` only on 11/09+;
  E never creates `2.8-2.9 Blooket`; a higher hand cell is kept.
- `test_schoology_ced_titles.py` and `lib/ced-label.test.js`: the new entries; the builder's `--check`;
  `npm run test:quick`.

**Rollout:**
0. Timing note (2026-11-08): `daily_schoology_sync.ps1` has no weekend skip. If the Sunday 11/08 16:30 run uses
   this tree, B creates `2.8 Blooket` (MP2) that day, not Monday. E creates no Blooket column before 11/09.
1. Dry run per section, outside 16:00-17:05: fixture `--inspect`, then the sync without `--apply`.
2. Inspect: the plan creates only day columns, all in MP2; there are no MP1 changes; for every student, the higher of the
   two day targets is at least B's last-synced `BL:4.7-8` value.
3. Land it in the working tree. The LIVE tasks run the working tree, so the next daily run creates the columns.
4. Retire B's group column (§5).

**Risk: MEDIUM.** There is no deploy step and no review gate between the working tree and the 16:30/16:45 LIVE
runs. A wrong key or title creates duplicate columns in both courses, and they have to be cleaned up by hand.
The guards: the sync matches columns by exact title, and `ced_column_title` raises on a missing key, so it fails
closed. Q1 (Wed 11/11 final sync) must stay byte-identical, and the test pins that. Never-lower rests on the
existing best-wins. The day columns weight a per-day group by its days, the same as the engine's Blooket mean.
