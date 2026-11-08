"""Best-wins integration and DOM reads: fake ops only, no Schoology access."""
import json
from pathlib import Path
import subprocess

import pytest

from test_schoology_sync_section import FakeOps, FakeStateStore, sync_section
from test_schoology_ops import FakeCDP, ops
from schoology_sync_section import _push_grades
import schoology_sync_lib as lib


class CellOps(FakeOps):
    def __init__(self, values, *, write_ok=True):
        super().__init__(
            students=[{"studentId": f"S{i}", "rowIndex": i, "name": f"Fixture {i}"}
                      for i in range(len(values))],
            marking_periods={"MP1": {"start": "2026-01-01", "end": "2027-06-30"}},
        )
        self.values = dict(enumerate(values))
        self.reads = []
        self.write_ok = write_ok

    def read_grade_from_cell(self, cdp, column_key, row_index):
        self._require_page("gradebook", "read_grade_from_cell")
        self.reads.append((column_key, row_index))
        return self.values[row_index]

    def write_grade_to_cell(self, cdp, column_key, row_index, value):
        result = super().write_grade_to_cell(cdp, column_key, row_index, value)
        if not self.write_ok:
            return {"ok": False, "error": "fixture write failed"}
        self.values[row_index] = value
        return result


def run_sync(tmp_path, values, *, dry_run=False, state=None, cell_ops=None, target=92):
    path = tmp_path / "schedule.json"
    path.write_text(json.dumps({"lessons": {"1.1": {"unit": 1, "periods": {"B": "2026-09-08"}}}}))
    state = state or FakeStateStore()
    cell_ops = cell_ops or CellOps(values)
    summary = sync_section(
        "PeriodB", "fixture-course", dry_run=dry_run, state=state,
        grades={(f"S{i}", "1.1"): target for i in range(len(values))},
        ops=cell_ops, schedule_path=str(path),
    )
    return summary, state, cell_ops


def test_best_wins_decision_matrix_and_logged_summary(tmp_path, capsys):
    summary, state, fake = run_sync(tmp_path, [None, 95, 100, 40])
    assert summary["errors"] == []
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (2, 2, 0)
    assert [(row, value) for _, row, value in fake.written_grades] == [(0, 92), (3, 92)]
    assert [state.get_last_synced(f"S{i}", "1.1") for i in range(4)] == [92, 95, 100, 92]
    assert state.runs[-1]["grades_kept"] == 2
    output = capsys.readouterr().out
    assert "[KEEP] student=S1 key=1.1 existing=95 >= target=92" in output
    assert "[KEEP] student=S2 key=1.1 existing=100 >= target=92" in output


def test_repeat_run_skips_kept_cells_without_reading_and_later_raise_pushes(tmp_path):
    values = [None, 95, 100, 40]
    _, state, fake = run_sync(tmp_path, values)
    fake.reads.clear()
    fake.written_grades.clear()
    summary, _, _ = run_sync(tmp_path, values, state=state, cell_ops=fake)
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (0, 0, 4)
    assert fake.reads == []
    assert fake.written_grades == []
    summary, _, _ = run_sync(tmp_path, values, state=state, cell_ops=fake, target=98)
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (3, 0, 1)
    assert [row for _, row in fake.reads] == [0, 1, 3]
    assert state.get_last_synced("S2", "1.1") == 100


def test_dry_run_decisions_include_both_numbers_and_do_not_mutate(tmp_path, capsys):
    fake = CellOps([None, 95, 100, 40])
    fake._existing_titles.add(lib.assignment_title("lesson", "1.1"))
    summary, state, fake = run_sync(tmp_path, [None, 95, 100, 40], dry_run=True, cell_ops=fake)
    assert summary["errors"] == []
    assert summary["grades_kept"] == 0
    assert summary["grades_pushed"] == 0
    assert len(fake.reads) == 4
    output = capsys.readouterr().out
    for i, (existing, decision) in enumerate([(None, "PUSH"), (95, "KEEP"), (100, "KEEP"), (40, "PUSH")]):
        assert f"[DRY-RUN] WOULD {decision} student=S{i} key=1.1 existing={existing} target=92" in output
    assert fake.written_grades == []
    assert not state.runs
    assert all(state.get_last_synced(f"S{i}", "1.1") is None for i in range(4))


@pytest.mark.parametrize("existing,kept", [(92, True), (92-5e-10, True), (92-2e-9, False), (0, False)])
def test_equality_tolerance_and_zero(tmp_path, existing, kept):
    summary, state, fake = run_sync(tmp_path, [existing])
    assert summary["grades_kept"] == int(kept)
    assert summary["grades_pushed"] == int(not kept)
    assert state.get_last_synced("S0", "1.1") == (existing if kept else 92)


@pytest.mark.parametrize("key", ["FA:1.1", "QUIZ:1.1", "BL:1.1", "PC:U1", "POSTER:U1"])
def test_rule_applies_to_every_component_column(key):
    state = FakeStateStore()
    fake = CellOps([100])
    fake.current_page = "gradebook"
    fake._existing_titles.add("fixture column")
    result = _push_grades({("S0", key): 0}, {key: {"title": "fixture column"}},
                          {"S0": fake._students[0]}, "PeriodB", state, fake, None, False, [])
    assert result == (0, 0, 1)
    assert fake.written_grades == []
    assert state.get_last_synced("S0", key) == 100


def test_best_wins_holds_inside_a_verified_quarter_pass(tmp_path):
    # QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.1: the pass switches the gradebook to its marking
    # period first; best-wins (KEEP a higher hand entry) is unchanged inside it.
    class PassOps(CellOps):
        def __init__(self, values):
            super().__init__(values)
            self.selected = []

        def select_grading_period(self, cdp, gp, mp_range=None, *, expected_columns=None,
                                  reload_url=None):
            self._require_page("gradebook", "select_grading_period")
            self.selected.append(gp)
            return {"ok": True, "view": {"gp": gp}}

        # The push re-checks the shown period before every cell (finding B2).
        def displayed_grading_period(self, cdp):
            self.checks += 1
            return {"gp": self.selected[-1] if self.selected else None}

        def grading_period_view_matches(self, view, gp, mp_range=None):
            return None if (view or {}).get("gp") == gp else "the filter holds another period"

    path = tmp_path / "schedule.json"
    path.write_text(json.dumps({"lessons": {"1.1": {"unit": 1, "periods": {"B": "2026-09-08"}}}}))
    fake = PassOps([None, 95, 100, 40])
    fake.checks = 0
    summary = sync_section("PeriodB", "fixture-course", dry_run=False, state=FakeStateStore(),
                           grades={(f"S{i}", "1.1"): 92 for i in range(4)}, ops=fake,
                           schedule_path=str(path), quarter="Q1")
    assert summary["errors"] == []
    assert (summary["grades_pushed"], summary["grades_kept"]) == (2, 2)
    assert fake.selected and set(fake.selected) == {"MP1"}
    assert fake.checks == 4                      # one view check per cell, KEEP or PUSH


def test_unsuccessful_write_is_not_recorded(tmp_path):
    summary, state, fake = run_sync(tmp_path, [40], cell_ops=CellOps([40], write_ok=False))
    assert summary["grades_pushed"] == 0
    assert summary["grades_kept"] == 0
    assert len(summary["errors"]) == 1
    assert state.get_last_synced("S0", "1.1") is None


class ReadCDP(FakeCDP):
    def __init__(self, raw, *, selector="#grader-grid-cell-overall_override-0"):
        super().__init__()
        self.raw = raw
        self.selector = selector

    def eval_js(self, expr):
        self.evals.append(expr)
        if "findCellSelector" in expr:
            return json.dumps(self.selector)
        assert "input.grader-edit-input" in expr
        assert ".value" in expr
        assert ".focus(" not in expr and ".click(" not in expr
        return self.raw


@pytest.mark.parametrize("raw,expected", [("92", 92), ("92.5", 92.5), ("", None), ("\u2014", None),
                                         ("not a grade", None), ("NaN", None), ("Infinity", None), (None, None)])
def test_grade_reader_parses_numeric_inputs_only(raw, expected):
    fake = ReadCDP(raw)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) == expected
    assert fake.clicks == []
    assert fake.urls == []


def test_missing_cell_selector_returns_none_without_reading():
    fake = ReadCDP("100", selector=None)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) is None
    assert len(fake.evals) == 1


@pytest.mark.parametrize("raw,expected", [("92", 92), ("92.5", 92.5), ("", None), ("\u2014", None)])
def test_reader_executes_against_captured_gradebook_dom(raw, expected):
    class DomCDP(ReadCDP):
        def eval_js(self, expr):
            if "findCellSelector" in expr:
                return super().eval_js(expr)
            self.evals.append(expr)
            # No resources or page scripts run; only our read expression executes.
            script = r"""
const fs = require('fs');
const {JSDOM} = require('jsdom');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const dom = new JSDOM(fs.readFileSync('tests/fixtures/schoology-gradebook-apstats-sec1.html', 'utf8'), {runScripts:'outside-only'});
const input = dom.window.document.querySelector('#grader-grid-cell-overall_override-0 input.grader-edit-input');
if (!input) throw Error('Captured persistent input not found');
input.value = payload.raw;
const active = dom.window.document.activeElement;
const value = dom.window.eval(payload.expr);
if (active !== dom.window.document.activeElement || input.value !== payload.raw) throw Error('Read mutated DOM');
process.stdout.write(JSON.stringify(value));
dom.window.close();
"""
            # 90 s: loading the 2.3 MB capture in jsdom timed out at 30 s under a loaded
            # full-suite run (Codex re-review, 2026-11-08).
            result = subprocess.run(["node", "-e", script], input=json.dumps({"raw": self.raw, "expr": expr}),
                                    text=True, encoding="utf-8", capture_output=True, check=True,
                                    cwd=Path(__file__).resolve().parents[1], timeout=90)
            return json.loads(result.stdout)
    fake = DomCDP(raw)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) == expected
    assert fake.clicks == []
    assert fake.urls == []
