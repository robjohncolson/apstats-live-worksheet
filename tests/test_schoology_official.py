"""Tests for the official-grade rule (OFFICIAL_GRADE_SYNC_SPEC.md §2 + §6)."""
import os
import sys
import unittest

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
        # Allison's Period B row on 2026-10-01: Schoology showed 78.54.
        self.assertAlmostEqual(so.work_from_cells(self.cells), 78.54, places=1)

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


if __name__ == "__main__":
    unittest.main()
