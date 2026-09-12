import { describe, it, expect, vi } from 'vitest';
import { runWeekly, publicationPaths, recordWeeklyRun, createRuntime } from '../scripts/weekly-dok.mjs';

function fixture() {
  const original = { schema: 'apstats-misconception-triage/v1', entries: {} };
  const io = Object.fromEntries(['log', 'recoverPending', 'preflight', 'checkCollisions', 'writeBrief', 'author',
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
  it('persists a successful below-floor observation without staging or publishing', async () => {
    const { io } = fixture();
    io.fetchSections.mockResolvedValue([{ ok: true, section: 'PeriodB', frequent: [] }]);
    const result = await runWeekly({ mode: 'apply' }, io);
    expect(result.status).toBe('below floor');
    expect(io.writeTriage.mock.calls[0][0].weeklyRuns).toHaveLength(1);
    expect(io.author).not.toHaveBeenCalled();
    expect(io.stage).not.toHaveBeenCalled();
    expect(io.push).not.toHaveBeenCalled();
  });
  it('dry-run defaults to zero writes, authoring or git operations', async () => {
    const { io } = fixture();
    const result = await runWeekly({}, io);
    expect(result.status).toBe('dry-run');
    for (const name of ['recoverPending', 'writeBrief', 'writeTriage', 'author', 'stage', 'commit', 'push']) {
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
  it.each(['checkCollisions', 'writeBrief', 'author', 'validate', 'compile', 'tests', 'audit', 'normalize', 'stage', 'detectChanges'])
   ('%s failure prevents commit and restores triage with an empty job index', async step => {
      const { io, original } = fixture();
      io[step].mockImplementation(() => { throw new Error('fixture failure'); });
      await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('fixture failure');
      expect(io.commit).not.toHaveBeenCalled();
      expect(io.push).not.toHaveBeenCalled();
      expect(io.unstage).toHaveBeenCalledWith(publicationPaths('1.1', '2026-09-18'));
      expect(io.writeTriage).toHaveBeenLastCalledWith(original);
    });
  it('keeps and reports the local commit after push failure', async () => {
    const { io } = fixture();
    io.push.mockImplementation(() => { throw new Error('offline'); });
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('local-commit-hash');
    expect(io.commit).toHaveBeenCalledOnce();
    expect(io.unstage).not.toHaveBeenCalled();
    expect(io.writeTriage).toHaveBeenCalledOnce();
  });
  it('push-only recovers without fetching evidence or authoring', async () => {
    const { io } = fixture();
    await runWeekly({ mode: 'push-only' }, io);
    expect(io.recoverPending).toHaveBeenCalledOnce();
    expect(io.fetchSections).not.toHaveBeenCalled();
    expect(io.author).not.toHaveBeenCalled();
  });
  it('pending recovery failure prevents selecting a second unpublished sheet', async () => {
    const { io } = fixture();
    io.recoverPending.mockImplementation(() => { throw new Error('pending'); });
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow('pending');
    expect(io.fetchSections).not.toHaveBeenCalled();
  });
});

describe('weekly recurrence observations and recovery', () => {
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
    const io = createRuntime(process.cwd());
    const triage = { entries: { 'mean-resistant': { sheet: 'already-triaged' } } };
    io.backfill(triage);
    expect(Object.keys(triage.entries)).toHaveLength(5);
    expect(triage.entries['mean-resistant'].sheet).toBe('already-triaged');
    expect(triage.entries['counts-vs-percents']).toMatchObject({ sheetTitle: 'Screen Time, Two Deletions', triagedAt: '2026-09-12' });
  });
  it('fetches and rebases pending weekly commits before approving and pushing', () => {
    const calls = [];
    const command = (program, args) => {
      calls.push([program, ...args].join(' '));
      if (args[0] === 'branch') return 'master';
      if (args[0] === 'log') return 'pending-hash\tWeekly DOK sheet 2026-09-18: Title';
      if (args[0] === 'rev-list') return '1';
      return '';
    };
    const io = createRuntime(process.cwd(), { command,
      approvePush: () => calls.push('approve'), push: () => calls.push('push') });
    io.recoverPending();
    expect(calls.slice(0, 2)).toEqual(['git branch --show-current', 'git fetch origin master']);
    expect(calls.slice(-3)).toEqual(['git rebase origin/master', 'approve', 'push']);
  });
  it('aborts a conflicted rebase and reports retained hashes without approving or pushing', () => {
    const calls = [];
    const command = (program, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'branch') return 'master';
      if (args[0] === 'log') return 'pending-hash\tWeekly DOK sheet 2026-09-18: Title';
      if (args[0] === 'rev-list') return '1';
      if (args.join(' ') === 'rebase origin/master') throw new Error('conflict');
      if (args[0] === 'rev-parse') return 'pending-hash';
      return '';
    };
    const log = vi.fn();
    const approvePush = vi.fn();
    const io = createRuntime(process.cwd(), { command, log, approvePush });
    expect(() => io.recoverPending()).toThrow('no new sheet selected');
    expect(calls).toContain('rebase --abort');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('pending-hash'));
    expect(approvePush).not.toHaveBeenCalled();
  });
  it('refuses push-only recovery on another branch before any network or mutation', () => {
    const command = vi.fn(() => 'feature');
    const io = createRuntime(process.cwd(), { command });
    expect(() => io.recoverPending()).toThrow('requires master');
    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith('git', ['branch', '--show-current'], undefined);
  });
});
