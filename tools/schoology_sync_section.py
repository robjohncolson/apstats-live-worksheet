"""schoology_sync_section.py -- P2 orchestration CLI for the Schoology grade-sync tool.

CLI:
    python tools/schoology_sync_section.py --sync-section PeriodB
    python tools/schoology_sync_section.py --sync-section PeriodE --course-id 7945275798
    python tools/schoology_sync_section.py --sync-section PeriodB --dry-run
    python tools/schoology_sync_section.py --sync-section PeriodB --grades-fixture path.json
    python tools/schoology_sync_section.py --sync-section PeriodB --limit 5

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

import abc
import argparse
import json
import os
import sys
from datetime import datetime
from typing import Any

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

sys.path.insert(0, SCRIPT_DIR)
import schoology_sync_lib as lib

SECTION_TO_COURSE_ID = {
    "PeriodB": "7945275782",
    "PeriodE": "7945275798",
}

PERIOD_LETTER = {
    "PeriodB": "B",
    "PeriodE": "E",
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
    """Production stub -- raises NotImplementedError.

    To implement:
    1. Run roster-server/migrations/0008_schoology_sync.sql against the Supabase project.
    2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
    3. Replace each method body with the appropriate supabase-py call.
    """

    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0008_schoology_sync.sql first, "
            "then implement get_assignment with supabase-py."
        )

    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0008_schoology_sync.sql first."
        )

    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0008_schoology_sync.sql first."
        )

    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0008_schoology_sync.sql first."
        )

    def log_run(self, summary: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0008_schoology_sync.sql first."
        )


# ---------------------------------------------------------------------------
# Schedule loading
# ---------------------------------------------------------------------------

def load_schedule(path: str = SCHEDULE_PATH) -> dict:
    """Read lesson-schedule.json and return the raw parsed dict."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_scope(schedule: dict, section: str) -> list[dict]:
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
    """
    period_letter = PERIOD_LETTER.get(section, "B")
    items = []

    # -- lessons --
    for topic_key, lesson in schedule.get("lessons", {}).items():
        date = lesson["periods"].get(period_letter)
        if not date:
            continue
        kind = lib.classify_lesson_key(topic_key)
        title = lib.assignment_title(kind, topic_key)
        items.append({
            "key": topic_key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "unit": lesson.get("unit"),
        })

    # -- progress checks --
    for unit_str, pc in schedule.get("progressChecks", {}).items():
        date = pc["periods"].get(period_letter)
        if not date:
            continue
        key = f"PC{unit_str}"
        kind = "progress_check"
        title = lib.assignment_title(kind, key)
        items.append({
            "key": key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "unit": pc.get("unit"),
        })

    # -- posters --
    for unit_str, poster in schedule.get("posters", {}).items():
        date = poster["periods"].get(period_letter)
        if not date:
            continue
        key = f"POSTER{unit_str}"
        kind = "poster"
        title = lib.assignment_title(kind, key)
        items.append({
            "key": key,
            "kind": kind,
            "title": title,
            "due_date": date,
            "unit": poster.get("unit"),
        })

    # stable sort: by date, then by key
    items.sort(key=lambda x: (x["due_date"] or "", x["key"]))
    return items


# ---------------------------------------------------------------------------
# Assignment-creation helpers
# ---------------------------------------------------------------------------

def _resolve_category_id(cats: dict, kind: str) -> str | None:
    """Map kind -> category_name -> category_id from live Schoology categories."""
    category_name = lib.KIND_TO_CATEGORY.get(kind)
    if category_name is None:
        return None
    return cats.get(category_name)


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
) -> str | None:
    """Return the Schoology assignment id for this scope item (creating if needed).

    Returns None on failure (error appended to errors list).
    """
    key = item["key"]
    kind = item["kind"]
    title = item["title"]
    due_date = item["due_date"]

    # Check state store first (idempotency: already created in a prior run)
    stored = state.get_assignment(section, key)
    if stored and stored.get("schoology_assignment_id"):
        return stored["schoology_assignment_id"]

    if dry_run:
        print(f"  [DRY-RUN] WOULD CREATE: {title!r} (kind={kind}, due={due_date})")
        return None

    # Pre-flight: does the assignment already exist in Schoology?
    existing_id = ops.find_assignment_id_by_title(cdp, title)
    if existing_id:
        print(f"  [REUSE]  Found existing assignment {existing_id!r} for {title!r}")
        state.upsert_assignment(section, key, {"schoology_assignment_id": existing_id, "title": title})
        return existing_id

    # Resolve category and marking period
    category_id = _resolve_category_id(cats, kind)
    if category_id is None:
        msg = f"No category_id for kind={kind!r} (key={key})"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    grading_period_id = lib.marking_period_for_date(due_date, mps)

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

    if not (result and result.get("ok")):
        err_msg = (result or {}).get("error") or "add_assignment returned not-ok"
        msg = f"Failed to create {title!r}: {err_msg}"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    assignment_id = result.get("assignment_id")

    # Fallback: look it up by title if id not returned
    if not assignment_id:
        assignment_id = ops.find_assignment_id_by_title(cdp, title)

    if assignment_id:
        state.upsert_assignment(section, key, {"schoology_assignment_id": assignment_id, "title": title})
        print(f"  [CREATED] {title!r} -> id={assignment_id}")
    else:
        msg = f"Created {title!r} but could not resolve assignment_id"
        print(f"  [WARN] {msg}")
        errors.append(msg)

    return assignment_id


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
) -> tuple[int, int]:
    """Push grade targets to Schoology.  Returns (pushed_count, skipped_count)."""

    # Build last-synced map for the students + keys that appear in targets
    student_ids = {sid for sid, _ in targets}
    scope_keys = {key for _, key in targets}
    last_synced_map = _build_last_synced_map(list(student_ids), list(scope_keys), state)

    actions = lib.compute_sync_actions(targets, last_synced_map)
    pushed = 0
    skipped = len(actions["skip"])

    for composite_key in actions["push"]:
        student_id, lesson_key = composite_key
        target_value = targets[composite_key]

        scope_item = scope_items_by_key.get(lesson_key)
        if scope_item is None:
            errors.append(f"No scope item for lesson_key={lesson_key!r}")
            continue

        column_key = (scope_item.get("schoology_assignment_id")
                      or _lookup_assignment_id(section, lesson_key, state))
        if column_key is None:
            errors.append(
                f"No assignment_id for lesson_key={lesson_key!r}; skipping grade push"
            )
            continue

        student_row = students_by_id.get(str(student_id))
        if student_row is None:
            errors.append(f"Student {student_id!r} not found in gradebook roster")
            continue

        row_index = student_row.get("rowIndex")

        if dry_run:
            print(
                f"  [DRY-RUN] WOULD PUSH grade={target_value} "
                f"student={student_id} key={lesson_key} col={column_key}"
            )
            continue

        result = ops.write_grade_to_cell(cdp, column_key, row_index, target_value)
        if result and result.get("ok"):
            state.set_last_synced(str(student_id), lesson_key, target_value)
            pushed += 1
        else:
            err_msg = (result or {}).get("error") or "write_grade_to_cell returned not-ok"
            msg = (
                f"Failed to push grade for student={student_id} "
                f"key={lesson_key}: {err_msg}"
            )
            print(f"  [ERROR] {msg}")
            errors.append(msg)

    return pushed, skipped


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
    dry_run: bool = False,
    state: StateStore,
    grades: dict,
    ops=None,
    schedule_path: str = SCHEDULE_PATH,
    limit: int | None = None,
) -> dict:
    """Orchestrate one full sync for a single section.

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

    Returns summary dict.
    """
    errors = []

    # -- load schedule + build scope ----------------------------------------
    schedule = load_schedule(schedule_path)
    scope_items = build_scope(schedule, section)
    if limit is not None:
        scope_items = scope_items[:limit]

    scope_keys = [item["key"] for item in scope_items]
    print(f"\n[sync_section] section={section} course={course_id} "
          f"scope_items={len(scope_items)} dry_run={dry_run}")

    # -- lazy-import live ops (allows test injection) -----------------------
    if ops is None:
        sys.path.insert(0, SCRIPT_DIR)
        import schoology_ops as ops_module  # type: ignore
        ops = ops_module

    # -- connect + verify login --------------------------------------------
    print("[1/5] Connecting to Edge CDP ...")
    cdp = ops.connect(reuse=True)
    ops.navigate(cdp, ops.gradebook_url(course_id))
    ops.inject_helpers(cdp)
    login_state = ops.detect_login_state(cdp)
    if login_state != "authenticated":
        print(
            f"[AUTH] Not authenticated (state={login_state!r}).  "
            "Please sign into Schoology in the Edge window, then re-run."
        )
        sys.exit(1)

    # -- read live data ----------------------------------------------------
    print("[2/5] Reading live Schoology data ...")
    cats = ops.list_categories(cdp, course_id)
    mps = ops.list_marking_periods(cdp, course_id)
    students = ops.list_students(cdp)
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
    scope_items_by_key = {item["key"]: item for item in scope_items}

    for key in plan["create"]:
        item = scope_items_by_key[key]
        assignment_id = _ensure_assignment(
            item, section, course_id, cats, mps, state, ops, cdp, dry_run, errors
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
    if not grades:
        print("[4/5] No grade targets supplied -- skipping grade push.")
        grades_pushed = 0
        grades_skipped = 0
    else:
        print(f"[4/5] Pushing grades ({len(grades)} targets) ...")
        grades_pushed, grades_skipped = _push_grades(
            grades,
            scope_items_by_key,
            students_by_id,
            section,
            state,
            ops,
            cdp,
            dry_run,
            errors,
        )

    # -- summarise ---------------------------------------------------------
    summary = {
        "section": section,
        "course_id": course_id,
        "dry_run": dry_run,
        "scope_items": len(scope_items),
        "assignments_created": assignments_created,
        "grades_pushed": grades_pushed,
        "grades_skipped": grades_skipped,
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

def _parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Sync AP Stats grades into Schoology for one section."
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
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what WOULD happen; perform no writes and no state mutations.",
    )
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


def main(argv=None):
    args = _parse_args(argv)

    section = args.sync_section
    course_id = args.course_id or SECTION_TO_COURSE_ID[section]
    dry_run = args.dry_run

    grades: dict = {}
    if args.grades_fixture:
        grades = _load_grades_fixture(args.grades_fixture)
        print(f"[grades-fixture] Loaded {len(grades)} grade targets from {args.grades_fixture}")
    else:
        print("[grades] No --grades-fixture supplied; running with empty grade targets.")

    state = LocalJsonStateStore()

    sync_section(
        section,
        course_id,
        dry_run=dry_run,
        state=state,
        grades=grades,
        ops=None,  # imported lazily inside sync_section
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
