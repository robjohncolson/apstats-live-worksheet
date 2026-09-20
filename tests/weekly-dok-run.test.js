import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runWeekly, publicationPaths, recordWeeklyRun, createRuntime, alreadyRanThisWeek } from '../scripts/weekly-dok.mjs';

function fixture() {
  const original = { schema: 'apstats-misconception-triage/v1', entries: {} };
  const io = Object.fromEntries(['log', 'prepareWorktree', 'cleanupWorktree', 'fetchOrigin', 'rebase', 'abortRebase', 'head', 'preflight', 'checkCollisions', 'writeBrief', 'author',
    'validate', 'compile', 'tests', 'writeTriage', 'normalize', 'stage', 'detectChanges', 'unstage',
    'approvePush', 'push', 'verifyClean'].map(name => [name, vi.fn()]));
  Object.assign(io, {
    date: () => '2026-09-18', readTriage: () => original,
    backfill: value => value, crosswalk: () => ({ map: {} }),
    fetchSections: vi.fn(async () => [{ ok: true, section: 'PeriodB', frequent: [{ key: 'units', label: 'Units',
      students: 4, events: 5, lessons: ['1.1'], skills: ['4.B'] }] }]),
    audit: vi.fn(() => 'Fresh Context'), commit: vi.fn(() => 'local-commit-hash'),
  });
  return { io, original };
}

describe('weekly run boundaries', () => {
  it('restores triage if writing triage or creating the commit fails', async () => {
    for (const step of ['writeTriage', 'commit']) {
      const { io, original } = fixture();
      io[step].mockImplementationOnce(() => { throw new Error('failed before commit'); });
      await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('failed before commit');
      expect(io.writeTriage).toHaveBeenLastCalledWith(original);
      expect(io.unstage).toHaveBeenCalledOnce();
      expect(io.push).not.toHaveBeenCalled();
    }
  });
  it('publishes only the run history on a below-floor week, never an authored sheet', async () => {
    const { io } = fixture();
    io.fetchSections.mockResolvedValue([{ ok: true, section: 'PeriodB', frequent: [] }]);
    const result = await runWeekly({ mode: 'apply' }, io);
    expect(result.status).toBe('below floor');
    expect(io.writeTriage.mock.calls[0][0].weeklyRuns).toHaveLength(1);
    expect(io.author).not.toHaveBeenCalled();
    // The worktree is disposable: unpublished history would be lost and recurrence could never accumulate.
    expect(io.stage).toHaveBeenCalledWith(['roster-server/data/misconception-triage.json']);
    expect(io.commit).toHaveBeenCalledWith('Weekly DOK: no sheet 2026-09-18 (below floor)');
    expect(io.push).toHaveBeenCalledOnce();
  });
  it('a catch-up run in the same week as a completed run does nothing', async () => {
    const { io, original } = fixture();
    original.weeklyRuns = [{ at: '2026-09-18T21:00:00.000Z', keys: [] }];
    io.date = () => '2026-09-19';
    const result = await runWeekly({ mode: 'apply' }, io);
    expect(result.status).toBe('already ran');
    expect(io.fetchSections).not.toHaveBeenCalled();
    expect(io.author).not.toHaveBeenCalled();
    expect(io.writeTriage).not.toHaveBeenCalled();
    expect(io.push).not.toHaveBeenCalled();
  });

  it('--now still runs in a week that already has a run, and a new week always runs', async () => {
    const { io, original } = fixture();
    original.weeklyRuns = [{ at: '2026-09-18T21:00:00.000Z', keys: [] }];
    io.date = () => '2026-09-19';
    expect((await runWeekly({ mode: 'apply', now: true }, io)).status).toBe('published');
    expect(alreadyRanThisWeek(original, '2026-09-21')).toBe(false);
    expect(alreadyRanThisWeek(original, '2026-09-20')).toBe(true);
  });

  it('dry-run defaults to zero writes, authoring or git operations', async () => {
    const { io } = fixture();
    const result = await runWeekly({}, io);
    expect(result.status).toBe('dry-run');
    for (const name of ['prepareWorktree', 'cleanupWorktree', 'fetchOrigin', 'rebase', 'abortRebase', 'head', 'writeBrief', 'writeTriage', 'author', 'stage', 'commit', 'push']) {
      expect(io[name]).not.toHaveBeenCalled();
    }
  });
  it('stages exactly the publication allowlist and pushes after committing', async () => {
    const { io, original } = fixture();
    const result = await runWeekly({ mode: 'apply' }, io);
    expect(result.commit).toBe('local-commit-hash');
    expect(io.stage).toHaveBeenCalledWith(publicationPaths('1.1', '2026-09-18'));
    expect(io.writeTriage.mock.calls[0][0].entries.units.sheetTitle).toBe('Fresh Context');
    expect(original.entries).toEqual({});
    expect(io.commit.mock.invocationCallOrder[0]).toBeLessThan(io.approvePush.mock.invocationCallOrder[0]);
    expect(io.approvePush.mock.invocationCallOrder[0]).toBeLessThan(io.push.mock.invocationCallOrder[0]);
  });
  it.each(['checkCollisions', 'writeBrief', 'author', 'validate', 'compile', 'tests', 'audit', 'normalize', 'stage'])
   ('%s failure prevents commit and restores triage with an empty job index', async step => {
      const { io, original } = fixture();
      io[step].mockImplementation(() => { throw new Error('fixture failure'); });
      await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('fixture failure');
      expect(io.commit).not.toHaveBeenCalled();
      expect(io.push).not.toHaveBeenCalled();
      expect(io.unstage).toHaveBeenCalledWith(publicationPaths('1.1', '2026-09-18'));
      expect(io.writeTriage).toHaveBeenLastCalledWith(original);
    });
  it('retries an origin rejection once with validation and fresh approval', async () => {
    const { io } = fixture();
    io.push.mockRejectedValueOnce(Object.assign(new Error('rejected'), { originMoved: true }));
    io.head.mockReturnValue('rebased-hash');
    expect((await runWeekly({ mode: 'apply' }, io)).commit).toBe('rebased-hash');
    expect(io.push).toHaveBeenCalledTimes(2);
    expect(io.approvePush).toHaveBeenCalledTimes(2);
    expect(io.validate).toHaveBeenCalledTimes(2);
    const order = [io.push.mock.invocationCallOrder[0], io.fetchOrigin.mock.invocationCallOrder[0],
      io.rebase.mock.invocationCallOrder[0], io.validate.mock.invocationCallOrder[1],
      io.approvePush.mock.invocationCallOrder[1], io.push.mock.invocationCallOrder[1]];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it.each(['push', 'rebase'])('aborts and discards the worktree after repeated rejection or %s conflict', async step => {
    const { io } = fixture();
    io.push.mockRejectedValue(Object.assign(new Error('rejected'), { originMoved: true }));
    if (step === 'rebase') io.rebase.mockRejectedValue(new Error('conflict'));
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('Publication failed: origin moved twice');
    expect(io.abortRebase).toHaveBeenCalledOnce();
    expect(io.cleanupWorktree).toHaveBeenCalledOnce();
  });
  it('does not retry unrelated publication failures', async () => {
    const { io } = fixture();
    io.push.mockRejectedValue(new Error('offline'));
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('offline');
    expect(io.push).toHaveBeenCalledOnce();
    expect(io.cleanupWorktree).toHaveBeenCalledOnce();
  });
  it('treats change detection as best-effort', async () => {
    const { io } = fixture();
    io.detectChanges.mockRejectedValue(new Error('unavailable'));
    expect((await runWeekly({ mode: 'apply' }, io)).status).toBe('published');
    expect(io.log).toHaveBeenCalledWith('change detection skipped');
  });
  it.each(['success', 'author', 'validate', 'audit'])('creates the worktree before reading and cleans up on %s', async step => {
    const { io } = fixture();
    io.readTriage = vi.fn(io.readTriage);
    if (step !== 'success') io[step].mockRejectedValue(new Error('failed'));
    if (step === 'success') await runWeekly({ mode: 'apply' }, io);
    else await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('failed');
    expect(io.prepareWorktree.mock.invocationCallOrder[0]).toBeLessThan(io.readTriage.mock.invocationCallOrder[0]);
    expect(io.cleanupWorktree).toHaveBeenCalledOnce();
  });
  it('cleanup errors do not replace the run result', async () => {
    const { io } = fixture();
    io.cleanupWorktree.mockRejectedValue(new Error('cleanup'));
    expect((await runWeekly({ mode: 'apply' }, io)).status).toBe('published');
    expect(io.log).toHaveBeenCalledWith('Weekly worktree cleanup failed');
  });
  it('rejects the removed push-only mode without effects', async () => {
    const { io } = fixture();
    await expect(runWeekly({ mode: 'push-only' }, io)).rejects.toThrow('Unknown mode');
    expect(io.prepareWorktree).not.toHaveBeenCalled();
  });

});

describe('weekly recurrence observations', () => {
  it('counts three consecutive weeks, deduplicates a week and resets after re-triage', () => {
    const triage = { entries: { units: { triagedAt: '2026-09-12' } }, weeklyRuns: [] };
    const payload = [{ postTriageFrequent: [{ key: 'units' }] }];
    expect(recordWeeklyRun(triage, payload, '2026-09-18').size).toBe(0);
    recordWeeklyRun(triage, payload, '2026-09-18');
    expect(triage.weeklyRuns).toHaveLength(1);
    expect(recordWeeklyRun(triage, payload, '2026-09-25').size).toBe(0);
    expect([...recordWeeklyRun(triage, payload, '2026-10-02')]).toEqual(['units']);
    triage.entries.units.triagedAt = '2026-10-02';
    expect(recordWeeklyRun(triage, payload, '2026-10-09').size).toBe(0);
  });
  it('breaks a recurrence streak after a quiet week or a missing week', () => {
    const triage = { entries: { units: { triagedAt: '2026-09-12' } } };
    const payload = [{ postTriageFrequent: [{ key: 'units' }] }];
    recordWeeklyRun(triage, payload, '2026-09-18');
    recordWeeklyRun(triage, [], '2026-09-25');
    expect(recordWeeklyRun(triage, payload, '2026-10-02').size).toBe(0);
    expect(recordWeeklyRun(triage, payload, '2026-10-16').size).toBe(0);
  });
  it('backfills the five actual Screen Time targets without replacing existing triage', () => {
    const io = createRuntime({ home: process.cwd(), work: process.cwd() });
    const triage = { entries: { 'mean-resistant': { sheet: 'already-triaged' } } };
    io.backfill(triage);
    expect(Object.keys(triage.entries)).toHaveLength(5);
    expect(triage.entries['mean-resistant'].sheet).toBe('already-triaged');
    expect(triage.entries['counts-vs-percents']).toMatchObject({ sheetTitle: 'Screen Time, Two Deletions', triagedAt: '2026-09-12' });
  });
});

describe('isolated runtime', () => {
  const home = process.cwd();
  const work = path.join(home, '.weekly-dok-wt');
  it('removes a stale worktree before adding and fails if removal leaves it behind', () => {
    const command = vi.fn(() => '');
    const exists = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const io = createRuntime({ home, work }, { command, exists });
    io.prepareWorktree();
    expect(command.mock.calls.map(call => call[1])).toEqual([
      ['fetch', 'origin', 'master'], ['worktree', 'remove', '--force', work],
      ['worktree', 'prune'], ['worktree', 'add', '--detach', work, 'origin/master'],
    ]);
    expect(command.mock.calls.every(call => call[3] === home)).toBe(true);
    exists.mockReturnValue(true);
    expect(() => io.prepareWorktree()).toThrow('Stale weekly worktree could not be removed');
  });
  it('uses work for pipeline commands and ignores a hostile home checkout', async () => {
    const command = vi.fn((program, args) => {
      if (args[0] === 'branch') return 'feature';
      if (args[0] === 'diff') return 'dirty-staged-file';
      if (args[0] === 'log') return 'unpushed non-weekly commit';
      return '';
    });
    const { io: effects } = fixture();
    const io = createRuntime({ home, work }, { ...effects, command, exists: () => false });
    const runtime = createRuntime({ home, work }, { command, exists: () => false });
    for (const name of ['preflight', 'prepareWorktree', 'cleanupWorktree', 'push']) io[name] = runtime[name];
    expect((await runWeekly({ mode: 'apply', now: true }, io)).status).toBe('published');
    expect(command.mock.calls.filter(call => call[3] === work).map(call => call[1])).toEqual([['push', 'origin', 'HEAD:master']]);
    expect(command.mock.calls.filter(call => call[3] === home).every(call => ['fetch', 'worktree'].includes(call[1][0]))).toBe(true);
    runtime.fetchOrigin(); runtime.rebase(); runtime.abortRebase(); runtime.head(); runtime.validate();
    expect(command.mock.calls.slice(-5).every(call => call[3] === work)).toBe(true);
  });
  it('reads secrets from home and curriculum from work', async () => {
    const reads = [];
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(file => {
      reads.push(String(file));
      if (String(file) === path.join(home, 'roster-server/.env')) return 'TEACHER_SECRET=fake';
      if (String(file) === path.join(work, 'data/skill-map.json')) return '{}';
      throw new Error('unexpected read');
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, frequent: [] }) })));
    try {
      await createRuntime({ home, work }).fetchSections();
      expect(reads).toEqual([path.join(home, 'roster-server/.env'), path.join(work, 'data/skill-map.json')]);
    } finally { read.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('writes approval to the worktree git path, never the shared git directory', () => {
    const sentinel = path.join(home, '.git/worktrees/-weekly-dok-wt/PUSH_APPROVED');
    const command = vi.fn(() => sentinel);
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    try {
      createRuntime({ home, work }, { command }).approvePush();
      expect(command).toHaveBeenCalledWith('git', ['rev-parse', '--git-path', 'PUSH_APPROVED'], undefined, work);
      expect(write).toHaveBeenCalledWith(sentinel, '');
    } finally { write.mockRestore(); }
  });
  it('keeps the time window guard and allows an explicit manual run', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 14));
    try {
      const io = createRuntime({ home, work });
      expect(() => io.preflight({})).toThrow('Outside the Friday-night');
      expect(() => io.preflight({ now: true })).not.toThrow();
    } finally { vi.useRealTimers(); }
  });
  it('runs tests through home vitest with work as root and cwd', () => {
    const read = vi.spyOn(fs, 'readdirSync').mockReturnValue(['dok-example.test.js', 'other.test.js']);
    const command = vi.fn(() => '');
    try {
      createRuntime({ home, work }, { command }).tests();
      expect(command).toHaveBeenNthCalledWith(1, process.execPath,
        [path.join(home, 'node_modules/vitest/vitest.mjs'), 'run', '--root', work, 'tests/dok-example.test.js'], undefined, work);
      expect(command).toHaveBeenNthCalledWith(2, 'pytest', ['tests/test_dok_build.py', '-q'], undefined, work);
    } finally { read.mockRestore(); }
  });
});
