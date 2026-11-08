"""schoology_sync_section.py -- P2 orchestration CLI for the Schoology grade-sync tool.

CLI:
    python tools/schoology_sync_section.py --sync-section PeriodB
    python tools/schoology_sync_section.py --sync-section PeriodE --course-id 7945275798
    python tools/schoology_sync_section.py --sync-section PeriodB --dry-run
    python tools/schoology_sync_section.py --sync-section PeriodB --grades-fixture path.json
    python tools/schoology_sync_section.py --sync-section PeriodB --limit 5

QUARTER PASSES (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4, from 2026-11-08):
    --quarter Q1|Q2   one pass per marking period. Before ANY read or write the pass switches
                      the gradebook to that quarter's marking period (the Nth MP in calendar
                      order) and VERIFIES it: the hidden filter input
                      (select2-change-event=sGraderFilterGradingPeriodChanged) holds the MP id,
                      the marking-period column header shows the MP's dates, and
                      Drupal.available_grading_periods lists the id. If it cannot verify, the
                      pass ABORTS with no writes ("[ABORT] ... view-not-verified", exit 3).
                      Only the columns FILED in that MP are created or graded: a lesson column
                      is filed by the day its 0 lands (class day + 13 + 1), a PC by its Day 2,
                      a poster by its date (schoology_components.component_columns).
                      The grade push re-checks the shown marking period before EVERY cell: a
                      page reload reopens the gradebook on its default period, and the pass
                      then stops (exit 3) before the next read or write; the cells not yet
                      written are not marked synced.
                      MARKING-PERIOD EVIDENCE (finding R4b): after every gradebook load the
                      grid's columns are checked against the grading_period_id each column's
                      row carries in tools/.schoology-sync-state.json (the move tool's --apply
                      and --stamp write them; a column this sync creates gets one): a column
                      filed in another MP on the grid, or none of the columns filed in this MP
                      on it, aborts the pass (exit 3, nothing written). Once ANY column of the
                      section carries one, every registered due column must: an unstamped one
                      aborts the pass too, until `python tools/schoology_move_columns.py
                      --section <S> --stamp` records it. A section with no stamp at all (before
                      the move tool's first run) prints one WARNING and relies on the grid
                      signature check of schoology_ops.select_grading_period.
    --no-zeros        accepted for the daily job: the FIXTURE (build_schoology_fixture.py
                      --no-zeros) leaves out the lagged zeros and keeps an earned 0 (work
                      done, scored 0); the sync writes every target it is given. Here the
                      flag only keeps the comment texts in step with that fixture.
    --today DATE      the date for the lagged-zero comment texts and the default --through
                      (a Sunday preview of Monday: --today 2026-11-09).
    --apply           requires --quarter (every write needs an explicit, verified MP).

THE RIG IS SHARED (finding R3, Codex re-review 2026-11-08). One Edge window serves every
Schoology tool, and the LIVE tasks ApStatsSchoologySync-B (16:30) and -E (16:45) run
tools/daily_schoology_sync.ps1, which runs this file. So, in EVERY mode (a dry run drives
Edge too):
  - The run holds the rig lock (tools/.schoology-sync-logs/rig.lock, schoology_sync_lib
    take_rig_lock) from before it connects to Edge until it exits. A step of the daily job
    inherits the job's lock and never releases it. A lock held by any other run refuses
    this one before Edge (exit 5) and names the holder.
  - A manual run never STARTS from 16:00 to 17:05 (exit 3). A manual --apply run also checks
    the clock before each column it creates and each cell it reads or writes, and at 16:00
    stops cleanly (exit 3, the true grades_pushed count; the cells not written are not
    marked synced). The daily job's own steps (lock owner PeriodB / PeriodE) are exempt:
    that window is theirs.
Exit codes: 0 done (or dry run), 1 not signed in, 2 --apply without --quarter, 3 aborted (a
marking period not verified, the 16:00-17:05 window), 5 the rig is busy.

READ-ONLY COMMANDS for the rig (never 16:00-17:05: the LIVE tasks run 16:30 / 16:45). Build the
preview fixtures first (tools/build_schoology_fixture.py, read-only), one per quarter:
    python tools/build_schoology_fixture.py --section PeriodB --granularity component --quarter Q2 --today 2026-11-09 --out tools/.schoology-sync-logs/preview-PeriodB-Q2-20261109.json
    python tools/build_schoology_fixture.py --section PeriodB --granularity component --quarter Q1 --today 2026-11-09 --out tools/.schoology-sync-logs/preview-PeriodB-Q1-20261109.json
Then Monday's passes against the live gradebook, nothing written (CMD 6):
    python tools/schoology_sync_section.py --sync-section PeriodB --granularity component --grades-fixture tools/.schoology-sync-logs/preview-PeriodB-Q2-20261109.json --quarter Q2 --dry-run --comments --today 2026-11-09
    python tools/schoology_sync_section.py --sync-section PeriodB --granularity component --grades-fixture tools/.schoology-sync-logs/preview-PeriodB-Q1-20261109.json --quarter Q1 --dry-run --comments --today 2026-11-09
(repeat with PeriodE). The Quarter 1 dry run switches the gradebook to MP1 first and aborts if
it cannot verify it. A dry run creates nothing, writes no cell and no state.

StateStore contract:
    get_assignment(section, lesson_key) -> dict|None
    upsert_assignment(section, lesson_key, fields)
    get_last_synced(student_id, assignment_key) -> value|None
    set_last_synced(student_id, assignment_key, value)
    log_run(summary_dict)

Idempotency guarantee:
    LocalJsonStateStore records every assignment_id after creation and every
    grade value after a successful push.  plan_assignment_work checks the store
    before creating; compute_sync_actions checks the store before pushing.
    A second identical run therefore sees all assignments already recorded
    (reuse bucket) and all grades already synced (skip bucket), producing
    assignments_created=0 and grades_pushed=0.

ASCII only. LF line endings.
"""
from __future__ import annotations

import sys
# The daily job pipes this through a cp1252 console (Tee-Object): never let a stray character crash a sync.
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

import abc
import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Any

SCHOOL_TZ = "America/New_York"


def _eastern_offset_hours(utc_dt: datetime) -> int:
    """US Eastern UTC offset without tzdata: -4 during DST (2nd Sun Mar 2am ->
    1st Sun Nov 2am local), else -5. Windows CPython has no tz database unless the
    `tzdata` pip package is installed, so zoneinfo is only a first attempt."""
    def nth_sunday(month: int, n: int) -> datetime:
        first = datetime(utc_dt.year, month, 1)
        first_sun = first + timedelta(days=(6 - first.weekday()) % 7)
        return first_sun + timedelta(days=7 * (n - 1))
    start = nth_sunday(3, 2).replace(hour=7)   # 2am EST == 07:00 UTC
    end = nth_sunday(11, 1).replace(hour=6)    # 2am EDT == 06:00 UTC
    return -4 if start <= utc_dt < end else -5


def today_school_date() -> str:
    """Today's date (YYYY-MM-DD) in school time -- the default --through date."""
    try:
        from zoneinfo import ZoneInfo  # optional on Windows (needs the tzdata package)
        return datetime.now(ZoneInfo(SCHOOL_TZ)).strftime("%Y-%m-%d")
    except Exception:  # ZoneInfoNotFoundError on a box without tzdata
        now = datetime.utcnow()
        return (now + timedelta(hours=_eastern_offset_hours(now))).strftime("%Y-%m-%d")


def filter_scope_through(items: list, through_date: str | None) -> list:
    """Keep only scope items whose due_date has arrived (due_date <= through_date).

    SY2627 (teacher 2026-09-03): Schoology must show ONLY work that is due, so
    columns for future lessons are neither created nor graded until their day.
    A None through_date disables the gate (summer mock / explicit override).
    Undated items are dropped when a gate is active.
    """
    if through_date is None:
        return list(items)
    return [i for i in items if i.get("due_date") and i["due_date"] <= through_date]

# ---------------------------------------------------------------------------
# Path bootstrap -- allow running from any cwd
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(REPO_ROOT, "data")
# Prefer the roster-server bundled schedule -- it carries the canonical SY26-27
# pack-left dates + progressChecks + posters (the same file the grade engine
# loads). The root data/lesson-schedule.json can lag (null/stale dates), so fall
# back to it only when the roster-server copy is missing.
_ROSTER_SCHEDULE = os.path.join(REPO_ROOT, "roster-server", "data", "lesson-schedule.json")
_ROOT_SCHEDULE = os.path.join(DATA_DIR, "lesson-schedule.json")
SCHEDULE_PATH = _ROSTER_SCHEDULE if os.path.exists(_ROSTER_SCHEDULE) else _ROOT_SCHEDULE
STATE_PATH = os.path.join(SCRIPT_DIR, ".schoology-sync-state.json")

# Fine-grained (component) granularity presence sources. roadmap-data.json gives
# the authoritative "has a quiz" signal (urls.quiz null for X.1 openers);
# blooket-lessons.json is the engine's hasBlooket denominator.
ROADMAP_PATH = os.path.join(REPO_ROOT, "roadmap-data.json")
BLOOKET_LESSONS_PATH = os.path.join(REPO_ROOT, "roster-server", "data", "blooket-lessons.json")
# Quiz presence now comes from the ANSWER KEY (engine quizTotal parity), not roadmap
# urls.quiz -- prefer the roster-server copy the engine reads, fall back to the root.
_ROSTER_ANSWER_KEY = os.path.join(REPO_ROOT, "roster-server", "data", "answer-key.json")
_ROOT_ANSWER_KEY = os.path.join(REPO_ROOT, "data", "answer-key.json")
ANSWER_KEY_PATH = _ROSTER_ANSWER_KEY if os.path.exists(_ROSTER_ANSWER_KEY) else _ROOT_ANSWER_KEY

sys.path.insert(0, SCRIPT_DIR)
import schoology_sync_lib as lib
import schoology_components as components

SECTION_TO_COURSE_ID = {
    "PeriodB": "8537033028",   # SY26-27 "AP Statistics · Section 1" (13 students; discovered via the rig 2026-09-04)
    "PeriodE": "8537033042",   # SY26-27 "AP Statistics · Section 2" (15 students). SY25-26 mock courses were 7945275782 / 7945275798.
    # Summer mock-grading (2026-06). PeriodY is a roster TEST section whose 3
    # fruit_animal students map (via roster.schoology_uid) to real Period B
    # students, so a mock push lands in Period B's REAL gradebook. Same course as
    # Period B. Fall cutover = repoint this entry + the per-student schoology_uid
    # map (and clear SECTION_FORCE_MP_DATE below); the sync code stays unchanged.
    "PeriodY": "8537033028",  # fall cutover 2026-09-04: follows PeriodB (its 3 mock uids are stale — mock pushes find no rows)
}

PERIOD_LETTER = {
    "PeriodB": "B",
    "PeriodE": "E",
    "PeriodY": "B",  # summer mock builds its scope from Period B's lesson dates
}

# Force EVERY assignment for a section into the marking period that COVERS this
# date, instead of resolving the MP per-lesson from its own due-date. Needed for
# the summer mock: the lessons carry SY26-27 dates (Sept 2026+) that would
# resolve to MP1, but the mock must land in MP4 (4/11/26-6/30/26). 2026-05-15 is
# safely inside MP4. Resolved against the LIVE marking periods at sync time, so
# no Schoology-internal grading_period_id is hard-coded here (and it survives an
# id change). None / absent = resolve per due-date as usual -> PeriodB & PeriodE
# behavior is unchanged.
SECTION_FORCE_MP_DATE = {
    "PeriodY": "2026-05-15",
}


# ---------------------------------------------------------------------------
# StateStore interface + implementations
# ---------------------------------------------------------------------------

class StateStore(abc.ABC):
    """Abstract persistence layer.  All methods are synchronous (no network)."""

    @abc.abstractmethod
    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        """Return stored assignment row or None if not yet created."""

    @abc.abstractmethod
    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        """Create or overwrite the stored row for this (section, lesson_key)."""

    @abc.abstractmethod
    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        """Return the last grade value successfully pushed, or None."""

    @abc.abstractmethod
    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        """Record a successfully pushed grade value."""

    @abc.abstractmethod
    def log_run(self, summary: dict) -> None:
        """Append a run summary record (for audit / debugging)."""

    def reload(self) -> None:
        """Re-read the backing store before a write that must not use a stale copy.

        A no-op here: a store that reads its backing store on every call has nothing
        to refresh. LocalJsonStateStore overrides it.
        """


class LocalJsonStateStore(StateStore):
    """File-backed state store.  Persists to tools/.schoology-sync-state.json.

    Internal structure::

        {
          "assignments": {
            "<section>/<lesson_key>": { "schoology_assignment_id": "...", ... }
          },
          "last_synced": {
            "<student_id>/<assignment_key>": <value>
          },
          "runs": [ {...}, ... ]
        }
    """

    def __init__(self, path: str = STATE_PATH):
        self._path = path
        self._data = self._load()

    # -- persistence helpers ------------------------------------------------

    def _load(self) -> dict:
        if os.path.exists(self._path):
            with open(self._path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"assignments": {}, "last_synced": {}, "runs": []}

    def _save(self) -> None:
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2)

    def reload(self) -> None:
        """Re-read the file. Every save writes the WHOLE in-memory copy, so a long run
        (the column move) re-reads first: another run may have saved new assignment ids
        or last_synced values since this one loaded the file (finding B1, 2026-11-08)."""
        self._data = self._load()

    # -- assignment registry ------------------------------------------------

    def _asgn_key(self, section: str, lesson_key: str) -> str:
        return f"{section}/{lesson_key}"

    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        return self._data["assignments"].get(self._asgn_key(section, lesson_key))

    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        key = self._asgn_key(section, lesson_key)
        existing = self._data["assignments"].get(key, {})
        existing.update(fields)
        self._data["assignments"][key] = existing
        self._save()

    # -- last-synced registry -----------------------------------------------

    def _ls_key(self, student_id: str, assignment_key: str) -> str:
        return f"{student_id}/{assignment_key}"

    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        return self._data["last_synced"].get(self._ls_key(student_id, assignment_key))

    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        self._data["last_synced"][self._ls_key(student_id, assignment_key)] = value
        self._save()

    # -- run log ------------------------------------------------------------

    def log_run(self, summary: dict) -> None:
        summary.setdefault("timestamp", datetime.utcnow().isoformat() + "Z")
        self._data.setdefault("runs", []).append(summary)
        self._save()


class SupabaseStateStore(StateStore):
    """Production stub -- raises NotImplementedError. DEFERRED: LocalJsonStateStore
    covers every current dry-run/smoke need; this is only required for a real
    --sync-section run (~Sept-2026), which is itself gated on the migration being
    applied to the live DB. Do NOT build it blind -- there is a design decision.

    To implement (it is NOT just "fill in the method bodies"):
    1. Run roster-server/migrations/0010_schoology_sync.sql against Supabase
       (user-owned) and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    2. supabase-py is NOT a current dependency -- lazy-import it inside __init__
       and accept an injected client so unit tests can pass a mock.
    3. IMPEDANCE MISMATCH (the real work): get_last_synced / set_last_synced take
       (student_id, lesson_key:str) with NO section, but schoology_grade_sync keys
       on (student_id, assignment_id:uuid -> schoology_assignment.id), and
       schoology_assignment is unique on (section, lesson_key). So the store must
       CARRY section -- construct SupabaseStateStore(section=...) -- and resolve
       (section, lesson_key) -> assignment uuid before touching grade-sync.
       Alternative: a migration 0011 re-keying schoology_grade_sync on text
       (section, lesson_key), which simplifies the store but changes the schema.
    4. Map: upsert_assignment -> schoology_assignment (on-conflict section,lesson_key);
       get/set_last_synced -> schoology_grade_sync; log_run -> schoology_sync_log.
    """

    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first, "
            "then implement get_assignment with supabase-py."
        )

    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def log_run(self, summary: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )


# ---------------------------------------------------------------------------
# Schedule loading
# ---------------------------------------------------------------------------

def load_schedule(path: str = SCHEDULE_PATH) -> dict:
    """Read lesson-schedule.json and return the raw parsed dict."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _note_key(lesson_key: str) -> str:
    """Sync-state key holding the exact grade-cell note the sync last wrote for a cell."""
    return f"{lesson_key}#note"


def _comment_ownership_lost(result) -> bool:
    """The cell's comment is no longer the sync's (edited or replaced by a teacher)."""
    reason = str((result or {}).get("reason") or "")
    return "not the sync's" in reason or "differs from the sync's last note" in reason


def _list_students_stable(ops, cdp, *, attempts: int = 8, pause_s: float = 0.75) -> list:
    """Read the gradebook roster once the rendered row count has settled.

    The grid can still be rendering rows right after a reload; a single read then misses the
    lower students for the WHOLE run ("Student ... not found in gradebook roster", seen
    2026-09-26 and 2026-09-29). Re-read until two consecutive non-empty reads agree.
    """
    import time as _time
    last = None
    students = []
    for _ in range(max(1, attempts)):
        students = ops.list_students(cdp) or []
        ids = sorted(str(s.get("studentId")) for s in students)
        if ids and ids == last:
            return students
        last = ids
        _time.sleep(pause_s)
    return students


ViewNotVerified = lib.ViewNotVerified


def _load_gradebook_page(ops, cdp, course_id: str, view: dict | None = None,
                         evidence: "PassEvidence | None" = None) -> None:
    """Return CDP to the gradebook after setup/create pages have navigated away.

    view (a quarter pass): also switch the gradebook to that pass's marking period and
    VERIFY it. The gradebook reopens on its default marking period after every
    navigation, so every reload re-selects. Raises ViewNotVerified when it cannot:
    the caller stops before its next read or write.
    evidence (the pass's PassEvidence): then the grid's columns must agree with the
    marking periods the sync state records for them (finding R4b).
    """
    ops.navigate(cdp, ops.gradebook_url(course_id))
    ops.inject_helpers(cdp)
    if view is None:
        return
    result = ops.select_grading_period(cdp, view["grading_period_id"], view.get("mp_range")) or {}
    if not result.get("ok"):
        raise ViewNotVerified(lib.view_error(view, result))
    if evidence is not None:
        evidence.check(ops, cdp)


class PassEvidence:
    """The marking-period evidence of one quarter pass (finding R4b, Codex re-review).

    Evidence = the grading_period_id the sync state records on the section's registered
    columns (schoology_move_columns.py --apply / --stamp writes them; a column the sync
    creates, or finds in a verified view, gets one). After every gradebook load:
      - a column filed in another marking period is on the grid: wrong grid;
      - none of the columns filed in this one is on the grid: wrong (or empty) grid;
      - once any column of the section carries a stamp, every registered DUE column must
        carry one too: an unstamped column could sit on the wrong grid unseen (fail closed).
    No stamp at all (before the move tool's first run): one WARNING line per pass, and
    the grid-signature check in schoology_ops.select_grading_period stands alone.
    Titles come from the scope (what the sync looks columns up by); a state row's own
    title can predate the CED rename.
    """

    def __init__(self, section: str, state: "StateStore", view: dict, items_by_key: dict,
                 due_keys):
        self.section = section
        self.state = state
        self.view = view
        self.items_by_key = items_by_key
        self.due_keys = set(due_keys)
        self.warned = False

    def read(self) -> tuple:
        """(titles filed here, titles filed in another MP, registered due titles with no stamp)."""
        here, elsewhere, unstamped = set(), set(), []
        for key, item in self.items_by_key.items():
            row = self.state.get_assignment(self.section, key) or {}
            if not row.get("schoology_assignment_id"):
                continue   # never created: nothing on any grid
            period = row.get("grading_period_id")
            if not period:
                if key in self.due_keys:
                    unstamped.append(item["title"])
                continue
            if str(period) == str(self.view["grading_period_id"]):
                here.add(item["title"])
            else:
                elsewhere.add(item["title"])
        both = here & elsewhere
        return here - both, elsewhere - both, sorted(unstamped)

    def check(self, ops, cdp) -> None:
        """Raise ViewNotVerified unless the grid agrees with the evidence."""
        here, elsewhere, unstamped = self.read()
        if not here and not elsewhere:
            self._warn_once()
            return
        ops.load_all_columns(cdp)   # the titles past the first 30 columns load on scroll
        problem = ops.view_content_problem(cdp, self.view, here, elsewhere)
        if problem:
            raise ViewNotVerified(f"the grid does not match {lib.describe_view(self.view)}: {problem}")
        if unstamped:
            shown = ", ".join(unstamped[:3]) + (" ..." if len(unstamped) > 3 else "")
            raise ViewNotVerified(
                f"{len(unstamped)} registered due column(s) of {self.section} have no marking "
                f"period on record ({shown}) while {len(here) + len(elsewhere)} do, so the grid "
                "cannot be checked against them. Record them first: python "
                f"tools/schoology_move_columns.py --section {self.section} --stamp "
                "(read-only on Schoology)")

    def _warn_once(self) -> None:
        if self.warned:
            return
        self.warned = True
        print(f"[WARNING] {self.section} {lib.describe_view(self.view)}: no marking-period "
              "evidence on record; relying on the grid-signature check (no column of this "
              "section carries a grading_period_id yet; schoology_move_columns.py --apply or "
              "--stamp records them).")


class GradePushStopped(ViewNotVerified):
    """The pass's marking period was lost IN THE MIDDLE of the grade push.

    Carries how many cells were written before the stop, so the run summary says so.
    """

    def __init__(self, reason: str, pushed: int):
        super().__init__(f"{reason}; stopped after {pushed} written cell(s): the rest were "
                         "not written and are not marked synced")
        self.pushed = pushed


class RigWindowStopped(GradePushStopped):
    """A manual --apply run reached 16:00 (finding R3): stopped before the next create or
    cell, like a lost view. args[0] says when and why."""

    def __init__(self, hhmm: str, pushed: int):
        super().__init__(rig_window_message(hhmm), pushed)
        self.hhmm = hhmm


def rig_window_message(hhmm: str) -> str:
    """'it is 16:00: from 16:00 to 17:05 the rig belongs to the LIVE sync tasks (...)'."""
    return (f"it is {hhmm}: from {lib.RIG_QUIET_WINDOW[0]} to {lib.RIG_QUIET_WINDOW[1]} the rig "
            f"belongs to the LIVE sync tasks ({lib.RIG_LIVE_TASKS})")


def _stop_at_rig_window(window_clock, pushed: int) -> None:
    """window_clock (a manual --apply run only): raise RigWindowStopped from 16:00 to 17:05.
    None (a dry run, or a step of the daily job) never stops here."""
    if window_clock is None:
        return
    hhmm = window_clock()
    if lib.in_rig_quiet_window(hhmm):
        raise RigWindowStopped(hhmm, pushed)


def _view_lost_reason(ops, cdp, view: dict | None) -> str | None:
    """Why the gradebook no longer shows the pass's marking period, or None while it does.

    Finding B2 (verifier 2026-11-08): the view is verified once per gradebook load, but a
    page reload in the middle of the push (a Schoology session refresh) reopens the
    gradebook on its DEFAULT period, MP2 since 11/07, and the remaining Quarter 1 cells
    would be read and written in MP2. One JS eval, so the push runs it before every cell.
    view None (a legacy run without --quarter) has nothing to check.
    """
    if view is None:
        return None
    shown = ops.displayed_grading_period(cdp)
    reason = ops.grading_period_view_matches(shown, view["grading_period_id"], view.get("mp_range"))
    if reason is None:
        return None
    return f"the gradebook no longer shows {lib.describe_view(view)}: {reason}"


def _event_unit(unit_str, entry: dict | None):
    """The NEW CED unit an event row (progress check / poster) belongs to.

    The row's explicit `unit` wins; older rows without it use the map key
    ("3" or "U3").
    """
    unit = (entry or {}).get("unit")
    if unit is not None:
        return unit
    return str(unit_str).lstrip("Uu")


def build_scope(schedule: dict, section: str, ced: bool = False) -> list[dict]:
    """Return a list of scope items for the given section.

    Each item::

        {
          'key':      str,   # stable lesson / pc / poster key
          'kind':     str,   # lesson | progress_check | poster
          'title':    str,   # human-readable Schoology title
          'due_date': str|None,  # YYYY-MM-DD or None
          'unit':     int,
        }

    Only items that have a date for this section's period letter are included
    (items with a null period date are silently excluded -- no assignment to
    create yet).

    ced: True = CED-2026 titles (lib.assignment_title ced path); keys never change.
    """
    period_letter = PERIOD_LETTER.get(section, "B")
    items = []

    # -- lessons --
    for topic_key, lesson in schedule.get("lessons", {}).items():
        if lesson.get("kind") == "work":
            continue
        date = lesson["periods"].get(period_letter)
        if not date:
            continue
        kind = lib.classify_lesson_key(topic_key)
        title = lib.assignment_title(kind, topic_key, ced=ced)
        items.append({
            "key": topic_key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "filing_date": components.filing_date_of(date),
            "unit": lesson.get("unit"),
        })

    # -- progress checks / posters --
    # progressChecks/posters are keyed by the NEW CED unit (SY2627: 1-5). The
    # column keys MUST be the shared PC:U{n} / POSTER:U{n} form so lesson mode,
    # component mode, gradebook-grid.js and the grade producer
    # (units[U{n}].pcRawPct -> PC:U{n}) all name the same Schoology column.
    for unit_str, pc in schedule.get("progressChecks", {}).items():
        date = pc["periods"].get(period_letter)
        if not date:
            continue
        unit = _event_unit(unit_str, pc)
        key = components.pc_key(unit)
        kind = "progress_check"
        title = lib.assignment_title(kind, key, ced=ced)
        day2 = pc.get("adminDay2")
        day2 = day2.get(period_letter) if isinstance(day2, dict) else day2
        items.append({
            "key": key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "filing_date": day2 or date,   # a PC counts in the quarter it is due (Day 2)
            "unit": unit,
        })

    for unit_str, poster in schedule.get("posters", {}).items():
        date = poster["periods"].get(period_letter)
        if not date:
            continue
        unit = _event_unit(unit_str, poster)
        key = components.poster_key(unit)
        kind = "poster"
        title = lib.assignment_title(kind, key, ced=ced)
        items.append({
            "key": key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "filing_date": date,
            "unit": unit,
        })

    # stable sort: by date, then by key
    items.sort(key=lambda x: (x["due_date"] or "", x["key"]))
    return items


def build_component_scope(
    schedule: dict,
    section: str,
    *,
    quiz_topics=None,
    blooket_topics=None,
    include_undated: bool = False,
    roadmap_path: str = ROADMAP_PATH,
    blooket_lessons_path: str = BLOOKET_LESSONS_PATH,
    answer_key_path: str = ANSWER_KEY_PATH,
    ced: bool = False,
) -> list[dict]:
    """Return FINE-GRAINED (per-component) scope items for the given section.

    Each lesson yields up to three columns -- Follow-Along (worksheet),
    Quiz (if the topic has a quiz), Blooket (if the topic has a Blooket) --
    instead of one coarse blended column. Combined worksheets share ONE
    Follow-Along / Blooket column; quizzes stay per-topic. See
    schoology_components.component_columns for the rules.

    quiz_topics / blooket_topics override the on-disk presence sources (for
    tests); when None they are loaded from roadmap-data.json + blooket-lessons.json.

    include_undated: include lessons with no date for this section's period
    (the summer mock forces every column into MP4 regardless of the calendar).

    Items share the SAME shape as build_scope ({key, kind, title, due_date,
    unit}) plus group_label/topic_keys, so the rest of the pipeline is unchanged.
    """
    period_letter = PERIOD_LETTER.get(section, "B")
    if quiz_topics is None:
        quiz_topics = components.load_quiz_topics(answer_key_path)
    if blooket_topics is None:
        blooket_topics = components.load_blooket_topics(blooket_lessons_path)

    columns = components.component_columns(
        schedule.get("lessons", {}),
        period_letter,
        quiz_topics=quiz_topics,
        blooket_topics=blooket_topics,
        include_undated=include_undated,
        progress_checks=schedule.get("progressChecks"),
        posters=schedule.get("posters"),
        ced=ced,
    )
    return columns


# ---------------------------------------------------------------------------
# Assignment-creation helpers
# ---------------------------------------------------------------------------

def _normalize_category_name(name: str) -> str:
    """Case/plural/space-insensitive key: 'Quizzes', 'quiz', 'Quiz ' -> 'quiz'."""
    key = " ".join(str(name or "").lower().split())
    if len(key) <= 3:
        return key
    if key.endswith("zzes"):            # quizzes -> quiz
        return key[:-3]
    if key.endswith(("ches", "shes", "xes", "sses")):   # matches, boxes, classes
        return key[:-2]
    if key.endswith("s"):               # posters -> poster, lessons -> lesson
        return key[:-1]
    return key


def _resolve_category_id(cats: dict, kind: str) -> str | None:
    """Map kind -> category_name -> category_id from live Schoology categories.

    Exact name first; then a tolerant match so a teacher-typed "Quiz" still
    resolves the sync's "Quizzes" (SY26-27 Period E was created that way).
    """
    category_name = lib.KIND_TO_CATEGORY.get(kind)
    if category_name is None:
        return None
    if category_name in cats:
        return cats[category_name]
    wanted = _normalize_category_name(category_name)
    for live_name, cat_id in cats.items():
        if _normalize_category_name(live_name) == wanted:
            return cat_id
    return None


def _ensure_assignment(
    item: dict,
    section: str,
    course_id: str,
    cats: dict,
    mps: dict,
    state: StateStore,
    ops,
    cdp,
    dry_run: bool,
    errors: list,
    force_mp_date: str | None = None,
    view: dict | None = None,
    evidence: PassEvidence | None = None,
) -> str | None:
    """Return the Schoology assignment id for this scope item (creating if needed).

    The marking period comes from the item's filing_date (a lesson: the day its 0 lands,
    class day + 13 + 1; a PC: Day 2), so a column sits in the quarter its zeros count in.
    The Schoology due date stays the class day (teacher 2026-11-07, decision 4). The
    MP id is recorded in the state row.

    force_mp_date: when set (summer mock -> MP4), EVERY assignment is filed into
    the marking period covering this date and dated there too.
    view: the quarter pass's verified marking period (re-selected after the create).
    evidence: the pass's PassEvidence, checked after each of those reloads (finding R4b).
    The new column's state row records its marking period (grading_period_id): that is
    evidence for every later check.

    Returns None on failure (error appended to errors list).
    """
    key = item["key"]
    kind = item["kind"]
    title = item["title"]
    # A forced MP date overrides the lesson's own due-date both for marking-period
    # resolution AND as the assignment's due-date, so the assignment sits cleanly
    # inside the forced MP (no Sept-due-date-in-an-MP4-that-ends-in-June mismatch).
    due_date = force_mp_date or item["due_date"]
    filing_date = force_mp_date or item.get("filing_date") or item["due_date"]

    # Check state store first (idempotency: already created in a prior run)
    stored = state.get_assignment(section, key)
    if stored and stored.get("schoology_assignment_id"):
        return stored["schoology_assignment_id"]

    # Resolve the marking period up front (also shown in the dry-run line, so a
    # dry-run proves WHICH MP each assignment would land in before any live write).
    grading_period_id = lib.marking_period_for_date(filing_date, mps)
    if filing_date and grading_period_id is None:
        msg = (f"No grading_period_id covering filing date {filing_date!r} "
               f"(due_date={due_date!r}, key={key})")
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    if dry_run:
        print(f"  [DRY-RUN] WOULD CREATE: {title!r} (kind={kind}, due={due_date}, "
              f"files={filing_date}, mp={grading_period_id})")
        return None

    # Pre-flight: does the assignment already exist in Schoology (in the shown MP)?
    existing_id = ops.find_assignment_id_by_title(cdp, title)
    if existing_id:
        print(f"  [REUSE]  Found existing assignment {existing_id!r} for {title!r}")
        fields = {"schoology_assignment_id": existing_id, "title": title}
        if view is not None:
            fields["grading_period_id"] = view["grading_period_id"]   # seen in the verified MP
        state.upsert_assignment(section, key, fields)
        return existing_id

    # Resolve category
    category_id = _resolve_category_id(cats, kind)
    if category_id is None:
        msg = f"No category_id for kind={kind!r} (key={key})"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    result = ops.add_assignment(
        cdp,
        course_id,
        title=title,
        points=lib.assignment_points(kind),
        category_id=category_id,
        grading_period_id=grading_period_id,
        due_date=due_date,
        publish_scores=True,
        sync_to_sis=True,
    )

    _load_gradebook_page(ops, cdp, course_id, view, evidence)

    result_ok = bool(result and result.get("ok"))
    assignment_id = (result or {}).get("assignment_id")

    # Fallback: look it up by title if id not returned. This is also the
    # best-effort false-negative recovery path: the submit click may have landed
    # even when add_assignment missed the transient confirmation JSON.
    if not assignment_id:
        assignment_id = ops.find_assignment_id_by_title(cdp, title)

    if assignment_id:
        state.upsert_assignment(section, key, {"schoology_assignment_id": assignment_id, "title": title,
                                               "grading_period_id": grading_period_id})
        label = "CREATED" if result_ok else "RECONCILED"
        print(f"  [{label}] {title!r} -> id={assignment_id} mp={grading_period_id}")
        # 2026-09-16 (teacher): every synced assignment lives in the "Assignments" materials
        # folder so the student-facing course page is not a wall of items. Best-effort: a
        # failed move is reported, never fatal (the gradebook column exists either way).
        _file_in_assignments_folder(ops, cdp, course_id, assignment_id, title, errors)
        _load_gradebook_page(ops, cdp, course_id, view, evidence)
        return assignment_id

    if not result_ok:
        err_msg = (result or {}).get("error") or "add_assignment returned not-ok"
        msg = f"Failed to create {title!r}: {err_msg}"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    msg = f"Created {title!r} but could not resolve assignment_id"
    print(f"  [WARN] {msg}")
    errors.append(msg)

    return assignment_id


def _file_in_assignments_folder(ops, cdp, course_id: str, assignment_id: str, title: str, errors: list) -> bool:
    """Move one just-created assignment into the "Assignments" materials folder (created if missing)."""
    mover = getattr(ops, "move_assignments_into_folder", None)
    if mover is None:   # older ops module / test double without folder support
        return False
    try:
        result = mover(cdp, course_id, only_nids={str(assignment_id)})
    except Exception as exc:  # noqa: BLE001 - never let a folder move break the sync
        errors.append(f"Could not file {title!r} in the Assignments folder: {exc}")
        return False
    if result.get("ok") and result.get("moved"):
        print(f"  [FILED]  {title!r} -> folder id={result.get('folder_id')}")
        return True
    for err in result.get("errors") or [f"{title!r} was not moved"]:
        errors.append(f"Could not file {title!r} in the Assignments folder: {err}")
    return False


# ---------------------------------------------------------------------------
# Grade-push helpers
# ---------------------------------------------------------------------------

def _build_last_synced_map(student_ids: list, scope_keys: list, state: StateStore) -> dict:
    """Read last-synced values from the store for all (student, key) pairs."""
    last_synced = {}
    for sid in student_ids:
        for key in scope_keys:
            composite = (sid, key)
            last_synced[composite] = state.get_last_synced(sid, key)
    return last_synced


def _grade_at_least(existing, target) -> bool:
    """Compare persisted or live numeric grades with the sync tolerance."""
    try:
        return float(existing) >= float(target) - 1e-9
    except (TypeError, ValueError):
        return False


def _push_grades(
    targets: dict,
    scope_items_by_key: dict,
    students_by_id: dict,
    section: str,
    state: StateStore,
    ops,
    cdp,
    dry_run: bool,
    errors: list,
    comments: bool = False,
    comment_texts: dict | None = None,
    view: dict | None = None,
    window_clock=None,
) -> tuple[int, int, int]:
    """Apply best-wins grades. Returns (pushed_count, skipped_count, kept_count).

    view (a quarter pass): before every cell the shown marking period is checked again;
    when it is gone, GradePushStopped is raised before that cell is read or written.
    window_clock (a manual --apply run): checked at the same place; from 16:00 to 17:05
    RigWindowStopped is raised before that cell (finding R3).
    """

    # Build last-synced map for the students + keys that appear in targets
    student_ids = {sid for sid, _ in targets}
    scope_keys = {key for _, key in targets}
    last_synced_map = _build_last_synced_map(list(student_ids), list(scope_keys), state)

    # A higher hand entry recorded on KEEP already covers a lower app target.
    covered = {key for key, target in targets.items()
               if target is not None and _grade_at_least(last_synced_map.get(key), target)}
    pending = {key: target for key, target in targets.items() if key not in covered}
    actions = lib.compute_sync_actions(pending, last_synced_map)
    pushed = 0
    kept = 0
    skipped = len(covered) + len(actions["skip"])

    for composite_key in actions["push"]:
        student_id, lesson_key = composite_key
        target_value = targets[composite_key]

        lost = _view_lost_reason(ops, cdp, view)
        if lost:
            raise GradePushStopped(lost, pushed)
        _stop_at_rig_window(window_clock, pushed)

        scope_item = scope_items_by_key.get(lesson_key)
        if scope_item is None:
            errors.append(f"No scope item for lesson_key={lesson_key!r}")
            continue

        # Grade-push targets the COLUMN data-x (what write_grade_to_cell keys
        # on), NOT the stored assignment node id. data-x is positional and can
        # shift between runs, so resolve it live by title each run.
        column_key = ops.find_assignment_id_by_title(cdp, scope_item.get("title"))
        if column_key is None:
            errors.append(
                f"No gradebook column for lesson_key={lesson_key!r} "
                f"(title={scope_item.get('title')!r}); skipping grade push"
            )
            continue

        student_row = students_by_id.get(str(student_id))
        if student_row is None:
            errors.append(f"Student {student_id!r} not found in gradebook roster")
            continue

        row_index = student_row.get("rowIndex")

        existing = ops.read_grade_from_cell(cdp, column_key, row_index)
        keep = _grade_at_least(existing, target_value)
        if dry_run:
            decision = "KEEP" if keep else "PUSH"
            comment_plan = ""
            if comments and not keep:
                text = (comment_texts or {}).get(f"{student_id}/{lesson_key}", "")
                if target_value != 0:
                    comment_plan = " comment: would clear"
                elif text:
                    comment_plan = f" comment: would write {text}"
                else:
                    comment_plan = " comment: skipped(no lagged-zero text)"
            print(
                f"  [DRY-RUN] WOULD {decision} student={student_id} key={lesson_key} "
                f"existing={existing} target={target_value} col={column_key}{comment_plan}"
            )
            continue

        if keep:
            state.set_last_synced(str(student_id), lesson_key, existing)
            kept += 1
            print(f"  [KEEP] student={student_id} key={lesson_key} "
                  f"existing={existing} >= target={target_value}")
            continue

        result = ops.write_grade_to_cell(cdp, column_key, row_index, target_value)
        if result and result.get("ok"):
            state.set_last_synced(str(student_id), lesson_key, target_value)
            pushed += 1
            if comments:
                text = (comment_texts or {}).get(f"{student_id}/{lesson_key}", "")
                note_key = _note_key(lesson_key)
                prior_note = state.get_last_synced(str(student_id), note_key) or None
                outcome = "skipped(no lagged-zero text)"
                try:
                    comment_result = None
                    if target_value != 0:
                        # A real score replaced the zero: remove the sync's note. With a recorded
                        # note, only that exact text is removed; older notes (before the marker
                        # existed) fall back to the prefix guard.
                        comment_result = ops.clear_cell_comment(cdp, column_key, row_index,
                                                                expect_current=prior_note)
                    elif text:
                        comment_result = ops.write_cell_comment(cdp, column_key, row_index, text)
                    if target_value != 0 or text:
                        comment_result = comment_result or {}
                        if comment_result.get("ok") and comment_result.get("verified"):
                            outcome = "cleared" if target_value != 0 else "wrote"
                            state.set_last_synced(str(student_id), note_key, "" if target_value != 0 else text)
                        elif _comment_ownership_lost(comment_result):
                            state.set_last_synced(str(student_id), note_key, "")
                            outcome = f"skipped({comment_result.get('reason')})"
                        else:
                            outcome = f"skipped({comment_result.get('reason') or 'unverified'})"
                except Exception as exc:
                    outcome = f"skipped(comment error: {type(exc).__name__})"
                print(f"  student={student_id} key={lesson_key} comment: {outcome}")
        else:
            err_msg = (result or {}).get("error") or "write_grade_to_cell returned not-ok"
            msg = (
                f"Failed to push grade for student={student_id} "
                f"key={lesson_key}: {err_msg}"
            )
            print(f"  [ERROR] {msg}")
            errors.append(msg)

    # Comments travel with the ZERO, not with the write: a cell that already held the lagged 0
    # from an earlier sync (so nothing was pushed today) still needs its comment. The writer
    # is idempotent (an identical published comment is a verified no-op), so this is cheap.
    if comments:
        # Every unchanged 0: a lagged zero keeps its note; an EARNED zero (the student did the
        # work and scored 0, so the text is "") gets our stale "Not a permanent 0" note removed.
        # The writer only ever clears a comment that starts with the sync's prefix, so a
        # teacher's own comment is never touched (Codex review 2026-09-29).
        # An EARNED zero is cleared only when (a) the comment builder explicitly emitted this
        # cell with no note (missing data never triggers a clear), and (b) the sync recorded
        # the note it wrote there — then only that exact text is removed. So there is no
        # nightly UI work on earned zeros and a teacher's own comment is never erased.
        # A cell whose recorded note is still set is reconciled every night until the note is
        # gone: an earned zero, or a real score whose earlier clear failed transiently.
        def _wants_comment_work(key):
            if comment_texts is None or targets.get(key) is None:
                return False
            ckey = f"{key[0]}/{key[1]}"
            recorded = bool(state.get_last_synced(str(key[0]), _note_key(key[1])))
            if targets.get(key) != 0:
                return recorded
            if comment_texts.get(ckey):
                return True
            return ckey in comment_texts and recorded
        unchanged_zero_keys = [key for key in list(covered) + list(actions["skip"]) if _wants_comment_work(key)]
        for student_id, lesson_key in unchanged_zero_keys:
            text = (comment_texts or {}).get(f"{student_id}/{lesson_key}", "")
            prior_note = state.get_last_synced(str(student_id), _note_key(lesson_key)) or None
            if dry_run:
                plan = f"would ensure {text}" if text else "would clear the sync's earlier note"
                print(f"  [DRY-RUN] existing 0 student={student_id} key={lesson_key} comment: {plan}")
                continue
            lost = _view_lost_reason(ops, cdp, view)
            if lost:
                raise GradePushStopped(lost, pushed)
            _stop_at_rig_window(window_clock, pushed)
            scope_item = scope_items_by_key.get(lesson_key)
            student_row = students_by_id.get(str(student_id))
            column_key = ops.find_assignment_id_by_title(cdp, scope_item.get("title")) if scope_item else None
            if column_key is None or student_row is None:
                print(f"  student={student_id} key={lesson_key} comment: skipped(no column or row)")
                continue
            try:
                if text:
                    comment_result = ops.write_cell_comment(cdp, column_key, student_row.get("rowIndex"), text) or {}
                else:
                    comment_result = ops.write_cell_comment(cdp, column_key, student_row.get("rowIndex"), "",
                                                            expect_current=prior_note) or {}
                if comment_result.get("ok") and comment_result.get("verified"):
                    outcome = comment_result.get("skipped") or ("wrote" if text else "cleared")
                    state.set_last_synced(str(student_id), _note_key(lesson_key), text)
                elif _comment_ownership_lost(comment_result):
                    # A teacher changed or replaced the note: it is theirs now; stop tracking it.
                    state.set_last_synced(str(student_id), _note_key(lesson_key), "")
                    outcome = f"released({comment_result.get('reason')})"
                else:
                    outcome = f"skipped({comment_result.get('reason') or 'unverified'})"
            except Exception as exc:
                outcome = f"skipped(comment error: {type(exc).__name__})"
            print(f"  student={student_id} key={lesson_key} comment: {outcome}")

    return pushed, skipped, kept


def _title_for_key(key: str, ced: bool = False) -> str:
    """The Schoology column title for a grade-target key the scope does not list."""
    prefix, _, rest = str(key).partition(":")
    if prefix == "FA" and rest:
        return components.fa_title(rest, ced)
    if prefix == "QUIZ" and rest:
        return components.quiz_title(rest, ced)
    if prefix == "BL" and rest:
        return components.bl_title(rest, ced)
    if prefix == "PC" and rest:
        return components.pc_title(rest.lstrip("Uu"), ced)
    return str(key)


def ahead_waiting_columns(deferred: dict, items_by_key: dict, column_exists,
                          ced: bool = False) -> list[dict]:
    """EFFORT_VISIBILITY_SPEC §5: scores recorded AHEAD of their column.

    deferred:      {(student_id, key): value} grade targets held back because their
                   column is not due yet (component_grades_from_class_doc keys).
    items_by_key:  the section's full (unfiltered) scope, for titles and dates.
    column_exists: title -> bool, a read of the live gradebook.

    Returns [{key, title, due_date, count}] for each column that does NOT exist yet,
    in date order, so the teacher knows which columns to create. Read-only.
    """
    counts: dict = {}
    for (_student_id, key), value in deferred.items():
        if value is None:
            continue
        counts[key] = counts.get(key, 0) + 1
    out = []
    for key, count in counts.items():
        item = items_by_key.get(key) or {}
        title = item.get("title") or _title_for_key(key, ced)
        if column_exists(title):
            continue
        out.append({"key": key, "title": title, "due_date": item.get("due_date"), "count": count})
    out.sort(key=lambda e: (e["due_date"] or "9999-12-31", e["title"]))
    return out


def ahead_waiting_line(entries: list) -> str:
    """'Ahead scores waiting for a column: 1.6 Follow-Along (4), 1.7 Quiz (3)' ('' when none)."""
    if not entries:
        return ""
    return "Ahead scores waiting for a column: " + ", ".join(
        f"{e['title']} ({e['count']})" for e in entries
    )


RENAME_TOOL = "python tools/schoology_rename_columns.py"


def rename_gate(section: str, ced: bool, rename_state: dict) -> tuple[str, str] | None:
    """Can this sync run, given the CED rename manifest? None = yes; else (code, message).

    Checked in BOTH title modes before anything touches Schoology. The manifest -- not
    title presence -- is the migration state, because during the rename an OLD title can
    legitimately be worn by a DIFFERENT, already-renamed column (old 6.1-2 becomes
    "3.3 Follow-Along", which is old 3.3's old title): matching by title then would put
    grades in the wrong column, or create duplicates.
    """
    for other, entry in sorted(rename_state.items()):
        if (entry or {}).get("status") == "in-progress":
            return ("rename-in-progress",
                    f"The CED column rename is in progress for {other}. Finish it first: "
                    f"{RENAME_TOOL} --apply --section {other} (it resumes where it stopped). "
                    "No sync runs while a rename is half done.")
    status = lib.rename_status(rename_state, section)
    if not ced and status == "done":
        return ("rename-done-flip-the-flag",
                f"{section}'s Schoology columns already carry the CED titles, so the old titles "
                "this run would use no longer exist. Finish the rename for every section "
                f"({RENAME_TOOL} --apply), then set \"schoology_titles_ced\": true in "
                "tools/schoology_sync_config.json and SCHOOLOGY_TITLES_CED=true in roster-server "
                "grade-config.js.")
    if ced and status != "done":
        return ("rename-not-done",
                f"CED titles are on, but {section}'s column rename is {status}. Rename its columns "
                f"first: {RENAME_TOOL} --section {lib.rename_state_section(section)} (read the plan), "
                f"then --apply. The sync must not run until the rename reports done.")
    return None


def unrenamed_old_titles(ops, cdp, ced_columns: dict | None = None) -> list[str]:
    """Sanity check after a DONE rename: OLD titles still in the live gradebook.

    Skips old titles that are also some column's CED title ("3.3 Follow-Along" is old
    3.3's old title AND renamed 6.1-2's new title): presence of those says nothing.
    Read-only. Requires the gradebook page loaded. Empty = consistent.
    """
    columns = ced_columns if ced_columns is not None else lib.load_ced_columns()
    real = [e for e in columns.values() if e.get("schoologyColumn")]
    ced_titles = {e["ced"] for e in real}
    found = []
    for entry in real:
        if entry["old"] == entry["ced"] or entry["old"] in ced_titles:
            continue
        if ops.find_assignment_id_by_title(cdp, entry["old"]) is not None:
            found.append(entry["old"])
    return found


def _aborted(section: str, course_id: str, dry_run: bool, code: str, msg: str) -> dict:
    print(f"[ABORT] {msg}")
    summary = {"section": section, "course_id": course_id, "dry_run": dry_run,
               "aborted": code, "errors": [msg]}
    print(json.dumps(summary, indent=2))
    return summary


def _ced_guard(section: str, course_id: str, dry_run: bool, ops, cdp) -> dict | None:
    """The rename sanity check: an aborted summary when old titles remain, else None.

    (rename_gate is the real gate; this only catches a gradebook that contradicts it,
    e.g. an old-title column created by hand after the rename.)
    """
    leftovers = unrenamed_old_titles(ops, cdp)
    if not leftovers:
        return None
    msg = (f"The rename manifest says {section} is done, but {len(leftovers)} column(s) "
           f"still carry an OLD title ({', '.join(leftovers[:5])}"
           f"{' ...' if len(leftovers) > 5 else ''}). Run {RENAME_TOOL} --section "
           f"{lib.rename_state_section(section)} to see the contradiction; rename or delete "
           "those columns before the next sync.")
    return _aborted(section, course_id, dry_run, "rename-incomplete", msg)


def _split_by_marking_period(items: list, mps: dict, grading_period_id: str) -> tuple[list, set]:
    """(items filed in this MP, keys filed elsewhere). Annotates each item's grading_period_id."""
    here, elsewhere = [], set()
    for item in items:
        filing = item.get("filing_date") or item.get("due_date")
        item["grading_period_id"] = lib.marking_period_for_date(filing, mps)
        if str(item["grading_period_id"]) == str(grading_period_id):
            here.append(item)
        else:
            elsewhere.add(item["key"])
    return here, elsewhere


def _lookup_assignment_id(section: str, lesson_key: str, state: StateStore) -> str | None:
    stored = state.get_assignment(section, lesson_key)
    return (stored or {}).get("schoology_assignment_id")


# ---------------------------------------------------------------------------
# Core orchestration
# ---------------------------------------------------------------------------

def sync_section(
    section: str,
    course_id: str,
    *,
    dry_run: bool = True,
    state: StateStore,
    grades: dict,
    ops=None,
    schedule_path: str = SCHEDULE_PATH,
    limit: int | None = None,
    force_mp_date: str | None = None,
    granularity: str = "lesson",
    quiz_topics=None,
    blooket_topics=None,
    through_date: str | None = None,
    comments: bool = False,
    class_doc: dict | None = None,
    uid_map: dict | None = None,
    ced: bool | None = None,
    rename_state: dict | None = None,
    quarter: str | None = None,
    zeros: bool = True,
    today: str | None = None,
    window_clock=None,
) -> dict:
    """Orchestrate one full sync for a single section.

    quarter: 'Q1'..'Q4' = one quarter pass (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.1).
             The gradebook is switched to that quarter's marking period and VERIFIED before
             any read or write; the pass aborts with no writes when it cannot be. Only the
             columns filed in that MP are created or graded; targets for columns filed in
             another MP are counted as grades_other_quarter (never pushed here, never errors).
             None = legacy: whatever marking period the gradebook opens on.
    zeros:   False = the fixture was built with --no-zeros: it leaves out the LAGGED zeros
             and keeps an earned 0 (work done, scored 0). The sync writes every target it
             is given, so the fixture alone decides (finding B4); zeros only keeps the
             comment texts' keys in step with that fixture.
    today:   YYYY-MM-DD for the lagged-zero comment texts (default: today in New York).
    window_clock: a manual --apply run's school clock ('HH:MM'): checked before each column
             it creates and each cell, the pass stops cleanly from 16:00 (aborted
             'rig-window', finding R3). None: never stops on the clock (main() passes
             None for dry runs and for the daily job's own steps).
             The caller holds the rig lock (main() does); sync_section never takes it.

    through_date: only scope items due on/before this YYYY-MM-DD are created and
    graded (None = no gate; the summer mock passes None via force_mp_date).

    Parameters
    ----------
    section:       'PeriodB' or 'PeriodE'
    course_id:     Schoology course id string
    dry_run:       if True, no writes are performed and state is not mutated
    state:         StateStore implementation to use
    grades:        {(student_id, lesson_key): value} -- grade targets
    ops:           schoology_ops module (or fake); if None, imported lazily
    schedule_path: override for testing
    limit:         cap scope to first N items (for smoke-testing)
    ced:           column titles: None = SCHOOLOGY_TITLES_CED from
                   tools/schoology_sync_config.json; False = old; True = CED-2026.
    rename_state:  the CED rename manifest (None = tools/.schoology-rename-state.json).

    Returns summary dict (with 'aborted' set when the rename gate refuses the run).
    """
    errors = []
    if ced is None:
        ced = lib.schoology_titles_ced()
    if rename_state is None:
        rename_state = lib.load_rename_state()
    blocked = rename_gate(section, ced, rename_state)
    if blocked:
        return _aborted(section, course_id, dry_run, *blocked)
    if quarter is not None and quarter not in lib.QUARTER_KEYS:
        return _aborted(section, course_id, dry_run, "bad-quarter",
                        f"Unknown quarter {quarter!r}; use Q1..Q4")
    pass_name = f"{lib.quarter_label(quarter)} pass" if quarter else "sync"
    comment_texts = {}
    if comments:
        from schoology_components import component_comments_from_class_doc
        try:
            comment_texts = component_comments_from_class_doc(
                class_doc or {}, uid_map, today or today_school_date(),
                quarter=quarter, zeros=zeros,
            )
        except Exception as exc:
            print(f"[comments] Text generation skipped ({type(exc).__name__})")

    # -- load schedule + build scope ----------------------------------------
    schedule = load_schedule(schedule_path)
    if granularity == "component":
        # Fine-grained per-component columns. include_undated when a force MP is
        # in play (summer mock): units 1-5 have null SY26-27 dates but must still
        # land in MP4, so they can't be date-filtered out.
        scope_items = build_component_scope(
            schedule, section,
            quiz_topics=quiz_topics,
            blooket_topics=blooket_topics,
            include_undated=bool(force_mp_date),
            ced=ced,
        )
    else:
        scope_items = build_scope(schedule, section, ced=ced)
    # The full (not date-filtered) scope: titles/dates for the ahead-scores summary (§5).
    all_items_by_key = {item["key"]: item for item in scope_items}
    if through_date is not None and not force_mp_date:
        before = len(scope_items)
        scope_items = filter_scope_through(scope_items, through_date)
        print(f"[sync_section] --through {through_date}: {len(scope_items)} of {before} scope items are due")
    # Every due column, in any marking period: each registered one needs a stamp (R4b).
    due_keys = {item["key"] for item in scope_items}

    print(f"\n[sync_section] section={section} course={course_id} "
          f"scope_items={len(scope_items)} dry_run={dry_run} "
          f"titles={'CED-2026' if ced else 'old'} pass={pass_name}")

    # -- lazy-import live ops (allows test injection) -----------------------
    if ops is None:
        sys.path.insert(0, SCRIPT_DIR)
        import schoology_ops as ops_module  # type: ignore
        ops = ops_module

    # -- connect + verify login --------------------------------------------
    print("[1/5] Connecting to Edge CDP ...")
    cdp = ops.connect(reuse=True)
    _load_gradebook_page(ops, cdp, course_id)
    login_state = ops.detect_login_state(cdp)
    if login_state != "authenticated":
        print(
            f"[AUTH] Not authenticated (state={login_state!r}).  "
            "Please sign into Schoology in the Edge window, then re-run."
        )
        sys.exit(1)

    # -- CED titles: sanity check the gradebook against the DONE manifest ----
    # A quarter pass runs it only after its marking period is verified (below).
    if ced and quarter is None:
        aborted = _ced_guard(section, course_id, dry_run, ops, cdp)
        if aborted:
            return aborted

    # -- read live data ----------------------------------------------------
    print("[2/5] Reading live Schoology data ...")
    cats = ops.list_categories(cdp, course_id)
    mps = ops.list_marking_periods(cdp, course_id)

    # -- a quarter pass: its marking period, and only the columns filed there --
    view = None
    other_quarter_keys: set = set()
    if quarter is not None:
        view = lib.pass_view(quarter, mps)
        if view is None:
            return _aborted(section, course_id, dry_run, "no-marking-period",
                            f"[{pass_name}] no Schoology marking period for {quarter} "
                            f"(read {len(mps or {})} marking periods); nothing written")
        scope_items, _ = _split_by_marking_period(scope_items, mps, view["grading_period_id"])
        _, other_quarter_keys = _split_by_marking_period(list(all_items_by_key.values()), mps,
                                                         view["grading_period_id"])
        print(f"[{pass_name}] {lib.describe_view(view)}: {len(scope_items)} due columns are filed here; "
              f"{len(other_quarter_keys)} columns belong to another marking period")
    evidence = PassEvidence(section, state, view, all_items_by_key, due_keys) if view else None
    if limit is not None:
        scope_items = scope_items[:limit]
    scope_keys = [item["key"] for item in scope_items]

    try:
        _load_gradebook_page(ops, cdp, course_id, view, evidence)
    except ViewNotVerified as exc:
        return _aborted(section, course_id, dry_run, "view-not-verified",
                        f"[{pass_name}] {exc}; nothing written")
    if view is not None:
        print(f"[{pass_name}] verified: the gradebook shows {lib.describe_view(view)}")
    if ced and quarter is not None:
        aborted = _ced_guard(section, course_id, dry_run, ops, cdp)
        if aborted:
            return aborted

    students = _list_students_stable(ops, cdp)
    students_by_id = {str(s["studentId"]): s for s in students}

    # -- build existing-assignments map from state -------------------------
    existing = {}
    for key in scope_keys:
        stored = state.get_assignment(section, key)
        existing[key] = stored or {"schoology_assignment_id": None}

    # -- plan assignment work ----------------------------------------------
    plan = lib.plan_assignment_work(scope_keys, existing)
    print(
        f"[3/5] Assignment plan: {len(plan['create'])} to create, "
        f"{len(plan['reuse'])} to reuse"
    )

    # -- create missing assignments ----------------------------------------
    assignments_created = 0
    grades_pushed = grades_skipped = grades_kept = grades_deferred = 0
    grades_other_quarter = 0
    ahead_waiting: list = []
    scope_items_by_key = {item["key"]: item for item in scope_items}

    try:
        for key in plan["create"]:
            _stop_at_rig_window(window_clock, grades_pushed)   # a create is a write too
            item = scope_items_by_key[key]
            assignment_id = _ensure_assignment(
                item, section, course_id, cats, mps, state, ops, cdp, dry_run, errors,
                force_mp_date=force_mp_date, view=view, evidence=evidence,
            )
            if assignment_id and not dry_run:
                assignments_created += 1
                # Attach id to the in-memory item for grade-push lookup
                item["schoology_assignment_id"] = assignment_id

        # Re-attach ids for reuse items (already in state)
        for key in plan["reuse"]:
            stored = state.get_assignment(section, key)
            if stored:
                scope_items_by_key[key]["schoology_assignment_id"] = stored.get(
                    "schoology_assignment_id"
                )

        # -- push grades -------------------------------------------------------
        # A quarter pass never pushes a target whose column is filed in another MP
        # (a Quarter 2 lesson's 0 can never reach an MP1 column).
        if grades and other_quarter_keys:
            other = {k for k in grades if k[1] in other_quarter_keys}
            grades_other_quarter = len(other)
            grades = {k: v for k, v in grades.items() if k not in other}
            if grades_other_quarter:
                print(f"[{pass_name}] {grades_other_quarter} grade targets belong to another "
                      "marking period (its own pass writes them)")
        # No zero filter here (finding B4): a fixture built with --no-zeros already left
        # out the lagged zeros, and the earned zeros it kept are real scores.
        # SY2627 --through gate, grade side: targets for columns that are not yet
        # due are DEFERRED (not errors) -- they get pushed on their day.
        deferred_targets: dict = {}
        if grades and through_date is not None and not force_mp_date:
            in_scope = {k: v for k, v in grades.items() if k[1] in scope_items_by_key}
            deferred_targets = {k: v for k, v in grades.items() if k[1] not in scope_items_by_key}
            grades_deferred = len(grades) - len(in_scope)
            if grades_deferred:
                print(f"[sync_section] --through {through_date}: {grades_deferred} grade targets deferred (not yet due)")
            grades = in_scope
        if not grades:
            print("[4/5] No grade targets supplied -- skipping grade push.")
        else:
            print(f"[4/5] Pushing grades ({len(grades)} targets) ...")
            _load_gradebook_page(ops, cdp, course_id, view, evidence)
            grades_pushed, grades_skipped, grades_kept = _push_grades(
                grades,
                scope_items_by_key,
                students_by_id,
                section,
                state,
                ops,
                cdp,
                dry_run,
                errors,
                comments=comments,
                comment_texts=comment_texts,
                view=view,
                window_clock=window_clock,
            )

        # -- ahead scores (EFFORT_VISIBILITY_SPEC §5, dry-run only, read-only) ----
        # Work scored before its column is due reaches Schoology only once the column
        # exists; name the missing columns so the teacher knows which to create.
        if dry_run and deferred_targets:
            _load_gradebook_page(ops, cdp, course_id, view, evidence)
            ahead_waiting = ahead_waiting_columns(
                deferred_targets, all_items_by_key,
                lambda title: ops.find_assignment_id_by_title(cdp, title) is not None,
                ced=ced,
            )
            line = ahead_waiting_line(ahead_waiting)
            if line:
                print(f"[ahead] {section}: {line}")
    except ViewNotVerified as exc:
        # A reload lost the pass's marking period (or the grid stopped matching the
        # evidence, or a manual run reached 16:00): stop before the next write.
        if isinstance(exc, GradePushStopped):
            grades_pushed = exc.pushed   # the cells written before the stop
        code = "rig-window" if isinstance(exc, RigWindowStopped) else "view-not-verified"
        msg = f"[{pass_name}] {exc}; stopped, nothing more written"
        print(f"[ABORT] {msg}")
        errors.append(msg)
        summary = {"section": section, "course_id": course_id, "dry_run": dry_run,
                   "aborted": code, "quarter": quarter,
                   "assignments_created": assignments_created, "grades_pushed": grades_pushed,
                   "errors": errors}
        print(json.dumps(summary, indent=2))
        if not dry_run:
            state.log_run(summary)
        return summary

    # -- summarise ---------------------------------------------------------
    summary = {
        "section": section,
        "course_id": course_id,
        "dry_run": dry_run,
        "quarter": quarter,
        "grading_period_id": view["grading_period_id"] if view else None,
        "scope_items": len(scope_items),
        "assignments_created": assignments_created,
        "grades_pushed": grades_pushed,
        "grades_skipped": grades_skipped,
        "grades_kept": grades_kept,
        "grades_deferred": grades_deferred,
        "grades_other_quarter": grades_other_quarter,
        "ahead_waiting": ahead_waiting,
        "errors": errors,
    }

    print("\n[5/5] Run summary:")
    print(json.dumps(summary, indent=2))

    if not dry_run:
        state.log_run(summary)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _iso_date(text: str) -> str:
    """argparse type: a real YYYY-MM-DD date."""
    from datetime import date as _date
    try:
        return _date.fromisoformat(str(text).strip()).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text!r}")


def _parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Sync AP Stats grades into Schoology for one section. "
                    "Schoology = max(app, hand-entered); the app never learns about hand entries."
    )
    p.add_argument(
        "--sync-section",
        required=True,
        choices=list(SECTION_TO_COURSE_ID.keys()),
        help="Which section to sync (PeriodB or PeriodE).",
    )
    p.add_argument(
        "--course-id",
        default=None,
        help=(
            "Schoology course id.  Defaults to the hard-coded id for the section "
            "(PeriodB=7945275782, PeriodE=7945275798)."
        ),
    )
    write_flags = p.add_mutually_exclusive_group()
    write_flags.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Print what WOULD happen; perform no writes and no state mutations.",
    )
    write_flags.add_argument("--apply", action="store_false", dest="dry_run",
                   help="Perform writes (default: dry-run).")
    comment_flags = p.add_mutually_exclusive_group()
    comment_flags.add_argument("--comments", action="store_true", dest="comments",
                               help="Opt in to BEST-EFFORT grade-cell comments.")
    comment_flags.add_argument("--no-comments", action="store_false", dest="comments",
                               help="Disable grade-cell comments (default).")
    p.set_defaults(comments=False)
    p.add_argument(
        "--grades-fixture",
        default=None,
        metavar="PATH",
        help=(
            "Path to a JSON file whose top-level keys are 'student_id/lesson_key' "
            "strings and whose values are numeric grades.  "
            "Used as the grade targets for this run."
        ),
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Cap scope to first N items.  Useful for smoke-testing.",
    )
    p.add_argument(
        "--through",
        default=None,
        help=(
            "Only create/grade columns due on or before this YYYY-MM-DD "
            "(default: today in America/New_York). Schoology shows ONLY due work."
        ),
    )
    p.add_argument(
        "--no-through",
        action="store_true",
        help="Disable the due-date gate (push every dated column).",
    )
    p.add_argument(
        "--quarter",
        choices=list(lib.QUARTER_KEYS),
        default=None,
        help=(
            "Run one quarter pass: switch the gradebook to that quarter's marking period, "
            "VERIFY it (abort with no writes if not), and create/grade only the columns "
            "filed there. Required with --apply."
        ),
    )
    p.add_argument(
        "--no-zeros",
        action="store_true",
        help=("The fixture was built with --no-zeros (lagged zeros left out, an earned 0 kept). "
              "The sync writes every target it is given; this only keeps the comment texts "
              "in step with that fixture."),
    )
    p.add_argument(
        "--today",
        type=_iso_date,
        default=None,
        metavar="YYYY-MM-DD",
        help="The date for the lagged-zero comment texts and the default --through (previews).",
    )
    p.add_argument(
        "--granularity",
        choices=["lesson", "component"],
        default="lesson",
        help=(
            "lesson (default): one coarse blended column per lesson. "
            "component: fine-grained Follow-Along / Quiz / Blooket columns "
            "(data-driven from roadmap-data + blooket-lessons; the full rollout). "
            "Use the matching --grades-fixture granularity."
        ),
    )
    return p.parse_args(argv)


def _load_grades_fixture(path: str) -> dict:
    """Load grades fixture JSON.

    File format::

        {
          "<student_id>/<lesson_key>": <numeric_value>,
          ...
        }

    Returns a {(student_id, lesson_key): value} dict.
    """
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    grades = {}
    for composite_key, value in raw.items():
        if "/" not in composite_key:
            print(f"[WARN] Skipping malformed grades fixture key: {composite_key!r}")
            continue
        student_id, lesson_key = composite_key.split("/", 1)
        grades[(student_id, lesson_key)] = value
    return grades


# The shared rig lock (schoology_sync_lib) and the exit codes of a refused start (finding R3).
RIG_LOCK_OWNER = "sync"
RIG_BUSY_EXIT = 5
RIG_WINDOW_EXIT = 3


def _is_daily_job_step(token) -> bool:
    """True for a step of tools/daily_schoology_sync.ps1: this run inherited the lock, and
    the lock's owner is a section name (PeriodB / PeriodE), which the ps1 writes."""
    return token == lib.RIG_LOCK_INHERITED and lib.is_daily_job_owner(lib.rig_lock_owner())


def main(argv=None, *, clock=None):
    """clock (tests): returns the school time 'HH:MM'; default schoology_sync_lib.school_hhmm."""
    args = _parse_args(argv)

    section = args.sync_section
    dry_run = args.dry_run
    # From 2026-11-09 the gradebook holds two marking periods: a write needs an explicit,
    # verified one (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.1). The summer mock keeps its MP4.
    if not dry_run and args.quarter is None and not SECTION_FORCE_MP_DATE.get(section):
        print("[ABORT] --apply needs --quarter Q1|Q2: every write needs an explicit, verified "
              "marking period. Nothing was written.")
        sys.exit(2)
    # Finding R3 (Codex re-review): HOLD the rig lock from before the CDP connect (inside
    # sync_section) to the end, in every mode. A step of the daily job inherits the job's
    # lock (RIG_LOCK_INHERITED) and release_rig_lock leaves it alone.
    token = lib.take_rig_lock(RIG_LOCK_OWNER)
    if token is None:
        holder = lib.rig_lock_holder(lib.RIG_LOCK_PATH) or {}
        print(f"[ABORT] the Schoology rig is busy: {lib.RIG_LOCK_PATH} is held by "
              f"{holder.get('owner') or '?'} (pid {holder.get('pid')}); nothing read or written. "
              "Wait for it to finish.")
        sys.exit(RIG_BUSY_EXIT)
    try:
        _main_on_rig(args, token, clock or lib.school_hhmm)
    finally:
        lib.release_rig_lock(token)


def _main_on_rig(args, token, clock) -> None:
    """main() once the rig lock is held (or inherited): the LIVE window, then the sync."""
    section = args.sync_section
    course_id = args.course_id or SECTION_TO_COURSE_ID[section]
    dry_run = args.dry_run
    # Finding R3: a manual run (anything but a step of the daily job) never STARTS from
    # 16:00 to 17:05, dry run included, and a manual --apply run stops before its next
    # create or cell once it is 16:00 (window_clock). The daily job's steps are exempt.
    window_clock = None
    if not _is_daily_job_step(token):
        hhmm = clock()
        if lib.in_rig_quiet_window(hhmm):
            print(f"[STOP] {rig_window_message(hhmm)}. Nothing read or written; run it before "
                  f"{lib.RIG_QUIET_WINDOW[0]} or after {lib.RIG_QUIET_WINDOW[1]}.")
            sys.exit(RIG_WINDOW_EXIT)
        if not dry_run:
            window_clock = clock
    today = args.today or today_school_date()
    class_doc = None
    if args.comments:
        from build_schoology_fixture import DEFAULT_BASE, fetch_class_grades
        secret = os.environ.get("ROSTER_TEACHER_SECRET")
        if secret:
            try:
                class_doc = fetch_class_grades(
                    os.environ.get("ROSTER_BASE", DEFAULT_BASE), section, secret,
                )
                if not class_doc.get("ok"):
                    class_doc = None
            except Exception as exc:
                class_doc = None
                print(f"[comments] class-grades unavailable ({type(exc).__name__})")
        if class_doc is None:
            print("[comments] No class-grades data; lagged-zero comments will be skipped.")

    grades: dict = {}
    if args.grades_fixture:
        grades = _load_grades_fixture(args.grades_fixture)
        print(f"[grades-fixture] Loaded {len(grades)} grade targets from {args.grades_fixture}")
    else:
        print("[grades] No --grades-fixture supplied; running with empty grade targets.")

    state = LocalJsonStateStore()

    force_mp_date = SECTION_FORCE_MP_DATE.get(section)
    if force_mp_date:
        print(f"[force-mp] section={section}: filing every assignment into the "
              f"marking period covering {force_mp_date} (summer mock -> MP4).")

    summary = sync_section(
        section,
        course_id,
        dry_run=dry_run,
        state=state,
        grades=grades,
        ops=None,  # imported lazily inside sync_section
        limit=args.limit,
        force_mp_date=force_mp_date,
        granularity=args.granularity,
        through_date=None if args.no_through else (args.through or today),
        comments=args.comments,
        class_doc=class_doc,
        quarter=args.quarter,
        zeros=not args.no_zeros,
        today=today,
        window_clock=window_clock,
    )
    # A refused run must fail the daily job (daily_schoology_sync.ps1 checks the exit code),
    # not pass silently while nothing syncs.
    if summary.get("aborted"):
        sys.exit(3)


if __name__ == "__main__":
    main()
