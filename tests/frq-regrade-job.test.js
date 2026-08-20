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
  classifyUngradedFrqRows,
  loadRubricBundle,
  MINIMUM_ROW_AGE_MS,
  runRegradeJob,
  selectUngradedFrqRows,
  verdictToScore,
} from '../tools/regrade-ungraded-frqs.mjs';
import { buildServerReflectionPrompt } from '../roster-server/frq-prompt.js';

const ROOT = resolve(import.meta.dirname, '..');
const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const REGISTRY = JSON.parse(readFileSync(
  resolve(ROOT, 'roster-server/data/frq-rubrics.SY2627.json'),
  'utf8',
));

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

function eligibleRecord(overrides = {}) {
  return {
    source: 'frq',
    itemId: 'WS-U1L2-reflect1',
    score: null,
    response: 'This old response is long enough to send to the grader.',
    recorded_at: '2026-08-19T11:30:00.000Z',
    ...overrides,
  };
}

function runApplyJob(fetchMock, options = {}) {
  return runRegradeJob({
    config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
    registry: options.registry || REGISTRY,
    railwayServerUrl: 'https://grader.test',
    apply: true,
    fetchImpl: fetchMock,
    now: NOW,
    rootDir: ROOT,
    rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    onEvent: options.onEvent,
  });
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
    expect(buildPrompt(REGISTRY, entry.prefix, 'reflect2', answer))
      .toBe(window.buildReflectionPromptU1L2('reflect2', answer));
  });

  it('loads the committed bundle without evaluating page prompt code', () => {
    const loaded = loadRubricBundle(ROOT);
    expect(loaded.registry).toEqual(REGISTRY);
    expect(loaded.railwayServerUrl).toBe(
      'https://curriculumrender-production.up.railway.app',
    );

    const jobSource = readFileSync(resolve(ROOT, 'tools/regrade-ungraded-frqs.mjs'), 'utf8');
    expect(jobSource).not.toContain('evaluatePromptsSource');
    expect(jobSource).not.toContain('loadPromptWindow');
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
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {}, reflect2: {} },
        },
      },
    };
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

    const selected = selectUngradedFrqRows(snapshotWith(records), registry, { now: NOW });
    expect(selected.map((row) => row.itemId)).toEqual([
      'WS-U1L2-reflect1',
      'WS-U1L2-reflect2',
    ]);
  });

  it('requires a finite timestamp and honors the exact ten-minute boundary', () => {
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {} },
        },
      },
    };
    const exactlyTenMinutes = new Date(NOW - MINIMUM_ROW_AGE_MS).toISOString();
    const justUnderTenMinutes = new Date(NOW - MINIMUM_ROW_AGE_MS + 1).toISOString();
    const classified = classifyUngradedFrqRows(snapshotWith([
      eligibleRecord({ recorded_at: undefined }),
      eligibleRecord({ recorded_at: 'not-a-timestamp' }),
      eligibleRecord({ recorded_at: exactlyTenMinutes }),
      eligibleRecord({ recorded_at: justUnderTenMinutes }),
    ]), registry, { now: NOW });

    expect(classified.candidates.map((row) => row.record.recorded_at)).toEqual([
      exactlyTenMinutes,
    ]);
    expect(classified.invalidTimestamps).toHaveLength(2);
    expect(classified.unknownItems).toHaveLength(0);
  });

  it('classifies extra-hyphen and page-only item IDs as unknown without response text', () => {
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {} },
        },
      },
    };
    const classified = classifyUngradedFrqRows(snapshotWith([
      eligibleRecord({ itemId: 'WS-U4L1-2-Q1' }),
      eligibleRecord({ itemId: 'WS-U1L2-reflectNew' }),
    ]), registry, { now: NOW });

    expect(classified.candidates).toHaveLength(0);
    expect(classified.unknownItems.map((row) => row.itemId)).toEqual([
      'WS-U4L1-2-Q1',
      'WS-U1L2-reflectNew',
    ]);
    expect(classified.unknownItems.every((row) => !Object.hasOwn(row, 'response'))).toBe(true);
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
    const entry = REGISTRY.worksheets['WS-U1L2'];
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
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
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
    expect(JSON.parse(graderOptions.body).prompt).toBe(
      buildServerReflectionPrompt(REGISTRY, 'WS-U1L2', 'reflect2', studentAnswer),
    );
    expect(JSON.parse(graderOptions.body).scenario.lessonContext).toEqual(entry.lessonContext);

    const [rosterUrl, rosterOptions] = fetchMock.mock.calls[2];
    expect(rosterUrl).toBe('https://roster.test/ledger/frq-regrade');
    expect(rosterOptions.headers['x-teacher-secret']).toBe('teacher-secret');
    expect(JSON.parse(rosterOptions.body)).toEqual({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      score: 1,
      provenance: 'ai-batch',
    });
    expect(result.exitCode).toBe(0);
  });

  it('makes only the snapshot call in default dry-run mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, snapshotWith([])));
    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
      fetchImpl: fetchMock,
      now: NOW,
    });
    expect(result.summary.mode).toBe('dry-run');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a non-zero exit code when the grader returns 5xx', async () => {
    const long = 'This old response is long enough to send to the grader.';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([{
        source: 'frq', itemId: 'WS-U1L2-reflect1', score: null,
        response: long, recorded_at: '2026-08-19T11:30:00.000Z',
      }])))
      .mockResolvedValueOnce(response(503, { error: 'unavailable' }));

    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
      apply: true,
      fetchImpl: fetchMock,
      now: NOW,
      rootDir: ROOT,
      rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    });
    expect(result.summary).toMatchObject({ failed: 1, grader5xx: true });
    expect(result.exitCode).toBe(1);
  });

  it('returns a non-zero exit code when the grader returns 4xx', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(400, { error: 'bad request' }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary).toMatchObject({ failed: 1, grader5xx: false });
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['an unusable verdict', response(200, { score: 'unknown' })],
    ['an unparseable verdict', {
      status: 200,
      ok: true,
      async json() { throw new Error('invalid JSON'); },
    }],
  ])('returns a non-zero exit code for %s', async (_name, graderResponse) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(graderResponse);

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('returns a non-zero exit code when prompt construction throws', async () => {
    const registry = structuredClone(REGISTRY);
    const item = registry.worksheets['WS-U1L2'].items.reflect1;
    const promptBeforeAnswer = item.promptBeforeAnswer;
    let reads = 0;
    Object.defineProperty(item, 'promptBeforeAnswer', {
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 1) return promptBeforeAnswer;
        throw new Error('synthetic prompt build failure');
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])));

    const result = await runApplyJob(fetchMock, { registry });
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])('returns a non-zero exit code when roster apply returns HTTP %i', async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'E' }))
      .mockResolvedValueOnce(response(status, { error: 'apply failed' }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('returns a non-zero exit code for a malformed apply response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'E' }))
      .mockResolvedValueOnce(response(200, { ok: true }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('reports an unknown item without grading it and returns a non-zero exit code', async () => {
    const itemId = 'WS-U4L1-2-Q1';
    const events = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord({ itemId })])));

    const result = await runApplyJob(fetchMock, { onEvent: (event) => events.push(event) });
    expect(result.summary).toMatchObject({ found: 0, failed: 0, unknownItems: 1 });
    expect(result.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{
      type: 'unknown-item',
      username: 'amy',
      itemId,
      reason: 'itemId is not present in the FRQ rubric bundle',
    }]);
    expect(events[0]).not.toHaveProperty('response');
  });

  it('loudly quarantines malformed timestamps and returns a non-zero exit code', async () => {
    const events = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, snapshotWith([
      eligibleRecord({ recorded_at: undefined }),
      eligibleRecord({ recorded_at: 'invalid' }),
    ])));

    const result = await runApplyJob(fetchMock, { onEvent: (event) => events.push(event) });
    expect(result.summary).toMatchObject({
      found: 0,
      failed: 0,
      unknownItems: 0,
      invalidTimestamps: 2,
    });
    expect(result.exitCode).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      'invalid-timestamp',
      'invalid-timestamp',
    ]);
    expect(events.every((event) => !Object.hasOwn(event, 'response'))).toBe(true);
  });
});

describe('config sources (GitHub Actions hourly sweep)', () => {
  it('env APSTATS_ROSTER_URL / APSTATS_TEACHER_KEY wins over the config file', async () => {
    const { loadConfig } = await import('../tools/regrade-ungraded-frqs.mjs');
    const config = loadConfig('/nonexistent/config.json', {
      APSTATS_ROSTER_URL: 'https://roster.example',
      APSTATS_TEACHER_KEY: 'k',
    });
    expect(config).toEqual({ rosterUrl: 'https://roster.example', teacherKey: 'k' });
  });
  it('falls back to the file when the env pair is incomplete', async () => {
    const { loadConfig } = await import('../tools/regrade-ungraded-frqs.mjs');
    expect(() => loadConfig('/nonexistent/config.json', { APSTATS_ROSTER_URL: 'x' })).toThrow();
  });
  it('the workflow is hourly, gated on the secret, and calls the job with --apply', () => {
    const yml = readFileSync(resolve(ROOT, '.github/workflows/frq-regrade.yml'), 'utf8');
    expect(yml).toMatch(/cron: '37 \* \* \* \*'/);
    expect(yml).toMatch(/APSTATS_TEACHER_KEY: \$\{\{ secrets\.APSTATS_TEACHER_KEY \}\}/);
    expect(yml).toMatch(/if \[ -z "\$APSTATS_TEACHER_KEY" \]; then/);
    expect(yml).toMatch(/node tools\/regrade-ungraded-frqs\.mjs --apply/);
    expect(yml).toMatch(/concurrency:\s*\n\s*group: frq-regrade/);
  });
});
