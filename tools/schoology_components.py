"""schoology_components.py -- data-driven FINE-GRAINED column generator for the
Schoology grade sync (the full-rollout replacement for the hard-coded 3-grid
throwaway _periody_finegrained.py).

A "component" is one gradebook column for one lesson:
  - Follow-Along  (worksheet blanks -> category 'Lesson')   key  FA:<group>
  - Quiz          (curriculum quiz  -> category 'Quizzes')   key  QUIZ:<topic>
  - Blooket       (Blooket game     -> category 'Blooket')   key  BL:<group>,
                   or BL:<topic> for each day of a per-day flashcard group

Presence is DATA-DRIVEN, never a fixed grid:
  - Follow-Along exists for every lesson (one column per worksheet GROUP, so a
    combined worksheet like 6.1-2 yields ONE column, not two).
  - Quiz exists only where the topic has a quiz. roadmap-data.json urls.quiz is
    null for every X.1 opener (and combined opener-halves), so 1.1 never gets a
    Quiz column.
    KNOWN FOLLOW-UP (adversarial review 2026-06-03): this COLUMN gate reads
    roadmap urls.quiz, while the live PRODUCER fills grades from the engine's
    lesson.quizTotal (answer-key derived). The two disagree on exactly {5.6, 9.3}
    (roadmap has a quiz URL but the answer key has no gradable U#-L#-Q items),
    so those two Quiz columns would be created but never filled. The fix is to
    source quiz presence from the same quizTotal signal the producer fills (the
    in-app gradebook deriver, roster-server/gradebook-grid.js, already does this).
    Bundled with the PC+Poster column pass.
  - Blooket exists only for topics in blooket-lessons.json (the engine's
    hasBlooket denominator). Units 4-7 are absent there today (roadmap-data has
    no Blooket URLs for them) -> no Blooket columns for those units.
  - PER-DAY BLOOKET (BLOOKET_PER_DAY_COLUMNS_SPEC.md, teacher 2026-11-08): a combined
    worksheet whose deck the engine counts one score PER DAY (per_day_groups, the
    mirror of roster-server perDayDeckGroups) gets one Blooket column per day,
    BL:<topic>, instead of the group's one BL:<group> column. Each day column is dated,
    filed, zeroed and routed by its OWN lesson row, like a quiz.

The SAME key scheme is shared by:
  - the column generator (component_columns)  -> what the orchestrator creates
  - the live producer (component_grades_from_class_doc) -> grades from /class/grades
  - the mock fixture builder (build_periody_mock_fixture)
so a fixture key always resolves to exactly one generated column.

QUARTER ROUTING (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4, teacher 2026-11-07): a lesson
belongs to the quarter its ZERO date falls in (class day + 13; a zero date on a quarter's last
day or a gap day rolls to the next quarter). The daily job runs one Schoology pass per
quarter; component_grades_from_class_doc(quarter=...) emits only the targets whose column
belongs to that pass, and component_columns gives each column the 'filing_date' that picks
its marking period.

Pure logic. stdlib only. No I/O except the small JSON loaders. ASCII only. LF.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re

# ---------------------------------------------------------------------------
# Component kinds -> the SAME kinds schoology_sync_lib.KIND_TO_CATEGORY maps:
#   'lesson' -> 'Lesson', 'quiz' -> 'Quizzes', 'blooket' -> 'Blooket'.
# Reusing them means _resolve_category_id needs no change.
# ---------------------------------------------------------------------------

KIND_FOLLOWALONG = "lesson"
KIND_QUIZ = "quiz"
KIND_BLOOKET = "blooket"
# Unit-level components. The kind strings match schoology_sync_lib.KIND_TO_CATEGORY
# ('progress_check' -> 'Progress Check', 'poster' -> 'Posters'), NOT node's internal
# 'pc'/'poster' -- only the COLUMN KEYS (PC:U#, POSTER:U#) must match node.
KIND_PROGRESS_CHECK = "progress_check"
KIND_POSTER = "poster"

# Stable order within a unit so the plan reads FA, Quiz, Blooket, then the
# unit-level Progress Check + Poster (mirrors gradebook-grid.js KIND_RANK).
_COMP_RANK = {KIND_FOLLOWALONG: 0, KIND_QUIZ: 1, KIND_BLOOKET: 2, KIND_PROGRESS_CHECK: 3, KIND_POSTER: 4}


# ---------------------------------------------------------------------------
# Key + title scheme (the single source of truth shared by all three callers)
# ---------------------------------------------------------------------------

def group_label(unit, worksheet_key) -> str:
    """The human label for a worksheet GROUP: '1.1' (solo) or '6.1-2' (combined).

    A solo lesson 1.1 has worksheetKey '1' -> '1.1'. A combined 6.1/6.2 share
    worksheetKey '1-2' -> '6.1-2'.
    """
    return f"{unit}.{worksheet_key}"


def fa_key(label: str) -> str:
    return f"FA:{label}"


def quiz_key(topic_key: str) -> str:
    return f"QUIZ:{topic_key}"


def bl_key(label: str) -> str:
    return f"BL:{label}"


# ced=True swaps in the CED-2026 title from data/ced-column-titles.json (via
# schoology_sync_lib.ced_column_title); ced=False keeps today's live titles.
def _ced_title(column_key: str) -> str:
    import schoology_sync_lib
    return schoology_sync_lib.ced_column_title(column_key)


# The lesson name inside a grade-cell comment ("Missing: 1.10 Day 2 quiz"): CED once the
# Schoology titles are CED (config flag), the old key before. Students read these.
def comment_label(label: str, ced: bool | None = None) -> str:
    import schoology_sync_lib
    return schoology_sync_lib.lesson_label_for_comment(label, ced)


def fa_title(label: str, ced: bool = False) -> str:
    if ced:
        return _ced_title(fa_key(label))
    return f"{label} Follow-Along"


def quiz_title(topic_key: str, ced: bool = False) -> str:
    if ced:
        return _ced_title(quiz_key(topic_key))
    return f"{topic_key} Quiz"


def bl_title(label: str, ced: bool = False) -> str:
    if ced:
        return _ced_title(bl_key(label))
    return f"{label} Blooket"


# Unit-level component keys/titles. Keys match gradebook-grid.js EXACTLY
# (PC:U<n> / POSTER:U<n>) so the in-app grid and the Schoology push agree.
def pc_key(unit) -> str:
    return f"PC:U{unit}"


def pc_title(unit, ced: bool = False) -> str:
    if ced:
        return _ced_title(pc_key(unit))
    return f"Unit {unit} Progress Check"


def poster_key(unit) -> str:
    return f"POSTER:U{unit}"


def poster_title(unit, ced: bool = False) -> str:
    if ced:
        return _ced_title(poster_key(unit))
    return f"Unit {unit} Poster"


# ---------------------------------------------------------------------------
# Presence loaders (authoritative data sources)
# ---------------------------------------------------------------------------

def load_quiz_topics(answer_key_path: str) -> set:
    """Return the set of topicKeys that HAVE a gradable curriculum quiz.

    Sourced from the ANSWER KEY, mirroring the engine's computeQuizTotals
    (roster-server/lesson-grade.js): a topic "has a quiz" iff the answer key has a
    gradable item matching ^U#-L#-Q (case-insensitive). That shape excludes PC items
    (U#-PC-Q) and worksheet blanks (WS-U#L#-Q), and `answerKey == null` items are
    skipped as non-gradable. This is the SAME signal the live producer fills grades
    from (lesson.quizTotal > 0), so a generated Quiz column always gets a grade --
    unlike roadmap-data urls.quiz, which lists {5.6, 9.3} that have NO gradable quiz
    items, producing empty columns (the bug this fixes).
    """
    with open(answer_key_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    # The bundled answer key nests the item map under a top-level "answerKey" key --
    # the SAME map the engine feeds computeQuizTotals (via answerKeyMapOrNull). Fall
    # back to treating doc itself as the map if that key is absent.
    key_map = doc.get("answerKey")
    if not isinstance(key_map, dict):
        key_map = doc
    out = set()
    for item_id, entry in key_map.items():
        if not isinstance(entry, dict) or entry.get("answerKey") is None:
            continue  # gradable items only (answerKey null = an unscorable FRQ entry)
        m = re.match(r"^U(\d+)-L(\d+)-Q", str(item_id), re.IGNORECASE)
        if m:
            out.add(f"{m.group(1)}.{m.group(2)}")  # quizzes are per single-lesson topic
    return out


def load_blooket_topics(blooket_lessons_path: str) -> set:
    """Return the set of topicKeys that HAVE a Blooket (presence / hasBlooket UI).

    M2a presence/required split (G4):
      topics / allTopics = PRESENCE (all Blooket-bearing lessons, incl. bonus)
      requiredTopics     = grade Due denominator (core only) — NOT used here

    Schoology component columns need the presence set so bonus lessons still
    get a visible Blooket column (enrichment, never required).
    Prefer allTopics when present; fall back to topics.
    """
    with open(blooket_lessons_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    if isinstance(doc.get("allTopics"), list) and doc["allTopics"]:
        return set(doc["allTopics"])
    return set(doc.get("topics") or [])


# ---------------------------------------------------------------------------
# Per-day flashcard groups (the engine's perDayDeckGroups, mirrored; pinned by tests)
# ---------------------------------------------------------------------------

# roster-server/grade-config.js BLOOKET_PER_DAY_FROM: a sliced combined deck counts one
# score per day only when the worksheet's earliest zero date is on or after this day.
# The doc's own config is NOT read here on purpose: the columns (built from the schedule)
# and the grades (built from the doc) must use one cutoff, or a key would have no column.
BLOOKET_PER_DAY_FROM = "2026-11-13"

_TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_TOOLS_DIR)
# The engine reads the roster-server copy first (grade-contexts.js), then the root one.
_ROSTER_DECK_SLICES = os.path.join(_REPO_ROOT, "roster-server", "data", "blooket-deck-slices.json")
_ROOT_DECK_SLICES = os.path.join(_REPO_ROOT, "data", "blooket-deck-slices.json")
DECK_SLICES_PATH = _ROSTER_DECK_SLICES if os.path.exists(_ROSTER_DECK_SLICES) else _ROOT_DECK_SLICES

_deck_slices_cache = None


def load_deck_slices(path: str | None = None) -> dict:
    """The parsed blooket-deck-slices.json ({"slices": {"<csv>": {"<topic>": ranges}}}).

    No path = the engine's file, read once per process. A missing file RAISES: without it
    the per-day groups would fall back to group columns and the sync would create the
    group column the teacher retired (fail closed, never guess).
    """
    global _deck_slices_cache
    if path is not None:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    if _deck_slices_cache is None:
        with open(DECK_SLICES_PATH, "r", encoding="utf-8") as f:
            _deck_slices_cache = json.load(f)
    return _deck_slices_cache


def _slices_or_default(deck_slices):
    """None = the engine's slices file; a dict = exactly that ({} = no per-day groups)."""
    if deck_slices is None:
        return load_deck_slices()
    return deck_slices


# The schedule the sync builds its columns from (schoology_sync_section.SCHEDULE_PATH):
# the roster-server copy first (the engine's file), the root one only when it is missing.
_ROSTER_SCHEDULE = os.path.join(_REPO_ROOT, "roster-server", "data", "lesson-schedule.json")
_ROOT_SCHEDULE = os.path.join(_REPO_ROOT, "data", "lesson-schedule.json")
SCHEDULE_PATH = _ROSTER_SCHEDULE if os.path.exists(_ROSTER_SCHEDULE) else _ROOT_SCHEDULE

_schedule_lessons_cache = None


def load_schedule_lessons(path: str | None = None) -> dict:
    """The canonical lesson-schedule.json "lessons" map, read once per process.

    The producers decide per-day membership from it, never from a payload's rows: a doc
    missing one day's row must not turn a per-day group back into its retired group key.
    A missing file RAISES (fail closed, the same as the slices file).
    """
    global _schedule_lessons_cache
    if path is not None:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("lessons") or {}
    if _schedule_lessons_cache is None:
        with open(SCHEDULE_PATH, "r", encoding="utf-8") as f:
            _schedule_lessons_cache = json.load(f).get("lessons") or {}
    return _schedule_lessons_cache


def _per_day_scope(schedule_lessons, deck_slices):
    """period -> the per-day group labels of the column scope, memoised per period.

    The same per_day_groups(schedule lessons, period, slices) call component_columns
    makes, so a producer key always has a column (finding B3, 2026-11-08). With {}
    slices (per-day off, the code path from before per-day columns) the schedule is
    never read, so that path needs no schedule file.
    """
    slices = _slices_or_default(deck_slices)
    memo = {}

    def groups_for(period):
        if period in memo:
            return memo[period]
        if not (slices or {}).get("slices"):
            memo[period] = set()
            return memo[period]
        lessons = load_schedule_lessons() if schedule_lessons is None else schedule_lessons
        memo[period] = per_day_groups(lessons, period, slices)
        return memo[period]

    return groups_for


def deck_csv(unit, worksheet_key) -> str:
    """A worksheet's deck CSV, the engine's worksheetDeckCsv rule: 4 + '7-8' -> 'u4_l7_l8_blooket.csv'."""
    return f"u{unit}_l{str(worksheet_key).replace('-', '_l')}_blooket.csv"


def _lesson_entries(lessons):
    """(topic, unit, worksheetKey, {period: class day}) for schedule entries or doc rows.

    Schedule: {topic: {unit, worksheetKey, periods: {B, E}}}. A /class/grades doc:
    [{lessonKey, unit, worksheetKey, due: {B, E}}].
    """
    if isinstance(lessons, dict):
        for topic, entry in lessons.items():
            if isinstance(entry, dict):
                yield topic, entry.get("unit"), entry.get("worksheetKey"), entry.get("periods") or {}
        return
    for row in lessons or []:
        if isinstance(row, dict):
            yield row.get("lessonKey"), row.get("unit"), row.get("worksheetKey"), row.get("due") or {}


def per_day_groups(lessons, period, deck_slices=None, per_day_from: str | None = BLOOKET_PER_DAY_FROM) -> set:
    """The worksheet group labels ('4.7-8') whose deck counts one Blooket score per day.

    The engine's perDayDeckGroups: two or more topics, the deck CSV has a slices entry,
    and the group's earliest zero date (class day + 13) for the period is on or after
    per_day_from. period None = either period's dates. It accepts the schedule's
    lessons map or a list of doc rows, but every live caller passes the SCHEDULE
    (component_columns, and the producers through _per_day_scope): rows alone can miss
    a day and would decide a different scope (finding B3). deck_slices None = the
    engine's slices file.
    """
    if not per_day_from:
        return set()
    sliced = (_slices_or_default(deck_slices) or {}).get("slices")
    if not isinstance(sliced, dict) or not sliced:
        return set()
    groups = {}   # label -> {"csv": str, "topics": set, "first_zero": str | None}
    for topic, unit, wk, days in _lesson_entries(lessons):
        if unit is None or wk is None:
            continue
        label = group_label(unit, wk)
        g = groups.setdefault(label, {"csv": deck_csv(unit, wk), "topics": set(), "first_zero": None})
        g["topics"].add(topic)
        class_days = [days.get(period)] if period else [days.get("B"), days.get("E")]
        for class_day in class_days:
            zero = zero_date_of(class_day)
            if zero and (g["first_zero"] is None or zero < g["first_zero"]):
                g["first_zero"] = zero
    out = set()
    for label, g in groups.items():
        if len(g["topics"]) < 2:
            continue   # a solo worksheet is one deck already
        if g["csv"] not in sliced:
            continue
        if g["first_zero"] is None or g["first_zero"] < per_day_from:
            continue   # zeroes before the cutoff: one score per worksheet, nothing moves
        out.add(label)
    return out


# ---------------------------------------------------------------------------
# Zero dates and quarters (the engine's rules, mirrored; pinned by tests)
# ---------------------------------------------------------------------------

# roster-server/grade-config.js dueLagDays: the zero date is the class day + 13.
DUE_LAG_DAYS = 13

# roster-server/grade-config.js PHASE3_CONFIG.quarters (SY2627). Used only when a
# /class/grades doc carries no config.quarters (old payloads, unit tests).
DEFAULT_QUARTERS = {
    "Q1": {"start": "2026-09-02", "end": "2026-11-06"},
    "Q2": {"start": "2026-11-09", "end": "2027-01-22"},
    "Q3": {"start": "2027-01-25", "end": "2027-04-14"},
    "Q4": {"start": "2027-04-15", "end": "2027-06-17"},
}


def add_days(iso_date, days: int):
    """'2026-10-26' + 13 -> '2026-11-08'. None (or a malformed date) stays None."""
    try:
        return (_dt.date.fromisoformat(str(iso_date)) + _dt.timedelta(days=days)).isoformat()
    except ValueError:
        return None


def zero_date_of(class_day):
    """The lesson's zero date (class day + 13). Missing work is a 0 the day AFTER it."""
    if not class_day:
        return None
    return add_days(class_day, DUE_LAG_DAYS)


def filing_date_of(class_day):
    """The day a missing lesson becomes a 0 (zero date + 1).

    A lesson column is filed in the marking period of this day. That is the engine's own
    strict rule: a zero date ON a quarter's last day, or on a gap day, belongs to the NEXT
    quarter (QUARTER_LINE_BY_DUE_DATE_SPEC.md decision 1).
    """
    zero = zero_date_of(class_day)
    if not zero:
        return None
    return add_days(zero, 1)


def _ordered_quarters(quarters: dict) -> list:
    """Quarter keys with a start and an end, in calendar order."""
    dated = [q for q, w in (quarters or {}).items()
             if isinstance(w, dict) and w.get("start") and w.get("end")]
    return sorted(dated, key=lambda q: quarters[q]["start"])


def doc_quarters(doc: dict | None) -> dict:
    """The engine's quarter windows from a /class/grades doc (config.quarters), else the defaults."""
    quarters = ((doc or {}).get("config") or {}).get("quarters")
    if _ordered_quarters(quarters):
        return quarters
    return DEFAULT_QUARTERS


def quarter_of_date(date, quarters: dict | None = None):
    """The quarter whose window holds the date (inclusive), or None (engine quarterOfDate)."""
    quarters = quarters or DEFAULT_QUARTERS
    if not date:
        return None
    for q in _ordered_quarters(quarters):
        if quarters[q]["start"] <= date <= quarters[q]["end"]:
            return q
    return None


def zero_quarter_of(zero_date, quarters: dict | None = None):
    """The first quarter (calendar order) whose last day the zero date is due by, else None.

    Engine zeroQuarterOf under dueAfterLessonDay: zero_date < end. So a zero date on a gap
    day or ON a last day rolls to the next quarter; None means after the last quarter ends.
    """
    quarters = quarters or DEFAULT_QUARTERS
    if not zero_date:
        return None
    for q in _ordered_quarters(quarters):
        if zero_date < quarters[q]["end"]:
            return q
    return None


def lesson_quarter(lesson: dict, period, quarters: dict | None = None):
    """The quarter whose Schoology pass carries this lesson (its regular, zero-able quarter).

    The engine's own row field quarter[period] wins (zeroQuarterMembership). A never-zero
    row (zero date past the last quarter) has quarter[period] null: it counts where it was
    taught, liftQuarter[period]. A row from an engine that predates those fields is DERIVED
    here with the same rule: the later of the quarter it was taught in (its class day) and
    the quarter its zero date falls in (zeroDate[period], else class day + 13). None
    without a class day for the period.
    """
    if not period:
        return None
    field = lesson.get("quarter")
    if isinstance(field, dict) and field.get(period):
        return field[period]
    lift = lesson.get("liftQuarter")
    if isinstance(field, dict) and isinstance(lift, dict) and lift.get(period):
        return lift[period]
    quarters = quarters or DEFAULT_QUARTERS
    class_day = (lesson.get("due") or {}).get(period)
    if not class_day:
        return None
    taught = quarter_of_date(class_day, quarters)
    zero = (lesson.get("zeroDate") or {}).get(period) or zero_date_of(class_day)
    regular = zero_quarter_of(zero, quarters)
    order = _ordered_quarters(quarters)
    if regular and (taught is None or order.index(regular) > order.index(taught)):
        return regular
    return taught


def quarter_close_date(doc: dict | None, quarter: str, fallback: str | None = None):
    """The quarter's close date: /class/grades config.quarters[quarter].close, else fallback.

    The close is the evening the teacher freezes the quarter (POST /class/quarter/close);
    Quarter 1 closes Tue 2026-11-10 (teacher 2026-11-08; QUARTER_LINE_BY_DUE_DATE_SPEC.md section 2).
    """
    window = ((((doc or {}).get("config") or {}).get("quarters") or {}).get(quarter)) or {}
    return window.get("close") or fallback


def quarter_is_closed(today: str | None, close_date: str | None) -> bool:
    """True from the day AFTER the close date (the close itself happens that evening)."""
    return bool(today and close_date and today > close_date)


def quarter_has_ended(doc: dict | None, quarter: str, today: str | None) -> bool:
    """True once the quarter's last day is over (Quarter 1: from Sat 2026-11-07)."""
    end = (doc_quarters(doc).get(quarter) or {}).get("end")
    return bool(today and end and today > end)


def quarter_passes(doc: dict | None, today: str, q1_close: str | None = None) -> list:
    """The quarter passes the daily job runs on this day, in calendar order.

    Finding B3 (2026-11-08): the job used to run a hard-coded Quarter 1 and Quarter 2
    pass, so from Mon 2027-01-25 no pass would write Marking Period 3 and the Quarter 2
    pass would run forever. The passes now come from config.quarters:
      1. the quarter whose window holds today; on a gap day between two quarters (a
         weekend), or before the first one, the NEXT quarter;
      2. every EARLIER quarter that has ended but is still open for fixes: end < today
         and today <= its close date (config.quarters[Q].close). A quarter with no close
         date gets no pass once it has ended. q1_close is Quarter 1's close when the
         config has none (the ps1's -Q1Close; no other quarter has a fallback).
    After the last quarter ends nothing is current; only a closing quarter still runs.
    """
    quarters = doc_quarters(doc)
    order = _ordered_quarters(quarters)
    current = next((q for q in order if today <= quarters[q]["end"]), None)
    passes = []
    for q in order:
        if q == current:
            passes.append(q)
            continue
        if quarters[q]["end"] >= today:
            continue   # a later quarter: it has not started
        fallback = q1_close if q == "Q1" else None
        close = quarter_close_date(doc, q, fallback)
        if close and today <= close:
            passes.append(q)
    return passes


def rows_carry_quarter(doc: dict | None) -> bool:
    """True once the engine sends quarter{B,E} on lesson rows (no derivation needed)."""
    for student in (doc or {}).get("students", []) or []:
        for lesson in student.get("lessons") or []:
            if isinstance(lesson.get("quarter"), dict):
                return True
    return False


# ---------------------------------------------------------------------------
# The generator
# ---------------------------------------------------------------------------

def _topic_sort_key(topic_key: str):
    """Sort '1.10' AFTER '1.9' (numeric, not lexical)."""
    m = re.match(r"^(\d+)\.(\d+)", str(topic_key))
    if not m:
        return (9999, 9999)
    return (int(m.group(1)), int(m.group(2)))


def component_columns(
    lessons: dict,
    period_letter: str,
    *,
    quiz_topics: set,
    blooket_topics: set,
    include_undated: bool = False,
    progress_checks: dict | None = None,
    posters: dict | None = None,
    ced: bool = False,
    deck_slices: dict | None = None,
) -> list:
    """Generate the fine-grained column specs for a section.

    progress_checks / posters: the schedule's `progressChecks` / `posters` maps
    (SY2627: keyed by NEW CED unit, per-period dates). When given, the PC and
    Poster columns come from THEM (new units, PC Day 1 / poster date) — matching
    roster-server gradebook-grid.js and the `PC:U{new}` values the grade producer
    emits from units[U#].pcRawPct. When absent (older schema), fall back to one
    PC + Poster per OLD unit dated by its earliest lesson (legacy).

    lessons:         the schedule's "lessons" map (topicKey -> entry with
                     unit, worksheetKey, periods).
    period_letter:   'B' / 'E' -- which period's dates to read.
    quiz_topics:     set of topicKeys that have a quiz (load_quiz_topics).
    blooket_topics:  set of topicKeys that have a Blooket (load_blooket_topics).
    include_undated: when True, include lessons with no date for this period
                     (the summer mock forces every column into MP4 regardless of
                     the SY26-27 calendar, where units 1-5 have null dates).
                     When False, a null-date lesson is excluded (the normal
                     PeriodB/E behavior -- mirrors build_scope).
    ced:             True = CED-2026 titles (data/ced-column-titles.json); False =
                     today's titles. Keys never change, only the 'title' field.
    deck_slices:     the parsed blooket-deck-slices.json (None = the engine's file;
                     {} = no per-day groups). A per-day group gets BL:<topic> per day.

    Returns a list of column specs, each::

        {
          'key':        str,   # FA:<group> | QUIZ:<topic> | BL:<group> | BL:<topic> (per-day)
          'kind':       str,   # 'lesson' | 'quiz' | 'blooket'
          'title':      str,   # '1.1 Follow-Along' | '1.2 Quiz' | '1.1 Blooket'
          'group_label':str,   # '1.1' | '6.1-2'
          'topic_keys': [str], # constituents (combined -> >1)
          'due_date':   str|None,   # the class day: Schoology's due date + the --through gate
          'filing_date':str|None,   # picks the marking period (lessons: zero date + 1,
                                    # PC: Day 2, poster: its date)
          'unit':       int,
        }

    Sorted by (due_date, unit, worksheetKey, component-rank, topic).
    """
    # -- group lessons by worksheet group (unit.worksheetKey) --
    groups = {}  # label -> { unit, worksheet_key, topics:[], date }
    for topic_key, entry in lessons.items():
        if not entry or not isinstance(entry, dict):
            continue
        unit = entry.get("unit")
        wk = entry.get("worksheetKey")
        if unit is None or wk is None:
            continue
        periods = entry.get("periods") or {}
        date = periods.get(period_letter)
        if not date and not include_undated:
            continue
        label = group_label(unit, wk)
        g = groups.get(label)
        if g is None:
            g = {"unit": unit, "worksheet_key": wk, "topics": [], "date": None}
            groups[label] = g
        g["topics"].append(topic_key)
        if date and (g["date"] is None or date < g["date"]):
            g["date"] = date

    per_day = per_day_groups(lessons, period_letter, deck_slices)
    columns = []
    for label, g in groups.items():
        topics_sorted = sorted(g["topics"], key=_topic_sort_key)
        unit = g["unit"]
        date = g["date"]

        # Follow-Along: one per group, filed by the group's earliest lesson.
        columns.append({
            "key": fa_key(label),
            "kind": KIND_FOLLOWALONG,
            "title": fa_title(label, ced),
            "group_label": label,
            "topic_keys": list(topics_sorted),
            "due_date": date,
            "filing_date": filing_date_of(date),
            "unit": unit,
        })

        # Quiz: per topic that has a quiz.
        for tk in topics_sorted:
            if tk not in quiz_topics:
                continue
            tdate = (lessons.get(tk, {}).get("periods") or {}).get(period_letter) or date
            columns.append({
                "key": quiz_key(tk),
                "kind": KIND_QUIZ,
                "title": quiz_title(tk, ced),
                "group_label": label,
                "topic_keys": [tk],
                "due_date": tdate,
                "filing_date": filing_date_of(tdate),
                "unit": unit,
            })

        # Per-day flashcard group: one Blooket column per day that has a Blooket, dated
        # and filed by that day (the engine counts each day as its own slot once due).
        # topics_sorted holds only the days dated for this period (unless include_undated),
        # so a day with no class day (4.12) never gets a column.
        if label in per_day:
            for tk in topics_sorted:
                if tk not in blooket_topics:
                    continue
                tdate = (lessons.get(tk, {}).get("periods") or {}).get(period_letter)
                columns.append({
                    "key": bl_key(tk),
                    "kind": KIND_BLOOKET,
                    "title": bl_title(tk, ced),
                    "group_label": label,
                    "topic_keys": [tk],
                    "due_date": tdate,
                    "filing_date": filing_date_of(tdate),
                    "unit": unit,
                })
            continue

        # Blooket: one per group, only if ANY constituent has a Blooket.
        if any(tk in blooket_topics for tk in topics_sorted):
            columns.append({
                "key": bl_key(label),
                "kind": KIND_BLOOKET,
                "title": bl_title(label, ced),
                "group_label": label,
                "topic_keys": list(topics_sorted),
                "due_date": date,
                "filing_date": filing_date_of(date),
                "unit": unit,
            })

    # Per-unit Progress Check + Poster columns -- one of each for every unit that has
    # at least one (date-filtered) lesson group, UNCONDITIONALLY, mirroring
    # gradebook-grid.js buildGradebookColumns. The producer fills PC from the unit
    # mastery track (units[U#].pcRawPct) and Poster from the POSTER-U# ledger row's
    # score (a Work category: Lesson 15 / Quizzes 15 / Posters 15 / Blooket 5 /
    # Progress Check 50 in Schoology, POSTER_WORK_TRACK_SPEC.md). Date =
    # the EARLIEST lesson date in the unit (the My Gradebook "unit underway" gate),
    # derived from the groups already filtered by include_undated.
    unit_dates = {}  # unit -> earliest group date (str) or None
    poster_dates = {}  # unit -> poster date (str) or None (event schedule only)
    pc_filing = {}  # unit -> PC Day 2: a PC counts in the quarter it is due (engine pcUnitsInQuarter)
    if isinstance(progress_checks, dict) and progress_checks:
        for ukey, entry in progress_checks.items():
            try:
                u = int(str(ukey).lstrip("Uu"))
            except ValueError:
                continue
            periods = (entry or {}).get("periods") or {}
            d = periods.get(period_letter)
            if d is None and not include_undated:
                continue
            unit_dates[u] = d
            day2 = (entry or {}).get("adminDay2")
            day2 = day2.get(period_letter) if isinstance(day2, dict) else day2
            pc_filing[u] = day2 or d
            pe = ((posters or {}).get(ukey) or (posters or {}).get(str(u)) or {}).get("periods") or {}
            poster_dates[u] = pe.get(period_letter) or d
    else:
        for g in groups.values():
            u = g["unit"]
            d = g["date"]
            if u not in unit_dates or (d and (unit_dates[u] is None or d < unit_dates[u])):
                unit_dates[u] = d
    for u in sorted(unit_dates):
        udate = unit_dates[u]
        pdate = poster_dates.get(u, udate)
        columns.append({
            "key": pc_key(u),
            "kind": KIND_PROGRESS_CHECK,
            "title": pc_title(u, ced),
            "group_label": f"U{u}",
            "topic_keys": [],
            "due_date": udate,
            "filing_date": pc_filing.get(u, udate),
            "unit": u,
        })
        columns.append({
            "key": poster_key(u),
            "kind": KIND_POSTER,
            "title": poster_title(u, ced),
            "group_label": f"U{u}",
            "topic_keys": [],
            "due_date": pdate,
            "filing_date": pdate,
            "unit": u,
        })

    columns.sort(key=lambda c: (
        c["due_date"] or "",
        c["unit"],
        _topic_sort_key(c["topic_keys"][0]) if c["topic_keys"] else (9999, 9999),
        _COMP_RANK.get(c["kind"], 9),
    ))
    return columns


# ---------------------------------------------------------------------------
# Live producer: /class/grades -> component fixture
# ---------------------------------------------------------------------------

def period_of(student: dict):
    """'PeriodB' -> 'B'; anything else -> None."""
    sec = str(student.get("section") or "")
    return sec[-1] if sec.startswith("Period") and len(sec) == 7 else None


def zero_due(lesson: dict, period, today: str | None) -> bool:
    """SY2627 (teacher 2026-09-18): True once the lesson's zero date (class day +
    config.dueLagDays, surfaced by /class/grades as lesson.zeroDate[period]) HAS
    ENDED, i.e. zeroDate < today. No zero date for this period (bonus topic,
    unknown section) never zeroes; today=None disables zeroing."""
    if not today or not period:
        return False
    zd = (lesson.get("zeroDate") or {}).get(period)
    return bool(zd) and zd < today


def group_deciders(lessons: list | None, period) -> dict:
    """{group label: the lesson that decides the group's Follow-Along and Blooket columns}.

    component_columns dates and files a group's column by its EARLIEST lesson for the
    period, so that lesson decides the whole group: its zero date writes the 0, and its
    quarter picks the Schoology pass. A later sibling must never write a 0 into a column
    filed in an earlier marking period. B's 4.1-2 worksheet (4.1 zero 11/05, 4.2 zero
    11/08) is therefore a Quarter 1 column (QUARTER_LINE_BY_DUE_DATE_SPEC.md decision 2).
    A lesson with no due date for the period sorts after every dated one."""
    deciding = {}
    for lesson in lessons or []:
        unit, wk = lesson.get("unit"), lesson.get("worksheetKey")
        if unit is None or wk is None:
            continue
        label = group_label(unit, wk)
        due = (lesson.get("due") or {}).get(period)
        held = deciding.get(label)
        held_due = ((held or {}).get("due") or {}).get(period)
        if held is None or (due and (not held_due or due < held_due)):
            deciding[label] = lesson
    return deciding


def group_zero_due(lessons: list | None, period, today: str | None) -> dict:
    """{group label: zero_due} for each worksheet group's Follow-Along and Blooket columns,
    decided by the group's earliest lesson (group_deciders)."""
    return {label: zero_due(lesson, period, today)
            for label, lesson in group_deciders(lessons, period).items()}


def _quarter_units(student: dict, quarter, field: str):
    """The unit numbers in quarters[quarter][field] ('pcUnits' / 'posterUnits'), as a set.

    None when no pass is asked for (every unit goes). An absent list routes nothing:
    a unit-level column is never written into a pass it cannot be placed in.
    """
    if quarter is None:
        return None
    units = (((student.get("quarters") or {}).get(quarter)) or {}).get(field)
    if not isinstance(units, list):
        return set()
    out = set()
    for u in units:
        try:
            out.add(int(str(u).lstrip("Uu")))
        except ValueError:
            continue
    return out


# Quiz columns get the same lagged zero as Follow-Along and Blooket, starting with the
# sync run on this date (teacher 2026-09-29: "the quizzes were just an oversight";
# announced in class first). The in-app grade already counts an untaken due quiz as 0
# (lesson-grade.js quizTodo) and the Desk + the Friday slips already list it as missing;
# only Schoology left the cell blank. Override with QUIZ_ZEROS_FROM=YYYY-MM-DD for a
# dry-run preview. Before this date nothing about quiz cells changes.
_QUIZ_ZEROS_DEFAULT = "2026-10-02"


def _valid_iso_date(value) -> str | None:
    """A canonical YYYY-MM-DD string, or None (so a stray space or typo can never move the start)."""
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return None
    try:
        import datetime as _dt
        return _dt.date.fromisoformat(text).isoformat()
    except ValueError:
        return None


QUIZ_ZEROS_FROM = _valid_iso_date(os.environ.get("QUIZ_ZEROS_FROM")) or _QUIZ_ZEROS_DEFAULT


def quiz_zero_due(lesson: dict, period, today: str | None) -> bool:
    """True when an existing quiz (quizTotal > 0) was never taken (Q is None), its
    lesson's zero date has passed, and quiz zeros have started (today >= QUIZ_ZEROS_FROM)."""
    if not today or today < QUIZ_ZEROS_FROM:
        return False
    if not (lesson.get("quizTotal") or 0) > 0 or lesson.get("Q") is not None:
        return False
    return zero_due(lesson, period, today)


def component_comments_from_class_doc(doc: dict, uid_map: dict | None = None,
                                      today: str | None = None, ced: bool | None = None,
                                      quarter: str | None = None, zeros: bool = True,
                                      deck_slices: dict | None = None,
                                      schedule_lessons: dict | None = None) -> dict:
    """Fixed messages for lagged zeros; empty strings for other emitted cells.

    Use the grade producer's first-emitted group rule, including UID precedence.
    No student identity fields are interpolated into comment text. The lesson is
    named the way its Schoology column is (ced=None reads the config flag).
    quarter / zeros / deck_slices / schedule_lessons: the same filters as
    component_grades_from_class_doc, so the comment keys always match the grade targets
    of that pass. A per-day Blooket column's zero comment names its own day
    ("Missing: 2.10 Day 2 flashcards").
    """
    grades = component_grades_from_class_doc(doc, uid_map, today, quarter=quarter, zeros=zeros,
                                             deck_slices=deck_slices,
                                             schedule_lessons=schedule_lessons)
    per_day_for = _per_day_scope(schedule_lessons, deck_slices)
    out = dict.fromkeys(grades, "")
    uid_map = uid_map or {}
    for student in doc.get("students", []) or []:
        rid = str(student.get("studentId"))
        surfaced = student.get("schoologyUid")
        uid = str(surfaced) if surfaced not in (None, "") else uid_map.get(rid, rid)
        emitted = set()
        period = period_of(student)
        group_zero = group_zero_due(student.get("lessons"), period, today)
        per_day = per_day_for(period)
        for lesson in student.get("lessons") or []:
            unit, wk = lesson.get("unit"), lesson.get("worksheetKey")
            if unit is None or wk is None:
                continue
            group = group_label(unit, wk)
            label = str(lesson.get("lessonKey") or "")
            # Only curriculum labels may enter a message, never arbitrary text.
            # Accepts 1.2, 1.3-4 and full combined ranges like 1.3-1.4 (Codex review 2026-09-29).
            valid_label = re.fullmatch(r"\d+\.\d+(?:-(?:\d+\.)?\d+)?", label)
            # `label` stays the storage key (column lookups); `shown` is what the student reads.
            shown = comment_label(label, ced) if valid_label else label
            due = group_zero.get(group, False)
            worksheet = lesson.get("lessonGradeNoQuiz")
            if worksheet is None:
                worksheet = lesson.get("Cws")
            # A per-day Blooket column is this lesson's own (key BL:<topic>, its own zero date).
            bl_column, bl_due = group, due
            if group in per_day:
                bl_column, bl_due = label, zero_due(lesson, period, today)
            for kind, column, score, present, zero in (
                    ("FA", group, worksheet, True, due),
                    ("BL", bl_column, lesson.get("blooket"), lesson.get("hasBlooket"), bl_due)):
                key = f"{uid}/{kind}:{column}"
                if not present or key in emitted or (score is None and not zero):
                    continue
                emitted.add(key)
                if score is not None or not valid_label or grades.get(key) != 0:
                    continue
                if kind == "FA":
                    text = (f"Not a permanent 0. Missing: {shown} worksheet. "
                            "Finish it on the Desk (it is listed first in My Ledger) "
                            "and this grade updates at the next sync.")
                else:
                    text = (f"Not a permanent 0. Missing: {shown} flashcards "
                            "(Desk \u2192 Study Break or the lesson's Blooket). "
                            "Finish it and this grade updates at the next sync.")
                # Before quiz zeros start, the quiz cell stays blank, so mention it here.
                if (lesson.get("quizTotal") or 0) > 0 and lesson.get("Q") is None \
                        and not quiz_zero_due(lesson, period_of(student), today):
                    text += f" Your {shown} quiz is also unfinished (it counts in the Desk grade)."
                out[key] = text
            # The quiz column's own lagged zero (from QUIZ_ZEROS_FROM on).
            qkey = f"{uid}/{quiz_key(label)}" if label else None
            if (qkey and valid_label and qkey not in emitted and grades.get(qkey) == 0
                    and quiz_zero_due(lesson, period_of(student), today)):
                emitted.add(qkey)
                out[qkey] = (f"Not a permanent 0. Missing: {shown} quiz. "
                             "Take it on the Desk (it is listed first in My Ledger) "
                             "and this grade updates at the next sync.")
    return out


def component_grades_from_class_doc(doc: dict, uid_map: dict | None = None,
                                    today: str | None = None,
                                    poster_grades: dict | None = None,
                                    quarter: str | None = None,
                                    zeros: bool = True,
                                    deck_slices: dict | None = None,
                                    schedule_lessons: dict | None = None) -> dict:
    """Map a /class/grades response to {"<uid>/<component_key>": value}.

    quarter ('Q1'..'Q4'): emit ONLY the targets of that quarter's Schoology pass, a score
    or a 0 alike. A Follow-Along / Blooket group goes with its deciding lesson's quarter
    (group_deciders + lesson_quarter), a quiz with its own lesson's, a Progress Check with
    quarters[quarter].pcUnits and a Poster with quarters[quarter].posterUnits. So a
    Quarter 2 lesson can never write a 0 in the Quarter 1 pass. None = every target
    (legacy callers; the daily job always passes a quarter).
    zeros=False: scores only, no lagged zeros (the --no-zeros fallback). An earned 0
    (work done, scored 0) is a score and still goes. This is the ONLY zero filter: the
    sync writes every target the fixture holds (finding B4, 2026-11-08).

    Per student, per lesson:
      - Follow-Along <- lesson.lessonGradeNoQuiz (worksheet blanks + AI reflections,
                        the v3 Lessons-track value; falls back to Cws). One per
                        worksheet group; combined constituents share it, dedup by group.
      - Quiz         <- lesson.Q        (only when quizTotal > 0, i.e. a quiz
                        exists; an opener like 1.1 has quizTotal 0 -> skipped)
      - Blooket      <- lesson.blooket  (one per group; needs hasBlooket;
                        0 once the lesson's zero date has passed with no score)
      - Blooket, per-day group (per_day_groups; deck_slices None = the engine's file,
                        {} = none) <- EACH day's own row: key BL:<topic>, the row's
                        blooket, a 0 only after THAT row's zero date, routed by that
                        row's quarter. The row value is the engine's own per-day value:
                        max(game, whole-deck DESK_DONE, that day's DESK_DAY); another
                        day's slice score is never in it (lesson-grade.js
                        shareBlooketAcrossWorksheetGroups keeps DESK_DAY per day in a
                        per-day group). So a not-yet-due day writes its own score if it
                        has one and is blank otherwise, never the group's shared best.
                        A day with no class day for the period gets nothing (no column).
                        Membership comes from the SCHEDULE (schedule_lessons None = the
                        canonical lesson-schedule.json) + slices, exactly as
                        component_columns decides the columns, never from which rows the
                        doc holds: a day whose row is missing gets nothing (no 0), and
                        the retired BL:<group> key is never emitted for a per-day group.

    Per student, per unit:
      - Progress Check <- units[U#].pcRawPct
      - Poster         <- poster_grades[rosterId][unit]: the 90-115 score of the
                          student's POSTER-U# ledger row (see
                          build_schoology_fixture.poster_grades_from_ledger_rows),
                          emitted as-is. A legacy E/P/I letter is still accepted
                          and mapped through POSTER_SCORE. Posters are a Work
                          category (Lesson 15 / Quizzes 15 / Posters 15 /
                          Blooket 5 / Progress Check 50, POSTER_WORK_TRACK_SPEC.md).

    Key resolution per student (highest priority first): the server-surfaced
    schoologyUid (P4b bridge), then uid_map, then the roster id. Mirrors
    build_schoology_fixture.build_fixture so the two stay consistent.
    """
    uid_map = uid_map or {}
    poster_grades = poster_grades or {}
    quarters = doc_quarters(doc)
    per_day_for = _per_day_scope(schedule_lessons, deck_slices)
    out = {}
    for s in doc.get("students", []) or []:
        rid = str(s.get("studentId"))
        surfaced = s.get("schoologyUid")
        uid = str(surfaced) if surfaced not in (None, "") else uid_map.get(rid, rid)

        emitted_fa = set()
        emitted_bl = set()
        period = period_of(s)
        deciders = group_deciders(s.get("lessons"), period)
        per_day = per_day_for(period)
        group_zero = {label: zero_due(lesson, period, today) for label, lesson in deciders.items()}
        group_quarter = {label: lesson_quarter(lesson, period, quarters)
                         for label, lesson in deciders.items()}
        for lesson in (s.get("lessons") or []):
            unit = lesson.get("unit")
            wk = lesson.get("worksheetKey")
            topic_key = lesson.get("lessonKey")
            if unit is None or wk is None:
                continue
            label = group_label(unit, wk)
            # The pass filter: a group column goes with its deciding lesson, a quiz with its own.
            group_in_pass = quarter is None or group_quarter.get(label) == quarter
            quiz_in_pass = quarter is None or lesson_quarter(lesson, period, quarters) == quarter

            # Follow-Along = the v3 Lessons-track value (worksheet blanks + AI
            # reflections), so the Schoology push matches the in-app grid + v3's
            # Lessons track. Fall back to Cws if the server predates the field.
            fa_val = lesson.get("lessonGradeNoQuiz")
            if fa_val is None:
                fa_val = lesson.get("Cws")
            # SY2627 (teacher 2026-09-18): no worksheet work + zero date passed ->
            # an explicit 0 in the Follow-Along column (the focusing signal).
            # 2026-09-22: the Blooket column gets the SAME lagged zero (the Desk
            # lesson gate is gone, so the zero is the only nudge left; mirrors
            # the engine's blooketTodo). Quiz: same rule from QUIZ_ZEROS_FROM on
            # (quiz_zero_due). Best-wins on
            # the sync side means later work replaces the 0 and a higher hand
            # entry is kept. The group's earliest lesson decides the Follow-Along
            # and Blooket zero (group_zero_due); the quiz stays per lesson.
            due_zero = zeros and group_zero.get(label, False)
            if fa_val is None and due_zero:
                fa_val = 0
            if group_in_pass and fa_val is not None and label not in emitted_fa:
                out[f"{uid}/{fa_key(label)}"] = fa_val
                emitted_fa.add(label)

            q = lesson.get("Q")
            if q is None and zeros and quiz_zero_due(lesson, period, today):
                q = 0
            if quiz_in_pass and q is not None and (lesson.get("quizTotal") or 0) > 0 and topic_key:
                out[f"{uid}/{quiz_key(topic_key)}"] = q

            if label in per_day:
                day_key, day_value = _per_day_blooket(lesson, period, today, zeros)
                if quiz_in_pass and day_key:
                    out[f"{uid}/{day_key}"] = day_value
                continue

            blooket = lesson.get("blooket")
            if blooket is None and lesson.get("hasBlooket") and due_zero:
                blooket = 0
            if group_in_pass and blooket is not None and lesson.get("hasBlooket") and label not in emitted_bl:
                out[f"{uid}/{bl_key(label)}"] = blooket
                emitted_bl.add(label)

        # Per-unit Progress Check from the unit-level mastery track
        # (units[U#].pcRawPct) -- the SAME source gradebook-grid.js cellValue uses.
        pc_units = _quarter_units(s, quarter, "pcUnits")
        for ukey, u in (s.get("units") or {}).items():
            if not isinstance(u, dict):
                continue
            pc = u.get("pcRawPct")
            if pc is None:
                continue
            unit_num = str(ukey).lstrip("Uu") or ukey
            if pc_units is not None and not _unit_in(unit_num, pc_units):
                continue
            out[f"{uid}/{pc_key(unit_num)}"] = pc

        # Per-unit Poster: the POSTER-U# ledger row's 90-115 score, written to the
        # Schoology Posters category (30% of Work, POSTER_WORK_TRACK_SPEC.md). A
        # legacy letter (pre-conversion BONUS-POSTER-U# row) maps through
        # POSTER_SCORE so the column is right on both sides of the cutover.
        poster_units = _quarter_units(s, quarter, "posterUnits")
        for unit_num, value in (poster_grades.get(rid) or {}).items():
            score = poster_score(value)
            if score is None:
                continue
            if poster_units is not None and not _unit_in(unit_num, poster_units):
                continue
            out[f"{uid}/{poster_key(unit_num)}"] = score

    return out


def _per_day_blooket(lesson: dict, period, today: str | None, zeros: bool):
    """(BL:<topic>, value) for one day of a per-day flashcard group, or (None, None).

    The day's own row decides everything: its score, else a 0 once ITS zero date has
    passed (when zeros are on), else nothing. No class day for the period = no column.
    """
    topic_key = lesson.get("lessonKey")
    if not topic_key or not lesson.get("hasBlooket"):
        return None, None
    if not (lesson.get("due") or {}).get(period):
        return None, None
    value = lesson.get("blooket")
    if value is None and zeros and zero_due(lesson, period, today):
        value = 0
    if value is None:
        return None, None
    return bl_key(topic_key), value


def _unit_in(unit_num, units: set) -> bool:
    """'2' / 2 / 'U2' is in {2}."""
    try:
        return int(str(unit_num).lstrip("Uu")) in units
    except ValueError:
        return False


# Poster scale (teacher 2026-10-14): the floor is 90 and the ceiling 115, never
# the printed key's 100/85/60. These are the letter DEFAULTS; the teacher may
# enter any number in 90-115, which the POSTER-U# ledger row carries directly.
POSTER_SCORE = {"E": 115, "P": 100, "I": 90}


def poster_score(value) -> int | float | None:
    """The Schoology poster number: a number passes through, a letter maps.

    value: a numeric score (from a POSTER-U# ledger row) or an E/P/I letter
    (legacy BONUS-POSTER-U# row). None when neither.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    return POSTER_SCORE.get(str(value).strip().upper())
