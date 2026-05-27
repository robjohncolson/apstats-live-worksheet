/**
 * tests/level-editor-sim.test.js
 *
 * P3 unit tests for the v1 level editor sim engine + sim UI
 * (LEVEL_EDITOR_V1_BUILD.md). Mirrors the loading patterns from
 * tests/level-editor.test.js and tests/level-editor-lint.test.js.
 *
 * Covers:
 *   Group 1  -- Sim engine: createSim + tick
 *   Group 2  -- Player movement + Gate collision
 *   Group 3  -- Gate predicates
 *   Group 4  -- SipStation auto-choice (V7.13)
 *   Group 5  -- ContextSlot one-way light
 *   Group 6  -- GoalPad presence timer
 *   Group 7  -- Legacy actors (Key / QuestionDoor / Goal)
 *   Group 8  -- fakeTally toggle
 *   Group 9  -- UI: sim start/stop + actor placement disabled
 *   Group 10 -- UI: arrow keys reroute to simMovePlayer
 *   Group 11 -- Integration: full U1.1 walkthrough
 *
 * Loading patterns:
 *   - Engine-only tests (Group 1-8) use a vm sandbox with model + sim
 *     scripts evaluated against a synthetic window namespace. No DOM.
 *   - UI tests (Group 9-11) use JSDOM + win.eval of model + render +
 *     lint + sim + ui. requestAnimationFrame is stubbed to a no-op
 *     for sim tests so the sim loop doesn't auto-tick -- the suite
 *     drives sim time via LE.ui._test.simStep(dt) instead.
 *
 * ASCII-only. LF line endings.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MODEL_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-model.js'), 'utf8');
const RENDER_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-render.js'), 'utf8');
const LINT_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-lint.js'), 'utf8');
const SIM_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-sim.js'), 'utf8');
const UI_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-ui.js'), 'utf8');
const HTML_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor.html'), 'utf8');
const SPRITE_JSON = readFileSync(resolve(REPO_ROOT, 'pico_sprite1.json'), 'utf8');
const U1_1_JSON = readFileSync(
  resolve(REPO_ROOT, '..', 'curriculum_render', 'railway-server', 'activities', 'U1.1.json'),
  'utf8'
);

// ---------------------------------------------------------------------------
// Sandbox loader -- engine-only tests (Group 1-8). No DOM.
// ---------------------------------------------------------------------------

/**
 * Load model + sim into a single vm sandbox. The sim IIFE assigns onto
 * window.LE.sim and reads nothing from the model directly, but we load
 * both so tests can build states via model.createState() / addActor().
 */
function loadEngineSandbox() {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(MODEL_SRC, sandbox, { filename: 'level-editor-model.js' });
  runInContext(SIM_SRC, sandbox, { filename: 'level-editor-sim.js' });
  return {
    model: sandbox.LE.model,
    sim: sandbox.LE.sim,
  };
}

/**
 * Build a baseline level state with PlayerSpawn + map -- the smallest
 * fixture that createSim accepts.
 */
function emptyState(model) {
  return model.createState();
}

function statePlayerSpawn(model, x, y) {
  let s = model.createState();
  s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: x, y: y });
  return s;
}

// ---------------------------------------------------------------------------
// JSDOM loader -- UI tests (Group 9-11). Mirrors level-editor-lint.test.js.
// ---------------------------------------------------------------------------

function loadEditorEnv(opts) {
  opts = opts || {};
  const dom = new JSDOM(HTML_SRC, {
    url: 'http://localhost/tools/level-editor.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  installCanvasShim(win);
  installFetchShim(win);
  installClipboardShim(win);
  // requestAnimationFrame -- no-op so the sim loop does NOT auto-tick.
  // Tests drive sim time via _test.simStep(dt) instead. The render()
  // path also uses RAF but tests that need a paint call _test.renderNow().
  win.requestAnimationFrame = function () { return 0; };
  win.cancelAnimationFrame = function () {};
  win.open = vi.fn();

  win.eval(MODEL_SRC);
  win.eval(RENDER_SRC);
  win.eval(LINT_SRC);
  win.eval(SIM_SRC);

  function loadUI() {
    win.eval(UI_SRC);
  }

  return {
    dom: dom,
    window: win,
    document: win.document,
    LE: win.LE,
    loadUI: loadUI,
  };
}

function installCanvasShim(win) {
  let lastCtx = null;
  win.HTMLCanvasElement.prototype.getContext = function () {
    lastCtx = makeCtxStub();
    return lastCtx;
  };
  win.__lastCtx = function () { return lastCtx; };
}

function makeCtxStub() {
  return {
    canvas: { width: 600, height: 240 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    stroke: function () {},
    fill: function () {},
    arc: function () {},
    translate: function () {},
    rotate: function () {},
    scale: function () {},
    setTransform: function () {},
    clearRect: function () {},
    fillRect: function () {},
    strokeRect: function () {},
    fillText: function () {},
    strokeText: function () {},
    measureText: function (t) { return { width: String(t).length * 6 }; },
    drawImage: function () {},
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
  };
}

function installFetchShim(win) {
  win.fetch = function (url) {
    if (typeof url === 'string' && url.indexOf('pico_sprite1.json') !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return Promise.resolve(SPRITE_JSON); },
      });
    }
    return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(''); } });
  };
}

function installClipboardShim(win) {
  const writes = [];
  if (!win.navigator) win.navigator = {};
  const writeFn = vi.fn(function (text) {
    writes.push(String(text));
    return Promise.resolve();
  });
  try {
    Object.defineProperty(win.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeFn },
    });
  } catch (_e) {
    win.navigator.clipboard = { writeText: writeFn };
  }
  win.__clipboardWrites = writes;
  win.__clipboardWriteFn = writeFn;
}

// ---------------------------------------------------------------------------
// Group 1 -- Sim engine: createSim + tick
// ---------------------------------------------------------------------------

describe('Group 1 -- sim engine: createSim + tick', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('createSim(emptyState) returns sim with phase=IDLE and player at (0, 0)', function () {
    const s = emptyState(model);
    const simObj = sim.createSim(s);
    expect(simObj.phase).toBe('IDLE');
    expect(simObj.player.x).toBe(0);
    expect(simObj.player.y).toBe(0);
    // Internal state defaults.
    expect(simObj.sips.sampledA).toBe(false);
    expect(simObj.sips.sampledB).toBe(false);
    expect(simObj.sips.choice).toBeNull();
    expect(simObj.fakeTally).toBe(false);
    expect(simObj.keyCollected).toBe(false);
    expect(simObj.goalPadTimerMs).toBe(0);
  });

  it('createSim(stateWithPlayerSpawn) puts player at PlayerSpawn x/y', function () {
    const s = statePlayerSpawn(model, 7, 3);
    const simObj = sim.createSim(s);
    expect(simObj.player.x).toBe(7);
    expect(simObj.player.y).toBe(3);
  });

  it('tick(sim, 100) on an idle sim does not crash or mutate phase', function () {
    const s = emptyState(model);
    const simObj = sim.createSim(s);
    expect(function () { sim.tick(simObj, 100); }).not.toThrow();
    expect(simObj.phase).toBe('IDLE');
    expect(simObj.goalPadTimerMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 2 -- Player movement + Gate collision
// ---------------------------------------------------------------------------

describe('Group 2 -- player movement + gate collision', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('movePlayer(sim, 1, 0) advances player x by 1 chip', function () {
    const s = statePlayerSpawn(model, 4, 4);
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(5);
    expect(simObj.player.y).toBe(4);
  });

  it('movePlayer(sim, -1, 0) decreases x; clamped to 0', function () {
    const s = statePlayerSpawn(model, 0, 4);
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, -1, 0);
    expect(simObj.player.x).toBe(0);
    expect(simObj.player.y).toBe(4);
  });

  it('movePlayer(sim, 0, 1) advances y, clamped to map height - 1', function () {
    // map.height default = 8 -> max y = 7. Place player at y=7 and walk down.
    const s = statePlayerSpawn(model, 4, 7);
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 0, 1);
    expect(simObj.player.y).toBe(7);
    // Now place at y=6, walk down; should land at y=7.
    const s2 = statePlayerSpawn(model, 4, 6);
    const simObj2 = sim.createSim(s2);
    sim.movePlayer(simObj2, 0, 1);
    expect(simObj2.player.y).toBe(7);
  });

  it('movePlayer(sim, 1, 0) blocked by a closed always_false Gate at next chip', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', {
      type: 'Gate', x: 5, y: 4, id: 'g1', label: 'wall', predicate: 'always_false',
    });
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 1, 0);
    // Player should be BLOCKED at the chip before the gate -- still x=4.
    expect(simObj.player.x).toBe(4);
    expect(simObj.player.y).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Group 3 -- Gate predicates
// ---------------------------------------------------------------------------

describe('Group 3 -- gate predicates', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it("evalPredicate(sim, 'always_false') returns false", function () {
    const simObj = sim.createSim(emptyState(model));
    expect(sim.evalPredicate(simObj, 'always_false')).toBe(false);
  });

  it("evalPredicate(sim, 'every_player_row_complete') returns true once sampledA+sampledB+choice are set", function () {
    const simObj = sim.createSim(emptyState(model));
    expect(sim.evalPredicate(simObj, 'every_player_row_complete')).toBe(false);

    // Set the three latches directly.
    simObj.sips.sampledA = true;
    expect(sim.evalPredicate(simObj, 'every_player_row_complete')).toBe(false);
    simObj.sips.sampledB = true;
    expect(sim.evalPredicate(simObj, 'every_player_row_complete')).toBe(false);
    simObj.sips.choice = 'A';
    expect(sim.evalPredicate(simObj, 'every_player_row_complete')).toBe(true);
  });

  it("evalPredicate(sim, 'tally_nonzero') returns false when no tally, true when fakeTally=true", function () {
    const simObj = sim.createSim(emptyState(model));
    expect(sim.evalPredicate(simObj, 'tally_nonzero')).toBe(false);

    sim.setFakeTally(simObj, true);
    expect(sim.evalPredicate(simObj, 'tally_nonzero')).toBe(true);

    // Toggle off; should revert to false (no real tally rows present).
    sim.setFakeTally(simObj, false);
    expect(sim.evalPredicate(simObj, 'tally_nonzero')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 4 -- SipStation auto-choice (V7.13)
// ---------------------------------------------------------------------------

describe('Group 4 -- SipStation auto-choice (V7.13)', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  function buildSipFixture(spawnX, sipAX, sipBX) {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: spawnX, y: 4 });
    s = model.addActor(s, 'main', { type: 'SipStation', x: sipAX, y: 4, id: 'sA', drink: 'A' });
    s = model.addActor(s, 'main', { type: 'SipStation', x: sipBX, y: 4, id: 'sB', drink: 'B' });
    return s;
  }

  it('Touch SipStation A only: sampledA=true, choice=null (one sample is not a preference)', function () {
    const s = buildSipFixture(4, 5, 9);
    const simObj = sim.createSim(s);
    // Walk one chip right onto SipStation A.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.sips.sampledA).toBe(true);
    expect(simObj.sips.sampledB).toBe(false);
    expect(simObj.sips.choice).toBeNull();
  });

  it('Touch SipStation A then SipStation B: sampledA+sampledB, choice="B" (the cup you END at)', function () {
    const s = buildSipFixture(4, 5, 9);
    const simObj = sim.createSim(s);
    // Walk onto A.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.sips.sampledA).toBe(true);
    expect(simObj.sips.choice).toBeNull();
    // Walk off A (one chip right).
    sim.movePlayer(simObj, 1, 0);
    // Walk to B (more chips right).
    sim.movePlayer(simObj, 1, 0);
    sim.movePlayer(simObj, 1, 0);
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(9);
    expect(simObj.sips.sampledA).toBe(true);
    expect(simObj.sips.sampledB).toBe(true);
    expect(simObj.sips.choice).toBe('B');
  });

  it('Touch B then A: choice="A" (the second-sip drink wins regardless of order)', function () {
    // Same fixture, but spawn closer to B so we hit B first.
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 9, y: 4 });
    s = model.addActor(s, 'main', { type: 'SipStation', x: 5, y: 4, id: 'sA', drink: 'A' });
    s = model.addActor(s, 'main', { type: 'SipStation', x: 10, y: 4, id: 'sB', drink: 'B' });
    const simObj = sim.createSim(s);
    // Walk right onto B.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(10);
    expect(simObj.sips.sampledB).toBe(true);
    expect(simObj.sips.choice).toBeNull();
    // Walk back left toward A; need to step off first then move toward A.
    sim.movePlayer(simObj, -1, 0); // off B at x=9
    sim.movePlayer(simObj, -1, 0); // x=8
    sim.movePlayer(simObj, -1, 0); // x=7
    sim.movePlayer(simObj, -1, 0); // x=6
    sim.movePlayer(simObj, -1, 0); // x=5 -> on A
    expect(simObj.player.x).toBe(5);
    expect(simObj.sips.sampledA).toBe(true);
    expect(simObj.sips.sampledB).toBe(true);
    expect(simObj.sips.choice).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// Group 5 -- ContextSlot one-way light
// ---------------------------------------------------------------------------

describe('Group 5 -- ContextSlot one-way light', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('Touch ContextSlot c1: sim.contextSlotsLit has "c1"', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'ContextSlot', x: 5, y: 4, id: 'c1', label: 'slot-1' });
    const simObj = sim.createSim(s);
    expect(simObj.contextSlotsLit.has('c1')).toBe(false);
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.contextSlotsLit.has('c1')).toBe(true);
  });

  it('Touch c1, walk away, walk back: c1 stays lit (one-way light, never unlit)', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'ContextSlot', x: 5, y: 4, id: 'c1', label: 'slot-1' });
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 1, 0); // onto c1
    expect(simObj.contextSlotsLit.has('c1')).toBe(true);
    sim.movePlayer(simObj, 1, 0); // away
    expect(simObj.contextSlotsLit.has('c1')).toBe(true);
    sim.movePlayer(simObj, -1, 0); // back onto c1
    expect(simObj.contextSlotsLit.has('c1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 6 -- GoalPad presence timer
// ---------------------------------------------------------------------------

describe('Group 6 -- GoalPad presence timer', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('Walk on GoalPad: timer is 0 initially; tick(sim, 500) -> timer = 500', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'GoalPad', x: 5, y: 4, triggerMs: 1500 });
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 1, 0); // onto pad
    expect(simObj.goalPadTimerMs).toBe(0);
    sim.tick(simObj, 500);
    expect(simObj.goalPadTimerMs).toBe(500);
    // Phase should not have cleared yet (500 < 1500).
    expect(simObj.phase).not.toBe('LEVEL_CLEARED');
  });

  it('Walk off GoalPad: timer resets to 0 on next tick (player off pad)', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'GoalPad', x: 5, y: 4, triggerMs: 1500 });
    const simObj = sim.createSim(s);
    sim.movePlayer(simObj, 1, 0);   // onto pad
    sim.tick(simObj, 500);
    expect(simObj.goalPadTimerMs).toBe(500);
    sim.movePlayer(simObj, 1, 0);   // off pad
    sim.tick(simObj, 100);
    expect(simObj.goalPadTimerMs).toBe(0);
  });

  it('Walk on GoalPad for triggerMs (1500ms) WITH all ContextSlots lit -> phase = LEVEL_CLEARED', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'ContextSlot', x: 5, y: 4, id: 'c1', label: 's1' });
    s = model.addActor(s, 'main', { type: 'GoalPad', x: 6, y: 4, triggerMs: 1500 });
    const simObj = sim.createSim(s);
    // Walk over the ContextSlot to light it.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.contextSlotsLit.has('c1')).toBe(true);
    // Walk onto the GoalPad.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(6);
    // Tick to trigger (1500ms exactly).
    sim.tick(simObj, 1500);
    expect(simObj.phase).toBe('LEVEL_CLEARED');
  });
});

// ---------------------------------------------------------------------------
// Group 7 -- Legacy actors (Key / QuestionDoor / Goal)
// ---------------------------------------------------------------------------

describe('Group 7 -- legacy actors', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('Touch Key: sim.keyCollected = true', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', { type: 'Key', x: 5, y: 4, id: 'k1' });
    const simObj = sim.createSim(s);
    expect(simObj.keyCollected).toBe(false);
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.keyCollected).toBe(true);
  });

  it('Walk through QuestionDoor with correct=true: phase -> KEY_HUNT (Key present) OR GOAL_AVAILABLE (no Key)', function () {
    // Variant A: Key present -> KEY_HUNT.
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', {
      type: 'QuestionDoor', x: 5, y: 4, id: 'q1', text: 'Q', correct: true, reflection: '',
    });
    s = model.addActor(s, 'main', { type: 'Key', x: 8, y: 4, id: 'k1' });
    const simA = sim.createSim(s);
    // Start phase = VOTING (has QuestionDoor, no SipStation).
    expect(simA.phase).toBe('VOTING');
    sim.movePlayer(simA, 1, 0); // walk through door
    expect(simA.phase).toBe('KEY_HUNT');

    // Variant B: no Key -> GOAL_AVAILABLE.
    let s2 = model.createState();
    s2 = model.addActor(s2, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s2 = model.addActor(s2, 'main', {
      type: 'QuestionDoor', x: 5, y: 4, id: 'q1', text: 'Q', correct: true, reflection: '',
    });
    const simB = sim.createSim(s2);
    expect(simB.phase).toBe('VOTING');
    sim.movePlayer(simB, 1, 0);
    expect(simB.phase).toBe('GOAL_AVAILABLE');
  });

  it('Walk through QuestionDoor with correct=false: phase = REFLECTION; after tick(sim, 4100ms) -> VOTING', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', {
      type: 'QuestionDoor', x: 5, y: 4, id: 'q1', text: 'Q', correct: false, reflection: 'Why',
    });
    const simObj = sim.createSim(s);
    expect(simObj.phase).toBe('VOTING');
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.phase).toBe('REFLECTION');
    expect(simObj.reflectionTimerMs).toBe(sim.REFLECTION_DWELL_MS);
    // Tick past the dwell window.
    sim.tick(simObj, 4100);
    expect(simObj.phase).toBe('VOTING');
    expect(simObj.reflectionTimerMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 8 -- fakeTally toggle
// ---------------------------------------------------------------------------

describe('Group 8 -- fakeTally toggle', function () {
  let model;
  let sim;
  beforeAll(function () {
    const env = loadEngineSandbox();
    model = env.model;
    sim = env.sim;
  });

  it('setFakeTally(sim, true): tally_nonzero gates open and the player walks through', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 4, y: 4 });
    s = model.addActor(s, 'main', {
      type: 'Gate', x: 5, y: 4, id: 'g-data', label: 'advance', predicate: 'tally_nonzero',
    });
    const simObj = sim.createSim(s);
    // Without fakeTally the gate is closed -> player blocked at x=4.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(4);
    expect(simObj.gateOpenIds.has('g-data')).toBe(false);
    // Turn on fakeTally.
    sim.setFakeTally(simObj, true);
    expect(sim.evalPredicate(simObj, 'tally_nonzero')).toBe(true);
    // Now the gate is passable -- walking through records it as walked-through
    // and advances the phase to GOAL_AVAILABLE.
    sim.movePlayer(simObj, 1, 0);
    expect(simObj.player.x).toBe(5);
    expect(simObj.gateOpenIds.has('g-data')).toBe(true);
    expect(simObj.phase).toBe('GOAL_AVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Group 9 -- UI: sim start/stop + actor placement disabled
// ---------------------------------------------------------------------------

describe('Group 9 -- UI: sim start/stop', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('simStart() returns the sim object, sets sim.phase, and simIsActive() returns true', function () {
    // Place a PlayerSpawn so createSim has somewhere to drop the player.
    env.LE.ui._test.placeActorAt('PlayerSpawn', 4, 4);
    const simObj = env.LE.ui._test.simStart();
    expect(simObj).not.toBeNull();
    expect(simObj).toBeDefined();
    expect(typeof simObj.phase).toBe('string');
    expect(simObj.player.x).toBe(4);
    expect(simObj.player.y).toBe(4);
    expect(env.LE.ui._test.simIsActive()).toBe(true);
  });

  it('simStop() resets simIsActive() to false and clears the sim handle', function () {
    env.LE.ui._test.placeActorAt('PlayerSpawn', 2, 2);
    env.LE.ui._test.simStart();
    expect(env.LE.ui._test.simIsActive()).toBe(true);
    env.LE.ui._test.simStop();
    expect(env.LE.ui._test.simIsActive()).toBe(false);
    expect(env.LE.ui._test.simGetSim()).toBeNull();
  });

  it('After simStart, placing actors via the public canvas-click path is a no-op (sim mode blocks placement)', function () {
    // Place a PlayerSpawn pre-sim so createSim works.
    env.LE.ui._test.placeActorAt('PlayerSpawn', 4, 4);
    env.LE.ui._test.simStart();
    expect(env.LE.ui._test.simIsActive()).toBe(true);

    const beforeCount = env.LE.ui._test.getState().actors.length;
    // Drive the editor as if the user clicked the Gate palette tile + the
    // canvas. handlePaletteClick should no-op during sim, and a synthesized
    // canvas click should also no-op via handleCanvasClick's simActive guard.
    env.LE.ui._test.handlePaletteClick('Gate');
    expect(env.LE.ui._test.getActiveTool()).toBeNull(); // palette refused

    // Synthesize a click event on the canvas in case anyone forgets the
    // palette path. CHIP_PX=30, GRID_LEFT_PAD=20 -> chip (5, 5) ~ pixel
    // (20 + 5*30 + 15, 20 + 5*30 + 15) = (185, 185).
    const canvas = env.document.getElementById('le-grid');
    const evt = new env.window.MouseEvent('click', {
      bubbles: true,
      button: 0,
      clientX: 185,
      clientY: 185,
    });
    canvas.dispatchEvent(evt);

    const afterCount = env.LE.ui._test.getState().actors.length;
    expect(afterCount).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// Group 10 -- UI: arrow keys reroute to simMovePlayer
// ---------------------------------------------------------------------------

describe('Group 10 -- UI: arrow keys reroute to simMovePlayer', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('After simStart, simMovePlayer() moves sim.player.x and leaves selected actors untouched', function () {
    // Build a state with a PlayerSpawn + a Goal we will "select".
    env.LE.ui._test.placeActorAt('PlayerSpawn', 4, 4);
    env.LE.ui._test.placeActorAt('Goal', 10, 4);

    // Select the Goal so the editor would normally nudge IT on arrow keys.
    env.LE.ui._test.selectActor('main', 1);
    const goalBefore = env.LE.ui._test.getState().actors[1];
    const goalXBefore = goalBefore.x;
    const goalYBefore = goalBefore.y;

    // Now enter sim mode.
    const simObj = env.LE.ui._test.simStart();
    expect(simObj.player.x).toBe(4);

    // Drive a "right arrow" by calling the test sim mover directly.
    env.LE.ui._test.simMovePlayer(1, 0);
    expect(env.LE.ui._test.simGetSim().player.x).toBe(5);

    // The Goal at index 1 should NOT have moved.
    const goalAfter = env.LE.ui._test.getState().actors[1];
    expect(goalAfter.x).toBe(goalXBefore);
    expect(goalAfter.y).toBe(goalYBefore);
  });
});

// ---------------------------------------------------------------------------
// Group 11 -- Integration: full U1.1 walkthrough
// ---------------------------------------------------------------------------

describe('Group 11 -- integration: U1.1 walkthrough', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  /**
   * Walk the player TO target chip (tx, ty) using simMovePlayer one chip at
   * a time. Bails after a generous step budget so a soft-block can't loop
   * forever. Returns the final position.
   */
  function walkTo(env, tx, ty) {
    const maxSteps = 200;
    let steps = 0;
    while (steps < maxSteps) {
      const sim = env.LE.ui._test.simGetSim();
      if (!sim) break;
      const px = sim.player.x;
      const py = sim.player.y;
      if (px === tx && py === ty) break;
      if (px !== tx) {
        env.LE.ui._test.simMovePlayer(px < tx ? 1 : -1, 0);
      } else {
        env.LE.ui._test.simMovePlayer(0, py < ty ? 1 : -1);
      }
      const after = env.LE.ui._test.simGetSim();
      if (after.player.x === px && after.player.y === py) break; // soft-block
      steps++;
    }
    const finalSim = env.LE.ui._test.simGetSim();
    return { x: finalSim.player.x, y: finalSim.player.y, steps: steps };
  }

  it('U1.1 walkthrough: sips A+B record choice, scanner gate opens, advance gate clears with fakeTally, ContextSlots light, GoalPad presence clears the level', function () {
    // Step 1 -- load U1.1 into the editor.
    const u1State = env.LE.model.deserialize(U1_1_JSON);
    env.LE.ui._test.setStateForTest(u1State);

    // Step 2 -- strip the two between-gates that are predicate=always_false
    // (g-brand at x=64 and g-better at x=76). These exist in U1.1 as Zone-4
    // teaching moments but block movement to the advance gate in a sim
    // walkthrough that doesn't bother voting. The integration test exercises
    // mechanics order, not the Zone-4 voting puzzle.
    const stripped = JSON.parse(JSON.stringify(u1State));
    stripped.actors = stripped.actors.filter(function (a) {
      return !(a.type === 'Gate' && (a.id === 'g-brand' || a.id === 'g-better'));
    });
    env.LE.ui._test.setStateForTest(stripped);

    // Step 3 -- start sim and enable fakeTally so the advance gate is passable.
    const sim = env.LE.ui._test.simStart();
    expect(sim).not.toBeNull();
    expect(sim.player.x).toBe(4);
    expect(sim.player.y).toBe(4);
    env.LE.ui._test.simSetFakeTally(true);
    expect(sim.fakeTally).toBe(true);

    // Step 4 -- walk to SipStation A at (8, 2).
    walkTo(env, 8, 2);
    expect(sim.player.x).toBe(8);
    expect(sim.player.y).toBe(2);
    expect(sim.sips.sampledA).toBe(true);
    expect(sim.sips.sampledB).toBe(false);
    expect(sim.sips.choice).toBeNull();

    // Step 5 -- walk to SipStation B at (24, 2). The cup we END at = choice.
    walkTo(env, 24, 2);
    expect(sim.player.x).toBe(24);
    expect(sim.player.y).toBe(2);
    expect(sim.sips.sampledA).toBe(true);
    expect(sim.sips.sampledB).toBe(true);
    expect(sim.sips.choice).toBe('B');

    // Step 6 -- walk to the scanner Gate at (40, 3). Predicate
    // every_player_row_complete is now satisfied (sampledA+B+choice), so the
    // player should land on the gate chip.
    walkTo(env, 40, 3);
    expect(sim.player.x).toBe(40);
    expect(sim.player.y).toBe(3);
    expect(sim.gateOpenIds.has('g-scanner')).toBe(true);

    // Step 7 -- walk to the advance Gate at (88, 6). Predicate tally_nonzero
    // is true (fakeTally=true), so the player should land on the gate chip,
    // and walking through the advance gate flips the phase to GOAL_AVAILABLE.
    walkTo(env, 88, 6);
    expect(sim.player.x).toBe(88);
    expect(sim.player.y).toBe(6);
    expect(sim.gateOpenIds.has('g-data')).toBe(true);
    expect(sim.phase).toBe('GOAL_AVAILABLE');

    // Step 8 -- walk through ContextSlots at (89, 5), (91, 5), (93, 5).
    walkTo(env, 89, 5);
    expect(sim.contextSlotsLit.has('cs-q')).toBe(true);
    walkTo(env, 91, 5);
    expect(sim.contextSlotsLit.has('cs-v')).toBe(true);
    walkTo(env, 93, 5);
    expect(sim.contextSlotsLit.has('cs-c')).toBe(true);

    // Step 9 -- walk onto the GoalPad at (95, 7), then drive the timer.
    walkTo(env, 95, 7);
    expect(sim.player.x).toBe(95);
    expect(sim.player.y).toBe(7);
    // Tick the GoalPad presence timer to trigger (default 1500ms).
    env.LE.ui._test.simStep(1500);
    expect(sim.phase).toBe('LEVEL_CLEARED');
  });
});
