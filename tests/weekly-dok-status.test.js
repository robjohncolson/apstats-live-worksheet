import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWeekly, jobOutcome, nextStreak, writeJobStatus, reportJobResult, STUDENT_FLOOR, authorBackend, authorCommand } from '../scripts/weekly-dok.mjs';

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

describe('jobOutcome', () => {
  it('maps each result', () => {
    expect(jobOutcome({ status: 'published' })).toEqual({ state: 'ok', code: 'ok', reason: 'published a sheet' });
    expect(jobOutcome({ status: 'below floor' })).toEqual({ state: 'nothing', code: 'nothing-below-floor',
      reason: `no misconception label reached ${STUDENT_FLOOR} students` });
    expect(jobOutcome({ status: 'already ran' })).toEqual({ state: 'nothing', code: 'nothing-already-ran', reason: 'already ran this week' });
  });
  it('maps an error and trims the reason to 300 chars', () => {
    const outcome = jobOutcome(null, new Error('x'.repeat(500)));
    expect(outcome.state).toBe('failed');
    expect(outcome.code).toBe('failed');
    expect(outcome.reason).toHaveLength(300);
  });
});

describe('nextStreak', () => {
  it('counts repeats and resets on change', () => {
    const prev = { state: 'nothing', reason: 'a', streak: 2 };
    expect(nextStreak(prev, 'nothing', 'a')).toBe(3);
    expect(nextStreak(prev, 'nothing', 'b')).toBe(1);
    expect(nextStreak(prev, 'ok', 'a')).toBe(1);
    expect(nextStreak(null, 'ok', 'a')).toBe(1);
  });
});

describe('writeJobStatus', () => {
  let dir;
  let file;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-dok-status-'));
    file = path.join(dir, 'job-status', 'weeklyDok.json');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const job = { job: 'weeklyDok', state: 'nothing', reason: 'r' };

  it('writes exactly five keys, no BOM, no milliseconds', () => {
    const record = writeJobStatus(file, job, new Date('2026-11-20T02:00:05.678Z'));
    const bytes = fs.readFileSync(file);
    expect(bytes[0]).not.toBe(0xEF);
    const text = bytes.toString('utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(record);
    expect(Object.keys(record)).toEqual(['job', 'ranAt', 'state', 'reason', 'streak']);
    expect(record.ranAt).toBe('2026-11-20T02:00:05Z');
  });
  it('increments the streak on the same state and reason, resets on change', () => {
    expect(writeJobStatus(file, job).streak).toBe(1);
    expect(writeJobStatus(file, job).streak).toBe(2);
    expect(writeJobStatus(file, { ...job, reason: 'other' }).streak).toBe(1);
  });
  it('survives a garbage previous file', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    expect(writeJobStatus(file, job).streak).toBe(1);
  });
  it('does not throw when the target is a directory', () => {
    fs.mkdirSync(file, { recursive: true });
    expect(writeJobStatus(file, job)).toBeNull();
    expect(console.log).toHaveBeenCalledWith('job status not written');
  });
});

describe('reportJobResult', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('does not throw on an HTTP 400', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400 }));
    await reportJobResult({ code: 'ok', at: 'now' }, { secret: 's', fetchImpl });
    expect(console.log).toHaveBeenCalledWith('job-result report failed (HTTP 400)');
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ job: 'weeklyDok', code: 'ok', at: 'now' });
    expect(init.headers['x-teacher-secret']).toBe('s');
  });
  it('does not throw when fetch rejects, and skips without a secret', async () => {
    await reportJobResult({ code: 'ok', at: 'now' }, { secret: 's', fetchImpl: async () => { throw new Error('down'); } });
    const fetchImpl = vi.fn();
    await reportJobResult({ code: 'ok', at: 'now' }, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('job-result not reported: no teacher secret');
  });
});

describe('step naming', () => {
  it('prefixes the failing step and still restores triage', async () => {
    const { io, original } = fixture();
    io.author.mockImplementation(() => { throw new Error('node.exe failed (exit 1)'); });
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow(/^author: node\.exe failed \(exit 1\)$/);
    expect(io.writeTriage).toHaveBeenLastCalledWith(original);
    expect(io.unstage).toHaveBeenCalledOnce();
  });
  it('still retries once when push reports that origin moved', async () => {
    const { io } = fixture();
    const moved = Object.assign(new Error('git failed (exit 1)'), { originMoved: true });
    io.push.mockImplementationOnce(() => { throw moved; });
    io.head.mockResolvedValue('rebased-hash');
    const result = await runWeekly({ mode: 'apply' }, io);
    expect(result.commit).toBe('rebased-hash');
    expect(io.push).toHaveBeenCalledTimes(2);
    expect(io.rebase).toHaveBeenCalledOnce();
  });
});

describe('author backend (WEEKLY_DOK_AUTHOR)', () => {
  it('defaults to codex and rejects unknown values', () => {
    expect(authorBackend({})).toBe('codex');
    expect(authorBackend({ WEEKLY_DOK_AUTHOR: ' Grok ' })).toBe('grok');
    expect(() => authorBackend({ WEEKLY_DOK_AUTHOR: 'claude' })).toThrow(/Unknown WEEKLY_DOK_AUTHOR/);
  });
  it('none means no author command', () => {
    expect(authorCommand('none', { work: 'w' })).toBe(null);
  });
  it('grok runs single-turn from a prompt file, edits only, no web, no subagents', () => {
    const { program, args } = authorCommand('grok', { work: 'w', promptFile: 'p.md' });
    expect(program).toBe('grok');
    expect(args).toEqual(expect.arrayContaining(['--cwd', 'w', '--prompt-file', 'p.md', '--permission-mode', 'acceptEdits',
      '--disable-web-search', '--no-subagents']));
    expect(args).not.toContain('--always-approve');
  });
  it('codex keeps the old command', () => {
    const { args } = authorCommand('codex', { work: 'w', appData: 'A' });
    expect(args.slice(1, 5)).toEqual(['exec', '--approve-for-me', '-m', 'gpt-6-astra']);
  });
  it('an unavailable author fails the author step by name', async () => {
    const { io } = fixture();
    io.author.mockImplementationOnce(() => { throw new Error('author unavailable (WEEKLY_DOK_AUTHOR=none): no sheet was written'); });
    await expect(runWeekly({ mode: 'apply' }, io)).rejects.toThrow(/^author: author unavailable/);
  });
});
