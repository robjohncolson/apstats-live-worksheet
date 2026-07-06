// Pins the trainer's independent pane scaling (2026-07-06):
//  - guidance text scale and calculator scale are SEPARATE knobs, so nobody
//    needs browser zoom to fit the calculator or read the directions
//  - display prefs are DEVICE-level (one physical screen), never student-keyed
//  - fit mode is the default calculator behavior; manual +/- overrides it
//  - narrow viewports neutralize both scales (phones keep their own layout)
//
// Boots the real app.js in jsdom like ti84-data-trust.test.js, stubbing only
// the CEmu bridge.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
const UI_PREFS_KEY = 'ti84trainer_ui_prefs_v1';

function stubCemuBridge() {
  return {
    async init() { return false; },
    getStatus() { return { code: 'offline', detail: 'test stub' }; },
    isRealEmulator() { return false; },
    setMockLines() {},
    async sendButton() {},
    async prepareHome() {},
    async typeValue() {},
    mountCanvas() {},
    destroy() {},
  };
}

async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function bootTrainer({ physicalMode = false, viewportWidth = 1280, uiPrefsRaw } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  document.documentElement.removeAttribute('style');
  window.localStorage.clear();
  setViewportWidth(viewportWidth);

  window.localStorage.setItem(`${STORAGE_KEY}.TEST1`, JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode, introSeen: true, records: {},
  }));

  if (uiPrefsRaw !== undefined) {
    window.localStorage.setItem(UI_PREFS_KEY, uiPrefsRaw);
  }

  window.TI84V2Bridge = { createBridge: () => stubCemuBridge(), CHAR_TO_BUTTON };
  window.gradebookClient = { record: vi.fn(() => Promise.resolve({ ok: true })) };
  window.rosterClient = {
    current: () => ({ studentId: 'TEST1', username: 'test_student' }),
    token: () => 'test-token',
  };

  sources.natives.forEach((src) => new Function(src)());
  new Function(sources.dataProcedures)();
  new Function(sources.dataPatterns)();
  new Function(sources.stateMachine)();
  new Function(sources.app)();
  return flush();
}

const cssVar = (name) => document.documentElement.style.getPropertyValue(name).trim();

async function click(selector) {
  const el = document.getElementById('app').querySelector(selector);
  if (!el) {
    throw new Error(`No element matches ${selector}`);
  }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
}

const savedPrefs = () => JSON.parse(window.localStorage.getItem(UI_PREFS_KEY));

describe('independent pane scaling', () => {
  it('applies the larger default guide scale on desktop viewports', async () => {
    await bootTrainer();

    expect(cssVar('--guide-scale')).toBe('1.3');
    expect(cssVar('--calc-scale')).toBe('1');
  });

  it('steps the guide scale with A+ / A− and persists it device-wide (no student suffix)', async () => {
    await bootTrainer();

    await click('[data-action="guide-scale-up"]');
    expect(cssVar('--guide-scale')).toBe('1.45');
    expect(savedPrefs().guideScale).toBe(1.45);

    // Device-level key exactly — display prefs must never be student-keyed.
    expect(window.localStorage.getItem(`${UI_PREFS_KEY}.TEST1`)).toBeNull();

    await click('[data-action="guide-scale-down"]');
    await click('[data-action="guide-scale-down"]');
    await click('[data-action="guide-scale-down"]');
    expect(cssVar('--guide-scale')).toBe('1');

    // Clamped at the floor — guidance text never gets SMALLER than base.
    await click('[data-action="guide-scale-down"]');
    expect(cssVar('--guide-scale')).toBe('1');
  });

  it('calculator size: fit is the default, manual − switches modes, Fit restores', async () => {
    await bootTrainer();

    expect(savedPrefs()).toBeNull();

    await click('[data-action="calc-scale-down"]');
    expect(savedPrefs().calcMode).toBe(0.92);
    expect(cssVar('--calc-scale')).toBe('0.92');

    await click('[data-action="calc-scale-fit"]');
    expect(savedPrefs().calcMode).toBe('fit');
  });

  it('scaling the calculator does not shrink the guide scale, and narration compensates', async () => {
    await bootTrainer();

    await click('[data-action="calc-scale-down"]');
    await click('[data-action="calc-scale-down"]');

    expect(cssVar('--guide-scale')).toBe('1.3');
    // narration zoom ≈ guide / calc so narration text tracks the guide scale.
    const calc = Number(cssVar('--calc-scale'));
    const narration = Number(cssVar('--narration-scale'));
    expect(narration).toBeCloseTo(Math.min(2, Math.max(1, 1.3 / calc)), 1);
  });

  it('hides the calculator size group in physical mode but keeps text controls', async () => {
    await bootTrainer({ physicalMode: true });

    const appEl = document.getElementById('app');
    expect(appEl.querySelector('[data-action="guide-scale-up"]')).not.toBeNull();
    expect(appEl.querySelector('[data-action="calc-scale-fit"]')).toBeNull();
  });

  it('neutralizes both scales on narrow viewports', async () => {
    await bootTrainer({ viewportWidth: 500 });

    expect(cssVar('--guide-scale')).toBe('1');
    expect(cssVar('--calc-scale')).toBe('1');
  });

  it('ignores corrupt stored prefs and falls back to defaults', async () => {
    await bootTrainer({ uiPrefsRaw: '{not json' });

    expect(cssVar('--guide-scale')).toBe('1.3');
  });
});
