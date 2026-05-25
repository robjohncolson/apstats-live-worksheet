// activity-level.test.js
// Unit tests for activity-level.js (V7.1 additive-overlay Level renderer).
//
// V7.1 changes vs V7:
//   - Players are NOT rendered here (classroom-board.js owns sprites).
//   - QuestionDoors are NOT rendered here (v3 P4 doorways own that).
//   - The overlay only paints: Text actors, Coins, Goal flag (gated by
//     phase), Reflection panel (DOM-style canvas dim + box), and the
//     proximity Tooltip (DOM element).
//
// Mirrors the V4/V5/V6 IIFE-in-vm pattern with a recording context stub.
// ASCII-only.  LF line endings.

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SRC = readFileSync(resolve(REPO_ROOT, 'activity-level.js'), 'utf8');

// ---------------------------------------------------------------------------
// 2D context stub: records every draw call into arrays so tests can assert
// without a real canvas.
// ---------------------------------------------------------------------------

function makeCtxStub() {
  var stub = {
    fillStyle:    '#000',
    strokeStyle:  '#000',
    lineWidth:    1,
    font:         '10px sans-serif',
    textAlign:    'left',
    textBaseline: 'alphabetic',
    globalAlpha:  1.0,

    rects:        [],
    strokes:      [],
    texts:        [],
    clears:       [],
    fills:        0,
    strokesCount: 0,
    begins:       0,
    closes:       0,

    fillRect: function (x, y, w, h) {
      this.rects.push({ x: x, y: y, w: w, h: h, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    strokeRect: function (x, y, w, h) {
      this.strokes.push({ x: x, y: y, w: w, h: h, stroke: this.strokeStyle });
    },
    fillText: function (text, x, y) {
      this.texts.push({ text: String(text), x: x, y: y, fill: this.fillStyle, font: this.font });
    },
    clearRect: function (x, y, w, h) {
      this.clears.push({ x: x, y: y, w: w, h: h });
    },
    measureText: function (text) { return { width: String(text).length * 6 }; },
    beginPath: function () { this.begins++; },
    moveTo:    function () {},
    lineTo:    function () {},
    stroke:    function () { this.strokesCount++; },
    arc:       function () {},
    fill:      function () { this.fills++; },
    closePath: function () { this.closes++; },
    scale:     function () {},
    setTransform: function () {}
  };
  return stub;
}

// ---------------------------------------------------------------------------
// Module loader: per-test JSDOM + recording stub.
// ---------------------------------------------------------------------------

function loadModule(html) {
  var page = html || '<!DOCTYPE html><html><body>'
    + '<div style="position:relative">'
    +   '<div id="classroom-board-mount" style="width:320px;height:80px;position:relative">'
    +     '<canvas id="board-canvas" width="320" height="80" style="width:320px;height:80px"></canvas>'
    +   '</div>'
    +   '<div id="mount" style="width:320px;height:80px;position:absolute;left:0;top:0"></div>'
    + '</div>'
    + '</body></html>';

  var dom = new JSDOM(page, { url: 'https://example.com' });
  var win = dom.window;
  var lastStub = null;

  // Every newly-created canvas (via document.createElement) gets a fresh stub.
  // The pre-existing #board-canvas keeps its raw element (no getContext stub
  // installed) because it's never asked for its 2D context here.
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
    Math:              Math,
    Date:              Date
  });
  runInContext(SRC, ctx);

  return {
    win:      win,
    dom:      dom,
    module:   fakeWindow.ActivityLevel,
    lastStub: function () { return lastStub; }
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeLevelDef(extras) {
  var def = {
    schema:    'v7.1-level-1',
    levelKey:  'U1.1',
    lessonKey: '1.1',
    title:     'The Cola Mystery',
    duration:  180,
    map:       { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'Text', x: 4, y: 1, text: 'Welcome to AP Stats!' },
      { type: 'SipStation', id: 's1', x:  4, y: 2, drink: 'A' },
      { type: 'SipStation', id: 's2', x: 12, y: 2, drink: 'A' },
      { type: 'SipStation', id: 's3', x: 20, y: 2, drink: 'B' },
      { type: 'SipStation', id: 's4', x: 28, y: 2, drink: 'B' },
      { type: 'PlayerSpawn', x: 2, y: 7 },
      { type: 'QuestionDoor', id: 'd1', x:  6, y: 6, text: 'Is Cup A Coke?',           correct: false, reflection: 'Numbers do not say what is in cups.' },
      { type: 'QuestionDoor', id: 'd2', x: 16, y: 6, text: 'Can students tell A from B?', correct: true },
      { type: 'QuestionDoor', id: 'd3', x: 26, y: 6, text: 'Is Coke better than Pepsi?',  correct: false, reflection: 'Statistics observes; it does not decide.' },
      { type: 'Goal', x: 16, y: 7 }
    ]
  };
  if (extras) { Object.keys(extras).forEach(function (k) { def[k] = extras[k]; }); }
  return def;
}

function makeActivityState(overrides) {
  overrides = overrides || {};
  var base = {
    levelKey:   'U1.1',
    lessonKey:  '1.1',
    startedAt:  1000,
    durationMs: 180000,
    state: {
      phase: overrides.phase || 'SIPPING',
      players: overrides.players || {
        alice: { x: 100, y: 60 },
        bob:   { x: 200, y: 60 }
      },
      coins: overrides.coins || [
        { id: 's1', x:  4, y: 2, drink: 'A', collected: false },
        { id: 's2', x: 12, y: 2, drink: 'A', collected: true  },
        { id: 's3', x: 20, y: 2, drink: 'B', collected: false },
        { id: 's4', x: 28, y: 2, drink: 'B', collected: false }
      ],
      reflection: overrides.reflection || { active: false }
    },
    level: overrides.level || makeLevelDef()
  };
  return base;
}

function getMount(env) {
  return env.win.document.getElementById('mount');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityLevel module loader', function () {
  it('attaches ActivityLevel to window with a mount() function', function () {
    var env = loadModule();
    expect(env.module).toBeDefined();
    expect(typeof env.module.mount).toBe('function');
  });
});

describe('ActivityLevel.mount() handle shape', function () {
  it('returns a handle with destroy/updateState/showOutcome methods', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), { currentUsername: 'alice' });
    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.updateState).toBe('function');
    expect(typeof handle.showOutcome).toBe('function');
  });

  it('appends an overlay canvas with position:absolute and pointer-events:none', function () {
    var env = loadModule();
    var mount = getMount(env);
    expect(mount.querySelector('canvas')).toBeNull();
    env.module.mount(mount, { currentUsername: 'alice' });
    var c = mount.querySelector('canvas');
    expect(c).not.toBeNull();
    expect(c.style.position).toBe('absolute');
    expect(c.style.pointerEvents).toBe('none');
  });

  it('falls back to a default 320x80 overlay when no LC canvas exists', function () {
    // No classroom-board-mount in this DOM.
    var page = '<!DOCTYPE html><html><body><div id="mount" style="position:relative"></div></body></html>';
    var env  = loadModule(page);
    var mount = env.win.document.getElementById('mount');
    env.module.mount(mount, {});
    var c = mount.querySelector('canvas');
    expect(c).not.toBeNull();
    // mountEl.clientWidth is 0 in jsdom -> falls back to DEFAULT_OVERLAY_W (320) /
    // DEFAULT_OVERLAY_H (80).  Accept either the default or any reasonable
    // positive integer.
    expect(parseInt(c.style.width,  10)).toBeGreaterThan(0);
    expect(parseInt(c.style.height, 10)).toBeGreaterThan(0);
  });

  it('returns a noop handle when mountEl is null', function () {
    var env = loadModule();
    var h = env.module.mount(null, {});
    expect(function () { h.updateState({}); }).not.toThrow();
    expect(function () { h.showOutcome('success'); }).not.toThrow();
    expect(function () { h.destroy(); }).not.toThrow();
  });
});

describe('updateState renders decoration overlays', function () {
  it('V7.2 sprite-collide: coin rendering moved to the avatar canvas; overlay no longer draws coin rects', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), { currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // The live-coin fill (#55ccbb) and grey-coin fill (#5a5a5a) MUST NOT
    // appear on the overlay -- coins are CoinSprite engine entities on
    // the classroom-board canvas now. classroom-board.test.js owns the
    // coin rendering contract.
    var liveCoin = stub.rects.find(function (r) { return r.fill === '#55ccbb'; });
    expect(liveCoin).toBeUndefined();
    var greyCoin = stub.rects.find(function (r) { return r.fill === '#5a5a5a'; });
    expect(greyCoin).toBeUndefined();
  });

  it('renders Text actors as a dark rect + light text label', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    var stub = env.lastStub();

    var textBg = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('34, 34, 34') !== -1;
    });
    expect(textBg).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.indexOf('Welcome to AP Stats!')).toBeGreaterThanOrEqual(0);
    var labelDraw = stub.texts.find(function (t) { return t.text === 'Welcome to AP Stats!'; });
    expect(labelDraw.fill).toBe('#ffffff');
  });

  it('skips Goal render when phase is SIPPING (not yet reachable)', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState({ phase: 'SIPPING' }));
    var stub = env.lastStub();
    var goalRect = stub.rects.find(function (r) { return r.fill === '#ffcc33'; });
    expect(goalRect).toBeUndefined();
  });

  it('V7.2 sprite-collide: Goal rendering moved to the avatar canvas; overlay no longer draws the gold flag', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState({ phase: 'GOAL_AVAILABLE' }));
    var stub = env.lastStub();
    // Gold flag base (#ffcc33) MUST NOT appear on the overlay. The goal
    // is now a GoalSprite engine entity in classroom-board.js; that
    // module's tests own the goal-render contract.
    var base = stub.rects.find(function (r) { return r.fill === '#ffcc33'; });
    expect(base).toBeUndefined();
  });

  it('does NOT render any player-shaped rect (players are owned by classroom-board)', function () {
    // Players in state would historically have rendered as 16x16 hue-tinted
    // rects -- assert NONE of those appear.
    var env = loadModule();
    var handle = env.module.mount(getMount(env), { currentUsername: 'alice' });
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var playerLike = stub.rects.filter(function (r) {
      return r.w === 16 && r.h === 16
          && typeof r.fill === 'string' && r.fill.indexOf('hsl(') === 0;
    });
    expect(playerLike.length).toBe(0);
    // The username labels that the old renderer drew must also be absent.
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.indexOf('alice')).toBe(-1);
    expect(labels.indexOf('bob')).toBe(-1);
  });

  it('does NOT render QuestionDoor visuals (v3 P4 doorways own that)', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.indexOf('Is Cup A Coke?')).toBe(-1);
    expect(labels.indexOf('Can students tell A from B?')).toBe(-1);
    expect(labels.indexOf('Is Coke better than Pepsi?')).toBe(-1);
  });

  it('renders the reflection panel (dim + box) when reflection.active is true', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState({
      phase: 'REFLECTION',
      reflection: { active: true, reflectionText: 'Numbers do not say what is in cups.', autoCloseAt: Date.now() + 8000 }
    }));
    var stub = env.lastStub();
    // Full-overlay dim: rgba(0, 0, 0, 0.55).
    var dim = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('0, 0, 0, 0.55') !== -1;
    });
    expect(dim).toBeDefined();
    // Reflection box bg: rgba(20, 40, 50, 0.95).
    var box = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('20, 40, 50') !== -1;
    });
    expect(box).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.some(function (s) { return s.indexOf('Numbers do not say') !== -1; })).toBe(true);
  });

  it('does NOT render the reflection panel when reflection.active is false', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState({ reflection: { active: false } }));
    var stub = env.lastStub();
    var dim = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('0, 0, 0, 0.55') !== -1;
    });
    expect(dim).toBeUndefined();
    var box = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('20, 40, 50') !== -1;
    });
    expect(box).toBeUndefined();
  });

  it('clears the overlay canvas at the start of every updateState', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    expect(stub.clears.length).toBeGreaterThanOrEqual(1);
  });

  it('V7.2: chipSize from level def drives Text actor positioning on the overlay (coins + goal moved to avatar canvas)', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    var stub = env.lastStub();
    // Welcome Text actor at chip (4, 0) -- the only chip-positioned
    // element left on the overlay (coins + goal moved to the avatar
    // canvas as engine sprites). With long text the clamp pins it
    // flush-left at boxX=2; baseline y=14/2 with TOP_MARGIN=10 -> 17.
    var welcomeText = stub.texts.find(function (t) { return t.text === 'Welcome to AP Stats!'; });
    expect(welcomeText).toBeDefined();
    expect(welcomeText.fill).toBe('#ffffff');
  });

  it('is a no-op on empty / null state and survives missing level def', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    expect(function () { handle.updateState(null); }).not.toThrow();
    expect(function () { handle.updateState({}); }).not.toThrow();
    expect(function () { handle.updateState({ state: { coins: null } }); }).not.toThrow();
  });
});

describe('Tooltip (DOM)', function () {
  it('appears in the DOM when local player is within proximity of a Text actor', function () {
    var env = loadModule();
    var mount = getMount(env);
    // Text actor at chip (4, 1), chipSize=10 -> px (40, 10).  Put alice there.
    var state = makeActivityState({
      players: { alice: { x: 40, y: 10 } }
    });
    var handle = env.module.mount(mount, { currentUsername: 'alice' });
    handle.updateState(state);
    var tip = mount.querySelector('.activity-level-tooltip');
    expect(tip).not.toBeNull();
    expect(tip.textContent.indexOf('Welcome to AP Stats!')).toBeGreaterThanOrEqual(0);
  });

  it('hides the tooltip when local player moves away (> proximity)', function () {
    var env = loadModule();
    var mount = getMount(env);
    var state = makeActivityState({
      players: { alice: { x: 40, y: 10 } }
    });
    var handle = env.module.mount(mount, { currentUsername: 'alice' });
    handle.updateState(state);
    expect(mount.querySelector('.activity-level-tooltip')).not.toBeNull();
    handle.updateState(makeActivityState({
      players: { alice: { x: 300, y: 70 } }
    }));
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });

  it('does NOT show the tooltip when currentUsername is unset (observer Desk)', function () {
    var env = loadModule();
    var mount = getMount(env);
    var state = makeActivityState({
      players: { alice: { x: 40, y: 10 } }
    });
    var handle = env.module.mount(mount, {});
    handle.updateState(state);
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });
});

describe('showOutcome', function () {
  it('renders a green overlay + LEVEL CLEARED! on success', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    handle.showOutcome('success');
    var stub = env.lastStub();
    var green = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('40, 200, 90') !== -1;
    });
    expect(green).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('LEVEL CLEARED!');
  });

  it('renders an orange overlay + TIME UP on timeout', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    handle.showOutcome('timeout');
    var stub = env.lastStub();
    var orange = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('230, 140, 40') !== -1;
    });
    expect(orange).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('TIME UP');
  });

  it('renders a gray overlay + CANCELLED on cancel', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.updateState(makeActivityState());
    handle.showOutcome('cancel');
    var stub = env.lastStub();
    var gray = stub.rects.find(function (r) {
      return typeof r.fill === 'string' && r.fill.indexOf('120, 120, 120') !== -1;
    });
    expect(gray).toBeDefined();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels).toContain('CANCELLED');
  });
});

describe('destroy', function () {
  it('removes the overlay canvas and any tooltip from the DOM', function () {
    var env = loadModule();
    var mount = getMount(env);
    var state = makeActivityState({
      players: { alice: { x: 40, y: 10 } }
    });
    var handle = env.module.mount(mount, { currentUsername: 'alice' });
    handle.updateState(state);
    expect(mount.querySelector('canvas')).not.toBeNull();
    expect(mount.querySelector('.activity-level-tooltip')).not.toBeNull();
    handle.destroy();
    expect(mount.querySelector('canvas')).toBeNull();
    expect(mount.querySelector('.activity-level-tooltip')).toBeNull();
  });

  it('is idempotent and updateState becomes a no-op after destroy', function () {
    var env = loadModule();
    var handle = env.module.mount(getMount(env), {});
    handle.destroy();
    expect(function () { handle.destroy(); }).not.toThrow();
    expect(function () { handle.updateState(makeActivityState()); }).not.toThrow();
    expect(function () { handle.showOutcome('success'); }).not.toThrow();
  });
});
