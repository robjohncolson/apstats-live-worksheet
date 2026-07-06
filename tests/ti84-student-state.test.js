// Per-student trainer state (TI84_TRAINER_STUDENT_STATE_SPEC.md): progress is
// keyed by roster studentId with an 'anon' fallback, so shared devices never
// blend students. Core invariant: identity changes hand off WITHOUT merging,
// and the legacy device blob is frozen (copied to anon once, never inherited
// by a real student implicitly). ti84-trainer-list-memory namespaces too.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const CHAR_TO_BUTTON = new Function(
  `${bridgeSrc.match(/const CHAR_TO_BUTTON = \{[\s\S]*?\};/)[0]} return CHAR_TO_BUTTON;`,
)();

const STATE = 'ti84trainer_v2_state';
const MEM = 'ti84-trainer-list-memory';
const ROSTER = 'apstats_roster.v1';

// A mutable roster stub — tests flip the current student between boots/events.
let currentStudent = null;
function setStudent(id) {
  currentStudent = id ? { studentId: id, username: id } : null;
}

async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

function bootTrainer() {
  document.body.innerHTML = '<div id="app"></div>';
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
  window.rosterClient = { current: () => currentStudent, token: () => (currentStudent ? 't' : null) };

  sources.natives.forEach((src) => new Function(src)());
  new Function(sources.dataProcedures)();
  new Function(sources.dataPatterns)();
  new Function(sources.stateMachine)();
  new Function(sources.templates)();
  new Function(sources.app)();
  return flush();
}

function writeState(key, obj) {
  window.localStorage.setItem(key, JSON.stringify(obj));
}
function readState(key) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

// A record blob distinguishable by a marker unit filter.
function stateBlob(marker) {
  return { version: 2, filterUnit: marker, introSeen: true, physicalMode: false, records: {} };
}

beforeEach(() => {
  window.localStorage.clear();
  setStudent(null);
  window.history.replaceState(null, '', window.location.pathname);
});

describe('per-student storage keying', () => {
  it('signed-in boot reads and writes the studentId-suffixed key, never the bare key', async () => {
    writeState(`${STATE}.STU_A`, stateBlob('unitA'));
    setStudent('STU_A');
    await bootTrainer();
    // The app booted STU_A's state (filterUnit marker survived).
    expect(window.__ti84DebugFilterUnit?.() ?? readState(`${STATE}.STU_A`)?.filterUnit).toBeTruthy();
    // A save writes the suffixed key; the bare legacy key is untouched.
    window.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(readState(`${STATE}.STU_A`)).toBeTruthy();
    expect(window.localStorage.getItem(STATE)).toBe(null);
  });

  it('signed-out boot uses the anon key', async () => {
    setStudent(null);
    await bootTrainer();
    // Boot + any persistence lands on the anon slot, not the bare key.
    expect(window.localStorage.getItem(STATE)).toBe(null);
  });
});

describe('legacy blob migration (frozen → anon, once)', () => {
  it('copies the bare legacy state and list-memory to anon on first anon boot', async () => {
    writeState(STATE, stateBlob('legacyMarker'));
    window.localStorage.setItem(MEM, JSON.stringify({ L1: [1, 2, 3] }));
    setStudent(null);
    await bootTrainer();
    expect(readState(`${STATE}.anon`)?.filterUnit).toBe('legacyMarker');
    expect(readState(`${MEM}.anon`)).toEqual({ L1: [1, 2, 3] });
    // The bare legacy key is frozen — still present, never rewritten away.
    expect(readState(STATE)?.filterUnit).toBe('legacyMarker');
  });

  it('a signed-in student never inherits the legacy blob', async () => {
    writeState(STATE, stateBlob('legacyMarker'));
    setStudent('STU_B');
    await bootTrainer();
    // STU_B boots fresh (fallback 'all'), NOT the legacy marker.
    expect(readState(`${STATE}.STU_B`)).toBe(null); // nothing written yet, and load fell back
    expect(window.localStorage.getItem(`${STATE}.STU_B`)).toBe(null);
  });
});

describe('identity change hands off without merging', () => {
  it('a storage event switching students reboots state from the new key', async () => {
    writeState(`${STATE}.STU_A`, stateBlob('unitA'));
    writeState(`${STATE}.STU_B`, stateBlob('unitB'));
    setStudent('STU_A');
    await bootTrainer();

    // Student B signs in (another tab writes the roster key).
    setStudent('STU_B');
    window.dispatchEvent(new StorageEvent('storage', { key: ROSTER }));
    await flush();

    // A save now must land under STU_B, and STU_A's blob must be untouched.
    window.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(readState(`${STATE}.STU_A`)?.filterUnit).toBe('unitA');
    expect(readState(`${STATE}.STU_B`)?.filterUnit).toBe('unitB');
  });

  it('outgoing student state is flushed to the OLD key, never the new one', async () => {
    setStudent('STU_A');
    await bootTrainer();
    // No STU_A blob existed; the switch should create one under STU_A, not STU_B.
    setStudent('STU_B');
    window.dispatchEvent(new StorageEvent('storage', { key: ROSTER }));
    await flush();
    expect(window.localStorage.getItem(`${STATE}.STU_A`)).toBeTruthy();
    // STU_B's key holds only STU_B's own (fresh) state — no STU_A leakage.
    const b = readState(`${STATE}.STU_B`);
    if (b) expect(b.filterUnit).not.toBe('unitA');
  });

  it('an unrelated storage event does not trigger a switch', async () => {
    writeState(`${STATE}.STU_A`, stateBlob('unitA'));
    setStudent('STU_A');
    await bootTrainer();
    setStudent('STU_B'); // identity changed but...
    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }));
    await flush();
    // ...the non-roster event is ignored; STU_A is still active, so a save
    // writes STU_A. (visibilitychange would catch B, but storage of another
    // key must not.)
    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }));
    await flush();
    expect(readState(`${STATE}.STU_A`)?.filterUnit).toBe('unitA');
  });
});

describe('list-memory namespacing (Codex amendment 2)', () => {
  it('list memory is student-suffixed and never written to the bare key', async () => {
    setStudent('STU_A');
    await bootTrainer();
    window.dispatchEvent(new Event('visibilitychange'));
    await flush();
    // The bare list-memory key stays untouched by a signed-in session.
    expect(window.localStorage.getItem(MEM)).toBe(null);
  });

  it('student A list memory is invisible to student B', async () => {
    window.localStorage.setItem(`${MEM}.STU_A`, JSON.stringify({ L1: [9, 9, 9] }));
    setStudent('STU_B');
    await bootTrainer();
    // B has its own (empty) list memory; A's is not loaded.
    expect(readState(`${MEM}.STU_B`)).toBe(null);
  });
});

describe('import dialog — explicit one-time claim (spec §2.2)', () => {
  function anonBlobWithHistory(extra = {}) {
    return {
      version: 2,
      filterUnit: 'all',
      physicalMode: false,
      introSeen: true,
      records: {
        'one-var-stats': { track1: {}, track2: { handheldPassed: true } },
        histogram: { track1: {}, track2: { handheldPassed: false } },
      },
      ...extra,
    };
  }

  const dialog = () => document.querySelector('[data-action="import-history"]');

  async function click(selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element matches ${selector}`);
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
  }

  it('offers unclaimed anon history to a signed-in student with empty state', async () => {
    writeState(`${STATE}.anon`, anonBlobWithHistory());
    setStudent('STU_A');
    await bootTrainer();
    expect(dialog()).toBeTruthy();
    expect(document.body.innerHTML).toContain('2</strong> procedures started');
    expect(document.body.innerHTML).toContain('1</strong> mastered');
  });

  it('importing copies the history and claims the anon blob', async () => {
    writeState(`${STATE}.anon`, anonBlobWithHistory());
    window.localStorage.setItem(`${MEM}.anon`, JSON.stringify({ L1: [1, 2] }));
    setStudent('STU_A');
    await bootTrainer();
    await click('[data-action="import-history"]');

    expect(dialog()).toBe(null);
    expect(readState(`${STATE}.STU_A`)?.records['one-var-stats']).toBeTruthy();
    expect(readState(`${STATE}.STU_A`)?.claimedBy).toBeUndefined();
    expect(readState(`${STATE}.anon`)?.claimedBy).toBe('STU_A');
    expect(readState(`${MEM}.STU_A`)).toEqual({ L1: [1, 2] });
  });

  it('a second student is never offered a claimed blob', async () => {
    writeState(`${STATE}.anon`, anonBlobWithHistory({ claimedBy: 'STU_A' }));
    setStudent('STU_B');
    await bootTrainer();
    expect(dialog()).toBe(null);
  });

  it('declining persists and the dialog never returns for that student', async () => {
    writeState(`${STATE}.anon`, anonBlobWithHistory());
    setStudent('STU_A');
    await bootTrainer();
    await click('[data-action="decline-history"]');
    expect(dialog()).toBe(null);
    expect(readState(`${STATE}.STU_A`)?.importDeclined).toBe(true);

    // Re-boot: still no offer, and the anon blob stays unclaimed for its owner.
    await bootTrainer();
    expect(dialog()).toBe(null);
    expect(readState(`${STATE}.anon`)?.claimedBy).toBeUndefined();
  });

  it('students with existing state and anon sessions never see the offer', async () => {
    writeState(`${STATE}.anon`, anonBlobWithHistory());
    writeState(`${STATE}.STU_C`, { version: 2, records: { histogram: {} } });
    setStudent('STU_C');
    await bootTrainer();
    expect(dialog()).toBe(null);

    setStudent(null);
    await bootTrainer();
    expect(dialog()).toBe(null);
  });
});

describe('status strip', () => {
  it('shows the signed-in identity label with counts', async () => {
    setStudent('fig_panda');
    await bootTrainer();
    expect(document.body.innerHTML).toContain('fig_panda’s progress');
    expect(document.querySelector('.strip-stats')).toBeTruthy();
    expect(document.querySelector('#unit-filter')).toBeTruthy();
  });

  it('shows the device label when signed out', async () => {
    setStudent(null);
    await bootTrainer();
    expect(document.body.innerHTML).toContain('This device (not signed in)');
  });

  it('a valid session without a username still shows as signed in (Codex review)', async () => {
    currentStudent = { studentId: 'STU_42' }; // no username, no realName
    await bootTrainer();
    expect(document.body.innerHTML).toContain('STU_42’s progress');
    expect(document.body.innerHTML).not.toContain('This device (not signed in)');
  });
});

describe('source-level trigger wiring', () => {
  const appSrc = sources.app;
  it('registers storage + visibilitychange identity triggers and a pre-save recheck', () => {
    expect(appSrc).toMatch(/addEventListener\('storage'/);
    expect(appSrc).toMatch(/event\.key === ROSTER_KEY && maybeSwitchIdentity\(\)/);
    expect(appSrc).toMatch(/addEventListener\('visibilitychange'/);
    // savePersisted rechecks identity before writing.
    const save = appSrc.match(/  function savePersisted\(\) \{[\s\S]*?\n  \}/)[0];
    expect(save).toMatch(/if \(maybeSwitchIdentity\(\)\) \{\n\s*return;/);
  });
});
