// @vitest-environment node
// Tests of scripts/nightly-brief.mjs against a temp repo root. Never pulls (pull:false), never touches
// the real roster-local. Fixture text is invented.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cedLabel } from '../lib/ced-label.mjs';
import { spawnSync } from 'node:child_process';
import {
  cli, exitCodeOf, importServerStates, itemsOn, jobStateOf, nextMeeting, owedItems, parseArgs, readJobs, resolveToday, run,
  todayInNewYork,
} from '../scripts/nightly-brief.mjs';
import { applyServerStates, emptyLedger, mergeSummaries, splitByAge } from '../scripts/lib/promise-ledger.mjs';

const TODAY = '2026-11-18'; // a Wednesday
const roots = [];

const SCHEDULE = {
  calendar: {
    meetingDays: { B: [1, 2, 4, 5], E: [1, 3, 5] },
    breaks: [{ from: '2026-11-19', to: '2026-11-20' }],
    events: { B: [{ id: 'B-Work', kind: 'work', title: 'Work Day', date: '2026-11-25' }], E: [] },
    breakDays: { B: [], E: [] },
    workDays: { B: [], E: [] },
  },
  lessons: {
    '2.5': { unit: 2, topicKey: '2.5', worksheetKey: '5', periods: { B: '2026-11-23', E: '2026-11-23' } },
    '2.6': { unit: 2, topicKey: '2.6', worksheetKey: '6', periods: { B: '2026-11-09', E: '2026-11-09' } },
  },
  progressChecks: {
    2: { title: 'Unit 2 Progress Check', periods: { B: '2026-11-30', E: '2026-12-01' }, adminDay2: { B: '2026-12-01', E: '2026-12-02' } },
  },
  posters: {
    2: { title: 'Unit 2 Poster', periods: { B: '2026-11-23', E: '2026-11-23' }, days: { B: ['2026-11-23', '2026-11-24'], E: ['2026-11-23'] } },
  },
};

function summary(date, section, fields = {}) {
  return { date, section, course: 'apstats', file: `${date}-${section}.md`, landed: [], studentQuestions: [], promises: [], nextPrep: [], ...fields };
}

const B_SUMMARIES = [
  summary('2026-11-12', 'B', { promises: ['Bring the spare calculators'], landed: ['Sampling bias recap'] }),
  summary('2026-11-16', 'B', { promises: ['Post the review key'] }),
  summary('2026-11-17', 'B', { landed: ['Matched pairs'], studentQuestions: ['Why pair the data?'], nextPrep: ['Copy the exit tickets'] }),
];

function makeRoot({ summaries, jobs } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nightly-brief-'));
  roots.push(root);
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'lesson-schedule.json'), JSON.stringify(SCHEDULE));
  if (summaries) {
    mkdirSync(join(root, 'roster-local', 'class-summaries'), { recursive: true });
    writeFileSync(join(root, 'roster-local', 'class-summaries', 'index.json'), JSON.stringify(summaries));
  }
  if (jobs) {
    mkdirSync(join(root, 'roster-local', 'job-status'), { recursive: true });
    for (const [name, text] of Object.entries(jobs)) {
      writeFileSync(join(root, 'roster-local', 'job-status', name), typeof text === 'string' ? text : JSON.stringify(text));
    }
  }
  return root;
}

function briefOf(result, section) {
  return result.briefs.find(b => b.section === section);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('schedule helpers', () => {
  it('next meeting skips a break range and non-meeting weekdays', () => {
    expect(nextMeeting(SCHEDULE, 'B', TODAY)).toBe('2026-11-23'); // Thu/Fri are on break, then the weekend
    expect(nextMeeting(SCHEDULE, 'E', '2026-11-16')).toBe('2026-11-18'); // E skips Tuesday
    expect(nextMeeting(SCHEDULE, 'B', '2026-11-23')).toBe('2026-11-24'); // strictly after today
  });

  // A section-only Break Day still meets (the E class met and was recorded on its 11/13 Break Day).
  it('a section Break Day is still a meeting and shows its Break Day item', () => {
    const schedule = structuredClone(SCHEDULE);
    schedule.calendar.breakDays.E = ['2026-11-23'];
    schedule.calendar.events.E = [{ id: 'E-Break', kind: 'break', title: 'Break Day', date: '2026-11-23' }];
    expect(nextMeeting(schedule, 'E', '2026-11-20')).toBe('2026-11-23');
    expect(itemsOn(schedule, 'E', '2026-11-23')).toContain('Break Day (break)');
  });

  it('itemsOn lists lessons with the CED label, poster days and events', () => {
    const items = itemsOn(SCHEDULE, 'B', '2026-11-23');
    expect(items).toContain(cedLabel('2.5').text);
    expect(items).toContain('Unit 2 Poster, day 1 of 2');
    expect(itemsOn(SCHEDULE, 'B', '2026-11-25')).toEqual(['Work Day (work)']);
    expect(itemsOn(SCHEDULE, 'B', '2026-12-01')).toEqual(['Unit 2 Progress Check (day 2)']);
    expect(itemsOn(SCHEDULE, 'B', '2026-12-10')).toEqual([]);
  });

  it('owedItems finds Progress Check days, poster days and zero dates inside the window', () => {
    const owed = owedItems(SCHEDULE, 'B', TODAY).join('\n');
    expect(owed).toContain('Unit 2 Progress Check (day 1): 2026-11-30');
    expect(owed).toContain('Unit 2 Poster, day 2 of 2: 2026-11-24');
    expect(owed).toContain(`${cedLabel('2.6').text}: zero date 2026-11-22`);
  });

  it('parseArgs rejects unknown arguments and bad sections', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
    expect(() => parseArgs(['--section', 'C'])).toThrow(/B or E/);
    expect(parseArgs(['--no-pull', '--section', 'E']).section).toBe('E');
  });
});

describe('briefs', () => {
  it('carries a promise from two recordings ago and lands the file under roster-local/brief', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    const result = run({ root, today: TODAY, pull: false });
    const b = briefOf(result, 'B');

    expect(b.file).toBe(join(root, 'roster-local', 'brief', '2026-11-23-B.md'));
    expect(existsSync(b.file)).toBe(true);
    expect(b.markdown).toContain('# AP Statistics B · Monday Nov 23 (next meeting 2026-11-23)');
    expect(b.markdown).toContain('## Open promises (2)');
    expect(b.markdown).toContain('Bring the spare calculators');
    expect(b.markdown).toContain('Post the review key');
    expect(b.markdown).toContain('Recording of 2026-11-17.');
    expect(b.markdown).toContain('- Matched pairs');
    expect(b.markdown).toContain('- Copy the exit tickets');
    expect(b.markdown).toContain(cedLabel('2.5').text);
    expect(b.markdown).not.toContain('Pull failed');

    const latest = JSON.parse(readFileSync(join(root, 'roster-local', 'brief', 'latest.json'), 'utf8'));
    expect(latest.pull.ok).toBe(true);
    const entry = latest.sections.find(s => s.section === 'B');
    expect(entry).toMatchObject({ nextMeeting: '2026-11-23', openPromises: 2, lastRecording: '2026-11-17' });
  });

  it('--kept removes the promise from the next brief', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    run({ root, today: TODAY, pull: false });
    const ledger = JSON.parse(readFileSync(join(root, 'roster-local', 'brief', 'promises.json'), 'utf8'));
    const id = ledger.promises.find(p => p.text === 'Bring the spare calculators').id;

    const closed = cli(['--root', root, '--today', TODAY, '--kept', id]);
    expect(closed.code).toBe(0);
    expect(closed.out).toContain(`${id}: kept`);

    const b = briefOf(run({ root, today: TODAY, pull: false }), 'B');
    expect(b.markdown).not.toContain('Bring the spare calculators');
    expect(b.markdown).toContain('## Open promises (1)');
  });

  it('--kept with an unknown id throws', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    expect(() => cli(['--root', root, '--kept', 'no-such-id'])).toThrow(/no promise with id/);
  });

  it('--dropped-before and --list work without a pull', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    run({ root, today: TODAY, pull: false });
    expect(cli(['--root', root, '--today', TODAY, '--dropped-before', '2026-11-14', '--section', 'B']).out).toContain('dropped 1');
    const listed = cli(['--root', root, '--today', TODAY, '--list', '--section', 'B']).out;
    expect(listed).toContain('Post the review key');
    expect(listed).not.toContain('Bring the spare calculators');
  });

  it('missing class-summaries folder still writes briefs and an empty ledger', () => {
    const root = makeRoot();
    const result = run({ root, today: TODAY, pull: false });
    expect(result.briefs).toHaveLength(2);
    expect(briefOf(result, 'E').markdown).toContain('No recordings yet.');
    expect(briefOf(result, 'B').markdown).toContain('- None open.');
    const ledger = JSON.parse(readFileSync(join(root, 'roster-local', 'brief', 'promises.json'), 'utf8'));
    expect(ledger.promises).toEqual([]);
  });

  it('a section whose last meeting has no recording says so', () => {
    const root = makeRoot({ summaries: [summary('2026-11-13', 'E', { landed: ['Bias types'] })] });
    const e = briefOf(run({ root, today: TODAY, pull: false }), 'E');
    expect(e.markdown).toContain('No recording for the last class (2026-11-18); newest recording is 2026-11-13.');
    expect(e.markdown).toContain('- Bias types');
  });

  it('says so at the top when the pull failed', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    // The temp root has no a2 checkout beside it, so a real pull attempt fails without touching the network.
    const result = run({ root, today: TODAY, pull: true });
    expect(result.pull.ok).toBe(false);
    expect(briefOf(result, 'B').markdown).toContain('**Pull failed (');
    expect(result.exitCode).toBe(1);
  });
});

describe('jobs line', () => {
  it('is omitted when there is no job-status folder', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    expect(briefOf(run({ root, today: TODAY, pull: false }), 'B').markdown).not.toContain('**Jobs:**');
  });

  it('lists failed jobs and long nothing streaks only, skipping bad JSON', () => {
    const root = makeRoot({
      summaries: B_SUMMARIES,
      jobs: {
        'a.json': { job: 'grade-sync', ranAt: '2026-11-18T07:00', state: 'failed', reason: 'rig hidden', streak: 1 },
        'b.json': { job: 'poster-sweep', ranAt: '2026-11-18T07:00', state: 'nothing', reason: '', streak: 5 },
        'c.json': { job: 'dok-sheet', ranAt: '2026-11-18T07:00', state: 'nothing', reason: '', streak: 2 },
        'd.json': { job: 'fine-job', ranAt: '2026-11-18T07:00', state: 'ok', reason: '', streak: 0 },
        'e.json': '{ not json',
      },
    });
    expect(readJobs(root)).toEqual([
      'grade-sync FAILED 2026-11-18T07:00: rig hidden',
      'poster-sweep: nothing to do 5 runs in a row',
    ]);
    const markdown = briefOf(run({ root, today: TODAY, pull: false }), 'B').markdown;
    expect(markdown).toContain('**Jobs:** grade-sync FAILED 2026-11-18T07:00: rig hidden; poster-sweep: nothing to do 5 runs in a row');
    expect(markdown).not.toContain('dok-sheet');
    expect(markdown).not.toContain('fine-job');
  });
});

describe('14-day window', () => {
  it('lists recent promises in full and folds older ones into one line', () => {
    const root = makeRoot({
      summaries: [
        summary('2026-10-20', 'B', { promises: ['Return the old quizzes'] }),
        summary('2026-11-02', 'B', { promises: ['Bring graph paper'] }),
        summary('2026-11-16', 'B', { promises: ['Post the review key'] }),
      ],
    });
    const b = briefOf(run({ root, today: TODAY, pull: false }), 'B');
    expect(b.markdown).toContain('## Open promises (3)');
    expect(b.markdown).toContain('Post the review key');
    expect(b.markdown).not.toContain('Return the old quizzes');
    expect(b.markdown).not.toContain('Bring graph paper');
    expect(b.markdown).toContain('- 2 older open promises (last said 14+ days ago); list with `node scripts/nightly-brief.mjs --list --section B`');
    const latest = JSON.parse(readFileSync(join(root, 'roster-local', 'brief', 'latest.json'), 'utf8'));
    expect(latest.sections.find(s => s.section === 'B')).toMatchObject({ openPromises: 3, recentPromises: 1 });
    expect(cli(['--root', root, '--today', TODAY, '--list', '--section', 'B']).out).toContain('Return the old quizzes');
  });

  it('says so when every open promise is older than 14 days', () => {
    const root = makeRoot({ summaries: [summary('2026-10-20', 'B', { promises: ['Return the old quizzes'] })] });
    const b = briefOf(run({ root, today: TODAY, pull: false }), 'B');
    expect(b.markdown).toContain('- None said in the last 14 days.');
    expect(b.markdown).toContain('- 1 older open promise (last said');
  });

  it('a promise first said long ago but repeated lately counts as recent', () => {
    const open = [{ firstDate: '2026-10-29', dates: ['2026-10-29', '2026-11-16'] }];
    const { recent, older } = splitByAge(open, TODAY);
    expect(recent).toHaveLength(1);
    expect(older).toHaveLength(0);
  });

  it('a repeated promise shows in full in the brief', () => {
    const root = makeRoot({
      summaries: [
        summary('2026-10-29', 'B', { promises: ['Return the old quizzes'] }),
        summary('2026-11-16', 'B', { promises: ['return the old quizzes.'] }),
      ],
    });
    const b = briefOf(run({ root, today: TODAY, pull: false }), 'B');
    expect(b.markdown).toContain('Return the old quizzes');
    expect(b.markdown).not.toContain('older open promise');
  });

  it('the boundary is 14 calendar days', () => {
    const open = [{ firstDate: '2026-11-04' }, { firstDate: '2026-11-05' }];
    const { recent, older } = splitByAge(open, TODAY);
    expect(older.map(p => p.firstDate)).toEqual(['2026-11-04']);
    expect(recent.map(p => p.firstDate)).toEqual(['2026-11-05']);
  });
});

describe('job status', () => {
  const statusOf = root => JSON.parse(readFileSync(join(root, 'roster-local', 'job-status', 'nightly-brief.json'), 'utf8'));

  it('a pulling run whose pull fails writes state failed, and the streak counts repeats', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    // No a2 checkout beside the temp root: the pull fails without touching the network.
    cli(['--root', root, '--today', TODAY]);
    const first = statusOf(root);
    expect(Object.keys(first).sort()).toEqual(['job', 'ranAt', 'reason', 'state', 'streak']);
    expect(first).toMatchObject({ job: 'nightly-brief', state: 'failed', streak: 1 });
    expect(first.reason).toMatch(/^pull failed/);
    cli(['--root', root, '--today', TODAY]);
    expect(statusOf(root).streak).toBe(2);
  });

  it('a --no-pull run (by hand) does not write job status', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    cli(['--root', root, '--today', TODAY, '--no-pull']);
    expect(existsSync(join(root, 'roster-local', 'job-status', 'nightly-brief.json'))).toBe(false);
  });
});

describe('server state import', () => {
  it('fails soft and changes nothing when the a2 checkout is missing', async () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    run({ root, today: TODAY, pull: false });
    const before = readFileSync(join(root, 'roster-local', 'brief', 'promises.json'), 'utf8');
    const out = await importServerStates({ root, today: TODAY });
    expect(out).toMatch(/^import skipped, nothing changed/);
    expect(readFileSync(join(root, 'roster-local', 'brief', 'promises.json'), 'utf8')).toBe(before);
  });

  it('closes matching open promises once (done -> kept, cancelled -> dropped) and ignores prep and open rows', () => {
    const ledger = mergeSummaries(emptyLedger(), B_SUMMARIES, { course: 'apstats', sections: ['B', 'E'] });
    const rows = [
      { kind: 'promise', status: 'done', section: 'B', text: 'bring the spare  calculators.' },
      { kind: 'promise', status: 'cancelled', section: 'B', text: 'Post the review key' },
      { kind: 'prep', status: 'cancelled', section: 'B', text: 'Copy the exit tickets' },
      { kind: 'promise', status: 'open', section: 'E', text: 'Post the review key' },
    ];
    expect(applyServerStates(ledger, rows, TODAY)).toBe(2);
    const byText = Object.fromEntries(ledger.promises.map(p => [p.text, p]));
    expect(byText['Bring the spare calculators']).toMatchObject({ state: 'kept', importedFrom: 'server:done' });
    expect(byText['Post the review key']).toMatchObject({ state: 'dropped', importedFrom: 'server:cancelled' });
    byText['Post the review key'].state = 'open'; // the teacher reopened it locally
    expect(applyServerStates(ledger, rows, TODAY)).toBe(0);
    expect(byText['Post the review key'].state).toBe('open');
  });
});

describe('exit code', () => {
  const okResult = { pull: { ok: true, reason: '' }, pulled: true, summariesIndexFound: true, a2Failed: false, briefs: [{ nextMeeting: '2026-11-23' }] };

  it('is 0 when every step worked', () => {
    expect(exitCodeOf(okResult)).toBe(0);
  });

  it('is 1 when the pull failed, and the recorded state is failed too', () => {
    const result = { ...okResult, pull: { ok: false, reason: 'no checkout' } };
    expect(exitCodeOf(result)).toBe(1);
    expect(jobStateOf(result).state).toBe('failed');
  });

  it('is 1 when the a2 step failed', () => {
    const result = { ...okResult, a2Failed: true };
    expect(exitCodeOf(result)).toBe(1);
    expect(jobStateOf(result).state).toBe('failed');
  });

  it('a pulling run that cannot pull exits 1 through cli', () => {
    const root = makeRoot({ summaries: B_SUMMARIES }); // no a2 checkout beside the temp root
    expect(cli(['--root', root, '--today', TODAY]).code).toBe(1);
  });

  it('a hand run with --no-pull and no failure exits 0', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    expect(cli(['--root', root, '--today', TODAY, '--no-pull']).code).toBe(0);
  });
});

describe('summary index after a pull', () => {
  it('a missing index is not recorded as ok', () => {
    const result = { pull: { ok: true, reason: '' }, pulled: true, summariesIndexFound: false, a2Failed: false, briefs: [{ nextMeeting: '2026-11-23' }] };
    expect(jobStateOf(result)).toEqual({ state: 'failed', reason: 'summary index missing after the pull' });
    expect(exitCodeOf(result)).toBe(1);
  });

  it('run reports whether the index was found', () => {
    expect(run({ root: makeRoot(), today: TODAY, pull: false }).summariesIndexFound).toBe(false);
    expect(run({ root: makeRoot({ summaries: B_SUMMARIES }), today: TODAY, pull: false }).summariesIndexFound).toBe(true);
  });

  it('a --no-pull run does not need the index to be ok', () => {
    const result = run({ root: makeRoot(), today: TODAY, pull: false });
    expect(jobStateOf(result).state).toBe('ok');
  });
});

describe('which day counts as today', () => {
  // November is EST (UTC-5): 07:00Z is 02:00, 10:00Z is 05:00 New York time.
  it('a run before 05:00 counts as the previous day', () => {
    expect(todayInNewYork(new Date('2026-11-18T07:00:00Z'))).toBe('2026-11-17');
    expect(todayInNewYork(new Date('2026-11-18T09:59:00Z'))).toBe('2026-11-17');
    expect(todayInNewYork(new Date('2026-11-18T10:00:00Z'))).toBe('2026-11-18');
    expect(todayInNewYork(new Date('2026-11-18T23:30:00Z'))).toBe('2026-11-18');
  });

  it("a 02:00 run still briefs that morning's class", () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    const delayed = new Date('2026-11-18T07:00:00Z'); // Wednesday 02:00; E meets Wednesday
    const out = cli(['--root', root, '--no-pull', '--section', 'E'], delayed).out;
    expect(out).toContain('(next meeting 2026-11-18)');
    expect(existsSync(join(root, 'roster-local', 'brief', '2026-11-18-E.md'))).toBe(true);
  });

  it('the same run after 05:00 briefs the following class', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    const out = cli(['--root', root, '--no-pull', '--section', 'E'], new Date('2026-11-18T15:00:00Z')).out;
    expect(out).toContain('(next meeting 2026-11-23)'); // Fri 11-20 is on break
  });

  it('--for-date picks that class, whatever the clock says', () => {
    const root = makeRoot({ summaries: B_SUMMARIES });
    expect(resolveToday({ forDate: '2026-11-18' })).toBe('2026-11-17');
    const out = cli(['--root', root, '--no-pull', '--section', 'E', '--for-date', '2026-11-18'], new Date('2026-11-18T15:00:00Z')).out;
    expect(out).toContain('(next meeting 2026-11-18)');
  });

  it('--for-date rejects a bad value with exit code 2', () => {
    expect(() => parseArgs(['--for-date', '11/18/2026'])).toThrow(/--for-date must be YYYY-MM-DD/);
    const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'nightly-brief.mjs');
    const result = spawnSync(process.execPath, [script, '--for-date', 'tomorrow', '--no-pull'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--for-date must be YYYY-MM-DD');
  });
});
