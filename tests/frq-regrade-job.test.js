import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildManifest,
  deriveWorksheetEntry,
  evaluatePromptsSource,
  extractPromptsFile,
} from '../tools/frq-regrade-manifest.mjs';
import {
  buildGraderRequest,
  buildPrompt,
  buildRegradeRequest,
  runRegradeJob,
  selectUngradedFrqRows,
  verdictToScore,
} from '../tools/regrade-ungraded-frqs.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const NOW = Date.parse('2026-08-19T12:00:00.000Z');

function deriveRealWorksheet(filename) {
  const html = readFileSync(resolve(ROOT, filename), 'utf8');
  const promptsFile = extractPromptsFile(html, filename);
  const promptsSource = readFileSync(resolve(ROOT, promptsFile), 'utf8');
  return {
    entry: deriveWorksheetEntry({ filename, html, promptsSource }),
    promptsSource,
  };
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

function snapshotWith(records) {
  return {
    students: [{
      studentId: 'sid-1',
      username: 'amy',
      bundle: { records },
    }],
  };
}

describe('FRQ regrade manifest', () => {
  it.each([
    ['u1_lesson2_live.html', {
      prefix: 'WS-U1L2',
      builderName: 'buildReflectionPromptU1L2',
      contextName: 'LESSON_CONTEXT_U1L2',
      topic: 'AP Statistics - Topic 1.2: The Language of Variation: Variables',
      textareaIds: ['reflect1', 'reflect2', 'exitTicket'],
    }],
    ['u4_lesson3-4-5_live.html', {
      prefix: 'WS-U4L3-5',
      builderName: 'buildReflectionPromptU4L345',
      contextName: 'LESSON_CONTEXT_U4L345',
      topic: 'AP Statistics - Probability',
      textareaIds: ['reflect1', 'reflect2', 'reflect3', 'exitTicket'],
    }],
    ['u3_lesson6-7_live.html', {
      prefix: 'WS-U3L6-7',
      builderName: 'buildReflectionPrompt',
      contextName: 'LESSON_CONTEXT',
      topic: 'AP Statistics - Experimental Design',
      textareaIds: ['reflect53', 'reflect54a', 'reflect54b', 'reflect55', 'reflect56', 'exitTicket'],
    }],
  ])('derives %s from the real worksheet and its prompt module', (filename, expected) => {
    const { entry } = deriveRealWorksheet(filename);
    expect(entry).toMatchObject(expected);
  });

  it('builds the committed, sorted manifest and loads every builder in vm', () => {
    const built = buildManifest(ROOT);
    const committed = JSON.parse(readFileSync(resolve(ROOT, 'data/frq-regrade-manifest.json'), 'utf8'));
    expect(built).toEqual(committed);
    expect(built.worksheets).toHaveLength(69);
    expect(new Set(built.worksheets.map((entry) => entry.prefix)).size).toBe(69);

    for (const entry of built.worksheets) {
      const promptsPath = resolve(ROOT, entry.promptsFile);
      expect(existsSync(promptsPath), entry.promptsFile).toBe(true);
      const source = readFileSync(promptsPath, 'utf8');
      const { window } = evaluatePromptsSource(source, entry.promptsFile);
      expect(typeof window[entry.builderName], `${entry.promptsFile}:${entry.builderName}`).toBe('function');
    }
  });

  it('builds exactly the prompt exposed to the worksheet page', () => {
    const { entry, promptsSource } = deriveRealWorksheet('u1_lesson2_live.html');
    const { window } = evaluatePromptsSource(promptsSource, entry.promptsFile);
    const answer = 'Zip codes label locations instead of measuring a numerical quantity.';
    expect(buildPrompt(entry, 'reflect2', answer, window))
      .toBe(window.buildReflectionPromptU1L2('reflect2', answer));
  });
});

describe('pure regrade job decisions', () => {
  it('maps tolerant E/P/I verdicts, promotes complete P, and skips junk', () => {
    expect(verdictToScore('Essentially correct')).toBe(1);
    expect(verdictToScore(' partially correct ')).toBe(0.5);
    expect(verdictToScore('incorrect')).toBe(0);
    expect(verdictToScore({ score: 'P', missing: [] })).toBe(1);
    expect(verdictToScore({ score: 'P', missing: ['one idea'] })).toBe(0.5);
    expect(verdictToScore('maybe')).toBeNull();
    expect(verdictToScore(null)).toBeNull();
  });

  it('selects only old, long, null-score FRQs with an exact manifest itemId', () => {
    const worksheet = {
      filename: 'u1_lesson2_live.html',
      prefix: 'WS-U1L2',
      textareaIds: ['reflect1', 'reflect2'],
    };
    const manifest = { worksheets: [worksheet] };
    const old = '2026-08-19T11:30:00.000Z';
    const young = '2026-08-19T11:55:00.000Z';
    const long = 'This response is definitely at least twenty characters.';
    const records = [
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect2', response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: 0, response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: 'too short', recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: young },
      { source: 'frq', itemId: 'WS-U1L2-not-a-reflection', score: null, response: long, recorded_at: old },
      { source: 'worksheet', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: old },
    ];

    const selected = selectUngradedFrqRows(snapshotWith(records), manifest, { now: NOW });
    expect(selected.map((row) => row.itemId)).toEqual([
      'WS-U1L2-reflect1',
      'WS-U1L2-reflect2',
    ]);
  });

  it('builds the exact grader and roster request shapes', () => {
    const worksheet = {
      topic: 'AP Statistics - Variables',
      contextName: 'LESSON_CONTEXT_U1L2',
    };
    const graderBody = buildGraderRequest(
      worksheet,
      'reflect2',
      'student answer',
      'full prompt',
      { unit: 1 },
    );
    expect(graderBody).toEqual({
      scenario: {
        topic: 'AP Statistics - Variables',
        questionId: 'reflect2',
        lessonContext: { unit: 1 },
      },
      answers: { answer: 'student answer' },
      prompt: 'full prompt',
    });

    expect(buildRegradeRequest({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      attempt: 1,
    }, 0.5)).toEqual({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      score: 0.5,
      provenance: 'ai-batch',
    });
  });
});

describe('regrade job HTTP flow', () => {
  it('uses mocked snapshot, grader, and roster calls without network access', async () => {
    const { entry } = deriveRealWorksheet('u1_lesson2_live.html');
    const manifest = {
      railwayServerUrl: 'https://grader.test',
      worksheets: [entry],
    };
    const studentAnswer = 'The values are labels for locations, not measurements that should be averaged.';
    const snapshot = snapshotWith([{
      source: 'frq',
      itemId: 'WS-U1L2-reflect2',
      score: null,
      response: studentAnswer,
      attempt: 1,
      recorded_at: '2026-08-19T11:30:00.000Z',
    }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshot))
      .mockResolvedValueOnce(response(200, {
        score: 'P', feedback: 'Complete.', matched: ['labels'], missing: [],
      }))
      .mockResolvedValueOnce(response(200, { ok: true, applied: true, score: 1 }));
    const rateLimiter = { wait: vi.fn().mockResolvedValue(undefined) };

    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test/', teacherKey: 'teacher-secret' },
      manifest,
      apply: true,
      now: NOW,
      rootDir: ROOT,
      fetchImpl: fetchMock,
      rateLimiter,
    });

    expect(result.summary).toMatchObject({
      found: 1, graded: 1, applied: 1, floorHeld: 0, failed: 0, grader5xx: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://roster.test/admin/snapshot',
      { headers: { 'x-teacher-secret': 'teacher-secret' } },
    ]);

    const [graderUrl, graderOptions] = fetchMock.mock.calls[1];
    expect(graderUrl).toBe('https://grader.test/api/ai/grade');
    expect(JSON.parse(graderOptions.body)).toMatchObject({
      scenario: {
        topic: entry.topic,
        questionId: 'reflect2',
      },
      answers: { answer: studentAnswer },
    });

    const [rosterUrl, rosterOptions] = fetchMock.mock.calls[2];
    expect(rosterUrl).toBe('https://roster.test/ledger/frq-regrade');
    expect(rosterOptions.headers['x-teacher-secret']).toBe('teacher-secret');
    expect(JSON.parse(rosterOptions.body)).toEqual({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      score: 1,
      provenance: 'ai-batch',
    });
  });

  it('makes only the snapshot call in default dry-run mode', async () => {
    const { entry } = deriveRealWorksheet('u1_lesson2_live.html');
    const fetchMock = vi.fn().mockResolvedValue(response(200, snapshotWith([])));
    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      manifest: { railwayServerUrl: 'https://grader.test', worksheets: [entry] },
      fetchImpl: fetchMock,
      now: NOW,
    });
    expect(result.summary.mode).toBe('dry-run');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a non-zero exit code when the grader returns 5xx', async () => {
    const { entry } = deriveRealWorksheet('u1_lesson2_live.html');
    const long = 'This old response is long enough to send to the grader.';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([{
        source: 'frq', itemId: 'WS-U1L2-reflect1', score: null,
        response: long, recorded_at: '2026-08-19T11:30:00.000Z',
      }])))
      .mockResolvedValueOnce(response(503, { error: 'unavailable' }));

    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      manifest: { railwayServerUrl: 'https://grader.test', worksheets: [entry] },
      apply: true,
      fetchImpl: fetchMock,
      now: NOW,
      rootDir: ROOT,
      rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    });
    expect(result.summary).toMatchObject({ failed: 1, grader5xx: true });
    expect(result.exitCode).toBe(1);
  });
});
