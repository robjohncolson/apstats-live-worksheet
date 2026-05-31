"""Unit tests for tools/build_schoology_fixture.py pure functions.

No network -- exercises build_fixture + inspect_summary against a fake
/class/grades response.
"""
from __future__ import annotations

import os
import sys
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))

import build_schoology_fixture as bsf  # noqa: E402


DOC = {
    "ok": True,
    "students": [
        {
            "studentId": "s1", "username": "alpha",
            "lessons": [
                {"topicKey": "1.2", "lessonGrade": 88},
                {"topicKey": "1.3", "lessonGrade": None},   # ungraded -> skipped
            ],
            "quarters": {"Q1": {"quarterGrade": 91, "pcAvg": 0.83, "workAvg": 0.79}},
            "units": {"U1": {"Q": 0.9, "pcRawPct": 83.3}},
        },
        {
            "studentId": "s2", "username": "beta",
            "lessons": [{"topicKey": "1.2", "lessonGrade": 70}],
            "quarters": {"Q1": {"quarterGrade": 72, "pcAvg": None, "workAvg": None}},
            "units": {"U1": {"Q": None, "pcRawPct": None}},
        },
    ],
}


class TestBuildFixture(unittest.TestCase):
    def test_lesson_granularity_skips_null(self):
        fx = bsf.build_fixture(DOC)
        self.assertEqual(fx, {"s1/1.2": 88, "s2/1.2": 70})

    def test_quarter_granularity(self):
        fx = bsf.build_fixture(DOC, granularity="quarter")
        self.assertEqual(fx, {"s1/Q1": 91, "s2/Q1": 72})

    def test_both_granularity_unions(self):
        fx = bsf.build_fixture(DOC, granularity="both")
        self.assertEqual(fx, {"s1/1.2": 88, "s2/1.2": 70, "s1/Q1": 91, "s2/Q1": 72})

    def test_uid_map_translates_keys(self):
        fx = bsf.build_fixture(DOC, uid_map={"s1": "99001"})
        self.assertIn("99001/1.2", fx)
        self.assertEqual(fx["99001/1.2"], 88)
        self.assertIn("s2/1.2", fx)  # unmapped student falls through to roster id

    def test_lesson_key_field_drift(self):
        doc = {"students": [{"studentId": "x",
               "lessons": [{"lessonKey": "2.1", "lessonGrade": 60}]}]}
        self.assertEqual(bsf.build_fixture(doc), {"x/2.1": 60})


class TestInspectSummary(unittest.TestCase):
    def test_detects_v3_and_counts(self):
        s = bsf.inspect_summary(DOC)
        self.assertEqual(s["students"], 2)
        self.assertTrue(s["v3_active"])          # s1 has pcAvg -> v3 took effect
        self.assertEqual(s["lesson_entries"], 3)
        self.assertEqual(s["graded_lessons"], 2)  # 1.3 null excluded
        self.assertEqual(s["units_with_quiz_data"], 1)
        self.assertEqual(s["units_with_pc_data"], 1)

    def test_v3_inactive_when_all_avgs_null(self):
        doc = {"students": [{"studentId": "s",
               "quarters": {"Q1": {"quarterGrade": 80, "pcAvg": None, "workAvg": None}}}]}
        self.assertFalse(bsf.inspect_summary(doc)["v3_active"])


if __name__ == "__main__":
    unittest.main()
