"""Tests for the official-grade rule (OFFICIAL_GRADE_SYNC_SPEC.md sections 2 + 6).

ASCII only. LF line endings.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import schoology_official as so  # noqa: E402


class TestOfficialGrade(unittest.TestCase):
    """The spec's worked examples, teacher decisions of 2026-10-02."""

    def check(self, work, pc, banked, early, official, rule=None):
        res = so.official_grade(work, pc, banked, early)
        self.assertEqual(res["official"], official)
        if rule:
            self.assertEqual(res["rule"], rule)

    def test_angie_pc_wins(self):
        self.check(68.9, 94.4, 0, 1, 95.4, "PC")

    def test_olivia_early_bonus_carries_her_over_the_line(self):
        self.check(39.75, 100, 0, 2, 100.0, "PC")

    def test_darla_banked_plus_early_bonus_cross_the_line(self):
        self.check(36.1, 66.7, 3, 2, 68.7, "PC")

    def test_andrew_stays_under_the_line(self):
        self.check(30.9, 61.1, 0, 1, 31.9, "work (under 40)")

    def test_bonus_alone_carries_over(self):
        self.check(38, 90, 5, 0, 90.0, "PC")

    def test_work_higher_than_pc(self):
        self.check(91.7, 61.1, 0, 5, 96.7, "work")

    def test_capped_at_100(self):
        self.check(99, 100, 0, 5, 100.0)

    def test_no_pc_on_file(self):
        self.check(70, None, 0, 3, 73.0, "work")

    def test_no_work_grade_yet(self):
        self.assertIsNone(so.official_grade(None, 90, 0, 0))

    def test_a_low_pc_never_lowers(self):
        self.check(85, 40, 0, 0, 85.0, "work")


class TestWorkGrade(unittest.TestCase):
    cells = {
        "1.1 Follow-Along": 101.7, "1.2 Follow-Along": 100.2, "1.3 Follow-Along": 100,
        "1.4 Follow-Along": 99, "1.5 Follow-Along": 100, "1.6 Follow-Along": 0,
        "1.2 Quiz": 100, "1.3 Quiz": 100, "1.4 Quiz": 66.7, "1.5 Quiz": None,
        "1.1 Blooket": 100, "1.2 Blooket": 95.6, "1.3 Blooket": 0, "1.4 Blooket": 0,
        "1.5 Blooket": 0, "1.6 Blooket": 0,
    }

    def test_matches_schoologys_calculation(self):
        # Allison's Period B row on 2026-10-01: Schoology showed 78.54 under the
        # 15/15/15/5 weights with no poster cell yet, i.e. renormalised over
        # Lesson/Quizzes/Blooket: (15*83.48 + 15*88.9 + 5*32.6) / 35 = 78.54.
        self.assertAlmostEqual(so.work_from_cells(self.cells), 78.54, places=1)

    def test_work_weights_are_15_15_15_5_with_posters(self):
        # POSTER_WORK_TRACK_SPEC.md: posters are a Work category again.
        self.assertEqual(so.WORK_WEIGHTS, {"Lesson": 15, "Quizzes": 15, "Posters": 15, "Blooket": 5})

    def test_a_poster_cell_counts_at_15(self):
        # (15*83.48 + 15*88.9 + 15*115 + 5*32.6) / 50 = 89.47
        cells = dict(self.cells, **{"Unit 1 Poster": 115})
        self.assertAlmostEqual(so.work_from_cells(cells), 89.47, places=1)
        cells = dict(self.cells, **{"Unit 1 Poster": 90})
        self.assertAlmostEqual(so.work_from_cells(cells), 81.97, places=1)

    def test_a_missing_poster_cell_is_absent_not_zero(self):
        # An empty poster cell renormalises over the other categories (spec 1.4).
        cells = dict(self.cells, **{"Unit 1 Poster": None})
        self.assertAlmostEqual(so.work_from_cells(cells), 78.54, places=1)

    def test_calc_is_used_until_a_progress_check_column_exists(self):
        self.assertEqual(so.work_grade(78.54, self.cells), 78.54)

    def test_progress_check_column_is_left_out_of_work(self):
        cells = dict(self.cells, **{"Unit 1 Progress Check": 30})
        self.assertAlmostEqual(so.work_grade(60.0, cells), 78.54, places=1)


class TestPcForQuarter(unittest.TestCase):
    def test_mean_of_the_quarters_units_on_file(self):
        student = {"quarters": {"Q1": {"pcUnits": [1, 2]}},
                   "units": {"U1": {"pcRawPct": 61.1}, "U2": {"pcRawPct": None}}}
        self.assertEqual(so.pc_for_quarter(student, "Q1"), 61.1)

    def test_none_when_nothing_on_file(self):
        self.assertIsNone(so.pc_for_quarter({"quarters": {"Q1": {"pcUnits": [1]}}, "units": {}}, "Q1"))


class TestPublish(unittest.TestCase):
    """post_official_grades sends the Desk the same numbers written to Schoology."""

    item = {"studentId": "stu_b", "work": 39.75, "pc": 100.0, "early": 2, "banked": 0,
            "result": so.official_grade(39.75, 100.0, 0, 2)}

    def test_sends_one_grade_per_student_with_its_parts(self):
        sent = {}

        class Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b'{"ok": true, "saved": 1}'

        def fake_urlopen(req, timeout=0):
            sent["url"] = req.full_url
            sent["body"] = json.loads(req.data.decode("utf-8"))
            return Resp()

        with mock.patch.object(so, "urlopen", fake_urlopen):
            status = so.post_official_grades("Q1", [self.item, {"studentId": "x", "result": None}], "s")
        self.assertEqual(status, (True, "published 1 official grades to the Desk"))
        self.assertTrue(sent["url"].endswith("/class/official-grades"))
        self.assertEqual(sent["body"]["quarter"], "Q1")
        self.assertEqual(sent["body"]["grades"], [{
            "studentId": "stu_b", "official": 100.0, "work": 39.75, "pc": 100.0, "base": 100.0,
            "line": 41.75, "earlyBonus": 2, "bankedBonus": 0, "rule": "PC"}])

    def test_missing_table_is_reported_not_raised(self):
        def fake_urlopen(req, timeout=0):
            raise so.HTTPError(req.full_url, 503, "x", {}, None)

        with mock.patch.object(so, "urlopen", fake_urlopen):
            ok, message = so.post_official_grades("Q1", [self.item], "s")
        self.assertFalse(ok)
        self.assertIn("migration 0038", message)

    def test_a_failed_request_is_not_ok(self):
        # Finding A7: --final must know the publish failed, so it can publish again.
        def http_500(req, timeout=0):
            raise so.HTTPError(req.full_url, 500, "x", {}, None)

        def offline(req, timeout=0):
            raise so.URLError("no route")

        with mock.patch.object(so, "urlopen", http_500):
            self.assertEqual(so.post_official_grades("Q1", [self.item], "s"),
                             (False, "Desk publish FAILED: HTTP 500"))
        with mock.patch.object(so, "urlopen", offline):
            self.assertEqual(so.post_official_grades("Q1", [self.item], "s"),
                             (False, "Desk publish FAILED: URLError"))

    def test_nothing_to_publish_is_ok(self):
        self.assertEqual(so.post_official_grades("Q1", [{"studentId": "x", "result": None}], "s"),
                         (True, "nothing to publish"))


class TestBankedBonusPoints(unittest.TestCase):
    """Banked DOK sheets count x1.5; a legacy BONUS-POSTER-U# row is never bonus."""

    def test_poster_rows_are_skipped_so_a_poster_never_counts_twice(self):
        rows = [
            {"item_id": "BONUS-screen-time", "source": "bonus", "score": 5, "response": '{"grade":"E","quarter":"Q1"}'},
            {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 5, "response": '{"grade":"E","quarter":"Q1"}'},
            {"itemId": "bonus-poster-u2", "source": "bonus", "score": 3, "response": '{"grade":"P"}'},
            {"item_id": "BONUS-APPLIED-Q1", "source": "bonus_applied", "score": 91},
        ]
        with mock.patch.object(so, "roster_get", lambda path, secret: {"rows": rows}):
            self.assertEqual(so.banked_bonus_points("stu", "Q1", "s"), 7.5)

    def test_mirrors_the_engine_quarter_and_stored_score(self):
        # Finding A8: roster-server/class.js bankedBonus counts a row only for the quarter its
        # response names, and only with a stored score of 1, 3 or 5.
        rows = [
            {"item_id": "BONUS-a", "source": "bonus", "score": 5, "response": "{}"},              # no quarter
            {"item_id": "BONUS-b", "source": "bonus", "score": 4, "response": '{"quarter":"Q1"}'},  # not 1/3/5
            {"item_id": "BONUS-c", "source": "bonus", "score": 2.5, "response": '{"quarter":"Q1"}'},
            {"item_id": "BONUS-d", "source": "bonus", "score": "3", "response": '{"quarter":"Q1"}'},  # numeric string
            {"item_id": "BONUS-e", "source": "bonus", "score": None, "response": '{"quarter":"Q1"}'},
            {"item_id": "BONUS-f", "source": "bonus", "score": 1, "response": "not json"},
            {"item_id": "BONUS-g", "source": "bonus", "score": 1, "response": '{"quarter":"Q2"}'},
        ]
        with mock.patch.object(so, "roster_get", lambda path, secret: {"rows": rows}):
            self.assertEqual(so.banked_bonus_points("stu", "Q1", "s"), 4.5)   # only BONUS-d: 3 x 1.5
            self.assertEqual(so.banked_bonus_points("stu", "Q2", "s"), 1.5)   # only BONUS-g
            self.assertEqual(so.banked_bonus_points("stu", "Q3", "s"), 0.0)


class TestBonusMultiplier(unittest.TestCase):
    """Teacher 2026-10-03: bonus sheets count 1.5x, everywhere, retroactively."""

    def test_matches_the_server(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, "roster-server", "grade-config.js"), encoding="utf-8") as fh:
            server = re.search(r"export const BONUS_MULTIPLIER = ([0-9.]+);", fh.read())
        self.assertEqual(so.BONUS_MULTIPLIER, 1.5)
        self.assertEqual(float(server.group(1)), so.BONUS_MULTIPLIER)

    def test_banked_points_are_multiplied(self):
        rows = [{"source": "bonus", "score": 5, "response": json.dumps({"quarter": "Q1"})},
                {"source": "bonus", "score": 3, "response": json.dumps({"quarter": "Q2"})},
                {"source": "bonus_applied", "score": 90, "response": "{}"}]
        with mock.patch.object(so, "roster_get", lambda path, secret: {"rows": rows}):
            self.assertEqual(so.banked_bonus_points("stu", "Q1", "s"), 7.5)


def grid_rows(gradebook: dict) -> dict:
    """The reader's JSON rows {y: {cells, calc, override}} for a test gradebook {uid: {row, ...}}."""
    return {str(r["row"]): {"cells": r.get("cells", {}), "calc": r.get("calc"), "override": r.get("override")}
            for r in gradebook.values()}


class GridCdp:
    """A cdp whose gradebook reader (READ_ROWS_JS / read_row_js) answers from `rows`.

    rows: {y: {cells, calc, override}}. Tests change it to show Schoology changing while a
    run goes (finding R2: the fresh read right before each write).
    """

    def __init__(self, rows):
        self.rows = rows
        self.reads = 0

    def eval_js(self, expr):
        assert "readRows(" in expr, expr[:80]
        self.reads += 1
        return json.dumps(self.rows)


class SavingGrid(GridCdp):
    """ops + cdp for the REAL write_official (finding R5, Codex re-review).

    write_override passes on the typed editor value, as ops.write_grade_to_cell does for an
    override cell; the override's display shows the value only after `lag` more reads
    (lag=None: never, the save was rejected).
    """

    def __init__(self, rows, lag=0):
        super().__init__(rows)
        self.lag = lag
        self.writes = []
        self.clicks = []
        self.waiting = {}   # y -> [value, reads left before the display shows it]

    def eval_js(self, expr):
        if "getBoundingClientRect" in expr:   # write_official locating the override cell
            return "[10,20]"
        self._tick()
        return super().eval_js(expr)

    def click(self, x, y):
        self.clicks.append((x, y))

    def write_override(self, cdp, row, value, gp=True):
        assert gp is True
        self.writes.append((row, value))
        if self.lag is not None:
            self.waiting[str(row)] = [value, self.lag]
        return {"ok": True, "typed": str(value), "focused": True}

    def _tick(self):
        for y, item in list(self.waiting.items()):
            if item[1] > 0:
                item[1] -= 1
                continue
            self.rows[y]["override"] = item[0]
            del self.waiting[y]


class TestWriteOfficial(unittest.TestCase):
    """2026-10-24: one row with no override cell crashed the whole official-grade step."""

    def setUp(self):
        patcher = mock.patch.object(so.time, "sleep", lambda _seconds: None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_missing_override_cell_fails_that_row_without_clicking_or_writing(self):
        cdp = mock.Mock()
        cdp.eval_js.return_value = None  # EdgeCDP.eval_js when the JS throws (None or {})
        ops = mock.Mock()

        result = so.write_official(ops, cdp, 7, 91.5)

        self.assertEqual(result, {"ok": False, "error": "override cell for row 7 not found"})
        cdp.click.assert_not_called()
        ops.write_override.assert_not_called()

    def test_a_result_that_is_not_two_numbers_also_fails_that_row(self):
        for raw in [{}, 42, "", "not json", "[]", "[10]", "[10,20,30]", '{"x":10,"y":20}',
                    "[null,null]", "[true,false]", '["10","20"]', "[NaN,20]",
                    "[1" + "0" * 400 + ",20]"]:
            with self.subTest(raw=raw):
                cdp = mock.Mock()
                cdp.eval_js.return_value = raw
                ops = mock.Mock()

                result = so.write_official(ops, cdp, 3, 88.0)

                self.assertEqual(result, {"ok": False, "error": "override cell for row 3 not found"})
                cdp.click.assert_not_called()
                ops.write_override.assert_not_called()

    def test_found_cell_is_clicked_at_its_center_then_written(self):
        cdp = SavingGrid({"7": {"cells": {}, "calc": None, "override": 91.5}})
        ops = mock.Mock()
        ops.write_override.return_value = {"ok": True, "typed": "91.5", "focused": True}

        result = so.write_official(ops, cdp, 7, 91.5)

        self.assertEqual(cdp.clicks, [(10, 20)])
        ops.write_override.assert_called_once_with(cdp, 7, 91.5, gp=True)
        self.assertEqual(result, {"ok": True, "typed": "91.5", "focused": True, "saved": 91.5})

    def test_a_save_the_display_never_shows_is_not_ok(self):
        # Finding R5 (Codex re-review): write_grade_to_cell passes on the typed editor value,
        # but the override's display still shows 70: the save is not confirmed.
        grid = SavingGrid({"3": {"cells": {}, "calc": 80.0, "override": 70.0}}, lag=None)

        result = so.write_official(grid, grid, 3, 80.0)

        self.assertEqual(grid.writes, [(3, 80.0)])
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "override 80.0 not saved: after 8.0 s its display shows 70.0")
        self.assertEqual(grid.reads, so.CONFIRM_POLLS)
        self.assertEqual((so.CONFIRM_POLLS - 1) * so.CONFIRM_STEP_S, 8.0)

    def test_a_display_that_shows_the_save_after_two_reads_is_ok(self):
        grid = SavingGrid({"3": {"cells": {}, "calc": 80.0, "override": 70.0}}, lag=2)

        result = so.write_official(grid, grid, 3, 80.0)

        self.assertTrue(result["ok"])
        self.assertEqual(result["saved"], 80.0)
        self.assertEqual(grid.reads, 3)

    def test_a_blank_or_unreadable_display_is_named_in_the_error(self):
        for shown, words in ((None, "nothing (blank)"), (so.UNREADABLE, "no readable number")):
            grid = SavingGrid({"3": {"cells": {}, "calc": 80.0, "override": shown}}, lag=None)
            result = so.write_official(grid, grid, 3, 80.0)
            self.assertFalse(result["ok"])
            self.assertTrue(result["error"].endswith("its display shows " + words), result["error"])

    def test_a_failed_write_is_returned_without_reading_the_display(self):
        cdp = SavingGrid({"3": {"cells": {}, "calc": 80.0, "override": 70.0}})
        ops = mock.Mock()
        ops.write_override.return_value = {"ok": False, "typed": None, "focused": False}

        result = so.write_official(ops, cdp, 3, 80.0)

        self.assertEqual(result, {"ok": False, "typed": None, "focused": False})
        self.assertEqual(cdp.reads, 0)


# ---------------------------------------------------------------------------
# Quarter passes (QUARTER_LINE_BY_DUE_DATE_SPEC.md sections 4.4-4.6, teacher 2026-11-07)
# ---------------------------------------------------------------------------

import contextlib  # noqa: E402
import io  # noqa: E402
import tempfile  # noqa: E402
import types  # noqa: E402

MP1, MP2 = "1173888", "1173889"
LIVE_MPS = {
    MP1: {"start": "2026-09-02", "end": "2026-11-06"},
    MP2: {"start": "2026-11-07", "end": "2027-01-22"},
    "1173886": {"start": "2027-01-23", "end": "2027-04-14"},
    "1173887": {"start": "2027-04-15", "end": "2027-06-30"},
}
CONFIG = {"quarters": {"Q1": {"start": "2026-09-02", "end": "2026-11-06", "close": "2026-11-12"},
                       "Q2": {"start": "2026-11-09", "end": "2027-01-22"}}}


def _row(name, current, official, base=None, line=None):
    res = None if official is None else {"official": official, "base": base or official,
                                         "line": line or official, "rule": "work"}
    return {"name": name, "studentId": "id-" + name, "row": 0, "current": current, "result": res}


class TestNeverLower(unittest.TestCase):
    """Spec 4.4: once a quarter has ended its override never goes down."""

    def test_plan(self):
        rows = [_row("up", 90.0, 92.0), _row("down", 90.0, 88.0), _row("same", 90.0, 90.02),
                _row("empty", None, 85.0), _row("none", 70.0, None)]
        actions = {s["row"]["name"]: s["action"] for s in so.plan_writes(rows, never_lower=True)}
        self.assertEqual(actions, {"up": "write", "down": "keep", "same": "same", "empty": "write",
                                   "none": "none"})
        # An open quarter (Quarter 2 now) is still rewritten up or down, as before.
        actions = {s["row"]["name"]: s["action"] for s in so.plan_writes(rows, never_lower=False)}
        self.assertEqual(actions["down"], "write")

    def test_an_unreadable_cell_is_never_planned_as_absent(self):
        # Finding A1: the old reader turned "A92" into no override, and the plan wrote 80.
        rows = [_row("override", so.UNREADABLE, 80.0), dict(_row("calc", 90.0, None), work=so.UNREADABLE)]
        for never_lower in (True, False):
            actions = {s["row"]["name"]: s["action"] for s in so.plan_writes(rows, never_lower=never_lower)}
            self.assertEqual(actions, {"override": "unreadable", "calc": "unreadable"})

    def _apply(self, cdp, plan, never_lower=True):
        """apply_writes with a recording write_official and publish."""
        writes, published = [], []
        with mock.patch.object(so, "write_official", lambda o, c, row, v: writes.append((row, v)) or {"ok": True}), \
                mock.patch.object(so, "post_official_grades",
                                  lambda q, items, s: published.append(items) or (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.apply_writes(None, cdp, "Q1", plan, [], "s", never_lower=never_lower)
        return code, writes, published, out.getvalue()

    def _apply_for_real(self, grid, plan):
        """apply_writes with the REAL write_official over a SavingGrid (finding R5)."""
        published = []
        with mock.patch.object(so.time, "sleep", lambda _s: None), \
                mock.patch.object(so, "post_official_grades",
                                  lambda q, items, s: published.append(items) or (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.apply_writes(grid, grid, "Q1", plan, [], "s", never_lower=True)
        return code, published, out.getvalue()

    def test_apply_writes_skips_unreadable_rows_and_exits_1(self):
        rows = [_row("readable", None, 85.0), dict(_row("broken", so.UNREADABLE, 80.0), row=1)]
        plan = so.plan_writes(rows, never_lower=True)
        grid = GridCdp({"0": {"cells": {}, "calc": None, "override": None},
                        "1": {"cells": {}, "calc": None, "override": so.UNREADABLE}})
        code, writes, published, out = self._apply(grid, plan)
        self.assertEqual((code, writes), (1, [(0, 85.0)]))
        self.assertIn("FAILED-TO-READ broken", out)
        self.assertEqual([i["name"] for i in published[0]], ["readable"])

    def test_an_override_raised_mid_run_is_kept_not_lowered(self):
        # Finding R2 (Codex re-review): the batch read saw 70 and planned 80; before the
        # write a hand entry made it 92. The fresh read keeps 92 and the Desk gets 92.
        plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=True)
        self.assertEqual(plan[0]["action"], "write")
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 92.0}})
        code, writes, published, out = self._apply(grid, plan)
        self.assertEqual((code, writes), (0, []))
        self.assertEqual([(i["name"], i["result"]["official"], i["result"]["rule"]) for i in published[0]],
                         [("a", 92.0, "kept: never lower")])
        self.assertIn("NOT WRITTEN a: read again just before the write, the override is 92.0", out)
        self.assertEqual(grid.reads, 1)

    def test_an_override_that_already_matches_is_not_written_again(self):
        plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=True)
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 80.0}})
        code, writes, published, _ = self._apply(grid, plan)
        self.assertEqual((code, writes), (0, []))
        self.assertEqual([i["result"]["official"] for i in published[0]], [80.0])

    def test_a_fresh_unreadable_override_writes_nothing_and_exits_1(self):
        plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=True)
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": so.UNREADABLE}})
        code, writes, published, out = self._apply(grid, plan)
        self.assertEqual((code, writes, published), (1, [], [[]]))
        self.assertIn("FAILED-TO-READ a", out)

    def test_a_work_grade_that_changed_mid_run_is_recomputed(self):
        # Finding R2: the sync (or a hand entry) moved Schoology's work grade since the read.
        plan = so.plan_writes([dict(_row("a", 85.0, 90.0), work=90.0)], never_lower=True)
        up = GridCdp({"0": {"cells": {}, "calc": 95.0, "override": 85.0}})
        code, writes, published, out = self._apply(up, plan)
        self.assertEqual((code, writes), (0, [(0, 95.0)]))
        self.assertEqual(published[0][0]["result"]["official"], 95.0)
        self.assertIn("RECOMPUTED a: Schoology's work grade is now 95.0 (was 90.0); official 95.0", out)
        # Now below the override in an ended quarter: never lower, keep 85.
        down = GridCdp({"0": {"cells": {}, "calc": 82.0, "override": 85.0}})
        code, writes, published, _ = self._apply(down, plan)
        self.assertEqual((code, writes), (0, []))
        self.assertEqual(published[0][0]["result"]["official"], 85.0)
        # An unreadable calc now: nothing written, exit 1.
        broken = GridCdp({"0": {"cells": {}, "calc": so.UNREADABLE, "override": 85.0}})
        code, writes, _, out = self._apply(broken, plan)
        self.assertEqual((code, writes), (1, []))
        self.assertIn("FAILED-TO-READ a", out)

    def test_an_open_quarter_is_still_rewritten_from_the_fresh_read(self):
        # The pass's own rule decides again: an open quarter (Quarter 2 now) goes up or down.
        plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=False)
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 92.0}})
        code, writes, _, _ = self._apply(grid, plan, never_lower=False)
        self.assertEqual((code, writes), (0, [(0, 80.0)]))

    def test_a_save_the_display_never_shows_fails_and_is_retried_next_night(self):
        # Finding R5 (Codex re-review): the editor holds the typed 80, the display keeps 70.
        rows = {"0": {"cells": {}, "calc": 80.0, "override": 70.0}}
        for night in (1, 2):
            grid = SavingGrid(rows, lag=None)
            plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=True)
            code, published, out = self._apply_for_real(grid, plan)
            self.assertEqual((code, grid.writes), (1, [(0, 80.0)]), night)
            self.assertIn("FAILED a", out)
            self.assertIn("override 80.0 not saved", out)
            self.assertEqual(published, [[]])      # the Desk gets only what Schoology shows

    def test_a_save_the_display_shows_after_two_reads_counts(self):
        grid = SavingGrid({"0": {"cells": {}, "calc": 80.0, "override": 70.0}}, lag=2)
        plan = so.plan_writes([dict(_row("a", 70.0, 80.0), work=80.0)], never_lower=True)
        code, published, _ = self._apply_for_real(grid, plan)
        self.assertEqual((code, grid.writes), (0, [(0, 80.0)]))
        self.assertEqual([i["result"]["official"] for i in published[0]], [80.0])

    def test_a_failed_nightly_publish_exits_1(self):
        plan = so.plan_writes([dict(_row("same", 85.0, 85.0), work=85.0)], never_lower=True)
        grid = GridCdp({"0": {"cells": {}, "calc": 85.0, "override": 85.0}})   # finding R8: read again
        with mock.patch.object(so, "post_official_grades", lambda q, items, s: (False, "Desk publish FAILED: HTTP 500")), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(so.apply_writes(None, grid, "Q1", plan, [], "s"), 1)

    def test_a_matching_row_is_read_again_before_its_number_is_published(self):
        # Finding R8 (Codex third review): the batch read 80 = official 80 ('same'), and the
        # Desk was sent that 80 without another read. Before the row came up a hand entry
        # made it 92: Quarter 1 has ended, so 92 is kept and the Desk gets 92.
        plan = so.plan_writes([dict(_row("a", 80.0, 80.0), work=80.0)], never_lower=True)
        self.assertEqual(plan[0]["action"], "same")
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 92.0}})
        code, writes, published, out = self._apply(grid, plan)
        self.assertEqual((code, writes, grid.reads), (0, [], 1))
        self.assertEqual([(i["name"], i["result"]["official"], i["result"]["rule"]) for i in published[0]],
                         [("a", 92.0, "kept: never lower")])
        self.assertIn("CHANGED a: read again, the override is now 92.0 (the batch read 80.0); "
                      "official 80.0 (keep)", out)
        # Fallen to 60 instead: the official 80 is written like a planned write and published
        # once the display shows it.
        grid = SavingGrid({"0": {"cells": {}, "calc": 80.0, "override": 60.0}}, lag=1)
        code, published, out = self._apply_for_real(grid, plan)
        self.assertEqual((code, grid.writes), (0, [(0, 80.0)]))
        self.assertEqual([i["result"]["official"] for i in published[0]], [80.0])
        self.assertIn("CHANGED a: read again, the override is now 60.0 (the batch read 80.0); "
                      "official 80.0 (write)", out)
        # Unchanged: one read, no line, the same 80 published.
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 80.0}})
        code, writes, published, out = self._apply(grid, plan)
        self.assertEqual((code, writes, grid.reads), (0, [], 1))
        self.assertEqual([i["result"]["official"] for i in published[0]], [80.0])
        self.assertNotIn("CHANGED", out)

    def test_a_kept_row_is_read_again_before_its_number_is_published(self):
        # Finding R8: the batch read 92 over the official 80 ('keep': Quarter 1 has ended).
        plan = so.plan_writes([dict(_row("a", 92.0, 80.0), work=80.0)], never_lower=True)
        self.assertEqual(plan[0]["action"], "keep")
        # Raised again to 95: the Desk gets the 95 Schoology keeps, not the batch 92.
        grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": 95.0}})
        code, writes, published, _ = self._apply(grid, plan)
        self.assertEqual((code, writes, grid.reads), (0, [], 1))
        self.assertEqual([(i["result"]["official"], i["result"]["rule"]) for i in published[0]],
                         [(95.0, "kept: never lower")])
        # Lowered by hand to 60, below the official: never lower does not stop a raise, so the
        # official 80 is written back like a planned write, then published.
        grid = SavingGrid({"0": {"cells": {}, "calc": 80.0, "override": 60.0}})
        code, published, out = self._apply_for_real(grid, plan)
        self.assertEqual((code, grid.writes), (0, [(0, 80.0)]))
        self.assertEqual([(i["name"], i["result"]["official"]) for i in published[0]], [("a", 80.0)])
        self.assertIn("CHANGED a: read again, the override is now 60.0 (the batch read 92.0); "
                      "official 80.0 (write)", out)

    def test_a_matching_or_kept_row_that_cannot_be_read_again_is_not_published(self):
        # Finding R8: a failed fresh read is FAILED-TO-READ: nothing written or published for
        # that row, exit 1 (the next night reads it again).
        for current in (80.0, 92.0):                       # 'same', then 'keep'
            plan = so.plan_writes([dict(_row("a", current, 80.0), work=80.0)], never_lower=True)
            grid = GridCdp({"0": {"cells": {}, "calc": 80.0, "override": so.UNREADABLE}})
            code, writes, published, out = self._apply(grid, plan)
            self.assertEqual((code, writes, published, grid.reads), (1, [], [[]], 1), current)
            self.assertIn("FAILED-TO-READ a", out)

    def test_a_matching_row_is_guarded_before_it_is_read_again(self):
        # Finding R8: the fresh read must come from the pass's marking period, and a manual run
        # stops at 16:00 before it. Nothing is read or published then.
        plan = so.plan_writes([dict(_row("a", 80.0, 80.0), work=80.0)], never_lower=True)
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        rows = {"0": {"cells": {}, "calc": 80.0, "override": 80.0}}
        cases = ((FlippingPage(shown=MP2, rows=rows), None, so.lib.ViewNotVerified),
                 (FlippingPage(shown=MP1, rows=rows), lambda: "16:00", so.RigWindowReached))
        for page, clock, error in cases:
            published = []
            with mock.patch.object(so, "post_official_grades",
                                   lambda q, items, s: published.append(items) or (True, "published")), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(error):
                    so.apply_writes(page, page, "Q1", plan, [], "s", view=view, window_clock=clock)
            self.assertEqual((page.reads, published), (0, []))

    def test_a_kept_row_publishes_what_schoology_keeps(self):
        kept = so.kept_result(_row("down", 90.04, 88.0))
        self.assertEqual(kept["official"], 90.0)
        self.assertEqual(kept["rule"], "kept: never lower")
        self.assertLessEqual(len(kept["rule"]), 40)     # roster-server PART_KEYS limit


class TestPcFromDay2(unittest.TestCase):
    """Decision 5: a Progress Check counts only once its Day 2 has ended (engine pcDueFor)."""

    student = {"quarters": {"Q2": {"pcUnits": [2, 3]}}, "units": {"U2": {"pcRawPct": 80.0}}}

    def test_u2_part_a_does_not_lift_quarter_2_before_day_2(self):
        day2 = {2: "2026-12-01", 3: "2027-01-19"}
        self.assertIsNone(so.pc_for_quarter(self.student, "Q2", day2, "2026-11-09"))
        self.assertIsNone(so.pc_for_quarter(self.student, "Q2", day2, "2026-12-01"))   # Day 2 itself
        self.assertEqual(so.pc_for_quarter(self.student, "Q2", day2, "2026-12-02"), 80.0)
        # Legacy callers (no dates): every unit on file counts, as before.
        self.assertEqual(so.pc_for_quarter(self.student, "Q2"), 80.0)
        # A unit with no schedule date still counts.
        self.assertEqual(so.pc_for_quarter(self.student, "Q2", {}, "2026-11-09"), 80.0)

    def test_day2_dates_come_from_the_live_schedule(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, "roster-server", "data", "lesson-schedule.json"), encoding="utf-8") as fh:
            schedule = json.load(fh)
        b = so.pc_day2_dates(schedule, "B")
        self.assertEqual((b[1], b[2]), ("2026-10-15", "2026-12-01"))
        self.assertEqual(so.pc_day2_dates(schedule, "E")[2], "2026-11-25")
        self.assertEqual(so.pc_day2_dates({"progressChecks": {"7": {"periods": {"B": "2027-05-01"}}}}, "B"),
                         {7: "2027-05-01"})


class TestFinal(unittest.TestCase):
    """Decision 3: MP1 final = max(closedGrade incl. the applied bonus, current override), once."""

    def test_decision(self):
        self.assertEqual(so.final_decision(91.24, 85.0), (91.2, "write"))
        self.assertEqual(so.final_decision(91.24, so.UNREADABLE), (None, "unreadable"))   # finding A1
        self.assertEqual(so.final_decision(80.0, 85.0), (85.0, "same"))      # never below current
        self.assertEqual(so.final_decision(85.02, 85.0), (85.0, "same"))
        self.assertEqual(so.final_decision(None, 85.0), (85.0, "same"))
        self.assertEqual(so.final_decision(88.0, None), (88.0, "write"))
        self.assertEqual(so.final_decision("88.4", None), (88.4, "write"))   # PostgREST numeric string
        self.assertEqual(so.final_decision(None, None), (None, "none"))

    def _doc(self):
        return {"students": [
            {"studentId": "a", "realName": "A", "schoologyUid": "100", "quarters": {"Q1": {"closedGrade": 93.0}}},
            {"studentId": "b", "realName": "B", "schoologyUid": "200", "quarters": {"Q1": {"closedGrade": 70.0}}},
            {"studentId": "c", "realName": "C", "schoologyUid": "", "quarters": {"Q1": {"closedGrade": 81.0}}},
            {"studentId": "t", "realName": "T", "role": "teacher", "quarters": {"Q1": {"closedGrade": 99.0}}},
        ]}

    def _gradebook(self):
        return {"100": {"row": 0, "override": 90.0}, "200": {"row": 1, "override": 75.0}}

    def test_rows(self):
        rows, pending = so.final_rows(self._gradebook(), self._doc(), "Q1")
        self.assertEqual([(r["studentId"], r["final"], r["action"]) for r in rows],
                         [("a", 93.0, "write"), ("b", 75.0, "same")])
        self.assertEqual([(p["studentId"], p["final"]) for p in pending], [("c", 81.0)])
        self.assertEqual(so.final_item(rows[0])["result"]["rule"], "final: closed + bonus")
        self.assertEqual(so.final_item(rows[1])["result"]["rule"], "final: kept current")

    def _run_final(self, state_path, apply=True, write_ok=True, doc=None, gradebook=None, publish_ok=True,
                   grid=None):
        """grid: the cdp the fresh read before each write sees (default: the batch read)."""
        writes, published = [], []

        def fake_write(ops_, cdp, row, value):
            writes.append((row, value))
            return {"ok": write_ok}

        def fake_publish(q, items, s):
            published.append((q, items))
            return (True, "published") if publish_ok else (False, "Desk publish FAILED: HTTP 500")

        if gradebook is None:
            gradebook = self._gradebook()
        if grid is None:
            grid = GridCdp(grid_rows(gradebook))
        with mock.patch.object(so, "write_official", fake_write), \
                mock.patch.object(so, "post_official_grades", fake_publish), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.run_final(None, grid, "PeriodB", "Q1", gradebook, doc or self._doc(),
                                "s", apply=apply, state_path=state_path)
        return code, writes, published, out.getvalue()

    def _run_final_for_real(self, state_path, doc, gradebook, grid, published=None):
        """run_final with the REAL write_official over a SavingGrid (ops and cdp; finding R5).
        published: a list that collects the items of each Desk publish."""
        sent = published if published is not None else []
        with mock.patch.object(so.time, "sleep", lambda _s: None), \
                mock.patch.object(so, "post_official_grades",
                                  lambda q, items, s: sent.append(items) or (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.run_final(grid, grid, "PeriodB", "Q1", gradebook, doc, "s", apply=True,
                                state_path=state_path)
        return code, out.getvalue()

    def _one_student(self, closed=80.0):
        return {"students": [{"studentId": "a", "realName": "A", "schoologyUid": "100",
                              "quarters": {"Q1": {"closedGrade": closed}}}]}

    def test_a_failed_publish_exits_1_and_the_next_run_publishes_without_writing(self):
        # Finding A7: a mocked HTTP 500 after a good Schoology write.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        code, writes, published, out = self._run_final(path, publish_ok=False)
        self.assertEqual((code, writes), (1, [(0, 93.0)]))
        self.assertIn("the Desk publish failed", out)
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertFalse(entry["done"])
        self.assertEqual({sid: (s["written"], s["published"]) for sid, s in entry["students"].items()},
                         {"a": (True, False), "b": (True, False)})
        # The next --final --apply: no Schoology write, one publish attempt with the recorded finals.
        code, writes, published, _ = self._run_final(path)
        self.assertEqual((code, writes, len(published)), (0, [], 1))
        sent = {i["studentId"]: i["result"]["official"] for i in published[0][1]}
        self.assertEqual(sent, {"a": 93.0, "b": 75.0, "c": 81.0})
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertTrue(entry["done"])
        self.assertTrue(all(s["published"] for s in entry["students"].values()))
        # A third run has nothing left to write; it publishes only the student with no row.
        code, writes, published, _ = self._run_final(path)
        self.assertEqual((code, writes), (0, []))
        self.assertEqual([i["studentId"] for i in published[0][1]], ["c"])

    def test_an_unreadable_override_is_never_written_or_recorded(self):
        # Finding A1: 'unreadable' is not an empty override (that wrote a LOWER final).
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": so.UNREADABLE}, "200": {"row": 1, "override": 75.0}}
        code, writes, published, out = self._run_final(path, gradebook=gradebook)
        self.assertEqual((code, writes), (1, []))
        self.assertIn("FAILED-TO-READ A", out)
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertEqual(sorted(entry["students"]), ["b"])
        self.assertFalse(entry["done"])
        self.assertNotIn("a", [i["studentId"] for i in published[0][1]])

    def test_no_student_matched_a_schoology_row_aborts(self):
        # Finding A2: an empty gradebook read must never end in a done final.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        for apply in (True, False):
            code, writes, published, out = self._run_final(path, gradebook={}, apply=apply)
            self.assertEqual((code, writes, published), (2, [], []))
            self.assertIn("[ABORT]", out)
        self.assertEqual(so.load_final_state(path), {})

    def test_the_view_flipping_mid_run_records_only_the_written_students(self):
        # Finding A4: the guard before each write; a student is recorded only after it passed
        # and the write succeeded.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        doc = {"students": [
            {"studentId": "a", "realName": "A", "schoologyUid": "100", "quarters": {"Q1": {"closedGrade": 93.0}}},
            {"studentId": "b", "realName": "B", "schoologyUid": "200", "quarters": {"Q1": {"closedGrade": 95.0}}},
        ]}
        page = FlippingPage(rows=grid_rows(self._gradebook()))
        writes = []

        def fake_write(ops_, cdp, row, value):
            writes.append((row, value))
            page.shown = MP2          # a session refresh reopens the gradebook on its default period
            return {"ok": True}

        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        with mock.patch.object(so, "write_official", fake_write), \
                mock.patch.object(so, "post_official_grades", lambda q, items, s: (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(so.lib.ViewNotVerified):
                so.run_final(page, page, "PeriodB", "Q1", self._gradebook(), doc, "s", apply=True,
                             state_path=path, view=view)
        self.assertEqual(writes, [(0, 93.0)])
        students = so.load_final_state(path)["PeriodB"]["Q1"]["students"]
        self.assertEqual(sorted(students), ["a"])
        self.assertFalse(students["a"]["published"])

    def test_an_override_raised_before_the_write_becomes_the_final(self):
        # Finding R2 (Codex re-review): the batch read saw 70; a hand entry made it 92 before
        # the write. final = max(80, 92) from the fresh read: no write, recorded as 'same'.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        grid = GridCdp({"0": {"cells": {}, "calc": None, "override": 92.0}})
        code, writes, published, out = self._run_final(path, doc=self._one_student(),
                                                       gradebook={"100": {"row": 0, "override": 70.0}},
                                                       grid=grid)
        self.assertEqual((code, writes), (0, []))
        record = so.load_final_state(path)["PeriodB"]["Q1"]["students"]["a"]
        self.assertEqual((record["final"], record["action"], record["written"]), (92.0, "same", True))
        self.assertEqual([(i["studentId"], i["result"]["official"], i["result"]["rule"]) for i in published[0][1]],
                         [("a", 92.0, "final: kept current")])
        self.assertIn("KEPT A: read again just before the write, the override is 92.0", out)

    def test_a_fresh_unreadable_override_is_not_written_or_recorded(self):
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": 70.0}}
        grid = GridCdp({"0": {"cells": {}, "calc": None, "override": so.UNREADABLE}})
        code, writes, _, out = self._run_final(path, doc=self._one_student(), gradebook=gradebook, grid=grid)
        self.assertEqual((code, writes), (1, []))
        self.assertIn("FAILED-TO-READ A", out)
        self.assertEqual(so.load_final_state(path)["PeriodB"]["Q1"]["students"], {})
        # Readable again on the next --final --apply: written and recorded.
        grid.rows["0"]["override"] = 70.0
        code, writes, _, _ = self._run_final(path, doc=self._one_student(), gradebook=gradebook, grid=grid)
        self.assertEqual((code, writes), (0, [(0, 80.0)]))
        self.assertTrue(so.load_final_state(path)["PeriodB"]["Q1"]["done"])

    def test_a_save_the_display_never_shows_is_not_recorded_and_the_rerun_writes_again(self):
        # Finding R5 (Codex re-review): the editor holds the typed 80, the display keeps 70.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": 70.0}}
        rejected = SavingGrid({"0": {"cells": {}, "calc": None, "override": 70.0}}, lag=None)
        code, out = self._run_final_for_real(path, self._one_student(), gradebook, rejected)
        self.assertEqual((code, rejected.writes), (1, [(0, 80.0)]))
        self.assertIn("override 80.0 not saved", out)
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertEqual((entry["students"], entry["done"]), ({}, False))
        # The next --final --apply reads it again and writes again; this time the save shows.
        saving = SavingGrid({"0": {"cells": {}, "calc": None, "override": 70.0}}, lag=2)
        code, _ = self._run_final_for_real(path, self._one_student(), gradebook, saving)
        self.assertEqual((code, saving.writes), (0, [(0, 80.0)]))
        record = so.load_final_state(path)["PeriodB"]["Q1"]["students"]["a"]
        self.assertEqual((record["final"], record["action"], record["written"], record["published"]),
                         (80.0, "write", True, True))

    def test_a_matching_batch_read_whose_override_fell_is_written_then_recorded(self):
        # Finding R8 (Codex third review): the batch read 80 = closed 80 ('same'), and that
        # read was recorded for good. Before the student came up the override fell to 60: the
        # final is max(80, 60) = 80, written, and recorded only once the display shows it.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": 80.0}}
        rows, _ = so.final_rows(gradebook, self._one_student(), "Q1")
        self.assertEqual(rows[0]["action"], "same")
        rejected = SavingGrid({"0": {"cells": {}, "calc": None, "override": 60.0}}, lag=None)
        code, out = self._run_final_for_real(path, self._one_student(), gradebook, rejected)
        self.assertEqual((code, rejected.writes), (1, [(0, 80.0)]))
        self.assertIn("override 80.0 not saved", out)
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertEqual((entry["students"], entry["done"]), ({}, False))
        saving = SavingGrid({"0": {"cells": {}, "calc": None, "override": 60.0}}, lag=2)
        published = []
        code, out = self._run_final_for_real(path, self._one_student(), gradebook, saving, published)
        self.assertEqual((code, saving.writes), (0, [(0, 80.0)]))
        self.assertIn("CHANGED A: read again, the override is now 60.0 (the batch read 80.0); "
                      "closed grade 80.0, final 80.0 (write)", out)
        record = so.load_final_state(path)["PeriodB"]["Q1"]["students"]["a"]
        self.assertEqual((record["final"], record["action"], record["written"], record["published"]),
                         (80.0, "write", True, True))
        self.assertEqual([(i["studentId"], i["result"]["official"]) for i in published[0]], [("a", 80.0)])

    def test_a_matching_batch_read_whose_override_rose_records_the_fresh_override(self):
        # Finding R8: the batch read 80 = closed 80; a hand entry made it 92 before the student
        # came up. final = max(80, 92) = 92: nothing written; recorded and published as 92.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": 80.0}}
        grid = GridCdp({"0": {"cells": {}, "calc": None, "override": 92.0}})
        code, writes, published, out = self._run_final(path, doc=self._one_student(), gradebook=gradebook,
                                                       grid=grid)
        self.assertEqual((code, writes, grid.reads), (0, [], 1))
        record = so.load_final_state(path)["PeriodB"]["Q1"]["students"]["a"]
        self.assertEqual((record["final"], record["action"], record["written"], record["published"]),
                         (92.0, "same", True, True))
        self.assertEqual([(i["studentId"], i["result"]["official"], i["result"]["rule"]) for i in published[0][1]],
                         [("a", 92.0, "final: kept current")])
        self.assertIn("CHANGED A: read again, the override is now 92.0 (the batch read 80.0); "
                      "closed grade 80.0, final 92.0 (same)", out)
        # Recorded: the next --final --apply neither reads, writes nor publishes it again.
        code, writes, published, _ = self._run_final(path, doc=self._one_student(), gradebook=gradebook,
                                                     grid=grid)
        self.assertEqual((code, writes, published, grid.reads), (0, [], [], 1))

    def test_a_matching_batch_read_that_cannot_be_read_again_is_not_recorded(self):
        # Finding R8: a failed fresh read leaves the student unrecorded and publishes nothing
        # for it (exit 1); the next --final --apply reads it again.
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        gradebook = {"100": {"row": 0, "override": 80.0}}
        grid = GridCdp({"0": {"cells": {}, "calc": None, "override": so.UNREADABLE}})
        code, writes, published, out = self._run_final(path, doc=self._one_student(), gradebook=gradebook,
                                                       grid=grid)
        self.assertEqual((code, writes, published, grid.reads), (1, [], [], 1))
        self.assertIn("FAILED-TO-READ A", out)
        entry = so.load_final_state(path)["PeriodB"]["Q1"]
        self.assertEqual((entry["students"], entry["done"]), ({}, False))
        # Readable again, and fallen to 60: read again, 80 written and recorded.
        grid.rows["0"]["override"] = 60.0
        code, writes, published, _ = self._run_final(path, doc=self._one_student(), gradebook=gradebook,
                                                     grid=grid)
        self.assertEqual((code, writes, grid.reads), (0, [(0, 80.0)], 2))
        record = so.load_final_state(path)["PeriodB"]["Q1"]["students"]["a"]
        self.assertEqual((record["final"], record["action"], record["published"]), (80.0, "write", True))
        self.assertTrue(so.load_final_state(path)["PeriodB"]["Q1"]["done"])
        self.assertEqual([i["studentId"] for i in published[0][1]], ["a"])

    def test_a_matching_batch_read_is_guarded_before_it_is_read_again(self):
        # Finding R8: the fresh read must come from the pass's marking period, and a manual run
        # stops at 16:00 before it. Nothing is read, recorded or published then.
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        rows = {"0": {"cells": {}, "calc": None, "override": 80.0}}
        cases = ((FlippingPage(shown=MP2, rows=rows), None, so.lib.ViewNotVerified),
                 (FlippingPage(shown=MP1, rows=rows), lambda: "16:00", so.RigWindowReached))
        for page, clock, error in cases:
            path = os.path.join(tempfile.mkdtemp(), "final.json")
            published = []
            with mock.patch.object(so, "post_official_grades",
                                   lambda q, items, s: published.append(items) or (True, "published")), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(error):
                    so.run_final(page, page, "PeriodB", "Q1", {"100": {"row": 0, "override": 80.0}},
                                 self._one_student(), "s", apply=True, state_path=path, view=view,
                                 window_clock=clock)
            self.assertEqual((page.reads, published, so.load_final_state(path)), (0, [], {}))

    def test_written_exactly_once(self):
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        code, writes, published, _ = self._run_final(path)
        self.assertEqual((code, writes), (0, [(0, 93.0)]))
        self.assertEqual(sorted(i["studentId"] for i in published[0][1]), ["a", "b", "c"])
        state = so.load_final_state(path)
        self.assertEqual(sorted(state["PeriodB"]["Q1"]["students"]), ["a", "b"])
        self.assertTrue(state["PeriodB"]["Q1"]["done"])
        # A second --final --apply writes nothing.
        code, writes, _, out = self._run_final(path)
        self.assertEqual((code, writes), (0, []))
        self.assertIn("already recorded", out)

    def test_dry_run_writes_and_records_nothing(self):
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        code, writes, published, _ = self._run_final(path, apply=False)
        self.assertEqual((code, writes, published), (0, [], []))
        self.assertEqual(so.load_final_state(path), {})

    def test_a_failed_write_is_retried_on_the_next_run(self):
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        code, writes, _, _ = self._run_final(path, write_ok=False)
        self.assertEqual((code, writes), (1, [(0, 93.0)]))
        self.assertEqual(sorted(so.load_final_state(path)["PeriodB"]["Q1"]["students"]), ["b"])
        code, writes, _, _ = self._run_final(path)
        self.assertEqual((code, writes), (0, [(0, 93.0)]))

    def test_refused_before_the_close(self):
        doc = self._doc()
        for st in doc["students"]:
            st["quarters"]["Q1"]["closedGrade"] = None
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        code, writes, published, out = self._run_final(path, doc=doc)
        self.assertEqual((code, writes, published), (2, [], []))
        self.assertIn("is not closed", out)


class TestPassStop(unittest.TestCase):
    """Spec 4.5: the Quarter 1 pass stops after its close date and after its final."""

    def test_close_date_from_the_roster_then_the_fallback(self):
        doc = {"config": CONFIG}
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        self.assertIsNone(so.pass_stop_reason("PeriodB", "Q1", doc, "2026-11-12", state_path=path))
        self.assertIn("closed on 2026-11-12", so.pass_stop_reason("PeriodB", "Q1", doc, "2026-11-13",
                                                                  state_path=path))
        self.assertIsNone(so.pass_stop_reason("PeriodB", "Q1", {}, "2026-11-13", state_path=path))
        self.assertIn("closed on 2026-11-12", so.pass_stop_reason("PeriodB", "Q1", {}, "2026-11-13",
                                                                  "2026-11-12", state_path=path))
        self.assertIsNone(so.pass_stop_reason("PeriodB", "Q2", doc, "2026-11-13", state_path=path))

    def test_a_written_final_stops_the_pass(self):
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        so.save_final_state({"PeriodB": {"Q1": {"at": "x", "students": {"a": {"final": 90}}}}}, path)
        self.assertIn("final already written", so.pass_stop_reason("PeriodB", "Q1", {}, "2026-11-12",
                                                                   state_path=path))
        self.assertIsNone(so.pass_stop_reason("PeriodE", "Q1", {}, "2026-11-12", state_path=path))


class FlippingPage:
    """The ops + cdp a write guard reads: the filter shows `shown` (tests flip it), and the
    gradebook reader answers from `rows`, counted in `reads` (findings R2 + R8: the fresh
    read before each write, publish or record)."""

    def __init__(self, shown=MP1, rows=None):
        self.shown = shown
        self.rows = rows or {}
        self.reads = 0

    def eval_js(self, expr):
        assert "readRows(" in expr, expr[:80]
        self.reads += 1
        return json.dumps(self.rows)

    def displayed_grading_period(self, cdp):
        return {"gp": self.shown}

    def grading_period_view_matches(self, view, gp, mp_range=None):
        shown = (view or {}).get("gp")
        return None if str(shown) == str(gp) else "the filter holds %r, not %r" % (shown, gp)


class FakeOfficialOps(FlippingPage):
    """The ops a main() run touches; the gradebook select is scripted."""

    def __init__(self, select_ok=True, students=None, content_problem=None):
        super().__init__(shown=MP2)          # both gradebooks open on MP2 now
        self.select_ok = select_ok
        self.students = students if students is not None else [
            {"studentId": "100", "rowIndex": 0}, {"studentId": "200", "rowIndex": 1}]
        self.content_problem = content_problem
        self.content_checks = []
        self.connected = False
        self.selects = []
        self.select_calls = []           # (gp, expected_columns, reload_url)

    def connect(self, reuse=True):
        self.connected = True
        return object()

    def list_marking_periods(self, cdp, course_id):
        return LIVE_MPS

    def navigate(self, cdp, url):
        pass

    def gradebook_url(self, course_id):
        return "gradebook"

    def inject_helpers(self, cdp):
        pass

    def list_students(self, cdp):
        return list(self.students)

    def select_grading_period(self, cdp, gp, mp_range=None, *, expected_columns=None,
                              reload_url=None):
        self.selects.append(gp)
        self.select_calls.append((gp, expected_columns, reload_url))
        if self.select_ok:
            self.shown = gp
            return {"ok": True, "view": {"gp": gp}}
        return {"ok": False, "view": {"gp": MP2, "header": "Marking Period 2: 11/07/26 - 1/22/27"},
                "error": "click: the filter's options did not open"}

    def load_all_columns(self, cdp):
        return True

    def view_content_problem(self, cdp, view, here, elsewhere):
        self.content_checks.append((set(here), set(elsewhere)))
        return self.content_problem


class TestMain(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(so.time, "sleep", lambda _s: None)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.tmp = tempfile.mkdtemp()
        for name, value in (("PENDING_PATH", os.path.join(self.tmp, "pending.json")),
                            ("FINAL_STATE_PATH", os.path.join(self.tmp, "final.json")),
                            ("SYNC_STATE_PATH", os.path.join(self.tmp, "sync-state.json"))):
            patcher = mock.patch.object(so, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        # The rig lock lives in the temp folder; no test touches the real one.
        self.lock_path = os.path.join(self.tmp, "logs", "rig.lock")
        patcher = mock.patch.object(so.lib, "RIG_LOCK_PATH", self.lock_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop(so.lib.RIG_LOCK_OWNER_ENV, None)
        self.addCleanup(os.environ.pop, so.lib.RIG_LOCK_OWNER_ENV, None)
        self.doc = {"ok": True, "config": CONFIG, "students": [
            {"studentId": "a", "realName": "A", "schoologyUid": "100",
             "quarters": {"Q1": {"earlyBonus": 0, "pcUnits": []}}},
            {"studentId": "b", "realName": "B", "schoologyUid": "200",
             "quarters": {"Q1": {"earlyBonus": 0, "pcUnits": []}}},
        ]}

    def _main(self, argv, fake, gradebook=None, writes=None, published=None, today="2026-11-09",
              hhmm="10:00", write=None, lock_left=False, banked=None):
        """today: the real school date (today_school_date and lib.school_now). hhmm: the school
        time, or a list of times for a clock that moves (the last one repeats)."""
        rows = gradebook or {"0": {"cells": {}, "calc": 80.0, "override": 85.0},
                             "1": {"cells": {}, "calc": 90.0, "override": 85.0}}

        class Cdp:
            def eval_js(self, expr):
                return json.dumps(rows)

        fake.connect = lambda reuse=True: setattr(fake, "connected", True) or Cdp()
        writes = writes if writes is not None else []
        published = published if published is not None else []
        write = write or (lambda o, c, row, v: writes.append((row, v)) or {"ok": True})
        banked = banked or (lambda sid, q, s: 0.0)
        times = list(hhmm) if isinstance(hhmm, list) else [hhmm]

        def clock():
            return times.pop(0) if len(times) > 1 else times[0]

        real_now = datetime.fromisoformat(today + "T12:00:00")
        with mock.patch.dict(sys.modules, {"schoology_ops": fake}), \
                mock.patch("schoology_sync_section.today_school_date", lambda: today), \
                mock.patch.object(so.lib, "school_now", lambda: real_now), \
                mock.patch.object(so, "roster_secret", lambda: "s"), \
                mock.patch.object(so, "roster_get", lambda path, secret: self.doc), \
                mock.patch.object(so, "banked_bonus_points", banked), \
                mock.patch.object(so, "write_official", write), \
                mock.patch.object(so, "post_official_grades",
                                  lambda q, items, s: published.append((q, items)) or (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.main(argv, clock=clock)
        # A lock this run took is released; a lock it inherited (or found busy) is left alone.
        self.assertEqual(os.path.exists(self.lock_path), lock_left)
        return code, out.getvalue()

    def test_apply_needs_a_quarter(self):
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--apply"], fake)
        self.assertEqual(code, 2)
        self.assertIn("--apply needs --quarter", out)
        self.assertFalse(fake.connected)

    def test_apply_with_today_is_refused(self):
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--today", "2026-11-05", "--apply"], fake)
        self.assertEqual(code, 2)
        self.assertIn("--today is for previews only", out)
        self.assertFalse(fake.connected)

    def test_no_verified_view_reads_and_writes_nothing(self):
        fake = FakeOfficialOps(select_ok=False)
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"],
                               fake, writes=writes, published=published)
        self.assertEqual(code, 3)
        self.assertEqual((writes, published), ([], []))
        self.assertIn("could not verify the gradebook shows Marking Period 1173888", out)
        self.assertEqual(fake.selects, [MP1])

    def test_quarter_1_never_lowers_and_publishes_what_schoology_keeps(self):
        # Row 0: work 80 < current 85 -> KEEP; row 1: work 90 > 85 -> write.
        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"],
                               fake, writes=writes, published=published)
        self.assertEqual(code, 0)
        self.assertEqual(writes, [(1, 90.0)])
        self.assertIn("KEEP A: official 80.0 < current 85.0", out)
        self.assertEqual(published[0][0], "Q1")
        sent = {i["studentId"]: i["result"]["official"] for i in published[0][1]}
        self.assertEqual(sent, {"a": 85.0, "b": 90.0})

    def test_quarter_2_is_rewritten_up_or_down(self):
        fake = FakeOfficialOps()
        writes = []
        self.doc["students"][0]["quarters"]["Q2"] = {"earlyBonus": 0}
        self.doc["students"][1]["quarters"]["Q2"] = {"earlyBonus": 0}
        code, _ = self._main(["--section", "PeriodB", "--quarter", "Q2", "--apply"],
                             fake, writes=writes)
        self.assertEqual(code, 0)
        self.assertEqual(writes, [(0, 80.0), (1, 90.0)])
        self.assertEqual(fake.selects, [MP2])

    def test_after_the_close_the_quarter_1_pass_stops_before_schoology(self):
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, today="2026-11-13")
        self.assertEqual(code, 0)
        self.assertIn("Quarter 1 closed on 2026-11-12", out)
        self.assertFalse(fake.connected)

    def test_final_runs_after_the_close(self):
        fake = FakeOfficialOps()
        for st, closed in zip(self.doc["students"], (92.0, 80.0)):
            st["quarters"]["Q1"]["closedGrade"] = closed
        writes = []
        code, _ = self._main(["--section", "PeriodB", "--final", "Q1", "--apply"],
                             fake, writes=writes, today="2026-11-13", hhmm="06:30")
        self.assertEqual(code, 0)
        self.assertEqual(writes, [(0, 92.0)])     # max(92, 85); student b keeps 85 (> 80)
        self.assertEqual(fake.selects, [MP1])

    def test_a_view_that_flips_mid_run_aborts_with_exit_3(self):
        # Finding A4: a reload reopens the gradebook on MP2; the next Quarter 1 write must not
        # land there, and nothing is published.
        fake = FakeOfficialOps()
        writes, published = [], []
        gradebook = {"0": {"cells": {}, "calc": 90.0, "override": 85.0},
                     "1": {"cells": {}, "calc": 95.0, "override": 85.0}}

        def write(o, c, row, value):
            writes.append((row, value))
            fake.shown = MP2
            return {"ok": True}

        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake,
                               gradebook=gradebook, published=published, write=write)
        self.assertEqual(code, 3)
        self.assertEqual(writes, [(0, 90.0)])
        self.assertEqual(published, [])
        self.assertIn("stopped showing", out)

    def test_a_manual_apply_never_starts_in_the_live_window(self):
        # Findings A5 + R7: 16:00-17:05 belongs to the LIVE tasks; the window is exit 3.
        for hhmm in ("16:00", "16:30", "17:04"):
            fake = FakeOfficialOps()
            code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, hhmm=hhmm)
            self.assertEqual(code, 3)
            self.assertIn("could still be running then", out)
            self.assertFalse(fake.connected)
        fake = FakeOfficialOps()
        code, _ = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, hhmm="17:05")
        self.assertEqual(code, 0)

    def test_the_daily_job_step_inherits_its_lock_and_runs_in_the_window(self):
        # The ps1 holds the lock under its own PID (this process's parent) as 'PeriodB' and
        # does not export APSTATS_RIG_LOCK_OWNER: its official step must still run at 16:31.
        self._place_lock("%d PeriodB 2026-11-09T16:30:00-05:00" % os.getppid())
        fake = FakeOfficialOps()
        writes = []
        code, _ = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake,
                             writes=writes, hhmm="16:31", lock_left=True)
        self.assertEqual(code, 0)
        self.assertEqual(writes, [(1, 90.0)])

    def test_a_busy_rig_reads_and_writes_nothing(self):
        # A live holder that is not this run's parent (here: this very process, without the
        # inheritance variable) keeps the rig.
        self._place_lock("%d move-columns 2026-11-08T15:00:00-05:00" % os.getpid())
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1"], fake, lock_left=True)
        self.assertEqual(code, 5)
        self.assertIn("the Schoology rig is busy", out)
        self.assertFalse(fake.connected)

    def test_a_manual_dry_run_never_starts_in_the_live_window(self):
        # Finding R7 (Codex re-review): a preview connects to and drives the same Edge window.
        for argv in (["--section", "PeriodB", "--quarter", "Q1"], ["--section", "PeriodB", "--final", "Q1"]):
            fake = FakeOfficialOps()
            code, out = self._main(argv, fake, hhmm="16:30")
            self.assertEqual(code, 3, argv)
            self.assertIn("[STOP] it is 16:30", out)
            self.assertIn("Nothing read or written", out)
            self.assertFalse(fake.connected)

    def test_the_daily_job_dry_run_step_runs_in_the_window(self):
        # Only a step of the daily job (it inherited the job's PeriodB lock) runs 16:00-17:05.
        self._place_lock("%d PeriodB 2026-11-09T16:30:00-05:00" % os.getppid())
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1"], fake, hhmm="16:30",
                               lock_left=True)
        self.assertEqual(code, 0)
        self.assertTrue(fake.connected)
        self.assertIn("DRY RUN", out)

    def test_a_lock_inherited_from_the_close_keeps_the_window(self):
        # tools/close_quarter.py holds the lock as 'close-quarter': its final is not exempt.
        self._place_lock("%d close-quarter 2026-11-13T16:30:00-05:00" % os.getppid())
        fake = FakeOfficialOps()
        code, _ = self._main(["--section", "PeriodB", "--final", "Q1"], fake, hhmm="16:30",
                             today="2026-11-13", lock_left=True)
        self.assertEqual(code, 3)
        self.assertFalse(fake.connected)

    def test_a_manual_dry_run_stops_before_its_table_once_16_00_comes(self):
        # Finding R7: started at 15:59, the read ran past 16:00: stop cleanly, no table.
        fake = FakeOfficialOps()
        published = []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1"], fake, published=published,
                               hhmm=["15:59", "16:00"])
        self.assertEqual(code, 3)
        self.assertTrue(fake.connected)
        self.assertIn("[STOP] it is 16:00", out)
        self.assertIn("Stopped cleanly", out)
        self.assertNotIn("official Quarter 1 grades", out)
        self.assertEqual(published, [])
        # The final's preview too.
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--final", "Q1"], fake, today="2026-11-13",
                               hhmm=["15:59", "16:00"])
        self.assertEqual(code, 3)
        self.assertNotIn("max of the closed grade and the current override", out)

    def test_a_manual_apply_stops_at_its_next_write_once_16_00_comes(self):
        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake,
                               writes=writes, published=published, hhmm=["15:59", "16:00"])
        self.assertEqual((code, writes, published), (3, [], []))
        self.assertIn("Stopped cleanly", out)

    def test_quarter_2_writes_and_publishes_nothing_before_it_starts(self):
        # Finding R6a (Codex re-review): Sun 11/08 is a gap day, so the daily job runs the
        # Quarter 2 pass, but the engine has no Quarter 2 grade until Mon 11/09.
        line = ("[Quarter 2] starts 2026-11-09: no official grade before the start; "
                "nothing written or published")
        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q2", "--apply"], fake,
                               writes=writes, published=published, today="2026-11-08")
        self.assertEqual((code, writes, published), (0, [], []))
        self.assertIn(line, out)
        self.assertFalse(fake.connected)
        # A Sunday dry run without --today says the same.
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q2"], fake, today="2026-11-08")
        self.assertEqual(code, 0)
        self.assertIn(line, out)
        self.assertFalse(fake.connected)

    def test_the_daily_job_quarter_2_step_on_sunday_exits_0(self):
        self._place_lock("%d PeriodB 2026-11-08T16:30:00-05:00" % os.getppid())
        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q2", "--apply"], fake, writes=writes,
                               published=published, today="2026-11-08", hhmm="16:31", lock_left=True)
        self.assertEqual((code, writes, published), (0, [], []))
        self.assertIn("[Quarter 2] starts 2026-11-09", out)
        self.assertFalse(fake.connected)
        # The same Sunday's Quarter 1 pass still runs (never lower).
        fake = FakeOfficialOps()
        code, _ = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, writes=writes,
                             today="2026-11-08", hhmm="16:31", lock_left=True)
        self.assertEqual((code, writes), (0, [(1, 90.0)]))

    def test_quarter_2_runs_from_its_first_day(self):
        fake = FakeOfficialOps()
        writes = []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q2", "--apply"], fake, writes=writes,
                               today="2026-11-09")
        self.assertEqual((code, writes), (0, [(0, 80.0), (1, 90.0)]))
        self.assertNotIn("starts 2026-11-09", out)

    def test_a_dry_run_previews_monday_with_today(self):
        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q2", "--today", "2026-11-09"], fake,
                               today="2026-11-08")
        self.assertEqual(code, 0)
        self.assertTrue(fake.connected)
        self.assertEqual(fake.selects, [MP2])
        self.assertIn("official Quarter 2 grades", out)
        self.assertIn("DRY RUN", out)

    def test_schoology_changing_during_the_run_is_read_again_before_each_write(self):
        # Finding R2 (Codex re-review): the batch read sees A at 70 (plan: write 80) and B's
        # work at 90. While the ledger requests run, a hand entry raises A to 92 and B's work
        # moves to 95. Quarter 1 has ended (never lower): A keeps 92, B gets 95.
        gradebook = {"0": {"cells": {}, "calc": 80.0, "override": 70.0},
                     "1": {"cells": {}, "calc": 90.0, "override": 85.0}}

        def banked(sid, quarter, secret):
            gradebook["0"]["override"] = 92.0
            gradebook["1"]["calc"] = 95.0
            return 0.0

        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, gradebook=gradebook,
                               writes=writes, published=published, banked=banked)
        self.assertEqual((code, writes), (0, [(1, 95.0)]))
        sent = {i["studentId"]: i["result"]["official"] for i in published[0][1]}
        self.assertEqual(sent, {"a": 92.0, "b": 95.0})
        self.assertIn("NOT WRITTEN A", out)
        self.assertIn("RECOMPUTED B", out)

    def test_a_matching_or_kept_row_changing_during_the_run_is_read_again(self):
        # Finding R8 (Codex third review): the batch read sees A at 80 = official 80 ('same')
        # and B at 92 over the official 90 ('keep'). While the ledger requests run, A's
        # override falls to 60 and B's to 70: both officials are written back, and the Desk
        # gets 80 and 90, not the stale 80 and 92.
        gradebook = {"0": {"cells": {}, "calc": 80.0, "override": 80.0},
                     "1": {"cells": {}, "calc": 90.0, "override": 92.0}}

        def banked(sid, quarter, secret):
            gradebook["0"]["override"] = 60.0
            gradebook["1"]["override"] = 70.0
            return 0.0

        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, gradebook=gradebook,
                               writes=writes, published=published, banked=banked)
        self.assertEqual((code, writes), (0, [(0, 80.0), (1, 90.0)]))
        sent = {i["studentId"]: i["result"]["official"] for i in published[0][1]}
        self.assertEqual(sent, {"a": 80.0, "b": 90.0})
        self.assertIn("CHANGED A: read again, the override is now 60.0 (the batch read 80.0)", out)
        self.assertIn("CHANGED B: read again, the override is now 70.0 (the batch read 92.0)", out)

    def test_the_final_reads_a_matching_student_again_before_it_is_recorded(self):
        # Finding R8 (Codex third review): B's batch read is 85 over its closed 80 ('same').
        # While A is written, B's override is lowered to 60 by hand: B's final is
        # max(80, 60) = 80, written, not the stale 85 recorded for good.
        for st, closed in zip(self.doc["students"], (92.0, 80.0)):
            st["quarters"]["Q1"]["closedGrade"] = closed
        gradebook = {"0": {"cells": {}, "calc": 80.0, "override": 85.0},
                     "1": {"cells": {}, "calc": 90.0, "override": 85.0}}
        writes = []

        def write(o, c, row, value):
            writes.append((row, value))
            gradebook["1"]["override"] = 60.0
            return {"ok": True}

        fake = FakeOfficialOps()
        code, out = self._main(["--section", "PeriodB", "--final", "Q1", "--apply"], fake, gradebook=gradebook,
                               write=write, today="2026-11-13", hhmm="06:30")
        self.assertEqual((code, writes), (0, [(0, 92.0), (1, 80.0)]))
        students = so.load_final_state(so.FINAL_STATE_PATH)["PeriodB"]["Q1"]["students"]
        self.assertEqual({sid: (s["final"], s["action"]) for sid, s in students.items()},
                         {"a": (92.0, "write"), "b": (80.0, "write")})
        self.assertIn("CHANGED B: read again, the override is now 60.0 (the batch read 85.0)", out)

    def _place_lock(self, line):
        os.makedirs(os.path.dirname(self.lock_path), exist_ok=True)
        with open(self.lock_path, "w") as fh:
            fh.write(line + chr(10))

    def test_no_student_rows_stops_the_run(self):
        # Finding A2: no rows is a failed read, never an empty marking period.
        fake = FakeOfficialOps(students=[])
        published = []
        with self.assertRaises(SystemExit) as caught:
            self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, published=published)
        self.assertIn("no student rows", str(caught.exception))
        self.assertEqual(published, [])

    def test_no_student_matched_a_row_publishes_nothing(self):
        for st in self.doc["students"]:
            st["schoologyUid"] = "not-in-the-gradebook"
        fake = FakeOfficialOps()
        writes, published = [], []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake,
                               writes=writes, published=published)
        self.assertEqual((code, writes, published), (2, [], []))
        self.assertIn("no student matched a Schoology row", out)

    def test_the_state_titles_reach_the_content_check(self):
        # Finding A3: titles filed in another marking period must not be on the grid.
        with open(so.SYNC_STATE_PATH, "w") as fh:
            json.dump({"assignments": {
                "PeriodB/QUIZ:4.3": {"title": "2.4 Quiz", "grading_period_id": MP2},
                "PeriodB/FA:1.1": {"title": "1.1 Follow-Along", "grading_period_id": MP1},
                "PeriodB/FA:3.1": {"title": "3.1 Follow-Along"},
                "PeriodE/QUIZ:4.3": {"title": "2.4 Quiz E", "grading_period_id": MP1},
            }}, fh)
        fake = FakeOfficialOps(content_problem="the grid shows 1 column(s) filed in another marking period")
        writes = []
        code, out = self._main(["--section", "PeriodB", "--quarter", "Q1", "--apply"], fake, writes=writes)
        self.assertEqual((code, writes), (3, []))
        self.assertEqual(fake.content_checks, [({"1.1 Follow-Along"}, {"2.4 Quiz"})])
        self.assertIn("filed in another marking period", out)


class TestReadGradebookViews(unittest.TestCase):
    """read_gradebook in a marking-period view: verified first; an empty MP is an empty read."""

    def setUp(self):
        patcher = mock.patch.object(so.time, "sleep", lambda _s: None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _cdp(self, cells, read=None):
        read = read if read is not None else {}

        class Cdp:
            def eval_js(self, expr):
                if "[aria-label]').length" in expr:
                    return cells
                return json.dumps(read)
        return Cdp()

    def _ops(self, loaded, select_ok=True):
        fake = FakeOfficialOps(select_ok=select_ok)
        fake.load_all_columns = lambda cdp: loaded
        return fake

    def test_an_mp_with_no_columns_reads_empty(self):
        # The real reader still reads each row's calc and override (the summary cells).
        view = {"quarter": "Q2", "grading_period_id": MP2, "mp_range": LIVE_MPS[MP2]}
        read = {"0": {"cells": {}, "calc": None, "override": None},
                "1": {"cells": {}, "calc": None, "override": 70.0}}
        rows = so.read_gradebook(self._ops(loaded=False), self._cdp(0, read), "course", view)
        self.assertEqual(rows, {"100": {"row": 0, "cells": {}, "calc": None, "override": None},
                                "200": {"row": 1, "cells": {}, "calc": None, "override": 70.0}})

    def test_a_row_the_reader_did_not_see_is_unreadable(self):
        # Finding A1: never an empty override.
        rows = so.read_gradebook(self._ops(loaded=True), self._cdp(0, {}), "course")
        self.assertEqual(rows["100"], {"row": 0, "cells": {}, "calc": so.UNREADABLE, "override": so.UNREADABLE})

    def test_no_student_rows_is_a_failed_read(self):
        # Finding A2: HEAD stopped here; the lane's empty-MP rule must not accept it.
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        ops = self._ops(loaded=False)
        ops.students = []
        with self.assertRaises(SystemExit) as caught:
            so.read_gradebook(ops, self._cdp(0), "course", view)
        self.assertIn("no student rows", str(caught.exception))

    def test_a_content_problem_is_view_not_verified(self):
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        ops = self._ops(loaded=True)
        ops.content_problem = "none of the 3 column(s) filed in marking period 1173888 is on the grid"
        with self.assertRaises(so.lib.ViewNotVerified):
            so.read_gradebook(ops, self._cdp(0), "course", view, titles=({"1.1 Quiz"}, set()))
        # Without titles (no state) the check is not asked for.
        ops.content_problem = None
        so.read_gradebook(ops, self._cdp(0), "course", view)
        self.assertEqual(ops.content_checks, [({"1.1 Quiz"}, set())])

    def test_a_malformed_reading_is_unreadable_never_empty(self):
        # Findings A1 + R1: anything but a number or null is UNREADABLE, a missing key too.
        read = {"0": {"cells": {}, "calc": True, "override": "92"}, "1": {"cells": None}}
        rows = so.read_gradebook(self._ops(loaded=True), self._cdp(0, read), "course")
        unreadable = {"cells": {}, "calc": so.UNREADABLE, "override": so.UNREADABLE}
        self.assertEqual(rows["100"], dict(unreadable, row=0))
        self.assertEqual(rows["200"], dict(unreadable, row=1))

    def test_read_row_reads_its_own_row_and_fails_closed(self):
        # Finding R2: the one-row reader asks for its own data-y; a failed read is UNREADABLE.
        class OneRow:
            def __init__(self, raw):
                self.raw, self.exprs = raw, []

            def eval_js(self, expr):
                self.exprs.append(expr)
                return self.raw

        page = OneRow(json.dumps({"3": {"cells": {"2.4 Quiz": 90}, "calc": 88.5, "override": None}}))
        self.assertEqual(so.read_row(page, 3), {"cells": {"2.4 Quiz": 90}, "calc": 88.5, "override": None})
        self.assertIn("readRows(" + json.dumps("3") + ")", page.exprs[0])
        unreadable = {"cells": {}, "calc": so.UNREADABLE, "override": so.UNREADABLE}
        for raw in (None, {}, "not json", "[]", "{}", json.dumps({"4": {"calc": 1, "override": 2}})):
            self.assertEqual(so.read_row(OneRow(raw), 3), unreadable, raw)

    def test_columns_that_did_not_load_still_fail(self):
        with self.assertRaises(SystemExit):
            so.read_gradebook(self._ops(loaded=False), self._cdp(5), "course")
        with self.assertRaises(SystemExit):
            so.read_gradebook(self._ops(loaded=False), self._cdp(None), "course")

    def test_the_select_gets_the_stamp_count_and_the_reload_url(self):
        # How many titles are filed here (may the grid be empty?), and the URL the select
        # may reload once when the grid renders nothing (2026-11-08 08:13).
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        ops = self._ops(loaded=True)
        so.read_gradebook(ops, self._cdp(0), "course", view, titles=({"a", "b"}, {"c"}))
        self.assertEqual(ops.select_calls, [(MP1, 2, "gradebook")])

    def test_no_stamp_expects_nothing_and_stamps_elsewhere_expect_an_empty_period(self):
        view = {"quarter": "Q2", "grading_period_id": MP2, "mp_range": LIVE_MPS[MP2]}
        for titles, expected in ((None, None), ((set(), set()), None), ((set(), {"c"}), 0)):
            ops = self._ops(loaded=True)
            so.read_gradebook(ops, self._cdp(0), "course", view, titles=titles)
            self.assertEqual(ops.select_calls, [(MP2, expected, "gradebook")], titles)

    def test_an_unverified_view_raises_before_any_read(self):
        view = {"quarter": "Q1", "grading_period_id": MP1, "mp_range": LIVE_MPS[MP1]}
        with self.assertRaises(so.lib.ViewNotVerified):
            so.read_gradebook(self._ops(loaded=True, select_ok=False), self._cdp(0), "course", view)


class TestViewTitlesFromState(unittest.TestCase):
    """Finding A3: the sync state's grading_period_id says where each title is filed."""

    def test_split_by_marking_period(self):
        path = os.path.join(tempfile.mkdtemp(), "state.json")
        with open(path, "w") as fh:
            json.dump({"assignments": {
                "PeriodB/FA:1.1": {"title": "1.1 Follow-Along", "grading_period_id": MP1},
                "PeriodB/QUIZ:4.3": {"title": "2.4 Quiz", "grading_period_id": int(MP2)},
                "PeriodB/FA:3.1": {"title": "3.1 Follow-Along"},                        # no id: ignored
                "PeriodB/X:1": {"title": "Twice", "grading_period_id": MP1},
                "PeriodB/X:2": {"title": "Twice", "grading_period_id": MP2},             # both: ignored
                "PeriodE/FA:1.1": {"title": "E only", "grading_period_id": MP2},
            }}, fh)
        self.assertEqual(so.view_titles_from_state("PeriodB", MP1, path), ({"1.1 Follow-Along"}, {"2.4 Quiz"}))
        self.assertEqual(so.view_titles_from_state("PeriodB", MP2, path), ({"2.4 Quiz"}, {"1.1 Follow-Along"}))
        self.assertEqual(so.view_titles_from_state("PeriodB", MP1, path + ".missing"), (set(), set()))


FIXTURE = "tests/fixtures/schoology-gradebook-apstats-sec1.html"
REPO = Path(__file__).resolve().parents[1]

# Loads the captured gradebook in jsdom ONCE (no page scripts). Each phase edits the gp
# (calc) and gp_override cells of some rows, then evaluates its expressions on the page:
# the batch reader (READ_ROWS_JS) and the one-row reader (read_row_js) for every row.
_READ_ROWS_NODE = r"""
const fs = require('fs');
const {JSDOM} = require('jsdom');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const dom = new JSDOM(fs.readFileSync(input.fixture, 'utf8'), {runScripts: 'outside-only'});
const doc = dom.window.document;
if (input.label) doc.querySelector('#grader-grid-cell-0-0').setAttribute('aria-label', input.label);
const results = [];
for (const phase of input.phases) {
  for (const edit of phase.edits) {
    const cell = doc.querySelector('#grader-grid-cell-' + edit.kind + '-' + edit.y);
    if (edit.removeCell) { cell.remove(); continue; }
    if (edit.removeDisplay) { cell.querySelector('.grader-grid-grade-display').remove(); continue; }
    if ('scale' in edit) cell.querySelector('.grader-grid-grade-scale').textContent = edit.scale;
    if ('display' in edit) cell.querySelector('.grader-grid-grade-display').textContent = edit.display;
    if ('input' in edit) cell.querySelector('input.grader-edit-input').value = edit.input;
  }
  results.push(phase.exprs.map(function (expr) { return String(dom.window.eval(expr)); }));
}
process.stdout.write(JSON.stringify(results));
dom.window.close();
"""

ROWS_ON_PAGE = [str(y) for y in range(10)]     # the capture has rows 0-9
NOT_ON_PAGE = "42"


class PageCdp:
    """A cdp that answers each reader expression with what jsdom returned for it."""

    def __init__(self, outputs):
        self.outputs = outputs      # {expr: the JSON string jsdom returned}

    def eval_js(self, expr):
        return self.outputs[expr]


@unittest.skipIf(shutil.which("node") is None, "node is not installed")
class TestReadRowsJsOnTheCapturedGradebook(unittest.TestCase):
    """Findings A1 + R1 over the real capture: a number comes only from the grade display, a
    label beside it is ignored, the editor input never counts, and anything that is not a
    plain number (or verifiably empty) is 'unreadable'."""

    PHASE_1 = [
        # row 0: label + number (the A1 scenario): label "A", display "92", input 92
        {"kind": "gp_override", "y": 0, "scale": "A", "display": "92", "input": "92"},
        # row 1: override left blank (the capture); calc shows a number
        {"kind": "gp", "y": 1, "display": "91.25"},
        # row 2: a label with no number (label only); the calc is scaled too
        {"kind": "gp_override", "y": 2, "scale": "A", "display": ""},
        {"kind": "gp", "y": 2, "scale": "B", "display": "85"},
        # row 3: garbage in both
        {"kind": "gp_override", "y": 3, "display": "garbage"},
        {"kind": "gp", "y": 3, "display": "B+"},
        # row 4: a percent sign is still a plain number; a blank calc is empty
        {"kind": "gp_override", "y": 4, "display": "87.5%"},
        {"kind": "gp", "y": 4, "display": ""},
        # row 5: no cells at all
        {"kind": "gp_override", "y": 5, "removeCell": True},
        {"kind": "gp", "y": 5, "removeCell": True},
        # row 6: the override has no display element
        {"kind": "gp_override", "y": 6, "removeDisplay": True},
        # row 7: blank display with 70 in the editor input (finding R1: never a number)
        {"kind": "gp_override", "y": 7, "input": "70"},
        # row 8: 'N/A' is blank for the calc only
        {"kind": "gp_override", "y": 8, "display": "N/A"},
        # rows 6 and 9: a space or a no-break space before the percent sign is still a number
        {"kind": "gp", "y": 6, "display": "91.5\u00a0%"},
        {"kind": "gp", "y": 9, "display": "78.54 %"},
    ]
    EXPECTED_1 = {
        "0": (None, 92), "1": (91.25, None), "2": (85, so.UNREADABLE), "3": (so.UNREADABLE, so.UNREADABLE),
        "4": (None, 87.5), "5": (so.UNREADABLE, so.UNREADABLE), "6": (91.5, so.UNREADABLE),
        "7": (None, so.UNREADABLE), "8": (None, so.UNREADABLE), "9": (78.54, None),
    }
    # Phase 2 rewrites the overrides of rows 0-2 on the same page (finding R1, Codex re-review).
    PHASE_2 = [
        # label only, with 70 in the editor
        {"kind": "gp_override", "y": 0, "scale": "A", "display": "", "input": "70"},
        # garbage, with 70 in the editor
        {"kind": "gp_override", "y": 1, "scale": "", "display": "garbage", "input": "70"},
        # finding R5: a rejected save leaves the typed 80 in the editor; the display keeps 70
        {"kind": "gp_override", "y": 2, "scale": "", "display": "70", "input": "80"},
    ]
    EXPECTED_2 = dict(EXPECTED_1, **{"0": (None, so.UNREADABLE), "1": (91.25, so.UNREADABLE), "2": (85, 70)})

    @classmethod
    def setUpClass(cls):
        exprs = [so.READ_ROWS_JS] + [so.read_row_js(y) for y in ROWS_ON_PAGE + [NOT_ON_PAGE]]
        payload = {"fixture": FIXTURE, "label": "Student, 2.4 Quiz, 90 out of 100 points",
                   "phases": [{"edits": cls.PHASE_1, "exprs": exprs}, {"edits": cls.PHASE_2, "exprs": exprs}]}
        result = subprocess.run(["node", "-e", _READ_ROWS_NODE], input=json.dumps(payload), text=True,
                                encoding="utf-8", capture_output=True, check=True, cwd=REPO, timeout=180)
        cls.pages = [PageCdp(dict(zip(exprs, outputs))) for outputs in json.loads(result.stdout)]
        cls.phases = [json.loads(page.outputs[so.READ_ROWS_JS]) for page in cls.pages]

    def test_each_row_reads_a_number_empty_or_unreadable(self):
        for rows, expected in zip(self.phases, (self.EXPECTED_1, self.EXPECTED_2)):
            got = {y: (r["calc"], r["override"]) for y, r in rows.items()}
            self.assertEqual(got, expected)
        self.assertEqual(self.phases[0]["0"]["cells"], {"2.4 Quiz": 90})

    def test_the_one_row_reader_reads_what_the_batch_reader_reads(self):
        # Finding R2: read_row runs the batch reader's own code on one data-y.
        for page, rows in zip(self.pages, self.phases):
            for y in ROWS_ON_PAGE:
                self.assertEqual(so.read_row(page, int(y)), so._row_reading(rows[y]), y)
            self.assertEqual(json.loads(page.outputs[so.read_row_js(NOT_ON_PAGE)]), {})
            self.assertEqual(so.read_row(page, int(NOT_ON_PAGE)),
                             {"cells": {}, "calc": so.UNREADABLE, "override": so.UNREADABLE})

    def _items(self, rows):
        """Nightly rows from a captured read: official 80 wherever the work grade is readable."""
        items = []
        for y, r in sorted(rows.items(), key=lambda kv: int(kv[0])):
            work = so.work_grade(r["calc"], r["cells"])
            result = None if so.is_unreadable(work) else {"official": 80.0, "base": 80.0, "line": 80.0,
                                                          "rule": "work"}
            items.append({"name": y, "row": int(y), "current": r["override"], "work": work, "result": result})
        return items

    def test_the_nightly_plan_never_writes_over_an_unreadable_override(self):
        expected = [
            {"0": "keep", "1": "write", "2": "unreadable", "3": "unreadable", "4": "keep",
             "5": "unreadable", "6": "unreadable", "7": "unreadable", "8": "unreadable", "9": "write"},
            {"0": "unreadable", "1": "unreadable", "2": "write", "3": "unreadable", "4": "keep",
             "5": "unreadable", "6": "unreadable", "7": "unreadable", "8": "unreadable", "9": "write"},
        ]
        for rows, want in zip(self.phases, expected):
            actions = {s["row"]["name"]: s["action"] for s in so.plan_writes(self._items(rows), never_lower=True)}
            self.assertEqual(actions, want)
        # Row 0 under the A1 reader: "A92" -> no override -> write 80 over 92. Now: keep.
        # Row 7 under the A1 reader: the editor's 70 -> write 80 over it. Now: unreadable.

    def test_the_final_never_writes_over_an_unreadable_override(self):
        decisions = [{y: so.final_decision(80.0, r["override"]) for y, r in rows.items()} for rows in self.phases]
        self.assertEqual(decisions[0]["0"], (92.0, "same"))
        self.assertEqual(decisions[0]["9"], (80.0, "write"))
        self.assertEqual(decisions[1]["2"], (80.0, "write"))
        for y in ("2", "3", "5", "6", "7", "8"):
            self.assertEqual(decisions[0][y], (None, "unreadable"), y)
        for y in ("0", "1"):
            self.assertEqual(decisions[1][y], (None, "unreadable"), y)

    def test_apply_writes_writes_only_the_readable_rows(self):
        # Finding R1: no write over an unreadable cell; FAILED-TO-READ and exit 1. The fresh
        # read before each write sees the same page.
        page = self.pages[1]
        plan = so.plan_writes(self._items(self.phases[1]), never_lower=True)
        writes = []
        with mock.patch.object(so, "write_official", lambda o, c, row, v: writes.append((row, v)) or {"ok": True}), \
                mock.patch.object(so, "post_official_grades", lambda q, items, s: (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.apply_writes(None, page, "Q1", plan, [], "s")
        self.assertEqual((code, writes), (1, [(2, 80.0), (9, 80.0)]))
        for y in ("0", "1", "3", "5", "6", "7", "8"):
            self.assertIn("FAILED-TO-READ %s:" % y, out.getvalue())

    def test_run_final_writes_and_records_only_the_readable_rows(self):
        page = self.pages[1]
        rows = self.phases[1]
        doc = {"students": [{"studentId": "s" + y, "realName": "R" + y, "schoologyUid": "u" + y,
                             "quarters": {"Q1": {"closedGrade": 80.0}}} for y in sorted(rows, key=int)]}
        gradebook = {"u" + y: {"row": int(y), "override": r["override"]} for y, r in rows.items()}
        path = os.path.join(tempfile.mkdtemp(), "final.json")
        writes = []
        with mock.patch.object(so, "write_official", lambda o, c, row, v: writes.append((row, v)) or {"ok": True}), \
                mock.patch.object(so, "post_official_grades", lambda q, items, s: (True, "published")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = so.run_final(None, page, "PeriodB", "Q1", gradebook, doc, "s", apply=True, state_path=path)
        self.assertEqual((code, writes), (1, [(2, 80.0), (9, 80.0)]))
        recorded = so.load_final_state(path)["PeriodB"]["Q1"]["students"]
        self.assertEqual(sorted(recorded), ["s2", "s4", "s9"])     # s4 keeps its 87.5 ('same')
        for y in ("0", "1", "3", "5", "6", "7", "8"):
            self.assertIn("FAILED-TO-READ R%s:" % y, out.getvalue())

    def test_the_save_check_reads_the_display_not_the_editor(self):
        # Finding R5 (Codex re-review): row 2 shows 70 while the editor still holds the typed
        # 80 (a rejected save). The check reads the display, so 80 is NOT confirmed.
        page = self.pages[1]
        with mock.patch.object(so.time, "sleep", lambda _s: None):
            refused = so.confirm_saved(page, 2, 80.0, {"ok": True, "typed": "80"})
            confirmed = so.confirm_saved(page, 2, 70.0, {"ok": True, "typed": "70"})
        self.assertFalse(refused["ok"])
        self.assertEqual(refused["error"], "override 80.0 not saved: after 8.0 s its display shows 70")
        self.assertEqual(confirmed, {"ok": True, "typed": "70", "saved": 70})


if __name__ == "__main__":
    unittest.main()
