/**
 * tests/level-editor-lint.test.js
 *
 * P2 unit tests for the v1 level editor (LEVEL_EDITOR_V1_BUILD.md).
 *
 * Covers:
 *   Group 1  -- Pure lint engine: one positive + one negative per rule
 *               (11 rules x 2 = 22 cases). Runs the model + lint together
 *               in a vm sandbox (no DOM).
 *   Group 2  -- Real corpus sanity: 80 activities parameterized + empty
 *               state baseline.
 *   Group 3  -- Warnings panel render (jsdom + UI).
 *   Group 4  -- Launch button (clipboard + window.open).
 *   Group 5  -- Auto-lint hook (paint() calls runLintNow when LE.lint exists).
 *
 * Mirrors tests/level-editor.test.js loading patterns:
 *   - Group 1 + Group 2 use vm.runInContext with a minimal sandbox
 *     (model + lint live there; lint reads model.ACTOR_REQUIRED_PROPS
 *     for the unknown-actor-type rule).
 *   - Group 3, 4, 5 use JSDOM and win.eval the four scripts in order.
 *
 * ASCII-only. LF line endings.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MODEL_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-model.js'), 'utf8');
const RENDER_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-render.js'), 'utf8');
const LINT_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-lint.js'), 'utf8');
const UI_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-ui.js'), 'utf8');
const HTML_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor.html'), 'utf8');
const SPRITE_JSON = readFileSync(resolve(REPO_ROOT, 'pico_sprite1.json'), 'utf8');

const ACTIVITIES_DIR = resolve(REPO_ROOT, '..', 'curriculum_render', 'railway-server', 'activities');

// ---------------------------------------------------------------------------
// Helpers -- sandbox loading (Group 1 + 2)
// ---------------------------------------------------------------------------

/**
 * Load model + lint into a single vm sandbox. The lint engine's
 * unknown-actor-type rule reads from window.LE.model.ACTOR_REQUIRED_PROPS,
 * so both must share the same `window` namespace.
 */
function loadModelAndLintInSandbox() {
  const sandbox = { console };
  // The IIFEs assign onto window.LE.* directly; map window -> sandbox.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(MODEL_SRC, sandbox, { filename: 'level-editor-model.js' });
  runInContext(LINT_SRC, sandbox, { filename: 'level-editor-lint.js' });
  return {
    model: sandbox.LE.model,
    lint: sandbox.LE.lint,
  };
}

/**
 * Build a baseline-VALID main-scope fixture state. The fixture has:
 *   - exactly one PlayerSpawn
 *   - a GoalPad (so completion-kind-needs-goalpad passes)
 *   - default completion.kind (contextslots-lit-and-goalpad-presence)
 *   - default 32x8 map
 *   - no Gates, no QuestionDoors, no TallyChutes, no overlaps
 *
 * Each Group 1 positive test mutates this minimally to trigger the rule.
 */
function baselineValid(model) {
  const s = model.createState();
  s.levelKey = 'U-test';
  s.title = 'Baseline';
  s.actors.push({ type: 'PlayerSpawn', x: 4, y: 4 });
  s.actors.push({ type: 'GoalPad', x: 28, y: 6, triggerMs: 1500 });
  return s;
}

/**
 * Find issues with a given rule id in the lint output. Returns array
 * (possibly empty).
 */
function issuesById(issues, id) {
  return issues.filter(function (issue) { return issue.id === id; });
}

// ---------------------------------------------------------------------------
// Helpers -- jsdom env (Group 3, 4, 5) -- mirrors tests/level-editor.test.js
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
  win.requestAnimationFrame = function (cb) { cb(0); return 0; };
  win.cancelAnimationFrame = function () {};
  // window.open spy -- some launch tests overwrite this; default is no-op.
  win.open = vi.fn();

  win.eval(MODEL_SRC);
  win.eval(RENDER_SRC);
  win.eval(LINT_SRC);

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
// Group 1 -- Pure lint engine: one rule at a time (positive + negative)
// ---------------------------------------------------------------------------

describe('Group 1 -- lint rules: one fixture per rule', function () {
  let model;
  let lint;
  beforeAll(function () {
    const env = loadModelAndLintInSandbox();
    model = env.model;
    lint = env.lint;
  });

  // -------- missing-player-spawn --------

  it('missing-player-spawn fires when no PlayerSpawn is present', function () {
    const s = baselineValid(model);
    // Strip the PlayerSpawn to trigger.
    s.actors = s.actors.filter(function (a) { return a.type !== 'PlayerSpawn'; });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'missing-player-spawn');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].scope).toBe('main');
    expect(hits[0].actorIndex).toBeNull();
  });

  it('missing-player-spawn does NOT fire with exactly one PlayerSpawn', function () {
    const s = baselineValid(model);
    const issues = lint.runLint(s);
    expect(issuesById(issues, 'missing-player-spawn').length).toBe(0);
  });

  // -------- multiple-player-spawns --------

  it('multiple-player-spawns fires (with one issue per spawn) when 2+ PlayerSpawns present', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'PlayerSpawn', x: 5, y: 5 });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'multiple-player-spawns');
    expect(hits.length).toBe(2);
    hits.forEach(function (issue) {
      expect(issue.severity).toBe('warn');
      expect(issue.scope).toBe('main');
      expect(typeof issue.actorIndex).toBe('number');
    });
  });

  it('multiple-player-spawns does NOT fire with exactly one PlayerSpawn', function () {
    const s = baselineValid(model);
    expect(issuesById(lint.runLint(s), 'multiple-player-spawns').length).toBe(0);
  });

  // -------- actor-out-of-bounds --------

  it('actor-out-of-bounds fires when any actor sits outside map.width/height', function () {
    const s = baselineValid(model);
    // map is 32 wide x 8 tall; push an actor at x=99.
    s.actors.push({ type: 'Goal', x: 99, y: 2 });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'actor-out-of-bounds');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].severity).toBe('error');
  });

  it('actor-out-of-bounds does NOT fire when all actors lie inside map bounds', function () {
    const s = baselineValid(model);
    expect(issuesById(lint.runLint(s), 'actor-out-of-bounds').length).toBe(0);
  });

  // -------- duplicate-id --------

  it('duplicate-id fires when two actors of the SAME type share an id', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'SipStation', x: 6, y: 4, id: 's1', drink: 'A' });
    s.actors.push({ type: 'SipStation', x: 8, y: 4, id: 's1', drink: 'B' });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'duplicate-id');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('error');
  });

  it('duplicate-id does NOT fire on cross-type id reuse (e.g. Gate g1 + SipStation g1)', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'Gate', x: 6, y: 4, id: 'g1', label: 'L', predicate: 'tally_nonzero' });
    s.actors.push({ type: 'SipStation', x: 8, y: 4, id: 'g1', drink: 'A' });
    expect(issuesById(lint.runLint(s), 'duplicate-id').length).toBe(0);
  });

  // -------- no-advance-path --------

  it('no-advance-path fires when a Gate(always_false) has no companion Gate(tally_nonzero)', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'Gate', x: 10, y: 4, id: 'g1', label: 'wall', predicate: 'always_false' });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'no-advance-path');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('error');
  });

  it('no-advance-path does NOT fire when a tally_nonzero Gate companions the always_false Gate', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'Gate', x: 10, y: 4, id: 'g1', label: 'wall', predicate: 'always_false' });
    s.actors.push({ type: 'Gate', x: 12, y: 4, id: 'g2', label: 'open', predicate: 'tally_nonzero' });
    expect(issuesById(lint.runLint(s), 'no-advance-path').length).toBe(0);
  });

  // -------- question-door-no-reflection --------

  it('question-door-no-reflection fires on QuestionDoor with correct=false and empty reflection', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'QuestionDoor', x: 10, y: 4, id: 'q1', text: 'Wrong?', correct: false, reflection: '' });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'question-door-no-reflection');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('warn');
  });

  it('question-door-no-reflection does NOT fire when reflection text is provided', function () {
    const s = baselineValid(model);
    s.actors.push({
      type: 'QuestionDoor', x: 10, y: 4, id: 'q1', text: 'Wrong?',
      correct: false, reflection: 'Here is why...',
    });
    expect(issuesById(lint.runLint(s), 'question-door-no-reflection').length).toBe(0);
  });

  // -------- orphan-tally-chute-label --------

  it('orphan-tally-chute-label fires when a TallyChute label matches no SipStation drink', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'SipStation', x: 6, y: 4, id: 's1', drink: 'A' });
    s.actors.push({ type: 'TallyChute', x: 8, y: 4, id: 't1', label: 'Z' });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'orphan-tally-chute-label');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('warn');
  });

  it('orphan-tally-chute-label does NOT fire when label matches a SipStation drink', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'SipStation', x: 6, y: 4, id: 's1', drink: 'A' });
    s.actors.push({ type: 'TallyChute', x: 8, y: 4, id: 't1', label: 'A' });
    expect(issuesById(lint.runLint(s), 'orphan-tally-chute-label').length).toBe(0);
  });

  // -------- completion-kind-needs-goalpad --------

  it('completion-kind-needs-goalpad fires when completion is contextslots-... but no GoalPad present', function () {
    const s = baselineValid(model);
    s.completion = { kind: 'contextslots-lit-and-goalpad-presence', rule: '' };
    // Strip the GoalPad seeded by baselineValid.
    s.actors = s.actors.filter(function (a) { return a.type !== 'GoalPad'; });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'completion-kind-needs-goalpad');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].actorIndex).toBeNull();
  });

  it('completion-kind-needs-goalpad does NOT fire when a GoalPad is present', function () {
    const s = baselineValid(model);
    // baselineValid already includes a GoalPad.
    expect(issuesById(lint.runLint(s), 'completion-kind-needs-goalpad').length).toBe(0);
  });

  // -------- completion-kind-needs-goal --------

  it('completion-kind-needs-goal fires when completion is lock-and-switch-...goal-overlap but no Goal present', function () {
    const s = baselineValid(model);
    s.completion = { kind: 'lock-and-switch-state + goal-overlap', rule: '' };
    // Make sure there's no Goal actor.
    s.actors = s.actors.filter(function (a) { return a.type !== 'Goal'; });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'completion-kind-needs-goal');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('error');
  });

  it('completion-kind-needs-goal does NOT fire when a Goal actor is present', function () {
    const s = baselineValid(model);
    s.completion = { kind: 'lock-and-switch-state + goal-overlap', rule: '' };
    s.actors.push({ type: 'Goal', x: 30, y: 4 });
    expect(issuesById(lint.runLint(s), 'completion-kind-needs-goal').length).toBe(0);
  });

  // -------- overlapping-actors --------

  it('overlapping-actors fires when two non-Text actors share the same (x, y) chip', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'SipStation', x: 10, y: 4, id: 's1', drink: 'A' });
    s.actors.push({ type: 'Key', x: 10, y: 4, id: 'k1' });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'overlapping-actors');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('warn');
  });

  it('overlapping-actors does NOT fire for a Text overlay (intentional label)', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'SipStation', x: 10, y: 4, id: 's1', drink: 'A' });
    s.actors.push({ type: 'Text', x: 10, y: 4, text: 'A label' });
    expect(issuesById(lint.runLint(s), 'overlapping-actors').length).toBe(0);
  });

  // -------- unknown-actor-type --------

  it('unknown-actor-type fires when an actor.type is not in the model table', function () {
    const s = baselineValid(model);
    s.actors.push({ type: 'WhirlyGig', x: 10, y: 4 });
    const issues = lint.runLint(s);
    const hits = issuesById(issues, 'unknown-actor-type');
    expect(hits.length).toBe(1);
    expect(hits[0].severity).toBe('warn');
    expect(hits[0].message).toMatch(/WhirlyGig/);
  });

  it('unknown-actor-type does NOT fire when all actor types are model-recognized', function () {
    const s = baselineValid(model);
    expect(issuesById(lint.runLint(s), 'unknown-actor-type').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 2 -- Real corpus sanity
// ---------------------------------------------------------------------------

describe('Group 2 -- real corpus sanity', function () {
  let model;
  let lint;
  beforeAll(function () {
    const env = loadModelAndLintInSandbox();
    model = env.model;
    lint = env.lint;
  });

  it('all 80 corpus files lint without ERROR severity issues (warns are OK)', function () {
    const files = readdirSync(ACTIVITIES_DIR)
      .filter(function (f) { return f.endsWith('.json'); })
      .sort();
    expect(files.length).toBe(80);

    const offenders = [];
    files.forEach(function (fileName) {
      const text = readFileSync(resolve(ACTIVITIES_DIR, fileName), 'utf8');
      let state;
      try {
        state = model.deserialize(text);
      } catch (err) {
        offenders.push(fileName + ': deserialize threw -- ' + err.message);
        return;
      }
      const issues = lint.runLint(state);
      const errors = issues.filter(function (i) { return i.severity === 'error'; });
      if (errors.length > 0) {
        errors.forEach(function (e) {
          offenders.push(fileName + ': ' + e.id + ' -- ' + e.message);
        });
      }
    });

    if (offenders.length > 0) {
      // Surface every offender so the user can route a fold.
      throw new Error('Corpus errors:\n  ' + offenders.join('\n  '));
    }
    expect(offenders.length).toBe(0);
  });

  it('an empty/default state returns the baseline errors (missing-player-spawn + completion-kind-needs-goalpad)', function () {
    const s = model.createState();
    const issues = lint.runLint(s);
    const ids = issues.map(function (i) { return i.id; });
    expect(ids).toContain('missing-player-spawn');
    expect(ids).toContain('completion-kind-needs-goalpad');
    // Both are errors.
    expect(issuesById(issues, 'missing-player-spawn')[0].severity).toBe('error');
    expect(issuesById(issues, 'completion-kind-needs-goalpad')[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Group 3 -- Warnings panel render (jsdom)
// ---------------------------------------------------------------------------

describe('Group 3 -- warnings panel render', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI(); // auto-init fires
  });

  it('renders one row per issue and exposes the panel when issues are present', function () {
    // Build a state that triggers 2 distinct errors: missing-player-spawn +
    // completion-kind-needs-goalpad (both fire on an empty default state).
    const s = env.LE.model.createState();
    env.LE.ui._test.setStateForTest(s);
    env.LE.ui._test.renderNow(); // ensure paint -> runLintNow runs

    const panel = env.document.getElementById('le-warnings');
    const list = env.document.getElementById('le-warnings-list');
    expect(panel.hidden).toBe(false);
    expect(list.children.length).toBeGreaterThanOrEqual(2);

    // The two known errors should be present in the rendered text.
    const rowText = Array.from(list.children).map(function (row) {
      return row.textContent;
    }).join('\n');
    expect(rowText).toMatch(/PlayerSpawn/);
    expect(rowText).toMatch(/GoalPad/);
  });

  it('hides the warnings panel when there are no issues', function () {
    // Build a baseline-valid state (PlayerSpawn + GoalPad).
    const s = env.LE.model.createState();
    s.levelKey = 'U-clean';
    s.actors.push({ type: 'PlayerSpawn', x: 4, y: 4 });
    s.actors.push({ type: 'GoalPad', x: 28, y: 6, triggerMs: 1500 });
    env.LE.ui._test.setStateForTest(s);
    env.LE.ui._test.renderNow();

    const panel = env.document.getElementById('le-warnings');
    expect(panel.hidden).toBe(true);
  });

  it('clicking a warning row with data-actor-index selects that actor', function () {
    // Place a second PlayerSpawn so we get a multiple-player-spawns warning
    // with a real actorIndex on the row.
    const s = env.LE.model.createState();
    s.actors.push({ type: 'PlayerSpawn', x: 2, y: 2 });
    s.actors.push({ type: 'PlayerSpawn', x: 6, y: 6 });
    s.actors.push({ type: 'GoalPad', x: 28, y: 6, triggerMs: 1500 });
    env.LE.ui._test.setStateForTest(s);
    env.LE.ui._test.renderNow();

    const list = env.document.getElementById('le-warnings-list');
    // Find a row with data-actor-index (multiple-player-spawns rows have one).
    let target = null;
    for (let i = 0; i < list.children.length; i++) {
      const row = list.children[i];
      if (row.getAttribute('data-actor-index') !== null) {
        target = row;
        break;
      }
    }
    expect(target).not.toBeNull();
    const expectedIndex = Number(target.getAttribute('data-actor-index'));

    target.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));

    const sel = env.LE.ui._test.getSelectedActor();
    expect(sel).not.toBeNull();
    expect(sel.index).toBe(expectedIndex);
  });
});

// ---------------------------------------------------------------------------
// Group 4 -- Launch button
// ---------------------------------------------------------------------------

describe('Group 4 -- launch button', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('handleLaunch writes the serialized JSON to clipboard AND opens the cockpit URL with ?dev=1&devActivity=', function () {
    // Set a levelKey so the launcher doesn't short-circuit.
    const s = env.LE.model.updateMetadata(env.LE.model.createState(), { levelKey: 'U-launch' });
    env.LE.ui._test.setStateForTest(s);

    const openSpy = vi.fn();
    env.window.open = openSpy;

    env.LE.ui._test.handleLaunch();

    // window.open: called once with the dev URL.
    expect(openSpy).toHaveBeenCalledTimes(1);
    const calledUrl = openSpy.mock.calls[0][0];
    expect(calledUrl).toContain('dev=1');
    expect(calledUrl).toContain('devActivity=U-launch');

    // clipboard.writeText: called once with the serialized state.
    const writeFn = env.window.__clipboardWriteFn;
    expect(writeFn).toHaveBeenCalledTimes(1);
    const writtenJson = writeFn.mock.calls[0][0];
    // The body must be parseable + carry the levelKey.
    const reparsed = JSON.parse(writtenJson);
    expect(reparsed.levelKey).toBe('U-launch');
    expect(reparsed.schema).toBe('v7-level-1');
  });

  it('handleLaunch with empty levelKey toasts the error and does NOT call window.open or clipboard', function () {
    // Fresh state has levelKey = ''.
    const s = env.LE.model.createState();
    env.LE.ui._test.setStateForTest(s);

    const openSpy = vi.fn();
    env.window.open = openSpy;
    // Reset clipboard write spy by reinstalling.
    const writeFn = env.window.__clipboardWriteFn;
    writeFn.mockClear();

    env.LE.ui._test.handleLaunch();

    expect(openSpy).not.toHaveBeenCalled();
    expect(writeFn).not.toHaveBeenCalled();

    // Toast should be visible with an error message.
    const toast = env.document.getElementById('le-toast');
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toMatch(/levelKey/i);
  });
});

// ---------------------------------------------------------------------------
// Group 5 -- Auto-lint hook (paint -> runLintNow)
// ---------------------------------------------------------------------------

describe('Group 5 -- auto-lint hook', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('placing a second PlayerSpawn surfaces multiple-player-spawns in getLastLintResult without calling runLintNow explicitly', function () {
    // Step 1: place one PlayerSpawn -- baseline only has missing-player-spawn
    // before this, then it clears.
    env.LE.ui._test.placeActorAt('PlayerSpawn', 2, 2);
    // Step 2: place a second one -- multiple-player-spawns should now fire.
    env.LE.ui._test.placeActorAt('PlayerSpawn', 6, 6);
    // Force a synchronous paint so the auto-lint hook in paint() runs.
    env.LE.ui._test.renderNow();

    const issues = env.LE.ui._test.getLastLintResult();
    const ids = issues.map(function (i) { return i.id; });
    expect(ids).toContain('multiple-player-spawns');
  });
});
