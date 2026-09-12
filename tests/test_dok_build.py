"""T3 / T4 — dok/build_ladder.py emission (APS_DOK_LADDER_SPEC.md §7).

Runs the generator in-process on every lesson YAML and pins:
  * student + board .tex carry NO answer text, scoring, or dok_rationale (R5 no-leak)
  * teacher .tex carries all three
  * board .tex has the first_take and every part prompt, without external links
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


def test_weekly_auto_provenance_uses_the_same_validation_and_human_channel():
    lesson = _lesson(ROOT / "dok" / "lessons" / "1.1_1.2_1.4_1.7.yaml")
    lesson["generated"] = {"by": "weekly-auto", "on": "2026-09-18", "window_days": 14}
    assert bl.validate_lesson(lesson, REGISTRY) == []
    item = REGISTRY[lesson["focus"]]
    assert item["feedback_channel"] == "feedback_dok3_human_channel"
    assert [part["dok"] for part in item["parts"]] == [1, 2, 2, 3]
    assert "E / P / I" in bl.emit_student(lesson, REGISTRY, SCHEDULE)


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
    top = (item.get("parts") or [{"label": "c"}])[-1]["label"]   # four-part remediation sheets score (d)
    assert f"SCORING PART ({top})" in tex
    assert item["frq_pattern"].replace("-", r"-\allowbreak{}") in tex


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_public_headers_use_current_ced_numbering(path: Path):
    lesson = _lesson(path)
    ced = lesson["ced2026"]
    if lesson.get("worksheets"):
        expected = bl.ced_topic_label(lesson)
    else:
        expected = f"Unit {ced['unit']} \\textperiodcentered\\ Topic {ced['topic']}"

    for ed in (bl.emit_student, bl.emit_board, bl.emit_teacher):
        tex = ed(lesson, REGISTRY, SCHEDULE)
        assert expected in tex

        if not lesson.get("worksheets") and str(lesson["topic"]) != str(ced["topic"]):
            assert f"Topic {lesson['topic']}" not in tex


def test_manifest_includes_current_ced_numbering(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(bl, "DOK", tmp_path)

    bl.write_manifest(REGISTRY)

    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    for path in LESSONS:
        lesson = _lesson(path)
        entry = manifest[str(lesson["topic"])]
        assert entry["ced_unit"] == lesson["ced2026"]["unit"]
        assert entry["ced_topic"] == lesson["ced2026"].get("topic")
        if lesson.get("worksheets"):
            assert entry["topics"] == lesson["topics"]
            assert entry["worksheets"] == lesson["worksheets"]


def test_teacher_allows_long_frq_patterns_to_wrap():
    lesson = _lesson(LESSONS[0])
    item = REGISTRY[lesson["focus"]]

    tex = bl.emit_teacher(lesson, REGISTRY, SCHEDULE)

    breakable_pattern = item["frq_pattern"].replace("-", r"-\allowbreak{}")
    assert f"{{\\small\\texttt{{{breakable_pattern}}}}}" in tex


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_board_contents(path: Path):
    lesson = _lesson(path)
    item = REGISTRY[lesson["focus"]]
    tex = bl.emit_board(lesson, REGISTRY, SCHEDULE)
    assert item["first_take"][:30] in tex
    for p in item["parts"]:
        assert p["prompt"][:30] in tex
    for worksheet in lesson.get("worksheets") or [lesson["worksheet"]]:
        assert worksheet not in tex
    assert r"\qrcode" not in tex
    assert r"\href" not in tex
    top = item["parts"][-1]["label"]
    assert f"Work (a)--({top}) from this sheet; turn it in whenever you finish." in tex
    assert "Self-paced bonus problem." in tex
    assert "landscape" in tex
    if lesson.get("rules_callout"):
        assert lesson["rules_callout"]["title"] not in tex  # rules stay on paper


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_student_is_two_sided(path: Path):
    tex = bl.emit_student(_lesson(path), REGISTRY, SCHEDULE)
    assert "FIRST TAKE" in tex
    assert tex.count("\\newpage") == 1  # front = read + commit, back = finish + turn in
    assert "summaryexitbox" not in tex
    assert "Turn this sheet in whenever you finish --- bonus credit." in tex


@pytest.mark.parametrize("path", LESSONS, ids=[p.stem for p in LESSONS])
def test_deterministic(path: Path):
    lesson = _lesson(path)
    for ed in (bl.emit_student, bl.emit_board, bl.emit_teacher):
        assert ed(lesson, REGISTRY, SCHEDULE) == ed(lesson, REGISTRY, SCHEDULE)


def test_focus_topping_at_dok2_is_rejected():
    row = json.loads(json.dumps(REGISTRY[_lesson(LESSONS[0])["focus"]]))
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

    scaled = bl.render_visual(
        {"kind": "pgfplot_hist", "bins": [0, 10], "counts": [3], "scale": 0.5},
        1.0,
    )
    assert "height=1.15in" in scaled


def test_latex_text_converts_unicode_statistics_notation():
    tex = bl.latex_text("x̄ = (1/n) Σ xᵢ; the iᵗʰ value; sₓ and s²")
    assert tex == (
        r"$\bar{x}$ = (1/n) $\sum$ $x_i$; the $i^{\mathrm{th}}$ value; "
        r"$s_x$ and $s^2$"
    )
    assert bl.latex_text("E^C, A ∩ B, or A ∪ B") == (
        r"E\textasciicircum{}C, A $\cap$ B, or A $\cup$ B"
    )
    assert bl.latex_text("μ_X = Σ x_i · P(x_i)") == (
        r"$\mu_X$ = $\sum$ $x_i$ $\cdot$ P($x_i$)"
    )
    assert bl.latex_text("H₀: p = p₀; Hₐ: p > p₀; np₀") == (
        r"$H_0$: p = $p_0$; $H_a$: p > $p_0$; $np_0$"
    )
    assert bl.latex_text("p̂1 - p̂2; p̂₁ - p̂₂; p̂_c; p₁, p₂, n₁, n₂, N₁, N₂") == (
        r"$\widehat p_1$ - $\widehat p_2$; $\widehat p_1$ - $\widehat p_2$; "
        r"$\widehat p_c$; $p_1$, $p_2$, $n_1$, $n_2$, $N_1$, $N_2$"
    )
    assert bl.latex_text("x̄₁, x̄₂, μ₀, μ₁, μ₂, μ_D, σ₁², σ₂, s₁², s₂, ȳ, ŷ") == (
        r"$\bar{x}_1$, $\bar{x}_2$, $\mu_0$, $\mu_1$, $\mu_2$, $\mu_D$, "
        r"$\sigma_1^2$, $\sigma_2$, $s_1^2$, $s_2$, $\bar{y}$, $\widehat{y}$"
    )


def test_tether_lines_remove_html_breaks_and_unsupported_stats_unicode():
    topic_15 = "\n".join(bl.tether_lines("1.5"))
    topic_17 = "\n".join(bl.tether_lines("1.7"))
    topic_72 = "\n".join(bl.tether_lines("7.2"))
    topic_86 = "\n".join(bl.tether_lines("8.6"))

    assert "<br" not in topic_15.lower()
    assert r"$\bar{x}$" in topic_17
    assert r"$\sum$" in topic_17
    assert not any(char in topic_17 for char in "̄Σᵢᵗʰₓ²")
    assert "(t*)" in topic_72 and "equals t*" in topic_72
    assert "*p*" not in topic_86
    assert "p-value" in topic_86


@pytest.mark.parametrize('path', LESSONS, ids=[p.stem for p in LESSONS])
def test_all_editions_use_printed_rules_without_viewing_prerequisites(path):
    lesson = _lesson(path)
    item = REGISTRY[lesson['focus']]
    top = item['parts'][-1]['label']
    student = bl.emit_student(lesson, REGISTRY, SCHEDULE)
    assert 'FIRST TAKE --- one sentence before you work the parts' in student
    assert f'Work (a)--({top}).' in student
    assert f'Part ({top}) is scored E / P / I.' in student
    for emitter in (bl.emit_student, bl.emit_board, bl.emit_teacher):
        tex = emitter(lesson, REGISTRY, SCHEDULE)
        assert bl.validate_printed_text(tex) == []
        assert 'watch' not in tex.lower()
        assert 'summaryexitbox' not in tex
        assert 'frameworkphaseheader' not in tex
        assert "TODAY'S PROBLEM" not in tex
        assert not bl.re.search(r'\d{4}-\d{2}-\d{2}', tex)
    assert 'minutes' not in lesson
    assert 'exit_reflection' not in lesson
    teacher = bl.emit_teacher(lesson, REGISTRY, SCHEDULE)
    assert f'Score part ({top}) only, E / P / I, by hand --- never AI-graded or auto-scored.' in teacher
    assert lesson['rules_callout']['body'].strip() in teacher


@pytest.mark.parametrize('value', ['VIDEO', 'videos', 'Watch the Video.', 'u1_video_live.html'])
def test_guard_checks_nested_registry_values(value):
    row = json.loads(json.dumps(REGISTRY[_lesson(LESSONS[0])['focus']]))
    row['parts'][0]['prompt'] = value
    errors = bl.validate_item(row, bl.all_skill_codes())
    assert any('parts[0].prompt: forbidden video reference' in error for error in errors)


@pytest.mark.parametrize('field', ['teacher', 'rules_callout', 'visuals'])
def test_guard_checks_nested_lesson_values(field):
    lesson = _lesson(LESSONS[0])
    lesson[field] = {**lesson.get(field, {}), 'note': ['Use the VIDEO.']}
    # Use the recursive guard directly because an intentionally malformed visual
    # should not need a valid renderer schema to exercise the content rule.
    errors = bl.validate_field_values(lesson)
    assert any(f'{field}.note[0]: forbidden video reference' in error for error in errors)


@pytest.mark.parametrize('field', ['worksheet', 'worksheets'])
def test_guard_allows_only_whole_filenames_in_link_fields(field):
    wrap = (lambda x: [x]) if field == 'worksheets' else (lambda x: x)
    assert bl.validate_field_values({field: wrap('u1_video_live.html')}) == []
    for invalid in ['Watch video u1_lesson1_live.html', 'u1_video_live.html then video', 'video.mp4']:
        assert bl.validate_field_values({field: wrap(invalid)})
    assert bl.validate_field_values({'stem': 'u1_video_live.html'})
    assert bl.validate_printed_text(r'\href{https://example.org/u1_video_live.html}{follow-along}')
    assert bl.validate_printed_text(r'\href{u1_video_live.html}{watch video}')


@pytest.mark.parametrize('field, value, message', [
    ('standalone', False, 'standalone: true'),
    ('misconceptions', [], 'non-empty list'),
    ('misconceptions', [''], 'non-empty list'),
    ('misconceptions', 'counts-vs-percents', 'non-empty list'),
    ('generated', None, 'generated metadata'),
    ('generated', {}, 'generated.by'),
    ('generated', {'by': 'teacher', 'on': 'bad', 'window_days': 42}, 'generated.on'),
    ('generated', {'by': 'teacher', 'on': '2026-09-12', 'window_days': 0}, 'window_days'),
])
def test_active_schema_rejects_invalid_metadata(field, value, message):
    lesson = _lesson(LESSONS[0])
    lesson[field] = value
    assert any(message in error for error in bl.validate_lesson(lesson, REGISTRY))


def test_standalone_does_not_require_calendar_or_one_worksheet_per_member():
    lesson = _lesson(LESSONS[0])
    lesson['worksheets'] = lesson['worksheets'][:1]
    assert bl.validate_lesson(lesson, REGISTRY) == []


def test_build_rejects_registry_references_before_writing(tmp_path, monkeypatch):
    registry = json.loads(json.dumps(REGISTRY))
    registry[_lesson(LESSONS[0])['focus']]['stem'] = 'Use the VIDEO.'
    monkeypatch.setattr(bl, 'TEX_DIR', tmp_path)
    with pytest.raises(SystemExit, match='stem: forbidden video reference'):
        bl.build(LESSONS[0], ('student',), registry, SCHEDULE)
    assert not list(tmp_path.glob('*.tex'))


@pytest.mark.parametrize('phrase', json.loads((ROOT / 'dok/self_paced_phrases.json').read_text()))
def test_self_paced_guard_rejects_every_phrase_in_fields_and_tex(phrase):
    value = 'Prefix ' + phrase.upper() + ' suffix'
    assert bl.validate_field_values({'nested': [{'prose': value}]})
    assert bl.validate_printed_text(value)


@pytest.mark.parametrize('value', ['45 minutes', 'one class of 12 students',
                                 '3-minute benchmark', 'Over 240 minutes: 9 freshmen',
                                 'Duration (min)', 'worksheet'])
def test_self_paced_guard_preserves_problem_data(value):
    assert bl.validate_field_values({'stem': value}) == []
    assert bl.validate_printed_text(value) == []


@pytest.mark.parametrize('field', ['minutes', 'exit_reflection', 'teacher.phase_tag',
                                 'teacher.teacher_does', 'teacher.students_do', 'teacher.adult_role'])
def test_retired_flow_fields_are_rejected_even_when_empty(field):
    lesson = _lesson(LESSONS[0])
    if field.startswith('teacher.'):
        lesson['teacher'][field.split('.')[1]] = None
    else:
        lesson[field] = None
    assert any(f'retired self-paced field {field}' in error for error in bl.validate_lesson(lesson, REGISTRY))


def test_build_rejects_self_paced_violation_before_writing(tmp_path, monkeypatch):
    registry = json.loads(json.dumps(REGISTRY))
    registry[_lesson(LESSONS[0])['focus']]['parts'][0]['prompt'] = 'Use the rules box.'
    monkeypatch.setattr(bl, 'TEX_DIR', tmp_path)
    with pytest.raises(SystemExit, match='forbidden self-paced phrase'):
        bl.build(LESSONS[0], ('student',), registry, SCHEDULE)
    assert not list(tmp_path.glob('*.tex'))
