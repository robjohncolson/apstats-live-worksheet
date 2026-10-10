"""Tests for the official-grade rule (OFFICIAL_GRADE_SYNC_SPEC.md §2 + §6)."""
import json
import os
import re
import sys
import unittest
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
        # Allison's Period B row on 2026-10-01: Schoology showed 78.54 under the old
        # 15/15/5 weights. Under 25/17.5/7.5 (POSTER_BONUS_SPEC.md) the same cells give
        # (25*83.48 + 17.5*88.9 + 7.5*32.6) / 50 = 77.75.
        self.assertAlmostEqual(so.work_from_cells(self.cells), 77.75, places=1)

    def test_work_weights_are_50_35_15_with_no_posters(self):
        self.assertEqual(so.WORK_WEIGHTS, {"Lesson": 25, "Quizzes": 17.5, "Blooket": 7.5})

    def test_a_poster_column_is_ignored(self):
        cells = dict(self.cells, **{"Unit 1 Poster": 0})
        self.assertAlmostEqual(so.work_from_cells(cells), 77.75, places=1)

    def test_calc_is_used_until_a_progress_check_column_exists(self):
        self.assertEqual(so.work_grade(78.54, self.cells), 78.54)

    def test_progress_check_column_is_left_out_of_work(self):
        cells = dict(self.cells, **{"Unit 1 Progress Check": 30})
        self.assertAlmostEqual(so.work_grade(60.0, cells), 77.75, places=1)


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
        self.assertEqual(status, "published 1 official grades to the Desk")
        self.assertTrue(sent["url"].endswith("/class/official-grades"))
        self.assertEqual(sent["body"]["quarter"], "Q1")
        self.assertEqual(sent["body"]["grades"], [{
            "studentId": "stu_b", "official": 100.0, "work": 39.75, "pc": 100.0, "base": 100.0,
            "line": 41.75, "earlyBonus": 2, "bankedBonus": 0, "rule": "PC"}])

    def test_missing_table_is_reported_not_raised(self):
        def fake_urlopen(req, timeout=0):
            raise so.HTTPError(req.full_url, 503, "x", {}, None)

        with mock.patch.object(so, "urlopen", fake_urlopen):
            self.assertIn("migration 0038", so.post_official_grades("Q1", [self.item], "s"))


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


if __name__ == "__main__":
    unittest.main()
