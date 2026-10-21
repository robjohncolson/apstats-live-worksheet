"""test_apclassroom_pc_reconcile.py -- the nightly AP Classroom PC reconcile
(PC_FOLLOWTHROUGH_SPEC.md section 4).

Covers: the page parsers on the sanitized fixtures (fake names, real layout),
paper_blend parity with the JS engine numbers (roster-server/tests/pc-paper-blend.test.js),
never-lower, deadline zeroing, exclude + map precedence, the login-needed exit code,
and that dry runs post nothing. HTTP is a fake object; nothing touches the network.

ASCII only. LF line endings.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
sys.path.insert(0, TOOLS_DIR)

import apclassroom_pc_reconcile as rec  # noqa: E402

FIXTURE_DIR = os.path.join(TOOLS_DIR, "fixtures", "apclassroom", "periodE-u1")
REGISTRY_PATH = os.path.join(REPO_ROOT, "data", "apclassroom-assignments.json")


def read_fixture(part):
    with open(os.path.join(FIXTURE_DIR, part + ".txt"), encoding="utf-8") as f:
        return f.read()


ENTRY = {
    "unit": 1, "section": "PeriodE",
    "parts": {"A": {"of": 18, "origin": "paper"}, "B": {"id": "81743327", "of": 14},
              "C": {"id": "81743453", "of": 12}, "FRQ": {"id": "81743492", "of": 16}},
    "dueDate": "2026-10-23", "closeDate": "2026-10-24", "active": True,
}

STUDENTS = [
    {"username": "pear_cat", "realName": "Pear Cat"},
    {"username": "plum_owl", "realName": "Plum Owl"},
    {"username": "fig_fox", "realName": "Fig Fox"},
    {"username": "kiwi_bee", "realName": "Kiwi Bee"},
    {"username": "lime_elk", "realName": "Lime Elkins"},   # AP Classroom shows "L Elk": map only
]

ROSTER_MAP = {"nameToUsername": {"L Elk": "lime_elk"}, "exclude": ["Gone Student"]}


def part(points, of, note=None):
    return {"score": points / of, "points": points, "of": of, "note": note, "origin": "apclassroom"}


def stored_fixture():
    return {
        # Legacy A 5/18 + REST 12/16 (pct 75 under the old max): the FRQ lands -> 51.4.
        "pear_cat": {"username": "pear_cat", "parts": {"A": part(5, 18),
                                                       "REST": {"score": 0.75, "points": None, "of": None}},
                     "pct": 75.0},
        "fig_fox": {"username": "fig_fox", "parts": {"B": part(9, 14)}, "pct": 64.3},
        # A stored C 6/12 that AP Classroom now shows as 0: WOULD LOWER.
        "plum_owl": {"username": "plum_owl", "parts": {"C": part(6, 12)}, "pct": 50.0},
    }


def pages():
    return {"B": read_fixture("B"), "C": read_fixture("C"), "FRQ": read_fixture("FRQ")}


class FakeApi:
    def __init__(self, stored=None, parts_ok=True, status=None, status_post_error=None):
        self.stored = stored if stored is not None else stored_fixture()
        self.parts_ok = parts_ok
        self.status = status                        # the stored /pc/status snapshot (or None)
        self.status_post_error = status_post_error  # a RuntimeError message for POST /pc/status
        self.posts = []

    def get(self, path):
        if path.startswith("/roster/list"):
            return {"ok": True, "students": STUDENTS + [{"username": "old_kid", "realName": "Old Kid", "archived": True}]}
        if path.startswith("/pc/parts"):
            if not self.parts_ok:
                return {"ok": False, "error": "Database error"}
            return {"ok": True, "students": list(self.stored.values())}
        if path.startswith("/pc/status"):
            return {"ok": True, "status": self.status}
        raise AssertionError("unexpected GET " + path)

    def post(self, path, body):
        if path == "/pc/status" and self.status_post_error:
            raise RuntimeError(self.status_post_error)
        self.posts.append((path, body))
        return {"ok": True}


class ParserTests(unittest.TestCase):
    def test_results_students_fixture(self):
        b = rec.parse_results_students(read_fixture("B"))
        self.assertEqual(sorted(b), ["Fig Fox", "Gone Student", "Kiwi Bee", "L Elk", "Mystery Person", "Pear Cat", "Plum Owl"])
        self.assertEqual(b["Fig Fox"], {"points": 9, "sessions": 1, "submitted": "10/16 10:15 AM"})
        self.assertEqual(b["Kiwi Bee"]["sessions"], 2)
        self.assertIsNone(b["Pear Cat"]["points"])          # 'Name - -' = not submitted
        c = rec.parse_results_students(read_fixture("C"))
        self.assertEqual(c["Plum Owl"]["points"], 0)          # a real 0 is a score, not '-'

    def test_results_students_tab_layout(self):
        text = ("AVERAGE TIME SPENT\t02:25\t03:10\nFig Fox\t9\t1\t00:11:57\t10/13 10:46 AM\tD\tD\tA, C\n"
                "Pear Cat - -\n-\n- - - -\nPlum Owl\t12\t2\t00:09:55\t10/13 10:15 AM\tB\tC\n")
        out = rec.parse_results_students(text)
        self.assertEqual(out["Fig Fox"]["points"], 9)
        self.assertEqual(out["Plum Owl"], {"points": 12, "sessions": 2, "submitted": "10/13 10:15 AM"})
        self.assertIsNone(out["Pear Cat"]["points"])
        self.assertEqual(len(out), 3)

    def test_points_of(self):
        self.assertEqual(rec.parse_points_of(read_fixture("B")), 14)
        self.assertEqual(rec.parse_points_of(read_fixture("C")), 12)
        self.assertIsNone(rec.parse_points_of("nothing"))

    def test_progress_fixture(self):
        frq = rec.parse_progress(read_fixture("FRQ"))
        self.assertEqual(frq["Fig Fox"], {"status": "scored", "points": 13, "of": 16, "submitted": "10/19 02:21 PM"})
        self.assertEqual(frq["Pear Cat"]["status"], "scored")     # 'Submitted' + a 12/16 score
        self.assertEqual(frq["Kiwi Bee"]["status"], "submitted")  # needs scoring
        self.assertEqual(frq["L Elk"]["status"], "in_progress")
        self.assertEqual(frq["Plum Owl"]["status"], "not_submitted")
        self.assertNotIn("Date", frq)

    def test_progress_em_dash_and_dates_are_not_scores(self):
        text = ("Feedback\n\nPear Cat In progress \u2014\n10/16/2026 1:17 PM\n\n10/23/2026 1:15 PM\n\n-\nScore\n\n"
                "Fig Fox Submitted 10/16 02:24 PM\n10/16/2026 1:17 PM\n\n10/23/2026 1:15 PM\n\n-\nScore\n")
        frq = rec.parse_progress(text)
        self.assertEqual(frq["Pear Cat"]["status"], "in_progress")
        self.assertEqual(frq["Fig Fox"]["status"], "submitted")
        self.assertIsNone(frq["Fig Fox"]["points"])

    def test_needs_sign_in(self):
        self.assertTrue(rec.needs_sign_in("https://account.collegeboard.org/login", "", "Points Earned"))
        self.assertTrue(rec.needs_sign_in("https://apclassroom.collegeboard.org/33", "Sign In to continue", "Points Earned"))
        self.assertFalse(rec.needs_sign_in("https://apclassroom.collegeboard.org/33", read_fixture("B"), "Points Earned"))


class BlendParityTests(unittest.TestCase):
    """Same numbers as roster-server/tests/pc-paper-blend.test.js."""

    def p(self, points, of):
        return {"score": points / of, "of": of}

    def test_numbers_match_the_js_engine(self):
        r = rec.round1
        self.assertEqual(r(rec.paper_blend({"A": self.p(18, 18), "B": self.p(13, 14), "C": self.p(12, 12), "FRQ": self.p(14, 16)}, 1)), 92.6)
        self.assertEqual(r(rec.paper_blend({"B": self.p(7, 14), "C": self.p(6, 12)}, 1)), 50.0)
        self.assertEqual(r(rec.paper_blend({"FRQ": self.p(8, 16)}, 1)), 50.0)
        self.assertEqual(r(rec.paper_blend({"A": self.p(9, 18), "FRQ": self.p(16, 16)}, 1)), 75.0)
        self.assertEqual(r(rec.paper_blend({"A": self.p(18, 18), "FRQ": self.p(0, 16)}, 1)), 50.0)
        self.assertEqual(r(rec.paper_blend({"A": self.p(17, 18), "B": self.p(7, 14)}, 1)), 75.0)
        self.assertEqual(r(rec.paper_blend({"B": {"score": 1, "of": None}, "C": {"score": 0, "of": None}}, 1)), 53.8)
        self.assertEqual(r(rec.paper_blend({"B": {"score": 1, "of": None}, "C": {"score": 0, "of": None}}, 2)), 50.0)
        self.assertIsNone(rec.paper_blend({}, 1))

    def test_string_of_and_u_unit_match_js(self):
        # JS: Number("14") > 0 and parseInt("U1".replace(/^U/i, '')) -> the same weights.
        as_strings = {"B": {"score": 1, "of": "14"}, "C": {"score": 0, "of": "12"}}
        self.assertEqual(rec.round1(rec.paper_blend(as_strings, 1)), 53.8)
        no_of = {"B": {"score": 1, "of": None}, "C": {"score": 0, "of": None}}
        self.assertEqual(rec.round1(rec.paper_blend(no_of, "U1")), 53.8)        # table lookup via "U1"
        self.assertEqual(rec.round1(rec.paper_blend(no_of, "u1")), 53.8)

    def test_legacy_rest(self):
        legacy = {"A": {"score": 5 / 18, "of": None}, "REST": {"score": 12 / 16, "of": None}}
        self.assertEqual(rec.round1(rec.paper_blend(legacy, 1)), 75.0)
        legacy["FRQ"] = self.p(12, 16)
        self.assertEqual(rec.round1(rec.paper_blend(legacy, 1)), 51.4)

    def test_part_points_table_matches_grade_config(self):
        with open(os.path.join(REPO_ROOT, "roster-server", "grade-config.js"), encoding="utf-8") as f:
            src = f.read()
        block = re.search(r"PC_PART_POINTS = \{(.*?)\n\};", src, re.S).group(1)
        js = {}
        for unit, body in re.findall(r"(\d+): \{([^}]*)\}", block):
            js[int(unit)] = {k: int(v) for k, v in re.findall(r"(\w+): (\d+)", body)}
        self.assertEqual(js, rec.PC_PART_POINTS)


class MatchTests(unittest.TestCase):
    def test_exclude_beats_map_and_roster(self):
        roster_map = {"nameToUsername": {"Pear Cat": "plum_owl"}, "exclude": ["Pear Cat"]}
        self.assertEqual(rec.match_name("Pear Cat", STUDENTS, roster_map), ("excluded", None))

    def test_map_beats_roster_match(self):
        roster_map = {"nameToUsername": {"Pear Cat": "plum_owl"}, "exclude": []}
        self.assertEqual(rec.match_name("Pear Cat", STUDENTS, roster_map), ("matched", "plum_owl"))

    def test_roster_rules(self):
        empty = {"nameToUsername": {}, "exclude": []}
        self.assertEqual(rec.match_name("pear cat", STUDENTS, empty), ("matched", "pear_cat"))
        self.assertEqual(rec.match_name("P Cat", STUDENTS, empty), ("matched", "pear_cat"))       # last + initial
        self.assertEqual(rec.match_name("kiwi_bee", STUDENTS, empty), ("matched", "kiwi_bee"))    # username
        self.assertEqual(rec.match_name("L Elk", STUDENTS, empty), ("unmatched", None))
        twins = STUDENTS + [{"username": "pine_cat", "realName": "Pine Cat"}]
        self.assertEqual(rec.match_name("P Cat", twins, empty), ("unmatched", None))              # must be unique


class PlanTests(unittest.TestCase):
    def plan(self, today, stored=None):
        return rec.build_plan(ENTRY, pages(), STUDENTS, stored if stored is not None else stored_fixture(), ROSTER_MAP, today)

    def posts(self, plan):
        return {(p["username"], p["part"]): (p["points"], p["of"]) for p in plan["posts"]}

    def test_before_close(self):
        plan = self.plan("2026-10-20")
        self.assertEqual(self.posts(plan), {
            ("fig_fox", "C"): (11, 12), ("fig_fox", "FRQ"): (13, 16),        # B 9/14 already stored
            ("kiwi_bee", "B"): (14, 14), ("kiwi_bee", "C"): (12, 12),
            ("lime_elk", "B"): (12, 14), ("lime_elk", "C"): (7, 12),          # via the explicit map
            ("pear_cat", "FRQ"): (12, 16),
        })
        self.assertEqual(plan["skipped_same"], 1)
        self.assertEqual(plan["would_lower"], ["plum_owl"])                  # C 6/12 posted, AP shows 0
        self.assertEqual(plan["needs_scoring"], ["kiwi_bee"])
        self.assertEqual(plan["unmatched_names"], ["Mystery Person"])
        self.assertEqual(plan["excluded"], 1)
        self.assertEqual(plan["zeroed"], 0)
        # The REST row goes quiet once the FRQ lands: 75 -> 51.4, reported for the teacher.
        self.assertIn({"username": "pear_cat", "from": 75.0, "to": 51.4}, plan["drops"])

    def test_after_close_zeroes_unsubmitted_parts(self):
        plan = self.plan("2026-10-24")
        zeros = {(p["username"], p["part"]): p for p in plan["posts"] if p.get("zero")}
        self.assertEqual(sorted(zeros), [("lime_elk", "FRQ"), ("pear_cat", "B"), ("pear_cat", "C")])
        self.assertEqual(zeros[("pear_cat", "B")]["points"], 0)
        self.assertEqual(zeros[("pear_cat", "B")]["of"], 14)
        self.assertEqual(zeros[("pear_cat", "B")]["note"],
                         "Not submitted by 2026-10-23: scored 0. Schedule a retake with Mr. Colson.")
        self.assertEqual(plan["zeroed"], 3)
        self.assertNotIn(("kiwi_bee", "FRQ"), zeros)                          # submitted: needs scoring, not 0
        self.assertEqual(plan["snapshot"]["students"]["pear_cat"]["B"]["status"], "zeroed")

    def test_never_lower_is_per_part_even_when_the_blend_rises(self):
        # Stored B 12/14, C 0/12; AP Classroom shows B 9/14 (lower) and C 11/12 (higher).
        # The aggregate would RISE, but the B row must not be replaced: skip the student.
        stored = stored_fixture()
        stored["fig_fox"] = {"username": "fig_fox", "parts": {"B": part(12, 14), "C": part(0, 12)}, "pct": 46.2}
        plan = self.plan("2026-10-20", stored)
        self.assertIn("fig_fox", plan["would_lower"])
        self.assertNotIn("fig_fox", [p["username"] for p in plan["posts"]])

    def test_zero_is_idempotent_and_never_overwrites(self):
        stored = stored_fixture()
        note = rec.zero_note("2026-10-23")
        stored["pear_cat"]["parts"]["B"] = part(0, 14, note)                  # zeroed last night
        stored["pear_cat"]["parts"]["C"] = part(9, 12)                        # paper makeup posted by hand
        stored["lime_elk"] = {"username": "lime_elk", "parts": {"FRQ": part(10, 16)}, "pct": 62.5}
        plan = self.plan("2026-10-25", stored)
        zeros = [(p["username"], p["part"]) for p in plan["posts"] if p.get("zero")]
        self.assertEqual(zeros, [])

    def test_snapshot_has_usernames_only(self):
        snap = json.dumps(self.plan("2026-10-24")["snapshot"])
        for name in ("Mystery", "Gone Student", "Pear Cat", "L Elk"):
            self.assertNotIn(name, snap)
        self.assertEqual(json.loads(snap)["unmatched"], 1)
        self.assertEqual(json.loads(snap)["assignments"], {"B": "81743327", "C": "81743453", "FRQ": "81743492"})


class ReminderTests(unittest.TestCase):
    """Section 4b: drafts the day before a due date. Nothing is ever sent here."""

    def test_draft_reminder_template(self):
        msg = rec.draft_reminder("Pear", 1, "Friday 10/23 at 1:15 PM", ["B", "C"])
        self.assertEqual(msg, "Hi Pear, the Unit 1 Progress Check closes Friday 10/23 at 1:15 PM. AP Classroom still "
                              "shows MCQ Part B and MCQ Part C unsubmitted. Anything not turned in by then is scored 0 "
                              "and you would need to schedule a retake with me. You can finish them from AP Classroom "
                              "tonight or during class. - Mr. Colson")
        one = rec.draft_reminder("Plum", 2, "Friday 11/6", ["FRQ"])
        self.assertIn("shows the FRQ unsubmitted", one)
        self.assertIn("You can finish it from", one)
        three = rec.draft_reminder("Fig", 1, "x", ["FRQ", "B", "C"])                # part order is fixed
        self.assertIn("MCQ Part B, MCQ Part C and the FRQ", three)

    def test_due_date_text(self):
        self.assertEqual(rec.due_date_text("2026-10-23", pages()), "Friday 10/23 at 1:15 PM")
        self.assertEqual(rec.due_date_text("2026-10-23", {}), "Friday 10/23")

    def test_should_remind_only_the_day_before(self):
        self.assertTrue(rec.should_remind("2026-10-22", "2026-10-23"))
        self.assertFalse(rec.should_remind("2026-10-21", "2026-10-23"))
        self.assertFalse(rec.should_remind("2026-10-23", "2026-10-23"))
        self.assertTrue(rec.should_remind("2026-10-31", "2026-11-01"))           # across a month

    def test_targets_skip_excluded_and_submitted(self):
        plan = rec.build_plan(ENTRY, pages(), STUDENTS, stored_fixture(), ROSTER_MAP, "2026-10-22")
        got = {t["username"]: t["missing"] for t in plan["reminders"]}
        self.assertEqual(got, {"pear_cat": ["B", "C"], "lime_elk": ["FRQ"], "plum_owl": ["FRQ"]})
        drafts = rec.build_reminder_drafts(ENTRY, pages(), plan["reminders"], "2026-10-22T20:00:00Z")
        pear = [s for s in drafts["students"] if s["username"] == "pear_cat"][0]
        self.assertTrue(pear["message"].startswith("Hi Pear, the Unit 1 Progress Check closes Friday 10/23 at 1:15 PM."))
        self.assertEqual(drafts["dueDate"], "2026-10-23")


class MainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="pc-reconcile-test-")
        self.registry = os.path.join(self.tmp, "registry.json")
        with open(self.registry, "w", encoding="utf-8") as f:
            json.dump({"classId": "33", "progressChecks": [ENTRY]}, f)
        self.roster_map = os.path.join(self.tmp, "roster-map.json")
        with open(self.roster_map, "w", encoding="utf-8") as f:
            json.dump(ROSTER_MAP, f)
        self.log = os.path.join(self.tmp, "run.log")

    def run_main(self, extra, api):
        argv = ["--section", "PeriodE", "--registry", self.registry, "--roster-map", self.roster_map,
                "--today", "2026-10-24", "--log", self.log] + extra
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = rec.main(argv, api=api)
        return code, buf.getvalue()

    def test_dry_run_posts_nothing(self):
        api = FakeApi()
        code, out = self.run_main(["--fixture", FIXTURE_DIR], api)
        self.assertEqual(code, 0)
        self.assertEqual(api.posts, [])
        self.assertIn("DRY RUN", out)
        self.assertNotIn("Mystery Person", out)                               # names only with --names
        with open(self.log, encoding="utf-8") as f:
            self.assertIn("UNMATCHED Mystery Person", f.read())               # the gitignored log keeps it

    def test_apply_posts_parts_then_snapshot(self):
        api = FakeApi()
        code, out = self.run_main(["--fixture", FIXTURE_DIR, "--apply"], api)
        self.assertEqual(code, 0)
        paths = [p for p, _ in api.posts]
        self.assertEqual(paths[-1], "/pc/status")
        grades = [b for p, b in api.posts if p == "/pc/grade"]
        self.assertTrue(all(b["origin"] == "apclassroom" and b["unit"] == 1 for b in grades))
        zero = [b for b in grades if b["studentUsername"] == "pear_cat" and b["part"] == "B"][0]
        self.assertEqual((zero["points"], zero["of"]), (0, 14))
        self.assertIn("Mr. Colson", zero["note"])
        self.assertNotIn("plum_owl", [b["studentUsername"] for b in grades])  # would lower
        self.assertIn("WOULD LOWER plum_owl", out)

    def test_day_before_writes_private_drafts_and_snapshot_flag(self):
        api = FakeApi()
        argv = ["--section", "PeriodE", "--registry", self.registry, "--roster-map", self.roster_map,
                "--today", "2026-10-22", "--log", self.log, "--fixture", FIXTURE_DIR, "--apply"]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(rec.main(argv, api=api), 0)
        path = os.path.join(self.tmp, "reminders-PeriodE-U1-2026-10-22.json")
        with open(path, encoding="utf-8") as f:
            drafts = json.load(f)
        self.assertEqual(len(drafts["students"]), 3)
        snapshot = [b for p, b in api.posts if p == "/pc/status"][0]["payload"]
        self.assertEqual(snapshot["reminders"]["count"], 3)
        self.assertIs(snapshot["reminders"]["sent"], False)
        self.assertNotIn("Pear", json.dumps(snapshot))                        # names stay in the private file

    def test_no_drafts_on_other_days_unless_remind(self):
        self.run_main(["--fixture", FIXTURE_DIR], FakeApi())                  # today 2026-10-24
        self.assertFalse([f for f in os.listdir(self.tmp) if f.startswith("reminders-")])
        self.run_main(["--fixture", FIXTURE_DIR, "--remind"], FakeApi())
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "reminders-PeriodE-U1-2026-10-24.json")))

    def test_parts_read_not_ok_aborts_the_entry(self):
        api = FakeApi(parts_ok=False)
        code, out = self.run_main(["--fixture", FIXTURE_DIR, "--apply"], api)
        self.assertEqual(code, 1)
        self.assertEqual(api.posts, [])                                        # no zero over a real score
        self.assertIn("GET /pc/parts not ok", out)

    def test_every_entry_is_read_before_anything_is_written(self):
        second = dict(ENTRY, unit=2)
        with open(self.registry, "w", encoding="utf-8") as f:
            json.dump({"classId": "33", "progressChecks": [ENTRY, second]}, f)
        calls = []
        original_read = rec.read_fixture_pages
        original_which = rec.shutil.which

        def flaky_read(path):
            calls.append(path)
            if len(calls) == 2:
                raise rec.SignInNeeded()
            return original_read(path)

        rec.read_fixture_pages = flaky_read
        rec.shutil.which = lambda _name: None
        try:
            api = FakeApi()
            code, _out = self.run_main(["--fixture", FIXTURE_DIR, "--apply"], api)
        finally:
            rec.read_fixture_pages = original_read
            rec.shutil.which = original_which
        self.assertEqual(code, 2)
        self.assertEqual(api.posts, [])                                        # entry 1 was not applied

    def test_unsent_reminders_are_carried_forward(self):
        unsent = {"draftedAt": "2026-10-22T20:00:00Z", "count": 3, "sent": False}
        api = FakeApi(status={"fetchedAt": "x", "reminders": unsent})
        self.run_main(["--fixture", FIXTURE_DIR, "--apply"], api)            # 2026-10-24: drafts none
        snapshot = [b for p, b in api.posts if p == "/pc/status"][0]["payload"]
        self.assertEqual(snapshot["reminders"], unsent)

        api = FakeApi(status={"fetchedAt": "x", "reminders": dict(unsent, sent=True)})
        self.run_main(["--fixture", FIXTURE_DIR, "--apply"], api)
        snapshot = [b for p, b in api.posts if p == "/pc/status"][0]["payload"]
        self.assertNotIn("reminders", snapshot)                               # sent: nothing to carry

    def test_snapshot_failure_exit_codes(self):
        code, _ = self.run_main(["--fixture", FIXTURE_DIR, "--apply"],
                                FakeApi(status_post_error="POST /pc/status -> HTTP 401"))
        self.assertEqual(code, 1)
        code, _ = self.run_main(["--fixture", FIXTURE_DIR, "--apply"],
                                FakeApi(status_post_error="POST /pc/status failed: HTTP 500"))
        self.assertEqual(code, 1)
        code, _ = self.run_main(["--fixture", FIXTURE_DIR, "--apply"],
                                FakeApi(status_post_error="POST /pc/status failed: HTTP 503"))
        self.assertEqual(code, 0)                                              # migration 0043 not run yet

    def test_names_flag_prints_unmatched(self):
        code, out = self.run_main(["--fixture", FIXTURE_DIR, "--names"], FakeApi())
        self.assertEqual(code, 0)
        self.assertIn("UNMATCHED Mystery Person", out)

    def test_sign_in_needed_exits_2_and_posts_nothing(self):
        bad = os.path.join(self.tmp, "signin")
        os.makedirs(bad)
        with open(os.path.join(bad, "B.txt"), "w", encoding="utf-8") as f:
            f.write("College Board\nSign In\nUsername\nPassword\n")
        api = FakeApi()
        original = rec.shutil.which
        rec.shutil.which = lambda _name: None                                 # no gh: no issue call
        try:
            code, out = self.run_main(["--fixture", bad, "--apply"], api)
        finally:
            rec.shutil.which = original
        self.assertEqual(code, 2)
        self.assertIn("SIGN IN NEEDED: open AP Classroom in the Edge rig profile", out)
        self.assertEqual(api.posts, [])

    def test_missing_secret_exits_1(self):
        saved = os.environ.pop("ROSTER_TEACHER_SECRET", None)
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                code = rec.main(["--section", "PeriodE", "--registry", self.registry])
        finally:
            if saved is not None:
                os.environ["ROSTER_TEACHER_SECRET"] = saved
        self.assertEqual(code, 1)

    def test_registry_file_is_public_safe(self):
        registry = rec.load_registry(REGISTRY_PATH)
        self.assertEqual(len(rec.active_entries(registry, "PeriodE")), 1)
        self.assertEqual(rec.active_entries(registry, "PeriodB")[0]["parts"]["FRQ"]["id"], "81595036")
        for entry in registry["progressChecks"]:
            self.assertEqual(set(entry), {"unit", "section", "parts", "dueDate", "closeDate", "active"})


if __name__ == "__main__":
    unittest.main()
