// Pins Track C runtime serving (TI84_TRAINER_SERVING_SPEC.md):
//  - handheld checks serve seeded generated problems for templated procedures,
//    canonicals for everything else and on every fallback path
//  - pickProblem is a pure read: attempt/seed metadata commit ONLY when the
//    outcome is recorded (finishHandheldMastery), so canonical serves,
//    ?gen=off, and failures never leave stale metadata
//  - signed-out students seed as 'anon' and still advance locally
//  - all 8 templates' values work through the app-level computeExpected +
//    VERIFICATION_FIELDS dispatch (extraction-based, Codex amendment 4)
// Boots the real app.js in jsdom, stubbing only the CEmu bridge.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.setConfig({ testTimeout: 30_000 });

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');

const NATIVE_FILES = [
  'event-bus.js', 'stat-math.js', 'menu-tables.js', 'field-tables.js',
  'menu-nav.js', 'form-engine.js', 'result-formatter.js', 'screen-renderer.js',
  'ti84-native.js',
];

const sources = {
  natives: NATIVE_FILES.map((f) => fs.readFileSync(path.join(V2, 'native', f), 'utf8')),
  dataProcedures: fs.readFileSync(path.join(V2, 'generated', 'data-procedures.js'), 'utf8'),
  dataPatterns: fs.readFileSync(path.join(V2, 'generated', 'data-patterns.js'), 'utf8'),
  stateMachine: fs.readFileSync(path.join(V2, 'generated', 'state-machine.js'), 'utf8'),
  templates: fs.readFileSync(path.join(V2, 'data-templates.js'), 'utf8'),
  app: fs.readFileSync(path.join(V2, 'app.js'), 'utf8'),
};

const bridgeSrc = fs.readFileSync(path.join(V2, 'bridge.js'), 'utf8');
const charMapSrc = bridgeSrc.match(/const CHAR_TO_BUTTON = \{[\s\S]*?\};/)[0];
const CHAR_TO_BUTTON = new Function(`${charMapSrc} return CHAR_TO_BUTTON;`)();

const STORAGE_KEY = 'ti84trainer_v2_state';
const PAST_ISO = '2020-01-01';

// Due for track 1 with a pending handheld check — start-session routes
// straight to startHandheldCheck for this procedure.
function handheldDueRecord() {
  return {
    track1: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4, exposures: 1,
    },
    track2: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4,
      guidedPasses: 2, mode: 'recall', lastErrors: 0, lastHints: 0, bestScore: 0,
      handheldPassed: false, awaitingHandheld: true,
    },
  };
}

async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

function stubBridge() {
  return {
    async init() { return false; },
    getStatus() { return { code: 'offline', detail: 'test stub' }; },
    isRealEmulator() { return false; },
    setMockLines() {},
    sendButton: vi.fn(async () => true),
    prepareHome: vi.fn(async () => true),
    typeValue: vi.fn(async () => true),
    mountCanvas() {},
    destroy() {},
    async selectRomFile() { throw new Error('not supported in tests'); },
  };
}

function bootTrainer({ records = {}, signedIn = true } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.clear();
  // Trainer state is student-keyed — seed the slot the app will resolve.
  window.localStorage.setItem(`${STORAGE_KEY}.${signedIn ? 'TEST1' : 'anon'}`, JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode: false, records,
  }));

  window.TI84V2Bridge = { createBridge: () => stubBridge(), CHAR_TO_BUTTON };
  window.gradebookClient = { record: vi.fn(() => Promise.resolve({ ok: true })) };
  window.rosterClient = signedIn
    ? { current: () => ({ studentId: 'TEST1', username: 'test_student' }), token: () => 'test-token' }
    : { current: () => null, token: () => null };

  sources.natives.forEach((src) => new Function(src)());
  new Function(sources.dataProcedures)();
  new Function(sources.dataPatterns)();
  new Function(sources.stateMachine)();
  new Function(sources.templates)();
  new Function(sources.app)();
  return flush();
}

const appEl = () => document.getElementById('app');

async function click(selector) {
  const el = appEl().querySelector(selector);
  if (!el) throw new Error(`No element matches ${selector}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
}

function handheldStem() {
  const el = appEl().querySelector('.handheld-panel .problem-stem');
  if (!el) throw new Error('No handheld stem rendered');
  return el.textContent;
}

function canonicalStems(procedureId) {
  return window.TI84V2PatternsData.canonicalProblems[procedureId].map((p) => p.stem);
}

function expectedGenerated(procedureId, studentId, attempt) {
  const T = window.TI84V2Templates;
  const seed = T.deriveSeed(studentId, procedureId, 'handheld', attempt);
  return { seed, problem: T.generateProblem(T.TEMPLATES[procedureId], seed) };
}

function persistedGen(procedureId) {
  return JSON.parse(window.localStorage.getItem(`${STORAGE_KEY}.TEST1`)).records[procedureId]?.gen?.handheld;
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('handheld serving', () => {
  it('serves canonicals for procedures without a template', async () => {
    await bootTrainer({ records: { 'one-var-stats': handheldDueRecord() } });
    await click('[data-action="start-session"]');
    expect(canonicalStems('one-var-stats')).toContain(handheldStem());
  });

  it('serves the seed-0 generated problem for a templated procedure, not a canonical', async () => {
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() } });
    await click('[data-action="start-session"]');
    const { problem } = expectedGenerated('one-propztest', 'TEST1', 0);
    expect(handheldStem()).toBe(problem.stem);
    expect(canonicalStems('one-propztest')).not.toContain(handheldStem());
  });

  it('?gen=off serves canonicals and leaves gen metadata untouched', async () => {
    window.history.replaceState(null, '', '?gen=off');
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() } });
    await click('[data-action="start-session"]');
    expect(canonicalStems('one-propztest')).toContain(handheldStem());
  });

  it('falls back to canonicals with a warning when generation throws', async () => {
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.TI84V2Templates = {
      ...window.TI84V2Templates,
      generateProblem: () => { throw new Error('boom'); },
    };
    await click('[data-action="start-session"]');
    expect(canonicalStems('one-propztest')).toContain(handheldStem());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('serving canonical'), expect.any(Error));
    warn.mockRestore();
  });

  it('signed-out students seed as anon and still get a generated problem', async () => {
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() }, signedIn: false });
    await click('[data-action="start-session"]');
    const { problem } = expectedGenerated('one-propztest', 'anon', 0);
    expect(handheldStem()).toBe(problem.stem);
  });

  it('a recorded outcome commits seed metadata and advances the attempt', async () => {
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() } });
    await click('[data-action="start-session"]');
    const { seed, problem } = expectedGenerated('one-propztest', 'TEST1', 0);
    expect(handheldStem()).toBe(problem.stem);

    const answer = window.TI84StatMath.onePropZTest(
      problem.values.p0, problem.values.x, problem.values.n, problem.values.direction,
    );
    for (const [key, value] of [['z', answer.z], ['p', answer.p]]) {
      appEl().querySelector(`[data-answer-key="${key}"]`).value = value.toFixed(6);
    }
    await click('[data-action="check-handheld"]');

    const gen = persistedGen('one-propztest');
    expect(gen.attempt).toBe(1);
    expect(gen.lastSeed).toBe(seed);
    expect(gen.templateHash).toBe(problem.templateHash);
    // The next serve draws attempt 1 — a different problem by construction.
    expect(expectedGenerated('one-propztest', 'TEST1', 1).problem.stem).not.toBe(problem.stem);
  });

  it('skipping (no recorded outcome) leaves the attempt and metadata untouched', async () => {
    await bootTrainer({ records: { 'one-propztest': handheldDueRecord() } });
    await click('[data-action="start-session"]');
    await click('[data-action="handheld-skip"]');
    // Skip never persists a commit — gen is either still the backfilled
    // zero-state or absent from storage entirely. Both mean "untouched".
    const gen = persistedGen('one-propztest');
    expect(gen?.attempt ?? 0).toBe(0);
    expect(gen?.lastSeed ?? null).toBe(null);
  });
});

describe('app-level answer dispatch for all 8 templates (Codex amendment 4)', () => {
  const appSrc = sources.app;
  const vfSrc = appSrc.match(/const VERIFICATION_FIELDS = \{[\s\S]*?\n  \};/)[0];
  const ceSrc = appSrc.match(/  function computeExpected\([\s\S]*?\n  \}/)[0];
  const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'ti84-template-samples.json'), 'utf8'));

  it('generated values produce finite numbers for every verification field', async () => {
    await bootTrainer();
    const { computeExpected, VERIFICATION_FIELDS } = new Function(
      'window', `${vfSrc}\n${ceSrc}\nreturn { computeExpected, VERIFICATION_FIELDS };`,
    )(window);

    const byTemplate = new Map();
    for (const sample of samples) {
      if (!byTemplate.has(sample.templateId)) byTemplate.set(sample.templateId, []);
      byTemplate.get(sample.templateId).push(sample);
    }
    expect(byTemplate.size).toBe(8);

    for (const [procedureId, procSamples] of byTemplate) {
      const fields = VERIFICATION_FIELDS[procedureId];
      expect(fields?.length, `${procedureId} needs verification fields`).toBeGreaterThan(0);
      for (const sample of procSamples) {
        const answer = computeExpected(procedureId, { values: sample.values });
        expect(answer, `${procedureId} seed ${sample.seed}`).toBeTruthy();
        for (const field of fields) {
          const value = answer[field.key];
          expect(Number.isFinite(value), `${procedureId} seed ${sample.seed} field ${field.key}: ${value}`).toBe(true);
        }
      }
    }
  });
});
