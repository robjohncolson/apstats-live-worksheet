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
let typedValues;
let typedOptions;

function stubCemuBridge() {
  mockScreen = { lines: null, footer: null };
  sentButtons = [];
  typedValues = [];
  typedOptions = [];
  return {
    async init() { return false; },
    getStatus() { return { code: 'offline', detail: 'test stub' }; },
    isRealEmulator() { return false; },
    setMockLines(lines, footer) { mockScreen.lines = lines; mockScreen.footer = footer; },
    async sendButton(buttonId) { sentButtons.push(buttonId); },
    async prepareHome() {},
    async typeValue(value, options) {
      typedValues.push(String(value));
      typedOptions.push(options);
    },
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

async function advanceToMatrixCellLoop() {
  for (const buttonId of [
    '2ND', 'X_INVERSE', 'RIGHT', 'RIGHT', 'ENTER',
    'ONE', 'ENTER', 'ONE', 'ENTER',
  ]) {
    await click('[data-key="' + buttonId + '"]');
  }
}

async function enterGuidedMatrixCell() {
  await click('[data-key="ONE"]');
  await click('[data-key="ENTER"]');
}

const MATRIX_DIGIT_BUTTON = {
  0: 'ZERO',
  1: 'ONE',
  2: 'TWO',
  3: 'THREE',
  4: 'FOUR',
  5: 'FIVE',
  6: 'SIX',
  7: 'SEVEN',
  8: 'EIGHT',
  9: 'NINE',
};

async function enterRecallMatrixCell(value) {
  for (const digit of String(value)) {
    await click('[data-key="' + MATRIX_DIGIT_BUTTON[digit] + '"]');
  }

  await click('[data-key="ENTER"]');
}

async function finishMatrixReview() {
  expect(noteText()).toBe('Result review mode');
  await click('[data-action="finish-review"]');
  await waitFor(() => appHtml().includes('Session Update'), 'the matrix session result');
}

async function advancePhysicalToMatrixCellLoop() {
  for (let step = 0; step < 9; step += 1) {
    await click('[data-action="physical-advance"]');
  }
}

describe('matrix-entry cell loop', () => {
  it('types all six canonical cells in row-major order', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    for (let cell = 0; cell < 6; cell += 1) {
      await enterGuidedMatrixCell();
    }

    expect(typedValues).toEqual(['3', '2', '30', '70', '80', '60', '110', '50']);
    expect(typedOptions.slice(2)).toEqual(Array(6).fill({ clearField: false }));
    expect(noteText()).toBe('Result review mode');
  });

  it('does not enter result review before the sixth cell is committed', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    for (let cell = 0; cell < 5; cell += 1) {
      await enterGuidedMatrixCell();
      expect(noteText(), 'after cell ' + (cell + 1)).not.toBe('Result review mode');
    }

    await enterGuidedMatrixCell();
    expect(noteText()).toBe('Result review mode');
  });

  it('does not advance when ENTER is pressed with an empty cell buffer', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    expect(noteText()).toBe('Step 10 of 11');
    await click('[data-key="ENTER"]');

    expect(noteText()).toBe('Step 10 of 11');
    expect(bannerText()).toContain('Enter a value for cell (1,1)');
    expect(appHtml()).not.toContain('Walkthrough complete');
  });

  it('uses 30 for the first cell and never falls back to the sample value 5', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await click('[data-key="ONE"]');

    expect(typedValues).toEqual(['3', '2', '30']);
    expect(typedValues).not.toContain('5');
  });

  it('sends CLEAR before resetting a rejected recall value', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('recall') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await click('[data-key="NINE"]');
    const sentBeforeCommit = sentButtons.length;
    await click('[data-key="ENTER"]');

    expect(sentButtons.slice(sentBeforeCommit)).toEqual(['CLEAR']);
    expect(bannerText()).toContain('does not match cell (1,1)');
    expect(appHtml()).toContain('cell 1 of 6');

    await enterRecallMatrixCell(30);

    expect(sentButtons.slice(sentBeforeCommit)).toEqual(['CLEAR', 'THREE', 'ZERO', 'ENTER']);
    expect(appHtml()).toContain('cell 2 of 6');
  });

  it('keeps guided edits synchronized and blocks a second auto-type', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await click('[data-key="ONE"]');
    const typedAfterFirstValue = [...typedValues];
    const sentBeforeEdit = sentButtons.length;

    await click('[data-key="TWO"]');

    expect(typedValues).toEqual(typedAfterFirstValue);
    expect(sentButtons.slice(sentBeforeEdit)).toEqual([]);
    expect(bannerText()).toContain('Press [ENTER], [DEL], or [CLEAR]');

    await click('[data-key="DEL"]');
    await click('[data-key="ENTER"]');

    expect(sentButtons.slice(sentBeforeEdit)).toEqual(['DEL', 'CLEAR']);
    expect(bannerText()).toContain('does not match cell (1,1)');
    expect(appHtml()).toContain('cell 1 of 6');
  });

  it('suggests ENTER only when the visible matrix buffer matches the current cell', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await click('[data-key="ONE"]');
    expect(typedValues.at(-1)).toBe('30');
    expect(document.querySelector('[data-key="ENTER"]').classList.contains('suggested')).toBe(true);

    await click('[data-key="DEL"]');

    expect(document.querySelector('[data-key="ENTER"]').classList.contains('suggested')).toBe(false);
    expect(document.querySelector('[data-key="DEL"]').classList.contains('suggested')).toBe(true);
    expect(document.querySelector('[data-key="CLEAR"]').classList.contains('suggested')).toBe(true);
    expect(document.querySelector('[data-key="THREE"]').classList.contains('suggested')).toBe(false);
  });

  it('blocks empty ENTER on a filled cell but allows a free correct retype', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('recall') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await enterRecallMatrixCell(30);
    await click('[data-key="LEFT"]');
    const sentBeforeRecommit = sentButtons.length;
    await click('[data-key="ENTER"]');

    expect(sentButtons.slice(sentBeforeRecommit)).toEqual([]);
    expect(appHtml()).toContain('cell 1 of 6');
    expect(bannerText()).toBe('Cell (1,1) already holds 30 — retype it to change it, or arrow to another cell.');

    await enterRecallMatrixCell(30);

    expect(sentButtons.slice(sentBeforeRecommit)).toEqual(['THREE', 'ZERO', 'ENTER']);
    expect(appHtml()).toContain('cell 2 of 6');
    expect(bannerText()).toBe('Correct. Keep going from memory.');

    for (const value of [70, 80, 60, 110, 50]) {
      await enterRecallMatrixCell(value);
    }

    await finishMatrixReview();

    expect(persisted().records['matrix-entry'].track2.lastErrors).toBe(0);
  });

  it('blocks every arrow while a cell edit is in progress without suggesting one', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await click('[data-key="ONE"]');
    const sentBeforeArrows = sentButtons.length;

    for (const arrow of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
      const arrowButton = document.querySelector('[data-key="' + arrow + '"]');
      expect(arrowButton.classList.contains('suggested')).toBe(false);
      await click('[data-key="' + arrow + '"]');
      expect(bannerText()).toBe('Press ENTER to store this cell first (or CLEAR to start over).');
    }

    expect(sentButtons.slice(sentBeforeArrows)).toEqual([]);
    expect(document.querySelector('[data-key="ENTER"]').classList.contains('suggested')).toBe(true);
    expect(appHtml()).toContain('cell 1 of 6');

    await click('[data-key="ENTER"]');

    expect(sentButtons.slice(sentBeforeArrows)).toEqual(['ENTER']);
    expect(appHtml()).toContain('cell 2 of 6');
  });

  it('keeps ROM edit context after DEL or CLEAR empties the visible buffer', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('recall') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforeEdit = sentButtons.length;

    await click('[data-key="THREE"]');
    await click('[data-key="DEL"]');
    await click('[data-key="RIGHT"]');

    expect(sentButtons.slice(sentBeforeEdit)).toEqual(['THREE', 'DEL']);
    expect(bannerText()).toBe('Type the value for this cell and press ENTER before moving.');

    await click('[data-key="DEL"]');
    expect(sentButtons.slice(sentBeforeEdit)).toEqual(['THREE', 'DEL']);

    await click('[data-key="CLEAR"]');
    await click('[data-key="RIGHT"]');

    expect(sentButtons.slice(sentBeforeEdit)).toEqual(['THREE', 'DEL', 'CLEAR']);
    expect(bannerText()).toBe('Type the value for this cell and press ENTER before moving.');

    await click('[data-key="THREE"]');
    await click('[data-key="ZERO"]');
    await click('[data-key="ENTER"]');
    await click('[data-key="LEFT"]');
    const sentBeforeRight = sentButtons.length;
    await click('[data-key="RIGHT"]');

    expect(sentButtons.slice(sentBeforeRight)).toEqual(['RIGHT']);
  });

  it('forwards only arrows whose destination stays inside the matrix grid', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforeArrows = sentButtons.length;

    await click('[data-key="UP"]');
    expect(bannerText()).toBe("You're at the edge of the table.");
    await click('[data-key="LEFT"]');
    expect(bannerText()).toBe("You're at the edge of the table.");

    await click('[data-key="RIGHT"]');
    await click('[data-key="RIGHT"]');
    expect(bannerText()).toBe("You're at the edge of the table.");

    await click('[data-key="DOWN"]');
    await click('[data-key="DOWN"]');
    await click('[data-key="DOWN"]');
    expect(bannerText()).toBe("You're at the edge of the table.");

    await click('[data-key="LEFT"]');
    await click('[data-key="LEFT"]');

    expect(sentButtons.slice(sentBeforeArrows)).toEqual(['RIGHT', 'DOWN', 'DOWN', 'LEFT']);
    expect(bannerText()).toBe("You're at the edge of the table.");
    expect(appHtml()).toContain('cell 5 of 6');
    expect(mockScreen.footer).toBe('Expect cell (3,1)');
  });

  it('disables manual guidance pause throughout an active matrix loop', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforePause = sentButtons.length;
    const pauseButton = document.querySelector('[data-action="pause-guidance"]');

    expect(pauseButton.disabled).toBe(true);
    await click('[data-action="pause-guidance"]');

    expect(sentButtons.length).toBe(sentBeforePause);
    expect(bannerText()).toBe('Finish the table before pausing guidance.');
    expect(document.querySelector('[data-action="pause-guidance"]').disabled).toBe(true);
    expect(document.querySelector('[data-action="resume-guidance"]')).toBeNull();
    expect(appHtml()).toContain('cell 1 of 6');
  });

  it('locks a screen-started matrix loop to the on-screen calculator until restart', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('guided') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforeToggle = [...sentButtons];
    const typedBeforeToggle = [...typedValues];

    expect(document.querySelector('[data-action="toggle-physical-mode"]').disabled).toBe(true);
    await click('[data-action="toggle-physical-mode"]');

    expect(persisted().physicalMode).toBe(false);
    expect(bannerText()).toBe('Finish or restart the table before switching calculators.');
    expect(sentButtons).toEqual(sentBeforeToggle);
    expect(typedValues).toEqual(typedBeforeToggle);
    expect(mockScreen.lines.join(' ')).not.toMatch(/\b30\b/);
    expect(appHtml()).toContain('cell 1 of 6');

    await click('[data-action="restart-walkthrough"]');
    await waitFor(walkthroughStarted, 'the restarted matrix walkthrough');

    expect(document.querySelector('[data-action="toggle-physical-mode"]').disabled).toBe(false);
    await click('[data-action="toggle-physical-mode"]');
    expect(persisted().physicalMode).toBe(true);
    expect(document.querySelector('.physical-panel')).not.toBeNull();
  });

  it('taints a direct firmware retry during the loop and leaves SRS and ledger untouched', async () => {
    const recordAttempt = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      recordFn: recordAttempt,
    });
    const recordBefore = JSON.parse(JSON.stringify(persisted().records['matrix-entry']));
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforeRetry = [...sentButtons];

    expect(document.querySelector('[data-action="retry-bridge"]').disabled).toBe(true);
    await click('[data-action="retry-bridge"]');

    expect(sentButtons).toEqual(sentBeforeRetry);
    expect(bannerText()).toBe("Guidance stopped mid-table — this attempt won't be scored. Restart the walkthrough to try again.");
    expect(document.querySelector('[data-action="resume-guidance"]')).not.toBeNull();

    await click('[data-action="resume-guidance"]');
    for (let cell = 0; cell < 6; cell += 1) {
      await enterGuidedMatrixCell();
    }
    await finishMatrixReview();

    expect(recordAttempt).not.toHaveBeenCalled();
    const recordAfter = persisted().records['matrix-entry'];
    expect(recordAfter.track1).toMatchObject(recordBefore.track1);
    expect(recordAfter.track2).toMatchObject(recordBefore.track2);
    expect(recordAfter.track2.bestScore).toBe(recordBefore.track2.bestScore ?? 0);
    expect(appHtml()).toContain('Table entry interrupted');
  });

  it('preserves CLEAR history across a blocked ENTER and finishes a forced pause unscored', async () => {
    const recordAttempt = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('recall') },
      recordFn: recordAttempt,
    });
    const recordBefore = JSON.parse(JSON.stringify(persisted().records['matrix-entry']));
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();
    const sentBeforeAttempt = sentButtons.length;

    await click('[data-key="NINE"]');
    await click('[data-key="ENTER"]');
    await click('[data-key="ENTER"]');

    expect(sentButtons.slice(sentBeforeAttempt)).toEqual(['NINE', 'CLEAR']);
    expect(bannerText()).toContain('Enter a value for cell (1,1)');
    expect(document.querySelector('[data-action="pause-guidance"]').disabled).toBe(true);

    await click('[data-key="CLEAR"]');

    expect(sentButtons.slice(sentBeforeAttempt)).toEqual(['NINE', 'CLEAR', 'CLEAR']);
    expect(bannerText()).toBe("Guidance stopped mid-table — this attempt won't be scored. Restart the walkthrough to try again.");
    expect(document.querySelector('[data-action="pause-guidance"]')).toBeNull();
    expect(document.querySelector('[data-action="resume-guidance"]')).not.toBeNull();

    await click('[data-action="resume-guidance"]');
    for (const value of [30, 70, 80, 60, 110, 50]) {
      await enterRecallMatrixCell(value);
    }

    expect(noteText()).toBe('Result review mode');
    await click('[data-action="toggle-physical-mode"]');
    await click('[data-action="finish-review"]');
    await waitFor(() => appHtml().includes('Session Update'), 'the interrupted matrix result');

    expect(recordAttempt).not.toHaveBeenCalled();
    const recordAfter = persisted().records['matrix-entry'];
    expect(recordAfter.track1).toMatchObject(recordBefore.track1);
    expect(recordAfter.track2).toMatchObject(recordBefore.track2);
    expect(recordAfter.track2.bestScore).toBe(recordBefore.track2.bestScore ?? 0);
    expect(appHtml()).toContain('Table entry interrupted');
    expect(appHtml()).toContain('Guidance was interrupted mid-table, so this attempt was not scored. Restart to try again.');
  });

  it('demotes recall after two distinct missed matrix cells without promoting SM-2', async () => {
    await bootTrainer({ records: { 'matrix-entry': dueRecord('recall') } });
    await startWalkthroughFor('matrix-entry');
    await advanceToMatrixCellLoop();

    await enterRecallMatrixCell(9);
    await enterRecallMatrixCell(30);
    await enterRecallMatrixCell(9);
    await enterRecallMatrixCell(70);

    for (const value of [80, 60, 110, 50]) {
      await enterRecallMatrixCell(value);
    }

    await finishMatrixReview();

    const record = persisted().records['matrix-entry'].track2;
    expect(record.lastErrors).toBe(2);
    expect(record.lastQuality).toBe(3);
    expect(record.repetitions).toBe(0);
    expect(record.mode).toBe('guided');
    expect(record.awaitingHandheld).not.toBe(true);
    expect(appHtml()).toContain('Two matrix cells were missed');
    expect(appHtml()).not.toContain('recall passed');
  });

  it('does not score or record a matrix problem whose grid is unavailable', async () => {
    const recordAttempt = vi.fn(() => Promise.resolve({ ok: true }));
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('recall') },
      physicalMode: true,
      recordFn: recordAttempt,
    });
    const matrixProblem = window.TI84V2PatternsData.canonicalProblems['matrix-entry'][0];
    matrixProblem.values = { rows: 3, cols: 2 };
    matrixProblem.stem = 'Enter an unavailable 3 by 2 table into Matrix [A].';
    const recordBefore = JSON.parse(JSON.stringify(persisted().records['matrix-entry']));

    await startWalkthroughFor('matrix-entry');
    await advancePhysicalToMatrixCellLoop();
    await click('[data-action="physical-advance"]');
    await finishMatrixReview();

    expect(recordAttempt).not.toHaveBeenCalled();
    // SRS untouched: every seeded field keeps its value (normalization may add
    // default flags like awaitingHandheld:false and the `gen` bookkeeping slot).
    const recordAfter = persisted().records['matrix-entry'];
    expect(recordAfter.track1).toMatchObject(recordBefore.track1);
    expect(recordAfter.track2).toMatchObject(recordBefore.track2);
    expect(recordAfter.track2.awaitingHandheld).toBe(false);
    expect(recordAfter.track2.bestScore).toBe(recordBefore.track2.bestScore ?? 0);
    expect(appHtml()).toContain('Matrix data unavailable');
    expect(appHtml()).toContain('Try another problem');
  });

  // Physical mode has no hint button (hints live in the emulator action bar), so a
  // recall card stays neutral for the whole loop; guided shows the full table.
  it('keeps the physical recall matrix card neutral, and shows the table in guided', async () => {
    await bootTrainer({
      records: { 'matrix-entry': dueRecord('recall') },
      physicalMode: true,
    });
    await startWalkthroughFor('matrix-entry');
    await advancePhysicalToMatrixCellLoop();

    const neutralCard = document.querySelector('.physical-matrix-loop').innerHTML;
    expect(neutralCard).toContain('do the next step on your calculator');
    expect(neutralCard).toContain('I did it');
    expect(neutralCard).not.toContain('Enter the 3x2 table into [A]');
    expect(neutralCard).not.toContain('(1,1) 30');
    expect(neutralCard).not.toContain('Table entered');
    expect(neutralCard).not.toContain('Type 5');

    await bootTrainer({
      records: { 'matrix-entry': dueRecord('guided') },
      physicalMode: true,
    });
    await startWalkthroughFor('matrix-entry');
    await advancePhysicalToMatrixCellLoop();

    const guidedCard = document.querySelector('.physical-matrix-loop').innerHTML;
    expect(guidedCard).toContain('Enter the 3x2 table into [A]');
    expect(guidedCard).toContain('(1,1) 30');
    expect(guidedCard).toContain('Table entered');
    expect(guidedCard).not.toContain('Type 5');
  });
});
