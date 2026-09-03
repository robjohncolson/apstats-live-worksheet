"""schoology_components.py -- data-driven FINE-GRAINED column generator for the
Schoology grade sync (the full-rollout replacement for the hard-coded 3-grid
throwaway _periody_finegrained.py).

A "component" is one gradebook column for one lesson:
  - Follow-Along  (worksheet blanks -> category 'Lesson')   key  FA:<group>
  - Quiz          (curriculum quiz  -> category 'Quizzes')   key  QUIZ:<topic>
  - Blooket       (Blooket game     -> category 'Blooket')   key  BL:<group>

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

The SAME key scheme is shared by:
  - the column generator (component_columns)  -> what the orchestrator creates
  - the live producer (component_grades_from_class_doc) -> grades from /class/grades
  - the mock fixture builder (build_periody_mock_fixture)
so a fixture key always resolves to exactly one generated column.

Pure logic. stdlib only. No I/O except the small JSON loaders. ASCII only. LF.
"""
from __future__ import annotations

import json
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


def fa_title(label: str) -> str:
    return f"{label} Follow-Along"


def quiz_title(topic_key: str) -> str:
    return f"{topic_key} Quiz"


def bl_title(label: str) -> str:
    return f"{label} Blooket"


# Unit-level component keys/titles. Keys match gradebook-grid.js EXACTLY
# (PC:U<n> / POSTER:U<n>) so the in-app grid and the Schoology push agree.
def pc_key(unit) -> str:
    return f"PC:U{unit}"


def pc_title(unit) -> str:
    return f"Unit {unit} Progress Check"


def poster_key(unit) -> str:
    return f"POSTER:U{unit}"


def poster_title(unit) -> str:
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

    Returns a list of column specs, each::

        {
          'key':        str,   # FA:<group> | QUIZ:<topic> | BL:<group>
          'kind':       str,   # 'lesson' | 'quiz' | 'blooket'
          'title':      str,   # '1.1 Follow-Along' | '1.2 Quiz' | '1.1 Blooket'
          'group_label':str,   # '1.1' | '6.1-2'
          'topic_keys': [str], # constituents (combined -> >1)
          'due_date':   str|None,
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

    columns = []
    for label, g in groups.items():
        topics_sorted = sorted(g["topics"], key=_topic_sort_key)
        unit = g["unit"]
        date = g["date"]

        # Follow-Along: one per group.
        columns.append({
            "key": fa_key(label),
            "kind": KIND_FOLLOWALONG,
            "title": fa_title(label),
            "group_label": label,
            "topic_keys": list(topics_sorted),
            "due_date": date,
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
                "title": quiz_title(tk),
                "group_label": label,
                "topic_keys": [tk],
                "due_date": tdate,
                "unit": unit,
            })

        # Blooket: one per group, only if ANY constituent has a Blooket.
        if any(tk in blooket_topics for tk in topics_sorted):
            columns.append({
                "key": bl_key(label),
                "kind": KIND_BLOOKET,
                "title": bl_title(label),
                "group_label": label,
                "topic_keys": list(topics_sorted),
                "due_date": date,
                "unit": unit,
            })

    # Per-unit Progress Check + Poster columns -- one of each for every unit that has
    # at least one (date-filtered) lesson group, UNCONDITIONALLY, mirroring
    # gradebook-grid.js buildGradebookColumns. The producer fills PC from the unit
    # mastery track (units[U#].pcRawPct); Poster has no data source yet (rubric TBD),
    # so its column is a placeholder the Schoology blend renormalizes around. Date =
    # the EARLIEST lesson date in the unit (the My Gradebook "unit underway" gate),
    # derived from the groups already filtered by include_undated.
    unit_dates = {}  # unit -> earliest group date (str) or None
    poster_dates = {}  # unit -> poster date (str) or None (event schedule only)
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
            "title": pc_title(u),
            "group_label": f"U{u}",
            "topic_keys": [],
            "due_date": udate,
            "unit": u,
        })
        columns.append({
            "key": poster_key(u),
            "kind": KIND_POSTER,
            "title": poster_title(u),
            "group_label": f"U{u}",
            "topic_keys": [],
            "due_date": pdate,
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

def component_grades_from_class_doc(doc: dict, uid_map: dict | None = None) -> dict:
    """Map a /class/grades response to {"<uid>/<component_key>": value}.

    Per student, per lesson:
      - Follow-Along <- lesson.lessonGradeNoQuiz (worksheet blanks + AI reflections,
                        the v3 Lessons-track value; falls back to Cws). One per
                        worksheet group; combined constituents share it, dedup by group.
      - Quiz         <- lesson.Q        (only when quizTotal > 0, i.e. a quiz
                        exists; an opener like 1.1 has quizTotal 0 -> skipped)
      - Blooket      <- lesson.blooket  (one per group; needs hasBlooket)

    Key resolution per student (highest priority first): the server-surfaced
    schoologyUid (P4b bridge), then uid_map, then the roster id. Mirrors
    build_schoology_fixture.build_fixture so the two stay consistent.
    """
    uid_map = uid_map or {}
    out = {}
    for s in doc.get("students", []) or []:
        rid = str(s.get("studentId"))
        surfaced = s.get("schoologyUid")
        uid = str(surfaced) if surfaced not in (None, "") else uid_map.get(rid, rid)

        emitted_fa = set()
        emitted_bl = set()
        for lesson in (s.get("lessons") or []):
            unit = lesson.get("unit")
            wk = lesson.get("worksheetKey")
            topic_key = lesson.get("lessonKey")
            if unit is None or wk is None:
                continue
            label = group_label(unit, wk)

            # Follow-Along = the v3 Lessons-track value (worksheet blanks + AI
            # reflections), so the Schoology push matches the in-app grid + v3's
            # Lessons track. Fall back to Cws if the server predates the field.
            fa_val = lesson.get("lessonGradeNoQuiz")
            if fa_val is None:
                fa_val = lesson.get("Cws")
            if fa_val is not None and label not in emitted_fa:
                out[f"{uid}/{fa_key(label)}"] = fa_val
                emitted_fa.add(label)

            q = lesson.get("Q")
            if q is not None and (lesson.get("quizTotal") or 0) > 0 and topic_key:
                out[f"{uid}/{quiz_key(topic_key)}"] = q

            blooket = lesson.get("blooket")
            if blooket is not None and lesson.get("hasBlooket") and label not in emitted_bl:
                out[f"{uid}/{bl_key(label)}"] = blooket
                emitted_bl.add(label)

        # Per-unit Progress Check from the unit-level mastery track
        # (units[U#].pcRawPct) -- the SAME source gradebook-grid.js cellValue uses.
        # Poster has no data source yet (rubric TBD), so it is intentionally NOT
        # emitted: the column exists as a placeholder and the Schoology blend
        # renormalizes over present categories (parity with node).
        for ukey, u in (s.get("units") or {}).items():
            if not isinstance(u, dict):
                continue
            pc = u.get("pcRawPct")
            if pc is not None:
                unit_num = str(ukey).lstrip("Uu") or ukey
                out[f"{uid}/{pc_key(unit_num)}"] = pc

    return out
