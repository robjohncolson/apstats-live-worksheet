#!/usr/bin/env python3
"""
build-summer-inserts.py

Reads curriculum_render/data/units.js, extracts per-topic blooket URLs for
Unit 1 (1.1-1.10), Unit 2 (all), and Unit 3 (3.1-3.5), and emits an
idempotent SQL upsert file for the `lesson_urls` Supabase table.

Re-runnable: overwrites the output SQL on each run.

Usage:
    python build-summer-inserts.py
"""
from __future__ import annotations

import datetime as _dt
import os
import re
import sys
from pathlib import Path

PROJECTS_ROOT = Path("C:/Users/rober/Downloads/Projects")
UNITS_JS = PROJECTS_ROOT / "school" / "curriculum_render" / "data" / "units.js"
WORKSHEET_DIR = PROJECTS_ROOT / "apstats-live-worksheet"
OUT_SQL = WORKSHEET_DIR / "supabase-content-summer-2026.sql"

QUIZ_BASE = "https://robjohncolson.github.io/curriculum_render/"
WORKSHEET_BASE = "https://robjohncolson.github.io/apstats-live-worksheet/"

# (unit_number, [lesson_numbers]) — topics to populate
TARGET_TOPICS: list[tuple[int, list[int]]] = [
    (1, list(range(1, 11))),  # 1.1 .. 1.10
    (2, list(range(1, 10))),  # 2.1 .. 2.9
    (3, list(range(1, 6))),   # 3.1 .. 3.5
]
PROGRESS_CHECK_UNITS = [1, 2, 3]


def load_units_js() -> str:
    return UNITS_JS.read_text(encoding="utf-8")


def parse_blookets(text: str) -> dict[str, str]:
    """
    Walk units.js, find each topic block `{ id: "U-L", ... }`, and capture the
    LAST blooket url that appears inside the block (matches JS semantics where
    a later duplicate `blookets:` key wins).

    Returns: { "1.7": "https://dashboard.blooket.com/set/...", ... }
    """
    result: dict[str, str] = {}

    # Find all topic id markers and their byte offsets.
    id_re = re.compile(r"""id:\s*["'](\d+)-(\d+|capstone|PC)["']""")
    blooket_url_re = re.compile(
        r"""url:\s*["'](https://dashboard\.blooket\.com/set/[^"']+)["']"""
    )

    matches = list(id_re.finditer(text))
    for i, m in enumerate(matches):
        unit, lesson = m.group(1), m.group(2)
        if lesson in ("capstone", "PC"):
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end]
        urls = blooket_url_re.findall(block)
        if urls:
            # Last duplicate wins (JS object literal semantics)
            result[f"{unit}.{int(lesson)}"] = urls[-1]
    return result


def worksheet_url_if_exists(unit: int, lesson: int) -> str | None:
    fname = f"u{unit}_lesson{lesson}_live.html"
    if (WORKSHEET_DIR / fname).is_file():
        return WORKSHEET_BASE + fname
    return None


def quiz_url(unit: int, lesson) -> str:
    return f"{QUIZ_BASE}?u={unit}&l={lesson}"


def sql_literal(v: str | None) -> str:
    if v is None:
        return "NULL"
    return "'" + v.replace("'", "''") + "'"


def build_row(topic: str, worksheet: str | None, drills: str | None,
              quiz: str | None, blooket: str | None) -> str:
    return (
        f"  ({sql_literal(topic)}, {sql_literal(worksheet)}, "
        f"{sql_literal(drills)}, {sql_literal(quiz)}, {sql_literal(blooket)})"
    )


def main() -> int:
    if not UNITS_JS.is_file():
        print(f"ERROR: units.js not found at {UNITS_JS}", file=sys.stderr)
        return 1

    text = load_units_js()
    blookets = parse_blookets(text)

    rows: list[str] = []
    missing_blookets: list[str] = []
    worksheets_found: list[str] = []
    worksheets_missing: list[str] = []
    rows_per_unit: dict[int, int] = {1: 0, 2: 0, 3: 0}

    for unit, lessons in TARGET_TOPICS:
        for lesson in lessons:
            topic = f"{unit}.{lesson}"
            ws = worksheet_url_if_exists(unit, lesson)
            if ws:
                worksheets_found.append(topic)
            else:
                worksheets_missing.append(topic)
            q = quiz_url(unit, lesson)
            bl = blookets.get(topic)
            if bl is None:
                missing_blookets.append(topic)
            rows.append(build_row(topic, ws, None, q, bl))
            rows_per_unit[unit] += 1

    # Progress Check rows: only quiz_url set
    pc_rows = 0
    for unit in PROGRESS_CHECK_UNITS:
        topic = f"{unit}.PC"
        q = quiz_url(unit, "PC")
        rows.append(build_row(topic, None, None, q, None))
        pc_rows += 1

    # Compose SQL
    ts = _dt.datetime.now().isoformat(timespec="seconds")
    header = f"""-- supabase-content-summer-2026.sql
-- Generated: {ts}
-- Source:    curriculum_render/data/units.js
-- Script:    apstats-live-worksheet/scripts/build-summer-inserts.py
--
-- Idempotent upsert of `lesson_urls` for Unit 1 (1.1-1.10),
-- Unit 2 (2.1-2.9), Unit 3 (3.1-3.5), and Progress Checks 1.PC/2.PC/3.PC.
--
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f supabase-content-summer-2026.sql
-- or paste into the Supabase SQL editor.
--
-- topic_schedule rows are intentionally NOT generated here; the teacher will
-- enter dates manually once the school calendar is finalized.
"""

    body = (
        "insert into lesson_urls (topic, worksheet_url, drills_url, "
        "quiz_url, blooket_url) values\n"
        + ",\n".join(rows)
        + "\non conflict (topic) do update set\n"
        "  worksheet_url = excluded.worksheet_url,\n"
        "  drills_url    = excluded.drills_url,\n"
        "  quiz_url      = excluded.quiz_url,\n"
        "  blooket_url   = excluded.blooket_url;\n"
    )

    OUT_SQL.write_text(header + "\n" + body, encoding="utf-8")

    # Validation
    total = len(rows)
    print(f"Wrote {OUT_SQL}")
    print(f"Total rows: {total}")
    for u in (1, 2, 3):
        print(f"  Unit {u}: {rows_per_unit[u]} rows")
    print(f"  Progress Checks: {pc_rows} rows")
    print(f"Worksheets found:   {len(worksheets_found)} -> {worksheets_found}")
    print(f"Worksheets missing: {len(worksheets_missing)}")
    print(f"Blookets missing for topics: {missing_blookets}")

    # Sanity check 1.7 blooket URL
    expected_17 = "https://dashboard.blooket.com/set/68d41c5fc13a43c242c08c25"
    got_17 = blookets.get("1.7")
    if got_17 != expected_17:
        print(f"WARNING: 1.7 blooket mismatch. expected={expected_17} got={got_17}")
    else:
        print(f"OK: 1.7 blooket matches expected value")

    # Quiz URL format sanity (skip PC)
    bad_q: list[str] = []
    for unit, lessons in TARGET_TOPICS:
        for lesson in lessons:
            q = quiz_url(unit, lesson)
            if q != f"{QUIZ_BASE}?u={unit}&l={lesson}":
                bad_q.append(f"{unit}.{lesson}")
    if bad_q:
        print(f"WARNING: quiz_url format anomalies: {bad_q}")

    if os.path.getsize(OUT_SQL) == 0:
        print("ERROR: output SQL is empty", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
