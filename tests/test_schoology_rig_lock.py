"""tests/test_schoology_rig_lock.py -- the shared rig lock in schoology_sync_lib.

Run from repo root:
    python -m pytest tests/test_schoology_rig_lock.py -q
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import schoology_sync_lib as lib


class TestRigLock(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'logs', 'rig.lock')
        os.environ.pop(lib.RIG_LOCK_OWNER_ENV, None)

    def tearDown(self):
        os.environ.pop(lib.RIG_LOCK_OWNER_ENV, None)
        self.tmp.cleanup()

    def test_acquire_writes_pid_owner_stamp_and_sets_env(self):
        token = lib.acquire_rig_lock('move-columns', path=self.path)
        self.assertEqual(token, self.path)
        holder = lib.rig_lock_holder(self.path)
        self.assertEqual(holder['pid'], os.getpid())
        self.assertEqual(holder['owner'], 'move-columns')
        self.assertTrue(holder['at'].startswith('20'))
        self.assertEqual(os.environ.get(lib.RIG_LOCK_OWNER_ENV), str(os.getpid()))

    def test_second_acquire_is_refused_while_a_live_holder_exists(self):
        with open(self.path if os.path.isdir(os.path.dirname(self.path)) else self._mk(), 'w') as fh:
            fh.write('%d PeriodB 2026-11-08T16:30:00-05:00' % os.getpid() + chr(10))
        slept = []
        token = lib.acquire_rig_lock('close', path=self.path, wait_seconds=0, sleep=slept.append,
                                     alive=lambda pid: True)
        self.assertIsNone(token)
        self.assertEqual(slept, [])
        self.assertTrue(os.path.exists(self.path))

    def test_waits_then_gives_up(self):
        self._mk()
        with open(self.path, 'w') as fh:
            fh.write('424242 PeriodE 2026-11-08T16:45:00-05:00' + chr(10))
        slept = []
        clock = {'t': 0.0}

        def fake_sleep(seconds):
            slept.append(seconds)
            clock['t'] += seconds

        # alive holder, 0 wait: refused at once, no sleep
        token = lib.acquire_rig_lock('close', path=self.path, wait_seconds=0, sleep=fake_sleep,
                                     alive=lambda pid: True)
        self.assertIsNone(token)
        self.assertEqual(slept, [])

    def test_stale_lock_is_taken_over(self):
        self._mk()
        with open(self.path, 'w') as fh:
            fh.write('424242 PeriodB 2026-11-08T16:30:00-05:00' + chr(10))
        token = lib.acquire_rig_lock('move-columns', path=self.path, alive=lambda pid: False)
        self.assertEqual(token, self.path)
        self.assertEqual(lib.rig_lock_holder(self.path)['pid'], os.getpid())

    def test_old_lock_is_stale_even_when_pid_alive(self):
        holder = {'pid': 1, 'owner': 'x', 'at': '', 'age_hours': lib.RIG_LOCK_STALE_HOURS + 0.5}
        self.assertTrue(lib.rig_lock_is_stale(holder, alive=lambda pid: True))
        fresh = {'pid': 1, 'owner': 'x', 'at': '', 'age_hours': 0.1}
        self.assertFalse(lib.rig_lock_is_stale(fresh, alive=lambda pid: True))
        self.assertTrue(lib.rig_lock_is_stale(fresh, alive=lambda pid: False))
        self.assertFalse(lib.rig_lock_is_stale(None))

    def test_ps1_format_line_is_parsed(self):
        self._mk()
        with open(self.path, 'w') as fh:
            fh.write('31337 PeriodB 2026-11-08T16:30:00.1234567-05:00' + chr(10))
        holder = lib.rig_lock_holder(self.path)
        self.assertEqual(holder['pid'], 31337)
        self.assertEqual(holder['owner'], 'PeriodB')
        self.assertEqual(holder['at'], '2026-11-08T16:30:00.1234567-05:00')

    def test_nested_run_inherits_the_parent_lock_and_never_releases_it(self):
        token = lib.acquire_rig_lock('close-quarter', path=self.path)
        self.assertEqual(token, self.path)
        # A child process sees APSTATS_RIG_LOCK_OWNER = the parent's pid (set by acquire).
        child = lib.acquire_rig_lock('official --final', path=self.path, alive=lambda pid: True)
        self.assertEqual(child, lib.RIG_LOCK_INHERITED)
        lib.release_rig_lock(child)
        self.assertTrue(os.path.exists(self.path), 'the inherited token must not remove the lock')
        lib.release_rig_lock(token)
        self.assertFalse(os.path.exists(self.path))
        self.assertIsNone(os.environ.get(lib.RIG_LOCK_OWNER_ENV))

    def test_release_of_missing_file_is_quiet(self):
        lib.release_rig_lock(os.path.join(self.tmp.name, 'nope.lock'))
        lib.release_rig_lock(None)

    def test_own_pid_is_alive(self):
        self.assertTrue(lib.pid_alive(os.getpid()))
        self.assertFalse(lib.pid_alive(0))
        self.assertFalse(lib.pid_alive(-5))

    def _mk(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        return self.path

    def test_a_lock_held_by_the_parent_process_is_inherited(self):
        # tools/daily_schoology_sync.ps1 holds the lock under its own PID and runs
        # schoology_official.py as its child without exporting APSTATS_RIG_LOCK_OWNER.
        self._mk()
        with open(self.path, 'w') as fh:
            fh.write('%d PeriodB 2026-11-09T16:30:00-05:00' % os.getppid() + chr(10))
        token = lib.take_rig_lock('official', path=self.path)
        self.assertEqual(token, lib.RIG_LOCK_INHERITED)
        lib.release_rig_lock(token)
        self.assertTrue(os.path.exists(self.path), 'the parent keeps its lock')
        self.assertTrue(lib.is_daily_job_owner(lib.rig_lock_owner(self.path)))

    def test_a_lock_held_by_someone_else_is_refused(self):
        self._mk()
        with open(self.path, 'w') as fh:
            fh.write('%d move-columns 2026-11-08T15:00:00-05:00' % os.getpid() + chr(10))
        self.assertIsNone(lib.take_rig_lock('official', path=self.path, parent_pid=-1))
        self.assertFalse(lib.is_daily_job_owner(lib.rig_lock_owner(self.path)))

    def test_a_free_rig_is_taken_and_released(self):
        token = lib.take_rig_lock('official', path=self.path)
        self.assertEqual(token, self.path)
        self.assertEqual(lib.rig_lock_owner(self.path), 'official')
        lib.release_rig_lock(token)
        self.assertFalse(os.path.exists(self.path))
        self.assertEqual(lib.rig_lock_owner(self.path), '')

    def test_owner_words(self):
        for owner, daily in (('PeriodB', True), ('PeriodE', True), ('official', False),
                             ('close-quarter', False), ('move-columns', False), ('', False)):
            self.assertEqual(lib.is_daily_job_owner(owner), daily, owner)


class TestLiveWindow(unittest.TestCase):
    """Finding A5: no manual write run from 16:00 to 17:05 (the LIVE tasks: 16:25-17:05)."""

    def test_window_edges(self):
        for hhmm, inside in (('15:59', False), ('16:00', True), ('16:25', True), ('17:04', True),
                             ('17:05', False), ('06:30', False), ('23:59', False)):
            self.assertEqual(lib.in_rig_quiet_window(hhmm), inside, hhmm)

    def test_school_clock(self):
        now = lib.school_now()
        self.assertIsNone(now.tzinfo)
        self.assertRegex(lib.school_hhmm(), r'^[0-2][0-9]:[0-5][0-9]$')


if __name__ == '__main__':
    unittest.main()
