/**
 * tests/level-editor.test.js
 *
 * P1 unit tests for the v1 level editor (LEVEL_EDITOR_V1_BUILD.md).
 *
 * Covers:
 *   Group 1  -- Model: actor mutations (addActor / deleteActor / moveActor /
 *               updateActorProp / validateActor)
 *   Group 2  -- Model: metadata + map (updateMetadata / resizeMap)
 *   Group 3  -- Model: serialize / deserialize
 *   Group 4  -- Model: 80 semantic round-trip cases against the cr corpus
 *   Group 5  -- Model: undo / redo (createHistory / pushHistory / cap=50)
 *   Group 6  -- Render: EDITOR_CHIP_PX, loadSpriteRegions, drawActor for
 *               all 13 supported actor types
 *   Group 7  -- UI: boot + palette
 *   Group 8  -- UI: grid interaction (place / select / delete)
 *   Group 9  -- UI: props form (build + edit)
 *   Group 10 -- UI: save / load (Blob + FileReader paths)
 *   Group 11 -- UI: reflection tab + camera slider
 *
 * Round-trip contract per spec is SEMANTIC (parse -> serialize -> parse
 * deep-equals original parse), NOT byte-identical. The s115 batch-authored
 * corpus has heterogeneous intra-file whitespace that makes byte-identical
 * impossible.
 *
 * Source loading: the editor scripts are browser IIFEs that publish onto
 * window.LE.{model,render,ui}. To exercise them in vitest+jsdom we read each
 * file via fs.readFileSync and runInContext on a jsdom window. Tests then
 * read window.LE.* directly. Mirrors tests/classroom-board-scroll.test.js.
 *
 * ASCII-only. LF line endings.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MODEL_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-model.js'), 'utf8');
const RENDER_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-render.js'), 'utf8');
const UI_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor-ui.js'), 'utf8');
const HTML_SRC = readFileSync(resolve(REPO_ROOT, 'tools/level-editor.html'), 'utf8');
const SPRITE_JSON = readFileSync(resolve(REPO_ROOT, 'pico_sprite1.json'), 'utf8');

const ACTIVITIES_DIR = resolve(REPO_ROOT, '..', 'curriculum_render', 'railway-server', 'activities');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the model in a minimal vm sandbox (no DOM needed).
 * Returns the populated LE.model from the sandbox.
 */
function loadModelInSandbox() {
  const sandbox = { globalThis: {}, console };
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(MODEL_SRC, sandbox, { filename: 'level-editor-model.js' });
  return sandbox.LE.model;
}

/**
 * Build a jsdom window with the editor HTML loaded and the model/render
 * scripts pre-executed. The UI script is NOT auto-loaded -- the caller
 * decides whether to load it (and whether to suppress auto-init).
 *
 * Returns an object with:
 *   dom        -- the JSDOM instance
 *   window     -- shorthand
 *   document   -- shorthand
 *   LE         -- the populated window.LE namespace
 *   loadUI()   -- helper to load the UI script (auto-init runs)
 *   loadUINoInit() -- load UI but suppress auto-init (set window.LE_DISABLE_AUTO_INIT)
 */
function loadEditorEnv(opts) {
  opts = opts || {};
  const dom = new JSDOM(HTML_SRC, {
    url: 'http://localhost/tools/level-editor.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  installCanvasShim(win);
  installFetchShim(win, opts);
  installClipboardShim(win, opts);
  // requestAnimationFrame -- run callback immediately so render() is sync in tests.
  win.requestAnimationFrame = function (cb) { cb(0); return 0; };
  win.cancelAnimationFrame = function () {};

  // Run model + render in the dom's window context.
  win.eval(MODEL_SRC);
  win.eval(RENDER_SRC);

  function loadUI() {
    win.eval(UI_SRC);
  }
  function loadUINoInit() {
    win.LE_DISABLE_AUTO_INIT = true;
    win.eval(UI_SRC);
  }

  return {
    dom: dom,
    window: win,
    document: win.document,
    LE: win.LE,
    loadUI: loadUI,
    loadUINoInit: loadUINoInit,
  };
}

/**
 * Install a recording 2D canvas context shim on every canvas in the window.
 * Tests can read the last shim via env.lastCtx() if needed. The shim is
 * deliberately silent (no-ops + record arrays).
 */
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
    rects: [],
    strokes: [],
    texts: [],
    images: [],
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
    fillRect: function (x, y, w, h) { this.rects.push({ x: x, y: y, w: w, h: h, fill: this.fillStyle }); },
    strokeRect: function (x, y, w, h) { this.strokes.push({ x: x, y: y, w: w, h: h, stroke: this.strokeStyle }); },
    fillText: function (t, x, y) { this.texts.push({ t: String(t), x: x, y: y }); },
    strokeText: function () {},
    measureText: function (t) { return { width: String(t).length * 6 }; },
    drawImage: function () { this.images.push({}); },
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
  };
}

/**
 * Install a fake fetch that returns pico_sprite1.json text for the sprite
 * URL the render module requests. Anything else returns 404.
 */
function installFetchShim(win, opts) {
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

function installClipboardShim(win, opts) {
  const writes = [];
  if (!win.navigator) win.navigator = {};
  try {
    Object.defineProperty(win.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: function (text) {
          writes.push(String(text));
          return Promise.resolve();
        },
      },
    });
  } catch (_e) {
    // navigator.clipboard may already be a getter in some jsdom builds.
    win.navigator.clipboard = {
      writeText: function (text) {
        writes.push(String(text));
        return Promise.resolve();
      },
    };
  }
  win.__clipboardWrites = writes;
}

// ---------------------------------------------------------------------------
// Group 1 -- Model: actor mutations
// ---------------------------------------------------------------------------

describe('Group 1 -- model: actor mutations', function () {
  let model;
  beforeAll(function () { model = loadModelInSandbox(); });

  it('addActor to fresh state grows actors[] by 1 with correct props', function () {
    let s = model.createState();
    expect(s.actors).toHaveLength(0);
    const actor = { type: 'PlayerSpawn', x: 4, y: 4 };
    s = model.addActor(s, 'main', actor);
    expect(s.actors).toHaveLength(1);
    expect(s.actors[0]).toEqual(actor);
  });

  it('addActor with unknown type throws', function () {
    const s = model.createState();
    expect(function () {
      model.addActor(s, 'main', { type: 'BogusType', x: 0, y: 0 });
    }).toThrow(/unknown actor type/);
  });

  it('addActor with missing required prop throws (SipStation without drink)', function () {
    const s = model.createState();
    expect(function () {
      model.addActor(s, 'main', { type: 'SipStation', x: 0, y: 0, id: 's1' });
    }).toThrow(/missing required prop: drink/);
  });

  it('addActor at out-of-bounds (x, y) is ALLOWED (no bounds check at model level)', function () {
    // The model's validateActor only enforces type + required props; bounds
    // are enforced at the UI / resize layer. Document the actual behavior.
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 999, y: 999 });
    expect(s.actors[0].x).toBe(999);
    expect(s.actors[0].y).toBe(999);
  });

  it('deleteActor shrinks actors[] by 1', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 1, y: 1 });
    s = model.addActor(s, 'main', { type: 'Goal', x: 2, y: 2 });
    expect(s.actors).toHaveLength(2);
    s = model.deleteActor(s, 'main', 0);
    expect(s.actors).toHaveLength(1);
    expect(s.actors[0].type).toBe('Goal');
  });

  it('deleteActor with out-of-range index throws', function () {
    const s = model.createState();
    expect(function () { model.deleteActor(s, 'main', 0); }).toThrow(/index out of range/);
    expect(function () { model.deleteActor(s, 'main', -1); }).toThrow(/index out of range/);
  });

  it('moveActor updates coords and chip-snaps fractional input via Math.round', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 0, y: 0 });
    s = model.moveActor(s, 'main', 0, 4.7, 3.2);
    expect(s.actors[0].x).toBe(5);
    expect(s.actors[0].y).toBe(3);
  });

  it('moveActor throws when x or y are not finite numbers', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 0, y: 0 });
    expect(function () { model.moveActor(s, 'main', 0, NaN, 1); }).toThrow(/finite numbers/);
    expect(function () { model.moveActor(s, 'main', 0, 1, 'foo'); }).toThrow(/finite numbers/);
  });

  it('updateActorProp mutates only the named prop', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'SipStation', x: 0, y: 0, id: 's1', drink: 'A' });
    s = model.updateActorProp(s, 'main', 0, 'drink', 'B');
    expect(s.actors[0].drink).toBe('B');
    expect(s.actors[0].id).toBe('s1');
    expect(s.actors[0].type).toBe('SipStation');
    expect(s.actors[0].x).toBe(0);
    expect(s.actors[0].y).toBe(0);
  });

  it('validateActor returns { valid: true, errors: [] } for a well-formed actor', function () {
    const r = model.validateActor({ type: 'PlayerSpawn', x: 0, y: 0 });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('validateActor reports a useful error for an invalid Gate predicate', function () {
    const r = model.validateActor({ type: 'Gate', x: 0, y: 0, id: 'g1', label: 'L', predicate: 'bogus' });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join(' ')).toMatch(/predicate must be one of/);
  });

  it('validateActor flags missing type', function () {
    const r = model.validateActor({ x: 0, y: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/missing type/);
  });
});

// ---------------------------------------------------------------------------
// Group 2 -- Model: metadata + map
// ---------------------------------------------------------------------------

describe('Group 2 -- model: metadata + map', function () {
  let model;
  beforeAll(function () { model = loadModelInSandbox(); });

  it('updateMetadata shallow-merges supplied keys, preserving the rest', function () {
    let s = model.createState();
    s = model.updateMetadata(s, { title: 'My Title', skill: '1.A' });
    expect(s.title).toBe('My Title');
    expect(s.skill).toBe('1.A');
    expect(s.schema).toBe('v7-level-1');
    expect(s.levelKey).toBe('');
  });

  it('resizeMap with smaller bounds clamps in-bounds actors to the new max-1', function () {
    let s = model.createState();
    s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 30, y: 7 });
    s = model.addActor(s, 'main', { type: 'Goal', x: 4, y: 2 });
    s = model.resizeMap(s, 'main', 16, 4);
    expect(s.map.width).toBe(16);
    expect(s.map.height).toBe(4);
    // The first actor was outside (x=30, y=7) -> clamped to (15, 3).
    expect(s.actors[0].x).toBe(15);
    expect(s.actors[0].y).toBe(3);
    // The second actor was inside -> untouched.
    expect(s.actors[1].x).toBe(4);
    expect(s.actors[1].y).toBe(2);
  });

  it('resizeMap does NOT lose any actors -- count is preserved', function () {
    let s = model.createState();
    for (let i = 0; i < 5; i++) {
      s = model.addActor(s, 'main', { type: 'PlayerSpawn', x: 10 + i, y: 4 });
    }
    s = model.resizeMap(s, 'main', 8, 4);
    expect(s.actors).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Group 3 -- Model: serialize / deserialize
// ---------------------------------------------------------------------------

describe('Group 3 -- model: serialize / deserialize', function () {
  let model;
  beforeAll(function () { model = loadModelInSandbox(); });

  it('serialize of fresh state produces valid JSON', function () {
    const s = model.createState();
    const out = model.serialize(s);
    expect(typeof out).toBe('string');
    expect(function () { JSON.parse(out); }).not.toThrow();
  });

  it('deserialize of malformed JSON throws', function () {
    expect(function () { model.deserialize('{not json}'); }).toThrow(/invalid JSON/);
  });

  it('deserialize of wrong schema throws', function () {
    expect(function () {
      model.deserialize(JSON.stringify({ schema: 'v6-level-1' }));
    }).toThrow(/schema must be/);
  });

  it('serialize emits top-level keys in canonical order', function () {
    const s = model.createState();
    const out = model.serialize(s);
    const parsed = JSON.parse(out);
    const expectedOrder = [
      'schema', 'levelKey', 'lessonKey', 'title', 'skill', 'lo', 'ek',
      'duration', 'map', 'actors', 'reflection_room', 'completion', 'min_students',
    ];
    expect(Object.keys(parsed)).toEqual(expectedOrder);
  });

  it('deserialize preserves unknown top-level keys (forward-compat)', function () {
    const input = {
      schema: 'v7-level-1',
      levelKey: 'UTEST',
      lessonKey: '1.1',
      title: 'Test',
      skill: '',
      lo: '',
      ek: [],
      duration: 180,
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [],
      reflection_room: { map: { width: 16, height: 8, chipSize: 10 }, actors: [] },
      completion: { kind: 'contextslots-lit-and-goalpad-presence', rule: '' },
      min_students: 2,
      futureField: { keepMe: true },
    };
    const parsed = model.deserialize(JSON.stringify(input));
    expect(parsed.futureField).toEqual({ keepMe: true });

    // And the unknown key survives a round trip through serialize.
    const out = JSON.parse(model.serialize(parsed));
    expect(out.futureField).toEqual({ keepMe: true });
  });
});

// ---------------------------------------------------------------------------
// Group 4 -- Model: 80 semantic round-trip cases against the corpus
// ---------------------------------------------------------------------------

describe('Group 4 -- model: 80 corpus round-trip cases', function () {
  let model;
  let files;
  beforeAll(function () {
    model = loadModelInSandbox();
    files = readdirSync(ACTIVITIES_DIR)
      .filter(function (f) { return f.endsWith('.json'); })
      .sort();
  });

  it('the corpus directory resolves and contains 80 level files', function () {
    expect(files.length).toBe(80);
  });

  // Parameterized -- one assertion per level. Spec says "1 case per existing
  // level" so we set the suite up to enumerate them, even though the corpus
  // is loaded once in beforeAll. If the corpus grows beyond 80, the assertion
  // above will fail loudly first.
  describe.each(readdirSync(ACTIVITIES_DIR).filter(function (f) { return f.endsWith('.json'); }).sort())('round-trip %s', function (fileName) {
    it('parse -> serialize -> parse deep-equals input', function () {
      const filePath = resolve(ACTIVITIES_DIR, fileName);
      const text = readFileSync(filePath, 'utf8');
      const orig = JSON.parse(text);
      const state = model.deserialize(JSON.stringify(orig));
      const reparsed = JSON.parse(model.serialize(state));
      expect(reparsed).toEqual(orig);
    });
  });
});

// ---------------------------------------------------------------------------
// Group 5 -- Model: undo / redo
// ---------------------------------------------------------------------------

describe('Group 5 -- model: undo / redo', function () {
  let model;
  beforeAll(function () { model = loadModelInSandbox(); });

  it('createHistory returns empty undo/redo stacks with max=50', function () {
    const h = model.createHistory();
    expect(h.undo).toEqual([]);
    expect(h.redo).toEqual([]);
    expect(h.max).toBe(50);
  });

  it('pushHistory then undo restores prior state', function () {
    const h = model.createHistory();
    const s0 = model.createState();
    model.pushHistory(h, s0);
    let s1 = model.updateMetadata(s0, { title: 'After-push' });
    const result = model.undo(h, s1);
    const restored = result[0];
    expect(restored.title).toBe(''); // back to the s0 snapshot
  });

  it('redo after undo restores the popped state', function () {
    const h = model.createHistory();
    const s0 = model.createState();
    model.pushHistory(h, s0);
    const s1 = model.updateMetadata(s0, { title: 'After-push' });

    const undoResult = model.undo(h, s1);
    const restored = undoResult[0];
    const h2 = undoResult[1];
    expect(restored.title).toBe('');

    const redoResult = model.redo(h2, restored);
    const redone = redoResult[0];
    expect(redone.title).toBe('After-push');
  });

  it('undo stack is capped at 50 -- oldest pushes are dropped', function () {
    const h = model.createHistory();
    for (let i = 0; i < 60; i++) {
      // Each snapshot needs a discriminating shape so we can verify the cap.
      model.pushHistory(h, { mark: i });
    }
    expect(h.undo.length).toBe(50);
    // The first 10 should have been shifted off; the oldest remaining is mark=10.
    expect(h.undo[0].mark).toBe(10);
    expect(h.undo[h.undo.length - 1].mark).toBe(59);
  });

  it('a fresh pushHistory invalidates the redo stack', function () {
    const h = model.createHistory();
    const s0 = model.createState();
    model.pushHistory(h, s0);
    const s1 = model.updateMetadata(s0, { title: 'A' });
    const u = model.undo(h, s1); // pushes s1 onto redo
    expect(u[1].redo.length).toBe(1);
    // New action fires pushHistory again -- redo should clear.
    model.pushHistory(u[1], u[0]);
    expect(u[1].redo.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 6 -- Render constants + sprite map + drawActor
// ---------------------------------------------------------------------------

describe('Group 6 -- render: constants + sprite map + drawActor', function () {
  let env;
  beforeAll(function () {
    env = loadEditorEnv();
  });

  it('EDITOR_CHIP_PX is the documented 30 CSS px', function () {
    expect(env.LE.render.EDITOR_CHIP_PX).toBe(30);
  });

  it('exposes GRID padding constants', function () {
    expect(typeof env.LE.render.GRID_LEFT_PAD).toBe('number');
    expect(typeof env.LE.render.GRID_TOP_PAD).toBe('number');
  });

  it('loadSpriteRegions populates spriteRegions with all 40 entries from pico_sprite1.json', function () {
    return env.LE.render.loadSpriteRegions().then(function (regions) {
      expect(Object.keys(regions).length).toBe(40);
      // A few sentinel names that the spec relies on:
      expect(regions.player_red_idle_0).toBeDefined();
      expect(regions.door_closed).toBeDefined();
      expect(regions.hud_key_icon).toBeDefined();
      expect(regions.collectible_coin_0).toBeDefined();
      // Region shape is {x, y, w, h} of finite numbers.
      const r = regions.player_red_idle_0;
      expect(typeof r.x).toBe('number');
      expect(typeof r.y).toBe('number');
      expect(typeof r.w).toBe('number');
      expect(typeof r.h).toBe('number');
    });
  });

  it('drawActor does not throw for any of the 13 supported actor types', function () {
    const ctx = makeCtxStub();
    const types = [
      'PlayerSpawn', 'Text', 'SipStation', 'TallyDisplay', 'TallyChute',
      'Tally', 'Gate', 'ContextSlot', 'GoalPad', 'QuestionDoor', 'Key',
      'Goal', 'ReturnWarp',
    ];
    types.forEach(function (type) {
      const actor = {
        type: type,
        x: 0,
        y: 0,
        text: 'sample',
        drink: 'A',
        label: 'A',
        threshold: 3,
        triggerMs: 1500,
        id: 'x1',
        binds: 'tally.sips',
        predicate: 'always_false',
        correct: true,
      };
      expect(function () {
        env.LE.render.drawActor(ctx, actor, 30, 30, { chipPx: 30 });
      }).not.toThrow();
    });
  });

  it('drawActor on an unknown type falls back to the missing-atlas hint and does not throw', function () {
    const ctx = makeCtxStub();
    expect(function () {
      env.LE.render.drawActor(ctx, { type: 'NeverHeardOfIt', x: 0, y: 0 }, 0, 0, { chipPx: 30 });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UI tests -- shared env setup
// ---------------------------------------------------------------------------

describe('Group 7 -- UI: boot + palette', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI(); // auto-init fires
  });

  it('init populates LE.ui with the test handle', function () {
    expect(env.LE.ui).toBeDefined();
    expect(typeof env.LE.ui.init).toBe('function');
    expect(env.LE.ui._test).toBeDefined();
    expect(typeof env.LE.ui._test.handlePaletteClick).toBe('function');
  });

  it('palette has at least 12 actor entries across the 3 groups', function () {
    const entries = env.document.querySelectorAll('.le-palette-entry');
    expect(entries.length).toBeGreaterThanOrEqual(12);

    const mechanic = env.document.querySelectorAll('#le-palette-mechanic .le-palette-entry');
    const legacy = env.document.querySelectorAll('#le-palette-legacy .le-palette-entry');
    const universal = env.document.querySelectorAll('#le-palette-universal .le-palette-entry');
    expect(mechanic.length).toBeGreaterThan(0);
    expect(legacy.length).toBeGreaterThan(0);
    expect(universal.length).toBeGreaterThan(0);
  });

  it('clicking a palette entry marks it active (.is-active) and stores the tool', function () {
    env.LE.ui._test.handlePaletteClick('PlayerSpawn');
    expect(env.LE.ui._test.getActiveTool()).toBe('PlayerSpawn');
    const playerEntry = env.document.querySelector('[data-actor-type="PlayerSpawn"]');
    expect(playerEntry.classList.contains('is-active')).toBe(true);
  });

  it('clicking the same palette entry twice toggles the active tool off', function () {
    env.LE.ui._test.handlePaletteClick('Goal');
    expect(env.LE.ui._test.getActiveTool()).toBe('Goal');
    env.LE.ui._test.handlePaletteClick('Goal');
    expect(env.LE.ui._test.getActiveTool()).toBeNull();
    const goalEntry = env.document.querySelector('[data-actor-type="Goal"]');
    expect(goalEntry.classList.contains('is-active')).toBe(false);
  });
});

describe('Group 8 -- UI: grid interaction', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('placeActorAt with an active tool adds the actor to state.actors[]', function () {
    env.LE.ui._test.setActiveTool('PlayerSpawn');
    env.LE.ui._test.placeActorAt('PlayerSpawn', 4, 4);
    const s = env.LE.ui._test.getState();
    expect(s.actors.length).toBe(1);
    expect(s.actors[0].type).toBe('PlayerSpawn');
    expect(s.actors[0].x).toBe(4);
    expect(s.actors[0].y).toBe(4);
  });

  it('selectActor sets selectedActor', function () {
    env.LE.ui._test.placeActorAt('PlayerSpawn', 1, 1);
    env.LE.ui._test.placeActorAt('Goal', 5, 5);
    env.LE.ui._test.selectActor('main', 0);
    const sel = env.LE.ui._test.getSelectedActor();
    expect(sel).not.toBeNull();
    expect(sel.scope).toBe('main');
    expect(sel.index).toBe(0);
  });

  it('deleteSelectedActor removes the currently-selected actor', function () {
    env.LE.ui._test.placeActorAt('PlayerSpawn', 1, 1);
    env.LE.ui._test.placeActorAt('Goal', 5, 5);
    env.LE.ui._test.selectActor('main', 1);
    env.LE.ui._test.deleteSelectedActor();
    const s = env.LE.ui._test.getState();
    expect(s.actors.length).toBe(1);
    expect(s.actors[0].type).toBe('PlayerSpawn');
    expect(env.LE.ui._test.getSelectedActor()).toBeNull();
  });

  it('hitTestActorAt returns the index of the topmost actor at (x, y), -1 if empty', function () {
    env.LE.ui._test.placeActorAt('PlayerSpawn', 2, 3);
    env.LE.ui._test.placeActorAt('Goal', 2, 3);
    // Both occupy (2,3); last-drawn (Goal at index 1) wins per spec.
    const hit = env.LE.ui._test.hitTestActorAt('main', 2, 3);
    expect(hit).toBe(1);
    expect(env.LE.ui._test.hitTestActorAt('main', 9, 9)).toBe(-1);
  });
});

describe('Group 9 -- UI: props form', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('selecting an actor populates the props form with that type\'s fields', function () {
    env.LE.ui._test.placeActorAt('SipStation', 3, 3);
    env.LE.ui._test.selectActor('main', 0);
    env.LE.ui._test.rebuildPropsForm();
    const form = env.document.getElementById('le-props-form');
    expect(form.classList.contains('is-active')).toBe(true);
    expect(form.querySelector('[data-prop="x"]')).not.toBeNull();
    expect(form.querySelector('[data-prop="y"]')).not.toBeNull();
    expect(form.querySelector('[data-prop="id"]')).not.toBeNull();
    expect(form.querySelector('[data-prop="drink"]')).not.toBeNull();
    // SipStation has no `predicate` field.
    expect(form.querySelector('[data-prop="predicate"]')).toBeNull();
  });

  it('editing a prop input + blur updates state via the model', function () {
    env.LE.ui._test.placeActorAt('SipStation', 3, 3);
    env.LE.ui._test.selectActor('main', 0);
    env.LE.ui._test.rebuildPropsForm();
    const form = env.document.getElementById('le-props-form');
    const drinkField = form.querySelector('[data-prop="drink"] input');
    expect(drinkField).not.toBeNull();
    drinkField.value = 'B';
    // jsdom blur event triggers the bound 'blur' listener.
    drinkField.dispatchEvent(new env.window.Event('blur'));
    const s = env.LE.ui._test.getState();
    expect(s.actors[0].drink).toBe('B');
  });
});

describe('Group 10 -- UI: save / load', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('Save creates a blob URL with the serialized state body', function () {
    let lastBlobBody = null;
    let lastDownloadName = null;
    // Patch Blob to capture body, URL.createObjectURL to spy.
    env.window.Blob = function (parts) {
      lastBlobBody = parts && parts[0];
    };
    env.window.URL.createObjectURL = function () { return 'blob:fake-url'; };
    env.window.URL.revokeObjectURL = function () {};
    // Anchor.click is JSDOM-supported but we intercept download attribute.
    const origCreate = env.document.createElement.bind(env.document);
    env.document.createElement = function (tag) {
      const el = origCreate(tag);
      if (tag === 'a') {
        const realClick = el.click;
        Object.defineProperty(el, 'download', {
          set: function (v) { lastDownloadName = v; },
          get: function () { return lastDownloadName; },
        });
        el.click = function () { /* no-op */ };
        // Keep the real click ref so other code paths don't break.
        el.__realClick = realClick;
      }
      return el;
    };

    env.LE.ui._test.setStateForTest(
      env.LE.model.updateMetadata(env.LE.model.createState(), { levelKey: 'UTEST' })
    );
    env.LE.ui._test.handleSave();

    expect(lastBlobBody).not.toBeNull();
    expect(typeof lastBlobBody).toBe('string');
    // The serialized state must parse cleanly and carry our levelKey.
    const reparsed = JSON.parse(lastBlobBody);
    expect(reparsed.levelKey).toBe('UTEST');
    expect(lastDownloadName).toBe('UTEST.json');
  });

  it('Load via FileReader.onload replaces state from valid JSON', function () {
    // Build a valid level body and feed it through a fake FileReader.
    const body = env.LE.model.serialize(
      env.LE.model.updateMetadata(env.LE.model.createState(), { levelKey: 'ULOAD', title: 'Loaded' })
    );

    let onloadCallback = null;
    env.window.FileReader = function () {
      this.result = null;
      this.onload = null;
      this.onerror = null;
    };
    env.window.FileReader.prototype.readAsText = function () {
      this.result = body;
      onloadCallback = this.onload;
      // Fire onload synchronously so the test does not need to wait.
      if (this.onload) this.onload({});
    };

    // Synthesize a change event on the file input.
    const fileInput = env.document.getElementById('le-file-input');
    // Define a files property whose [0] returns a stub file object.
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: function () {
        return [{ name: 'ULOAD.json', size: body.length }];
      },
    });
    fileInput.dispatchEvent(new env.window.Event('change'));

    const s = env.LE.ui._test.getState();
    expect(s.levelKey).toBe('ULOAD');
    expect(s.title).toBe('Loaded');
  });
});

describe('Group 11 -- UI: reflection tab + camera slider', function () {
  let env;
  beforeEach(function () {
    env = loadEditorEnv();
    env.loadUI();
  });

  it('switchScope("reflection") hides metadata + camera slider and filters palette to {Text, ReturnWarp}', function () {
    env.LE.ui._test.switchScope('reflection');
    const meta = env.document.getElementById('le-metadata');
    const cam = env.document.getElementById('le-camera-slider-wrap');
    expect(meta.style.display).toBe('none');
    expect(cam.style.display).toBe('none');

    // Only Text + ReturnWarp entries should be visible (display !== 'none').
    const visible = [];
    const entries = env.document.querySelectorAll('.le-palette-entry');
    entries.forEach(function (e) {
      if (e.style.display !== 'none') {
        visible.push(e.getAttribute('data-actor-type'));
      }
    });
    expect(visible.sort()).toEqual(['ReturnWarp', 'Text']);
  });

  it('camera slider input updates cameraStart and triggers a re-render', function () {
    // First, give the level enough width for the slider to be usable.
    let s = env.LE.ui._test.getState();
    s = env.LE.model.updateMetadata(s, { map: Object.assign({}, s.map, { width: 96 }) });
    env.LE.ui._test.setStateForTest(s);

    const slider = env.document.getElementById('le-camera-slider');
    expect(slider).not.toBeNull();

    slider.value = '12';
    slider.dispatchEvent(new env.window.Event('input'));
    expect(env.LE.ui._test.getCameraStart()).toBe(12);
  });
});
