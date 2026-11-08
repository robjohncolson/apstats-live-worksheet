"""tools/close_quarter.py: Thursday's Quarter 1 close (QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.5).

No network, no Schoology: the roster calls and the final are injected fakes.

ASCII only. LF line endings.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
import tempfile
import unittest
from datetime import datetime
from unittest import mock

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))

import close_quarter as cq  # noqa: E402
import schoology_official as so  # noqa: E402
import schoology_sync_lib as lib  # noqa: E402

# Fri 11/13 06:30 school time: the morning after the close date, before school.
FRIDAY_MORNING = datetime(2026, 11, 13, 6, 30)

SECRET = "fixture-secret-never-printed"


def _doc(close="2026-11-12"):
    quarters = {"Q1": {"start": "2026-09-02", "end": "2026-11-06"}}
    if close:
        quarters["Q1"]["close"] = close
    return {"ok": True, "config": {"quarters": quarters}, "students": [
        {"studentId": "a", "realName": "Student A", "quarters": {"Q1": {"quarterGrade": 91.2, "closedGrade": None}}},
        {"studentId": "b", "realName": "Student B", "quarters": {"Q1": {"quarterGrade": None, "closedGrade": None}}},
        {"studentId": "t", "username": "zz_teacher", "quarters": {"Q1": {"quarterGrade": 99}}},
    ]}


class Roster:
    def __init__(self, doc=None, fail=None):
        self.doc = doc or _doc()
        self.fail = fail or set()
        self.calls = []

    def __call__(self, method, path, secret, body=None):
        assert secret == SECRET
        self.calls.append((method, path, body))
        if method == "GET":
            return self.doc
        if (path, (body or {}).get("section")) in self.fail:
            return {"ok": False, "error": "HTTP 500"}
        if path.endswith("/close"):
            return {"ok": True, "considered": 14, "gradeable": 13, "frozen": 13}
        return {"ok": True, "applied": 2, "skipped": []}


class TestCloseQuarter(unittest.TestCase):
    def setUp(self):
        os.environ.pop(lib.RIG_LOCK_OWNER_ENV, None)
        self.addCleanup(os.environ.pop, lib.RIG_LOCK_OWNER_ENV, None)

    def _main(self, argv, roster, *, now=FRIDAY_MORNING, busy=False, final=None, clock=None):
        """now: the school clock for the whole run (clock: a callable that overrides it)."""
        finals = []
        final = final or (lambda section: finals.append(section) or 0)
        taken = []

        def rig_lock(owner):
            taken.append(owner)
            return None if busy else lib.RIG_LOCK_INHERITED   # inherited: nothing to release

        with mock.patch.object(so, "roster_secret", lambda: SECRET), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = cq.main(argv, request=roster, final=final, clock=clock or (lambda: now), rig_lock=rig_lock)
        text = out.getvalue()
        self.assertNotIn(SECRET, text)
        self.taken = taken
        return code, text, finals

    def test_dry_run_only_reads(self):
        roster = Roster()
        code, out, finals = self._main(["--today", "2026-11-12"], roster)
        self.assertEqual(code, 0)
        self.assertEqual([c[0] for c in roster.calls], ["GET", "GET"])
        self.assertEqual(finals, [])
        self.assertIn("DRY RUN: nothing changed", out)
        self.assertIn('POST /class/quarter/close {"quarter": "Q1", "section": "PeriodB"}', out)
        self.assertIn('"dryRun": false', out)
        self.assertIn("1 with a Q1 grade (frozen by the close), 0 already closed", out)

    def test_apply_runs_close_then_bonus_then_final_for_both_sections(self):
        roster = Roster()
        code, out, finals = self._main(["--apply"], roster)
        self.assertEqual(code, 0)
        posts = [(c[1], c[2]) for c in roster.calls if c[0] == "POST"]
        self.assertEqual(posts, [
            ("/class/quarter/close", {"quarter": "Q1", "section": "PeriodB"}),
            ("/class/quarter/close", {"quarter": "Q1", "section": "PeriodE"}),
            ("/class/quarter/apply-bonus", {"quarter": "Q1", "section": "PeriodB", "dryRun": False}),
            ("/class/quarter/apply-bonus", {"quarter": "Q1", "section": "PeriodE", "dryRun": False}),
        ])
        self.assertEqual(finals, ["PeriodB", "PeriodE"])
        self.assertIn("[done] Q1 closed", out)
        self.assertEqual(self.taken, ["close-quarter"])

    def test_never_on_or_before_the_close_date(self):
        # Finding A6: "fix by Thu 11/12" means the whole of Thursday, evening included.
        for now in (datetime(2026, 11, 11, 17, 30), datetime(2026, 11, 12, 9, 0), datetime(2026, 11, 12, 20, 0),
                    datetime(2026, 11, 12, 23, 59)):
            roster = Roster()
            code, out, finals = self._main(["--apply"], roster, now=now)
            self.assertEqual(code, 2, now)
            self.assertIn("Quarter 1 stays fixable through 2026-11-12; run the close the next morning", out)
            self.assertFalse(any(c[0] == "POST" for c in roster.calls))
            self.assertEqual((finals, self.taken), ([], []))

    def test_the_morning_after_runs(self):
        for now in (datetime(2026, 11, 13, 0, 1), FRIDAY_MORNING, datetime(2026, 11, 13, 15, 59),
                    datetime(2026, 11, 13, 17, 5)):
            code, _, finals = self._main(["--apply"], Roster(), now=now)
            self.assertEqual((code, finals), (0, ["PeriodB", "PeriodE"]), now)

    def test_never_from_16_00_to_17_05(self):
        # Finding A5: the LIVE tasks use the rig 16:25-17:05; a run started after 16:00 could
        # still be running then.
        for hhmm in ((16, 0), (16, 30), (17, 4)):
            roster = Roster()
            code, out, finals = self._main(["--apply"], roster, now=datetime(2026, 11, 13, *hhmm))
            self.assertEqual(code, 2)
            self.assertIn("could still be running then", out)
            self.assertFalse(any(c[0] == "POST" for c in roster.calls))
            self.assertEqual(finals, [])

    def test_apply_with_today_is_refused(self):
        # Finding A6: --today never moves the date refusal.
        roster = Roster()
        code, out, finals = self._main(["--apply", "--today", "2026-11-13"], roster, now=datetime(2026, 11, 12, 9, 0))
        self.assertEqual(code, 2)
        self.assertIn("--apply always uses the real school date", out)
        self.assertEqual((roster.calls, finals), ([], []))

    def test_a_busy_rig_changes_nothing(self):
        roster = Roster()
        code, out, finals = self._main(["--apply"], roster, busy=True)
        self.assertEqual(code, 2)
        self.assertIn("another run holds the Schoology rig", out)
        self.assertFalse(any(c[0] == "POST" for c in roster.calls))
        self.assertEqual(finals, [])

    def test_the_window_reached_mid_run_stops_cleanly(self):
        # The clock is read at the start, then before each section's step.
        times = iter([FRIDAY_MORNING, FRIDAY_MORNING, FRIDAY_MORNING, datetime(2026, 11, 13, 16, 1)])
        last = {"now": FRIDAY_MORNING}

        def clock():
            last["now"] = next(times, last["now"])
            return last["now"]

        roster = Roster()
        code, out, finals = self._main(["--apply"], roster, clock=clock)
        self.assertEqual(code, 3)
        self.assertIn("Stopped cleanly before the next step", out)
        posts = [(c[1], c[2]["section"]) for c in roster.calls if c[0] == "POST"]
        self.assertEqual(posts, [("/class/quarter/close", "PeriodB")])
        self.assertEqual(finals, [])

    def test_the_lock_is_held_for_the_run_and_the_final_inherits_it(self):
        # Finding A5: acquired before the first POST, released at the end; the final
        # (schoology_official.py in this process) inherits it through APSTATS_RIG_LOCK_OWNER.
        path = os.path.join(tempfile.mkdtemp(), "logs", "rig.lock")
        seen = []

        def final(section):
            seen.append((section, os.path.exists(path), lib.take_rig_lock("official", path=path),
                         lib.rig_lock_owner(path)))
            return 0

        with mock.patch.object(lib, "RIG_LOCK_PATH", path), \
                mock.patch.object(so, "roster_secret", lambda: SECRET), \
                contextlib.redirect_stdout(io.StringIO()):
            code = cq.main(["--apply"], request=Roster(), final=final, clock=lambda: FRIDAY_MORNING)
        self.assertEqual(code, 0)
        self.assertEqual(seen, [("PeriodB", True, lib.RIG_LOCK_INHERITED, "close-quarter"),
                                ("PeriodE", True, lib.RIG_LOCK_INHERITED, "close-quarter")])
        self.assertFalse(os.path.exists(path))
        self.assertIsNone(os.environ.get(lib.RIG_LOCK_OWNER_ENV))

    def test_a_crashed_read_in_the_final_is_a_failed_step(self):
        # schoology_official stops a bad gradebook read with SystemExit("...").
        def boom(argv):
            raise SystemExit("no student rows in the gradebook view")

        with mock.patch.object(so, "main", boom), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(cq.run_final("PeriodB", "Q1", True, None), 1)
        self.assertIn("no student rows", out.getvalue())

    def test_no_close_date_needs_the_fallback(self):
        roster = Roster(doc=_doc(close=None))
        code, out, _ = self._main(["--apply"], roster)
        self.assertEqual(code, 2)
        self.assertIn("--close YYYY-MM-DD", out)
        code, _, finals = self._main(["--apply", "--close", "2026-11-12"], Roster(doc=_doc(close=None)))
        self.assertEqual((code, finals), (0, ["PeriodB", "PeriodE"]))

    def test_a_failed_close_stops_everything_after_it(self):
        roster = Roster(fail={("/class/quarter/close", "PeriodE")})
        code, out, finals = self._main(["--apply"], roster)
        self.assertEqual(code, 1)
        self.assertFalse(any(c[1].endswith("apply-bonus") for c in roster.calls))
        self.assertEqual(finals, [])

    def test_a_failed_bonus_stops_before_the_final(self):
        roster = Roster(fail={("/class/quarter/apply-bonus", "PeriodB")})
        code, _, finals = self._main(["--apply"], roster)
        self.assertEqual((code, finals), (1, []))

    def test_a_failed_final_is_reported(self):
        code, out, _ = self._main(["--apply"], Roster(), final=lambda s: 1)
        self.assertEqual(code, 1)
        self.assertIn("the final failed for PeriodB", out)

    def test_run_final_argv(self):
        seen = []
        with mock.patch.object(so, "main", lambda argv: seen.append(argv) or 0):
            self.assertEqual(cq.run_final("PeriodE", "Q1", True, None), 0)
            cq.run_final("PeriodB", "Q1", False, "2026-11-12")
        self.assertEqual(seen, [["--section", "PeriodE", "--final", "Q1", "--apply"],
                                ["--section", "PeriodB", "--final", "Q1", "--today", "2026-11-12"]])

    def test_apply_refusal(self):
        self.assertIsNone(cq.apply_refusal("Q1", "2026-11-13", "06:30", "2026-11-12"))
        self.assertIsNone(cq.apply_refusal("Q1", "2026-11-13", "17:05", "2026-11-12"))
        for today, hhmm in (("2026-11-12", "09:00"), ("2026-11-12", "20:00"), ("2026-11-11", "17:30")):
            self.assertIn("stays fixable through 2026-11-12", cq.apply_refusal("Q1", today, hhmm, "2026-11-12"))
        self.assertIn("could still be running then", cq.apply_refusal("Q1", "2026-11-13", "16:30", "2026-11-12"))
        self.assertIn("--close YYYY-MM-DD", cq.apply_refusal("Q1", "2026-11-13", "06:30", None))


if __name__ == "__main__":
    unittest.main()
