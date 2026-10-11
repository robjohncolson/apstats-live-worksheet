# SCHOOLOGY_BEST_WINS_SPEC.md — the daily Schoology sync never lowers a grade the teacher entered by hand

**Teacher decision 2026-09-11:** some students submit evidence directly in Schoology (e.g. screenshots of Blooket
results). The teacher wants to **type those grades straight into Schoology without going through the app**, and
"when the grade sync happens, if the script finds a higher grade in place, that should be honored." Also: the
flashcard gate is the teacher's to override — a hand-entered Schoology grade IS that override for Schoology purposes.

## 1. Today's behaviour (the bug)

`tools/schoology_sync_section.py::_push_grades` → `lib.compute_sync_actions(targets, last_synced_map)` decides
push/skip by comparing the target against **the sync's own `last_synced` state store only**. It never reads the value
currently in the Schoology cell. So a teacher-typed 100 in a cell the sync last wrote as 40 (or never wrote) gets
**overwritten** on the next 16:30/16:45 run by whatever the app computes. `write_grade_to_cell` (`schoology_ops.py`)
backspace-clears the existing value before typing, so the loss is silent.

## 2. The rule: best wins, per cell

Before every non-dry-run write in `_push_grades`:

1. **Read the current cell value** — new `ops.read_grade_from_cell(cdp, column_key, row_index) -> float | None`
   using the same `find_cell_selector` the writer uses; parse the input's current value (`''`/`—`/non-numeric → None).
   Pure DOM read, no focus/typing.
2. Decide:
   - `existing is None` → push (first write), as today.
   - `existing >= target` (float compare, tol 1e-9) → **KEEP**: do not write; `state.set_last_synced(student, key,
     existing)` so tomorrow's run treats it as synced and does not re-evaluate; count it in a new `kept` bucket and
     log `[KEEP] student=… key=… existing=X >= target=Y`.
   - `existing < target` → push, as today (the app raised the grade; the teacher's number was lower or stale).
3. `dry_run` prints `[DRY-RUN] WOULD KEEP …` / `WOULD PUSH …` with both numbers, so the teacher's daily dry-run log
   shows exactly which hand-entered cells are being honoured.
4. The run summary (`state.log_run`) gains `grades_kept`.

This makes the sync **monotone at the Schoology cell**: a value only ever goes up, whether the teacher or the app put it
there. It matches the app's own "grades only go up" rule (`EXIT_TICKET_BONUS_SPEC.md`, AI grading only raises).

## 3. Interaction with the app / gates

- The app's ledger is NOT written back from Schoology (one-way, unchanged). A hand-entered 100 lives in Schoology only;
  the Desk / in-app gradebook still show the app's number. Say this plainly in the sync's `--help` and in
  `tools/README` (or the sync's header comment): "Schoology = max(app, hand-entered); the app never learns about
  hand entries."
- The flashcard/Blooket gate is app-side (`_isLessonComplete`, advancement) and untouched. If the teacher wants the
  Desk to also unlock for that student, the existing teacher override (`/teacher/lesson-unlock`) is the tool — mention
  it in the same README paragraph; do not build anything new for it.
- Component columns (FA / Quiz / Blooket per lesson, PC, Poster) are all cells → the rule applies uniformly.

## 4. Tests (pytest, no live writes)

- `tests/test_schoology_best_wins.py`: with a fake `ops` whose `read_grade_from_cell` returns (None, 95, 100, 40) and
  target 92 → push / KEEP / KEEP / push; `set_last_synced` receives `existing` on KEEP and `target` on push;
  `grades_kept` counted; dry-run prints WOULD KEEP / WOULD PUSH with both values; a non-numeric cell reads as None.
- `read_grade_from_cell` unit test against a captured cell DOM fixture (there are DOM fixtures in
  `tests/test_schoology_ops.py` — reuse their pattern); parses `"92"`, `"92.5"`, `""`, `"—"`.
- Idempotence: a second run after a KEEP is a skip (no read needed because last_synced == existing).
- Existing `tests/test_schoology_sync_section.py` / `test_schoology_ops.py` stay green; `sync_section`'s signature
  and the scheduled task command line (`tools/daily_schoology_sync.ps1`) are unchanged.

## 5. Out of scope

No two-way sync, no reading Schoology into the ledger, no change to what the app computes, no UI.
