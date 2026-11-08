"""tools/schoology_move_columns.py: the one-time MP1 -> MP2 move (QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.3).

Fake ops only -- no browser, no live Schoology. Covers the plan (the exact B 12 / E 14
columns of the spec, B's 2.3 Follow-Along / Blooket excluded), the readback assertion, the
--one / --apply flow (one first, abort on the first mismatch), --inspect never submitting,
the start guards (16:00-17:05), the rig lock HELD around every Edge use and the 16:00 stop
between moves (finding B1), the state re-read before each record (B1), the edit-form
field guard and the saved-form readback (B5), the state backup (B6), and the marking-period
stamps (R4c): --apply stamps every registered column at the end of a successful run (and at
a clean 16:00 stop), --stamp stamps by visibility and moves nothing, a guess is refused, and
the stamps survive another run's save.

ASCII only. LF line endings.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import re
import sys
import tempfile
import types
import unittest
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

import schoology_move_columns as mv  # noqa: E402
import schoology_sync_section as sync  # noqa: E402
from test_schoology_sync_section import FakeStateStore  # noqa: E402

MP1, MP2 = "1173888", "1173889"
LIVE_MPS = {
    MP1: {"start": "2026-09-02", "end": "2026-11-06"},
    MP2: {"start": "2026-11-07", "end": "2027-01-22"},
    "1173886": {"start": "2027-01-23", "end": "2027-04-14"},
    "1173887": {"start": "2027-04-15", "end": "2027-06-30"},
}

# QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4: every after-the-line column (CED titles).
SPEC_B = {"2.3 Day 2 Quiz", "2.4-2.6 Follow-Along", "2.4-2.6 Blooket", "2.4 Quiz", "2.5 Quiz", "2.6 Quiz",
          "2.7 Follow-Along", "2.7 Blooket", "2.7 Quiz", "2.8-2.9 Follow-Along", "2.8-2.9 Blooket", "2.8 Quiz"}
SPEC_E = {"2.2 Follow-Along", "2.2 Blooket", "2.2 Quiz", "2.3 Follow-Along", "2.3 Blooket", "2.3 Day 2 Quiz",
          "2.4-2.6 Follow-Along", "2.4-2.6 Blooket", "2.4 Quiz", "2.5 Quiz", "2.6 Quiz",
          "2.7 Follow-Along", "2.7 Blooket", "2.7 Quiz"}


def _live_items(section):
    return sync.build_component_scope(sync.load_schedule(), section, ced=True)


def _registered(items, through="2026-11-07"):
    """The columns the sync had created by Saturday 11/07: every column due by then."""
    return {i["key"]: {"schoology_assignment_id": "id-" + i["key"], "title": i["title"]}
            for i in items if i.get("due_date") and i["due_date"] <= through}


class TestPlanOnTheLiveSchedule(unittest.TestCase):
    def _plan(self, section):
        items = _live_items(section)
        registered = _registered(items)
        mp1 = {items_by["title"]: 3 for items_by in items if items_by["key"] in registered}
        return mv.plan_moves(section, items, registered, LIVE_MPS, mp1, {})

    def test_period_b_moves_the_spec_12_and_keeps_2_3_in_mp1(self):
        plan = self._plan("PeriodB")
        self.assertEqual({m["title"] for m in plan["moves"]}, SPEC_B)
        self.assertEqual(len(plan["moves"]), 12)
        self.assertEqual({(m["key"], m["title"]) for m in plan["excluded"]},
                         {("FA:4.1-2", "2.3 Follow-Along"), ("BL:4.1-2", "2.3 Blooket")})
        self.assertTrue(all("decision 2" in m["reason"] for m in plan["excluded"]))
        self.assertTrue(all((m["from_mp"], m["to_mp"]) == (MP1, MP2) for m in plan["moves"]))
        self.assertEqual((plan["missing"], plan["conflicts"], plan["done"]), ([], [], []))

    def test_period_e_moves_the_spec_14(self):
        plan = self._plan("PeriodE")
        self.assertEqual({m["title"] for m in plan["moves"]}, SPEC_E)
        self.assertEqual(len(plan["moves"]), 14)
        self.assertEqual(plan["excluded"], [])

    def test_the_moved_lessons_are_the_spec_sets(self):
        # B 4.2-4.7 and E 2.3, 4.1-4.6: the lessons taught in Q1 that are regular in Q2.
        for section, lessons in (("PeriodB", {"4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"}),
                                 ("PeriodE", {"2.3", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6"})):
            plan = self._plan(section)
            topics = set()
            for m in plan["moves"]:
                topics |= set(next(i for i in _live_items(section) if i["key"] == m["key"])["topic_keys"])
            self.assertEqual(topics, lessons, section)   # B's 4.7-8 group carries 4.8 along

    def test_a_column_already_in_mp2_or_in_both_views(self):
        items = _live_items("PeriodB")
        registered = _registered(items)
        mp1 = {i["title"]: 2 for i in items if i["key"] in registered and i["title"] != "2.4 Quiz"}
        plan = mv.plan_moves("PeriodB", items, registered, LIVE_MPS, mp1, {"2.4 Quiz": 2, "2.5 Quiz": 1})
        self.assertEqual([m["title"] for m in plan["done"]], ["2.4 Quiz"])
        self.assertEqual([m["title"] for m in plan["conflicts"]], ["2.5 Quiz"])
        plan = mv.plan_moves("PeriodB", items, registered, LIVE_MPS, {}, {})
        self.assertEqual({m["title"] for m in plan["missing"]}, SPEC_B)

    def test_unregistered_columns_are_left_to_the_sync(self):
        items = _live_items("PeriodB")
        plan = mv.plan_moves("PeriodB", items, {}, LIVE_MPS, {i["title"]: 0 for i in items}, {})
        self.assertEqual(plan["moves"], [])


class TestReadback(unittest.TestCase):
    def test_check(self):
        self.assertIsNone(mv.check_readback("2.4 Quiz", 11, {"2.4 Quiz": 11}))
        self.assertIn("not in the Marking Period 2 view", mv.check_readback("2.4 Quiz", 11, {}))
        self.assertIn("shows 10 filled cells", mv.check_readback("2.4 Quiz", 11, {"2.4 Quiz": 10}))
        self.assertEqual(mv.leftovers_in_mp1(["2.4 Quiz", "2.5 Quiz"], {"2.5 Quiz": 0}), ["2.5 Quiz"])

    def test_filled_counts(self):
        gradebook = {"u1": {"cells": {"2.4 Quiz": 90, "2.5 Quiz": None}},
                     "u2": {"cells": {"2.4 Quiz": 0, "2.5 Quiz": None}}}
        self.assertEqual(mv.filled_counts(gradebook), {"2.4 Quiz": 2, "2.5 Quiz": 0})


class FakeRig:
    """Two marking-period views of one course; a move edits the column's period."""

    SCHOOLOGY_BASE = "https://example.invalid"

    def __init__(self, items, registered, *, lose_a_cell=None, move_error=None):
        self.views = {MP1: {i["title"]: 4 for i in items if i["key"] in registered}, MP2: {}}
        self.moves = []
        self.lose_a_cell = lose_a_cell
        self.move_error = move_error

    def navigate(self, cdp, url):
        pass

    def gradebook_url(self, course_id):
        return "gradebook"

    def inject_helpers(self, cdp):
        pass

    def detect_login_state(self, cdp):
        return "authenticated"

    def list_marking_periods(self, cdp, course_id):
        return LIVE_MPS

    # schoology_move_columns hooks (patched in)
    def read_counts(self, ops_, cdp, course_id, view):
        return dict(self.views[view["grading_period_id"]])

    def move_column(self, ops_, cdp, course_id, nid, title, target_mp, period_field="grading_period_id",
                    edit_url=mv.DEFAULT_EDIT_URL):
        if self.move_error:
            return {"ok": False, "error": self.move_error}
        self.moves.append((nid, title, target_mp))
        filled = self.views[MP1].pop(title)
        self.views[target_mp][title] = filled - (1 if title == self.lose_a_cell else 0)
        return {"ok": True, "error": None}

    def node_ids_for(self, ops_, cdp, course_id, titles):
        return {t: "nid-" + t for t in titles}, {}


class TestRunSection(unittest.TestCase):
    def setUp(self):
        self.items = _live_items("PeriodB")
        self.registered = _registered(self.items)
        self.state = FakeStateStore()
        for key, row in self.registered.items():
            self.state.upsert_assignment("PeriodB", key, dict(row))

    def _run(self, rig, *, apply=False, one=None, clock=lambda: "10:00"):
        with mock.patch.object(mv, "read_counts", rig.read_counts), \
                mock.patch.object(mv, "move_column", rig.move_column), \
                mock.patch.object(mv, "node_ids_for", rig.node_ids_for), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            result = mv.run_section(rig, None, "PeriodB", "course", items=self.items, state=self.state,
                                    apply=apply, one=one, clock=clock)
        return result, out.getvalue()

    def test_dry_run_lists_every_move_and_changes_nothing(self):
        rig = FakeRig(self.items, self.registered)
        result, out = self._run(rig)
        self.assertIsNone(result["failed"])
        self.assertEqual(rig.moves, [])
        self.assertIn("12 to move (MP 1173888 -> MP 1173889)", out)
        self.assertIn("MOVE      PeriodB '2.4 Quiz' key=QUIZ:4.3 nid=nid-2.4 Quiz MP 1173888 -> MP 1173889 filled=4", out)
        self.assertIn("EXCLUDED  PeriodB '2.3 Follow-Along' key=FA:4.1-2", out)
        self.assertNotIn("grading_period_id", json.dumps(self.state.get_assignment("PeriodB", "QUIZ:4.3")))

    def test_apply_needs_one_first_then_moves_the_rest(self):
        rig = FakeRig(self.items, self.registered)
        result, out = self._run(rig, apply=True)
        self.assertEqual(result["failed"], "one-first")
        self.assertEqual(rig.moves, [])
        result, _ = self._run(rig, apply=True, one="2.4 Quiz")
        self.assertEqual((result["failed"], result["moved"]), (None, 1))
        self.assertEqual(rig.moves, [("nid-2.4 Quiz", "2.4 Quiz", MP2)])
        row = self.state.get_assignment("PeriodB", "QUIZ:4.3")
        self.assertEqual((row["grading_period_id"], row["moved_from"]), (MP2, MP1))
        result, _ = self._run(rig, apply=True)
        self.assertEqual((result["failed"], result["moved"]), (None, 11))
        self.assertEqual(set(rig.views[MP2]), SPEC_B)
        self.assertEqual(set(rig.views[MP1]) & SPEC_B, set())
        self.assertIn("2.3 Follow-Along", rig.views[MP1])          # decision 2: stays
        # Nothing left: a re-run plans no move and reports the 12 as done.
        result, out = self._run(rig, apply=True)
        self.assertEqual((result["failed"], result["moved"], len(result["plan"]["done"])), (None, 0, 12))

    def test_one_must_be_a_planned_move(self):
        rig = FakeRig(self.items, self.registered)
        result, _ = self._run(rig, apply=True, one="2.3 Follow-Along")
        self.assertEqual(result["failed"], "not-planned")
        self.assertEqual(rig.moves, [])

    def test_the_first_readback_mismatch_stops_the_run(self):
        rig = FakeRig(self.items, self.registered, lose_a_cell="2.5 Quiz")
        self._run(rig, apply=True, one="2.4 Quiz")
        result, out = self._run(rig, apply=True)
        self.assertEqual(result["failed"], "2.5 Quiz")
        self.assertIn("shows 3 filled cells in Marking Period 2; it had 4", out)
        self.assertIn("re-run --stamp before the next sync", out)
        # The failed move recorded nothing: the row keeps the MP1 stamp the --one run gave it.
        row = self.state.get_assignment("PeriodB", "QUIZ:4.4")
        self.assertEqual((row["grading_period_id"], row.get("moved_from")), (MP1, None))
        self.assertNotIn("[STAMP]", out)                             # a failed run stamps nothing
        moved_after = [t for _, t, _ in rig.moves]
        self.assertEqual(moved_after[-1], "2.5 Quiz")                # nothing after the mismatch

    def test_a_failed_edit_stops_before_any_state_change(self):
        rig = FakeRig(self.items, self.registered, move_error="Schoology rejected the edit: due date")
        result, out = self._run(rig, apply=True, one="2.4 Quiz")
        self.assertEqual(result["failed"], "2.4 Quiz")
        self.assertIn("rejected the edit", out)
        self.assertNotIn("grading_period_id", self.state.get_assignment("PeriodB", "QUIZ:4.3"))

    def test_an_unverified_view_stops_before_planning(self):
        rig = FakeRig(self.items, self.registered)

        def unverified(*_a, **_k):
            raise mv.lib.ViewNotVerified("could not verify the gradebook shows Marking Period 1173888")

        with mock.patch.object(mv, "read_counts", unverified), contextlib.redirect_stdout(io.StringIO()):
            result = mv.run_section(rig, None, "PeriodB", "course", items=self.items, state=self.state,
                                    apply=True, one="2.4 Quiz", clock=lambda: "10:00")
        self.assertEqual(result["failed"], "view-not-verified")
        self.assertEqual(rig.moves, [])

    def test_the_clock_is_checked_again_before_each_move(self):
        # Finding B1: a long --apply must not reach the 16:30 LIVE task. Two moves fit before
        # 16:00; the next one waits, and the moves made are recorded.
        rig = FakeRig(self.items, self.registered)
        self._run(rig, apply=True, one="2.4 Quiz")
        times = iter(["15:58", "15:59", "16:00", "16:01"])
        result, out = self._run(rig, apply=True, clock=lambda: next(times))
        self.assertEqual((result["failed"], result["moved"]), ("sync-window", 2))
        self.assertEqual(len(rig.moves), 3)                          # --one + two before 16:00
        self.assertIn("it is 16:00", out)
        self.assertIn("ApStatsSchoologySync-B at 16:30", out)
        self.assertIn("Re-run after 17:05", out)
        recorded = [k for k in self.registered
                    if (self.state.get_assignment("PeriodB", k) or {}).get("moved_from")]
        self.assertEqual(len(recorded), 3)

    def test_each_record_re_reads_the_state_file(self):
        # Finding B1: every save writes the whole in-memory copy. Another run saves the file
        # while this run moves a column: that save must survive the move's own record.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, "state.json")
        self.state = sync.LocalJsonStateStore(path)
        for key, row in self.registered.items():
            self.state.upsert_assignment("PeriodB", key, dict(row))
        rig = FakeRig(self.items, self.registered)
        move_for_real = rig.move_column

        def move_while_another_run_saves(*args, **kwargs):
            sync.LocalJsonStateStore(path).set_last_synced("S7", "QUIZ:4.4", 88)
            return move_for_real(*args, **kwargs)

        rig.move_column = move_while_another_run_saves
        result, _ = self._run(rig, apply=True, one="2.4 Quiz")
        self.assertIsNone(result["failed"])
        on_disk = sync.LocalJsonStateStore(path)
        self.assertEqual(on_disk.get_last_synced("S7", "QUIZ:4.4"), 88)          # the other save survives
        row = on_disk.get_assignment("PeriodB", "QUIZ:4.3")
        self.assertEqual((row["grading_period_id"], row["schoology_assignment_id"]), (MP2, "id-QUIZ:4.3"))


class TestStamping(unittest.TestCase):
    """Finding R4c (Codex re-review): the tool records the marking-period evidence the sync
    checks every view against. --apply stamps EVERY registered column at the end of a
    successful run; --stamp stamps by visibility and moves nothing; a guess is refused."""

    def setUp(self):
        self.items = _live_items("PeriodB")
        self.registered = _registered(self.items)
        self.title_of = {i["key"]: i["title"] for i in self.items}
        self.state = FakeStateStore()
        for key, row in self.registered.items():
            self.state.upsert_assignment("PeriodB", key, dict(row))

    def _run(self, rig, *, apply=True, one=None, clock=lambda: "10:00"):
        with mock.patch.object(mv, "read_counts", rig.read_counts), \
                mock.patch.object(mv, "move_column", rig.move_column), \
                mock.patch.object(mv, "node_ids_for", rig.node_ids_for), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            result = mv.run_section(rig, None, "PeriodB", "course", items=self.items, state=self.state,
                                    apply=apply, one=one, clock=clock)
        return result, out.getvalue()

    def _stamp(self, rig):
        never = AssertionError("--stamp must not move or look up a column")
        with mock.patch.object(mv, "read_counts", rig.read_counts), \
                mock.patch.object(mv, "move_column", side_effect=never), \
                mock.patch.object(mv, "node_ids_for", side_effect=never), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            result = mv.stamp_section(rig, None, "PeriodB", "course", items=self.items, state=self.state)
        return result, out.getvalue()

    def _stamps(self):
        return {key: (self.state.get_assignment("PeriodB", key) or {}).get("grading_period_id")
                for key in self.registered}

    def test_apply_one_stamps_every_registered_column(self):
        rig = FakeRig(self.items, self.registered)
        result, out = self._run(rig, one="2.4 Quiz")
        self.assertIsNone(result["failed"])
        stamps = self._stamps()
        self.assertEqual(stamps.pop("QUIZ:4.3"), MP2)                  # the moved one
        self.assertEqual(set(stamps.values()), {MP1})                  # the rest still sit in MP1
        self.assertIn("[STAMP]  PeriodB: recorded the marking period of %d column(s)" % len(self.registered), out)

    def test_apply_stamps_all_after_the_rest_move(self):
        rig = FakeRig(self.items, self.registered)
        self._run(rig, one="2.4 Quiz")
        result, _ = self._run(rig)
        self.assertEqual((result["failed"], result["moved"]), (None, 11))
        stamps = self._stamps()
        moved = {key for key in self.registered if self.title_of[key] in SPEC_B}
        self.assertEqual({key for key, mp in stamps.items() if mp == MP2}, moved)
        self.assertEqual({key for key, mp in stamps.items() if mp == MP1}, set(self.registered) - moved)
        self.assertEqual(stamps["FA:4.1-2"], MP1)                      # decision 2: 2.3 Follow-Along stays

    def test_stamp_mode_stamps_every_column_where_it_shows_and_moves_nothing(self):
        rig = FakeRig(self.items, self.registered)
        result, out = self._stamp(rig)
        self.assertEqual(result, {"stamped": len(self.registered), "failed": None})
        self.assertEqual(set(self._stamps().values()), {MP1})          # before the move: all in MP1
        self.assertEqual(rig.moves, [])
        self.assertIn("nothing moved, no form submitted", out)

    def test_stamp_after_a_partial_move(self):
        rig = FakeRig(self.items, self.registered)
        self._run(rig, one="2.4 Quiz")
        self.state.upsert_assignment("PeriodB", "QUIZ:4.4", {"grading_period_id": None})   # lost
        result, _ = self._stamp(rig)
        self.assertIsNone(result["failed"])
        stamps = self._stamps()
        self.assertEqual((stamps.pop("QUIZ:4.3"), stamps["QUIZ:4.4"]), (MP2, MP1))
        self.assertEqual(set(stamps.values()), {MP1})

    def test_stamp_refuses_a_title_in_both_views(self):
        rig = FakeRig(self.items, self.registered)
        rig.views[MP2]["2.4 Quiz"] = 4
        result, out = self._stamp(rig)
        self.assertEqual(result, {"stamped": 0, "failed": "ambiguous"})
        self.assertEqual(set(self._stamps().values()), {None})        # NOTHING stamped
        self.assertIn("BOTH      PeriodB '2.4 Quiz'", out)
        self.assertIn("NOTHING was stamped", out)

    def test_stamp_refuses_a_title_in_neither_view(self):
        rig = FakeRig(self.items, self.registered)
        rig.views[MP1].pop("2.4 Quiz")
        result, out = self._stamp(rig)
        self.assertEqual(result, {"stamped": 0, "failed": "ambiguous"})
        self.assertEqual(set(self._stamps().values()), {None})
        self.assertIn("NEITHER   PeriodB '2.4 Quiz'", out)

    def test_a_stamp_records_the_title_the_view_shows(self):
        # 17 rows per section still carry their pre-rename title (the rename tool never
        # touched the sync state); schoology_official reads that title.
        self.state.upsert_assignment("PeriodB", "QUIZ:4.3", {"title": "4.3 Quiz"})
        rig = FakeRig(self.items, self.registered)
        self._stamp(rig)
        row = self.state.get_assignment("PeriodB", "QUIZ:4.3")
        self.assertEqual((row["title"], row["schoology_assignment_id"]), ("2.4 Quiz", "id-QUIZ:4.3"))

    def test_stamps_survive_another_runs_save(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, "state.json")
        self.state = sync.LocalJsonStateStore(path)
        for key, row in self.registered.items():
            self.state.upsert_assignment("PeriodB", key, dict(row))
        rig = FakeRig(self.items, self.registered)
        read_for_real = rig.read_counts

        def read_while_another_run_saves(*args, **kwargs):
            sync.LocalJsonStateStore(path).set_last_synced("S7", "QUIZ:4.4", 88)
            return read_for_real(*args, **kwargs)

        rig.read_counts = read_while_another_run_saves
        result, _ = self._stamp(rig)
        self.assertIsNone(result["failed"])
        on_disk = sync.LocalJsonStateStore(path)
        self.assertEqual(on_disk.get_last_synced("S7", "QUIZ:4.4"), 88)   # the other save survives
        self.assertEqual(on_disk.get_assignment("PeriodB", "QUIZ:4.3")["grading_period_id"], MP1)
        # ... and a later run's own save keeps the stamps.
        sync.LocalJsonStateStore(path).set_last_synced("S8", "QUIZ:4.4", 77)
        on_disk = sync.LocalJsonStateStore(path)
        self.assertEqual({on_disk.get_assignment("PeriodB", k)["grading_period_id"] for k in self.registered},
                         {MP1})

    def test_a_clean_16_00_stop_keeps_the_evidence_complete(self):
        rig = FakeRig(self.items, self.registered)
        self._run(rig, one="2.4 Quiz")
        times = iter(["15:58", "15:59", "16:00"])
        result, out = self._run(rig, clock=lambda: next(times))
        self.assertEqual((result["failed"], result["moved"]), ("sync-window", 2))
        stamps = self._stamps()
        moved = {key for key in self.registered if self.title_of[key] in {t for _, t, _ in rig.moves}}
        self.assertEqual(len(moved), 3)
        self.assertEqual({key for key, mp in stamps.items() if mp == MP2}, moved)
        self.assertEqual({key for key, mp in stamps.items() if mp == MP1}, set(self.registered) - moved)
        self.assertIn("[STAMP]", out)

    def test_a_column_in_neither_view_is_named_and_left_unstamped(self):
        rig = FakeRig(self.items, self.registered)
        rig.views[MP1].pop("1.2 Quiz")              # a hand-deleted column, say
        result, out = self._run(rig, one="2.4 Quiz")
        self.assertIsNone(result["failed"])
        self.assertIn("not stamped, in NEITHER view: ['1.2 Quiz']", out)
        key = next(k for k in self.registered if self.title_of[k] == "1.2 Quiz")
        self.assertIsNone(self._stamps()[key])

    def test_a_dry_run_stamps_nothing(self):
        rig = FakeRig(self.items, self.registered)
        result, out = self._run(rig, apply=False)
        self.assertIsNone(result["failed"])
        self.assertEqual(set(self._stamps().values()), {None})
        self.assertNotIn("[STAMP]", out)

    def test_a_refused_apply_stamps_nothing(self):
        rig = FakeRig(self.items, self.registered)
        result, _ = self._run(rig)                   # --apply before any --one
        self.assertEqual(result["failed"], "one-first")
        self.assertEqual(set(self._stamps().values()), {None})

    def test_stamp_plan_is_pure(self):
        items = [{"key": "A", "title": "a"}, {"key": "B", "title": "b"}, {"key": "C", "title": "c"},
                 {"key": "D", "title": "d"}, {"key": "E", "title": "e"}]
        registered = {"A": {}, "B": {}, "C": {}, "D": {}}
        plan = mv.stamp_plan(items, registered, {"a": 1, "c": 0}, {"b": 2, "c": 1}, MP1, MP2)
        self.assertEqual(plan["stamps"], {"A": MP1, "B": MP2})
        self.assertEqual((plan["both"], plan["neither"]), (["c"], ["d"]))   # E: never created


class FormCDP:
    """An assignment edit form: title, due date, and the grading period select."""

    def __init__(self, *, period="1173888", options=(MP1, MP2), due_follows_period=False, error=None,
                 field="grading_period_id", drop=(), on_submit=None):
        self.values = {"title": "2.4 Quiz", "due_date[date]": "10/27/26", "due_date[time]": "11:59pm",
                       field: period}
        for name in drop:                       # a form without this field
            self.values.pop(name)
        self.on_submit = dict(on_submit or {})  # what Schoology saves differently
        self.field = field
        self.options = list(options)
        self.due_follows_period = due_follows_period
        self.error = error
        self.submitted = 0
        self.urls = []

    def attach_url(self, url, wait_ms=0):
        self.urls.append(url)

    def eval_js(self, expr):
        if "form input[name=\"title\"]" in expr and "return el ? String(el.value)" in expr:
            return self.values["title"]                                     # rename._open_edit_form
        if "form.elements" in expr:
            fields = [{"name": "title", "tag": "input", "type": "text", "value": self.values["title"]},
                      {"name": "form_token", "tag": "input", "type": "hidden", "value": "(hidden)"},
                      {"name": self.field, "tag": "select", "type": "select-one", "value": self.values[self.field],
                       "options": [{"value": o, "text": o, "selected": o == self.values[self.field]}
                                   for o in self.options]}]
            return json.dumps(fields)
        if "out[name] = el ? String(el.value)" in expr:
            names = json.loads(re.search(r"\((\[.*\])\)\s*$", expr, re.S).group(1))
            return json.dumps({n: self.values.get(n) for n in names})
        if "form select[name=" in expr and "dispatchEvent" in expr:
            name, value = json.loads("[" + re.search(r"\}\)\((.*)\)\s*$", expr, re.S).group(1) + "]")
            if name not in self.values:
                return False
            self.values[name] = value
            if self.due_follows_period:
                self.values["due_date[date]"] = "11/09/26"
            return True
        if "input#edit-submit" in expr and "click()" in expr:
            self.submitted += 1
            self.values.update(self.on_submit)
            return True
        if ".messages.error" in expr:
            return self.error
        return None


class TestMoveColumn(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(mv.time, "sleep", lambda _s: None)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.ops = types.SimpleNamespace(SCHOOLOGY_BASE="https://example.invalid")

    def test_moves_only_the_period(self):
        cdp = FormCDP()
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertEqual(result, {"ok": True, "error": None})
        self.assertEqual(cdp.submitted, 1)
        self.assertEqual(cdp.values["grading_period_id"], MP2)
        self.assertEqual(cdp.values["due_date[date]"], "10/27/26")
        self.assertIn("/assignment/edit/course/123/basic", cdp.urls[0])
        self.assertEqual(cdp.urls, [cdp.urls[0]] * 2)              # reopened to read the save back

    def test_refuses_a_form_without_a_due_date_field(self):
        # Finding B5: a missing field read None before and after, so the guard passed blind.
        for missing in ("due_date[date]", "due_date[time]"):
            cdp = FormCDP(drop=(missing,))
            result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
            self.assertFalse(result["ok"], missing)
            self.assertIn("no [%r] field" % missing, result["error"])
            self.assertIn("'grading_period_id'", result["error"])      # the form's own field names
            self.assertIn("Run --inspect", result["error"])
            self.assertIn("--period-field / --edit-url", result["error"])
            self.assertEqual((cdp.submitted, cdp.values["grading_period_id"]), (0, MP1))

    def test_the_saved_due_date_is_read_back(self):
        # Finding B5: Schoology moves the class-day due date into MP2 on save -> stop.
        cdp = FormCDP(on_submit={"due_date[date]": "11/09/26"})
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertFalse(result["ok"])
        self.assertIn("after the submit 'due_date[date]' reads '11/09/26'; it was '10/27/26'", result["error"])
        self.assertEqual(len(cdp.urls), 2)

    def test_a_save_that_lost_the_period_or_the_title_is_caught(self):
        cdp = FormCDP(on_submit={"grading_period_id": MP1})
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertIn("after the submit 'grading_period_id' reads '1173888', not '1173889'", result["error"])
        cdp = FormCDP(on_submit={"title": "2.4 Quiz (2)"})
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertIn("no longer shows the title '2.4 Quiz'", result["error"])

    def test_refuses_when_the_period_change_moves_the_due_date(self):
        cdp = FormCDP(due_follows_period=True)
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertFalse(result["ok"])
        self.assertIn("changed 'due_date[date]'", result["error"])
        self.assertEqual(cdp.submitted, 0)

    def test_refuses_without_the_field_or_the_option(self):
        cdp = FormCDP(field="period_id")
        self.assertIn("no 'grading_period_id' field", mv.move_column(self.ops, cdp, "c", "1", "2.4 Quiz", MP2)["error"])
        cdp = FormCDP(options=(MP1,))
        self.assertIn("has no option", mv.move_column(self.ops, cdp, "c", "1", "2.4 Quiz", MP2)["error"])
        cdp = FormCDP(period=MP2)
        self.assertIn("already in marking period", mv.move_column(self.ops, cdp, "c", "1", "2.4 Quiz", MP2)["error"])
        self.assertEqual(cdp.submitted, 0)

    def test_refuses_a_form_that_is_not_this_column(self):
        cdp = FormCDP()
        result = mv.move_column(self.ops, cdp, "course", "123", "2.5 Quiz", MP2)
        self.assertFalse(result["ok"])
        self.assertEqual(cdp.submitted, 0)

    def test_a_schoology_error_is_reported(self):
        cdp = FormCDP(error="The due date is outside the grading period")
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2)
        self.assertIn("rejected the edit", result["error"])

    def test_edit_url_template_can_be_overridden(self):
        cdp = FormCDP()
        result = mv.move_column(self.ops, cdp, "course", "123", "2.4 Quiz", MP2,
                                edit_url="{base}/assignment/edit/{course}/{nid}")
        self.assertTrue(result["ok"])
        self.assertEqual(cdp.urls[0], "https://example.invalid/assignment/edit/course/123")
        self.assertIn("{nid}/basic", mv.DEFAULT_EDIT_URL)

    def test_inspect_prints_the_form_and_never_submits(self):
        cdp = FormCDP()
        with mock.patch.object(mv, "node_ids_for", lambda o, c, course, titles: ({"2.4 Quiz": "123"}, {})), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = mv.inspect_column(self.ops, cdp, "course", "2.4 Quiz")
        self.assertEqual(code, 0)
        self.assertEqual(cdp.submitted, 0)
        text = out.getvalue()
        self.assertIn("grading_period_id = '1173888'", text)
        self.assertIn("NOTHING was submitted", text)
        self.assertNotIn("form_build", text)


class TestGuards(unittest.TestCase):
    def _main(self, argv, hhmm="10:00"):
        # The guards come before the lock and before Edge: neither may be touched here.
        with contextlib.redirect_stdout(io.StringIO()) as out, \
                mock.patch.dict(sys.modules, {"schoology_ops": mock.Mock(side_effect=AssertionError)}), \
                mock.patch.object(mv.lib, "acquire_rig_lock", side_effect=AssertionError("lock taken")):
            code = mv.main(argv, clock=lambda: hhmm)
        return code, out.getvalue()

    def test_never_from_16_00_to_17_05(self):
        # Finding B1: the LIVE tasks start at 16:30 / 16:45; nothing starts from 16:00.
        for hhmm in ("16:00", "16:20", "16:25", "16:30", "17:04"):
            code, out = self._main([], hhmm)
            self.assertEqual(code, 2, hhmm)
            self.assertIn("Run before 16:00 or after 17:05", out)
            self.assertIn("ApStatsSchoologySync-B at 16:30, ApStatsSchoologySync-E at 16:45", out)
            # --stamp submits nothing, but it drives Edge too.
            self.assertEqual(self._main(["--section", "PeriodB", "--stamp"], hhmm)[0], 2, hhmm)
        for hhmm in ("15:59", "17:05"):
            self.assertFalse(mv.in_sync_window(hhmm), hhmm)
        self.assertTrue(mv.in_sync_window("16:00"))

    def test_flag_combinations(self):
        self.assertEqual(self._main(["--one", "2.4 Quiz"])[0], 2)                 # --one needs --apply
        self.assertEqual(self._main(["--apply"])[0], 2)                           # one section only
        self.assertEqual(self._main(["--inspect", "2.4 Quiz"])[0], 2)
        self.assertEqual(self._main(["--stamp"])[0], 2)                           # one section only
        for extra in (["--apply"], ["--apply", "--one", "2.4 Quiz"], ["--inspect", "2.4 Quiz"]):
            code, out = self._main(["--section", "PeriodB", "--stamp"] + extra)
            self.assertEqual(code, 2, extra)
            self.assertIn("--stamp moves nothing", out)


class TestRigLockAndBackup(unittest.TestCase):
    """main HOLDS the shared rig lock from before the CDP connect to the end (finding B1),
    and --apply backs up the state file first (finding B6). Fake ops; temp files only."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.logs = os.path.join(tmp.name, "logs")
        self.lock = os.path.join(self.logs, "rig.lock")
        self.state_path = os.path.join(tmp.name, "state.json")
        with open(self.state_path, "w", encoding="utf-8") as fh:
            json.dump({"assignments": {"PeriodB/QUIZ:4.3": {"schoology_assignment_id": "id-1"}},
                       "last_synced": {"S1/QUIZ:4.3": 90}, "runs": []}, fh)
        self.seen = {}
        for patcher in (mock.patch.object(mv, "RIG_LOCK_PATH", self.lock),
                        mock.patch.object(mv, "BACKUP_DIR", self.logs),
                        mock.patch.object(sync, "STATE_PATH", self.state_path),
                        mock.patch.dict(os.environ)):
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop(mv.lib.RIG_LOCK_OWNER_ENV, None)

    def _connect(self, reuse=True):
        self.seen["lock_at_connect"] = mv.lib.rig_lock_holder(self.lock)
        return "cdp"

    def _run_section(self, ops, cdp, section, course_id, **kwargs):
        self.seen["lock_in_run"] = mv.lib.rig_lock_holder(self.lock)
        self.seen["backups_at_run"] = self._backups()
        self.seen["state_path"] = kwargs["state"]._path
        return {"plan": None, "moved": 0, "failed": None}

    def _backups(self):
        if not os.path.isdir(self.logs):
            return []
        return sorted(f for f in os.listdir(self.logs) if f.startswith("state-before-move-"))

    def _stamp_section(self, ops, cdp, section, course_id, **kwargs):
        self.seen["lock_in_stamp"] = mv.lib.rig_lock_holder(self.lock)
        self.seen["backups_at_stamp"] = self._backups()
        return {"stamped": 3, "failed": None}

    def _main(self, argv, *, run_section=None, stamp_section=None, hhmm="10:00"):
        fake_ops = types.SimpleNamespace(connect=self._connect)
        with mock.patch.dict(sys.modules, {"schoology_ops": fake_ops}), \
                mock.patch.object(mv, "run_section", run_section or self._run_section), \
                mock.patch.object(mv, "stamp_section", stamp_section or self._stamp_section), \
                mock.patch.object(mv, "section_items", lambda section, ced: []), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            code = mv.main(argv, clock=lambda: hhmm)
        return code, out.getvalue()

    def test_stamp_backs_up_then_stamps_under_the_lock(self):
        code, out = self._main(["--section", "PeriodB", "--stamp"])
        self.assertEqual(code, 0)
        holder = self.seen["lock_in_stamp"]
        self.assertEqual((holder["pid"], holder["owner"]), (os.getpid(), "move-columns"))
        self.assertEqual(len(self.seen["backups_at_stamp"]), 1)        # the copy comes first
        self.assertNotIn("lock_in_run", self.seen)                     # no move planned or made
        self.assertIn("mode=STAMP", out)
        self.assertFalse(os.path.exists(self.lock))

    def test_a_refused_stamp_exits_1(self):
        def refused(*_a, **_k):
            return {"stamped": 0, "failed": "ambiguous"}

        code, _ = self._main(["--section", "PeriodB", "--stamp"], stamp_section=refused)
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(self.lock))

    def test_the_lock_is_held_from_the_connect_to_the_end(self):
        code, _ = self._main(["--section", "PeriodB"])
        self.assertEqual(code, 0)
        for when in ("lock_at_connect", "lock_in_run"):
            holder = self.seen[when]
            self.assertEqual((holder["pid"], holder["owner"]), (os.getpid(), "move-columns"), when)
        self.assertFalse(os.path.exists(self.lock))                   # released
        self.assertIsNone(os.environ.get(mv.lib.RIG_LOCK_OWNER_ENV))
        self.assertEqual(self.seen["state_path"], self.state_path)   # the file it backs up

    def test_the_lock_is_released_when_the_run_fails(self):
        def broken(*_a, **_k):
            raise RuntimeError("the Edge tab went away")

        with self.assertRaises(RuntimeError):
            self._main(["--section", "PeriodB"], run_section=broken)
        self.assertFalse(os.path.exists(self.lock))

    def test_a_held_lock_refuses_before_edge(self):
        os.makedirs(self.logs, exist_ok=True)
        with open(self.lock, "w", encoding="utf-8") as fh:
            fh.write("%d PeriodB 2026-11-08T16:30:00-05:00" % os.getpid() + chr(10))   # a live daily job
        code, out = self._main(["--section", "PeriodB", "--apply"])
        self.assertEqual(code, 2)
        self.assertIn("the Schoology rig is busy", out)
        self.assertIn("held by PeriodB", out)
        self.assertNotIn("lock_at_connect", self.seen)                # never connected
        self.assertEqual(self._backups(), [])
        self.assertTrue(os.path.exists(self.lock))                    # not ours: left alone

    def test_the_16_00_stop_exits_3_and_releases_the_lock(self):
        def stopped(*_a, **_k):
            return {"plan": None, "moved": 2, "failed": "sync-window"}

        code, _ = self._main(["--section", "PeriodB", "--apply"], run_section=stopped)
        self.assertEqual((code, mv.SYNC_WINDOW_EXIT), (3, 3))
        self.assertFalse(os.path.exists(self.lock))

    def test_apply_backs_up_the_state_file_before_the_first_move(self):
        code, out = self._main(["--section", "PeriodB", "--apply"])
        self.assertEqual(code, 0)
        self.assertEqual(len(self.seen["backups_at_run"]), 1)         # taken before any move
        with open(os.path.join(self.logs, self.seen["backups_at_run"][0]), encoding="utf-8") as fh:
            copy = json.load(fh)
        with open(self.state_path, encoding="utf-8") as fh:
            self.assertEqual(copy, json.load(fh))
        self.assertIn("[backup]", out)

    def test_a_dry_run_makes_no_backup(self):
        self.assertEqual(self._main(["--section", "PeriodB"])[0], 0)
        self.assertEqual(self._backups(), [])

    def test_apply_without_a_state_file_changes_nothing(self):
        os.remove(self.state_path)
        code, out = self._main(["--section", "PeriodB", "--apply"])
        self.assertEqual(code, 2)
        self.assertIn("nothing to move", out)
        self.assertNotIn("lock_at_connect", self.seen)
        self.assertFalse(os.path.exists(self.lock))

    def test_backup_state_file(self):
        stamp = "20261108-150000"
        path = mv.backup_state_file(self.state_path, self.logs, stamp)
        self.assertEqual(path, os.path.join(self.logs, "state-before-move-20261108-150000.json"))
        self.assertIsNone(mv.backup_state_file(self.state_path + ".missing", self.logs, stamp))



class TestBackupLocation(unittest.TestCase):
    def test_backups_and_stray_copies_are_ignored_by_git(self):
        # Finding B6: the copies hold student ids, and this repo publishes to GH Pages.
        with open(os.path.join(REPO_ROOT, ".gitignore"), encoding="utf-8") as fh:
            rules = fh.read().splitlines()
        self.assertIn("tools/.schoology-sync-logs/", rules)
        self.assertIn("tools/.schoology-sync-state.json*", rules)
        self.assertEqual(mv.BACKUP_DIR, os.path.join(REPO_ROOT, "tools", ".schoology-sync-logs"))
        self.assertEqual(mv.RIG_LOCK_PATH, mv.lib.RIG_LOCK_PATH)   # the one shared lock


if __name__ == "__main__":
    unittest.main()
