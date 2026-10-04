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

describe('calendar door: the park open-door sprite, painted arch until it loads', () => {
  function drawn(engine) {
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...args) => { calls.push([k, ...args]); }, set: (t, k, v) => { t[k] = v; return true; } });
    engine.entities.get('park_doorway').render(ctx);
    return calls;
  }
  const button = win => win.document.querySelector('[data-classroom-native]');

  it('sprite not loaded (or 404): the old arch and its 44x53 hit box, centred at x 43', () => {
    const { win, engine } = mountBoard();
    engine.entities.get('park_doorway').update(1 / 60);
    const calls = drawn(engine);
    expect(calls.some(c => c[0] === 'arcTo')).toBe(true);
    expect(calls.some(c => c[0] === 'drawImage')).toBe(false);
    const b = button(win);
    expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(['21px', '117px', '44px', '53px']);
  });

  it('sprite loaded: the open door 32x32 on the floor at the same centre, and the button matches it', () => {
    const made = [];
    class LoadedImage { constructor() { this.complete = true; this.naturalWidth = 242; made.push(this); } }
    const { win, engine } = mountBoard({ image: LoadedImage, appBuild: '2026-10-03-test' });
    expect(made[0].src).toBe('apstat-park/assets/pico-1-1.png?v=2026-10-03-test');
    engine.entities.get('park_doorway').update(1 / 60);
    const calls = drawn(engine);
    const draw = calls.find(c => c[0] === 'drawImage');
    expect(draw.slice(2)).toEqual([96, 0, 48, 48, 27, 138, 32, 32]);   // atlas doorOpen -> (43 - 16, 170 - 32)
    expect(calls.some(c => c[0] === 'arcTo')).toBe(false);
    const b = button(win);
    expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(['27px', '138px', '32px', '32px']);
  });

  it('an image that fails to load keeps the arch', () => {
    class BrokenImage { constructor() { this.complete = true; this.naturalWidth = 0; } }
    const { engine } = mountBoard({ image: BrokenImage });
    expect(drawn(engine).some(c => c[0] === 'drawImage')).toBe(false);
  });

  it('the atlas rectangle matches pico-atlas.mjs', async () => {
    const { ATLAS } = await import('../apstat-park/assets/pico-atlas.mjs');
    expect(source).toMatch(new RegExp('PARK_DOOR_SPRITE = \{ sx: ' + ATLAS.doorOpen.x + ', sy: ' + ATLAS.doorOpen.y + ', sw: ' + ATLAS.doorOpen.w + ', sh: ' + ATLAS.doorOpen.h + ', size: 32 \}'));
  });
});
