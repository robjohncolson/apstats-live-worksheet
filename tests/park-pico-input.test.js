// APStat Park review fixes in shared board code:
//  - the `pico` hitbox is 16 x 23 from sprite y + 1 (relay body), feet unchanged; legacy unchanged;
//  - park-only key press counters, and input cleared on blur / hidden tab (calendar too);
//  - the park modules are imported with the build stamp.
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { PICO, LEGACY, STEP } from '../apstat-park/physics.mjs';

const source = readFileSync(resolve(__dirname, '../classroom-board.js'), 'utf8');
const FLOOR = { x: 0, y: 170, w: 2000, h: 30 };
const STAND = 146;

function sprite({ terrain = [FLOOR], peers = {}, physics = PICO, x = 40, y = STAND } = {}) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return new sandbox.window.ClassroomBoard._PlayerSprite({}, {
    x, y, scale: 0.25, input: {}, canvasW: () => 5000, terrain: () => terrain, peers: () => peers, physics
  });
}
const frame = (p, n = 1) => { for (let i = 0; i < n; i++) p.update(STEP); };

describe('pico body: 23 tall from sprite y + 1', () => {
  it('profile: 16 x 23 at (2, 1); feet stay at y + 24', () => {
    expect([PICO.bodyW, PICO.bodyH, PICO.bodyOffsetX, PICO.bodyOffsetY]).toEqual([16, 23, 2, 1]);
    const p = sprite(); frame(p, 3);
    expect(p.y).toBe(STAND);                        // stands on the floor exactly as before
  });

  it('stacks are 23 apart, all the way up a 4-high stack', () => {
    const cats = [{ x: 40, y: STAND, state: 'idle' }];
    for (let k = 1; k < 4; k++) cats.push({ x: 40, y: STAND - 23 * k, state: 'idle' });
    const peers = Object.fromEntries(cats.map((c, i) => ['c' + i, c]));
    const p = sprite({ peers, y: STAND - 23 * 4 - 10 });
    frame(p, 30);
    expect(p.y).toBe(STAND - 23 * 4);
    expect(p.standingOn).toBe(cats[3]);
  });

  it('a rising cat bumps a ceiling with its head (sprite y + 1)', () => {
    const ceiling = { x: 0, y: 100, w: 2000, h: 10 };
    const p = sprite({ terrain: [FLOOR, ceiling] }); frame(p);
    p.input.jump = true;
    let top = p.y;
    for (let i = 0; i < 60; i++) { frame(p); top = Math.min(top, p.y); }
    expect(top).toBeCloseTo(ceiling.y + ceiling.h - 1, 9);
  });

  it('walls: the hitbox rows y+1..y+24 decide what blocks', () => {
    // A ledge whose underside is 0.5 px below the sprite top but above the head (y + 1) does not block.
    const ledge = { x: 60, y: STAND - 30, w: 40, h: 30.5 };
    const p = sprite({ terrain: [FLOOR, ledge] }); frame(p);
    p.input.right = true; frame(p, 30);
    expect(p.x).toBeGreaterThan(60);
  });

  it('legacy physics is untouched (no offset, dt-scaled path)', () => {
    expect(LEGACY.bodyOffsetY).toBeUndefined();
    const p = sprite({ physics: LEGACY }); p.update(0.1);
    expect(p.y).toBe(STAND);
  });
});

function mountBoard({ image = null, appBuild = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', { url: 'https://example.com' });
  const win = dom.window;
  function WS() { this.readyState = 0; this.sent = []; }
  WS.prototype.send = function (d) { this.sent.push(d); };
  WS.prototype.close = function () {};
  win.WebSocket = WS;
  win.setInterval = () => 0; win.clearInterval = () => {};
  win.setTimeout = () => 0; win.clearTimeout = () => {};
  win.requestAnimationFrame = () => {};
  function Engine(id) { this.canvas = win.document.getElementById(id); this.ctx = { setTransform() {} }; this.entities = new Map(); win.__engine = this; }
  Engine.prototype.addEntity = function (id, e) { this.entities.set(id, e); e.engine = this; };
  Engine.prototype.removeEntity = function (id) { this.entities.delete(id); };
  Engine.prototype.start = function () {}; Engine.prototype.stop = function () {};
  Engine.prototype.resize = function () {};
  Object.defineProperty(Engine.prototype, 'groundY', { get() { return 170; } });
  win.CanvasEngine = Engine;
  win.SpriteSheet = function () { this.loaded = true; this.drawFrame = () => {}; };
  if (image) win.Image = image;
  if (appBuild) win.APP_BUILD = appBuild;
  vm.runInContext(source, vm.createContext(win));
  const handle = win.ClassroomBoard.mount(win.document.getElementById('host'), { wsUrl: 'wss://x', section: 'B', username: 'me', role: 'student', hue: 90 });
  return { win, handle, engine: win.__engine };
}
const key = (win, type, k, extra = {}) => win.document.dispatchEvent(new win.KeyboardEvent(type, { key: k, bubbles: true, ...extra }));

describe('board input', () => {
  it('held flags behave as before for the calendar; repeats do not count as presses', () => {
    const { win, handle } = mountBoard();
    const input = handle._getPlayerInput(), presses = handle._getParkPresses();
    key(win, 'keydown', ' ');
    expect(input.jump).toBe(true); expect(presses.jump).toBe(1);
    key(win, 'keydown', ' ', { repeat: true });
    expect(presses.jump).toBe(1);
    key(win, 'keyup', ' ');
    expect(input.jump).toBe(false); expect(presses.jump).toBe(1);
    key(win, 'keydown', ' '); key(win, 'keyup', ' ');      // a tap inside one task: counted
    expect(presses.jump).toBe(2); expect(input.jump).toBe(false);
  });

  it('blur and a hidden tab clear held keys (no stuck Right after alt-tab)', () => {
    const { win, handle } = mountBoard();
    const input = handle._getPlayerInput();
    key(win, 'keydown', 'ArrowRight');
    expect(input.right).toBe(true);
    win.dispatchEvent(new win.Event('blur'));
    expect(input.right).toBe(false);
    key(win, 'keydown', 'ArrowLeft');
    Object.defineProperty(win.document, 'hidden', { value: true, configurable: true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    expect(input.left).toBe(false);
  });

  it('the park panel is imported with the build stamp', () => {
    expect(source).toMatch(/import\('\.\/apstat-park\/panel\.mjs' \+ parkBuildQuery\(\)\)/);
    expect(source).toMatch(/presses: parkPresses/);
  });
});

describe('calendar door: the park open-door sprite; nothing until decoded; plain block on failure', () => {
  function drawn(engine) {
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...args) => { calls.push([k, ...args, t.fillStyle]); }, set: (t, k, v) => { t[k] = v; return true; } });
    engine.entities.get('park_doorway').render(ctx);
    return calls;
  }
  const button = win => win.document.querySelector('[data-classroom-native]');
  const box = win => { const b = button(win); return [b.style.left, b.style.top, b.style.width, b.style.height]; };

  it('still decoding: nothing is drawn (never the old arch); the 32x32 hit area is in place', () => {
    class Pending { constructor() { this.complete = false; this.naturalWidth = 0; } }
    const { win, engine, handle } = mountBoard({ image: Pending });
    engine.entities.get('park_doorway').update(1 / 60);
    const calls = drawn(engine);
    expect(calls.filter(c => ['drawImage', 'fillRect', 'arcTo', 'fill'].includes(c[0]))).toEqual([]);
    expect(box(win)).toEqual(['27px', '138px', '32px', '32px']);
    expect(handle._getParkAtlasState()).toBe('loading');
  });

  it('decoded at mount: the open door 32x32 on the floor at x 43, button over it, shared with the park', () => {
    const made = [];
    class LoadedImage { constructor() { this.complete = true; this.naturalWidth = 242; made.push(this); } }
    const { win, engine, handle } = mountBoard({ image: LoadedImage, appBuild: '2026-10-03-test' });
    expect(made[0].src).toBe('apstat-park/assets/pico-1-1.png?v=2026-10-03-test');
    expect(handle._getParkAtlasState()).toBe('ready');           // preloaded at mount, before any paint
    engine.entities.get('park_doorway').update(1 / 60);
    const calls = drawn(engine);
    expect(calls.find(c => c[0] === 'drawImage').slice(2, 10)).toEqual([96, 0, 48, 48, 27, 138, 32, 32]);
    expect(calls.some(c => c[0] === 'arcTo' || c[0] === 'fillRect')).toBe(false);
    expect(box(win)).toEqual(['27px', '138px', '32px', '32px']);
    expect(source).toMatch(/atlas: function \(\) \{ return parkDoorSpriteReady\(\) \? parkDoorImage : null; \}/);
  });

  it('the atlas can never load: a plain block in the page text colour, not the arch', () => {
    const made = [];
    class BrokenImage { constructor() { this.complete = false; this.naturalWidth = 0; made.push(this); } }
    const { win, engine, handle } = mountBoard({ image: BrokenImage });
    win.document.getElementById('host').style.color = 'rgb(17, 34, 51)';
    made[0].onerror();
    expect(handle._getParkAtlasState()).toBe('failed');
    const calls = drawn(engine);
    const rect = calls.find(c => c[0] === 'fillRect');
    expect(rect.slice(1, 5)).toEqual([27, 138, 32, 32]);
    expect(rect[5]).toBe('rgb(17, 34, 51)');
    expect(calls.some(c => c[0] === 'arcTo' || c[0] === 'drawImage')).toBe(false);
  });

  it('the atlas rectangle matches pico-atlas.mjs', async () => {
    const { ATLAS } = await import('../apstat-park/assets/pico-atlas.mjs');
    expect(source).toMatch(new RegExp('PARK_DOOR_SPRITE = \{ sx: ' + ATLAS.doorOpen.x + ', sy: ' + ATLAS.doorOpen.y + ', sw: ' + ATLAS.doorOpen.w + ', sh: ' + ATLAS.doorOpen.h + ', size: 32 \}'));
  });
});

describe('calendar cats from the atlas: colour and frames as before', () => {
  const board = () => { const sandbox = { window: {} }; vm.runInNewContext(source, sandbox); return sandbox.window.ClassroomBoard; };

  it('body colour = hue-rotate(#ff8c8c), matching what Chrome rendered (measured) within 1', async () => {
    const B = board();
    // Measured from Chrome's canvas filter hue-rotate on rgb(255,140,140).
    const chrome = { 0: [255, 140, 140], 45: [211, 159, 83], 90: [140, 181, 74], 135: [83, 193, 118], 180: [74, 189, 189],
      240: [140, 162, 255], 300: [231, 138, 231], 345: [255, 137, 164] };
    for (const [h, rgb] of Object.entries(chrome)) {
      const c = B._catBodyForHue(+h);
      c.forEach((v, i) => expect(Math.abs(v - rgb[i])).toBeLessThanOrEqual(1));
    }
    const { catBodyForHue } = await import('../apstat-park/pico-rules.mjs');
    for (let h = 0; h < 360; h++) expect(B._catBodyForHue(h)).toEqual(catBodyForHue(h));   // board and level agree
    expect(B._catBodyForHue(undefined)).toEqual([255, 140, 140]);                            // no hue: the base pink
    expect(B._catBodyForHue(450)).toEqual(B._catBodyForHue(90));
  });

  it('sprite.png frame -> atlas cell: f < 11 right-facing, 11 + f mirrored, dead frame 12 = cell 1 unmirrored', () => {
    const B = board();
    for (let f = 0; f < 11; f++) expect(B._catFrameCell(f)).toEqual({ cell: f, mirrored: false });
    for (let f = 11; f < 22; f++) expect(B._catFrameCell(f)).toEqual({ cell: f - 11, mirrored: f !== 12 });
  });

  it('the calendar uses the same frame indices as before (idle 0/10, walk 2-5, jump 5, left = +11)', () => {
    expect(source).toMatch(/var IDLE_FRAMES = \[0, 10\];/);
    expect(source).toMatch(/var WALK_FRAMES = \[2, 3, 4, 5\];/);
    expect(source).toMatch(/var JUMP_FRAME {4}= 5;/);
    expect(source).toMatch(/return this\.facingRight \? baseFrame : baseFrame \+ 11;/);
  });

  it('atlas not decoded: nothing drawn; atlas failed: a flat block in the student colour, 20x24', () => {
    const B = board();
    const calls = [];
    const ctx = { save() {}, restore() {}, fillRect(...a) { calls.push(['fillRect', this.fillStyle, ...a]); }, drawImage(...a) { calls.push(['drawImage', ...a]); } };
    let failed = false;
    const sheet = new B._AtlasCatSheet(() => null, () => failed, null);
    sheet.drawFrame(ctx, 0, 10, 20, 0.25, 90);
    expect(calls).toEqual([]);
    expect(sheet.loaded).toBe(false);
    failed = true;
    sheet.drawFrame(ctx, 0, 10, 20, 0.25, 90);
    expect(calls).toEqual([['fillRect', 'rgb(140,181,74)', 10, 20, 20, 24]]);
    expect(sheet.loaded).toBe(true);
  });

  it('the board no longer loads sprite.png', () => {
    expect(source).not.toMatch(/'sprite\.png'/);
    expect(source).toMatch(/spriteSheet = new AtlasCatSheet\(/);
  });
});
