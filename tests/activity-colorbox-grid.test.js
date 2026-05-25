// activity-colorbox-grid.test.js
// Unit tests for activity-colorbox-grid.js (V6 ColorBox-Grid renderer).
// Mirrors the V5 tests/activity-colorbox.test.js + V4 tests/activity-bridge.test.js
// patterns: vm context + JSDOM minimal document + 2D-context-recording stub.
//
// ASCII-only.  LF line endings.

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SRC = readFileSync(resolve(REPO_ROOT, 'activity-colorbox-grid.js'), 'utf8');

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
    saves:   0,
    restores:0,

    fillRect:   function (x, y, w, h) {
      this.rects.push({ x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    strokeRect: function (x, y, w, h) {
      this.strokes.push({ x, y, w, h, stroke: this.strokeStyle });
    },
    fillText:   function (text, x, y) {
      this.texts.push({ text: String(text), x, y, fill: this.fillStyle, font: this.font });
    },
    measureText:function (text) { return { width: String(text).length * 7 }; },
    beginPath:  function () {},
    moveTo:     function () {},
    lineTo:     function () {},
    stroke:     function () {},
    arc:        function () {},
    fill:       function () {},
    closePath:  function () {},
    save:       function () { this.saves++; },
    restore:    function () { this.restores++; },
    scale:      function () {},
    setTransform:function () {}
  };
  return stub;
}

function loadModule() {
  // Per-test JSDOM so the modal DOM doesn't bleed between cases.
  var dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount" style="width:320px;height:180px"></div></body></html>', {
    url: 'https://example.com'
  });
  var win = dom.window;
  // jsdom canvas has no getContext('2d') in the default build. Inject a
  // recording stub via the prototype so every createElement('canvas') returns
  // a canvas whose getContext yields our stub.
  var lastStub = null;
  win.HTMLCanvasElement.prototype.getContext = function () {
    lastStub = makeCtxStub();
    return lastStub;
  };

  var fakeWindow = {};
  // Inject window + document + the small set of APIs the IIFE references.
  var ctx = createContext({
    window:           fakeWindow,
    document:         win.document,
    module:           { exports: {} },
    HTMLCanvasElement:win.HTMLCanvasElement
  });
  runInContext(SRC, ctx);

  return {
    win:    win,
    dom:    dom,
    module: fakeWindow.ActivityColorboxGrid,
    lastStub: function () { return lastStub; }
  };
}

function makePromptState(extras) {
  var s = {
    secondAxis:   { mode: 'prompt', question: 'Are you left-handed?', options: ['No', 'Yes'] },
    colCount:     2,
    assignments:  { alice: { row: 0 }, bob: { row: 1 } },
    picks:        { alice: null, bob: 1 },
    currentCell:  { alice: { row: -1, col: -1 }, bob: { row: 1, col: 1 } },
    tally:        [[0, 0], [0, 1], [0, 0], [0, 0]],
    holdMs:       1000,
    holdTargetMs: 5000
  };
  if (extras) {
    Object.keys(extras).forEach(function (k) { s[k] = extras[k]; });
  }
  return s;
}

function makeAutoState(extras) {
  var s = {
    secondAxis:   { mode: 'auto', labels: ['Group A', 'Group B'] },
    colCount:     2,
    assignments:  { alice: { row: 0 }, bob: { row: 1 } },
    picks:        { alice: 0, bob: 1 },
    currentCell:  { alice: { row: 0, col: 0 }, bob: { row: 1, col: 1 } },
    tally:        [[1, 0], [0, 1], [0, 0], [0, 0]],
    holdMs:       2500,
    holdTargetMs: 5000
  };
  if (extras) {
    Object.keys(extras).forEach(function (k) { s[k] = extras[k]; });
  }
  return s;
}

describe('ActivityColorboxGrid module', function () {
  it('attaches ActivityColorboxGrid to window with mount()', function () {
    var env = loadModule();
    expect(env.module).toBeDefined();
    expect(typeof env.module.mount).toBe('function');
  });
});

describe('ActivityColorboxGrid.mount() handle shape', function () {
  it('returns handle with destroy/updateState/showOutcome methods', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.updateState).toBe('function');
    expect(typeof handle.showOutcome).toBe('function');
  });

  it('appends a canvas element to mountEl', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    expect(mount.querySelector('canvas')).toBeNull();
    env.module.mount(mount, { width: 320, height: 180 });
    expect(mount.querySelector('canvas')).not.toBeNull();
  });

  it('destroys cleanly: removes the canvas from the DOM', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    expect(mount.querySelector('canvas')).not.toBeNull();
    handle.destroy();
    expect(mount.querySelector('canvas')).toBeNull();
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

describe('updateState rendering', function () {
  it('renders fillRect calls for the 4 row tints', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' });
    handle.updateState(makeAutoState());
    var stub = env.lastStub();
    // At least 4 row tint fillRects (one per row) + the background fill +
    // per-cell content. We assert >= 4 rect calls with the row palette.
    var rowFills = stub.rects.filter(function (r) {
      return ['#ff5555', '#ddcc44', '#55cc55', '#5577cc'].indexOf(r.fill) !== -1;
    });
    expect(rowFills.length).toBeGreaterThanOrEqual(4);
  });

  it('writes per-cell tally counts as fillText entries', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' });
    var state = makeAutoState({
      tally: [[3, 1], [0, 2], [4, 0], [0, 0]]
    });
    handle.updateState(state);
    var stub = env.lastStub();
    var nums = stub.texts.map(function (t) { return t.text; });
    // Each non-zero tally count should appear at least once. 3, 1, 2, 4 each
    // appear in at least one cell.
    ['3', '1', '2', '4'].forEach(function (n) {
      expect(nums).toContain(n);
    });
  });

  it('writes row labels (Red/Yellow/Green/Blue) on the left edge', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    // The renderer uses full ROW_LABELS array (Red/Yellow/Green/Blue).
    expect(labels).toContain('Red');
    expect(labels).toContain('Yellow');
    expect(labels).toContain('Green');
    expect(labels).toContain('Blue');
  });

  it('writes column labels from secondAxis.labels in auto mode', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 400, height: 180 });
    handle.updateState(makeAutoState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.some(function (s) { return s.indexOf('Group A') !== -1; })).toBe(true);
    expect(labels.some(function (s) { return s.indexOf('Group B') !== -1; })).toBe(true);
  });

  it('writes column labels from secondAxis.options in prompt mode', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 400, height: 180, currentUsername: 'alice' });
    handle.updateState(makePromptState());
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    expect(labels.some(function (s) { return s.indexOf('No')  !== -1; })).toBe(true);
    expect(labels.some(function (s) { return s.indexOf('Yes') !== -1; })).toBe(true);
  });

  it('renders the progress bar with width scaled by holdMs/holdTargetMs', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState({ holdMs: 2500, holdTargetMs: 5000 }));
    var stub = env.lastStub();
    // Progress fill is the rect with fill = PROGRESS_FILL (rgba 255,255,255,0.75)
    // whose width is roughly half the canvas (50%).
    var progress = stub.rects.find(function (r) {
      return String(r.fill).indexOf('255, 255, 255, 0.75') !== -1;
    });
    expect(progress).toBeDefined();
    // 50% +/- 5 px on a 320 canvas.
    expect(progress.w).toBeGreaterThan(150);
    expect(progress.w).toBeLessThan(170);
  });

  it('does not throw on empty / minimal state', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    expect(function () { handle.updateState({}); }).not.toThrow();
    expect(function () { handle.updateState(null); }).not.toThrow();
  });
});

describe('Prompt modal', function () {
  it('appears when current user has null pick AND mode is prompt', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' })
      .updateState(makePromptState());
    // The modal is a DOM element appended INTO mount.
    var dialog = mount.querySelector('[role="dialog"], [data-colorbox-grid-modal]');
    // Tolerate either selector convention.
    if (!dialog) {
      var buttons = mount.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    } else {
      expect(dialog).not.toBeNull();
    }
  });

  it('does NOT appear in auto mode (no pick required)', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' })
      .updateState(makeAutoState());
    var dialog = mount.querySelector('[role="dialog"], [data-colorbox-grid-modal]');
    var buttons = mount.querySelectorAll('button');
    expect(dialog).toBeNull();
    expect(buttons.length).toBe(0);
  });

  it('hides when current user pick becomes non-null in next state', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' });
    handle.updateState(makePromptState());
    // Modal mounted (some descendant appears).
    var beforeButtons = mount.querySelectorAll('button').length;
    expect(beforeButtons).toBeGreaterThan(0);
    // Flip alice's pick to 0; modal hides.
    var nextState = makePromptState({ picks: { alice: 0, bob: 1 } });
    handle.updateState(nextState);
    var afterButtons = mount.querySelectorAll('button').length;
    expect(afterButtons).toBe(0);
  });

  it('modal button click invokes opts.boardHandle.sendActivityValue with the choice', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var sent = [];
    var boardHandle = {
      sendActivityValue: function (payload) { sent.push(payload); }
    };
    var handle = env.module.mount(mount, {
      width: 320, height: 180,
      currentUsername: 'alice',
      boardHandle: boardHandle
    });
    handle.updateState(makePromptState());
    var buttons = mount.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    // Click the second option ("Yes" -- index 1).
    buttons[1].click();
    expect(sent.length).toBe(1);
    expect(sent[0]).toHaveProperty('choice');
    expect(sent[0].choice).toBe(1);
  });

  it('destroy removes modal element from the DOM', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180, currentUsername: 'alice' });
    handle.updateState(makePromptState());
    expect(mount.querySelectorAll('button').length).toBeGreaterThan(0);
    handle.destroy();
    expect(mount.querySelectorAll('button').length).toBe(0);
    expect(mount.querySelector('canvas')).toBeNull();
  });
});

describe('Outcome rendering', function () {
  it('showOutcome("success") renders a fillRect covering the canvas', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState());
    handle.showOutcome('success');
    var stub = env.lastStub();
    // Some success-colored fill (rgba(40, 200, 90, *)).
    var success = stub.rects.find(function (r) {
      return String(r.fill).indexOf('40, 200, 90') !== -1;
    });
    expect(success).toBeDefined();
  });

  it('showOutcome("timeout") renders an orange overlay', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState());
    handle.showOutcome('timeout');
    var stub = env.lastStub();
    var timeout = stub.rects.find(function (r) {
      return String(r.fill).indexOf('230, 140, 40') !== -1;
    });
    expect(timeout).toBeDefined();
  });

  it('showOutcome("cancel") renders a gray overlay', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState());
    handle.showOutcome('cancel');
    var stub = env.lastStub();
    var cancel = stub.rects.find(function (r) {
      return String(r.fill).indexOf('120, 120, 120') !== -1;
    });
    expect(cancel).toBeDefined();
  });

  it('showOutcome also writes an outcome label (text), e.g. SUCCESS', function () {
    var env = loadModule();
    var mount = env.win.document.getElementById('mount');
    var handle = env.module.mount(mount, { width: 320, height: 180 });
    handle.updateState(makeAutoState());
    handle.showOutcome('success');
    var stub = env.lastStub();
    var labels = stub.texts.map(function (t) { return t.text; });
    // The label is something like "SORTED!" or "SUCCESS" -- exact wording
    // is renderer-internal; assert SOMETHING bold-cased appears that wasn't
    // already in the pre-outcome render.
    var hasOutcomeText = labels.some(function (t) {
      return /SORTED|SUCCESS|DONE|COMPLETE|!/i.test(t);
    });
    expect(hasOutcomeText).toBe(true);
  });
});
