"""test_schoology_components.py -- unit tests for the fine-grained, data-driven
Schoology column generator (tools/schoology_components.py).

Covers:
  - key + title scheme
  - presence loaders (quiz from roadmap-data, blooket from blooket-lessons)
  - component_columns: opener-has-no-quiz, combined dedup, blooket gap,
    include_undated, sort order
  - component_grades_from_class_doc: per-component mapping, quizTotal gate,
    combined dedup, uid resolution

Runnable standalone:
    python tests/test_schoology_components.py

ASCII only. LF line endings.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
sys.path.insert(0, TOOLS_DIR)

import schoology_components as sc  # noqa: E402


# A tiny schedule: one solo opener (1.1, no quiz), one solo (1.2, quiz),
# one combined pair (6.1 opener + 6.2 quiz, shared worksheet "1-2"), and one
# null-date lesson (4.6) for the include_undated test.
MINI_LESSONS = {
    "1.1": {"unit": 1, "worksheetKey": "1", "periods": {"B": "2026-01-05", "E": "2026-01-07"}},
    "1.2": {"unit": 1, "worksheetKey": "2", "periods": {"B": "2026-01-06", "E": "2026-01-08"}},
    "6.1": {"unit": 6, "worksheetKey": "1-2", "periods": {"B": "2026-03-02", "E": "2026-03-06"}},
    "6.2": {"unit": 6, "worksheetKey": "1-2", "periods": {"B": "2026-03-02", "E": "2026-03-06"}},
    "4.6": {"unit": 4, "worksheetKey": "6", "periods": {"B": None, "E": None}},
}

# 1.1 + 1.2 have Blooket; 6.x do NOT (the units 4-7 gap); 4.6 does not.
BLOOKET_TOPICS = {"1.1", "1.2"}
# Quiz exists for 1.2 and 6.2; NOT for the 1.1 / 6.1 openers.
QUIZ_TOPICS = {"1.2", "6.2"}


class TestKeyScheme(unittest.TestCase):
    def test_group_label_solo_and_combined(self):
        self.assertEqual(sc.group_label(1, "1"), "1.1")
        self.assertEqual(sc.group_label(6, "1-2"), "6.1-2")

    def test_keys_and_titles(self):
        self.assertEqual(sc.fa_key("1.1"), "FA:1.1")
        self.assertEqual(sc.quiz_key("1.2"), "QUIZ:1.2")
        self.assertEqual(sc.bl_key("6.1-2"), "BL:6.1-2")
        self.assertEqual(sc.fa_title("1.1"), "1.1 Follow-Along")
        self.assertEqual(sc.quiz_title("1.2"), "1.2 Quiz")
        self.assertEqual(sc.bl_title("6.1-2"), "6.1-2 Blooket")


class TestPresenceLoaders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def _write(self, name, doc):
        p = os.path.join(self.tmp, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f)
        return p

    def test_load_quiz_topics_from_answer_key(self):
        # Quiz presence = gradable ^U#-L#-Q items (mirrors engine computeQuizTotals).
        # Excludes PC (U#-PC-Q), worksheet blanks (WS-U#L#-Q), and answerKey==null.
        # Real shape: the item map is nested under a top-level "answerKey" key.
        ak = self._write("answer-key.json", {"answerKey": {
            "U1-L1-Q01": {"answerKey": "A"},        # 1.1 has a quiz
            "U1-L2-Q01": {"answerKey": "B"},        # 1.2 has a quiz
            "U1-L2-Q02": {"answerKey": "C"},        # same topic (1.2) -> counts once
            "U5-L6-Q01": {"answerKey": None},       # non-gradable -> excluded (the 5.6 case)
            "U1-PC-Q01": {"answerKey": "D"},        # PC item -> excluded by shape
            "WS-U1L3-Q01": {"answerKey": "E"},      # worksheet blank -> excluded by shape
        }})
        self.assertEqual(sc.load_quiz_topics(ak), {"1.1", "1.2"})

    def test_load_blooket_topics(self):
        bl = self._write("bl.json", {"topics": ["1.1", "1.2", "8.6"]})
        self.assertEqual(sc.load_blooket_topics(bl), {"1.1", "1.2", "8.6"})


class TestComponentColumns(unittest.TestCase):
    def _cols(self, include_undated=False):
        return sc.component_columns(
            MINI_LESSONS, "B",
            quiz_topics=QUIZ_TOPICS, blooket_topics=BLOOKET_TOPICS,
            include_undated=include_undated,
        )

    def test_opener_has_no_quiz(self):
        cols = self._cols()
        keys = {c["key"] for c in cols}
        self.assertIn("FA:1.1", keys)
        self.assertIn("BL:1.1", keys)
        self.assertNotIn("QUIZ:1.1", keys)  # 1.1 is the opener

    def test_solo_with_quiz_has_all_three(self):
        cols = self._cols()
        keys = {c["key"] for c in cols}
        self.assertIn("FA:1.2", keys)
        self.assertIn("QUIZ:1.2", keys)
        self.assertIn("BL:1.2", keys)

    def test_combined_dedups_followalong_and_has_one_quiz(self):
        cols = self._cols()
        keys = {c["key"] for c in cols}
        # ONE Follow-Along for the combined group, keyed by the group label.
        self.assertIn("FA:6.1-2", keys)
        self.assertEqual(sum(1 for c in cols if c["key"] == "FA:6.1-2"), 1)
        # Quiz only for 6.2 (6.1 is the opener).
        self.assertIn("QUIZ:6.2", keys)
        self.assertNotIn("QUIZ:6.1", keys)
        # 6.x has no Blooket (the units 4-7 gap) -> no Blooket column.
        self.assertNotIn("BL:6.1-2", keys)

    def test_followalong_column_carries_both_constituents(self):
        cols = self._cols()
        fa = next(c for c in cols if c["key"] == "FA:6.1-2")
        self.assertEqual(sorted(fa["topic_keys"]), ["6.1", "6.2"])
        self.assertEqual(fa["kind"], "lesson")
        self.assertEqual(fa["title"], "6.1-2 Follow-Along")

    def test_kinds_map_to_categories(self):
        cols = self._cols()
        by_key = {c["key"]: c for c in cols}
        self.assertEqual(by_key["FA:1.2"]["kind"], "lesson")
        self.assertEqual(by_key["QUIZ:1.2"]["kind"], "quiz")
        self.assertEqual(by_key["BL:1.2"]["kind"], "blooket")

    def test_pc_and_poster_columns_per_unit(self):
        # One PC + one Poster per unit that has a (dated) lesson group -- 1 and 6
        # here; the undated 4.6 is excluded by default so unit 4 gets neither.
        cols = self._cols()
        by_key = {c["key"]: c for c in cols}
        for u in (1, 6):
            self.assertIn("PC:U%d" % u, by_key)
            self.assertIn("POSTER:U%d" % u, by_key)
        self.assertEqual(by_key["PC:U1"]["kind"], "progress_check")
        self.assertEqual(by_key["POSTER:U1"]["kind"], "poster")
        self.assertNotIn("PC:U4", by_key)  # 4.6 undated -> unit 4 absent by default

    def test_pc_and_poster_columns_from_event_schedule_new_units(self):
        # SY2627: progressChecks/posters are keyed by NEW unit with per-period
        # dates -- the PC/Poster columns must come from them, not from old units.
        pcs = {
            "1": {"unit": 1, "periods": {"B": "2026-10-09", "E": "2026-10-23"}, "adminDay2": {"B": "2026-10-13", "E": "2026-10-26"}},
            "5": {"unit": 5, "periods": {"B": "2027-02-25", "E": "2027-04-14"}, "adminDay2": {"B": "2027-02-26", "E": "2027-04-16"}},
        }
        posters = {"1": {"unit": 1, "periods": {"B": "2026-10-08", "E": "2026-10-21"}}}
        cols = sc.component_columns(
            MINI_LESSONS, "B",
            quiz_topics=QUIZ_TOPICS, blooket_topics=BLOOKET_TOPICS,
            progress_checks=pcs, posters=posters,
        )
        by_key = {c["key"]: c for c in cols}
        self.assertEqual(by_key["PC:U1"]["due_date"], "2026-10-09")
        self.assertEqual(by_key["POSTER:U1"]["due_date"], "2026-10-08")
        self.assertEqual(by_key["PC:U5"]["due_date"], "2027-02-25")
        self.assertEqual(by_key["POSTER:U5"]["due_date"], "2027-02-25")  # no poster row -> PC date
        self.assertNotIn("PC:U6", by_key)  # old unit 6 (a lesson group) gets NO PC column

    def test_null_date_excluded_by_default(self):
        cols = self._cols(include_undated=False)
        keys = {c["key"] for c in cols}
        self.assertNotIn("FA:4.6", keys)

    def test_null_date_included_when_requested(self):
        cols = self._cols(include_undated=True)
        keys = {c["key"] for c in cols}
        self.assertIn("FA:4.6", keys)  # 4.6 has B=null, included under the force-MP path
        # 4.6 has no quiz/blooket in our sets -> only the FA column
        self.assertNotIn("QUIZ:4.6", keys)
        self.assertNotIn("BL:4.6", keys)

    def test_sorted_by_date_then_unit(self):
        cols = self._cols()
        dates = [c["due_date"] for c in cols]
        self.assertEqual(dates, sorted(dates))
        # Within lesson 1.2: FA before Quiz before Blooket.
        l12 = [c["key"] for c in cols if c["group_label"] == "1.2"]
        self.assertEqual(l12, ["FA:1.2", "QUIZ:1.2", "BL:1.2"])

    def test_every_lesson_column_is_filed_on_the_day_its_zero_lands(self):
        # QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.2: the marking period comes from the zero date
        # (class day + 13), one day later (the 0 lands the next morning); the Schoology due
        # date stays the class day (decision 4).
        by_key = {c["key"]: c for c in self._cols()}
        self.assertEqual(by_key["FA:1.2"]["due_date"], "2026-01-06")
        self.assertEqual(by_key["FA:1.2"]["filing_date"], "2026-01-20")
        self.assertEqual(by_key["QUIZ:1.2"]["filing_date"], "2026-01-20")
        self.assertEqual(by_key["BL:1.2"]["filing_date"], "2026-01-20")
        # A combined group is filed by its earliest lesson.
        self.assertEqual(by_key["FA:6.1-2"]["filing_date"], "2026-03-16")
        undated = {c["key"]: c for c in self._cols(include_undated=True)}
        self.assertIsNone(undated["FA:4.6"]["filing_date"])


class TestLiveScheduleUnit2Poster(unittest.TestCase):
    """U2_CLAIM_POSTER_SPEC.md B4, read from the live data/lesson-schedule.json.

    Period B's section-only Unit 2 poster dates its POSTER:U2 column on poster
    day 1 (MP2). Period E has no Unit 2 poster (posters['2'].periods.E is null),
    so its POSTER:U2 column keeps the PC Day 1 fallback.
    """

    def _by_key(self, period):
        with open(os.path.join(REPO_ROOT, "data", "lesson-schedule.json"), encoding="utf-8") as f:
            schedule = json.load(f)
        cols = sc.component_columns(
            schedule["lessons"], period,
            quiz_topics=set(), blooket_topics=set(),
            progress_checks=schedule["progressChecks"], posters=schedule["posters"],
        )
        return {c["key"]: c for c in cols}

    def test_period_b_poster_u2_is_due_on_poster_day_1(self):
        self.assertEqual(self._by_key("B")["POSTER:U2"]["due_date"], "2026-11-10")

    def test_period_e_poster_u2_keeps_the_pc_day_1_date(self):
        self.assertEqual(self._by_key("E")["POSTER:U2"]["due_date"], "2026-11-23")

    def test_unit_1_poster_dates_are_unchanged(self):
        self.assertEqual(self._by_key("B")["POSTER:U1"]["due_date"], "2026-10-08")
        self.assertEqual(self._by_key("E")["POSTER:U1"]["due_date"], "2026-10-09")

    def test_pc_is_filed_by_day_2_and_a_poster_by_its_date(self):
        # A PC counts in the quarter it is due (Day 2, engine pcUnitsInQuarter); its
        # Schoology due date stays Day 1.
        b = self._by_key("B")
        self.assertEqual((b["PC:U2"]["due_date"], b["PC:U2"]["filing_date"]), ("2026-11-30", "2026-12-01"))
        self.assertEqual((b["PC:U1"]["due_date"], b["PC:U1"]["filing_date"]), ("2026-10-13", "2026-10-15"))
        self.assertEqual(b["POSTER:U2"]["filing_date"], "2026-11-10")
        self.assertEqual(self._by_key("E")["PC:U2"]["filing_date"], "2026-11-25")

    def test_b_2_3_columns_straddle_the_line_and_file_in_mp1(self):
        # B 4.1 (10/23, zero 11/05) and 4.2 (10/26, zero 11/08) share the 4.1-2 worksheet:
        # 4.1 files the group on 11/06 (MP1). E's 4.1 (10/26) files it on 11/09 (MP2).
        self.assertEqual(self._by_key("B")["FA:4.1-2"]["filing_date"], "2026-11-06")
        self.assertEqual(self._by_key("E")["FA:4.1-2"]["filing_date"], "2026-11-09")
        self.assertEqual(self._by_key("B")["FA:4.3-4-5"]["filing_date"], "2026-11-10")


class TestComponentGradesFromClassDoc(unittest.TestCase):
    def _doc(self):
        # Follow-Along uses lessonGradeNoQuiz (v3 Lessons-track value), distinct
        # from Cws so we can tell which the producer emits; falls back to Cws.
        return {"students": [
            {
                "studentId": "r1",
                "schoologyUid": "9001",
                "lessons": [
                    # opener: FA + blooket present, NO quiz (quizTotal 0)
                    {"lessonKey": "1.1", "unit": 1, "worksheetKey": "1",
                     "Cws": 88, "lessonGradeNoQuiz": 84, "Q": None, "quizTotal": 0, "blooket": 95, "hasBlooket": True},
                    # full lesson
                    {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2",
                     "Cws": 90, "lessonGradeNoQuiz": 86, "Q": 78, "quizTotal": 3, "blooket": 100, "hasBlooket": True},
                    # combined constituents carry the SAME FA value -> emitted once
                    {"lessonKey": "6.1", "unit": 6, "worksheetKey": "1-2",
                     "Cws": 70, "lessonGradeNoQuiz": 66, "Q": None, "quizTotal": 0, "blooket": None, "hasBlooket": False},
                    {"lessonKey": "6.2", "unit": 6, "worksheetKey": "1-2",
                     "Cws": 70, "lessonGradeNoQuiz": 66, "Q": 65, "quizTotal": 4, "blooket": None, "hasBlooket": False},
                ],
            },
        ]}

    def test_emits_followalong_quiz_blooket(self):
        out = sc.component_grades_from_class_doc(self._doc())
        self.assertEqual(out["9001/FA:1.2"], 86)  # lessonGradeNoQuiz, not Cws 90
        self.assertEqual(out["9001/QUIZ:1.2"], 78)
        self.assertEqual(out["9001/BL:1.2"], 100)

    def test_followalong_and_blooket_zero_once_zero_date_passed_quiz_untouched(self):
        doc = {"students": [{
            "studentId": "s9", "schoologyUid": "u9", "section": "PeriodB",
            "lessons": [
                {"lessonKey": "1.1", "unit": 1, "worksheetKey": "1", "lessonGradeNoQuiz": None, "Cws": None,
                 "Q": None, "quizTotal": 0, "blooket": None, "hasBlooket": True,
                 "zeroDate": {"B": "2026-09-21", "E": "2026-09-22"}},
                {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2", "lessonGradeNoQuiz": None, "Cws": None,
                 "Q": None, "quizTotal": 3, "blooket": None, "hasBlooket": True,
                 "zeroDate": {"B": "2026-09-23", "E": "2026-09-24"}},
                {"lessonKey": "1.10", "unit": 1, "worksheetKey": "10", "lessonGradeNoQuiz": None, "Cws": None,
                 "Q": None, "quizTotal": 0, "zeroDate": {"B": None, "E": None}},
            ], "units": {}}]}
        fa = sc.fa_key(sc.group_label(1, "1"))
        bl = sc.bl_key(sc.group_label(1, "1"))
        # still open on the zero date itself
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-09-21"), {})
        out = sc.component_grades_from_class_doc(doc, today="2026-09-22")
        self.assertEqual(out, {f"u9/{fa}": 0, f"u9/{bl}": 0})   # only 1.1; Follow-Along + Blooket, never Quiz
        out = sc.component_grades_from_class_doc(doc, today="2026-09-24")
        g2 = sc.group_label(1, "2")
        self.assertEqual(sorted(out), sorted([f"u9/{fa}", f"u9/{bl}", f"u9/{sc.fa_key(g2)}", f"u9/{sc.bl_key(g2)}"]))
        self.assertTrue(all(v == 0 for v in out.values()))
        # a lesson with NO Blooket never gets a Blooket zero
        doc["students"][0]["lessons"][0]["hasBlooket"] = False
        self.assertNotIn(f"u9/{bl}", sc.component_grades_from_class_doc(doc, today="2026-09-22"))
        doc["students"][0]["lessons"][0]["hasBlooket"] = True
        # legacy caller (no today) and E-period student are untouched by B's dates
        self.assertEqual(sc.component_grades_from_class_doc(doc), {})
        doc["students"][0]["section"] = "PeriodE"
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-09-22"), {})

    def test_quiz_zero_starts_on_quiz_zeros_from_and_follows_the_lag(self):
        # teacher 2026-09-29: quiz columns get the same lagged zero, from the run on
        # QUIZ_ZEROS_FROM (2026-10-02) on; before that date quiz cells are untouched.
        self.assertEqual(sc.QUIZ_ZEROS_FROM, "2026-10-02")
        doc = {"students": [{
            "studentId": "s9", "schoologyUid": "u9", "section": "PeriodB",
            "lessons": [
                {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2", "lessonGradeNoQuiz": 80, "Cws": 80,
                 "Q": None, "quizTotal": 3, "blooket": 90, "hasBlooket": True,
                 "zeroDate": {"B": "2026-09-23", "E": "2026-09-24"}},
                {"lessonKey": "1.3", "unit": 1, "worksheetKey": "3", "lessonGradeNoQuiz": 70, "Cws": 70,
                 "Q": 66.7, "quizTotal": 3, "blooket": 80, "hasBlooket": True,
                 "zeroDate": {"B": "2026-09-24", "E": "2026-09-27"}},
                {"lessonKey": "1.9", "unit": 1, "worksheetKey": "9", "lessonGradeNoQuiz": None, "Cws": None,
                 "Q": None, "quizTotal": 3, "blooket": None, "hasBlooket": True,
                 "zeroDate": {"B": "2026-10-08", "E": "2026-10-08"}},
                {"lessonKey": "1.1", "unit": 1, "worksheetKey": "1", "lessonGradeNoQuiz": 100, "Cws": 100,
                 "Q": None, "quizTotal": 0, "blooket": 100, "hasBlooket": True,
                 "zeroDate": {"B": "2026-09-21", "E": "2026-09-22"}},
            ], "units": {}}]}
        q12 = f"u9/{sc.quiz_key('1.2')}"
        # the day before the start date: the untaken 1.2 quiz stays blank
        self.assertNotIn(q12, sc.component_grades_from_class_doc(doc, today="2026-10-01"))
        out = sc.component_grades_from_class_doc(doc, today="2026-10-02")
        self.assertEqual(out[q12], 0)                                  # untaken, past its zero date -> 0
        self.assertEqual(out[f"u9/{sc.quiz_key('1.3')}"], 66.7)        # a taken quiz keeps its score
        self.assertNotIn(f"u9/{sc.quiz_key('1.9')}", out)              # not past its zero date yet
        self.assertNotIn(f"u9/{sc.quiz_key('1.1')}", out)              # quizTotal 0 -> no quiz column
        # the lag is per period: E's 1.2 zero date is 09-24, still passed on 10-02
        doc["students"][0]["section"] = "PeriodE"
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-10-02")[q12], 0)
        # 1.9 turns into a 0 after ITS zero date
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-10-09")[f"u9/{sc.quiz_key('1.9')}"], 0)

    def test_quiz_zeros_from_can_be_moved_for_a_preview(self):
        doc = {"students": [{"studentId": "s9", "schoologyUid": "u9", "section": "PeriodB", "lessons": [
            {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2", "lessonGradeNoQuiz": 80,
             "Q": None, "quizTotal": 3, "hasBlooket": False, "zeroDate": {"B": "2026-09-23"}}], "units": {}}]}
        saved = sc.QUIZ_ZEROS_FROM
        try:
            sc.QUIZ_ZEROS_FROM = "2026-09-30"
            self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-09-30")[f"u9/{sc.quiz_key('1.2')}"], 0)
        finally:
            sc.QUIZ_ZEROS_FROM = saved

    def test_never_zero_lesson_is_never_zeroed_even_when_due_has_passed(self):
        # A never-zero row comes from /class/grades with zeroDate null for the period (and
        # neverZero true): under QUARTER_ZERO_FREEZE_SPEC.md that was every after-the-line
        # lesson; since QUARTER_LINE_BY_DUE_DATE_SPEC.md only a zero date past the last
        # quarter (the year end). Schoology never gets a 0 for it, even long after its
        # class day, and the cells stay blank until the student does the work.
        lesson = {"lessonKey": "4.5", "unit": 4, "worksheetKey": "5", "lessonGradeNoQuiz": None, "Cws": None,
                  "Q": None, "quizTotal": 3, "blooket": None, "hasBlooket": True,
                  "due": {"B": "2026-10-30", "E": "2026-11-02"},
                  "zeroDate": {"B": None, "E": None}, "neverZero": {"B": True, "E": True}}
        today = "2026-11-20"
        for period in ("B", "E"):
            self.assertFalse(sc.zero_due(lesson, period, today))
            self.assertFalse(sc.quiz_zero_due(lesson, period, today))
        for section in ("PeriodB", "PeriodE"):
            doc = {"students": [{"studentId": "s9", "schoologyUid": "u9", "section": section,
                                 "lessons": [lesson], "units": {}}]}
            self.assertEqual(sc.component_grades_from_class_doc(doc, today=today), {})
            self.assertEqual(sc.component_comments_from_class_doc(doc, today=today), {})
        # Late work still counts once it is finished: the real score goes through.
        done = dict(lesson, lessonGradeNoQuiz=88, Q=70, blooket=90)
        doc = {"students": [{"studentId": "s9", "schoologyUid": "u9", "section": "PeriodB",
                             "lessons": [done], "units": {}}]}
        g = sc.group_label(4, "5")
        self.assertEqual(sc.component_grades_from_class_doc(doc, today=today), {
            f"u9/{sc.fa_key(g)}": 88, f"u9/{sc.quiz_key('4.5')}": 70, f"u9/{sc.bl_key(g)}": 90})

    def _group_doc(self, section, first_zero, first_never):
        # 4.7 (11/06) and 4.8 (11/09) share the 4.7-8 worksheet and deck; the group's columns
        # are dated 11/06 (the earliest lesson). These are freeze-era rows (no quarter field).
        p = section[-1]
        first = {"lessonKey": "4.7", "unit": 4, "worksheetKey": "7-8", "lessonGradeNoQuiz": None, "Cws": None,
                 "Q": None, "quizTotal": 0, "blooket": None, "hasBlooket": True,
                 "due": {p: "2026-11-06"}, "zeroDate": {p: first_zero}}
        if first_never is not None:
            first["neverZero"] = {p: first_never}
        second = {"lessonKey": "4.8", "unit": 4, "worksheetKey": "7-8", "lessonGradeNoQuiz": None, "Cws": None,
                  "Q": None, "quizTotal": 3, "blooket": None, "hasBlooket": True,
                  "due": {p: "2026-11-09"}, "zeroDate": {p: "2026-11-22"}, "neverZero": {p: False}}
        return {"students": [{"studentId": "s9", "schoologyUid": "u9", "section": section,
                              "lessons": [first, second], "units": {}}]}

    def test_group_column_zero_is_decided_by_the_lesson_that_dates_it(self):
        # Freeze-era rows: 4.7 is never-zero while 4.8 is a Q2 lesson that zeroes after 11/22.
        # The group's deciding lesson (4.7, the earliest) decides the shared FA/BL columns, so
        # 4.8 never writes a 0 there; its own quiz column still zeroes.
        g = sc.group_label(4, "7-8")
        fa, bl, quiz = f"u9/{sc.fa_key(g)}", f"u9/{sc.bl_key(g)}", f"u9/{sc.quiz_key('4.8')}"
        for section in ("PeriodB", "PeriodE"):
            doc = self._group_doc(section, None, True)
            for today in ("2026-11-06", "2026-11-12", "2026-11-23", "2027-02-01"):
                out = sc.component_grades_from_class_doc(doc, today=today)
                self.assertNotIn(fa, out, section + " " + today)
                self.assertNotIn(bl, out, section + " " + today)
            out = sc.component_grades_from_class_doc(doc, today="2026-11-23")
            self.assertEqual(out, {quiz: 0})
            comments = sc.component_comments_from_class_doc(doc, today="2026-11-23")
            self.assertEqual(sorted(comments), [quiz])
            self.assertIn("Missing: 4.8 quiz", comments[quiz])
            # Real work still goes through to the shared columns.
            for lesson in doc["students"][0]["lessons"]:
                lesson.update(lessonGradeNoQuiz=91, blooket=77)
            out = sc.component_grades_from_class_doc(doc, today="2026-11-23")
            self.assertEqual((out[fa], out[bl]), (91, 77))

    def test_group_column_zero_without_the_freeze_is_unchanged(self):
        # No freeze (and the rows of QUARTER_LINE_BY_DUE_DATE_SPEC.md, which restore 4.7's
        # zero date): 4.7's own zero date (11/19) zeroes the group first.
        g = sc.group_label(4, "7-8")
        fa, bl = f"u9/{sc.fa_key(g)}", f"u9/{sc.bl_key(g)}"
        doc = self._group_doc("PeriodB", "2026-11-19", None)
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-11-19"), {})
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-11-20"), {fa: 0, bl: 0})
        comments = sc.component_comments_from_class_doc(doc, today="2026-11-20")
        self.assertIn("Missing: 4.7 worksheet", comments[fa])
        # A group with no due dates (an older caller): its first lesson decides, as before.
        for lesson in doc["students"][0]["lessons"]:
            lesson.pop("due")
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-11-20"), {fa: 0, bl: 0})

    def test_emits_pc_from_units_and_skips_poster_without_ledger_letter(self):
        # PC <- units[U#].pcRawPct (the unit mastery track). Poster has no
        # units[] source: without a poster_grades entry it is never emitted.
        doc = {"students": [{"studentId": "r1", "schoologyUid": "9001",
            "units": {"U1": {"pcRawPct": 82}, "U6": {"pcRawPct": None}},
            "lessons": []}]}
        out = sc.component_grades_from_class_doc(doc)
        self.assertEqual(out["9001/PC:U1"], 82)
        self.assertNotIn("9001/PC:U6", out)       # null pcRawPct -> skipped
        self.assertNotIn("9001/POSTER:U1", out)   # no poster row -> no cell

    def test_emits_poster_score_as_is(self):
        # Poster <- the POSTER-U# ledger row's 90-115 number, keyed by ROSTER id,
        # written unchanged (POSTER_WORK_TRACK_SPEC.md: Schoology shows the number).
        doc = {"students": [
            {"studentId": "r1", "schoologyUid": "9001", "units": {}, "lessons": []},
            {"studentId": "r2", "schoologyUid": "9002", "units": {}, "lessons": []},
        ]}
        out = sc.component_grades_from_class_doc(
            doc, poster_grades={"r1": {1: 92}, "r2": {1: 115, 2: 100.5}})
        self.assertEqual(out["9001/POSTER:U1"], 92)
        self.assertEqual(out["9002/POSTER:U1"], 115)
        self.assertEqual(out["9002/POSTER:U2"], 100.5)

    def test_emits_poster_from_legacy_letter(self):
        # A pre-conversion BONUS-POSTER-U# letter still maps through POSTER_SCORE
        # (teacher 2026-10-14: floor 90, ceiling 115).
        doc = {"students": [
            {"studentId": "r1", "schoologyUid": "9001", "units": {}, "lessons": []},
            {"studentId": "r2", "schoologyUid": "9002", "units": {}, "lessons": []},
        ]}
        out = sc.component_grades_from_class_doc(
            doc, poster_grades={"r1": {1: "E"}, "r2": {1: "i", 2: "P"}})
        self.assertEqual(out["9001/POSTER:U1"], 115)
        self.assertEqual(out["9002/POSTER:U1"], 90)
        self.assertEqual(out["9002/POSTER:U2"], 100)
        self.assertEqual(sc.POSTER_SCORE, {"E": 115, "P": 100, "I": 90})

    def test_poster_score_accepts_a_number_or_a_letter(self):
        self.assertEqual(sc.poster_score(105), 105)
        self.assertEqual(sc.poster_score(92.5), 92.5)
        self.assertEqual(sc.poster_score("p"), 100)
        self.assertIsNone(sc.poster_score(None))
        self.assertIsNone(sc.poster_score(True))
        self.assertIsNone(sc.poster_score("X"))

    def test_unknown_poster_letter_is_not_emitted(self):
        doc = {"students": [{"studentId": "r1", "schoologyUid": "9001", "units": {}, "lessons": []}]}
        out = sc.component_grades_from_class_doc(doc, poster_grades={"r1": {1: "X"}})
        self.assertNotIn("9001/POSTER:U1", out)

    def test_followalong_falls_back_to_cws(self):
        # A lesson with no lessonGradeNoQuiz (old server) -> FA uses Cws.
        doc = {"students": [{"studentId": "r1", "schoologyUid": "9001", "lessons": [
            {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2", "Cws": 90,
             "Q": None, "quizTotal": 0, "blooket": None, "hasBlooket": False}]}]}
        out = sc.component_grades_from_class_doc(doc)
        self.assertEqual(out["9001/FA:1.2"], 90)

    def test_opener_quiz_skipped_when_quiztotal_zero(self):
        out = sc.component_grades_from_class_doc(self._doc())
        self.assertEqual(out["9001/FA:1.1"], 84)
        self.assertEqual(out["9001/BL:1.1"], 95)
        self.assertNotIn("9001/QUIZ:1.1", out)

    def test_combined_followalong_emitted_once(self):
        out = sc.component_grades_from_class_doc(self._doc())
        self.assertEqual(out["9001/FA:6.1-2"], 66)
        # only one FA value for the group (not one per constituent)
        fa_keys = [k for k in out if k.endswith("/FA:6.1-2")]
        self.assertEqual(len(fa_keys), 1)
        # 6.2 quiz still emitted; 6.1 opener not
        self.assertEqual(out["9001/QUIZ:6.2"], 65)
        self.assertNotIn("9001/QUIZ:6.1", out)
        # no blooket (hasBlooket False)
        self.assertNotIn("9001/BL:6.1-2", out)

    def test_uid_resolution_priority(self):
        # surfaced schoologyUid wins
        doc = {"students": [{"studentId": "r1", "schoologyUid": "S", "lessons": [
            {"lessonKey": "1.2", "unit": 1, "worksheetKey": "2", "Cws": 90,
             "Q": None, "quizTotal": 0, "blooket": None, "hasBlooket": False}]}]}
        out = sc.component_grades_from_class_doc(doc, uid_map={"r1": "M"})
        self.assertIn("S/FA:1.2", out)
        # no surfaced uid -> uid_map
        doc["students"][0]["schoologyUid"] = None
        out = sc.component_grades_from_class_doc(doc, uid_map={"r1": "M"})
        self.assertIn("M/FA:1.2", out)
        # neither -> roster id
        out = sc.component_grades_from_class_doc(doc)
        self.assertIn("r1/FA:1.2", out)


class TestComponentComments(unittest.TestCase):
    def setUp(self):
        self.lesson = {"unit": 1, "worksheetKey": "2", "lessonKey": "1.2",
                       "zeroDate": {"B": "2026-09-20", "E": "2026-09-25"},
                       "hasBlooket": True, "quizTotal": 0, "Q": None}
        self.doc = {"students": [{"studentId": "r1", "schoologyUid": "u1",
                                 "section": "PeriodB", "realName": "Private Student",
                                 "username": "private_login", "lessons": [self.lesson]}]}

    def test_exact_worksheet_and_blooket_messages(self):
        out = sc.component_comments_from_class_doc(self.doc, today="2026-09-21")
        self.assertEqual(out, {
            "u1/FA:1.2": "Not a permanent 0. Missing: 1.2 worksheet. Finish it on the Desk (it is listed first in My Ledger) and this grade updates at the next sync.",
            "u1/BL:1.2": "Not a permanent 0. Missing: 1.2 flashcards (Desk \u2192 Study Break or the lesson's Blooket). Finish it and this grade updates at the next sync.",
        })

    def test_quiz_suffix_only_for_untaken_existing_quiz(self):
        self.lesson["quizTotal"] = 3
        out = sc.component_comments_from_class_doc(self.doc, today="2026-09-21")
        for text in out.values():
            self.assertTrue(text.endswith(" Your 1.2 quiz is also unfinished (it counts in the Desk grade)."))
        self.lesson["Q"] = 0
        out = sc.component_comments_from_class_doc(self.doc, today="2026-09-21")
        self.assertEqual(out["u1/QUIZ:1.2"], "")
        self.assertNotIn("quiz is also", out["u1/FA:1.2"])

    def test_quiz_zero_has_its_own_message_once_quiz_zeros_start(self):
        self.lesson["quizTotal"] = 3
        out = sc.component_comments_from_class_doc(self.doc, today="2026-10-02")
        self.assertEqual(out["u1/QUIZ:1.2"],
                         "Not a permanent 0. Missing: 1.2 quiz. Take it on the Desk (it is listed first in My Ledger) and this grade updates at the next sync.")
        # the worksheet/flashcard messages no longer carry the "quiz is also unfinished" suffix
        self.assertNotIn("quiz is also", out["u1/FA:1.2"])
        self.assertNotIn("quiz is also", out["u1/BL:1.2"])
        # a taken quiz (even a 0 score) is never labelled missing
        self.lesson["Q"] = 0
        out = sc.component_comments_from_class_doc(self.doc, today="2026-10-02")
        self.assertEqual(out["u1/QUIZ:1.2"], "")

    def test_ced_titles_on_comments_name_the_lesson_the_way_the_column_does(self):
        # Rename day 2026-10-13: columns are "1.10 Day 2 Quiz"; the comment must not say "3.2".
        self.lesson.update({"unit": 3, "lessonKey": "3.2", "worksheetKey": "2", "quizTotal": 3})
        out = sc.component_comments_from_class_doc(self.doc, today="2026-10-13", ced=True)
        self.assertTrue(out["u1/QUIZ:3.2"].startswith("Not a permanent 0. Missing: 1.10 Day 2 quiz."))
        self.assertIn("Missing: 1.10 Day 2 worksheet.", out["u1/FA:3.2"])
        self.assertIn("Missing: 1.10 Day 2 flashcards", out["u1/BL:3.2"])
        for text in out.values():
            self.assertNotRegex(text, r"\b3\.2\b")
        # ced=False keeps the old key (pre-rename gradebooks)
        old = sc.component_comments_from_class_doc(self.doc, today="2026-10-13", ced=False)
        self.assertTrue(any("Missing: 3.2 " in t for t in old.values()))

    def test_range_labels_get_comments(self):
        self.lesson.update({"lessonKey": "1.3-1.4", "worksheetKey": "3-4", "quizTotal": 3})
        out = sc.component_comments_from_class_doc(self.doc, today="2026-10-02")
        self.assertTrue(out["u1/QUIZ:1.3-1.4"].startswith("Not a permanent 0. Missing: 1.3-1.4 quiz."))
        self.assertTrue(out["u1/FA:1.3-4"].startswith("Not a permanent 0. Missing: 1.3-1.4 worksheet."))

    def test_quiz_zeros_from_override_is_validated(self):
        self.assertEqual(sc._valid_iso_date("2026-10-02"), "2026-10-02")
        self.assertEqual(sc._valid_iso_date(" 2026-10-02 "), "2026-10-02")
        for bad in ("", " ", "2026-13-01", "2026-10-2", "tomorrow", None):
            self.assertIsNone(sc._valid_iso_date(bad))

    def test_not_due_has_no_touched_cells(self):
        self.assertEqual(sc.component_comments_from_class_doc(self.doc, today="2026-09-20"), {})
        self.assertEqual(sc.component_comments_from_class_doc(self.doc), {})
        self.doc["students"][0]["section"] = "PeriodE"
        self.assertEqual(sc.component_comments_from_class_doc(self.doc, today="2026-09-21"), {})

    def test_nonzero_and_earned_zero_clear_and_keys_match(self):
        for value in (80, 0):
            self.lesson.update(lessonGradeNoQuiz=value, blooket=value, Q=value, quizTotal=3)
            grades = sc.component_grades_from_class_doc(self.doc, today="2026-09-21")
            self.assertEqual(sc.component_comments_from_class_doc(self.doc, today="2026-09-21"),
                             dict.fromkeys(grades, ""))

    def test_no_names_or_other_student_data(self):
        self.doc["students"].append({"studentId": "other", "realName": "Other Private Name",
                                      "username": "other_login", "lessons": []})
        text = " ".join(sc.component_comments_from_class_doc(self.doc, today="2026-09-21").values())
        for student in self.doc["students"]:
            for field in ("realName", "username"):
                self.assertNotIn(student[field], text)
        self.lesson["lessonKey"] = "Private Student"
        self.assertTrue(all(t == "" for t in sc.component_comments_from_class_doc(
            self.doc, today="2026-09-21").values()))

    def test_uid_priority_and_first_emitted_group_match_grades(self):
        student = self.doc["students"][0]
        student["schoologyUid"] = None
        student["lessons"].insert(0, {**self.lesson, "Cws": 75, "blooket": 80})
        out = sc.component_comments_from_class_doc(self.doc, {"r1": "mapped"}, "2026-09-21")
        self.assertEqual(out, {"mapped/FA:1.2": "", "mapped/BL:1.2": ""})


# ---------------------------------------------------------------------------
# Quarter routing (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.1, teacher 2026-11-07)
# ---------------------------------------------------------------------------

import re  # noqa: E402

GRADE_CONFIG = os.path.join(REPO_ROOT, "roster-server", "grade-config.js")
LIVE_MPS = {   # the live Schoology marking periods (read-only probe 2026-11-07)
    "1173888": {"start": "2026-09-02", "end": "2026-11-06"},
    "1173889": {"start": "2026-11-07", "end": "2027-01-22"},
    "1173886": {"start": "2027-01-23", "end": "2027-04-14"},
    "1173887": {"start": "2027-04-15", "end": "2027-06-30"},
}


def _row(key, unit, wk, b_day, e_day=None, **fields):
    """A /class/grades lesson row with nothing done (every score None)."""
    row = {"lessonKey": key, "unit": unit, "worksheetKey": wk,
           "due": {"B": b_day, "E": e_day},
           "zeroDate": {"B": sc.zero_date_of(b_day), "E": sc.zero_date_of(e_day)},
           "lessonGradeNoQuiz": None, "Cws": None, "Q": None, "quizTotal": 3,
           "blooket": None, "hasBlooket": True}
    row.update(fields)
    return row


def _doc(section, lessons, **student):
    return {"students": [dict({"studentId": "s9", "schoologyUid": "u9", "section": section,
                               "lessons": lessons, "units": {}}, **student)]}


class TestEngineParity(unittest.TestCase):
    """The Python mirrors of the engine's numbers stay equal to roster-server/grade-config.js."""

    def setUp(self):
        with open(GRADE_CONFIG, encoding="utf-8") as fh:
            self.config = fh.read()

    def test_due_lag_days(self):
        self.assertEqual(sc.DUE_LAG_DAYS, int(re.search(r"dueLagDays: (\d+)", self.config).group(1)))

    def test_default_quarter_windows(self):
        found = dict((q, {"start": s, "end": e}) for q, s, e in re.findall(
            r"(Q\d): \{ units: \[[^\]]*\],\s*start: '([\d-]+)', end: '([\d-]+)'", self.config))
        self.assertEqual(set(found), {"Q1", "Q2", "Q3", "Q4"})
        self.assertEqual(sc.DEFAULT_QUARTERS, found)

    def test_daily_job_close_fallback_matches_the_engine(self):
        # daily_schoology_sync.ps1 -Q1Close is only a fallback; it must equal grade-config's
        # quarters.Q1.close whenever the engine carries one.
        with open(os.path.join(REPO_ROOT, "tools", "daily_schoology_sync.ps1"), encoding="utf-8") as fh:
            fallback = re.search(r"\[string\]\$Q1Close = '([\d-]+)'", fh.read()).group(1)
        engine = re.search(r"Q1: \{[^\n]*\n?[^\n]*close: '([\d-]+)'", self.config)
        if engine:
            self.assertEqual(fallback, engine.group(1))
        self.assertEqual(fallback, "2026-11-12")


class TestZeroQuarterRule(unittest.TestCase):
    def test_zero_quarter_boundaries(self):
        # Spec section 2 test (5): a gap day or a quarter's last day rolls forward.
        self.assertEqual(sc.zero_quarter_of("2026-11-05"), "Q1")
        for d in ("2026-11-06", "2026-11-07", "2026-11-08"):
            self.assertEqual(sc.zero_quarter_of(d), "Q2", d)
        for d in ("2027-01-22", "2027-01-24"):
            self.assertEqual(sc.zero_quarter_of(d), "Q3", d)
        self.assertEqual(sc.zero_quarter_of("2027-06-16"), "Q4")
        self.assertIsNone(sc.zero_quarter_of("2027-06-17"))
        self.assertIsNone(sc.zero_quarter_of(None))

    def test_zero_date_and_filing_date(self):
        self.assertEqual(sc.zero_date_of("2026-10-26"), "2026-11-08")
        self.assertEqual(sc.filing_date_of("2026-10-23"), "2026-11-06")
        self.assertEqual(sc.filing_date_of("2026-10-26"), "2026-11-09")
        self.assertIsNone(sc.filing_date_of(None))
        self.assertIsNone(sc.add_days("not a date", 1))

    def test_filing_date_lands_in_the_marking_period_of_the_zero_quarter(self):
        # For every dated lesson of the live schedule, the MP the filing date lands in is
        # the Nth MP where N is the engine's regular quarter of that lesson (class day +
        # 13): Schoology's contiguous MPs and the engine's gapped windows agree.
        import schoology_sync_lib as lib
        with open(os.path.join(REPO_ROOT, "data", "lesson-schedule.json"), encoding="utf-8") as f:
            lessons = json.load(f)["lessons"]
        checked = 0
        for key, entry in lessons.items():
            for period in ("B", "E"):
                day = (entry.get("periods") or {}).get(period)
                if not day or entry.get("kind") == "work":
                    continue
                quarter = sc.lesson_quarter({"due": {period: day}}, period)
                mp = lib.marking_period_for_date(sc.filing_date_of(day), LIVE_MPS)
                self.assertEqual(lib.quarter_for_marking_period(mp, LIVE_MPS), quarter, (key, period, day))
                checked += 1
        self.assertGreater(checked, 100)

    def test_lesson_quarter_prefers_the_engine_field(self):
        row = {"due": {"B": "2026-10-26"}, "quarter": {"B": "Q1"}}
        self.assertEqual(sc.lesson_quarter(row, "B"), "Q1")        # the engine's word wins
        never = {"due": {"B": "2027-06-10"}, "quarter": {"B": None}, "liftQuarter": {"B": "Q4"}}
        self.assertEqual(sc.lesson_quarter(never, "B"), "Q4")      # year end: where it was taught

    def test_lesson_quarter_is_derived_for_rows_without_the_field(self):
        # The freeze-era engine sends zeroDate null for B 4.2 (after the line): derive it
        # from the class day + 13 -> Q2. 4.1 (zero 11/05) stays Q1.
        self.assertEqual(sc.lesson_quarter({"due": {"B": "2026-10-26"}, "zeroDate": {"B": None}}, "B"), "Q2")
        self.assertEqual(sc.lesson_quarter({"due": {"B": "2026-10-23"}}, "B"), "Q1")
        self.assertEqual(sc.lesson_quarter({"due": {"E": "2026-11-09"}}, "E"), "Q2")
        self.assertIsNone(sc.lesson_quarter({"due": {"B": None}}, "B"))
        self.assertIsNone(sc.lesson_quarter({"due": {"B": "2026-10-23"}}, None))
        # The doc's own windows win over the defaults.
        shifted = {"Q1": {"start": "2026-09-02", "end": "2026-11-13"},
                   "Q2": {"start": "2026-11-16", "end": "2027-01-22"}}
        self.assertEqual(sc.lesson_quarter({"due": {"B": "2026-10-26"}}, "B", shifted), "Q1")

    def test_doc_quarters_falls_back_to_the_defaults(self):
        self.assertIs(sc.doc_quarters({}), sc.DEFAULT_QUARTERS)
        mine = {"Q1": {"start": "2026-09-02", "end": "2026-11-06"}}
        self.assertIs(sc.doc_quarters({"config": {"quarters": mine}}), mine)

    def test_close_dates(self):
        doc = {"config": {"quarters": {"Q1": {"start": "2026-09-02", "end": "2026-11-06",
                                              "close": "2026-11-12"}}}}
        self.assertEqual(sc.quarter_close_date(doc, "Q1"), "2026-11-12")
        self.assertEqual(sc.quarter_close_date({}, "Q1", "2026-11-13"), "2026-11-13")
        self.assertIsNone(sc.quarter_close_date({}, "Q1"))
        self.assertFalse(sc.quarter_is_closed("2026-11-12", "2026-11-12"))   # the close evening
        self.assertTrue(sc.quarter_is_closed("2026-11-13", "2026-11-12"))
        self.assertFalse(sc.quarter_is_closed("2026-11-13", None))
        self.assertFalse(sc.quarter_has_ended(doc, "Q1", "2026-11-06"))
        self.assertTrue(sc.quarter_has_ended(doc, "Q1", "2026-11-07"))


def _real_quarters():
    """roster-server/grade-config.js PHASE3_CONFIG.quarters, read by node (the engine's own object)."""
    import subprocess
    script = ("import('./roster-server/grade-config.js')"
              ".then(m => process.stdout.write(JSON.stringify(m.PHASE3_CONFIG.quarters)))")
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=REPO_ROOT,
                            capture_output=True, text=True, encoding="utf-8", check=True, timeout=60)
    return json.loads(result.stdout)


class TestQuarterPasses(unittest.TestCase):
    """quarter_passes: which passes the daily job runs (finding B3, 2026-11-08)."""

    @classmethod
    def setUpClass(cls):
        cls.doc = {"config": {"quarters": _real_quarters()}}

    def passes(self, today, doc=None, q1_close=None):
        return sc.quarter_passes(self.doc if doc is None else doc, today, q1_close=q1_close)

    def test_the_real_config_this_week(self):
        self.assertEqual(self.doc["config"]["quarters"]["Q1"].get("close"), "2026-11-12")
        self.assertEqual(self.passes("2026-11-08"), ["Q1", "Q2"])     # Sunday, a gap day
        self.assertEqual(self.passes("2026-11-09"), ["Q1", "Q2"])
        self.assertEqual(self.passes("2026-11-12"), ["Q1", "Q2"])     # the close evening
        self.assertEqual(self.passes("2026-11-13"), ["Q2"])

    def test_the_real_config_in_january(self):
        q2_close = self.doc["config"]["quarters"]["Q2"].get("close")
        self.assertEqual(self.passes("2027-01-22"), ["Q2"])
        expected = ["Q2", "Q3"] if q2_close and "2027-01-23" <= q2_close else ["Q3"]
        self.assertEqual(self.passes("2027-01-23"), expected)       # Saturday: Q3 is next
        self.assertEqual(self.passes("2027-01-25")[-1], "Q3")

    def test_inside_a_quarter_and_at_the_ends_of_the_year(self):
        self.assertEqual(self.passes("2026-10-15"), ["Q1"])
        self.assertEqual(self.passes("2026-11-06"), ["Q1"])          # Quarter 1's last day
        self.assertEqual(self.passes("2026-08-20"), ["Q1"])          # before the first quarter
        self.assertEqual(self.passes("2027-06-17"), ["Q4"])
        q4_close = self.doc["config"]["quarters"]["Q4"].get("close")
        after = ["Q4"] if q4_close and "2027-06-18" <= q4_close else []
        self.assertEqual(self.passes("2027-06-18"), after)           # after the year: only a closing Q4

    def test_a_closing_quarter_needs_a_close_date(self):
        windows = {q: {"start": w["start"], "end": w["end"]} for q, w in sc.DEFAULT_QUARTERS.items()}
        bare = {"config": {"quarters": windows}}
        self.assertEqual(self.passes("2026-11-09", bare), ["Q2"])
        # The ps1's -Q1Close fallback applies to Quarter 1 only.
        self.assertEqual(self.passes("2026-11-09", bare, q1_close="2026-11-12"), ["Q1", "Q2"])
        self.assertEqual(self.passes("2026-11-13", bare, q1_close="2026-11-12"), ["Q2"])
        # A far-off Quarter 1 fallback keeps Quarter 1 open; Quarter 2 (no close) gets none.
        self.assertEqual(self.passes("2027-01-25", bare, q1_close="2027-02-01"), ["Q1", "Q3"])
        # A doc without config.quarters uses the engine defaults.
        self.assertEqual(self.passes("2026-11-09", {}, q1_close="2026-11-12"), ["Q1", "Q2"])

    def test_each_quarter_runs_its_pass_on_its_own_days(self):
        # So no lesson's regular quarter goes without a pass while that quarter runs.
        import datetime as dt
        quarters = self.doc["config"]["quarters"]
        for q in ("Q1", "Q2", "Q3", "Q4"):
            day = dt.date.fromisoformat(quarters[q]["start"])
            end = dt.date.fromisoformat(quarters[q]["end"])
            while day <= end:
                self.assertIn(q, self.passes(day.isoformat()), (q, day))
                day += dt.timedelta(days=7)


class TestQuarterPassTargets(unittest.TestCase):
    """component_grades_from_class_doc(quarter=...) emits only that pass's targets."""

    def _b_rows(self, with_field):
        # B 4.1 (Q1) and 4.2 (Q2) share the 4.1-2 worksheet + deck; 4.2 has a quiz.
        r41 = _row("4.1", 4, "1-2", "2026-10-23", quizTotal=0)
        r42 = _row("4.2", 4, "1-2", "2026-10-26")
        r43 = _row("4.3", 4, "3-4-5", "2026-10-27")
        if with_field:   # the engine's own rows (zeroQuarterMembership)
            r41.update(quarter={"B": "Q1", "E": "Q2"}, liftQuarter={"B": None, "E": "Q1"})
            r42.update(quarter={"B": "Q2", "E": "Q2"}, liftQuarter={"B": "Q1", "E": "Q1"})
            r43.update(quarter={"B": "Q2", "E": "Q2"}, liftQuarter={"B": "Q1", "E": "Q1"})
        return [r41, r42, r43]

    def test_b_quarter_1_pass_has_only_the_4_1_columns(self):
        for with_field in (True, False):
            doc = _doc("PeriodB", self._b_rows(with_field))
            q1 = sc.component_grades_from_class_doc(doc, today="2026-11-10", quarter="Q1")
            # The straddling 2.3 Follow-Along / Blooket are decided by 4.1: Q1 zeros (11/05).
            self.assertEqual(q1, {"u9/FA:4.1-2": 0, "u9/BL:4.1-2": 0}, with_field)
            q2 = sc.component_grades_from_class_doc(doc, today="2026-11-10", quarter="Q2")
            # 4.2's quiz (zero 11/08) and 4.3's columns (zero 11/09) are Quarter 2 zeros.
            self.assertEqual(q2, {"u9/QUIZ:4.2": 0, "u9/FA:4.3-4-5": 0, "u9/BL:4.3-4-5": 0,
                                  "u9/QUIZ:4.3": 0}, with_field)
            # Legacy (no pass): every target, as before.
            legacy = sc.component_grades_from_class_doc(doc, today="2026-11-10")
            self.assertEqual(set(legacy), set(q1) | set(q2))

    def test_no_quarter_2_zero_ever_lands_in_the_quarter_1_pass(self):
        # Every lesson of the live schedule missing, both sections, the restored zero dates:
        # each Quarter 1 target is a Quarter 1 lesson's column, filed in MP1.
        import schoology_sync_lib as lib
        with open(os.path.join(REPO_ROOT, "data", "lesson-schedule.json"), encoding="utf-8") as f:
            schedule = json.load(f)
        lessons = []
        for key, e in schedule["lessons"].items():
            if e.get("kind") == "work" or e.get("unit") is None:
                continue
            p = e.get("periods") or {}
            lessons.append(_row(key, e["unit"], e["worksheetKey"], p.get("B"), p.get("E")))
        for section, period in (("PeriodB", "B"), ("PeriodE", "E")):
            cols = {c["key"]: c for c in sc.component_columns(
                schedule["lessons"], period, quiz_topics={l["lessonKey"] for l in lessons},
                blooket_topics={l["lessonKey"] for l in lessons})}
            doc = _doc(section, lessons)
            for today in ("2026-11-09", "2026-11-10", "2026-11-12", "2026-11-20"):
                for quarter, mp in (("Q1", "1173888"), ("Q2", "1173889")):
                    out = sc.component_grades_from_class_doc(doc, today=today, quarter=quarter)
                    for target in out:
                        key = target.split("/", 1)[1]
                        filed = lib.marking_period_for_date(cols[key]["filing_date"], LIVE_MPS)
                        self.assertEqual(filed, mp, (section, today, quarter, key))
            q1 = sc.component_grades_from_class_doc(doc, today="2026-11-12", quarter="Q1")
            q2 = sc.component_grades_from_class_doc(doc, today="2026-11-12", quarter="Q2")
            self.assertTrue(q1 and q2)
            self.assertFalse(set(q1) & set(q2))

    def test_e_4_1_2_group_is_entirely_quarter_2(self):
        rows = [_row("4.1", 4, "1-2", None, "2026-10-26", quizTotal=0),
                _row("4.2", 4, "1-2", None, "2026-10-28")]
        doc = _doc("PeriodE", rows)
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-11-09", quarter="Q1"), {})
        self.assertEqual(sc.component_grades_from_class_doc(doc, today="2026-11-09", quarter="Q2"),
                         {"u9/FA:4.1-2": 0, "u9/BL:4.1-2": 0})

    def test_scores_route_like_zeros(self):
        rows = self._b_rows(True)
        rows[0].update(lessonGradeNoQuiz=91, blooket=80)
        rows[1].update(lessonGradeNoQuiz=91, blooket=80, Q=66.7)
        doc = _doc("PeriodB", rows)
        q1 = sc.component_grades_from_class_doc(doc, today="2026-11-08", quarter="Q1")
        self.assertEqual(q1, {"u9/FA:4.1-2": 91, "u9/BL:4.1-2": 80})
        q2 = sc.component_grades_from_class_doc(doc, today="2026-11-08", quarter="Q2")
        self.assertEqual(q2, {"u9/QUIZ:4.2": 66.7})

    def test_no_zeros_holds_lagged_zeros_but_keeps_scores_and_earned_zeros(self):
        rows = self._b_rows(True)
        rows[2].update(Q=0)   # 4.3's quiz taken and scored 0: a real score
        doc = _doc("PeriodB", rows)
        out = sc.component_grades_from_class_doc(doc, today="2026-11-10", quarter="Q2", zeros=False)
        self.assertEqual(out, {"u9/QUIZ:4.3": 0})
        self.assertEqual(sc.component_comments_from_class_doc(doc, today="2026-11-10", quarter="Q2",
                                                              zeros=False), {"u9/QUIZ:4.3": ""})

    def test_comments_follow_the_pass(self):
        doc = _doc("PeriodB", self._b_rows(True))
        for quarter in ("Q1", "Q2"):
            grades = sc.component_grades_from_class_doc(doc, today="2026-11-10", quarter=quarter)
            comments = sc.component_comments_from_class_doc(doc, today="2026-11-10", quarter=quarter)
            self.assertEqual(set(comments), set(grades))
        q1 = sc.component_comments_from_class_doc(doc, today="2026-11-10", quarter="Q1")
        self.assertIn("Missing: 4.1 worksheet", q1["u9/FA:4.1-2"])

    def test_pc_and_poster_follow_the_quarter_unit_lists(self):
        doc = _doc("PeriodB", [], units={"U1": {"pcRawPct": 70}, "U2": {"pcRawPct": 80}},
                   quarters={"Q1": {"pcUnits": [1], "posterUnits": [1]},
                             "Q2": {"pcUnits": [2, 3], "posterUnits": [2]}})
        posters = {"s9": {1: 115, 2: 100}}
        q1 = sc.component_grades_from_class_doc(doc, quarter="Q1", poster_grades=posters)
        self.assertEqual(q1, {"u9/PC:U1": 70, "u9/POSTER:U1": 115})
        q2 = sc.component_grades_from_class_doc(doc, quarter="Q2", poster_grades=posters)
        self.assertEqual(q2, {"u9/PC:U2": 80, "u9/POSTER:U2": 100})
        # A doc without the unit lists routes no unit-level target in a pass.
        bare = _doc("PeriodB", [], units={"U1": {"pcRawPct": 70}})
        self.assertEqual(sc.component_grades_from_class_doc(bare, quarter="Q1"), {})
        self.assertEqual(sc.component_grades_from_class_doc(bare), {"u9/PC:U1": 70})

    def test_rows_carry_quarter(self):
        self.assertTrue(sc.rows_carry_quarter(_doc("PeriodB", self._b_rows(True))))
        self.assertFalse(sc.rows_carry_quarter(_doc("PeriodB", self._b_rows(False))))


if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    passed = result.testsRun - len(result.failures) - len(result.errors)
    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{result.testsRun} passed", end="")
    if result.failures or result.errors:
        print(f"  ({len(result.failures)} failures, {len(result.errors)} errors)")
        sys.exit(1)
    else:
        print("  -- ALL PASS")
        sys.exit(0)
