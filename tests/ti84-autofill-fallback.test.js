// Pins the transfer-backed autofill head from the list-autofill rewrite
// (TI84_TRAINER_AUTOFILL_REWRITE_SPEC.md §3, commit 2/3):
//  - proven lists (L1/L2) go through bridge.sendList — zero keystrokes
//  - a failed transfer falls back to keystroke entry in the same run
//  - ?autofill=keys and persisted transferAutofill:false force keystrokes
//  - matrix targets never attempt transfer (no proven .8xm path yet)
// L3–L6 share the same `in PROVEN_TRANSFER_LISTS` gate the failure path
// exercises. Boots the real app.js in jsdom, stubbing only the CEmu bridge.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

const bridgeSrc = fs.readFileSync(path.join(V2, 'bridge.js'), 'utf8');
const charMapSrc = bridgeSrc.match(/const CHAR_TO_BUTTON = \{[\s\S]*?\};/)[0];
const CHAR_TO_BUTTON = new Function(`${charMapSrc} return CHAR_TO_BUTTON;`)();

const STORAGE_KEY = 'ti84trainer_v2_state';
const PAST_ISO = '2020-01-01';

function dueRecord(mode) {
  return {
    track1: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4, exposures: 1,
    },
    track2: {
      interval: 1, easeFactor: 2.5, repetitions: 1,
      lastReview: PAST_ISO, nextReview: PAST_ISO, lastQuality: 4,
      guidedPasses: 2, mode, lastErrors: 0, lastHints: 0, bestScore: 0,
    },
  };
}

async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

let bridgeStub;

// A real-emulator stub: isRealEmulator() is true so confirmDataSetup routes
// through autoFillData, and sendList/typeValue spies observe which entry
// path the fill actually took.
function stubRealEmulatorBridge({ sendList } = {}) {
  bridgeStub = {
    async init() { return true; },
    getStatus() { return { code: 'ready', detail: 'test stub' }; },
    isRealEmulator() { return true; },
    setMockLines() {},
    sendButton: vi.fn(async () => true),
    prepareHome: vi.fn(async () => true),
    typeValue: vi.fn(async () => true),
    sendList: sendList ?? vi.fn(() => ({ ok: true, via: 'ccall', fsApi: 'Module.FS.writeFile' })),
    mountCanvas() {},
    destroy() {},
    getFrame() { return null; },
    sampleRegion() { return null; },
    frameHash() { return null; },
    getModule() { return null; },
    async selectRomFile() { throw new Error('not supported in tests'); },
  };
  return bridgeStub;
}

function bootTrainer({ records = {}, extraPersisted = {}, sendList } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.clear();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode: false, records, ...extraPersisted,
  }));

  window.TI84V2Bridge = { createBridge: () => stubRealEmulatorBridge({ sendList }), CHAR_TO_BUTTON };
  window.gradebookClient = { record: vi.fn(() => Promise.resolve({ ok: true })) };
  window.rosterClient = { current: () => ({ studentId: 'TEST1', username: 'test_student' }), token: () => 'test-token' };

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, what, timeout = 20000) {
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

async function startWalkthroughFor(procedureId) {
  await click('[data-action="start-session"]');
  await waitFor(
    () => document.getElementById('app').querySelector(`[data-procedure-id="${procedureId}"]`),
    'the Track 1 question choices',
  );
  await click(`[data-procedure-id="${procedureId}"]`);
  await waitFor(walkthroughStarted, 'the walkthrough to start');
}

async function reachDataSetupAndAutoFill(procedureId) {
  await startWalkthroughFor(procedureId);
  await waitFor(
    () => document.getElementById('app').querySelector('[data-action="auto-fill-data"]'),
    'the data-setup panel',
  );
  await click('[data-action="auto-fill-data"]');
}

const dataEntered = () =>
  !document.getElementById('app').querySelector('[data-action="auto-fill-data"]');

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('transfer-backed autofill', () => {
  it('fills a proven list via bridge.sendList with zero keystrokes', async () => {
    await bootTrainer({ records: { 'one-var-stats': dueRecord('guided') } });
    await reachDataSetupAndAutoFill('one-var-stats');
    await waitFor(dataEntered, 'auto-fill to finish');

    expect(bridgeStub.sendList).toHaveBeenCalledTimes(1);
    const [listName, values] = bridgeStub.sendList.mock.calls[0];
    expect(listName).toBe('L1');
    expect(Array.isArray(values)).toBe(true);
    expect(values.length).toBeGreaterThan(0);
    expect(bridgeStub.typeValue).not.toHaveBeenCalled();
  });

  it('falls back to keystroke entry in the same run when transfer fails', async () => {
    const sendList = vi.fn(() => ({ ok: false, reason: 'no-module' }));
    await bootTrainer({ records: { 'one-var-stats': dueRecord('guided') }, sendList });
    await reachDataSetupAndAutoFill('one-var-stats');
    await waitFor(dataEntered, 'the keystroke fallback to finish');

    expect(sendList).toHaveBeenCalledTimes(1);
    expect(bridgeStub.typeValue).toHaveBeenCalled();
  });

  it('?autofill=keys forces the keystroke path without touching sendList', async () => {
    window.history.replaceState(null, '', '?autofill=keys');
    await bootTrainer({ records: { 'one-var-stats': dueRecord('guided') } });
    await reachDataSetupAndAutoFill('one-var-stats');
    await waitFor(dataEntered, 'the keystroke fill to finish');

    expect(bridgeStub.sendList).not.toHaveBeenCalled();
    expect(bridgeStub.typeValue).toHaveBeenCalled();
  });

  it('persisted transferAutofill:false forces the keystroke path', async () => {
    await bootTrainer({
      records: { 'one-var-stats': dueRecord('guided') },
      extraPersisted: { transferAutofill: false },
    });
    await reachDataSetupAndAutoFill('one-var-stats');
    await waitFor(dataEntered, 'the keystroke fill to finish');

    expect(bridgeStub.sendList).not.toHaveBeenCalled();
    expect(bridgeStub.typeValue).toHaveBeenCalled();
  });

  it('matrix targets never attempt transfer (chi-square-test → [A])', async () => {
    await bootTrainer({ records: { 'chi-square-test': dueRecord('guided') } });
    await reachDataSetupAndAutoFill('chi-square-test');
    await waitFor(dataEntered, 'the matrix keystroke fill to finish', 30000);

    expect(bridgeStub.sendList).not.toHaveBeenCalled();
    expect(bridgeStub.typeValue).toHaveBeenCalled();
  });
});
