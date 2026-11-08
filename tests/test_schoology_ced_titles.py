"""test_schoology_ced_titles.py -- CED-2026 Schoology column titles (CED2026_SINGLE_SOURCE_SPEC.md s3).

Covers:
  - the old-title path is unchanged (ced=False) and the config switch defaults to False
  - the CED-title path for every kind, incl. combined worksheets and Progress Checks
  - data/ced-column-titles.json completeness + safety (unique titles, suffixes kept)
  - the generator is idempotent (node --check)
  - the sync refuses CED titles on a half-renamed gradebook
  - the rename planner (dry-run plan for a fake gradebook)

ASCII only. LF line endings.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
sys.path.insert(0, TOOLS_DIR)

import schoology_components as components
import schoology_official
import schoology_rename_columns as rename
import schoology_sync_lib as lib
import schoology_sync_section as section

FIXTURE_PATH = os.path.join(REPO_ROOT, "data", "ced-column-titles.json")
SCHEDULE_PATHS = [
    os.path.join(REPO_ROOT, "data", "lesson-schedule.json"),
    os.path.join(REPO_ROOT, "roster-server", "data", "lesson-schedule.json"),
]


def _load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


COLUMNS = _load(FIXTURE_PATH)["columns"]


# ---------------------------------------------------------------------------
# The switch + the old path
# ---------------------------------------------------------------------------

class TestTitleSwitch(unittest.TestCase):
    def _config(self, payload):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        path = os.path.join(tmp, "config.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write(payload)
        return path

    def test_committed_config_is_on_since_rename_day(self):
        # Both sections were renamed 2026-10-13 (34 columns); the python flag and the roster
        # flag must agree, or the Desk's "Schoology: <column>" tag names a column that is gone.
        self.assertIs(_load(lib.SYNC_CONFIG_PATH)["schoology_titles_ced"], True)
        self.assertTrue(lib.schoology_titles_ced(lib.SYNC_CONFIG_PATH))
        grade_config = os.path.join(os.path.dirname(TESTS_DIR), "roster-server", "grade-config.js")
        with open(grade_config, encoding="utf-8") as f:
            self.assertIn("export const SCHOOLOGY_TITLES_CED = true;", f.read())

    def test_missing_config_is_off(self):
        self.assertFalse(lib.schoology_titles_ced(os.path.join(TESTS_DIR, "no-such-config.json")))

    def test_only_a_real_true_turns_it_on(self):
        self.assertTrue(lib.schoology_titles_ced(self._config('{"schoology_titles_ced": true}')))
        self.assertFalse(lib.schoology_titles_ced(self._config('{"schoology_titles_ced": "true"}')))
        self.assertFalse(lib.schoology_titles_ced(self._config('{"schoology_titles_ced": 1}')))
        self.assertFalse(lib.schoology_titles_ced(self._config('{}')))

    def test_ced_none_reads_the_config(self):
        with mock.patch.dict(os.environ, {"SCHOOLOGY_SYNC_CONFIG": self._config('{"schoology_titles_ced": true}')}):
            self.assertEqual(lib.assignment_title("blooket", "3.1"), "1.10 Day 1 Blooket")
        with mock.patch.dict(os.environ, {"SCHOOLOGY_SYNC_CONFIG": self._config('{"schoology_titles_ced": false}')}):
            self.assertEqual(lib.assignment_title("blooket", "3.1"), "Blooket 3.1")


class TestOldTitlesUnchanged(unittest.TestCase):
    def test_assignment_title_old_path(self):
        self.assertEqual(lib.assignment_title("lesson", "4.1-2", ced=False), "Topic 4.1-2")
        self.assertEqual(lib.assignment_title("lesson", "4.1", "Intro", ced=False), "Topic 4.1: Intro")
        self.assertEqual(lib.assignment_title("progress_check", "PC3", ced=False), "Unit 3 Progress Check")
        self.assertEqual(lib.assignment_title("quiz", "QUIZ_U4", ced=False), "Quiz QUIZ_U4")
        self.assertEqual(lib.assignment_title("poster", "POSTER_U4", ced=False), "Unit 4 Poster")
        self.assertEqual(lib.assignment_title("blooket", "BLOOKET_U3", ced=False), "Blooket BLOOKET_U3")

    def test_component_titles_old_path(self):
        self.assertEqual(components.fa_title("3.5"), "3.5 Follow-Along")
        self.assertEqual(components.fa_title("3.6-7", False), "3.6-7 Follow-Along")
        self.assertEqual(components.bl_title("3.1"), "3.1 Blooket")
        self.assertEqual(components.quiz_title("3.6"), "3.6 Quiz")
        self.assertEqual(components.pc_title(1), "Unit 1 Progress Check")
        self.assertEqual(components.poster_title(1), "Unit 1 Poster")


# ---------------------------------------------------------------------------
# The CED path
# ---------------------------------------------------------------------------

class TestCedTitles(unittest.TestCase):
    def test_every_kind(self):
        self.assertEqual(lib.assignment_title("lesson", "3.3", ced=True), "1.11 Follow-Along")
        self.assertEqual(lib.assignment_title("quiz", "3.3", ced=True), "1.11 Quiz")
        self.assertEqual(lib.assignment_title("blooket", "3.3", ced=True), "1.11 Blooket")
        self.assertEqual(lib.assignment_title("progress_check", "PC:U1", ced=True), "Unit 1 Progress Check")
        self.assertEqual(lib.assignment_title("progress_check", "PC2", ced=True), "Unit 2 Progress Check")
        self.assertEqual(lib.assignment_title("poster", "POSTER:U1", ced=True), "Unit 1 Poster")

    def test_shared_topic_gets_the_desk_day(self):
        self.assertEqual(lib.assignment_title("blooket", "3.1", ced=True), "1.10 Day 1 Blooket")
        self.assertEqual(lib.assignment_title("blooket", "3.2", ced=True), "1.10 Day 2 Blooket")
        self.assertEqual(lib.assignment_title("lesson", "3.5", ced=True), "1.13 Day 1 Follow-Along")
        self.assertEqual(lib.assignment_title("quiz", "3.6", ced=True), "1.13 Day 2 Quiz")

    def test_combined_worksheets(self):
        self.assertEqual(components.fa_title("3.6-7", True), "1.13 Day 2 Follow-Along")
        self.assertEqual(components.fa_title("4.1-2", True), "2.3 Follow-Along")
        self.assertEqual(components.fa_title("4.3-4-5", True), "2.4-2.6 Follow-Along")
        self.assertEqual(components.bl_title("4.10-12", True), "2.10 Blooket")
        self.assertEqual(components.fa_title("5.1-2", True), "2.11-2.12 Follow-Along")
        self.assertEqual(lib.assignment_title("lesson", "FA:6.1-2", ced=True), "3.3 Follow-Along")

    def test_bonus_columns_are_flagged(self):
        self.assertIn("flag", COLUMNS["FA:3.6-7"])
        self.assertEqual(COLUMNS["FA:3.6-7"]["bonusTopicKeys"], ["3.7"])
        self.assertEqual(COLUMNS["FA:9.3"]["ced"], "Beyond the Exam: Slope inference Day 3 Follow-Along")
        self.assertTrue(COLUMNS["FA:9.3"]["flag"].startswith("bonus-only"))

    def test_missing_key_raises_never_falls_back(self):
        with self.assertRaises(KeyError):
            lib.assignment_title("blooket", "9.99", ced=True)
        with self.assertRaises(KeyError):
            components.fa_title("12.1", True)

    def test_component_columns_swap_titles_not_keys(self):
        schedule = _load(SCHEDULE_PATHS[0])
        kwargs = dict(quiz_topics={"3.1", "3.6"}, blooket_topics={"3.1", "3.6"}, include_undated=True,
                      progress_checks=schedule["progressChecks"], posters=schedule["posters"])
        old = components.component_columns(schedule["lessons"], "B", **kwargs)
        new = components.component_columns(schedule["lessons"], "B", ced=True, **kwargs)
        self.assertEqual([c["key"] for c in old], [c["key"] for c in new])
        for o, n in zip(old, new):
            self.assertEqual(o["title"], COLUMNS[o["key"]]["old"])
            self.assertEqual(n["title"], COLUMNS[n["key"]]["ced"])


# ---------------------------------------------------------------------------
# Fixture completeness + safety
# ---------------------------------------------------------------------------

class TestFixture(unittest.TestCase):
    def test_every_scheduled_column_present(self):
        for path in SCHEDULE_PATHS:
            if not os.path.exists(path):
                continue
            schedule = _load(path)
            groups = set()
            for topic, entry in schedule["lessons"].items():
                if entry.get("kind") == "work":
                    continue
                group = f"{entry['unit']}.{entry['worksheetKey']}"
                groups.add(group)
                self.assertIn(f"QUIZ:{topic}", COLUMNS, path)
                self.assertIn(f"FA:{topic}", COLUMNS, path)          # lesson granularity
                lib.assignment_title("lesson", topic, ced=True)      # never raises
            for group in groups:
                self.assertTrue(COLUMNS[f"FA:{group}"]["schoologyColumn"])
                self.assertTrue(COLUMNS[f"BL:{group}"]["schoologyColumn"])
            for unit in schedule["progressChecks"]:
                self.assertIn(f"PC:U{unit}", COLUMNS)
                self.assertIn(f"POSTER:U{unit}", COLUMNS)

    def test_old_titles_are_todays_live_titles(self):
        for key, entry in COLUMNS.items():
            if entry.get("perDayDeck"):
                continue   # a new column: it never had an old title (test_per_day_blooket_columns)
            prefix, _, rest = key.partition(":")
            expected = {
                "FA": lambda: components.fa_title(rest),
                "BL": lambda: components.bl_title(rest),
                "QUIZ": lambda: components.quiz_title(rest),
                "PC": lambda: components.pc_title(rest[1:]),
                "POSTER": lambda: components.poster_title(rest[1:]),
            }[prefix]()
            self.assertEqual(entry["old"], expected, key)

    def test_per_day_blooket_columns(self):
        # BLOOKET_PER_DAY_COLUMNS_SPEC.md section 2: one Blooket column per day of a per-day
        # flashcard group, titled like that day; new columns, so old == ced (never renamed).
        per_day = {k: e for k, e in COLUMNS.items() if e.get("perDayDeck")}
        self.assertEqual({k: e["ced"] for k, e in per_day.items()}, {
            "BL:4.7": "2.8 Blooket", "BL:4.8": "2.9 Blooket",
            "BL:4.10": "2.10 Day 1 Blooket", "BL:4.11": "2.10 Day 2 Blooket",
            "BL:4.12": "Beyond the Exam: Geometric distribution Blooket"})
        for key, entry in per_day.items():
            self.assertEqual(entry["old"], entry["ced"], key)
            self.assertTrue(entry["schoologyColumn"], key)
            self.assertEqual((entry["kind"], entry["topicKeys"]), ("blooket", [key[3:]]))
            self.assertEqual(lib.assignment_title("blooket", key[3:], ced=True), entry["ced"])
        # The rename tool and the unrenamed-title check pass over them.
        self.assertFalse({c["key"] for c in rename.rename_candidates(COLUMNS)} & set(per_day))
        # The groups they replace keep their entry (B's retired 2.8-2.9 column is history).
        self.assertEqual(COLUMNS["BL:4.7-8"]["ced"], "2.8-2.9 Blooket")

    def test_ced_titles_unique_and_matchable(self):
        real = [e for e in COLUMNS.values() if e["schoologyColumn"]]
        titles = [e["ced"] for e in real]
        self.assertEqual(len(titles), len(set(titles)))
        for title in titles:
            self.assertNotIn(", ", title)          # find_assignment_id_by_title splits aria-label on ", "
            title.encode("ascii")                  # cp1252 console + Schoology-safe

    def test_category_classification_survives_the_rename(self):
        for entry in COLUMNS.values():
            self.assertEqual(schoology_official.column_category(entry["ced"]),
                             schoology_official.column_category(entry["old"]), entry["old"])

    def test_pc_and_poster_titles_do_not_change(self):
        for key, entry in COLUMNS.items():
            if key.startswith(("PC:", "POSTER:")):
                self.assertEqual(entry["old"], entry["ced"])

    def test_generator_is_idempotent(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not on PATH")
        result = subprocess.run([node, "scripts/build-ced-column-titles.mjs", "--check"],
                                cwd=REPO_ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)


# ---------------------------------------------------------------------------
# Sync gate (manifest) + sanity check
# ---------------------------------------------------------------------------

class FakeSchoology:
    """A tiny course: assignments by NODE id; the gradebook exposes positional GRID keys
    that are deliberately different from the node ids (data-x is not the nid)."""

    SCHOOLOGY_BASE = "https://example.invalid"

    def __init__(self, titles_by_nid):
        self.titles = dict(titles_by_nid)          # nid -> title
        self.rename_calls = []

    # gradebook
    def _grid_key(self, nid):
        return "grid-" + str(sorted(self.titles).index(nid))

    def find_assignment_id_by_title(self, cdp, title):
        for nid, t in self.titles.items():
            if t == title:
                return self._grid_key(nid)
        return None

    def navigate(self, cdp, url):
        pass

    def gradebook_url(self, course_id):
        return f"gradebook/{course_id}"

    def inject_helpers(self, cdp):
        pass

    def detect_login_state(self, cdp):
        return "authenticated"

    # materials
    def list_materials(self, cdp, course_id, folder_id=None):
        if folder_id is None:
            return [{"nid": "900", "kind": "folder", "title": "Assignments"}]
        return [{"nid": nid, "kind": "assignment", "title": t} for nid, t in self.titles.items()]

    def find_folder_id(self, cdp, course_id, title="Assignments"):
        return "900"


def _manifest(status, renamed=None, section_name="PeriodB"):
    return {section_name: {"status": status, "renamed": renamed or {}, "inFlight": None}}


class TestRenameGate(unittest.TestCase):
    def test_not_started_old_titles_runs(self):
        self.assertIsNone(section.rename_gate("PeriodB", False, {}))

    def test_in_progress_blocks_both_modes_and_every_section(self):
        state = _manifest("in-progress", section_name="PeriodE")
        for ced in (False, True):
            code, msg = section.rename_gate("PeriodB", ced, state)
            self.assertEqual(code, "rename-in-progress")
            self.assertIn("--apply --section PeriodE", msg)

    def test_done_with_old_titles_says_flip_the_flag(self):
        code, msg = section.rename_gate("PeriodB", False, _manifest("done"))
        self.assertEqual(code, "rename-done-flip-the-flag")
        self.assertIn('"schoology_titles_ced": true', msg)
        self.assertNotIn("false", msg)

    def test_ced_titles_need_done(self):
        for status in ("not-started", "in-progress"):
            state = _manifest(status) if status != "not-started" else {}
            code, msg = section.rename_gate("PeriodB", True, state)
            self.assertIn(code, ("rename-not-done", "rename-in-progress"))
            self.assertNotIn("false", msg)
        self.assertIsNone(section.rename_gate("PeriodB", True, _manifest("done")))
        self.assertIsNone(section.rename_gate("PeriodY", True, _manifest("done")))  # mock alias of B

    def test_flag_false_sync_aborts_on_in_progress_and_on_done(self):
        for status, code in (("in-progress", "rename-in-progress"), ("done", "rename-done-flip-the-flag")):
            ops = mock.Mock()
            with redirect_stdout(io.StringIO()):
                summary = section.sync_section(
                    "PeriodB", "8537033028", dry_run=False, state=None, grades={("1", "FA:3.3"): 90},
                    ops=ops, granularity="component", ced=False, rename_state=_manifest(status))
            self.assertEqual(summary["aborted"], code)
            ops.connect.assert_not_called()           # refused before touching Schoology

    def test_fully_renamed_gradebook_passes_the_ced_guard(self):
        real = {k: e for k, e in COLUMNS.items() if e["schoologyColumn"]}
        # Every column wears its CED title -- incl. "3.3 Follow-Along" (renamed 6.1-2), which is
        # also old 3.3's OLD title: that must NOT read as "unrenamed".
        sim = FakeSchoology({str(1000 + i): e["ced"] for i, e in enumerate(real.values())})
        self.assertEqual(section.unrenamed_old_titles(sim, None), [])

        class Passed(Exception):
            pass

        class Ops(FakeSchoology):
            def connect(self, reuse=True):
                return object()

            def list_categories(self, cdp, course_id):
                raise Passed()                         # first read after the guard

        ops = Ops(sim.titles)
        with redirect_stdout(io.StringIO()), self.assertRaises(Passed):
            section.sync_section("PeriodB", "8537033028", dry_run=True, state=None, grades={},
                                 ops=ops, granularity="component", quiz_topics=set(),
                                 blooket_topics=set(), ced=True, rename_state=_manifest("done"))

    def test_done_manifest_but_an_old_title_left_aborts(self):
        class Ops(FakeSchoology):
            def connect(self, reuse=True):
                return object()

        # "3.6-7 Follow-Along" is nobody's CED title, so its presence means an unrenamed column.
        # ("3.1 Blooket" would NOT count: it is also renamed 5.4's CED title.)
        ops = Ops({"1": "3.6-7 Follow-Along", "2": "1.11 Follow-Along", "3": "3.1 Blooket"})
        with redirect_stdout(io.StringIO()):
            summary = section.sync_section("PeriodB", "8537033028", dry_run=True, state=None,
                                           grades={}, ops=ops, granularity="component",
                                           quiz_topics=set(), blooket_topics=set(), ced=True,
                                           rename_state=_manifest("done"))
        self.assertEqual(summary["aborted"], "rename-incomplete")
        self.assertIn("3.6-7 Follow-Along", summary["errors"][0])
        self.assertNotIn("3.1 Blooket", summary["errors"][0])
        self.assertNotIn("false", summary["errors"][0])


# ---------------------------------------------------------------------------
# Rename planner + manifest-driven apply
# ---------------------------------------------------------------------------

def _col(old, ced, real=True):
    return {"old": old, "ced": ced, "schoologyColumn": real}


FAKE_COLUMNS = {
    "BL:3.1": _col("3.1 Blooket", "1.10 Day 1 Blooket"),
    "FA:3.3": _col("3.3 Follow-Along", "1.11 Follow-Along"),
    "FA:6.1-2": _col("6.1-2 Follow-Along", "3.3 Follow-Along"),
    "FA:3.4": _col("3.4 Follow-Along", "1.12 Follow-Along"),        # never created: missing
    "FA:1.5": _col("1.5 Follow-Along", "1.5 Follow-Along"),
    "FA:3.6": _col("3.6 Follow-Along", "1.13 Day 2 Follow-Along", real=False),
    "PC:U1": _col("Unit 1 Progress Check", "Unit 1 Progress Check"),
}

START = {"101": "3.1 Blooket", "103": "3.3 Follow-Along", "161": "6.1-2 Follow-Along",
         "105": "1.5 Follow-Along"}
FINAL = {"101": "1.10 Day 1 Blooket", "103": "1.11 Follow-Along", "161": "3.3 Follow-Along",
         "105": "1.5 Follow-Along"}


class Crash(Exception):
    pass


def _apply(sim, state, *, only=None, fail_at=None, crash_after_write_at=None):
    """Run one --apply pass against the simulated course with a fake rename step."""
    calls = {"n": 0}

    def fake_rename(ops, cdp, course_id, nid, old, new):
        assert nid in sim.titles, f"rename got {nid!r}, which is not a node id"
        assert sim.titles[nid] == old
        calls["n"] += 1
        if fail_at == calls["n"]:
            return {"ok": False, "error": "simulated failure before the write"}
        sim.titles[nid] = new
        sim.rename_calls.append((nid, old, new))
        if crash_after_write_at == calls["n"]:
            raise Crash()
        return {"ok": True, "error": None}

    with mock.patch.object(rename, "rename_assignment", fake_rename), redirect_stdout(io.StringIO()):
        try:
            return rename.run_section(sim, None, "PeriodB", "8537033028", FAKE_COLUMNS, apply=True,
                                      only=only, state=state, save=lambda: None)
        except Crash:
            return {"failed": "crash", "status": state["PeriodB"]["status"]}


class TestRenamePlan(unittest.TestCase):
    def test_dry_run_plan_for_a_fake_gradebook(self):
        sim = FakeSchoology(START)
        out = io.StringIO()
        state = {}
        with redirect_stdout(out):
            result = rename.run_section(sim, None, "PeriodB", "8537033028", FAKE_COLUMNS,
                                        apply=False, only=None, state=state, save=lambda: None)
        plan = result["plan"]
        self.assertEqual([c["old"] for c in plan["renames"]],
                         ["3.1 Blooket", "3.3 Follow-Along", "6.1-2 Follow-Along"])
        self.assertEqual([c["old"] for c in plan["missing"]], ["3.4 Follow-Along"])
        self.assertEqual(sim.titles, START)                       # nothing changed
        self.assertEqual(state["PeriodB"]["status"], "not-started")
        text = out.getvalue()
        self.assertIn("  RENAME    3.1 Blooket -> 1.10 Day 1 Blooket", text)
        self.assertIn("    3.4 Follow-Along   (will be 1.12 Follow-Along)", text)

    def test_full_apply_uses_node_ids_and_marks_done(self):
        sim = FakeSchoology(START)
        state = {}
        result = _apply(sim, state)
        self.assertIsNone(result["failed"])
        self.assertEqual(sim.titles, FINAL)
        entry = state["PeriodB"]
        self.assertEqual(entry["status"], "done")
        self.assertEqual({k: r["nid"] for k, r in entry["renamed"].items()},
                         {"BL:3.1": "101", "FA:3.3": "103", "FA:6.1-2": "161"})
        # grid keys are positional and never used as node ids
        self.assertNotIn(sim.find_assignment_id_by_title(None, "1.11 Follow-Along"), sim.titles)

    def test_rerun_after_done_is_quiet_and_never_renames_the_former_6_1_2(self):
        sim = FakeSchoology(START)
        state = {}
        _apply(sim, state)
        before = list(sim.rename_calls)
        result = _apply(sim, state)
        self.assertIsNone(result["failed"])
        self.assertEqual(sim.rename_calls, before)
        self.assertEqual(sim.titles, FINAL)
        self.assertEqual(result["plan"]["contradictions"], [])

    def test_resumes_at_every_partial_point(self):
        for k in (1, 2, 3):
            for mode in ("fail", "crash-after-write"):
                with self.subTest(k=k, mode=mode):
                    sim = FakeSchoology(START)
                    state = {}
                    kwargs = {"fail_at": k} if mode == "fail" else {"crash_after_write_at": k}
                    first = _apply(sim, state, **kwargs)
                    self.assertTrue(first["failed"])
                    self.assertEqual(state["PeriodB"]["status"], "in-progress")
                    self.assertEqual(section.rename_gate("PeriodB", False, state)[0], "rename-in-progress")
                    second = _apply(sim, state)
                    self.assertIsNone(second["failed"], second)
                    self.assertEqual(sim.titles, FINAL)
                    self.assertEqual(state["PeriodB"]["status"], "done")
                    self.assertIsNone(state["PeriodB"]["inFlight"])
                    self.assertEqual(sorted(state["PeriodB"]["renamed"]), ["BL:3.1", "FA:3.3", "FA:6.1-2"])

    def test_only_one_column_keeps_the_section_in_progress(self):
        sim = FakeSchoology(START)
        state = {}
        _apply(sim, state, only="3.1 Blooket")
        self.assertEqual(sim.titles["101"], "1.10 Day 1 Blooket")
        self.assertEqual(sim.titles["161"], "6.1-2 Follow-Along")
        self.assertEqual(state["PeriodB"]["status"], "in-progress")
        blocked = _apply(sim, state, only="6.1-2 Follow-Along")           # 3.3 must go first
        self.assertEqual(blocked["failed"], "conflict")
        self.assertEqual(sim.titles["161"], "6.1-2 Follow-Along")
        _apply(sim, state)
        self.assertEqual(sim.titles, FINAL)
        self.assertEqual(state["PeriodB"]["status"], "done")

    def test_missing_old_column_whose_old_title_a_renamed_column_now_wears(self):
        # Old 3.3 was never created; 6.1-2 became "3.3 Follow-Along". A rerun must not take
        # that column for old 3.3 (and rename it to 1.11).
        sim = FakeSchoology({"161": "6.1-2 Follow-Along"})
        state = {}
        _apply(sim, state)
        self.assertEqual(sim.titles, {"161": "3.3 Follow-Along"})
        state["PeriodB"]["status"] = "in-progress"                      # force a full re-plan
        result = _apply(sim, state)
        self.assertIsNone(result["failed"])
        self.assertEqual(sim.titles, {"161": "3.3 Follow-Along"})
        self.assertIn("3.3 Follow-Along", [c["old"] for c in result["plan"]["missing"]])

    def test_gradebook_contradicting_the_manifest_stops_before_writes(self):
        sim = FakeSchoology(START)
        state = {}
        _apply(sim, state)
        sim.titles["103"] = "3.3 Follow-Along?"                         # renamed column vanished
        calls = list(sim.rename_calls)
        result = _apply(sim, state)
        self.assertEqual(result["failed"], "contradiction")
        self.assertEqual(sim.rename_calls, calls)

    def test_hand_rename_is_a_contradiction(self):
        sim = FakeSchoology({"101": "1.10 Day 1 Blooket", "103": "3.3 Follow-Along"})
        result = _apply(sim, {})
        self.assertEqual(result["failed"], "contradiction")
        self.assertEqual(sim.rename_calls, [])

    def test_node_id_resolution_refuses_to_guess(self):
        assignments = [{"nid": "1", "title": "3.1 Blooket"}, {"nid": "2", "title": "3.2 Blooket"},
                       {"nid": "3", "title": "3.2 Blooket"}]
        self.assertEqual(rename.node_id_for_title(assignments, "3.1 Blooket"), ("1", None))
        self.assertIsNone(rename.node_id_for_title(assignments, "3.2 Blooket")[0])
        self.assertIsNone(rename.node_id_for_title(assignments, "3.3 Blooket")[0])

    def test_grid_key_is_not_the_node_id(self):
        sim = FakeSchoology(START)
        grid = sim.find_assignment_id_by_title(None, "3.1 Blooket")
        nid, _ = rename.node_id_for_title(rename.list_course_assignments(sim, None, "c"), "3.1 Blooket")
        self.assertEqual(nid, "101")
        self.assertNotEqual(grid, nid)

    def _per_day_columns(self):
        def blooket(key, old, ced, **extra):
            return dict({"kind": "blooket", "oldKey": key, "old": old, "ced": ced,
                         "schoologyColumn": True}, **extra)
        return {
            "BL:2.8": blooket("2.8", "2.8 Blooket", "5.5 Blooket"),
            "BL:2.9": blooket("2.9", "2.9 Blooket", "5.6 Blooket"),
            "BL:4.7": blooket("4.7", "2.8 Blooket", "2.8 Blooket", perDayDeck=True),
            "BL:4.8": blooket("4.8", "2.9 Blooket", "2.9 Blooket", perDayDeck=True),
        }

    def test_done_mode_per_day_columns_are_not_old_title_contradictions(self):
        columns = self._per_day_columns()
        present = {"2.8 Blooket": "g1", "2.9 Blooket": "g2"}
        one_node_each = {"2.8 Blooket": {"nids": ["201"], "bound": []},
                         "2.9 Blooket": {"nids": ["202"], "bound": ["BL:4.8"]}}
        plan = rename.plan_renames(columns, present, {}, status="done", ownership=one_node_each)
        self.assertEqual(plan["contradictions"], [])
        self.assertEqual(plan["renames"], [])
        self.assertEqual(plan["conflicts"], [])

    def test_done_mode_without_ownership_refuses_a_shared_title(self):
        # Fail closed: the planner never guesses who wears a title two keys claim.
        plan = rename.plan_renames(self._per_day_columns(), {"2.8 Blooket": "g1"}, {}, status="done")
        self.assertEqual(len(plan["contradictions"]), 1)
        self.assertIn("BL:2.8", plan["contradictions"][0])
        self.assertIn("BL:4.7", plan["contradictions"][0])

    def test_done_mode_still_reports_a_real_old_title_come_back(self):
        columns = self._per_day_columns()
        columns["BL:3.3"] = {"kind": "followalong", "oldKey": "3.3", "old": "3.3 Follow-Along",
                             "ced": "1.11 Follow-Along", "schoologyColumn": True}
        present = {"2.8 Blooket": "g1", "3.3 Follow-Along": "g3"}
        plan = rename.plan_renames(columns, present, {}, status="done",
                                   ownership={"2.8 Blooket": {"nids": ["201"], "bound": []}})
        self.assertEqual(len(plan["contradictions"]), 1)
        self.assertIn("BL:3.3", plan["contradictions"][0])
        self.assertEqual(plan["renames"], [])

    def test_done_mode_refuses_when_the_manifest_binds_a_per_day_title_to_another_key(self):
        columns = self._per_day_columns()
        renamed = {"BL:2.8": {"oldTitle": "2.8 Blooket", "newTitle": "2.8 Blooket"}}
        plan = rename.plan_renames(columns, {"2.8 Blooket": "g1"}, renamed, status="done")
        self.assertEqual(len(plan["contradictions"]), 1)
        self.assertIn("BL:4.7", plan["contradictions"][0])

    # -- run_section: ownership of a title shared by a legacy key and a per-day column ------

    def _run_done(self, titles_by_nid, sync_state=None, renamed=None):
        """One done-mode pass over a fake course; returns (outcome, materials reads)."""
        sim = FakeSchoology(titles_by_nid)
        state = _manifest("done", renamed)
        reads = mock.patch.object(rename, "list_course_assignments",
                                  wraps=rename.list_course_assignments)
        with reads as spy, redirect_stdout(io.StringIO()):
            outcome = rename.run_section(sim, None, "PeriodB", "8537033028",
                                         self._per_day_columns(), apply=False, only=None,
                                         state=state, save=lambda: None, sync_state=sync_state)
        return outcome, spy.call_count

    def test_run_section_accepts_one_legitimate_day_column(self):
        outcome, _ = self._run_done({"201": "2.8 Blooket", "202": "2.9 Blooket"})
        self.assertIsNone(outcome["failed"])
        self.assertEqual(outcome["plan"]["contradictions"], [])

    def test_run_section_accepts_a_title_the_sync_registered_to_the_day_key(self):
        sync_state = {"assignments": {"PeriodB/BL:4.7": {"schoology_assignment_id": "201"},
                                      "PeriodE/BL:2.8": {"schoology_assignment_id": "201"}}}
        outcome, _ = self._run_done({"201": "2.8 Blooket"}, sync_state)
        self.assertIsNone(outcome["failed"])
        self.assertEqual(outcome["plan"]["contradictions"], [])

    def test_run_section_refuses_two_nodes_with_the_same_title(self):
        # The gradebook collapses both into one grid column; Materials shows two nodes.
        outcome, _ = self._run_done({"201": "2.8 Blooket", "202": "2.8 Blooket"})
        self.assertEqual(outcome["failed"], "contradiction")
        text = " ".join(outcome["plan"]["contradictions"])
        self.assertIn("BL:2.8", text)
        self.assertIn("BL:4.7", text)
        self.assertIn("2 assignments", text)

    def test_run_section_refuses_a_title_the_state_binds_to_another_key(self):
        sync_state = {"assignments": {"PeriodB/BL:2.8": {"schoology_assignment_id": "201"}}}
        outcome, _ = self._run_done({"201": "2.8 Blooket"}, sync_state)
        self.assertEqual(outcome["failed"], "contradiction")
        text = " ".join(outcome["plan"]["contradictions"])
        self.assertIn("BL:4.7", text)
        self.assertIn("registers that assignment to BL:2.8", text)

    def test_run_section_ignores_state_bound_in_another_section(self):
        sync_state = {"assignments": {"PeriodE/BL:2.8": {"schoology_assignment_id": "201"}}}
        outcome, _ = self._run_done({"201": "2.8 Blooket"}, sync_state)
        self.assertIsNone(outcome["failed"])

    def test_run_section_still_reports_the_ordinary_come_back(self):
        columns = self._per_day_columns()
        columns["FA:3.3"] = _col("3.3 Follow-Along", "1.11 Follow-Along")
        sim = FakeSchoology({"201": "2.8 Blooket", "203": "3.3 Follow-Along"})
        with redirect_stdout(io.StringIO()):
            outcome = rename.run_section(sim, None, "PeriodB", "8537033028", columns, apply=False,
                                         only=None, state=_manifest("done"), save=lambda: None,
                                         sync_state={})
        self.assertEqual(outcome["failed"], "contradiction")
        self.assertEqual(len(outcome["plan"]["contradictions"]), 1)
        self.assertIn("FA:3.3", outcome["plan"]["contradictions"][0])

    def test_materials_are_read_exactly_when_a_title_collides(self):
        # Collision: the per-day title is in the gradebook while the legacy key is not renamed.
        _, reads = self._run_done({"201": "2.8 Blooket", "202": "2.9 Blooket"})
        self.assertEqual(reads, 1)
        # No collision: the legacy keys were renamed (their CED titles are claimed/present).
        renamed = {"BL:2.8": {"oldTitle": "2.8 Blooket", "newTitle": "5.5 Blooket"},
                   "BL:2.9": {"oldTitle": "2.9 Blooket", "newTitle": "5.6 Blooket"}}
        _, reads = self._run_done({"201": "5.5 Blooket", "202": "5.6 Blooket", "203": "2.8 Blooket"},
                                  renamed=renamed)
        self.assertEqual(reads, 0)
        # Not done: the old title is simply a pending rename, never a collision.
        sim = FakeSchoology({"201": "2.8 Blooket"})
        with mock.patch.object(rename, "list_course_assignments",
                               wraps=rename.list_course_assignments) as spy,                 redirect_stdout(io.StringIO()):
            rename.run_section(sim, None, "PeriodB", "8537033028", self._per_day_columns(),
                               apply=False, only=None, state=_manifest("in-progress"),
                               save=lambda: None)
        self.assertEqual(spy.call_count, 0)

    def test_load_sync_state_reads_the_registry_and_tolerates_a_missing_file(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        path = os.path.join(tmp, "s.json")
        self.assertEqual(rename.load_sync_state(path), {})
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"assignments": {"PeriodB/BL:4.7": {"schoology_assignment_id": "7"}}}, f)
        self.assertEqual(rename.load_sync_state(path)["assignments"]["PeriodB/BL:4.7"]
                         ["schoology_assignment_id"], "7")

    def test_real_fixture_has_no_rename_cycles(self):
        everything = {}
        for i, title in enumerate(rename.titles_to_look_up(COLUMNS)):
            if any(e["old"] == title for e in COLUMNS.values() if e["schoologyColumn"]):
                everything[title] = str(1000 + i)
        plan = rename.plan_renames(COLUMNS, everything)
        self.assertEqual(plan["conflicts"], [])
        self.assertEqual(plan["contradictions"], [])
        self.assertEqual(len(plan["renames"]), len(rename.rename_candidates(COLUMNS)))
        position = {c["old"]: i for i, c in enumerate(plan["renames"])}
        for c in plan["renames"]:
            if c["ced"] in position:
                self.assertLess(position[c["ced"]], position[c["old"]])

    def test_cli_defaults_to_dry_run(self):
        args = rename._parse_args([])
        self.assertFalse(args.apply)
        self.assertEqual(args.section, "all")

    def test_manifest_save_roundtrip(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        path = os.path.join(tmp, "m.json")
        self.assertEqual(lib.load_rename_state(path), {})
        lib.save_rename_state(_manifest("in-progress"), path)
        self.assertEqual(lib.rename_status(lib.load_rename_state(path), "PeriodB"), "in-progress")
        self.assertEqual(lib.rename_status({}, "PeriodE"), "not-started")


if __name__ == "__main__":
    unittest.main()
