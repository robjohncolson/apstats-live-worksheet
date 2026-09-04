"""T3 / T4 — dok/build_ladder.py emission (APS_DOK_LADDER_SPEC.md §7).

Runs the generator in-process on every lesson YAML and pins:
  * student + board .tex carry NO answer text, scoring, or dok_rationale (R5 no-leak)
  * teacher .tex carries all three
  * board .tex has the first_take, every part prompt, the worksheet link — and NOT the rules callout
  * output is deterministic (two runs, byte-identical)
  * a focus row that tops out at DOK 2 is rejected naming §1.3 (every lesson carries a DOK-3)
  * visuals carry data + labels only (T4)
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("build_ladder", ROOT / "dok" / "build_ladder.py")
bl = importlib.util.module_from_spec(SPEC)
sys.modules["build_ladder"] = bl
SPEC.loader.exec_module(bl)

LESSONS = sorted((ROOT / "dok" / "lessons").glob("*.yaml"))
REGISTRY = bl.load_registry()
SCHEDULE = bl.load_schedule()


def _lesson(path: Path) -> dict:
    return bl.load_lesson(path)


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_validate_clean(path: Path):
    assert bl.validate_lesson(_lesson(path), REGISTRY) == []


def test_registry_rows_validate():
    codes = bl.all_skill_codes()
    problems = [p for row in REGISTRY.values() for p in bl.validate_item(row, codes)]
    assert problems == []


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_no_leak_student_and_board(path: Path):
    lesson = _lesson(path)
    item = REGISTRY[lesson["focus"]]
    secrets = list(item["answers"].values()) + [item["dok_rationale"]] + [
        item["scoring"]["scoringGuide"][k] for k in ("E", "P", "I")
    ]
    for ed in (bl.emit_student, bl.emit_board):
        tex = ed(lesson, REGISTRY, SCHEDULE)
        for s in secrets:
            assert s[:40] not in tex, f"{ed.__name__} leaks: {s[:40]!r}"
        assert "\\answer{" not in tex.replace("\\renewcommand{\\answer}[1]{}", "")


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_teacher_has_key_and_scoring(path: Path):
    lesson = _lesson(path)
    item = REGISTRY[lesson["focus"]]
    tex = bl.emit_teacher(lesson, REGISTRY, SCHEDULE)
    for label, ans in item["answers"].items():
        assert ans[:40] in tex, f"teacher key missing answer ({label})"
    assert item["dok_rationale"][:40] in tex
    assert "SCORING PART (c)" in tex
    assert item["frq_pattern"] in tex


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_board_contents(path: Path):
    lesson = _lesson(path)
    item = REGISTRY[lesson["focus"]]
    tex = bl.emit_board(lesson, REGISTRY, SCHEDULE)
    assert item["first_take"][:30] in tex
    for p in item["parts"]:
        assert p["prompt"][:30] in tex
    assert lesson["worksheet"] in tex
    assert "landscape" in tex
    if lesson.get("rules_callout"):
        assert lesson["rules_callout"]["title"] not in tex  # rules stay on paper


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_student_is_two_sided(path: Path):
    tex = bl.emit_student(_lesson(path), REGISTRY, SCHEDULE)
    assert "FIRST TAKE" in tex
    assert tex.count("\\newpage") == 1  # front = read + commit, back = finish + turn in
    assert "EXIT --- turn this in" in tex


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_deterministic(path: Path):
    lesson = _lesson(path)
    for ed in (bl.emit_student, bl.emit_board, bl.emit_teacher):
        assert ed(lesson, REGISTRY, SCHEDULE) == ed(lesson, REGISTRY, SCHEDULE)


def test_focus_topping_at_dok2_is_rejected():
    row = json.loads(json.dumps(REGISTRY["aps-1.6-d3-1"]))
    row["dok"] = 2
    row["parts"][-1]["dok"] = 2
    problems = bl.validate_item(row, bl.all_skill_codes())
    assert any("1.3" in p for p in problems), problems


def test_missing_focus_is_rejected():
    lesson = _lesson(LESSONS[0])
    lesson["focus"] = None
    assert any("focus" in p for p in bl.validate_lesson(lesson, REGISTRY))


def test_visual_allowlist_rejects_annotations():
    assert bl.validate_visual({"kind": "pgfplot_hist", "bins": [0, 1], "counts": [1], "outlier_arrow": "70"}) != []
    assert bl.validate_visual({"kind": "pgfplot_hist", "bins": [0, 1], "counts": [1], "xlabel": "x"}) == []
    assert bl.validate_visual({"kind": "nope"}) != []


def test_hist_renders_every_bin():
    tex = bl.render_hist({"bins": [0, 10, 20], "counts": [3, 5], "xlabel": "x", "ylabel": "y"}, 1.0)
    assert "(0,3)" in tex and "(10,5)" in tex and "(20,0)" in tex
