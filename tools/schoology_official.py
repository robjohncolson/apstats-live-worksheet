"""Official quarter grade -> Schoology marking-period override (OFFICIAL_GRADE_SYNC_SPEC.md).

The teacher's rule (2026-10-01/02), per student, for one marking period:

    work   = Schoology's own calculated grade (work categories only)
    line   = work + banked bonus-sheet points + early-finish bonus
    base   = max(work, PC)  if line >= 40 and a Progress Check score is on file
           = work           otherwise
    official = min(100, base + early-finish bonus), one decimal

QUARTER PASSES (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4, teacher 2026-11-07):
  --quarter Q1|Q2  the pass's quarter. Before Calc or the override is read, the gradebook is
                   switched to that quarter's marking period (the Nth MP in calendar order) and
                   VERIFIED; if it cannot be, nothing is read or written (exit 3).
  Not started      before a quarter's first day (/class/grades config.quarters.<Q>.start) its
                   pass writes and publishes nothing and exits 0: the engine has no grade for
                   it yet (Sun 11/08: Quarter 2 starts Mon 11/09). A write goes by the real
                   school date; a dry run can preview a later day with --today.
  Never lower      once a quarter has ended (Quarter 1: from Sat 2026-11-07), a write that
                   would LOWER the override is skipped and logged ("KEEP"); the Desk is sent
                   the higher number Schoology keeps.
  Close            a quarter's pass stops the day after its close date (/class/grades
                   config.quarters.<Q>.close, else --close) and once its final is written.
  --final Q1       once, the morning after the close date (tools/close_quarter.py runs it
                   after POST /class/quarter/close + apply-bonus, Fri 11/13 before school):
                   final override = max(closedGrade incl. the applied bonus, current override),
                   recorded per student in tools/.schoology-sync-logs/official-final-state.json
                   so it is written exactly once.
  PC from Day 2    a Progress Check counts only once its Day 2 has ended (decision 5).
  --today DATE     previews only: the Day 2 rule, the close, the start and never-lower use this
                   date. --apply with --today is refused: a write always uses the real date.

SAFETY (review fixes, 2026-11-08):
  Unreadable       a grade is a NUMBER only when its cell's grade display shows one (a scale
                   label "A" beside "92" is ignored). The editor input is never read as a
                   grade: an unsaved or stale value there proves nothing. Empty = a blank
                   display ('N/A' for the calc only) with no label and an empty input. Anything
                   else is FAILED-TO-READ: nothing is written for that student; the run exits 1.
  Fresh re-read    right before the run acts on a student, the row is read again: before a
                   write, and before a number Schoology already holds (or a higher one it
                   keeps) is published or recorded. So every student --final has not
                   recorded yet is read again before its final is written or recorded, one
                   whose batch read already matched included (finding R8). Never lower and
                   the final's max use that fresh override, and a changed work grade is
                   recomputed: an override entered while the run was going is never written
                   over by a lower number, and the Desk and the final record get what
                   Schoology holds then. A fresh read that fails is FAILED-TO-READ: that
                   student is not written, published or recorded; exit 1 (the next run reads
                   it again).
  Save confirmed   a write counts only once the override's display shows the written number
                   (read again for up to 8 s). Otherwise it is FAILED and the run exits 1: the
                   nightly pass retries it the next night, and --final does not record the
                   student, so the next --final --apply reads it again and retries.
  The view         after the marking-period switch the grid must change and settle; the
                   columns the sync state files in another marking period must not be on it;
                   and before EACH fresh re-read (so before each write) the filter and header
                   must still show the pass's period (a reload reopens the default one).
                   Otherwise: [ABORT], exit 3.
  No rows          a gradebook view with no student rows stops the run (SystemExit).
  Rig lock         every run that touches Schoology holds tools/.schoology-sync-logs/rig.lock
                   (a step of the daily job inherits its lock). A manual run, dry runs
                   included, never starts from 16:00 to 17:05 (exit 3), and one already going
                   stops cleanly once 16:00 comes: a write run before the next student it
                   reads again, a dry run before its table. Only the daily job's own steps
                   run in that window.
  --final publish  each student's final is recorded as written, then as published; a failed
                   Desk publish exits 1 and the next --final --apply re-publishes it without
                   writing Schoology again.

Exit codes: 0 done (also a pass whose quarter has closed or has not started yet); 1 a write,
a read, a save confirmation or the Desk publish failed; 2 refused (arguments, not closed, no
student matched a Schoology row); 3 the view could not be proven, or the LIVE window
(16:00-17:05) stopped the run, at its start or mid-run (nothing further written); 5 the rig
is busy.

Dry run by default: prints the table, writes nothing (only the local
tools/.official-grade-pending.json is rewritten).
  python tools/schoology_official.py --section PeriodB --quarter Q1                    # dry run
  python tools/schoology_official.py --section PeriodB --quarter Q2 --today 2026-11-09  # dry run, as of Monday
  python tools/schoology_official.py --section PeriodB --final Q1                      # dry run of the final
  python tools/schoology_official.py --section PeriodB --quarter Q1 --apply            # writes (never lower)
  python tools/schoology_official.py --section PeriodB --final Q1 --apply              # once, after the close
READ-ONLY on the rig (CMD 7): the three dry runs above, for PeriodB and PeriodE, before 16:00
or after 17:05 (the tool refuses 16:00-17:05; the LIVE tasks run 16:25-17:05). Each switches
the gradebook view (a filter, not a write). Before Mon 11/09 a Quarter 2 dry run needs
--today 2026-11-09; without it the pass prints "[Quarter 2] starts 2026-11-09" and stops.
The --final --apply normally runs from tools/close_quarter.py (Fri 11/13, early morning).

Students with no Schoology row are kept in a pending log (tools/.official-grade-pending.json)
so their grade can be written once they are added to the course.
The roster secret comes from ROSTER_TEACHER_SECRET or roster-server/.env, never the CLI.
ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
import schoology_components as components  # noqa: E402
import schoology_sync_lib as lib  # noqa: E402

ROSTER_BASE = "https://roster-production-12c1.up.railway.app"
PENDING_PATH = os.path.join(SCRIPT_DIR, ".official-grade-pending.json")
# Written ONLY by --final: {section: {quarter: {at, done, students: {studentId: {final, action, at}}}}}.
# Kept in the gitignored logs folder: it holds student ids and grades (this repo is public).
FINAL_STATE_PATH = os.path.join(SCRIPT_DIR, ".schoology-sync-logs", "official-final-state.json")
# The sync's assignment registry (read only here): rows carry title + grading_period_id.
SYNC_STATE_PATH = os.path.join(SCRIPT_DIR, ".schoology-sync-state.json")

# READ_ROWS_JS returns this for a calc or override it could not read (finding A1).
UNREADABLE = "unreadable"


def is_unreadable(value) -> bool:
    return isinstance(value, str) and value == UNREADABLE

GRADE_FLOOR = 40.0
# Bonus sheets: stored points E 5 / P 3 / I 1, counted x1.5 (teacher 2026-10-03, retroactive).
# Mirrors roster-server/grade-config.js BONUS_MULTIPLIER -- pinned equal by a test.
BONUS_MULTIPLIER = 1.5
# Schoology "calculate by percent" category weights (both SY26-27 sections).
# Work 50 x lessons 30 / quizzes 30 / posters 30 / blooket 10
# (POSTER_WORK_TRACK_SPEC.md, 2026-10-20): posters are a Work category again,
# filled from the POSTER-U# ledger row (90-115). A missing poster cell is absent,
# not zero: work_from_cells renormalises over the categories that have grades.
# Banked bonus sheets (DOK) stay bonus: BONUS_MULTIPLIER, not a category.
WORK_WEIGHTS = {"Lesson": 15, "Quizzes": 15, "Posters": 15, "Blooket": 5}


# --------------------------------------------------------------------------- #
# The rule (pure)                                                              #
# --------------------------------------------------------------------------- #

def official_grade(work, pc, banked_bonus=0, early_bonus=0) -> dict | None:
    """Apply the teacher's rule. Returns None when there is no work grade yet."""
    if work is None:
        return None
    banked = banked_bonus or 0
    early = early_bonus or 0
    line = work + banked + early
    pc_counts = pc is not None and line >= GRADE_FLOOR
    base = max(work, pc) if pc_counts else work
    official = round(min(100.0, base + early), 1)
    if pc_counts and pc > work:
        rule = "PC"
    elif pc is not None and not pc_counts:
        rule = "work (under 40)"
    else:
        rule = "work"
    return {"official": official, "base": round(base, 2), "line": round(line, 2), "rule": rule}


def column_category(title: str) -> str | None:
    """Schoology category of one of our synced columns, from its title."""
    if title.endswith("Follow-Along"):
        return "Lesson"
    if title.endswith("Quiz"):
        return "Quizzes"
    if title.endswith("Blooket"):
        return "Blooket"
    if "Poster" in title:
        return "Posters"
    if "Progress Check" in title:
        return "Progress Check"
    return None


def work_from_cells(cells: dict) -> float | None:
    """Schoology's category math over the work categories only (Progress Check left out).

    cells: {column title: score or None}. Each category = mean of its graded cells;
    categories are weighted and renormalised over the ones that have grades.
    """
    by_cat: dict[str, list[float]] = {}
    for title, value in cells.items():
        cat = column_category(title)
        if cat in WORK_WEIGHTS and value is not None:
            by_cat.setdefault(cat, []).append(float(value))
    weight_sum = sum(WORK_WEIGHTS[c] for c in by_cat)
    if not weight_sum:
        return None
    total = sum(WORK_WEIGHTS[c] * (sum(v) / len(v)) for c, v in by_cat.items())
    return round(total / weight_sum, 2)


def has_pc_column(cells: dict) -> bool:
    return any(column_category(t) == "Progress Check" for t in cells)


def work_grade(calc, cells: dict):
    """Schoology's Calc. is the work grade until a Progress Check column exists (it then counts PC at 50%)."""
    if has_pc_column(cells):
        return work_from_cells(cells)
    return calc


def pc_day2_dates(schedule: dict, period: str) -> dict:
    """{unit: the PC's Day 2 for the period (Day 1 when there is no Day 2)}, from lesson-schedule.json."""
    out = {}
    for key, entry in ((schedule or {}).get("progressChecks") or {}).items():
        entry = entry or {}
        try:
            unit = int(str(entry.get("unit") or key).lstrip("Uu"))
        except ValueError:
            continue
        day1 = (entry.get("periods") or {}).get(period)
        day2 = entry.get("adminDay2")
        day2 = day2.get(period) if isinstance(day2, dict) else day2
        out[unit] = day2 or day1
    return out


def _pc_counts(unit, pc_day2: dict | None, today: str | None) -> bool:
    """True once the unit's PC Day 2 has ended (engine pcDueFor: Day 2 < today).

    No dates at all (legacy callers, an unscheduled unit): it counts, as before.
    """
    if pc_day2 is None or not today:
        return True
    try:
        day2 = pc_day2.get(int(str(unit).lstrip("Uu")))
    except ValueError:
        return True
    if not day2:
        return True
    return day2 < today


def pc_for_quarter(student: dict, quarter: str, pc_day2: dict | None = None, today: str | None = None):
    """Mean Progress Check % over the quarter's PC units that have a score on file.

    pc_day2 + today (teacher 2026-11-07, decision 5): a PC counts only once its Day 2 has
    ended, so U2 Part A already on file does not lift the Quarter 2 override before the
    Progress Check is given. Without them every unit on file counts (legacy).
    """
    q = (student.get("quarters") or {}).get(quarter) or {}
    units = q.get("pcUnits") or []
    scores = []
    for u in units:
        if not _pc_counts(u, pc_day2, today):
            continue
        raw = ((student.get("units") or {}).get("U%s" % u) or {}).get("pcRawPct")
        if isinstance(raw, (int, float)):
            scores.append(float(raw))
    return round(sum(scores) / len(scores), 1) if scores else None


# --------------------------------------------------------------------------- #
# Roster server                                                                #
# --------------------------------------------------------------------------- #

def roster_secret() -> str:
    """roster-server/.env first: it holds the long legacy secret. The Windows user
    environment holds the shared teacher key, which every teacher-gated route (including
    GET /ledger/student since 2026-10-25) also accepts."""
    env_path = os.path.join(REPO_ROOT, "roster-server", ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            m = re.search(r"^ROSTER_TEACHER_SECRET\s*=\s*(.+?)\s*$", fh.read(), re.M)
        if m:
            return m.group(1).strip("'\"")
    secret = os.environ.get("ROSTER_TEACHER_SECRET")
    if not secret:
        raise SystemExit("ROSTER_TEACHER_SECRET not found")
    return secret


def roster_get(path: str, secret: str):
    req = Request(ROSTER_BASE + path, headers={"x-teacher-secret": secret})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_official_grades(quarter: str, items: list[dict], secret: str) -> tuple[bool, str]:
    """Publish the official grades to roster-server for the Desk (OFFICIAL_GRADE_SYNC_SPEC.md 4.3).

    Returns (ok, one-line status). ok is False for any failed request, so --final can
    publish again on its next run (finding A7); nothing to publish is ok.
    """
    grades = []
    for it in items:
        res = it.get("result")
        if not res or not it.get("studentId"):
            continue
        grades.append({"studentId": it["studentId"], "official": res["official"], "work": it.get("work"),
                       "pc": it.get("pc"), "base": res["base"], "line": res["line"],
                       "earlyBonus": it.get("early"), "bankedBonus": it.get("banked"), "rule": res["rule"]})
    if not grades:
        return True, "nothing to publish"
    body = json.dumps({"quarter": quarter, "asOf": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "grades": grades})
    req = Request(ROSTER_BASE + "/class/official-grades", data=body.encode("utf-8"), method="POST",
                  headers={"x-teacher-secret": secret, "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=60) as resp:
            doc = json.loads(resp.read().decode("utf-8"))
    except HTTPError as err:
        if err.code == 503:
            return False, "Desk publish skipped: run roster-server migration 0038 first"
        if err.code == 404:
            return False, "Desk publish skipped: roster-server not deployed with /class/official-grades yet"
        return False, "Desk publish FAILED: HTTP %s" % err.code
    except (URLError, OSError, ValueError) as err:
        return False, "Desk publish FAILED: %s" % type(err).__name__
    if isinstance(doc, dict) and doc.get("ok") is False:
        return False, "Desk publish FAILED: the server answered ok=false"
    return True, "published %s official grades to the Desk" % (doc or {}).get("saved")


# A legacy banked poster row (pre-conversion, POSTER_WORK_TRACK_SPEC.md 1.6). It is
# never bonus: the poster already counts in Work through the Posters category.
_BONUS_POSTER_ITEM = re.compile(r"^BONUS-POSTER-U\d+$", re.IGNORECASE)


def banked_bonus_points(student_id: str, quarter: str, secret: str) -> float:
    """Banked bonus-sheet (DOK) points for the quarter (stored E 5 / P 3 / I 1, x BONUS_MULTIPLIER).

    BONUS-POSTER-U# rows are skipped so a poster never counts twice while the
    conversion to POSTER-U# rows has not run yet. Mirrors the engine's bankedBonus
    (roster-server/class.js, finding A8): a row counts only for the quarter its response
    names, and only with a stored score of 1, 3 or 5. A row without a quarter counts in
    no quarter (it used to count in every quarter, so in both nightly passes).
    """
    doc = roster_get("/ledger/student/%s?prefix=BONUS-" % student_id, secret)
    rows = doc.get("rows") or doc.get("ledger") or doc.get("items") or []
    points = 0.0
    for row in rows:
        if row.get("source") != "bonus":
            continue
        if _BONUS_POSTER_ITEM.match(str(row.get("itemId") or row.get("item_id") or "")):
            continue
        try:
            meta = json.loads(row.get("response") or "{}")
        except (TypeError, ValueError):
            meta = {}
        if not isinstance(meta, dict) or meta.get("quarter") != quarter:
            continue
        stored = _number(row.get("score"))
        if stored not in (1.0, 3.0, 5.0):
            continue
        points += stored
    return points * BONUS_MULTIPLIER


# --------------------------------------------------------------------------- #
# Schoology                                                                    #
# --------------------------------------------------------------------------- #

# Finding R1 (Codex re-review): a grade is a NUMBER only when the cell's
# .grader-grid-grade-display shows one. The editor input (input.grader-edit-input) is never
# read as a grade: it can hold an unsaved or stale value. Codex: a label "A" beside an empty
# display, with 70 left in the editor, read as 70, and a lower 80 was written over the
# saved grade. Finding A1 still holds: the display is read, never the whole cell, so a
# grade-scale label "A" beside "92" is ignored. Each calc / override comes back as:
#   a number       the display shows a plain number (an optional trailing %; NBSP is fine);
#   null           verifiably empty: the display is blank ('N/A' counts as blank for the
#                  calc only, which Schoology shows for an MP with no grades), the scale
#                  label is '' AND the input is '';
#   'unreadable'   anything else: no cell or no display, a label without a number, text,
#                  or a blank display beside a non-empty input.
# readRows(null) reads every row (READ_ROWS_JS); readRows('<y>') reads one row (read_row_js,
# finding R2). Both run this same code, so both give the same three states.
_READER_JS = r"""
  function plainNumber(text) {
    var t = String(text || '').replace(/\u00a0/g, ' ').trim();
    return /^-?[0-9]+([.][0-9]+)?[ ]*%?$/.test(t) ? parseFloat(t) : null;
  }
  function grade(id, naIsBlank) {
    var cell = document.querySelector(id);
    var display = cell ? cell.querySelector('.grader-grid-grade-display') : null;
    if (!display) return 'unreadable';
    var shown = (display.textContent || '').trim();
    var scale = cell.querySelector('.grader-grid-grade-scale');
    var label = scale ? (scale.textContent || '').trim() : '';
    var input = cell.querySelector('input.grader-edit-input');
    var typed = input ? String(input.value || '').trim() : '';
    var blank = shown === '' || (naIsBlank && shown === 'N/A');
    if (blank) return (label === '' && typed === '') ? null : 'unreadable';
    var n = plainNumber(shown);
    return n === null ? 'unreadable' : n;
  }
  function readRows(onlyRow) {
    var selector = onlyRow === null ? '[role="gridcell"][data-y]'
                                    : '[role="gridcell"][data-y="' + onlyRow + '"]';
    var cells = {};
    document.querySelectorAll(selector).forEach(function(c){
      var y = c.getAttribute('data-y');
      cells[y] = cells[y] || {};
      var parts = (c.getAttribute('aria-label') || '').split(', ');
      if (parts.length < 2) return;
      var m = (parts[2] || '').match(/^(-?[0-9.]+) out of/);
      cells[y][parts[1]] = m ? Number(m[1]) : null;
    });
    var out = {};
    Object.keys(cells).forEach(function(y){
      out[y] = {cells: cells[y],
                calc: grade('#grader-grid-cell-gp-' + y, true),
                override: grade('#grader-grid-cell-gp_override-' + y, false)};
    });
    return JSON.stringify(out);
  }
"""
READ_ROWS_JS = "(function(){" + _READER_JS + "  return readRows(null);\n})()"


def read_row_js(row) -> str:
    """The reader for ONE gradebook row (its data-y): READ_ROWS_JS's own code (finding R2)."""
    return "(function(){" + _READER_JS + "  return readRows(%s);\n})()" % json.dumps(str(int(row)))


def _reading(value):
    """One calc / override from the reader: a finite number, None (verified empty) or UNREADABLE.

    Anything else (a missing key, text, true/false) is UNREADABLE, never an empty cell.
    """
    if value is None or _is_finite_number(value):
        return value
    return UNREADABLE


def _row_reading(found) -> dict:
    """{cells, calc, override} from one row of the reader's JSON. A row the reader did not
    return is UNREADABLE, never empty (finding A1)."""
    if not isinstance(found, dict):
        return {"cells": {}, "calc": UNREADABLE, "override": UNREADABLE}
    cells = found.get("cells")
    return {"cells": cells if isinstance(cells, dict) else {},
            "calc": _reading(found.get("calc", UNREADABLE)),
            "override": _reading(found.get("override", UNREADABLE))}


def read_row(cdp, row) -> dict:
    """{cells, calc, override} of ONE gradebook row, read now (finding R2, Codex re-review).

    Read right before each write, and after it for the save check (confirm_saved): never
    lower and the final's max must use what Schoology holds at that moment, not the batch
    read from minutes earlier. A row that is not on the page, or a failed read, is UNREADABLE.
    """
    raw = cdp.eval_js(read_row_js(row))
    try:
        rows = json.loads(raw) if isinstance(raw, str) else None
    except ValueError:
        rows = None
    if not isinstance(rows, dict):
        return _row_reading(None)
    return _row_reading(rows.get(str(row)))


def read_gradebook(ops, cdp, course_id: str, view: dict | None = None,
                   titles: tuple | None = None) -> dict:
    """{schoologyUid: {row, calc, override, cells}} for every student row.

    view (a quarter pass, schoology_sync_lib.pass_view): the gradebook is switched to that
    marking period and VERIFIED first. lib.ViewNotVerified when it cannot be (nothing read).
    titles: (titles filed in this marking period, titles filed in another), from
    view_titles_from_state; the grid's columns must agree with them (finding A3).
    A student row the reader did not see is UNREADABLE, never empty (finding A1).
    """
    ops.navigate(cdp, ops.gradebook_url(course_id))
    students = []
    for _ in range(15):
        time.sleep(2)
        ops.inject_helpers(cdp)
        students = ops.list_students(cdp)
        if students:
            break
    if view is not None:
        result = ops.select_grading_period(cdp, view["grading_period_id"], view.get("mp_range")) or {}
        if not result.get("ok"):
            raise lib.ViewNotVerified(lib.view_error(view, result))
        students = ops.list_students(cdp) or students
    # Finding A2: no student rows is a failed read, never an empty marking period (that
    # published Desk-only numbers and let --final report done with nothing written).
    if not students:
        raise SystemExit("no student rows in the gradebook view")
    time.sleep(3)
    # A marking period with no columns yet (MP2 before the move) is an empty read, not a failure.
    if not ops.load_all_columns(cdp) and not _no_assignment_cells(cdp):
        raise SystemExit("Schoology gradebook columns did not finish loading")
    if view is not None and titles is not None:
        here, elsewhere = titles
        problem = ops.view_content_problem(cdp, view, here, elsewhere)
        if problem:
            raise lib.ViewNotVerified("the grid does not match %s: %s" % (lib.describe_view(view), problem))
    raw = cdp.eval_js(READ_ROWS_JS)
    rows = json.loads(raw) if isinstance(raw, str) else None
    if not isinstance(rows, dict):
        raise SystemExit("the gradebook rows could not be read")
    out = {}
    for s in students:
        out[str(s["studentId"])] = {"row": s["rowIndex"], **_row_reading(rows.get(str(s["rowIndex"])))}
    return out


def view_titles_from_state(section: str, grading_period_id, path: str | None = None) -> tuple:
    """(titles filed in this marking period, titles filed in another) for one section.

    From the sync state (tools/.schoology-sync-state.json, read only): its rows carry a
    grading_period_id once the sync created the column in a known marking period or the
    move tool moved it. Rows without one are left out, and so is a title that sits in
    both sets (finding A3). No state file: two empty sets (nothing to compare).
    """
    try:
        with open(path or SYNC_STATE_PATH, encoding="utf-8") as fh:
            state = json.load(fh)
    except (OSError, ValueError):
        return set(), set()
    here, elsewhere = set(), set()
    prefix = section + "/"
    for key, row in ((state or {}).get("assignments") or {}).items():
        if not str(key).startswith(prefix) or not isinstance(row, dict):
            continue
        title, period = row.get("title"), row.get("grading_period_id")
        if not title or not period:
            continue
        if str(period) == str(grading_period_id):
            here.add(title)
        else:
            elsewhere.add(title)
    both = here & elsewhere
    return here - both, elsewhere - both


_ASSIGNMENT_CELLS_JS = """document.querySelectorAll('[role="gridcell"][data-y="0"][aria-label]').length"""


def _no_assignment_cells(cdp) -> bool:
    """True only when the shown marking period has no assignment column at all."""
    count = cdp.eval_js(_ASSIGNMENT_CELLS_JS)
    return isinstance(count, (int, float)) and not isinstance(count, bool) and count == 0


def override_cell_center(raw) -> tuple[float, float] | None:
    """(x, y) from the JS that locates the override cell, or None when the cell was not found.

    EdgeCDP.eval_js returns None or {} when that JS throws (the row has no override cell
    in the DOM). Anything that is not a JSON list of two finite numbers counts as not found.
    """
    if not isinstance(raw, str):
        return None
    try:
        point = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(point, list) or len(point) != 2:
        return None
    for n in point:
        if not _is_finite_number(n):
            return None
    return point[0], point[1]


def _is_finite_number(n) -> bool:
    """A real, finite number: JSON true/false, NaN, Infinity and absurdly large ints are not."""
    if isinstance(n, bool) or not isinstance(n, (int, float)):
        return False
    try:
        return math.isfinite(float(n))
    except OverflowError:
        return False


# Finding R5 (Codex re-review): a write counts only once the override's DISPLAY shows the
# written number. ops.write_grade_to_cell takes the typed editor value as proof for an
# override cell, and a rejected save leaves that value in the editor, so a failed save
# was recorded as a written final. Read again right away, then every 0.5 s for 8 s.
CONFIRM_STEP_S = 0.5
CONFIRM_POLLS = 17


def write_official(ops, cdp, row: int, value: float) -> dict:
    """Open the override cell with a real click (its input stays hidden until then), type the
    value, then confirm the save from the cell's display (confirm_saved, finding R5).

    A row whose override cell is not on the page fails alone and writes nothing, so
    main() reports it and goes on (2026-10-24: one missing cell crashed the whole step
    and that section's official grades never reached the Desk).
    """
    js = ('(function(){var c=document.querySelector("#grader-grid-cell-gp_override-%s");'
          'c.scrollIntoView({block:"center",inline:"center"});var q=c.getBoundingClientRect();'
          'return JSON.stringify([q.x+q.width/2,q.y+q.height/2]);})()' % row)
    cdp.eval_js(js)
    time.sleep(0.4)
    point = override_cell_center(cdp.eval_js(js))
    if point is None:
        return {"ok": False, "error": "override cell for row %s not found" % row}
    x, y = point
    cdp.click(int(x), int(y))
    time.sleep(0.6)
    outcome = ops.write_override(cdp, row, value, gp=True) or {}
    if not outcome.get("ok"):
        return outcome
    return confirm_saved(cdp, row, value, outcome)


def confirm_saved(cdp, row: int, value: float, outcome: dict) -> dict:
    """outcome with ok=True once the row's override display reads value (within 0.05).

    The display is read through read_row, the same reader as the batch read, never the
    editor input (finding R5). When it never shows the value, ok is False and the error
    names the value and what the display shows.
    """
    shown = UNREADABLE
    for attempt in range(CONFIRM_POLLS):
        if attempt:
            time.sleep(CONFIRM_STEP_S)
        shown = read_row(cdp, row)["override"]
        if _is_finite_number(shown) and abs(shown - value) < 0.05:
            return dict(outcome, ok=True, saved=shown)
    waited = (CONFIRM_POLLS - 1) * CONFIRM_STEP_S
    error = "override %s not saved: after %s s its display shows %s" % (value, waited, describe_reading(shown))
    return dict(outcome, ok=False, error=error)


def describe_reading(value) -> str:
    """A calc / override reading the way a log line says it."""
    if value is None:
        return "nothing (blank)"
    if is_unreadable(value):
        return "no readable number"
    return str(value)


# --------------------------------------------------------------------------- #
# Run                                                                          #
# --------------------------------------------------------------------------- #

def build_rows(section: str, gradebook: dict, secret: str, quarter: str | None = None,
               doc: dict | None = None, today: str | None = None,
               pc_day2: dict | None = None) -> tuple[list[dict], list[dict]]:
    """(rows with a Schoology row, pending rows without one) for one quarter.

    quarter / doc default to the legacy lookups (the /class/snapshot quarter, a fresh
    /class/grades); main() always passes both. pc_day2 + today: the PC Day 2 rule.
    """
    if quarter is None:
        snap = roster_get("/class/snapshot?section=%s" % section, secret)
        quarter = snap.get("quarter") or "Q1"
    if doc is None:
        doc = roster_get("/class/grades?section=%s" % section, secret)
    rows, pending = [], []
    for st in doc.get("students", []):
        if _not_a_student(st):
            continue
        q = (st.get("quarters") or {}).get(quarter) or {}
        early = q.get("earlyBonus") or 0
        pc = pc_for_quarter(st, quarter, pc_day2, today)
        banked = banked_bonus_points(st["studentId"], quarter, secret)
        uid = str(st.get("schoologyUid") or "")
        sch = gradebook.get(uid)
        item = {"name": st.get("realName"), "username": st.get("username"), "uid": uid,
                "studentId": st.get("studentId"),
                "quarter": quarter, "pc": pc, "banked": banked, "early": early}
        if not sch:
            # No Schoology row: keep the Desk's own work grade so the grade is not lost.
            work = q.get("workAvg")
            item.update(work=work, result=official_grade(work, pc, banked, early), source="desk")
            pending.append(item)
            continue
        work = work_grade(sch.get("calc"), sch.get("cells") or {})
        result = None if is_unreadable(work) else official_grade(work, pc, banked, early)
        item.update(work=work, row=sch["row"], current=sch.get("override"), result=result,
                    source="schoology")
        rows.append(item)
    return rows, pending


def _not_a_student(st: dict) -> bool:
    return st.get("role") == "teacher" or str(st.get("username", "")).startswith("zz_")


def plan_writes(rows: list[dict], never_lower: bool) -> list[dict]:
    """One decision per Schoology row: {'row', 'action'}.

    'write' the override; 'same' (already within 0.05); 'keep' (never lower: the official
    is below what Schoology shows, and the quarter has ended); 'none' (no work grade yet);
    'unreadable' (the override or the calc could not be read: never treated as absent,
    which wrote LOWER overrides; nothing is written; finding A1).
    """
    plan = []
    for r in rows:
        res = r.get("result")
        current = r.get("current")
        if is_unreadable(current) or is_unreadable(r.get("work")):
            plan.append({"row": r, "action": "unreadable"})
        elif res is None:
            plan.append({"row": r, "action": "none"})
        elif current is not None and abs(current - res["official"]) < 0.05:
            plan.append({"row": r, "action": "same"})
        elif never_lower and current is not None and res["official"] < current:
            plan.append({"row": r, "action": "keep"})
        else:
            plan.append({"row": r, "action": "write"})
    return plan


def kept_result(row: dict) -> dict:
    """The result to publish for a 'keep' row: the higher number Schoology keeps."""
    res = row.get("result") or {}
    return {"official": round(row["current"], 1), "base": res.get("base"), "line": res.get("line"),
            "rule": "kept: never lower"}


def fresh_step(cdp, row: dict, never_lower: bool) -> tuple[dict, str]:
    """(row, action) decided again from a FRESH read of the row, right before its write or,
    for a 'same' / 'keep' row, before its number is published (finding R8).

    Finding R2 (Codex re-review): the batch read can be minutes old when a row's write
    comes (a ledger request per student runs in between). An override entered meanwhile
    must not be written over by a lower official, so the same rules decide again on the
    fresh numbers: a changed work grade is recomputed with official_grade, then
    plan_writes (unreadable / none / same / keep / write) with the pass's own never_lower.
    """
    fresh = read_row(cdp, row["row"])
    work = work_grade(fresh["calc"], fresh["cells"])
    updated = dict(row, current=fresh["override"], work=work)
    if is_unreadable(work):
        updated["result"] = None
    elif work != row.get("work"):
        updated["result"] = official_grade(work, row.get("pc"), row.get("banked"), row.get("early"))
        print("  RECOMPUTED %s: Schoology's work grade is now %s (was %s); official %s" % (
            row.get("name"), work, row.get("work"), (updated["result"] or {}).get("official")))
    action = plan_writes([updated], never_lower)[0]["action"]
    return updated, action


def note_fresh_step(batch: dict, batch_action: str, fresh: dict, action: str) -> None:
    """The log line for a nightly row its fresh read changed (findings R2 + R8).

    Nothing for an unchanged row; a failed read is logged by apply_writes (FAILED-TO-READ).
    """
    if action == "unreadable":
        return
    official = (fresh.get("result") or {}).get("official")
    if batch_action == "write":
        if action != "write":
            print("  NOT WRITTEN %s: read again just before the write, the override is %s and "
                  "the official %s (%s)" % (fresh["name"], fresh.get("current"), official, action))
        return
    if action == batch_action and fresh.get("current") == batch.get("current"):
        return
    print("  CHANGED %s: read again, the override is now %s (the batch read %s); official %s (%s)" % (
        fresh["name"], fresh.get("current"), batch.get("current"), official, action))


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def final_decision(closed, current) -> tuple:
    """(final, action) for one Schoology row (teacher 2026-11-07, decision 3).

    final = max(closedGrade incl. the applied bonus, current override); 'write' when it is
    above what Schoology shows, 'same' when Schoology already holds it (never lower),
    'none' when there is neither number, 'unreadable' when the current override could not
    be read (never treated as absent; finding A1).
    """
    if is_unreadable(current):
        return None, "unreadable"
    closed, current = _number(closed), _number(current)
    values = [v for v in (closed, current) if v is not None]
    if not values:
        return None, "none"
    final = round(max(values), 1)
    if current is None or final - current >= 0.05:
        return final, "write"
    return round(current, 1), "same"


def fresh_final(cdp, row: dict) -> dict:
    """A --final row decided again from a FRESH read of its override, right before its write
    or its record (finding R8: a row whose batch read already matched too).

    Finding R2 (Codex re-review): final = max(closedGrade, the override Schoology holds
    NOW), not the one the batch read saw before the other students were written.
    """
    current = read_row(cdp, row["row"])["override"]
    final, action = final_decision(row.get("closed"), current)
    return dict(row, current=current, final=final, action=action)


def note_fresh_final(batch: dict, fresh: dict) -> None:
    """The log line for a --final row its fresh read changed (findings R2 + R8).

    Nothing for an unchanged row; a failed read is logged by run_final (FAILED-TO-READ).
    """
    action = fresh["action"]
    if action == "unreadable":
        return
    if batch["action"] == "write":
        if action == "same":
            print("  KEPT %s: read again just before the write, the override is %s, at or above "
                  "the closed grade %s: it is the final" % (fresh["name"], fresh["current"], fresh["closed"]))
        return
    if action == batch["action"] and fresh["current"] == batch["current"]:
        return
    print("  CHANGED %s: read again, the override is now %s (the batch read %s); closed grade %s, "
          "final %s (%s)" % (fresh["name"], fresh["current"], batch["current"], fresh["closed"],
                             fresh["final"], action))


def final_rows(gradebook: dict, doc: dict, quarter: str) -> tuple[list[dict], list[dict]]:
    """(Schoology rows, pending rows) for --final: closedGrade from /class/grades, current override
    from the verified marking-period view."""
    rows, pending = [], []
    for st in doc.get("students", []):
        if _not_a_student(st):
            continue
        q = (st.get("quarters") or {}).get(quarter) or {}
        closed = _number(q.get("closedGrade"))
        uid = str(st.get("schoologyUid") or "")
        item = {"name": st.get("realName"), "studentId": st.get("studentId"), "uid": uid, "closed": closed}
        sch = gradebook.get(uid)
        if not sch:
            item.update(final=None if closed is None else round(closed, 1), current=None, action="publish")
            pending.append(item)
            continue
        final, action = final_decision(closed, sch.get("override"))
        item.update(row=sch["row"], current=sch.get("override"), final=final, action=action)
        rows.append(item)
    return rows, pending


def final_item(row: dict) -> dict:
    """A final grade in the shape post_official_grades sends to the Desk."""
    closed = row.get("closed")
    from_closed = closed is not None and round(closed, 1) >= row["final"]
    rule = "final: closed + bonus" if from_closed else "final: kept current"
    return {"studentId": row.get("studentId"), "work": None, "pc": None, "early": None, "banked": None,
            "result": {"official": row["final"], "base": row["final"], "line": row["final"], "rule": rule}}


def final_state_path(path: str | None = None) -> str:
    return path or os.environ.get("SCHOOLOGY_OFFICIAL_FINAL_STATE") or FINAL_STATE_PATH


def load_final_state(path: str | None = None) -> dict:
    path = final_state_path(path)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save_final_state(state: dict, path: str | None = None) -> None:
    """Atomic write: a crash mid-save never leaves a half-written record."""
    path = final_state_path(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(state, fh, indent=1, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)


def final_entry(state: dict, section: str, quarter: str) -> dict | None:
    """The recorded --final run for (section, quarter), or None."""
    entry = ((state or {}).get(section) or {}).get(quarter)
    return entry if isinstance(entry, dict) and entry.get("students") else None


def pass_stop_reason(section: str, quarter: str, doc: dict, today: str,
                     close_fallback: str | None = None, state_path: str | None = None) -> str | None:
    """Why a normal quarter pass must not run (None = run it)."""
    label = lib.quarter_label(quarter)
    close = components.quarter_close_date(doc, quarter, close_fallback)
    if components.quarter_is_closed(today, close):
        return ("%s closed on %s: the %s pass stops (its final is written once by --final %s)."
                % (label, close, label, quarter))
    entry = final_entry(load_final_state(state_path), section, quarter)
    if entry:
        return "%s final already written for %s (%s): the %s pass stops." % (
            label, section, entry.get("at"), label)
    return None


def print_table(section: str, rows: list[dict], pending: list[dict], quarter: str | None = None) -> None:
    title = "official %s grades" % lib.quarter_label(quarter) if quarter else "official quarter grades"
    print("\n%s  %s" % (section, title))
    print("%-28s %6s %6s %5s %5s %6s %-16s %8s -> %s" % (
        "student", "work", "PC", "bank", "early", "line", "rule", "current", "official"))
    for r in rows:
        res = r["result"] or {}
        print("%-28s %6s %6s %5s %5s %6s %-16s %8s -> %s" % (
            (r["name"] or "")[:28], r["work"], r["pc"], r["banked"], r["early"],
            res.get("line"), res.get("rule"), r["current"], res.get("official")))
    for p in pending:
        res = p["result"] or {}
        print("%-28s  NO SCHOOLOGY ROW -- pending official %s" % ((p["name"] or "")[:28], res.get("official")))


def print_final_table(section: str, quarter: str, rows: list[dict], pending: list[dict]) -> None:
    print("\n%s  %s final (max of the closed grade and the current override)" % (
        section, lib.quarter_label(quarter)))
    print("%-28s %8s %8s -> %-7s %s" % ("student", "closed", "current", "final", "action"))
    for r in rows:
        print("%-28s %8s %8s -> %-7s %s" % ((r["name"] or "")[:28], r["closed"], r["current"],
                                             r["final"], r["action"]))
    for p in pending:
        print("%-28s  NO SCHOOLOGY ROW -- closed %s (Desk only)" % ((p["name"] or "")[:28], p["closed"]))


def save_pending(section: str, pending: list[dict]) -> None:
    data = {}
    if os.path.exists(PENDING_PATH):
        with open(PENDING_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    data[section] = {"asOf": time.strftime("%Y-%m-%d %H:%M"), "students": pending}
    with open(PENDING_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class RigWindowReached(Exception):
    """A manual run reached the LIVE sync window (findings A5 + R7); args[0] = 'HH:MM'."""


def check_window(window_clock) -> None:
    """Raise RigWindowReached from 16:00 to 17:05 (findings A5 + R7).

    window_clock returns the school time 'HH:MM'. It is None for a step of the daily job:
    that window is the job's own.
    """
    if window_clock is None:
        return
    hhmm = window_clock()
    if lib.in_rig_quiet_window(hhmm):
        raise RigWindowReached(hhmm)


def guard_write(ops, cdp, view: dict | None, window_clock=None) -> None:
    """Checked before EACH fresh re-read, so before each Schoology write (findings A4 + A5),
    and before the re-read of a row that is only published or recorded (finding R8).

    view: the gradebook must still show the pass's marking period. A page reload reopens
    it on its default period (MP2 now), and the override cells use the same row ids in
    every period, so the next read or write would land in the wrong one. Raises
    lib.ViewNotVerified. window_clock: see check_window.
    """
    if view is not None:
        shown = ops.displayed_grading_period(cdp)
        reason = ops.grading_period_view_matches(shown, view["grading_period_id"], view.get("mp_range"))
        if reason is not None:
            raise lib.ViewNotVerified("the gradebook stopped showing %s: %s" % (lib.describe_view(view), reason))
    check_window(window_clock)


def apply_writes(ops, cdp, quarter: str, plan: list[dict], pending: list[dict], secret: str,
                 view: dict | None = None, window_clock=None, never_lower: bool = True) -> int:
    """Write the 'write' rows, then publish to the Desk exactly what Schoology now holds.

    Every row with a number for the Desk ('write', 'same' or 'keep') is guarded first
    (guard_write), then read again and decided again with the pass's never_lower
    (fresh_step, findings R2 + R8): the Desk gets what that fresh read shows, and a row
    that now needs a write is written like a planned one. A write counts once Schoology's
    display shows it (write_official, finding R5). When guard_write raises, nothing
    further is written or published (main() turns it into exit 3). Exit 1 when a write
    failed, a row could not be read, or the Desk publish failed.
    """
    written = failed = kept = unreadable = 0
    publish = []
    for step in plan:
        r, action = step["row"], step["action"]
        if action in ("write", "same", "keep"):
            # Finding R8 (Codex third review): a 'same' or 'keep' row is read again too. Its
            # batch number went to the Desk although Schoology could hold another by then.
            guard_write(ops, cdp, view, window_clock)
            batch, batch_action = r, action
            r, action = fresh_step(cdp, r, never_lower)
            note_fresh_step(batch, batch_action, r, action)
        if action == "none":
            continue
        if action == "unreadable":
            unreadable += 1
            print("  FAILED-TO-READ %s: the Schoology override or calc could not be read "
                  "(override %r, calc/work %r); nothing written" % (r["name"], r.get("current"), r.get("work")))
            continue
        if action == "keep":
            kept += 1
            publish.append(dict(r, result=kept_result(r)))
            continue
        if action == "same":
            publish.append(r)
            continue
        outcome = write_official(ops, cdp, r["row"], r["result"]["official"])
        if outcome.get("ok"):
            written += 1
            publish.append(r)
        else:
            failed += 1
            print("  FAILED %s: %s" % (r["name"], outcome))
    print("\nwrote %d override(s), kept %d higher (never lower), %d failed, %d failed to read" % (
        written, kept, failed, unreadable))
    # The Desk shows only numbers Schoology also has (a failed write is retried next night).
    published, message = post_official_grades(quarter, publish + pending, secret)
    print(message)
    if failed or unreadable or not published:
        return 1
    return 0


def run_final(ops, cdp, section: str, quarter: str, gradebook: dict, doc: dict, secret: str,
              apply: bool, state_path: str | None = None, view: dict | None = None,
              window_clock=None) -> int:
    """--final: write each student's final override once (max rule), record it, publish it.

    Per student the state holds 'written' (Schoology holds the final: written now, or it
    already did) and 'published' (the Desk has it). A recorded student is never written
    again; a later --final --apply only re-publishes the ones the Desk does not have yet,
    with the final from the state (finding A7). Before a student not recorded yet is
    written or recorded, it is guarded (guard_write, finding A4), then its override is read
    again and its final decided again (fresh_final, findings R2 + R8), one whose batch read
    already matched included. A student is recorded only once the display shows the
    written final (finding R5), or when that fresh read shows Schoology already holds it; a
    fresh read that fails leaves the student unrecorded (exit 1; the next run reads it
    again). done = every recorded student written and published, and nothing failed. Exit 0
    only when done.
    """
    label = lib.quarter_label(quarter)
    rows, pending = final_rows(gradebook, doc, quarter)
    # Finding R7: a manual preview stops before its table once 16:00 comes.
    if not apply:
        check_window(window_clock)
    print_final_table(section, quarter, rows, pending)
    # Finding A2: a gradebook in which no student matched is a failed read, never a done final.
    if not rows and pending:
        print("[ABORT] %s final: no student matched a Schoology row (%d without one); "
              "nothing written." % (label, len(pending)))
        return 2
    state = load_final_state(state_path)
    recorded = (final_entry(state, section, quarter) or {}).get("students") or {}
    if recorded:
        print("[final] %d student(s) already recorded; they are never written again." % len(recorded))
    if not apply:
        print("\nDRY RUN -- nothing written. Re-run with --apply once, after the close.")
        return 0
    if not any(r.get("closed") is not None for r in rows + pending):
        print("[ABORT] %s is not closed: no student has a closedGrade. Close it first "
              "(tools/close_quarter.py); nothing written." % label)
        return 2
    entry = state.setdefault(section, {}).setdefault(quarter, {})
    students = entry.setdefault("students", {})
    written = held = failed = unreadable = 0
    to_publish = []   # (studentId to mark published, or None for a student with no Schoology row; item)
    for r in rows:
        sid = str(r["studentId"])
        record = students.get(sid)
        if record is not None:
            if not record.get("published"):
                to_publish.append((sid, final_item(dict(r, final=record["final"]))))
            continue
        if r["action"] in ("write", "same"):
            # Finding R8 (Codex third review): a student not recorded yet is read again before
            # it is written OR recorded. A batch 'same' was recorded for good from a read
            # minutes old, although Schoology could show 60 or 92 by then.
            guard_write(ops, cdp, view, window_clock)
            batch, r = r, fresh_final(cdp, r)
            note_fresh_final(batch, r)
        if r["action"] == "none":
            continue
        if r["action"] == "unreadable":
            unreadable += 1
            print("  FAILED-TO-READ %s: the current override could not be read; not written, "
                  "not recorded" % r["name"])
            continue
        if r["action"] == "write":
            outcome = write_official(ops, cdp, r["row"], r["final"])
            if not outcome.get("ok"):
                failed += 1
                print("  FAILED %s: %s" % (r["name"], outcome))
                continue   # not recorded: the next --final --apply reads it again and retries
            written += 1
        else:
            held += 1
        students[sid] = {"final": r["final"], "action": r["action"], "at": _now(),
                         "written": True, "published": False}
        save_final_state(state, state_path)
        to_publish.append((sid, final_item(r)))
    for p in pending:
        if p["final"] is not None:
            to_publish.append((None, final_item(p)))
    published, message = (post_official_grades(quarter, [item for _, item in to_publish], secret)
                          if to_publish else (True, "nothing to publish"))
    if published:
        for sid, _ in to_publish:
            if sid is not None:
                students[sid]["published"] = True
    all_published = all(s.get("published") for s in students.values())
    entry["at"] = _now()
    entry["done"] = failed == 0 and unreadable == 0 and published and all_published
    save_final_state(state, state_path)
    print("\n%s final: wrote %d override(s), %d already held, %d failed, %d failed to read" % (
        label, written, held, failed, unreadable))
    print(message)
    if not published:
        print("[final] the Desk publish failed: the final is recorded in Schoology; re-run "
              "--final %s --apply to publish it (Schoology is not written again)." % quarter)
    return 0 if entry["done"] else 1


def _iso_date(text: str) -> str:
    """argparse type: a real YYYY-MM-DD date."""
    from datetime import date as _date
    try:
        return _date.fromisoformat(str(text).strip()).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError("not a YYYY-MM-DD date: %r" % text)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Official quarter grade -> Schoology override (dry run by default).")
    parser.add_argument("--section", required=True, choices=["PeriodB", "PeriodE"])
    parser.add_argument("--quarter", choices=list(lib.QUARTER_KEYS), default=None,
                        help="The pass's quarter: its marking period is selected and verified first.")
    parser.add_argument("--final", choices=list(lib.QUARTER_KEYS), default=None, metavar="QUARTER",
                        help="Write the quarter's final override once: max(closedGrade, current).")
    parser.add_argument("--today", type=_iso_date, default=None, metavar="YYYY-MM-DD",
                        help="Preview as of this date (PC Day 2 rule, close, never lower).")
    parser.add_argument("--close", type=_iso_date, default=None, metavar="YYYY-MM-DD",
                        help="The quarter's close date when /class/grades config has none.")
    parser.add_argument("--apply", action="store_true", help="Write the overrides (default: dry run).")
    return parser.parse_args(argv)


def real_school_date() -> str:
    """Today on the school clock (lib.school_now). --today never changes it."""
    return lib.school_now().date().isoformat()


def quarter_start(doc: dict | None, quarter: str) -> str | None:
    """The quarter's first day: /class/grades config.quarters (components.doc_quarters),
    else components.DEFAULT_QUARTERS."""
    window = components.doc_quarters(doc).get(quarter) or components.DEFAULT_QUARTERS.get(quarter) or {}
    return window.get("start")


def not_started_reason(doc: dict | None, quarter: str, day: str | None) -> str | None:
    """The line to print when the quarter starts after day, else None.

    Finding R6a (Codex re-review): before its first day a quarter has no grade in the
    engine (quarterGrade null), so the Desk shows 'Quarter 2 - starts Mon Nov 9'. The
    daily job runs the next quarter's pass on a gap day (Sun 11/08: Quarter 2), and its
    official would have written an MP2 override and published a Quarter 2 number, which
    the Desk shows in place of that line. So before the start: no write, no publish.
    """
    start = quarter_start(doc, quarter)
    if not start or not day or day >= start:
        return None
    return ("[%s] starts %s: no official grade before the start; nothing written or published"
            % (lib.quarter_label(quarter), start))


def is_daily_job_step(token) -> bool:
    """True when this run inherited the daily job's own lock (owner PeriodB / PeriodE)."""
    return token == lib.RIG_LOCK_INHERITED and lib.is_daily_job_owner(lib.rig_lock_owner())


def main(argv=None, *, clock=None) -> int:
    """clock (tests): returns the school time 'HH:MM'; default schoology_sync_lib.school_hhmm."""
    args = parse_args(argv)
    quarter = args.final or args.quarter
    if args.final and args.quarter and args.final != args.quarter:
        print("[ABORT] --final %s and --quarter %s disagree; nothing written." % (args.final, args.quarter))
        return 2
    if args.apply and quarter is None:
        print("[ABORT] --apply needs --quarter Q1|Q2 (or --final Q1): every write needs an explicit, "
              "verified marking period. Nothing written.")
        return 2
    if args.apply and args.today:
        print("[ABORT] --today is for previews only: a write always uses the real school date "
              "(never lower and the close depend on it). Nothing written.")
        return 2

    from schoology_sync_section import today_school_date  # noqa: E402

    today = args.today or today_school_date()
    secret = roster_secret()
    doc = roster_get("/class/grades?section=%s" % args.section, secret)
    if quarter is None:
        quarter = roster_get("/class/snapshot?section=%s" % args.section, secret).get("quarter") or "Q1"
        print("[note] no --quarter: previewing %s (the /class/snapshot quarter)" % quarter)
    label = lib.quarter_label(quarter)

    if not args.final:
        stop = pass_stop_reason(args.section, quarter, doc, today, args.close)
        if stop:
            print(stop)
            return 0
        # Finding R6a (Codex re-review): a write goes by the real school date; a dry run
        # may preview --today.
        start_day = real_school_date() if args.apply else (args.today or real_school_date())
        not_started = not_started_reason(doc, quarter, start_day)
        if not_started:
            print(not_started)
            return 0

    # Finding A5: hold the rig lock from before connecting until the last read or write.
    # A step of the daily job (or of tools/close_quarter.py) inherits its parent's lock.
    token = lib.take_rig_lock("official")
    if token is None:
        holder = lib.rig_lock_holder(lib.RIG_LOCK_PATH) or {}
        print("[ABORT] %s: the Schoology rig is busy (%s held by %s, pid %s); nothing read or "
              "written." % (label, lib.RIG_LOCK_PATH, holder.get("owner"), holder.get("pid")))
        return 5
    try:
        # Findings A5 + R7 (Codex re-review): every run that connects keeps out of
        # 16:00-17:05, dry runs included. Only a step of the daily job (it inherited the
        # job's own lock) runs then.
        window_clock = None if is_daily_job_step(token) else (clock or lib.school_hhmm)
        try:
            check_window(window_clock)
        except RigWindowReached as exc:
            print("[STOP] it is %s: %s. Nothing read or written; run it before 16:00 or "
                  "after 17:05." % (exc, lib.RIG_WINDOW_REASON))
            return 3
        return _run_on_rig(args, quarter, today, secret, doc, window_clock)
    finally:
        lib.release_rig_lock(token)


def _run_on_rig(args, quarter: str, today: str, secret: str, doc: dict, window_clock) -> int:
    """main() once the rig lock is held: connect, prove the view, read, then write."""
    import schoology_ops as ops  # noqa: E402
    from schoology_sync_section import PERIOD_LETTER, SECTION_TO_COURSE_ID, load_schedule  # noqa: E402

    label = lib.quarter_label(quarter)
    cdp = ops.connect(reuse=True)
    course_id = SECTION_TO_COURSE_ID[args.section]
    view = lib.pass_view(quarter, ops.list_marking_periods(cdp, course_id), components.doc_quarters(doc))
    if view is None:
        print("[ABORT] %s: no Schoology marking period for %s; nothing read or written." % (label, quarter))
        return 3
    titles = view_titles_from_state(args.section, view["grading_period_id"])
    try:
        gradebook = read_gradebook(ops, cdp, course_id, view, titles)
    except lib.ViewNotVerified as exc:
        print("[ABORT] %s: %s; nothing read or written." % (label, exc))
        return 3
    print("[%s] verified: the gradebook shows %s" % (label, lib.describe_view(view)))

    try:
        if args.final:
            return run_final(ops, cdp, args.section, quarter, gradebook, doc, secret, apply=args.apply,
                             view=view, window_clock=window_clock)
        pc_day2 = pc_day2_dates(load_schedule(), PERIOD_LETTER[args.section])
        return _nightly_pass(ops, cdp, args, quarter, today, gradebook, doc, secret, pc_day2,
                             view, window_clock)
    except lib.ViewNotVerified as exc:
        print("[ABORT] %s: %s; nothing further written." % (label, exc))
        return 3
    except RigWindowReached as exc:
        print("[STOP] it is %s: %s. Stopped cleanly; nothing further written or published. "
              "Re-run before 16:00 or after 17:05." % (exc, lib.RIG_WINDOW_REASON))
        return 3


def _nightly_pass(ops, cdp, args, quarter: str, today: str, gradebook: dict, doc: dict, secret: str,
                  pc_day2: dict, view: dict, window_clock) -> int:
    """A normal quarter pass: compute every official, plan (never lower once ended), write."""
    label = lib.quarter_label(quarter)
    rows, pending = build_rows(args.section, gradebook, secret, quarter=quarter, doc=doc,
                               today=today, pc_day2=pc_day2)
    never_lower = components.quarter_has_ended(doc, quarter, today)
    # Finding R7: a manual preview stops before its table once 16:00 comes.
    if not args.apply:
        check_window(window_clock)
    print_table(args.section, rows, pending, quarter)
    # Finding A2: when no student matched a Schoology row the read failed; publishing the
    # Desk-only numbers for everyone would bypass never-lower.
    if not rows and pending:
        print("[ABORT] %s: no student matched a Schoology row (%d without one); nothing written "
              "or published." % (label, len(pending)))
        return 2
    save_pending(args.section, pending)
    plan = plan_writes(rows, never_lower)
    for step in plan:
        if step["action"] == "keep":
            r = step["row"]
            print("  KEEP %s: official %s < current %s (%s has ended: never lower)" % (
                r["name"], r["result"]["official"], r["current"], label))

    if not args.apply:
        print("\nDRY RUN -- nothing written. Re-run with --apply to write the overrides.")
        return 0
    return apply_writes(ops, cdp, quarter, plan, pending, secret, view=view, window_clock=window_clock,
                        never_lower=never_lower)


if __name__ == "__main__":
    raise SystemExit(main())
