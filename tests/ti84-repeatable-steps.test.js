// Pins the fix for TI-84 trainer Defect 1 (2026-08-06):
//  - `repeatable: true` steps (e.g. "press DOWN until A:binompdf( is highlighted")
//    used to be authored in ti84-procedures-data.json but implemented nowhere --
//    the guided gate accepted exactly one press of step.key, then unconditionally
//    advanced, so a second press of the same key was rejected as wrong.
//  - This suite drives the real DISTR-menu scroll in binompdf (steps[2], a DOWN
//    step that needs TEN presses to reach A:binompdf() through the real app.js,
//    real native modules, and generated data, stubbing only the CEmu bridge.
//
// Boots the real app.js in jsdom with the real native modules and generated data,
// stubbing only the CEmu bridge (no ROM, no network). Harness copied from
// tests/ti84-data-trust.test.js.
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
// Tracks every button forwarded to the emulator bridge, reset on each boot.
// (Only addition beyond the verbatim ti84-data-trust.test.js stub: sendButton
// now records its argument so tests can assert every repeated press reached
// the emulator, not just that the UI didn't block it.)
let sentButtons;

function stubCemuBridge() {
  mockScreen = { lines: null, footer: null };
  sentButtons = [];
  return {
    async init() { return false; },
    getStatus() { return { code: 'offline', detail: 'test stub' }; },
    isRealEmulator() { return false; },
    setMockLines(lines, footer) { mockScreen.lines = lines; mockScreen.footer = footer; },
    async sendButton(buttonId) { sentButtons.push(buttonId); },
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
  // Trainer state is student-keyed -- seed the slot the app will resolve.
  window.localStorage.setItem(`${STORAGE_KEY}.${signedIn ? 'TEST1' : 'anon'}`, JSON.stringify({
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
  // The signed-in suites read the studentId-keyed slot.
  return JSON.parse(window.localStorage.getItem(`${STORAGE_KEY}.TEST1`));
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

// binompdf's steps[2] ("Scroll until A:binompdf( is highlighted", key DOWN,
// repeatable: true) needs TEN presses on the real ROM before the escape key
// (steps[3]'s ENTER) is legal. Reaches that step from a fresh guided/recall
// walkthrough by pressing the two fixed setup keys (2ND, VARS) first.
async function advanceToRepeatableStep() {
  await click('[data-key="2ND"]');
  await click('[data-key="VARS"]');
}

const noteText = () => appHtml().match(/panel-note">([^<]*)</)?.[1] ?? '';
const bannerText = () => appHtml().match(/banner-message">([^<]*)</)?.[1] ?? '';

describe('repeatable step: unlimited presses on the held key', () => {
  it('accepts ten DOWN presses in a row without blocking or advancing', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('guided') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    for (let i = 0; i < 10; i += 1) {
      await click('[data-key="DOWN"]');
      expect(appHtml(), `press ${i + 1} of 10`).not.toContain('Blocked');
      expect(noteText(), `press ${i + 1} of 10`).toBe('Step 3 of 12');
    }

    const downCount = sentButtons.filter((id) => id === 'DOWN').length;
    expect(downCount).toBe(10);
  });

  it('advances the walkthrough on the next step\'s key after the repeat hold', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('guided') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    for (let i = 0; i < 10; i += 1) {
      await click('[data-key="DOWN"]');
    }

    expect(noteText()).toBe('Step 3 of 12');

    // The escape key IS steps[3]'s own key (ENTER), so this single physical
    // press both leaves the DOWN-hold and satisfies steps[3] in the same
    // tick -- the panel lands on steps[4]'s narration, not steps[3]'s. This
    // mirrors the real calculator: pressing ENTER on a highlighted DISTR menu
    // item both selects it and opens the wizard in one keystroke; step 3
    // (ENTER, "Open the binompdf wizard.") never gets its own visible beat.
    const procedure = procedureById('binompdf');
    await click('[data-key="ENTER"]');

    expect(noteText()).not.toBe('Step 3 of 12');
    expect(appHtml()).toContain(procedure.steps[4].narration);
  });

  it('accepts the reverse arrow as a legal backtrack off an overshoot', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('guided') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    await click('[data-key="DOWN"]');
    await click('[data-key="DOWN"]');
    expect(noteText()).toBe('Step 3 of 12');

    await click('[data-key="UP"]');

    expect(appHtml()).not.toContain('Blocked');
    expect(noteText()).toBe('Step 3 of 12');
    expect(sentButtons).toContain('UP');
  });

  it('still blocks a genuinely wrong key and names the repeat key in guided mode', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('guided') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    await click('[data-key="DOWN"]');
    await click('[data-key="GRAPH"]');

    expect(appHtml()).toContain('Blocked');
    expect(bannerText()).toMatch(/Blocked\. Keep pressing \[.+\] until the screen matches\./);
  });
});

describe('repeatable step: recall mode', () => {
  it('does not count extra presses of the repeatable key as errors', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('recall') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    // Thirteen presses -- three more than the ten actually needed -- to prove
    // over-pressing never costs anything, not just that ten presses are free.
    for (let i = 0; i < 13; i += 1) {
      await click('[data-key="DOWN"]');
    }
    await click('[data-key="ENTER"]');

    // Fill the wizard (numtrials, p, x) with the auto-filled sample values.
    await click('[data-key="ONE"]');
    await click('[data-key="DOWN"]');
    await click('[data-key="ONE"]');
    await click('[data-key="DOWN"]');
    await click('[data-key="ONE"]');
    await click('[data-key="DOWN"]');
    await click('[data-key="ENTER"]');
    await click('[data-key="ENTER"]');

    await waitFor(() => appHtml().includes('Walkthrough complete'), 'result review phase');

    const SM = window.TI84StatMath;
    const problems = window.TI84V2PatternsData.canonicalProblems.binompdf;
    const problem = problems.find((p) => appHtml().includes(p.stem.slice(0, 40)));
    expect(problem, 'rendered stem should match a canonical problem').toBeTruthy();
    const v = problem.values;
    const expected = SM.binompdf(v.n ?? v.trials, v.p, v.x);

    document.getElementById('app').querySelectorAll('[data-answer-key]').forEach((input) => {
      input.value = String(expected);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await click('[data-action="check-answer"]');
    await waitFor(
      () => document.getElementById('app').querySelector('[data-action="finish-review"]:not([disabled])'),
      'verification to unlock finish review',
    );
    await click('[data-action="finish-review"]');
    await waitFor(() => appHtml().includes('Session Update'), 'the session result card');

    const record = persisted().records.binompdf.track2;
    expect(record.lastErrors).toBe(0);
    // A demotion (errors >= 3) would flip mode back to 'guided' -- confirm it stayed recall.
    expect(record.mode).toBe('recall');
  });

  it('never reveals the next key, even for a wrong press on the repeatable step', async () => {
    await bootTrainer({ records: { binompdf: dueRecord('recall') } });
    await startWalkthroughFor('binompdf');
    await advanceToRepeatableStep();

    await click('[data-key="DOWN"]');
    await click('[data-key="GRAPH"]');

    expect(appHtml()).toContain('Not that key.');
    expect(appHtml()).not.toContain('The next key is');
  });
});
