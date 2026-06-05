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

    def test_emits_pc_from_units_and_skips_poster(self):
        # PC <- units[U#].pcRawPct (the unit mastery track). Poster has no data
        # source yet, so it is never emitted (parity with gradebook-grid.js).
        doc = {"students": [{"studentId": "r1", "schoologyUid": "9001",
            "units": {"U1": {"pcRawPct": 82}, "U6": {"pcRawPct": None}},
            "lessons": []}]}
        out = sc.component_grades_from_class_doc(doc)
        self.assertEqual(out["9001/PC:U1"], 82)
        self.assertNotIn("9001/PC:U6", out)       # null pcRawPct -> skipped
        self.assertNotIn("9001/POSTER:U1", out)   # poster never emitted

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
