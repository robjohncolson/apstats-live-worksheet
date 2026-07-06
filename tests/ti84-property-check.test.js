// U3 property-check engine (TI84_TRAINER_UNIT3_SPEC.md §3): randomization
// procedures validate the FORM of the student's own numbers — count,
// integers, range, distinctness, and the assignment interpretation rule
// (Treatment A = the first groupSize entries of the draw). No exact values:
// the trainer never knows what the student's calculator produced.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.setConfig({ testTimeout: 30_000 });

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');
const appSrc = fs.readFileSync(path.join(V2, 'app.js'), 'utf8');

// ── Unit tests: the rule evaluator, extracted from app.js ──

const checkPropertyField = new Function(
  `${appSrc.match(/  function checkPropertyField\([\s\S]*?\n  \}/)[0]}\nreturn checkPropertyField;`,
)();

const VALUES = { seed: 42, lo: 1, hi: 30, n: 5, groupSize: 3 };
const DRAW_RULE = { key: 'draw', count: 'n', min: 'lo', max: 'hi', distinct: true };
const GROUP_RULE = { key: 'groupA', count: 'groupSize', mustBePrefixOf: 'draw' };

function run(rule, input, parsed = {}) {
  return checkPropertyField(rule, input, VALUES, parsed);
}

describe('checkPropertyField rules', () => {
  it('accepts the right count of distinct integers in range (commas or spaces)', () => {
    expect(run(DRAW_RULE, '3, 11, 7, 22, 30')).toBe(true);
    expect(run(DRAW_RULE, '3 11 7 22 30')).toBe(true);
  });

  it('rejects wrong count, non-integers, out-of-range, repeats, empty', () => {
    expect(run(DRAW_RULE, '3, 11, 7, 22')).toBe(false);          // count
    expect(run(DRAW_RULE, '3, 11.5, 7, 22, 30')).toBe(false);    // integer
    expect(run(DRAW_RULE, '3, 11, 7, 22, 31')).toBe(false);      // > hi
    expect(run(DRAW_RULE, '0, 11, 7, 22, 30')).toBe(false);      // < lo
    expect(run(DRAW_RULE, '3, 11, 7, 11, 30')).toBe(false);      // repeats
    expect(run(DRAW_RULE, '')).toBe(false);                      // empty
    expect(run(DRAW_RULE, '3, x, 7, 22, 30')).toBe(false);       // garbage
  });

  it('groupA must be exactly the first groupSize entries of the draw', () => {
    const parsed = {};
    expect(run(DRAW_RULE, '9, 2, 17, 5, 28', parsed)).toBe(true);
    expect(run(GROUP_RULE, '9, 2, 17', parsed)).toBe(true);       // prefix ✓
    expect(run(GROUP_RULE, '2, 9, 17', parsed)).toBe(false);      // reordered
    expect(run(GROUP_RULE, '5, 28, 17', parsed)).toBe(false);     // wrong entries
    expect(run(GROUP_RULE, '9, 2', parsed)).toBe(false);          // wrong count
  });
});

// ── App-boot: the real handheld flow for randint-sampling ──

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
  app: appSrc,
};

const bridgeSrc = fs.readFileSync(path.join(V2, 'bridge.js'), 'utf8');
const CHAR_TO_BUTTON = new Function(
  `${bridgeSrc.match(/const CHAR_TO_BUTTON = \{[\s\S]*?\};/)[0]} return CHAR_TO_BUTTON;`,
)();

const PAST_ISO = '2020-01-01';

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
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

function bootTrainer(records) {
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.clear();
  window.localStorage.setItem('ti84trainer_v2_state', JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode: false, introSeen: true, records,
  }));
  window.TI84V2Bridge = {
    createBridge: () => ({
      async init() { return false; },
      getStatus() { return { code: 'offline', detail: 'stub' }; },
      isRealEmulator() { return false; },
      setMockLines() {}, sendButton: vi.fn(async () => true),
      prepareHome: vi.fn(async () => true), typeValue: vi.fn(async () => true),
      mountCanvas() {}, destroy() {},
      async selectRomFile() { throw new Error('n/a'); },
    }),
    CHAR_TO_BUTTON,
  };
  window.gradebookClient = { record: vi.fn(() => Promise.resolve({ ok: true })) };
  window.rosterClient = { current: () => ({ studentId: 'TEST1' }), token: () => 't' };
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

// The served canonical is random — recover its values by matching the stem.
function servedValues(procedureId) {
  const stemEl = appEl().querySelector('.handheld-panel .problem-stem');
  const canonicals = window.TI84V2PatternsData.canonicalProblems[procedureId];
  const match = canonicals.find((p) => stemEl.textContent.includes(p.stem.slice(0, 60)));
  if (!match) throw new Error('Served stem matched no canonical');
  return match.values;
}

describe('randint-sampling handheld property check (app-boot)', () => {
  it('valid form masters; invalid form blocks with guidance', async () => {
    await bootTrainer({ 'randint-sampling': handheldDueRecord() });
    await click('[data-action="start-session"]');
    const v = servedValues('randint-sampling');

    const input = appEl().querySelector('[data-answer-key="draw"]');
    expect(input).toBeTruthy();

    // Invalid first: a repeat.
    const bad = Array(v.n).fill(v.lo).join(',');
    input.value = bad;
    await click('[data-action="check-handheld"]');
    expect(appEl().querySelector('.handheld-panel')).toBeTruthy();

    // Valid: lo..lo+n-1 — distinct, in range, right count.
    const good = Array.from({ length: v.n }, (_, i) => v.lo + i).join(', ');
    appEl().querySelector('[data-answer-key="draw"]').value = good;
    await click('[data-action="check-handheld"]');
    expect(appEl().innerHTML).toContain('mastered');
  });

  it('assignment requires Treatment A to be the prefix of the draw', async () => {
    await bootTrainer({ 'randint-assignment': handheldDueRecord() });
    await click('[data-action="start-session"]');
    const v = servedValues('randint-assignment');

    const draw = Array.from({ length: v.n }, (_, i) => v.lo + i);
    appEl().querySelector('[data-answer-key="draw"]').value = draw.join(',');
    // Wrong: the LAST groupSize entries.
    appEl().querySelector('[data-answer-key="groupA"]').value = draw.slice(-v.groupSize).join(',');
    await click('[data-action="check-handheld"]');
    expect(appEl().querySelector('.handheld-panel')).toBeTruthy();

    // Right: the FIRST groupSize entries.
    appEl().querySelector('[data-answer-key="draw"]').value = draw.join(',');
    appEl().querySelector('[data-answer-key="groupA"]').value = draw.slice(0, v.groupSize).join(',');
    await click('[data-action="check-handheld"]');
    expect(appEl().innerHTML).toContain('mastered');
  });
});
