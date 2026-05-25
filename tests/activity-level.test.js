// activity-level.test.js
// Unit tests for activity-level.js (V7 Level scene renderer).
// Mirrors the V6 tests/activity-colorbox-grid.test.js pattern:
// vm context + JSDOM minimal document + 2D-context-recording stub.
//
// ASCII-only.  LF line endings.

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SRC = readFileSync(resolve(REPO_ROOT, 'activity-level.js'), 'utf8');

// 2D context stub: records every draw call into arrays so tests can assert
// without a real canvas.
function makeCtxStub() {
  var stub = {
    fillStyle:    '#000',
    strokeStyle:  '#000',
    lineWidth:    1,
    font:         '10px sans-serif',
    textAlign:    'left',
    textBaseline: 'alphabetic',
    globalAlpha:  1.0,

    rects:   [],
    strokes: [],
    texts:   [],
    arcs:    [],
    fills:   0,
    strokesCount: 0,
    saves:   0,
    restores:0,

    fillRect: function (x, y, w, h) {
      this.rects.push({ x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    strokeRect: function (x, y, w, h) {
      this.strokes.push({ x, y, w, h, stroke: this.strokeStyle });
    },
    fillText: function (text, x, y) {
      this.texts.push({ text: String(text), x, y, fill: this.fillStyle, font: this.font });
    },
    measureText: function (text) { return { width: String(text).length * 7 }; },
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    stroke: function () { this.strokesCount++; },
    arc: function (cx, cy, r, sa, ea) {
      this.arcs.push({ cx, cy, r, sa, ea, stroke: this.strokeStyle, fill: this.fillStyle });
    },
    fill: function () { this.fills++; },
    closePath: function () {},
    save: function () { this.saves++; },
    restore: function () { this.restores++; },
    scale: function () {},
    setTransform: function () {}
  };
  return stub;
}

function loadModule() {
  // Per-test JSDOM so the tooltip DOM doesn't bleed between cases.
  var dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount" style="width:768px;height:384px;position:relative"></div></body></html>', {
    url: 'https://example.com'
  });
  var win = dom.window;
  var lastStub = null;
  win.HTMLCanvasElement.prototype.getContext = function () {
    lastStub = makeCtxStub();
    return lastStub;
  };

  var fakeWindow = {};
  var ctx = createContext({
    window:            fakeWindow,
    document:          win.document,
    module:            { exports: {} },
    HTMLCanvasElement: win.HTMLCanvasElement,
    Math:              Math
  });
  runInContext(SRC, ctx);

  return {
    win:    win,
    dom:    dom,
    module: fakeWindow.ActivityLevel,
    lastStub: function () { return lastStub; }
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeLevelDef(extras) {
  var def = {
    schema: 'v7-level-1',
    levelKey: 'U1.1',
    lessonKey: '1.1',
    title: 'The Cola Mystery',
    duration: 180,
    map: { width: 32, height: 16, chipSize: 24 },
    actors: [
      { type: 'Text', x: 4, y: 2, text: 'Welcome to AP Stats!' },
      { type: 'SipStation', id: 's1', x:  6, y: 6, drink: 'A' },
      { type: 'SipStation', id: 's2', x: 12, y: 6, drink: 'A' },
      { type: 'SipStation', id: 's3', x: 18, y: 6, drink: 'B' },
      { type: 'SipStation', id: 's4', x: 24, y: 6, drink: 'B' },
      { type: 'PlayerSpawn', x: 4, y: 12 },
      { type: 'TallyDisplay', x: 16, y: 10, binds: 'tally.sips' },
      { type: 'QuestionDoor', id: 'd1', x:  6, y: 14, text: 'Is Cup A Coke?',           correct: false, reflection: 'Numbers do not say what is in cups.' },
      { type: 'QuestionDoor', id: 'd2', x: 16, y: 14, text: 'Can students tell A from B?', correct: true },
      { type: 'QuestionDoor', id: 'd3', x: 26, y: 14, text: 'Is Coke better than Pepsi?',  correct: false, reflection: 'Statistics observes; it does not decide quality.' },
      { type: 'Goal', x: 16, y: 15 }
    ],
    reflection_room: {
      map: { width: 16, height: 8, chipSize: 24 },
      actors: [
        { type: 'Text', x: 8, y: 2, text: 'Reflection placeholder.' },
        { type: 'ReturnWarp', x: 8, y: 6 }
      ]
    }
  };
  if (extras) { Object.keys(extras).forEach(function (k) { def[k] = extras[k]; }); }
  return def;
}

function makeActivityState(extras) {
  var s = {
    levelKey:   'U1.1',
    lessonKey:  '1.1',
    startedAt:  1000,
    durationMs: 180000,
    state: {
      players: {
        alice: { x: 100, y: 300, inReflection: false },
        bob:   { x: 200, y: 300, inReflection: false }
      },
      coins: [
        { id: 's1', collected: false },
        { id: 's2', collected: true  },
        { id: 's3', collected: false },
        { id: 's4', collected: false }
      ],
      switches: [
        { id: 'd1', voteCount: 0, pressed: false },
        { id: 'd2', voteCount: 1, pressed: false },
        { id: 'd3', voteCount: 0, pressed: false }
      ],
      gates: [
        { id: 'd1', opened: false },
        { id: 'd2', opened: false },
        { id: 'd3', opened: false }
      ],
      goal: { reached: false, reachedBy: null },
      reflection: { active: false, doorId: null, returnedCount: 0, totalCount: 2 },
      tally: { sips: { A: 1, B: 0 }, votes: { d1: 0, d2: 1, d3: 0 } }
    },
    level: makeLevelDef()
  };
  if (extras) { Object.keys(extras).forEach(function (k) { s[k] = extras[k]; }); }
  return s;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityLevel module', function () {
  it('attaches ActivityLevel to window with mount()', function () {
    var env = loadModule();
    expect(env.module).toBeDefined();
    expect(typeof env.module.mount).toBe('function');
  });

  it('exposes _hashStringToHue parity helper', function () {
    var env = loadModule();
    expect(typeof env.module._hashStringToHue).toBe('function');
    // Reference hash from classroom-board.js semantics.
    // hashStringToHue('alice') must equal an in-range hue.
    var h = env.module._hashStringToHue('alice');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});

describe('ActivityLevel.mount() handle shape', function () {
  it('returns handle with destroy/updateState/showOutcome methods', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.updateState).toBe('function');
    expect(typeof handle.showOutcome).toBe('function');
  });

  it('appends a canvas element to mountEl', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    expect(mount.querySelector('canvas')).toBeNull();
    env.module.mount(mount, { width: 768, height: 384 });
    expect(mount.querySelector('canvas')).not.toBeNull();
  });

  it('returns a noop handle when mountEl is null (no throw)', function () {
    var env = loadModule();
    expect(function () { env.module.mount(null, {}); }).not.toThrow();
    var h = env.module.mount(null, {});
    expect(function () { h.updateState({}); }).not.toThrow();
    expect(function () { h.showOutcome('success'); }).not.toThrow();
    expect(function () { h.destroy(); }).not.toThrow();
  });
});

describe('updateState renders the static actor layer', function () {
  it('renders fillRect calls for actor backgrounds (Text + SipStation + Door + Goal)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // We expect MANY fillRects: background + every actor's body.
    // Anything > 6 is plenty.
    expect(stub.rects.length).toBeGreaterThan(6);
  });

  it('renders SipStation actors as filled rects (greyed when collected)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // collected SipStation uses the SIPSTATION_GREY fill (#5a5a5a) at faded alpha 0.4.
    var greyFill = stub.rects.filter(function (r) {
      return r.fill === '#5a5a5a';
    });
    expect(greyFill.length).toBeGreaterThan(0);
    var greyFaded = greyFill.find(function (r) { return Math.abs(r.alpha - 0.4) < 0.01; });
    expect(greyFaded).toBeDefined();

    // Non-collected SipStation uses the SIPSTATION_FILL (#55ccbb).
    var liveFill = stub.rects.find(function (r) { return r.fill === '#55ccbb'; });
    expect(liveFill).toBeDefined();
  });

  it('renders QuestionDoor actors with text labels', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.some(function (s) { return s.indexOf('Is Cup A Coke?') !== -1; })).toBe(true);
    expect(labels.some(function (s) { return s.indexOf('Can students tell') !== -1; })).toBe(true);
    expect(labels.some(function (s) { return s.indexOf('Is Coke better than') !== -1; })).toBe(true);
  });

  it('renders Goal as a gold-filled rect with "GOAL" label', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var goalRect = stub.rects.find(function (r) { return r.fill === '#ffcc33'; });
    expect(goalRect).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('GOAL');
  });

  it('renders TallyDisplay panel with bound tally value (A: 1   B: 0)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    // The tally serializer formats { A: 1, B: 0 } as "A: 1   B: 0".
    expect(labels.some(function (s) { return /A:\s*1/.test(s) && /B:\s*0/.test(s); })).toBe(true);
  });

  it('does not throw on minimal state without a level block on first call', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    expect(function () { handle.updateState({}); }).not.toThrow();
    expect(function () { handle.updateState(null); }).not.toThrow();
  });
});

describe('Player rendering', function () {
  it('renders a 16x16 player rect for every player in state.players', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // Player rects are 16x16; assert at least 2 such rects (alice + bob).
    var playerRects = stub.rects.filter(function (r) { return r.w === 16 && r.h === 16; });
    expect(playerRects.length).toBeGreaterThanOrEqual(2);
  });

  it('places player rect at the expected pixel position (alice at x=100,y=300)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // Player rect is drawn at (posX - 8, posY - 8).  alice = (100, 300) ->
    // top-left = (92, 292).
    var alicePlayer = stub.rects.find(function (r) {
      return r.w === 16 && r.h === 16 && r.x === 92 && r.y === 292;
    });
    expect(alicePlayer).toBeDefined();
  });

  it('tints player rect with hsl(hue, 70%, 50%) from username hash', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var aliceHue = env.module._hashStringToHue('alice');
    var expectedFill = 'hsl(' + aliceHue + ', 70%, 50%)';
    var alicePlayer = stub.rects.find(function (r) {
      return r.w === 16 && r.h === 16 && r.fill === expectedFill;
    });
    expect(alicePlayer).toBeDefined();
  });

  it('renders the username label above each player', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('alice');
    expect(labels).toContain('bob');
  });
});

describe('Tooltip', function () {
  it('appears in the DOM when local player is within proximity of a Text actor', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    // Place alice right on top of the Text actor at (4*24, 2*24) = (96, 48).
    var state = makeActivityState();
    state.state.players.alice = { x: 96, y: 48, inReflection: false };
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(state);
    var tip = mount.querySelector('.activity-level-tooltip');
    expect(tip).not.toBeNull();
    expect(tip.textContent.indexOf('Welcome to AP Stats!')).toBeGreaterThanOrEqual(0);
  });

  it('hides tooltip when local player moves away from the Text actor', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var state = makeActivityState();
    state.state.players.alice = { x: 96, y: 48, inReflection: false };
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    handle.updateState(state);
    expect(mount.querySelector('.activity-level-tooltip')).not.toBeNull();
    // Now move alice far away (well outside the 32 px proximity radius).
    state.state.players.alice = { x: 500, y: 350, inReflection: false };
    handle.updateState(state);
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });

  it('does NOT show tooltip when there is no currentUsername (observer Desk)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var state = makeActivityState();
    state.state.players.alice = { x: 96, y: 48, inReflection: false };
    var handle = env.module.mount(mount, { width: 768, height: 384 /* no currentUsername */ });
    handle.updateState(state);
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });
});

describe('Reflection mode', function () {
  it('switches to reflection_room actors when reflection.active is true', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    // Start with the main scene first so _levelDef is captured.
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var beforeLabels = stub.texts.map(function (t) { return t.text; });
    // Main scene has 'Is Cup A Coke?' on a QuestionDoor.
    expect(beforeLabels.some(function (s) { return s.indexOf('Is Cup A Coke?') !== -1; })).toBe(true);

    // Clear the stub so the second call's draws are inspected in isolation.
    stub.rects.length = 0;
    stub.strokes.length = 0;
    stub.texts.length = 0;
    stub.arcs.length = 0;

    // Now flip into reflection mode for door d1.
    var nextState = makeActivityState();
    nextState.state.reflection = { active: true, doorId: 'd1', returnedCount: 0, totalCount: 2 };
    handle.updateState(nextState);
    var afterLabels = stub.texts.map(function (t) { return t.text; });
    // Reflection room has the placeholder Text AND the RETURN warp label.
    expect(afterLabels).toContain('RETURN');
    // Main-scene QuestionDoor labels should NOT appear (reflection room
    // does not contain any QuestionDoor actors).
    expect(afterLabels.some(function (s) { return s.indexOf('Is Cup A Coke?') !== -1; })).toBe(false);
  });

  it('renders the chosen door reflection text panel', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    var nextState = makeActivityState();
    nextState.state.reflection = { active: true, doorId: 'd1', returnedCount: 0, totalCount: 2 };
    handle.updateState(nextState);
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.some(function (s) {
      return s.indexOf('Numbers do not say what is in cups.') !== -1;
    })).toBe(true);
  });
});

describe('Outcome rendering', function () {
  it('showOutcome("success") renders a green overlay + LEVEL CLEARED label', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    handle.showOutcome('success');
    var stub = env.lastStub();
    // Green-ish overlay: rgba(40, 200, 90, 0.45)
    var greenOverlay = stub.rects.find(function (r) {
      return String(r.fill).indexOf('40, 200, 90') !== -1;
    });
    expect(greenOverlay).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('LEVEL CLEARED!');
  });

  it('showOutcome("timeout") renders orange overlay + TIME UP label', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    handle.showOutcome('timeout');
    var stub = env.lastStub();
    var orange = stub.rects.find(function (r) {
      return String(r.fill).indexOf('230, 140, 40') !== -1;
    });
    expect(orange).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('TIME UP');
  });

  it('showOutcome("cancel") renders gray overlay + CANCELLED label', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.updateState(makeActivityState());
    handle.showOutcome('cancel');
    var stub = env.lastStub();
    var gray = stub.rects.find(function (r) {
      return String(r.fill).indexOf('120, 120, 120') !== -1;
    });
    expect(gray).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('CANCELLED');
  });
});

describe('Destroy', function () {
  it('destroy removes the canvas and tooltip from the DOM', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384, currentUsername: 'alice' });
    var state = makeActivityState();
    state.state.players.alice = { x: 96, y: 48, inReflection: false };
    handle.updateState(state);
    expect(mount.querySelector('canvas')).not.toBeNull();
    expect(mount.querySelector('.activity-level-tooltip')).not.toBeNull();
    handle.destroy();
    expect(mount.querySelector('canvas')).toBeNull();
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });

  it('destroy is idempotent', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 768, height: 384 });
    handle.destroy();
    expect(function () { handle.destroy(); }).not.toThrow();
    expect(function () { handle.updateState(makeActivityState()); }).not.toThrow();
    expect(function () { handle.showOutcome('success'); }).not.toThrow();
  });
});
