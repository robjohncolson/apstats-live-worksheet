// Pins the TI-84 trainer data-trust core (2026-06-12):
//  - recall mode never reveals the next key (panel, narration bar, mock footer, wrong-press)
//  - physical mode records to the gradebook only after answer verification
//  - recorded score is raise-only; payload carries response.inputMode
//  - cancelled wrong Track-1 guesses cost the same quality as a completed branch
//  - gradebook-client distinguishes auth / server / network failure reasons
//
// Boots the real app.js in jsdom with the real native modules and generated data,
// stubbing only the CEmu bridge (no ROM, no network).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Walkthrough tests drive the real app through flash/transition timers.
vi.setConfig({ testTimeout: 60_000 });

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');

const NATIVE_FILES = [
  'event-bus.js',
  'stat-math.js',
  'menu-tables.js',
  'field-tables.js',
  'menu-nav.js',
  'form-engine.js',
  'result-formatter.js',
  'screen-renderer.js',
  'ti84-native.js',
];

const sources = {
  natives: NATIVE_FILES.map((f) => fs.readFileSync(path.join(V2, 'native', f), 'utf8')),
  dataProcedures: fs.readFileSync(path.join(V2, 'generated', 'data-procedures.js'), 'utf8'),
  dataPatterns: fs.readFileSync(path.join(V2, 'generated', 'data-patterns.js'), 'utf8'),
  stateMachine: fs.readFileSync(path.join(V2, 'generated', 'state-machine.js'), 'utf8'),
  app: fs.readFileSync(path.join(V2, 'app.js'), 'utf8'),
};

// Reuse the real char->button map so parameter auto-fill drives the real native module.
const bridgeSrc = fs.readFileSync(path.join(V2, 'bridge.js'), 'utf8');
const charMapSrc = bridgeSrc.match(/const CHAR_TO_BUTTON = \{[\s\S]*?\};/)[0];
const CHAR_TO_BUTTON = new Function(`${charMapSrc} return CHAR_TO_BUTTON;`)();

const STORAGE_KEY = 'ti84trainer_v2_state';

let mockScreen;

function stubCemuBridge() {
  mockScreen = { lines: null, footer: null };
  return {
    async init() { return false; },
    getStatus() { return { code: 'offline', detail: 'test stub' }; },
    isRealEmulator() { return false; },
    setMockLines(lines, footer) { mockScreen.lines = lines; mockScreen.footer = footer; },
    async sendButton() {},
    async prepareHome() {},
    async typeValue() {},
    mountCanvas() {},
    destroy() {},
    async selectRomFile() { throw new Error('not supported in tests'); },
  };
}

// Unambiguously in the past regardless of timezone, so the procedure is due.
const PAST_ISO = '2020-01-01';

// A record that makes the procedure due for Track 1, with the given Track 2 mode.
function dueRecord(mode, track2Extra = {}) {
  return {
    track1: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4, exposures: 1,
    },
    track2: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4,
      guidedPasses: 2, mode, lastErrors: 0, lastHints: 0, bestScore: 0,
      ...track2Extra,
    },
  };
}

async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

function bootTrainer({ records = {}, physicalMode = false, signedIn = true, recordFn } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.clear();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode, records,
  }));

  window.TI84V2Bridge = { createBridge: () => stubCemuBridge(), CHAR_TO_BUTTON };
  window.gradebookClient = { record: recordFn ?? vi.fn(() => Promise.resolve({ ok: true })) };
  window.rosterClient = signedIn
    ? { current: () => ({ studentId: 'TEST1', username: 'test_student' }), token: () => 'test-token' }
    : { current: () => null, token: () => null };

  sources.natives.forEach((src) => new Function(src)());
  new Function(sources.dataProcedures)();
  new Function(sources.dataPatterns)();
  new Function(sources.stateMachine)();
  new Function(sources.app)();
  return flush();
}

const appHtml = () => document.getElementById('app').innerHTML;

async function click(selector) {
  const el = document.getElementById('app').querySelector(selector);
  if (!el) {
    throw new Error(`No element matches ${selector}. Panel: ${appHtml().replace(/\s+/g, ' ').slice(0, 2500)}`);
  }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
}

function procedureById(id) {
  return window.TI84V2ProceduresData.procedures.find((p) => p.id === id);
}

function persisted() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls real time because the app uses flash/transition timers between states.
async function waitFor(predicate, what, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await flush();
    if (predicate()) {
      return;
    }
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}. Panel: ${appHtml().replace(/\s+/g, ' ').slice(0, 2500)}`);
}

const walkthroughStarted = () =>
  appHtml().includes('walkthrough-panel') && !appHtml().includes('Resetting the calculator');

// Starts the seeded due procedure's walkthrough by answering Track 1 correctly.
async function startWalkthroughFor(procedureId) {
  await click('[data-action="start-session"]');
  await waitFor(
    () => document.getElementById('app').querySelector(`[data-procedure-id="${procedureId}"]`),
    'the Track 1 question choices',
  );
  await click(`[data-procedure-id="${procedureId}"]`);
  await waitFor(walkthroughStarted, 'the walkthrough to start');
}

// Clicks "I did it" through the steps. Stops at session completion, or at the
// answer-verification gate (inputs present, Finish review still locked).
async function physicalAdvanceAll() {
  const appEl = () => document.getElementById('app');
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (appHtml().includes('Session Update')) {
      return;
    }
    const dataSetupDone = appEl().querySelector('[data-action="data-setup-done"]:not([disabled])');
    if (dataSetupDone) {
      // Physical mode: the data lives on the student's real calculator.
      dataSetupDone.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush();
      await sleep(25);
      continue;
    }
    const advance = appEl().querySelector('[data-action="physical-advance"]:not([disabled])');
    const finishEnabled = appEl().querySelector('[data-action="finish-review"]:not([disabled])');
    if (advance) {
      advance.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    } else if (appEl().querySelector('[data-answer-key]')) {
      // Verification gate reached (the Finish button blocks in its handler,
      // not via the disabled attribute) — caller verifies.
      return;
    } else if (finishEnabled) {
      finishEnabled.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    }
    await flush();
    await sleep(25);
  }
  throw new Error(`physical walkthrough did not finish. Panel: ${appHtml().replace(/\s+/g, ' ').slice(0, 2500)}`);
}

// Fills the verification inputs from stat-math (same source computeExpected uses) and checks.
async function verifyAnswers(procedureId) {
  const problems = window.TI84V2PatternsData.canonicalProblems[procedureId];
  const html = appHtml();
  const problem = problems.find((p) => html.includes(p.stem.slice(0, 60)));
  expect(problem, 'rendered stem should match a canonical problem').toBeTruthy();

  const v = problem.values;
  const expected = window.TI84StatMath.tTest(v.mu0, v.xbar, v.sx, v.n, v.direction);

  document.getElementById('app').querySelectorAll('[data-answer-key]').forEach((input) => {
    const key = input.dataset.answerKey;
    const value = expected[key];
    expect(typeof value, `expected value for field ${key}`).toBe('number');
    input.value = String(value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });

  await click('[data-action="check-answer"]');
  await waitFor(
    () => document.getElementById('app').querySelector('[data-action="finish-review"]:not([disabled])'),
    'verification to unlock Finish review',
  );
  await click('[data-action="finish-review"]');
  await waitFor(() => appHtml().includes('Session Update'), 'the session result card');
}

describe('recall mode answer gating', () => {
  it('hides narration, the Expect footer, and next-key reveals in recall mode', async () => {
    await bootTrainer({ records: { 't-test-stats': dueRecord('recall') } });
    await startWalkthroughFor('t-test-stats');

    const stepOne = procedureById('t-test-stats').steps[0];
    expect(appHtml()).toContain('what comes next?');
    expect(appHtml()).not.toContain(stepOne.narration);
    expect(mockScreen.footer ?? '').not.toMatch(/^Expect /);

    // Wrong key (no authored commonErrors entry for GRAPH on step 1).
    await click('[data-key="GRAPH"]');
    expect(appHtml()).toContain('Not that key.');
    expect(appHtml()).not.toContain('The next key is');
  });

  it('still shows narration and the Expect footer in guided mode', async () => {
    await bootTrainer({ records: { 't-test-stats': dueRecord('guided') } });
    await startWalkthroughFor('t-test-stats');

    const stepOne = procedureById('t-test-stats').steps[0];
    expect(appHtml()).toContain(stepOne.narration);
    expect(mockScreen.footer ?? '').toMatch(/^Expect /);
  });
});

describe('physical-mode recording policy', () => {
  it('records nothing for an unverifiable physical completion, but local SM-2 still updates', async () => {
    const record = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      physicalMode: true,
      recordFn: record,
    });
    await startWalkthroughFor('matrix-entry');
    await physicalAdvanceAll();
    await flush(50);

    expect(appHtml()).toContain('Session Update');
    expect(record).not.toHaveBeenCalled();
    // Local SM-2 state still advanced even though nothing was recorded.
    expect(persisted().records['matrix-entry'].track2.lastReview).not.toBe(PAST_ISO);
  });

  it('records a verified physical completion with inputMode physical and a raise-only score', async () => {
    const record = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 't-test-stats': dueRecord('guided', { bestScore: 0.4 }) },
      physicalMode: true,
      recordFn: record,
    });
    await startWalkthroughFor('t-test-stats');
    await physicalAdvanceAll();
    await verifyAnswers('t-test-stats');

    expect(record).toHaveBeenCalledTimes(1);
    const payload = record.mock.calls[0][0];
    expect(payload.source).toBe('trainer');
    expect(payload.itemId).toBe('TI84-t-test-stats');
    expect(payload.unit).toBe('U7');
    expect(payload.attempt).toBe(1);
    expect(payload.response.inputMode).toBe('physical');
    expect(payload.score).toBe(Math.max(0.4, payload.response.quality / 5));
    expect(persisted().records['t-test-stats'].track2.bestScore).toBe(payload.score);
    await waitFor(() => appHtml().includes('Saved to your gradebook.'), 'the save confirmation');
  });

  it('keeps a previously recorded high score when a later attempt is weaker', async () => {
    const record = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 't-test-stats': dueRecord('guided', { bestScore: 1 }) },
      physicalMode: true,
      recordFn: record,
    });
    await startWalkthroughFor('t-test-stats');
    await physicalAdvanceAll();
    await verifyAnswers('t-test-stats');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].score).toBe(1);
  });

  it('records nothing when signed out', async () => {
    const record = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      physicalMode: true,
      signedIn: false,
      recordFn: record,
    });
    await startWalkthroughFor('matrix-entry');
    await physicalAdvanceAll();
    await flush(50);

    expect(appHtml()).toContain('Session Update');
    expect(record).not.toHaveBeenCalled();
  });
});

describe('Track 1 brute-force penalty', () => {
  it('a cancelled wrong guess costs the same quality as one branch', async () => {
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      physicalMode: true,
    });
    await click('[data-action="start-session"]');
    await waitFor(
      () => document.getElementById('app').querySelector('[data-procedure-id="matrix-entry"]'),
      'the Track 1 question choices',
    );

    // Wrong choice -> branch intro -> cancel -> correct choice.
    const wrong = document.getElementById('app')
      .querySelector('[data-action="choose-procedure"]:not([data-procedure-id="matrix-entry"])');
    wrong.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitFor(
      () => document.getElementById('app').querySelector('[data-action="cancel-branch"]'),
      'the branch intro',
    );
    await click('[data-action="cancel-branch"]');
    await waitFor(
      () => document.getElementById('app').querySelector('[data-procedure-id="matrix-entry"]:not([disabled])'),
      'the question choices to return',
    );
    await click('[data-procedure-id="matrix-entry"]');
    await waitFor(walkthroughStarted, 'the walkthrough to start');
    await physicalAdvanceAll();
    await flush(50);

    expect(appHtml()).toContain('Session Update');
    // One effective miss maps to quality 3 (same as one completed branch).
    expect(persisted().records['matrix-entry'].track1.lastQuality).toBe(3);
  });
});

describe('onboarding and progress signals', () => {
  it('shows the first-run chooser and applies the mode choice', async () => {
    await bootTrainer({ records: {} });

    expect(appHtml()).toContain('Do you have a TI-84 calculator with you?');
    await click('[data-action="intro-emulator"]');

    expect(persisted().physicalMode).toBe(false);
    expect(persisted().introSeen).toBe(true);
    await waitFor(() => appHtml().includes('choose-procedure'), 'the first question');
  });

  it('counts only scheduler-visible (track1) dues in the Due card', async () => {
    const record = dueRecord('recall');
    record.track1.nextReview = '2099-01-01'; // track1 not due; track2 past-due
    await bootTrainer({ records: { 't-test-stats': record } });

    const dueValue = document.querySelector('.dashboard-card strong').textContent.trim();
    expect(dueValue).toBe('0');
  });

  it('a guided completion schedules tomorrow and does not re-enter the Due count', async () => {
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      physicalMode: true,
    });
    await startWalkthroughFor('matrix-entry');
    await physicalAdvanceAll();
    await flush(50);

    const record = persisted().records['matrix-entry'];
    expect(record.track2.nextReview).not.toBe(record.track2.lastReview);
    const dueValue = document.querySelector('.dashboard-card strong').textContent.trim();
    expect(dueValue).toBe('0');
  });

  it('honors a #unit=N deep link for the session without persisting it', async () => {
    window.location.hash = '#unit=4';
    try {
      await bootTrainer({ records: {} });
      expect(document.querySelector('#unit-filter').value).toBe('4');
      expect(persisted().filterUnit).toBe('all');
    } finally {
      window.location.hash = '';
    }
  });
});

describe('gradebook-client failure reasons', () => {
  function bootGradebookClient(fetchImpl) {
    window.ROSTER_SERVICE_URL = 'https://roster.test';
    window.rosterClient = { token: () => 'tok' };
    window.fetch = vi.fn(fetchImpl);
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'gradebook-client.js'), 'utf8');
    new Function(src)();
    return window.gradebookClient;
  }

  const args = { source: 'trainer', itemId: 'TI84-x', response: {}, score: 1, attempt: 1 };

  it('maps 401 to auth', async () => {
    const client = bootGradebookClient(async () => ({
      ok: false, status: 401, json: async () => ({ ok: false }),
    }));
    expect(await client.record(args)).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps 500 to server', async () => {
    const client = bootGradebookClient(async () => ({
      ok: false, status: 500, json: async () => ({ ok: false }),
    }));
    expect(await client.record(args)).toEqual({ ok: false, reason: 'server' });
  });

  it('maps a fetch rejection to network', async () => {
    const client = bootGradebookClient(async () => { throw new Error('offline'); });
    expect(await client.record(args)).toEqual({ ok: false, reason: 'network' });
  });
});
