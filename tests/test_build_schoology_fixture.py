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


class TestPosterGradesFromLedger(unittest.TestCase):
    """poster_grades_from_ledger_rows -> {unit: number 90-115} (POSTER_WORK_TRACK_SPEC.md)."""

    def test_poster_row_score_passes_through(self):
        rows = [
            {"item_id": "POSTER-U1", "source": "poster", "score": 105,
             "response": '{"grade":"E","title":"Superpowers","unit":1}'},
            {"item_id": "BONUS-screen-time", "source": "bonus", "score": 3,
             "response": '{"grade":"P"}'},                       # DOK sheet, not a poster
            {"item_id": "BONUS-APPLIED-Q1", "source": "bonus_applied", "score": 91},
        ]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {1: 105})

    def test_legacy_bonus_row_letter_maps_to_default(self):
        rows = [
            {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 5,
             "response": '{"grade":"E","quarter":"Q1","title":"Unit 1 Poster"}'},
            {"item_id": "BONUS-POSTER-U2", "source": "bonus", "score": 3, "response": '{"grade":"P"}'},
            {"item_id": "BONUS-POSTER-U3", "source": "bonus", "score": 1, "response": '{"grade":"I"}'},
        ]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {1: 115, 2: 100, 3: 90})
        self.assertEqual(bsf.POSTER_LETTER_SCORE, {"E": 115, "P": 100, "I": 90})

    def test_legacy_letter_falls_back_to_stored_points_and_camel_case_keys(self):
        rows = [{"itemId": "BONUS-POSTER-U2", "source": "bonus", "score": 1, "response": {}}]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {2: 90})

    def test_poster_row_wins_over_bonus_row_for_the_same_unit(self):
        # Whatever the order, the converted POSTER-U# row beats the legacy letter.
        poster = {"item_id": "POSTER-U1", "source": "poster", "score": 92, "response": '{"grade":"I"}'}
        bonus = {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 5, "response": '{"grade":"E"}'}
        self.assertEqual(bsf.poster_grades_from_ledger_rows([bonus, poster]), {1: 92})
        self.assertEqual(bsf.poster_grades_from_ledger_rows([poster, bonus]), {1: 92})

    def test_source_must_match_the_item_shape(self):
        # A POSTER-U# item with source 'bonus' (or vice versa) is not a poster row.
        rows = [
            {"item_id": "POSTER-U1", "source": "bonus", "score": 5, "response": '{"grade":"E"}'},
            {"item_id": "BONUS-POSTER-U2", "source": "poster", "score": 100},
        ]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {})

    def test_later_row_replaces_earlier_and_bad_rows_are_ignored(self):
        rows = [
            {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 1, "response": '{"grade":"I"}'},
            {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 5, "response": '{"grade":"E"}'},
            {"item_id": "BONUS-POSTER-U3", "source": "bonus", "score": 5, "response": "not json"},
            {"item_id": "POSTER-U4", "source": "poster", "score": 100},
            {"item_id": "POSTER-U4", "source": "poster", "score": 110.5},
            "garbage", None,
        ]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {1: 115, 3: 115, 4: 110.5})

    def test_bad_poster_scores_are_skipped(self):
        rows = [
            {"item_id": "POSTER-U1", "source": "poster", "score": None},
            {"item_id": "POSTER-U2", "source": "poster", "score": "abc"},
            {"item_id": "POSTER-U3", "source": "poster", "score": -1},
            {"item_id": "POSTER-U4", "source": "poster", "score": 151},
            {"item_id": "POSTER-U5", "source": "poster", "score": True},
            {"item_id": "POSTER-U6", "source": "poster", "score": "98"},   # numeric string ok
            {"item_id": "BONUS-POSTER-U7", "source": "bonus", "score": 4, "response": '{"grade":"X"}'},
        ]
        self.assertEqual(bsf.poster_grades_from_ledger_rows(rows), {6: 98})

    def test_empty(self):
        self.assertEqual(bsf.poster_grades_from_ledger_rows(None), {})
        self.assertEqual(bsf.poster_grades_from_ledger_rows([]), {})


class TestFetchPosterGrades(unittest.TestCase):
    """fetch_poster_grades asks both prefixes per student and merges them."""

    def _run(self, responses):
        import io
        import json
        from unittest import mock
        calls = []

        class FakeResp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_urlopen(req, timeout=0):
            calls.append(req.full_url)
            body = responses.get(req.full_url)
            if isinstance(body, Exception):
                raise body
            return FakeResp(json.dumps(body).encode("utf-8"))

        doc = {"students": [{"studentId": "r1"}]}
        with mock.patch.object(bsf, "urlopen", fake_urlopen):
            out = bsf.fetch_poster_grades("https://x", doc, "s")
        return out, calls

    def test_fetches_both_prefixes_and_poster_row_wins(self):
        base = "https://x/ledger/student/r1?prefix="
        out, calls = self._run({
            base + "POSTER-": {"rows": [{"item_id": "POSTER-U1", "source": "poster", "score": 92}]},
            base + "BONUS-POSTER-": {"rows": [
                {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 5, "response": '{"grade":"E"}'},
                {"item_id": "BONUS-POSTER-U2", "source": "bonus", "score": 3, "response": '{"grade":"P"}'},
            ]},
        })
        self.assertEqual(calls, [base + "POSTER-", base + "BONUS-POSTER-"])
        self.assertEqual(out, {"r1": {1: 92, 2: 100}})

    def test_a_failed_prefix_fetch_keeps_the_other(self):
        from urllib.error import URLError
        base = "https://x/ledger/student/r1?prefix="
        out, _ = self._run({
            base + "POSTER-": URLError("down"),
            base + "BONUS-POSTER-": {"rows": [
                {"item_id": "BONUS-POSTER-U1", "source": "bonus", "score": 1, "response": '{"grade":"I"}'}]},
        })
        self.assertEqual(out, {"r1": {1: 90}})


class TestBuildFixture(unittest.TestCase):
    def test_closed_quarter_wins_with_live_fallback(self):
        doc = {"students": [{"studentId": "s1", "quarters": {
            "Q1": {"quarterGrade": 63, "closedGrade": 90},
            "Q2": {"quarterGrade": 72, "closedGrade": None},
            "Q3": {"quarterGrade": 80, "closedGrade": 0},
            "Q4": {"quarterGrade": 55},
        }}]}
        for granularity in ("quarter", "both"):
            self.assertEqual(bsf.build_fixture(doc, granularity=granularity),
                             {"s1/Q1": 90, "s1/Q2": 72, "s1/Q3": 0, "s1/Q4": 55})

    def test_lesson_granularity_skips_null(self):
        fx = bsf.build_fixture(DOC)
        self.assertEqual(fx, {"s1/1.2": 88, "s2/1.2": 70})

    def test_zero_date_passed_emits_explicit_zero_for_missing_work(self):
        doc = {"students": [{
            "studentId": "s9", "username": "gamma", "section": "PeriodB",
            "lessons": [
                {"topicKey": "1.1", "lessonGrade": None, "due": {"B": "2026-09-08"}, "zeroDate": {"B": "2026-09-21", "E": "2026-09-22"}},
                {"topicKey": "1.2", "lessonGrade": None, "due": {"B": "2026-09-10"}, "zeroDate": {"B": "2026-09-23", "E": "2026-09-24"}},
                {"topicKey": "1.10", "lessonGrade": None, "due": {"B": None}, "zeroDate": {"B": None, "E": None}},
                {"topicKey": "1.3", "lessonGrade": 55, "zeroDate": {"B": "2026-09-24", "E": "2026-09-25"}},
            ],
        }]}
        # Mon 9/21 is the zero date: still open that day, 0 from Tue 9/22.
        self.assertEqual(bsf.build_fixture(doc, today="2026-09-21"), {"s9/1.3": 55})
        self.assertEqual(bsf.build_fixture(doc, today="2026-09-22"), {"s9/1.1": 0, "s9/1.3": 55})
        self.assertEqual(bsf.build_fixture(doc, today="2026-09-24"), {"s9/1.1": 0, "s9/1.2": 0, "s9/1.3": 55})
        # no today (legacy callers) or no section -> never zero
        self.assertEqual(bsf.build_fixture(doc), {"s9/1.3": 55})
        doc["students"][0]["section"] = None
        self.assertEqual(bsf.build_fixture(doc, today="2026-09-24"), {"s9/1.3": 55})

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

    def test_surfaced_schoology_uid_wins_over_uid_map_and_id(self):
        # P4b: a server-surfaced schoologyUid beats both --uid-map and the roster id.
        doc = {"students": [{"studentId": "s1", "schoologyUid": "8405518810",
               "lessons": [{"topicKey": "1.2", "lessonGrade": 88}]}]}
        fx = bsf.build_fixture(doc, uid_map={"s1": "99001"})
        self.assertEqual(fx, {"8405518810/1.2": 88})

    def test_uid_map_used_when_schoology_uid_absent(self):
        # No surfaced uid -> the explicit --uid-map still translates.
        doc = {"students": [{"studentId": "s1",
               "lessons": [{"topicKey": "1.2", "lessonGrade": 88}]}]}
        fx = bsf.build_fixture(doc, uid_map={"s1": "99001"})
        self.assertEqual(fx, {"99001/1.2": 88})

    def test_falls_back_to_roster_id_when_schoology_uid_null_or_empty(self):
        # null and "" both fall through to uid_map, then the roster id.
        doc = {"students": [
            {"studentId": "s1", "schoologyUid": None,
             "lessons": [{"topicKey": "1.2", "lessonGrade": 88}]},
            {"studentId": "s2", "schoologyUid": "",
             "lessons": [{"topicKey": "1.2", "lessonGrade": 70}]},
        ]}
        fx = bsf.build_fixture(doc)
        self.assertEqual(fx, {"s1/1.2": 88, "s2/1.2": 70})


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

    def test_uid_bridge_covered_zero_when_no_uids_surfaced(self):
        # DOC's students carry no schoologyUid -> bridge coverage is 0.
        self.assertEqual(bsf.inspect_summary(DOC)["uid_bridge_covered"], 0)

    def test_uid_bridge_covered_counts_surfaced_uids(self):
        doc = {"students": [
            {"studentId": "s1", "schoologyUid": "8405518810"},
            {"studentId": "s2", "schoologyUid": None},   # not counted
            {"studentId": "s3", "schoologyUid": ""},      # not counted
            {"studentId": "s4", "schoologyUid": "8405518811"},
        ]}
        self.assertEqual(bsf.inspect_summary(doc)["uid_bridge_covered"], 2)


class TestQuarterFixtureCli(unittest.TestCase):
    """QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.1 / 4.7: one fixture per quarter pass, previews by --today."""

    DOC = {"ok": True, "config": {"quarters": {
        "Q1": {"start": "2026-09-02", "end": "2026-11-06", "close": "2026-11-12"},
        "Q2": {"start": "2026-11-09", "end": "2027-01-22"}}},
        "students": [{"studentId": "s9", "schoologyUid": "u9", "section": "PeriodB", "units": {}, "lessons": [
            {"lessonKey": "4.1", "unit": 4, "worksheetKey": "1-2", "due": {"B": "2026-10-23"},
             "zeroDate": {"B": "2026-11-05"}, "quizTotal": 0, "hasBlooket": True},
            {"lessonKey": "4.2", "unit": 4, "worksheetKey": "1-2", "due": {"B": "2026-10-26"},
             "zeroDate": {"B": "2026-11-08"}, "quizTotal": 3, "hasBlooket": True},
            {"lessonKey": "4.3", "unit": 4, "worksheetKey": "3", "due": {"B": "2026-10-27"},
             "zeroDate": {"B": "2026-11-09"}, "quizTotal": 3, "hasBlooket": False, "Q": 75},
        ]}]}

    def _main(self, argv):
        import io
        import json
        import tempfile
        from contextlib import redirect_stderr, redirect_stdout
        from unittest import mock
        out_path = os.path.join(tempfile.mkdtemp(), "fixture.json")
        with mock.patch.dict(os.environ, {"ROSTER_TEACHER_SECRET": "s"}), \
                mock.patch.object(bsf, "fetch_class_grades", lambda base, section, secret: self.DOC), \
                mock.patch.object(bsf, "fetch_poster_grades", lambda base, doc, secret: {}), \
                redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()) as err:
            code = bsf.main(["--section", "PeriodB", "--granularity", "component", "--out", out_path] + argv)
        fixture = None
        if os.path.exists(out_path):
            with open(out_path, encoding="utf-8") as f:
                fixture = json.load(f)
        return code, fixture, out.getvalue() + err.getvalue()

    def test_monday_preview_per_quarter(self):
        code, q1, _ = self._main(["--quarter", "Q1", "--today", "2026-11-09"])
        self.assertEqual((code, q1), (0, {"u9/FA:4.1-2": 0, "u9/BL:4.1-2": 0}))
        code, q2, note = self._main(["--quarter", "Q2", "--today", "2026-11-09"])
        self.assertEqual((code, q2), (0, {"u9/QUIZ:4.2": 0, "u9/QUIZ:4.3": 75}))
        self.assertIn("derived from its zero date", note)      # these rows carry no quarter field
        # Sunday (11/08): 4.2's zero date is that day, so nothing new zeros yet.
        code, q2, _ = self._main(["--quarter", "Q2", "--today", "2026-11-08"])
        self.assertEqual(q2, {"u9/QUIZ:4.3": 75})

    def test_no_zeros(self):
        code, q2, _ = self._main(["--quarter", "Q2", "--today", "2026-11-09", "--no-zeros"])
        self.assertEqual((code, q2), (0, {"u9/QUIZ:4.3": 75}))

    def test_a_closed_quarter_exits_4_and_writes_nothing(self):
        code, fixture, out = self._main(["--quarter", "Q1", "--today", "2026-11-13"])
        self.assertEqual((code, fixture), (bsf.QUARTER_CLOSED_EXIT, None))
        self.assertEqual(bsf.QUARTER_CLOSED_EXIT, 4)            # daily_schoology_sync.ps1 skips the pass
        self.assertIn("Quarter 1 closed on 2026-11-12", out)
        code, fixture, _ = self._main(["--quarter", "Q1", "--today", "2026-11-12"])
        self.assertEqual(code, 0)
        self.assertIsNotNone(fixture)

    def test_the_close_fallback(self):
        doc = dict(self.DOC, config={"quarters": {"Q1": {"start": "2026-09-02", "end": "2026-11-06"}}})
        with __import__("unittest").mock.patch.object(self, "DOC", doc):
            self.assertEqual(self._main(["--quarter", "Q1", "--today", "2026-11-13"])[0], 0)
            code, _, _ = self._main(["--quarter", "Q1", "--today", "2026-11-13", "--close", "2026-11-12"])
            self.assertEqual(code, 4)

    def test_bad_today_is_refused(self):
        import io
        from contextlib import redirect_stderr
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            bsf.main(["--section", "PeriodB", "--today", "Monday"])

    def test_inspect_reports_the_quarter_field_and_windows(self):
        summary = bsf.inspect_summary(self.DOC)
        self.assertEqual(summary["lessons_with_quarter_field"], 0)
        self.assertEqual(summary["quarter_windows"]["Q1"], ["2026-09-02", "2026-11-06", "2026-11-12"])


class TestPassesCli(unittest.TestCase):
    """--passes prints the day's quarter passes for daily_schoology_sync.ps1 (finding B3)."""

    DOC = {"ok": True, "config": {"quarters": {
        "Q1": {"start": "2026-09-02", "end": "2026-11-06", "close": "2026-11-12"},
        "Q2": {"start": "2026-11-09", "end": "2027-01-22"},
        "Q3": {"start": "2027-01-25", "end": "2027-04-14"},
        "Q4": {"start": "2027-04-15", "end": "2027-06-17"}}}, "students": []}

    def _main(self, argv, doc=None):
        import io
        from contextlib import redirect_stderr, redirect_stdout
        from unittest import mock
        doc = self.DOC if doc is None else doc
        with mock.patch.dict(os.environ, {"ROSTER_TEACHER_SECRET": "s"}), \
                mock.patch.object(bsf, "fetch_class_grades", lambda base, section, secret: doc), \
                mock.patch.object(bsf, "fetch_poster_grades", side_effect=AssertionError("no fixture")), \
                redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()) as err:
            code = bsf.main(["--section", "PeriodB", "--passes"] + argv)
        return code, out.getvalue(), err.getvalue()

    def test_prints_one_line(self):
        self.assertEqual(self._main(["--today", "2026-11-08"])[:2], (0, "Q1 Q2\n"))
        self.assertEqual(self._main(["--today", "2026-11-13"])[:2], (0, "Q2\n"))
        self.assertEqual(self._main(["--today", "2027-01-23"])[:2], (0, "Q3\n"))
        self.assertEqual(self._main(["--today", "2027-06-18"])[:2], (0, "none\n"))

    def test_the_q1_close_fallback(self):
        doc = {"ok": True, "config": {"quarters": {
            "Q1": {"start": "2026-09-02", "end": "2026-11-06"},
            "Q2": {"start": "2026-11-09", "end": "2027-01-22"}}}, "students": []}
        self.assertEqual(self._main(["--today", "2026-11-09"], doc)[1], "Q2\n")
        self.assertEqual(self._main(["--today", "2026-11-09", "--q1-close", "2026-11-12"], doc)[1], "Q1 Q2\n")

    def test_a_roster_failure_is_an_error_not_a_list(self):
        code, out, _ = self._main(["--today", "2026-11-09"], {"ok": False, "error": "boom"})
        self.assertEqual((code, out), (1, ""))

    def test_no_secret_no_call(self):
        import io
        from contextlib import redirect_stderr, redirect_stdout
        from unittest import mock
        with mock.patch.dict(os.environ, {"ROSTER_TEACHER_SECRET": ""}), \
                mock.patch.object(bsf, "fetch_class_grades", side_effect=AssertionError("called")), \
                redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()):
            code = bsf.main(["--section", "PeriodB", "--passes"])
        self.assertEqual((code, out.getvalue()), (2, ""))


if __name__ == "__main__":
    unittest.main()
