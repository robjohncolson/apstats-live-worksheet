"""tests/test_schoology_sync_lib.py -- unit tests for schoology_sync_lib.

Run from repo root:
    python -m unittest tests.test_schoology_sync_lib -v
Or directly:
    python tests/test_schoology_sync_lib.py
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import schoology_sync_lib as lib


# ---------------------------------------------------------------------------
# classify_lesson_key
# ---------------------------------------------------------------------------

class TestClassifyLessonKey(unittest.TestCase):

    # progress_check variants
    def test_pc_plain(self):
        self.assertEqual(lib.classify_lesson_key('PC1'), 'progress_check')

    def test_pc_with_u_prefix(self):
        self.assertEqual(lib.classify_lesson_key('U3-PC'), 'progress_check')

    def test_pc_underscore_prefix(self):
        self.assertEqual(lib.classify_lesson_key('PC_U3'), 'progress_check')

    def test_progress_word(self):
        self.assertEqual(lib.classify_lesson_key('progress_check_u5'), 'progress_check')

    def test_pc_uppercase(self):
        self.assertEqual(lib.classify_lesson_key('PC5'), 'progress_check')

    # quiz
    def test_quiz_plain(self):
        self.assertEqual(lib.classify_lesson_key('QUIZ_U2'), 'quiz')

    def test_quiz_lowercase(self):
        self.assertEqual(lib.classify_lesson_key('quiz1'), 'quiz')

    def test_quiz_mixed(self):
        self.assertEqual(lib.classify_lesson_key('Quiz4.1'), 'quiz')

    # poster
    def test_poster_plain(self):
        self.assertEqual(lib.classify_lesson_key('POSTER_U4'), 'poster')

    def test_poster_lowercase(self):
        self.assertEqual(lib.classify_lesson_key('poster_u2'), 'poster')

    # blooket
    def test_blooket_plain(self):
        self.assertEqual(lib.classify_lesson_key('BLOOKET_U3'), 'blooket')

    def test_blooket_lowercase(self):
        self.assertEqual(lib.classify_lesson_key('blooket_4.1'), 'blooket')

    # regular lesson topics
    def test_lesson_simple(self):
        self.assertEqual(lib.classify_lesson_key('1.1'), 'lesson')

    def test_lesson_with_u_prefix(self):
        self.assertEqual(lib.classify_lesson_key('U4.1'), 'lesson')

    def test_lesson_combined(self):
        self.assertEqual(lib.classify_lesson_key('4.1-2'), 'lesson')

    def test_lesson_combined_u_prefix(self):
        self.assertEqual(lib.classify_lesson_key('U4.1-2'), 'lesson')

    def test_lesson_double_digit_topic(self):
        self.assertEqual(lib.classify_lesson_key('U1.10'), 'lesson')

    # unknown -> lesson (safe default)
    def test_unknown_returns_lesson(self):
        self.assertEqual(lib.classify_lesson_key('SOMETHING_WEIRD'), 'lesson')

    def test_empty_returns_lesson(self):
        self.assertEqual(lib.classify_lesson_key(''), 'lesson')


# ---------------------------------------------------------------------------
# assignment_title
# ---------------------------------------------------------------------------

class TestAssignmentTitle(unittest.TestCase):

    # lesson
    def test_lesson_with_topic_name(self):
        self.assertEqual(
            lib.assignment_title('lesson', '4.1', 'Random Patterns'),
            'Topic 4.1: Random Patterns',
        )

    def test_lesson_without_topic_name(self):
        self.assertEqual(
            lib.assignment_title('lesson', '4.1'),
            'Topic 4.1',
        )

    def test_lesson_combined_with_name(self):
        self.assertEqual(
            lib.assignment_title('lesson', '4.1-2', 'Simulation'),
            'Topic 4.1-2: Simulation',
        )

    def test_lesson_combined_without_name(self):
        self.assertEqual(
            lib.assignment_title('lesson', '4.1-2'),
            'Topic 4.1-2',
        )

    def test_lesson_u_prefix_stripped(self):
        self.assertEqual(
            lib.assignment_title('lesson', 'U4.1', 'Intro'),
            'Topic 4.1: Intro',
        )

    # progress_check -- unit parsing
    def test_pc_numeric_suffix(self):
        self.assertEqual(
            lib.assignment_title('progress_check', 'PC3'),
            'Unit 3 Progress Check',
        )

    def test_pc_u_prefix(self):
        self.assertEqual(
            lib.assignment_title('progress_check', 'U3-PC'),
            'Unit 3 Progress Check',
        )

    def test_pc_underscore_form(self):
        self.assertEqual(
            lib.assignment_title('progress_check', 'PC_U3'),
            'Unit 3 Progress Check',
        )

    def test_pc_large_unit(self):
        self.assertEqual(
            lib.assignment_title('progress_check', 'PC9'),
            'Unit 9 Progress Check',
        )

    # quiz
    def test_quiz_with_name(self):
        self.assertEqual(
            lib.assignment_title('quiz', 'QUIZ_U4', 'Unit 4 Vocab'),
            'Quiz: Unit 4 Vocab',
        )

    def test_quiz_without_name(self):
        self.assertEqual(
            lib.assignment_title('quiz', 'QUIZ_U4'),
            'Quiz QUIZ_U4',
        )

    # poster
    def test_poster(self):
        self.assertEqual(
            lib.assignment_title('poster', 'POSTER_U4'),
            'Unit 4 Poster',
        )

    def test_poster_u_prefix(self):
        self.assertEqual(
            lib.assignment_title('poster', 'U2-POSTER'),
            'Unit 2 Poster',
        )

    # blooket
    def test_blooket(self):
        self.assertEqual(
            lib.assignment_title('blooket', 'BLOOKET_U3'),
            'Blooket BLOOKET_U3',
        )


# ---------------------------------------------------------------------------
# assignment_points
# ---------------------------------------------------------------------------

class TestAssignmentPoints(unittest.TestCase):

    def test_always_100_no_arg(self):
        self.assertEqual(lib.assignment_points(), 100)

    def test_always_100_lesson(self):
        self.assertEqual(lib.assignment_points('lesson'), 100)

    def test_always_100_quiz(self):
        self.assertEqual(lib.assignment_points('quiz'), 100)

    def test_always_100_none(self):
        self.assertEqual(lib.assignment_points(None), 100)


# ---------------------------------------------------------------------------
# marking_period_for_date
# ---------------------------------------------------------------------------

class TestMarkingPeriodForDate(unittest.TestCase):

    MP_RANGES = {
        'q1': {'start': '2026-09-01', 'end': '2026-11-15'},
        'q2': {'start': '2026-11-16', 'end': '2027-01-31'},
    }

    def test_inside_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-10-01', self.MP_RANGES),
            'q1',
        )

    def test_on_start_boundary_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-09-01', self.MP_RANGES),
            'q1',
        )

    def test_on_end_boundary_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-11-15', self.MP_RANGES),
            'q1',
        )

    def test_inside_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-12-01', self.MP_RANGES),
            'q2',
        )

    def test_on_start_boundary_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-11-16', self.MP_RANGES),
            'q2',
        )

    def test_on_end_boundary_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2027-01-31', self.MP_RANGES),
            'q2',
        )

    def test_outside_all_ranges(self):
        self.assertIsNone(
            lib.marking_period_for_date('2025-01-01', self.MP_RANGES),
        )

    def test_between_q1_and_q2_is_none(self):
        # There is no gap in this range set, but an edge case: what if date == q1.end+1?
        # Already covered by q2 start test above; add an explicit gap scenario.
        ranges_with_gap = {
            'q1': {'start': '2026-09-01', 'end': '2026-10-31'},
            'q2': {'start': '2026-12-01', 'end': '2027-01-31'},
        }
        self.assertIsNone(
            lib.marking_period_for_date('2026-11-15', ranges_with_gap),
        )

    def test_none_date_returns_none(self):
        self.assertIsNone(
            lib.marking_period_for_date(None, self.MP_RANGES),
        )

    def test_empty_date_returns_none(self):
        self.assertIsNone(
            lib.marking_period_for_date('', self.MP_RANGES),
        )

    def test_multi_range_picks_correct(self):
        ranges = {
            'fall': {'start': '2026-09-01', 'end': '2026-12-31'},
            'spring': {'start': '2027-01-01', 'end': '2027-05-31'},
        }
        self.assertEqual(
            lib.marking_period_for_date('2027-03-15', ranges),
            'spring',
        )


# ---------------------------------------------------------------------------
# should_push
# ---------------------------------------------------------------------------

class TestShouldPush(unittest.TestCase):

    def test_target_none_is_false(self):
        self.assertFalse(lib.should_push(None, 85.0))

    def test_target_none_last_none_is_false(self):
        self.assertFalse(lib.should_push(None, None))

    def test_last_none_target_not_none_is_true(self):
        self.assertTrue(lib.should_push(85.0, None))

    def test_equal_floats_is_false(self):
        self.assertFalse(lib.should_push(85.0, 85.0))

    def test_different_floats_is_true(self):
        self.assertTrue(lib.should_push(85.0, 84.9))

    def test_within_tolerance_is_false(self):
        self.assertFalse(lib.should_push(85.0, 85.0 + 1e-10))

    def test_beyond_tolerance_is_true(self):
        self.assertTrue(lib.should_push(85.0, 85.0 + 1e-8))

    def test_integer_equal_is_false(self):
        self.assertFalse(lib.should_push(100, 100))

    def test_integer_diff_is_true(self):
        self.assertTrue(lib.should_push(100, 99))

    def test_string_equal_is_false(self):
        # Non-numeric strings fall back to string comparison
        self.assertFalse(lib.should_push('E', 'E'))

    def test_string_diff_is_true(self):
        self.assertTrue(lib.should_push('E', 'P'))

    def test_numeric_string_equality(self):
        # "85.0" and 85.0 should be treated as equal
        self.assertFalse(lib.should_push('85.0', 85.0))

    def test_zero_target_last_none_is_true(self):
        # 0 is a valid grade (not None)
        self.assertTrue(lib.should_push(0, None))


# ---------------------------------------------------------------------------
# plan_assignment_work
# ---------------------------------------------------------------------------

class TestPlanAssignmentWork(unittest.TestCase):

    def test_no_existing_all_create(self):
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], {})
        self.assertEqual(result['create'], ['U1.1', 'U1.2'])
        self.assertEqual(result['reuse'], [])

    def test_all_existing_all_reuse(self):
        existing = {
            'U1.1': {'schoology_assignment_id': 'abc'},
            'U1.2': {'schoology_assignment_id': 'def'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], existing)
        self.assertEqual(result['create'], [])
        self.assertEqual(result['reuse'], ['U1.1', 'U1.2'])

    def test_null_id_goes_to_create(self):
        existing = {
            'U1.1': {'schoology_assignment_id': None},
            'U1.2': {'schoology_assignment_id': 'def'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], existing)
        self.assertIn('U1.1', result['create'])
        self.assertIn('U1.2', result['reuse'])

    def test_mixed_create_and_reuse(self):
        existing = {
            'U2.1': {'schoology_assignment_id': 'xyz'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U2.1', 'U3.1'], existing)
        self.assertEqual(result['create'], ['U1.1', 'U3.1'])
        self.assertEqual(result['reuse'], ['U2.1'])

    def test_order_preserved(self):
        existing = {'B': {'schoology_assignment_id': 'id1'}}
        result = lib.plan_assignment_work(['A', 'B', 'C'], existing)
        self.assertEqual(result['create'], ['A', 'C'])
        self.assertEqual(result['reuse'], ['B'])

    def test_dedupe(self):
        existing = {}
        result = lib.plan_assignment_work(['U1.1', 'U1.1', 'U1.2'], existing)
        self.assertEqual(result['create'], ['U1.1', 'U1.2'])

    def test_empty_scope(self):
        result = lib.plan_assignment_work([], {'U1.1': {'schoology_assignment_id': 'x'}})
        self.assertEqual(result['create'], [])
        self.assertEqual(result['reuse'], [])


# ---------------------------------------------------------------------------
# compute_sync_actions
# ---------------------------------------------------------------------------

class TestComputeSyncActions(unittest.TestCase):

    def test_push_when_last_is_none(self):
        targets = {('s1', 'U1.1'): 85.0}
        last_synced = {}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(('s1', 'U1.1'), result['push'])
        self.assertEqual(result['skip'], [])

    def test_skip_when_values_equal(self):
        key = ('s1', 'U1.1')
        targets = {key: 85.0}
        last_synced = {key: 85.0}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(key, result['skip'])
        self.assertEqual(result['push'], [])

    def test_push_when_value_changed(self):
        key = ('s1', 'U1.1')
        targets = {key: 90.0}
        last_synced = {key: 85.0}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(key, result['push'])

    def test_omit_when_target_none(self):
        key = ('s1', 'U1.1')
        targets = {key: None}
        last_synced = {}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertEqual(result['push'], [])
        self.assertEqual(result['skip'], [])

    def test_order_follows_targets(self):
        targets = {
            'a': 80.0,
            'b': None,
            'c': 90.0,
            'd': 90.0,
        }
        last_synced = {'a': 75.0, 'c': None, 'd': 90.0}
        result = lib.compute_sync_actions(targets, last_synced)
        # 'a' changed -> push; 'b' None -> omit; 'c' new -> push; 'd' equal -> skip
        self.assertEqual(result['push'], ['a', 'c'])
        self.assertEqual(result['skip'], ['d'])

    def test_mixed_push_skip_omit(self):
        targets = {
            'k1': 100,   # changed (last=99) -> push
            'k2': 50,    # equal              -> skip
            'k3': None,  # None               -> omit
            'k4': 75,    # new (no last)      -> push
        }
        last_synced = {'k1': 99, 'k2': 50}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertEqual(result['push'], ['k1', 'k4'])
        self.assertEqual(result['skip'], ['k2'])


if __name__ == '__main__':
    unittest.main()
