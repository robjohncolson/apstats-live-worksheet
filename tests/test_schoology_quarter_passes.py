"""Quarter passes of the Schoology sync (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.1).

Fake ops and the captured gradebook fixture only: no browser, no live Schoology.

Covers:
  - a pass verifies its marking period before any read or write, and aborts with no
    writes when it cannot (also when a later reload loses the view);
  - the grade push re-checks the shown period before EVERY cell: a reload in the middle
    of the push stops the pass before the next read or write (finding B2);
  - the Quarter 1 pass never writes a Quarter 2 lesson's target, even into a column
    that still sits in MP1; the Quarter 2 pass writes into MP2 only and files new
    columns there (MP id recorded in the state row);
  - --no-zeros is the fixture's job: the sync writes an earned 0 it is given (B4);
    --apply needs --quarter;
  - the marking-period evidence after every gradebook load: a column filed elsewhere on the
    grid, none of the columns filed here on it, or (once any column carries a stamp) an
    unstamped due column aborts the pass; no stamp at all warns once and goes on (R4b);
  - the rig lock held from before the connect to the end in every mode, inherited by a
    step of the daily job, a busy rig refused (exit 5); a manual run never starts from
    16:00 to 17:05 (exit 3), and a manual --apply run stops at 16:00 before the next
    create or cell with the true count (R3);
  - schoology_ops.select_grading_period / grading_period_view_matches;
  - the view-reading JS against tests/fixtures/schoology-gradebook-apstats-sec1.html.

ASCII only. LF line endings.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))
sys.path.insert(0, os.path.join(REPO_ROOT, "tools", "cdp"))
sys.path.insert(0, TESTS_DIR)
sys.modules.setdefault(
    "websocket",
    types.SimpleNamespace(WebSocketTimeoutException=TimeoutError, create_connection=None),
)

import schoology_ops as ops  # noqa: E402
import schoology_sync_lib as lib  # noqa: E402
import schoology_sync_section as sync  # noqa: E402
from test_schoology_sync_section import FakeOps, FakeStateStore  # noqa: E402

MP1, MP2 = "1173888", "1173889"
LIVE_MPS = {
    MP1: {"start": "2026-09-02", "end": "2026-11-06"},
    MP2: {"start": "2026-11-07", "end": "2027-01-22"},
    "1173886": {"start": "2027-01-23", "end": "2027-04-14"},
    "1173887": {"start": "2027-04-15", "end": "2027-06-30"},
}

# Period B around the line: 4.1 (zero 11/05, Q1) + 4.2 (zero 11/08, Q2) share the 4.1-2
# worksheet; 4.3 (zero 11/09, Q2); 4.8 is taught in Q2 (11/09).
SCHEDULE = {
    "lessons": {
        "4.1": {"unit": 4, "worksheetKey": "1-2", "periods": {"B": "2026-10-23", "E": "2026-10-26"}},
        "4.2": {"unit": 4, "worksheetKey": "1-2", "periods": {"B": "2026-10-26", "E": "2026-10-28"}},
        "4.3": {"unit": 4, "worksheetKey": "3", "periods": {"B": "2026-10-27", "E": "2026-10-28"}},
        "4.8": {"unit": 4, "worksheetKey": "8", "periods": {"B": "2026-11-09", "E": "2026-11-09"}},
    },
    "progressChecks": {"2": {"unit": 2, "periods": {"B": "2026-11-30", "E": "2026-11-23"},
                             "adminDay2": {"B": "2026-12-01", "E": "2026-11-25"}}},
    "posters": {},
}
QUIZZES = {"4.2", "4.3", "4.8"}
DECKS = {"4.1", "4.2", "4.3", "4.8"}
TITLES = {"FA:4.1-2": "4.1-2 Follow-Along", "BL:4.1-2": "4.1-2 Blooket", "QUIZ:4.2": "4.2 Quiz",
          "FA:4.3": "4.3 Follow-Along", "QUIZ:4.3": "4.3 Quiz", "BL:4.3": "4.3 Blooket",
          "FA:4.8": "4.8 Follow-Along", "QUIZ:4.8": "4.8 Quiz", "BL:4.8": "4.8 Blooket"}
CREATED = ("FA:4.1-2", "BL:4.1-2", "QUIZ:4.2", "FA:4.3", "QUIZ:4.3", "BL:4.3")
MOVED = ("QUIZ:4.2", "FA:4.3", "QUIZ:4.3", "BL:4.3")

TARGETS = {
    ("S1", "FA:4.1-2"): 0,     # a Quarter 1 zero (4.1 decides the group)
    ("S1", "QUIZ:4.2"): 0,     # a Quarter 2 zero
    ("S2", "QUIZ:4.2"): 70,
    ("S1", "FA:4.3"): 88,
}


class GridCDP:
    """The cdp handle ViewOps hands out: it answers schoology_ops' column-title read with
    the titles of the marking period on screen, so the REAL ops.view_content_problem
    runs on it (finding R4b)."""

    def __init__(self, fake):
        self.fake = fake

    def eval_js(self, expr):
        if expr == ops._VISIBLE_TITLES_JS:
            return json.dumps(sorted(self.fake.views.get(self.fake.current_gp, set())))
        return None


class ViewOps(FakeOps):
    """A gradebook that shows ONE marking period at a time, like Schoology.

    views: {mp id: titles shown}. Every gradebook load reopens on default_gp.
    selectable: whether select_grading_period can switch; fail_after: switch this many
    times, then fail (a reload that loses the view).
    """

    def __init__(self, views, *, default_gp=MP2, selectable=True, fail_after=None,
                 reload_after_writes=None, **kw):
        super().__init__(marking_periods=LIVE_MPS, **kw)
        self.cdp = GridCDP(self)
        self.content_checks = []         # the mp shown at each evidence check
        self.views = {gp: set(titles) for gp, titles in views.items()}
        self.default_gp = default_gp
        self.current_gp = None
        self.selectable = selectable
        self.fail_after = fail_after
        # After this many cell writes the page reloads on its own (a Schoology session
        # refresh): the gradebook reopens on default_gp, with no select by the sync.
        self.reload_after_writes = reload_after_writes
        self.selects = []
        self.writes = []                 # (mp shown, column, row, value)
        self.reads = []                  # (mp shown, column, row)

    def navigate(self, cdp, url):
        super().navigate(cdp, url)
        if self.current_page == "gradebook":
            self.current_gp = self.default_gp

    def select_grading_period(self, cdp, grading_period_id, mp_range=None):
        self._require_page("gradebook", "select_grading_period")
        self.selects.append(grading_period_id)
        works = self.selectable and (self.fail_after is None or len(self.selects) <= self.fail_after)
        if works:
            self.current_gp = grading_period_id
            return {"ok": True, "view": {"gp": grading_period_id}, "method": "click", "error": None}
        return {"ok": False, "view": {"gp": self.current_gp, "header": "Marking Period 2: 11/07/26 - 1/22/27"},
                "method": None, "error": "click: the filter's options did not open"}

    def find_assignment_id_by_title(self, cdp, title):
        self._require_page("gradebook", "find_assignment_id_by_title")
        if title in self.views.get(self.current_gp, set()):
            return f"COL[{self.current_gp}]{title}"
        return None

    def add_assignment(self, cdp, course_id, *, title, points=100, category_id,
                       grading_period_id, due_date=None, publish_scores=True, sync_to_sis=True):
        result = super().add_assignment(cdp, course_id, title=title, points=points,
                                        category_id=category_id, grading_period_id=grading_period_id,
                                        due_date=due_date)
        self.views.setdefault(grading_period_id, set()).add(title)
        return result

    def read_grade_from_cell(self, cdp, column_key, row_index):
        self.reads.append((self.current_gp, column_key, row_index))
        return super().read_grade_from_cell(cdp, column_key, row_index)

    def write_grade_to_cell(self, cdp, column_key, row_index, value):
        self.writes.append((self.current_gp, column_key, row_index, value))
        result = super().write_grade_to_cell(cdp, column_key, row_index, value)
        if self.reload_after_writes is not None and len(self.writes) == self.reload_after_writes:
            self.current_gp = self.default_gp
        return result

    # The real view check reads these two (schoology_ops); the header carries the MP dates.
    def displayed_grading_period(self, cdp):
        if self.current_gp is None:
            return None
        return {"gp": self.current_gp, "header": _label(self.current_gp), "chosen": _label(self.current_gp),
                "available": list(LIVE_MPS) + ["all", "final", "none"]}

    def grading_period_view_matches(self, view, grading_period_id, mp_range=None):
        return ops.grading_period_view_matches(view, grading_period_id, mp_range)

    # The evidence check (finding R4b): the real rule, over the titles on screen.
    def load_all_columns(self, cdp):
        self._require_page("gradebook", "load_all_columns")
        return True

    def view_content_problem(self, cdp, view, here, elsewhere):
        self._require_page("gradebook", "view_content_problem")
        self.content_checks.append(self.current_gp)
        return ops.view_content_problem(cdp, view, here, elsewhere)


def _state(keys=CREATED, stamps=None):
    """The sync state with these columns registered. stamps: {key: mp id}, the
    grading_period_id rows that schoology_move_columns.py --apply / --stamp records."""
    state = FakeStateStore()
    for key in keys:
        row = {"schoology_assignment_id": "id-" + key, "title": TITLES[key]}
        if stamps and key in stamps:
            row["grading_period_id"] = stamps[key]
        state.upsert_assignment("PeriodB", key, row)
    return state


def _stamps(moved: bool):
    """Every registered column stamped where it sits, before or after the move."""
    return {key: (MP2 if moved and key in MOVED else MP1) for key in CREATED}


def _views(moved: bool):
    mp1 = {TITLES[k] for k in CREATED if not (moved and k in MOVED)}
    mp2 = {TITLES[k] for k in MOVED} if moved else set()
    return {MP1: mp1, MP2: mp2}


def _run(ops_, state, quarter, *, dry_run=False, grades=None, zeros=True, through="2026-11-09",
         window_clock=None):
    path = os.path.join(tempfile.mkdtemp(), "schedule.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(SCHEDULE, fh)
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        summary = sync.sync_section(
            "PeriodB", "course", dry_run=dry_run, state=state,
            grades=dict(TARGETS if grades is None else grades), ops=ops_, schedule_path=path,
            granularity="component", quiz_topics=QUIZZES, blooket_topics=DECKS,
            through_date=through, ced=False, rename_state={}, quarter=quarter, zeros=zeros,
            window_clock=window_clock)
    return summary, out.getvalue()


class TestQuarterOnePass(unittest.TestCase):
    def test_writes_only_mp1_columns_and_never_a_quarter_2_zero(self):
        # Sunday before the move: every column still sits in MP1, the gradebook opens on MP2.
        fake = ViewOps(_views(moved=False))
        summary, out = _run(fake, _state(), "Q1")
        self.assertEqual(summary["errors"], [])
        self.assertEqual(fake.selects[0], MP1)
        self.assertEqual(fake.writes, [(MP1, "COL[1173888]4.1-2 Follow-Along", 0, 0)])
        # 4.2's quiz column is still in MP1, but 4.2 is a Quarter 2 lesson: never written there.
        self.assertFalse(any("4.2 Quiz" in w[1] for w in fake.writes))
        self.assertEqual(summary["grades_other_quarter"], 3)
        self.assertEqual(summary["grading_period_id"], MP1)
        self.assertEqual(summary["assignments_created"], 0)
        self.assertIn("verified: the gradebook shows Marking Period 1173888", out)

    def test_dry_run_reads_the_mp1_view_and_writes_nothing(self):
        fake = ViewOps(_views(moved=False))
        state = _state()
        summary, out = _run(fake, state, "Q1", dry_run=True)
        self.assertEqual(fake.writes, [])
        self.assertEqual(state.runs, [])
        self.assertIn("WOULD PUSH student=S1 key=FA:4.1-2", out)
        self.assertNotIn("key=QUIZ:4.2", out)


class TestQuarterTwoPass(unittest.TestCase):
    def test_writes_into_mp2_and_files_new_columns_there(self):
        # After the move: the move tool stamped every registered column where it sits.
        fake = ViewOps(_views(moved=True))
        state = _state(stamps=_stamps(moved=True))
        summary, _ = _run(fake, state, "Q2")
        self.assertEqual(summary["errors"], [])
        self.assertTrue(fake.writes)
        self.assertTrue(all(w[0] == MP2 for w in fake.writes), fake.writes)
        written = sorted((w[1].split("]")[1], w[2], w[3]) for w in fake.writes)
        self.assertEqual(written, [("4.2 Quiz", 0, 0), ("4.2 Quiz", 1, 70), ("4.3 Follow-Along", 0, 88)])
        # 4.8 (taught 11/09) gets its three columns in MP2, due on its class day.
        created = {(c["title"], c["grading_period_id"], c["due_date"]) for c in fake.created_assignments}
        self.assertEqual(created, {("4.8 Follow-Along", MP2, "2026-11-09"), ("4.8 Quiz", MP2, "2026-11-09"),
                                   ("4.8 Blooket", MP2, "2026-11-09")})
        self.assertEqual(state.get_assignment("PeriodB", "FA:4.8")["grading_period_id"], MP2)
        self.assertEqual(summary["grades_other_quarter"], 1)        # FA:4.1-2 is the Q1 pass's
        # Every reload re-selected MP2 (the gradebook reopens on its default view).
        self.assertTrue(all(gp == MP2 for gp in fake.selects))
        self.assertGreaterEqual(len(fake.selects), 4)

    def test_no_zeros_leaves_the_zeros_to_the_fixture(self):
        # Finding B4: build_schoology_fixture --no-zeros already leaves out the LAGGED zeros
        # and keeps an earned 0 (work done, scored 0). The sync writes every target it is
        # given, so S1's earned 0 on the 4.2 quiz reaches MP2.
        fake = ViewOps(_views(moved=True))
        summary, out = _run(fake, _state(stamps=_stamps(moved=True)), "Q2", zeros=False)
        self.assertEqual(summary["errors"], [])
        self.assertEqual(sorted(w[3] for w in fake.writes), [0, 70, 88])
        self.assertIn((MP2, "COL[1173889]4.2 Quiz", 0, 0), fake.writes)
        self.assertNotIn("zeros_held", summary)
        self.assertNotIn("held back", out)

    def test_before_the_move_the_mp1_columns_are_not_found_in_mp2(self):
        # Sunday, before the move and before any stamp: nothing new is due, so nothing is
        # created. A pass never reaches into another marking period: an error per target.
        fake = ViewOps(_views(moved=False))
        summary, out = _run(fake, _state(), "Q2", through="2026-11-08")
        self.assertIsNone(summary.get("aborted"))
        self.assertEqual(fake.writes, [])
        self.assertTrue(any("No gradebook column" in e and "4.2 Quiz" in e for e in summary["errors"]))
        self.assertIn("no marking-period evidence on record", out)

    def test_stamped_before_the_move_the_passes_still_run(self):
        # --stamp before the move records every column in MP1: the Quarter 2 pass checks the
        # MP2 grid against that (none of them on it), files 4.8's new columns in MP2, and
        # finds the not-yet-moved columns missing, as before.
        fake = ViewOps(_views(moved=False))
        summary, _ = _run(fake, _state(stamps=_stamps(moved=False)), "Q2")
        self.assertIsNone(summary.get("aborted"))
        self.assertEqual({c["title"] for c in fake.created_assignments},
                         {"4.8 Follow-Along", "4.8 Quiz", "4.8 Blooket"})
        self.assertEqual(fake.writes, [])
        self.assertTrue(any("No gradebook column" in e and "4.2 Quiz" in e for e in summary["errors"]))
        self.assertTrue(fake.content_checks)
        self.assertTrue(all(gp == MP2 for gp in fake.content_checks))

    def test_monday_before_the_move_the_first_new_column_turns_the_check_on(self):
        # No stamp yet (the move tool has not run): the pass starts on the grid-signature
        # check alone, creates 4.8's first column in MP2 (its row records MP2), and the
        # next gradebook load fails closed: the section now has evidence, and its other
        # registered due columns carry none (finding R4b). The move or --stamp must run
        # before Monday's 16:30 pass.
        fake = ViewOps(_views(moved=False))
        state = _state()
        summary, out = _run(fake, state, "Q2")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertEqual(len(fake.created_assignments), 1)
        self.assertEqual(state.get_assignment("PeriodB", "FA:4.8")["grading_period_id"], MP2)
        self.assertEqual(fake.writes, [])
        self.assertIn("6 registered due column(s) of PeriodB have no marking period on record",
                      summary["errors"][-1])
        self.assertIn("schoology_move_columns.py --section PeriodB --stamp", summary["errors"][-1])


class TestPassAbortsWithoutVerification(unittest.TestCase):
    def test_no_verified_view_no_reads_no_writes(self):
        fake = ViewOps(_views(moved=False), selectable=False)
        state = _state()
        summary, out = _run(fake, state, "Q1")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertIn("could not verify the gradebook shows Marking Period 1173888", summary["errors"][0])
        self.assertIn("nothing written", summary["errors"][0])
        self.assertEqual(fake.writes, [])
        self.assertEqual(fake.created_assignments, [])
        self.assertEqual(state.runs, [])
        self.assertIn("[ABORT]", out)

    def test_a_reload_that_loses_the_view_stops_before_the_next_write(self):
        # The create of 4.8's columns reloads the gradebook; the re-select fails: stop.
        fake = ViewOps(_views(moved=True), fail_after=1)
        state = _state()
        summary, _ = _run(fake, state, "Q2")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertEqual(fake.writes, [])
        self.assertEqual(len(fake.created_assignments), 1)          # the one create before the stop
        self.assertEqual(state.runs[-1]["aborted"], "view-not-verified")

    def test_a_reload_in_the_middle_of_the_push_stops_before_the_next_cell(self):
        # Finding B2: after the first Quarter 1 cell the page reloads on MP2 by itself. The
        # next cell's check sees MP2: no read, no write there, nothing more marked synced.
        fake = ViewOps(_views(moved=False), reload_after_writes=1)
        state = _state()
        grades = {("S1", "FA:4.1-2"): 0, ("S2", "FA:4.1-2"): 50, ("S1", "BL:4.1-2"): 80}
        summary, out = _run(fake, state, "Q1", grades=grades)
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertEqual(fake.writes, [(MP1, "COL[1173888]4.1-2 Follow-Along", 0, 0)])
        self.assertEqual([r for r in fake.reads if r[0] != MP1], [])        # nothing read in MP2
        self.assertEqual(summary["grades_pushed"], 1)
        self.assertIn("no longer shows Marking Period 1173888", summary["errors"][-1])
        self.assertIn("stopped after 1 written cell(s)", summary["errors"][-1])
        self.assertEqual(state.get_last_synced("S1", "FA:4.1-2"), 0)
        self.assertIsNone(state.get_last_synced("S2", "FA:4.1-2"))          # never written: not synced
        self.assertIsNone(state.get_last_synced("S1", "BL:4.1-2"))
        self.assertEqual(state.runs[-1]["aborted"], "view-not-verified")
        self.assertIn("[ABORT]", out)

    def test_the_check_runs_before_every_cell_while_the_view_holds(self):
        fake = ViewOps(_views(moved=False))
        calls = []
        real = fake.displayed_grading_period

        def counted(cdp):
            calls.append(fake.current_gp)
            return real(cdp)

        fake.displayed_grading_period = counted
        grades = {("S1", "FA:4.1-2"): 0, ("S2", "FA:4.1-2"): 50, ("S1", "BL:4.1-2"): 80}
        summary, _ = _run(fake, _state(), "Q1", grades=grades)
        self.assertEqual(summary["errors"], [])
        self.assertEqual(len(fake.writes), 3)
        self.assertEqual(calls, [MP1, MP1, MP1])                               # one check per cell

    def test_no_marking_period_for_the_quarter(self):
        fake = ViewOps(_views(moved=False))
        fake._marking_periods = {MP1: LIVE_MPS[MP1]}
        summary, _ = _run(fake, _state(), "Q2")
        self.assertEqual(summary["aborted"], "no-marking-period")
        self.assertEqual(fake.writes, [])

    def test_unknown_quarter_is_refused_before_schoology(self):
        fake = mock.Mock()
        summary, _ = _run(fake, _state(), "Q9")
        self.assertEqual(summary["aborted"], "bad-quarter")
        fake.connect.assert_not_called()


class TestMarkingPeriodEvidence(unittest.TestCase):
    """Finding R4b (Codex re-review): after every gradebook load the grid's columns must
    agree with the grading_period_id the state records for them; once any column of the
    section carries one, every registered due column must."""

    def test_a_column_filed_in_another_period_on_the_grid_aborts(self):
        # The state says the moved columns sit in MP2, but the MP1 grid still shows them.
        fake = ViewOps(_views(moved=False))
        summary, out = _run(fake, _state(stamps=_stamps(moved=True)), "Q1")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertIn("the grid does not match Marking Period 1173888", summary["errors"][0])
        self.assertIn("filed in another marking period (4.2 Quiz, 4.3 Blooket, 4.3 Follow-Along)",
                      summary["errors"][0])
        self.assertIn("nothing written", summary["errors"][0])
        self.assertEqual((fake.writes, fake.reads, fake.created_assignments), ([], [], []))
        self.assertIn("[ABORT]", out)

    def test_none_of_the_columns_filed_here_on_the_grid_aborts(self):
        # The state says the moved columns sit in MP2, but the MP2 grid shows none of them
        # (an empty or stale grid, finding R4d).
        fake = ViewOps(_views(moved=False))
        summary, _ = _run(fake, _state(stamps=_stamps(moved=True)), "Q2")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertIn("none of the 4 column(s) filed in marking period 1173889 is on the grid",
                      summary["errors"][0])
        self.assertEqual((fake.writes, fake.created_assignments), ([], []))

    def test_no_stamp_at_all_warns_once_and_goes_on(self):
        # Today (11/08): none of the 226 state rows carries a grading_period_id. The LIVE
        # runs must still work before the move: one WARNING, then the grid-signature check.
        fake = ViewOps(_views(moved=False))
        grades = {("S1", "FA:4.1-2"): 0, ("S2", "FA:4.1-2"): 50}
        summary, out = _run(fake, _state(), "Q1", grades=grades)
        self.assertEqual(summary["errors"], [])
        self.assertIsNone(summary.get("aborted"))
        self.assertEqual(out.count("no marking-period evidence on record; relying on the grid-signature check"), 1)
        self.assertEqual(len(fake.writes), 2)
        self.assertEqual(fake.content_checks, [])                  # nothing to compare, nothing read

    def test_a_stamped_section_with_an_unstamped_due_column_aborts(self):
        stamps = _stamps(moved=False)
        del stamps["QUIZ:4.3"]
        fake = ViewOps(_views(moved=False))
        summary, _ = _run(fake, _state(stamps=stamps), "Q1")
        self.assertEqual(summary["aborted"], "view-not-verified")
        self.assertIn("1 registered due column(s) of PeriodB have no marking period on record (4.3 Quiz) "
                      "while 5 do", summary["errors"][0])
        self.assertIn("python tools/schoology_move_columns.py --section PeriodB --stamp", summary["errors"][0])
        self.assertEqual(fake.writes, [])

    def test_an_unstamped_column_not_yet_due_does_not_count(self):
        # Only DUE columns must carry a stamp: a registered column whose lesson moved later
        # is not due yet.
        stamps = _stamps(moved=False)
        del stamps["QUIZ:4.3"]
        fake = ViewOps(_views(moved=False))
        summary, _ = _run(fake, _state(stamps=stamps), "Q1", through="2026-10-26")
        self.assertIsNone(summary.get("aborted"))

    def test_every_reload_is_checked(self):
        # The stamped pass after the move: the initial load, each create's two reloads and
        # the reload before the push are all checked against the evidence.
        fake = ViewOps(_views(moved=True))
        summary, _ = _run(fake, _state(stamps=_stamps(moved=True)), "Q2")
        self.assertEqual(summary["errors"], [])
        self.assertEqual(len(fake.content_checks), 1 + 2 * 3 + 1)
        self.assertTrue(all(gp == MP2 for gp in fake.content_checks))

    def test_a_reused_column_records_the_verified_period(self):
        # A column found by title in the verified view (not yet in the state) is recorded
        # in that marking period: evidence for the next check.
        fake = ViewOps(_views(moved=True))
        state = _state(keys=("FA:4.1-2", "BL:4.1-2", "FA:4.3", "QUIZ:4.3", "BL:4.3"),
                       stamps=_stamps(moved=True))
        summary, _ = _run(fake, state, "Q2")
        self.assertEqual(summary["errors"], [])
        row = state.get_assignment("PeriodB", "QUIZ:4.2")
        self.assertEqual((row["schoology_assignment_id"], row["grading_period_id"]),
                         ("COL[1173889]4.2 Quiz", MP2))


class TestRigWindowStop(unittest.TestCase):
    """Finding R3: a manual --apply run checks the clock before each create and each cell,
    and from 16:00 stops cleanly: the true count, nothing unwritten marked synced."""

    def test_a_manual_run_reaching_16_00_stops_before_the_next_cell(self):
        fake = ViewOps(_views(moved=False))
        state = _state()
        grades = {("S1", "FA:4.1-2"): 0, ("S2", "FA:4.1-2"): 50, ("S1", "BL:4.1-2"): 80}
        times = iter(["15:58", "15:59", "16:00", "16:01"])
        summary, out = _run(fake, state, "Q1", grades=grades, window_clock=lambda: next(times))
        self.assertEqual(summary["aborted"], "rig-window")
        self.assertEqual(summary["grades_pushed"], 2)
        self.assertEqual([w[3] for w in fake.writes], [0, 50])
        self.assertEqual(len(fake.reads), 2)                       # the third cell is not even read
        self.assertEqual(state.get_last_synced("S1", "FA:4.1-2"), 0)
        self.assertEqual(state.get_last_synced("S2", "FA:4.1-2"), 50)
        self.assertIsNone(state.get_last_synced("S1", "BL:4.1-2"))  # never written: not synced
        self.assertIn("it is 16:00", summary["errors"][-1])
        self.assertIn("ApStatsSchoologySync-B at 16:30, ApStatsSchoologySync-E at 16:45", summary["errors"][-1])
        self.assertIn("stopped after 2 written cell(s)", summary["errors"][-1])
        self.assertEqual(state.runs[-1]["aborted"], "rig-window")
        self.assertIn("[ABORT]", out)

    def test_the_clock_is_checked_before_each_create(self):
        fake = ViewOps(_views(moved=True))
        times = iter(["15:59", "16:00"])
        summary, _ = _run(fake, _state(stamps=_stamps(moved=True)), "Q2", window_clock=lambda: next(times))
        self.assertEqual(summary["aborted"], "rig-window")
        self.assertEqual(len(fake.created_assignments), 1)
        self.assertEqual(summary["assignments_created"], 1)
        self.assertEqual((fake.writes, summary["grades_pushed"]), ([], 0))

    def test_no_clock_never_stops(self):
        # A dry run and the daily job's own steps pass no clock.
        fake = ViewOps(_views(moved=False))
        grades = {("S1", "FA:4.1-2"): 0, ("S2", "FA:4.1-2"): 50}
        summary, _ = _run(fake, _state(), "Q1", grades=grades, window_clock=None)
        self.assertEqual((summary["errors"], summary["grades_pushed"]), ([], 2))


class LockOps(ViewOps):
    """ViewOps whose connect records who holds the rig lock at that moment."""

    def __init__(self, *args, lock_path, connect_error=None, **kw):
        super().__init__(*args, **kw)
        self.lock_path = lock_path
        self.connect_error = connect_error
        self.lock_at_connect = "never connected"

    def connect(self, reuse=True):
        self.lock_at_connect = lib.rig_lock_holder(self.lock_path)
        if self.connect_error:
            raise self.connect_error
        return super().connect(reuse)


class TestRigLockAndWindow(unittest.TestCase):
    """Finding R3 (Codex re-review): sync.main HOLDS the shared rig lock from before the CDP
    connect to the end, in every mode; a step of the daily job inherits it; a manual run
    never starts from 16:00 to 17:05. The real sync_section runs on fake ops; the lock is a
    temp file."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = tmp.name
        self.lock = os.path.join(tmp.name, "logs", "rig.lock")
        for patcher in (mock.patch.object(lib, "RIG_LOCK_PATH", self.lock), mock.patch.dict(os.environ)):
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop(lib.RIG_LOCK_OWNER_ENV, None)

    def _hold(self, owner, pid=None):
        """A lock file as another run (or the daily job's ps1) writes it."""
        os.makedirs(os.path.dirname(self.lock), exist_ok=True)
        with open(self.lock, "w", encoding="utf-8") as fh:
            fh.write("%d %s 2026-11-09T16:30:00-05:00" % (pid or os.getpid(), owner) + chr(10))

    def _main(self, argv, fake, state=None, *, hhmm="10:00", clock=None, school_clock=False):
        """clock: main()'s clock (default: always hhmm). school_clock: pass main() no clock,
        so it reads schoology_sync_lib.school_hhmm."""
        clock = clock or (lambda: hhmm)
        clock_arg = {} if school_clock else {"clock": clock}
        schedule = os.path.join(self.dir, "schedule.json")
        with open(schedule, "w", encoding="utf-8") as fh:
            json.dump(SCHEDULE, fh)
        fixture = os.path.join(self.dir, "grades.json")
        with open(fixture, "w", encoding="utf-8") as fh:
            json.dump({"S1/FA:4.1-2": 0, "S2/FA:4.1-2": 50}, fh)
        real_sync = sync.sync_section

        def on_fakes(section, course_id, **kw):
            kw.update(ops=fake, schedule_path=schedule, quiz_topics=QUIZZES, blooket_topics=DECKS,
                      ced=False, rename_state={})
            return real_sync(section, course_id, **kw)

        state = state or _state()
        out = io.StringIO()
        code = 0
        with mock.patch.object(sync, "sync_section", on_fakes), \
                mock.patch.object(sync, "LocalJsonStateStore", lambda: state), \
                contextlib.redirect_stdout(out):
            try:
                sync.main(["--sync-section", "PeriodB", "--granularity", "component", "--quarter", "Q1",
                           "--today", "2026-11-09", "--grades-fixture", fixture] + argv,
                          **clock_arg)
            except SystemExit as stop:
                code = stop.code
        return code, out.getvalue()

    def test_the_lock_is_held_from_before_the_connect_and_released(self):
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        code, _ = self._main(["--apply"], fake)
        self.assertEqual(code, 0)
        self.assertEqual((fake.lock_at_connect["pid"], fake.lock_at_connect["owner"]), (os.getpid(), "sync"))
        self.assertEqual(len(fake.writes), 2)
        self.assertFalse(os.path.exists(self.lock))                       # released
        self.assertIsNone(os.environ.get(lib.RIG_LOCK_OWNER_ENV))

    def test_a_dry_run_holds_the_lock_too(self):
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        code, _ = self._main(["--dry-run"], fake)
        self.assertEqual(code, 0)
        self.assertEqual(fake.lock_at_connect["owner"], "sync")
        self.assertFalse(os.path.exists(self.lock))

    def test_the_lock_is_released_when_the_run_fails(self):
        fake = LockOps(_views(moved=False), lock_path=self.lock,
                       connect_error=RuntimeError("the Edge tab went away"))
        with self.assertRaises(RuntimeError):
            self._main(["--apply"], fake)
        self.assertEqual(fake.lock_at_connect["owner"], "sync")           # held at the connect
        self.assertFalse(os.path.exists(self.lock))

    def test_a_busy_rig_refuses_before_edge(self):
        self._hold("move-columns")                                        # another live run
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        code, out = self._main(["--apply"], fake)
        self.assertEqual(code, 5)
        self.assertIn("the Schoology rig is busy", out)
        self.assertIn("held by move-columns (pid %d)" % os.getpid(), out)
        self.assertEqual(fake.lock_at_connect, "never connected")
        self.assertEqual(fake.writes, [])
        self.assertTrue(os.path.exists(self.lock))                        # not ours: left alone

    def test_a_daily_job_step_runs_inside_the_window_and_keeps_the_lock(self):
        # daily_schoology_sync.ps1 holds the lock ("<pid> PeriodB <time>") and exports
        # APSTATS_RIG_LOCK_OWNER; its 16:30 sync step inherits the lock and is exempt.
        self._hold("PeriodB")
        os.environ[lib.RIG_LOCK_OWNER_ENV] = str(os.getpid())
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        code, _ = self._main(["--apply"], fake, hhmm="16:30")
        self.assertEqual(code, 0)
        self.assertEqual(fake.lock_at_connect["owner"], "PeriodB")
        self.assertEqual(len(fake.writes), 2)
        self.assertTrue(os.path.exists(self.lock))                        # the job's lock: never released here
        self.assertEqual(os.environ.get(lib.RIG_LOCK_OWNER_ENV), str(os.getpid()))

    def test_a_manual_run_never_starts_in_the_window(self):
        for argv in (["--apply"], ["--dry-run"]):
            for hhmm in ("16:00", "16:30", "17:04"):
                fake = LockOps(_views(moved=False), lock_path=self.lock)
                code, out = self._main(argv, fake, hhmm=hhmm)
                self.assertEqual(code, 3, (argv, hhmm))
                self.assertIn("it is %s" % hhmm, out)
                self.assertIn("ApStatsSchoologySync-B at 16:30, ApStatsSchoologySync-E at 16:45", out)
                self.assertIn("Nothing read or written", out)
                self.assertEqual(fake.lock_at_connect, "never connected")
                self.assertFalse(os.path.exists(self.lock))
        for hhmm in ("15:59", "17:05"):
            fake = LockOps(_views(moved=False), lock_path=self.lock)
            self.assertEqual(self._main(["--dry-run"], fake, hhmm=hhmm)[0], 0, hhmm)

    def test_a_lock_inherited_from_a_manual_tool_is_still_a_manual_run(self):
        # Only the daily job's own steps (owner PeriodB / PeriodE) are exempt.
        self._hold("close-quarter")
        os.environ[lib.RIG_LOCK_OWNER_ENV] = str(os.getpid())
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        code, _ = self._main(["--apply"], fake, hhmm="16:30")
        self.assertEqual(code, 3)
        self.assertEqual(fake.lock_at_connect, "never connected")
        self.assertTrue(os.path.exists(self.lock))

    def test_a_manual_apply_reaching_16_00_exits_3_with_the_true_count(self):
        state = _state()
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        times = iter(["15:59", "15:59", "16:00"])                         # start, cell 1, cell 2
        code, out = self._main(["--apply"], fake, state, clock=lambda: next(times))
        self.assertEqual(code, 3)
        self.assertEqual(len(fake.writes), 1)
        self.assertEqual(state.runs[-1]["aborted"], "rig-window")
        self.assertEqual(state.runs[-1]["grades_pushed"], 1)
        self.assertEqual(state.get_last_synced("S1", "FA:4.1-2"), 0)
        self.assertIsNone(state.get_last_synced("S2", "FA:4.1-2"))
        self.assertIn("it is 16:00", out)
        self.assertFalse(os.path.exists(self.lock))

    def test_an_evidence_abort_exits_3(self):
        # Finding R4b through the CLI: a column filed in MP2 on the MP1 grid, and a stamped
        # section with an unstamped due column, both end the run with exit 3, nothing written.
        stamps = _stamps(moved=False)
        del stamps["QUIZ:4.3"]
        for state in (_state(stamps=_stamps(moved=True)), _state(stamps=stamps)):
            fake = LockOps(_views(moved=False), lock_path=self.lock)
            code, out = self._main(["--apply"], fake, state)
            self.assertEqual(code, 3)
            self.assertEqual(fake.writes, [])
            self.assertIn("[ABORT]", out)
            self.assertFalse(os.path.exists(self.lock))

    def test_the_default_clock_is_the_school_clock(self):
        fake = LockOps(_views(moved=False), lock_path=self.lock)
        with mock.patch.object(lib, "school_hhmm", lambda: "16:10"):
            code, _ = self._main(["--dry-run"], fake, school_clock=True)
        self.assertEqual(code, 3)
        self.assertEqual(fake.lock_at_connect, "never connected")


class TestCli(unittest.TestCase):
    def setUp(self):
        # main() takes the rig lock: never the real one from a test.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for patcher in (mock.patch.object(lib, "RIG_LOCK_PATH", os.path.join(tmp.name, "rig.lock")),
                        mock.patch.dict(os.environ)):
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop(lib.RIG_LOCK_OWNER_ENV, None)

    def test_apply_needs_a_quarter(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), mock.patch.object(sync, "LocalJsonStateStore") as store, \
                self.assertRaises(SystemExit) as stop:
            sync.main(["--sync-section", "PeriodB", "--granularity", "component", "--apply"])
        self.assertEqual(stop.exception.code, 2)
        self.assertIn("--apply needs --quarter", out.getvalue())
        store.assert_not_called()

    def test_new_flags(self):
        args = sync._parse_args(["--sync-section", "PeriodE", "--quarter", "Q2", "--no-zeros",
                                 "--today", "2026-11-09"])
        self.assertEqual((args.quarter, args.no_zeros, args.today), ("Q2", True, "2026-11-09"))
        self.assertIsNone(sync._parse_args(["--sync-section", "PeriodE"]).quarter)
        with contextlib.redirect_stderr(io.StringIO()):
            for bad in (["--quarter", "Q5"], ["--today", "11/09/2026"]):
                with self.assertRaises(SystemExit):
                    sync._parse_args(["--sync-section", "PeriodB"] + bad)

    def test_today_sets_comments_and_the_default_through(self):
        captured = {}

        def fake_sync(section, course_id, **kw):
            captured.update(kw)
            return {"errors": []}

        with mock.patch.object(sync, "sync_section", fake_sync), \
                mock.patch.object(sync, "LocalJsonStateStore", lambda: FakeStateStore()), \
                contextlib.redirect_stdout(io.StringIO()):
            sync.main(["--sync-section", "PeriodB", "--quarter", "Q2", "--today", "2026-11-09", "--no-zeros"],
                      clock=lambda: "10:00")
        self.assertEqual((captured["today"], captured["through_date"], captured["quarter"], captured["zeros"]),
                         ("2026-11-09", "2026-11-09", "Q2", False))
        self.assertIsNone(captured["window_clock"])                       # a dry run never stops on the clock

    def test_a_manual_apply_gets_the_clock(self):
        captured = {}

        def fake_sync(section, course_id, **kw):
            captured.update(kw)
            return {"errors": []}

        clock = lambda: "10:00"  # noqa: E731
        with mock.patch.object(sync, "sync_section", fake_sync), \
                mock.patch.object(sync, "LocalJsonStateStore", lambda: FakeStateStore()), \
                contextlib.redirect_stdout(io.StringIO()):
            sync.main(["--sync-section", "PeriodB", "--quarter", "Q2", "--apply"], clock=clock)
        self.assertIs(captured["window_clock"], clock)


# ---------------------------------------------------------------------------
# schoology_ops: select + verify the marking-period filter
# ---------------------------------------------------------------------------

def _label(gp):
    s, e = LIVE_MPS[gp]["start"], LIVE_MPS[gp]["end"]

    def short(iso):
        y, m, d = iso.split("-")
        return "%d/%s/%s" % (int(m), d, y[2:])

    index = lib.marking_periods_in_order(LIVE_MPS).index(gp) + 1
    return "Marking Period %d: %s - %s" % (index, short(s), short(e))


class SelectCDP:
    """Scripts the gradebook's select2 filter: a click on the link opens the options,
    a click on an option switches the period; the select2 API switches it directly.

    Row 0 of the grid shows the shown period's own columns, as a real switch does
    (schoology_ops checks that the grid changed, finding A3). stale_grid: the filter and
    header switch but the grid keeps the period it opened on.
    """

    def __init__(self, gp=MP2, *, click_opens=True, select2_works=True, available=None, stale_grid=False):
        self.gp = gp
        self.grid_gp = gp
        self.stale_grid = stale_grid
        self.order = lib.marking_periods_in_order(LIVE_MPS)
        self.click_opens = click_opens
        self.select2_works = select2_works
        self.available = available if available is not None else self.order + ["all", "final", "none"]
        self.open = False
        self.clicks = []
        self.sent = []

    def send(self, method, params=None):
        self.sent.append(method)

    def click(self, x, y):
        self.clicks.append((x, y))
        if (x, y) == (10, 10):
            self.open = self.click_opens
        elif self.open and y >= 100:
            self.gp = self.order[y - 100]
            self.open = False

    def eval_js(self, expr):
        if "available_grading_periods" in expr:
            return json.dumps({"gp": self.gp, "header": _label(self.gp), "chosen": _label(self.gp),
                               "available": self.available})
        if "a.select2-choice" in expr:
            return "[10, 10]"
        if "select2-result-selectable" in expr and "out.push" in expr:
            return json.dumps([_label(g) for g in self.order]) if self.open else None
        if "select2-result-selectable" in expr:
            index = int(re.search(r"\((\d+)\)\s*$", expr).group(1))
            return json.dumps([50, 100 + index])
        if "select2('val'" in expr:
            if not self.select2_works:
                return "select2 API not available"
            self.gp = json.loads(re.search(r"\((\".*?\")\)\s*$", expr).group(1))
            return "ok"
        if expr == ops._ASSIGNMENT_SIGNATURE_JS:
            if not self.stale_grid:
                self.grid_gp = self.gp
            # 'count:index|title' (finding R4a): one column titled after its period.
            return "6:0|columns of %s" % self.grid_gp
        return None


class TestSelectGradingPeriod(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(ops.time, "sleep", lambda _s: None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def select(self, cdp, gp):
        return ops.select_grading_period(cdp, gp, LIVE_MPS[gp], timeout_s=0.05)

    def test_already_shown(self):
        cdp = SelectCDP(gp=MP2)
        result = self.select(cdp, MP2)
        self.assertEqual((result["ok"], result["method"]), (True, "already shown"))
        self.assertEqual(cdp.clicks, [])

    def test_a_real_click_switches_the_period(self):
        cdp = SelectCDP(gp=MP2)
        result = self.select(cdp, MP1)
        self.assertEqual((result["ok"], result["method"]), (True, "click"))
        self.assertEqual(cdp.gp, MP1)
        self.assertEqual(cdp.clicks, [(10, 10), (50, 100)])

    def test_the_select2_api_is_the_fallback(self):
        cdp = SelectCDP(gp=MP2, click_opens=False)
        result = self.select(cdp, MP1)
        self.assertEqual((result["ok"], result["method"]), (True, "select2"))

    def test_a_grid_that_keeps_the_old_columns_is_not_ok(self):
        # The filter and the header say MP1 but row 0 still shows MP2's columns.
        cdp = SelectCDP(gp=MP2, stale_grid=True)
        result = self.select(cdp, MP1)
        self.assertFalse(result["ok"])
        self.assertEqual(cdp.gp, MP1)

    def test_nothing_works_means_not_ok(self):
        cdp = SelectCDP(gp=MP2, click_opens=False, select2_works=False)
        result = self.select(cdp, MP1)
        self.assertFalse(result["ok"])
        self.assertIn("select2", result["error"])
        self.assertEqual(cdp.gp, MP2)

    def test_an_id_the_course_does_not_list_is_refused(self):
        cdp = SelectCDP(gp=MP2, available=[MP2, "all"])
        result = self.select(cdp, MP1)
        self.assertFalse(result["ok"])
        self.assertIn("not in Drupal.available_grading_periods", result["error"])
        self.assertEqual(cdp.clicks, [])

    def test_no_filter_on_the_page(self):
        class Blank:
            def eval_js(self, expr):
                return None
        result = ops.select_grading_period(Blank(), MP1, LIVE_MPS[MP1], timeout_s=0.01)
        self.assertFalse(result["ok"])
        self.assertIn("no marking-period filter", result["error"])


class TestViewMatches(unittest.TestCase):
    view = {"gp": MP2, "header": "Marking Period 2: 11/07/26 - 1/22/27",
            "available": [MP1, MP2, "all"]}

    def test_all_three_signs_must_agree(self):
        self.assertIsNone(ops.grading_period_view_matches(self.view, MP2, LIVE_MPS[MP2]))
        self.assertIn("filter holds", ops.grading_period_view_matches(self.view, MP1, LIVE_MPS[MP1]))
        self.assertIn("header reads", ops.grading_period_view_matches(
            dict(self.view, header="Marking Period 1: 9/02/26 - 11/06/26"), MP2, LIVE_MPS[MP2]))
        self.assertIn("available", ops.grading_period_view_matches(dict(self.view, available=None), MP2))
        self.assertIn("column header", ops.grading_period_view_matches(dict(self.view, header=None), MP2))
        self.assertIsNotNone(ops.grading_period_view_matches(None, MP2))

    def test_label_dates(self):
        self.assertEqual(ops.parse_mp_label_range("Marking Period 2: 11/07/26 - 1/22/27"),
                         ("2026-11-07", "2027-01-22"))
        self.assertEqual(ops.parse_mp_label_range("Marking Period 4: 4/11/2026 - 6/30/2026"),
                         ("2026-04-11", "2026-06-30"))
        self.assertIsNone(ops.parse_mp_label_range("All Grading Periods"))


class TestViewJsOnTheCapturedGradebook(unittest.TestCase):
    """Run the real view-reading JS against the P0 gradebook capture (jsdom, no page scripts)."""

    def test_reads_the_filter_header_and_period_list(self):
        script = r"""
const fs = require('fs');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('tests/fixtures/schoology-gradebook-apstats-sec1.html', 'utf8');
const dom = new JSDOM(html, {runScripts: 'outside-only'});
const m = html.match(/Drupal\.available_grading_periods = (\[[^\]]*\])/);
dom.window.Drupal = {available_grading_periods: JSON.parse(m[1])};
const expr = fs.readFileSync(0, 'utf8');
process.stdout.write(String(dom.window.eval(expr)));
dom.window.close();
"""
        result = subprocess.run(["node", "-e", script], input=ops._GRADING_PERIOD_VIEW_JS, text=True,
                                encoding="utf-8", capture_output=True, check=True,
                                cwd=Path(__file__).resolve().parents[1], timeout=60)
        view = json.loads(result.stdout)
        self.assertEqual(view["gp"], "1134332")
        self.assertEqual(view["header"], "Marking Period 4: 4/11/26 - 6/30/26")
        self.assertEqual(view["chosen"], "Marking Period 4: 4/11/26 - 6/30/26")
        self.assertEqual(view["available"], ["1134333", "1134331", "1134334", "1134332", "all", "final", "none"])
        self.assertIsNone(ops.grading_period_view_matches(
            view, "1134332", {"start": "2026-04-11", "end": "2026-06-30"}))


if __name__ == "__main__":
    unittest.main()
