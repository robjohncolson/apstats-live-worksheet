// Pins the Desk-launched practice deep links (TI84_TRAINER_DESK_LINK_SPEC.md
// §2, step 2): #procedure=/#topic= start a scoped practice session, every
// failure path falls through to the regular trainer with a banner, and
// practice NEVER moves SRS state (Codex's strict rule — guards verified by
// extraction) while still writing a visible trainer ledger row. Full-queue
// completion + lessonPractice recording is covered
// by the manual smoke (driving a whole walkthrough needs a keypad bot).
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

const LESSON_MAP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'ti84-lesson-map.json'), 'utf8'));

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

function bootTrainer({ hash = '', mapResponse } = {}) {
  window.history.replaceState(null, '', hash || window.location.pathname);
  document.body.innerHTML = '<div id="app"></div>';
  window.localStorage.clear();
  window.localStorage.setItem('ti84trainer_v2_state.TEST1', JSON.stringify({
    version: 2, filterUnit: 'all', physicalMode: false, introSeen: true, records: {},
  }));

  if (mapResponse === 'reject') {
    window.fetch = vi.fn(async () => { throw new Error('offline'); });
  } else if (mapResponse) {
    window.fetch = vi.fn(async () => ({ json: async () => mapResponse }));
  }

  window.TI84V2Bridge = { createBridge: () => stubBridge(), CHAR_TO_BUTTON };
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

const appHtml = () => document.getElementById('app').innerHTML;

async function click(selector) {
  const el = document.getElementById('app').querySelector(selector);
  if (!el) throw new Error(`No element matches ${selector}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
  delete window.fetch;
});

describe('practice deep links', () => {
  it('#procedure= starts a scoped session for exactly that procedure', async () => {
    // Banner text is transient (bridge status renders over it) — assert the
    // durable behavior: the session serves the linked procedure's question.
    await bootTrainer({ hash: '#procedure=one-propztest&source=desk' });
    await click('[data-action="start-session"]');
    expect(document.getElementById('app').querySelector('[data-procedure-id="one-propztest"]')).toBeTruthy();
  });

  it('#procedure= with an unknown id falls through to the regular trainer', async () => {
    await bootTrainer({ hash: '#procedure=not-a-thing' });
    const el = document.getElementById('app').querySelector('[data-action="start-session"]');
    expect(el).toBeTruthy();
  });

  it('#topic= resolves procedures through the lesson map', async () => {
    await bootTrainer({ hash: '#topic=7.2&source=desk', mapResponse: LESSON_MAP });
    expect(appHtml()).toContain('Lesson 7.2 calculator skill ready');
    await click('[data-action="start-session"]');
    const first = LESSON_MAP.lessons['7.2'][0];
    expect(document.getElementById('app').querySelector(`[data-procedure-id="${first}"]`)).toBeTruthy();
  });

  it('hashchange aborts the old question and re-applies the new topic', async () => {
    await bootTrainer({ hash: '#topic=7.2&source=desk', mapResponse: LESSON_MAP });
    await click('[data-action="start-session"]');
    expect(document.getElementById('app').querySelector('[data-procedure-id="t-interval-stats"]')).toBeTruthy();

    window.history.replaceState(null, '', '#topic=8.5&source=desk');
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await flush(60);

    expect(appHtml()).toContain('Lesson 8.5 calculator skill ready');
    expect(appHtml()).not.toContain('t-interval-stats');
    await click('[data-action="start-session"]');
    expect(document.getElementById('app').querySelector('[data-procedure-id="matrix-entry"]')).toBeTruthy();
  });

  it('#topic= with no mapping falls through with a banner', async () => {
    await bootTrainer({ hash: '#topic=1.1', mapResponse: LESSON_MAP });
    expect(appHtml()).toContain('No calculator skill mapped for lesson 1.1');
  });

  it('a failed map fetch falls through to the regular trainer with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await bootTrainer({ hash: '#topic=7.2', mapResponse: 'reject' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lesson map unavailable'), expect.any(Error));
    expect(document.getElementById('app').querySelector('[data-action="start-session"]')).toBeTruthy();
    warn.mockRestore();
  });

  it('no hash boots the regular trainer untouched', async () => {
    await bootTrainer();
    expect(appHtml()).not.toContain('practice ready');
    expect(document.getElementById('app').querySelector('[data-action="start-session"]')).toBeTruthy();
  });
});

describe('calculator keyboard shortcuts', () => {
  const appSrc = sources.app;
  const extract = (name) => {
    const match = appSrc.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  \\}`));
    if (!match) throw new Error(`Could not extract ${name}`);
    return match[0];
  };
  const keyMap = appSrc.match(/  const KEYBOARD_TO_BUTTON = \{[\s\S]*?\n  \};/)[0];

  function buildHandler(pressButton = vi.fn()) {
    const handler = new Function(
      'app', 'pressButton', 'checkHandheld', 'checkAnswerVerification',
      `${keyMap}\n${extract('isTextEntryTarget')}\n${extract('keyboardButtonId')}\n${extract('handleKeydown')}\nreturn handleKeydown;`,
    )({ handheldCheck: null }, pressButton, vi.fn(), vi.fn());
    return { handler, pressButton };
  }

  it.each([
    ['7', 'Digit7', 'SEVEN'],
    ['Enter', 'Enter', 'ENTER'],
    ['Backspace', 'Backspace', 'DEL'],
    ['ArrowLeft', 'ArrowLeft', 'LEFT'],
    ['_', 'Minus', 'NEGATIVE'],
    ['-', 'Minus', 'MINUS'],
  ])('maps %s to the calculator %s key', (key, code, expectedButton) => {
    const { handler, pressButton } = buildHandler();
    const preventDefault = vi.fn();

    handler({ key, code, target: document.body, preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(pressButton).toHaveBeenCalledWith(expectedButton);
  });

  it.each(['input', 'textarea'])('does not route calculator keys while focus is in a %s', (tagName) => {
    const { handler, pressButton } = buildHandler();
    const target = document.createElement(tagName);

    handler({ key: '7', code: 'Digit7', target, preventDefault: vi.fn() });

    expect(pressButton).not.toHaveBeenCalled();
  });
});

describe('practice never moves SRS state (extraction guards)', () => {
  const appSrc = sources.app;
  const extract = (name) => {
    const match = appSrc.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  \\}`));
    if (!match) throw new Error(`Could not extract ${name}`);
    return match[0];
  };

  it('applyTrack1Outcome is a no-op in practice mode', () => {
    const ensureProcedureRecord = vi.fn();
    const fn = new Function(
      'app', 'ensureProcedureRecord', 'todayIso', 'sm2',
      `${extract('applyTrack1Outcome')}\nreturn applyTrack1Outcome;`,
    )({ practice: { queue: [] } }, ensureProcedureRecord, () => '2026-07-05', vi.fn());
    fn('one-propztest', 4);
    expect(ensureProcedureRecord).not.toHaveBeenCalled();
  });

  it('recordTrainerAttempt writes a practice ledger row without moving track2', () => {
    const record = vi.fn(() => Promise.resolve({ ok: true }));
    const track2 = { lastQuality: 1, bestScore: 0.9, repetitions: 7 };
    const before = structuredClone(track2);
    const fn = new Function(
      'app', 'window', 'PROCEDURE_BY_ID', 'ensureProcedureRecord',
      'VERIFICATION_FIELDS', 'PROPERTY_FIELDS', 'recallQuality',
      `${extract('recordTrainerAttempt')}\nreturn recordTrainerAttempt;`,
    )(
      {
        practice: { queue: [] },
        persisted: { physicalMode: false },
        bridge: { isRealEmulator: () => false },
        sessionResult: null,
      },
      {
        gradebookClient: { record },
        rosterClient: { current: () => ({ studentId: 'TEST1' }) },
      },
      { 'one-propztest': { unit: 6 } },
      () => ({ track2 }),
      {},
      {},
      vi.fn(() => 3),
    );

    fn({ procedureId: 'one-propztest', mode: 'guided', hints: 0, errors: 0 });

    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0]).toMatchObject({
      source: 'trainer',
      itemId: 'TI84-one-propztest',
      unit: 'U6',
      response: { mode: 'practice', quality: 4 },
      score: 0.9,
      attempt: 1,
    });
    expect(track2).toEqual(before);
  });

  it('credits an unverifiable real-emulator walkthrough but not mock mode', () => {
    function invoke(realEmulator) {
      const record = vi.fn(() => Promise.resolve({ ok: true }));
      const track2 = { lastQuality: 4, bestScore: 0 };
      const fn = new Function(
        'app', 'window', 'PROCEDURE_BY_ID', 'ensureProcedureRecord',
        'VERIFICATION_FIELDS', 'PROPERTY_FIELDS', 'recallQuality',
        `${extract('recordTrainerAttempt')}\nreturn recordTrainerAttempt;`,
      )(
        {
          practice: null,
          persisted: { physicalMode: false },
          bridge: { isRealEmulator: () => realEmulator },
          sessionResult: null,
        },
        {
          gradebookClient: { record },
          rosterClient: { current: () => ({ studentId: 'TEST1' }) },
        },
        { histogram: { unit: 1 } },
        () => ({ track2 }),
        {},
        {},
        vi.fn(),
      );
      fn({ procedureId: 'histogram', mode: 'guided', hints: 0, errors: 0 });
      return record;
    }

    expect(invoke(true).mock.calls[0][0]).toMatchObject({
      response: { inputMode: 'emulator', quality: 4 },
      score: 0.8,
    });
    expect(invoke(false)).not.toHaveBeenCalled();
  });

  it('completeWalkthrough has a practice early-return before the SRS outcome call', () => {
    const body = appSrc.match(/  function completeWalkthrough\(\) \{[\s\S]*?\n  \}/)[0];
    const practiceBranch = body.indexOf('if (app.practice)');
    const srsCall = body.indexOf('applyTrack2Outcome(walkthrough)');
    expect(practiceBranch).toBeGreaterThan(-1);
    expect(srsCall).toBeGreaterThan(-1);
    expect(practiceBranch).toBeLessThan(srsCall);
  });
});
