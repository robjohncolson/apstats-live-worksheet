// Solvability driver for the APStat Park campaign (teacher 2026-10-08: "go across all levels and make sure all the
// puzzles can be played out correctly"). Loads recovered/runtime.mjs headless (node + jsdom), the same way
// campaign-engine.mjs does, and gives each solver a small input-only API. Solvers never move a cat by hand: every
// frame is a set of per-cat button states, exactly what the relay would deliver.
import { JSDOM } from 'jsdom';

// --- headless DOM (same shim as campaign-batch2/3.test.mjs) -------------------------------------------------------
if (!globalThis.document) {
  const dom = new JSDOM('<!doctype html>', { pretendToBeVisual: true });
  const noop = () => {};
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({ canvas: this }, {
      get: (target, key) => {
        if (key in target) return target[key];
        if (key === 'measureText') return () => ({ width: 6, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
        if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return noop;
      },
      set: (target, key, value) => { target[key] = value; return true; },
    });
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  for (const key of ['navigator', 'HTMLCanvasElement', 'Image', 'HTMLImageElement']) {
    if (!(key in globalThis)) globalThis[key] = dom.window[key];
  }
  if (!('self' in globalThis)) globalThis.self = dom.window;
  globalThis.requestAnimationFrame ||= (callback) => setTimeout(callback, 16);
}

export const runtime = await import('../recovered/runtime.mjs');
const { createCampaignHelpers } = await import('../campaign-helpers.mjs');
const { restoreJump01Steps } = await import('../campaign-jump01.mjs');
const { CAMPAIGN } = await import('../campaign-catalog.mjs');

export const IDLE = Object.freeze({ left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false });

export const STAGES = CAMPAIGN.map((entry) => ({ tag: `${entry.world}-${entry.stage}`, world: entry.world,
  stage: entry.stage, title: entry.title, source: entry.source, index: entry.index }));

export class Blocked extends Error {
  constructor(reason, details = {}) { super(reason); this.reason = reason; this.details = details; }
}

// Load a stage exactly as campaign-engine.mjs does (variant choice, helpers, the 1-1 step restore).
export function loadStage(source, party = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  if (!entry) throw new Error('unknown stage ' + source);
  const definition = party >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  let stats = {};
  const game = new runtime.GameRuntime((next) => { stats = next; }, () => {});
  game.loadStage(definition, 720, 750, { partySize: party, simplifyPassivePlaceholders: false });
  const helpers = createCampaignHelpers(game, definition, party);
  const jump01 = source === 'stage_jump01';
  if (jump01) restoreJump01Steps(game);
  return {
    game, definition, entry,
    get stats() { return stats; },
    tick(inputs) {
      helpers(inputs.map(() => 0));
      game.update(1 / 60, inputs[0] || IDLE, inputs);
      if (jump01) restoreJump01Steps(game);
    },
  };
}

const rnd = (v) => Math.round(v * 10) / 10;
export const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export const centreX = (cat) => cat.rect.x + cat.rect.width / 2;
export const feetY = (cat) => cat.rect.y + cat.rect.height;
export const isCleared = (run) => !!(run.game.cleared || run.stats.cleared);

// Expand a partial button set ({ right: true, jump: true }) into a full input record.
function input(spec) {
  if (!spec) return IDLE;
  return { ...IDLE, ...spec };
}

// The API handed to solve(stage, api). Every helper advances the simulation; none teleports a cat.
export function createApi(run, { budget = 6000, party, onFrame } = {}) {
  const game = run.game;
  const cats = game.players;
  const n = party ?? cats.length;
  let frame = 0;
  const jumpHeld = new Array(n).fill(false);   // to derive the jumpPressed edge
  const log = [];

  function snapshot() {
    return cats.map((cat) => ({ x: rnd(cat.rect.x), y: rnd(cat.rect.y), feet: rnd(feetY(cat)),
      grounded: !!cat.grounded, dead: (cat.deathTimer || 0) > 0 }));
  }
  function block(reason, extra = {}) {
    throw new Blocked(reason, { frame, cats: snapshot(), ...extra });
  }

  // One frame. specs[i] is a partial button set for cat i ('jump' means held; the press edge is derived).
  // The runtime reads cat i's buttons from input slot game.playerInputSlots[i] (not always i: a Player row with
  // p0 = 1 swaps slots, e.g. [1, 0] in 3-1, 4-1, 10-x, 12-1), so the specs are placed by slot.
  function step(specs = []) {
    if (isCleared(run)) return;
    if (frame >= budget) block('frame budget ' + budget + ' exhausted');
    const slots = game.playerInputSlots || [];
    const inputs = cats.map(() => IDLE);
    for (let i = 0; i < cats.length; i++) {
      const spec = input(specs[i]);
      const pressed = spec.jump && !jumpHeld[i];
      jumpHeld[i] = spec.jump;
      inputs[slots[i] ?? i] = { ...spec, jumpPressed: spec.jumpPressed || pressed };
    }
    run.tick(inputs);
    frame++;
    if (onFrame) onFrame(frame, snapshot(), game);
  }
  function hold(specs, frames) { for (let i = 0; i < frames && !isCleared(run); i++) step(typeof specs === 'function' ? specs(i) : specs); }
  function wait(frames) { hold([], frames); }

  // Repeat specsFn() each frame until pred() is true; Blocked after max frames.
  function until(pred, specsFn, max, label) {
    for (let i = 0; i < max; i++) {
      if (pred() || isCleared(run)) return i;
      step(typeof specsFn === 'function' ? specsFn(i) : specsFn);
    }
    if (pred() || isCleared(run)) return max;
    block((typeof label === 'function' ? label() : label) || 'condition not met in ' + max + ' frames');
  }

  // Walk the given cats (indices) toward target centre x; each stops within tol. extra(i) adds buttons per cat.
  function walkTo(who, x, { tol = 3, max = 900, stall = 90, hop = false, extra = {}, others = {}, label } = {}) {
    const list = Array.isArray(who) ? who : [who];
    const targets = Array.isArray(x) ? x : list.map(() => x);
    // A cat that is within tol, or has crossed its target (walk speed ~4.9 per frame), is done and stands still.
    const arrived = new Set();
    const prevX = cats.map((cat) => cat.rect.x + 1);
    const hopTimer = cats.map(() => 0);
    const firstSide = list.map((c, k) => Math.sign(targets[k] - centreX(cats[c])));
    const check = () => list.forEach((c, k) => {
      const dx = targets[k] - centreX(cats[c]);
      if (Math.abs(dx) <= tol || Math.sign(dx) !== firstSide[k]) arrived.add(c);
    });
    const done = () => { check(); return list.every((c) => arrived.has(c)); };
    // Stall guard: no listed cat moved more than 0.5 in `stall` frames -> Blocked with the stuck positions.
    let lastMove = frame, lastXs = list.map((c) => centreX(cats[c]));
    return until(() => {
      if (done()) return true;
      const xs = list.map((c) => centreX(cats[c]));
      if (xs.some((v, k) => Math.abs(v - lastXs[k]) > 0.5)) { lastMove = frame; lastXs = xs; }
      if (frame - lastMove > stall) block((label || `walk ${list.join(',')} to x ${JSON.stringify(x)}`) + ': stalled');
      return false;
    }, () => {
      const specs = [];
      for (let i = 0; i < cats.length; i++) specs[i] = { ...(others[i] || {}) };
      list.forEach((c, k) => {
        const dx = targets[k] - centreX(cats[c]);
        const dir = arrived.has(c) ? {} : dx > 0 ? { right: true } : { left: true };
        // hop: a walking cat that is blocked (same x as last frame) holds jump for 14 frames to climb the step.
        const blocked = Math.abs(cats[c].rect.x - prevX[c]) < 0.01 && cats[c].grounded && !arrived.has(c);
        if (hop && blocked && hopTimer[c] === 0) hopTimer[c] = 16;
        const jumpNow = hop && hopTimer[c] > 2;
        if (hopTimer[c] > 0) hopTimer[c]--;
        prevX[c] = cats[c].rect.x;
        specs[c] = { ...dir, ...(jumpNow ? { jump: true } : {}), ...(typeof extra === 'function' ? extra(c) : extra[c] || {}) };
      });
      return specs;
    }, max, label || `walk ${list.join(',')} to x ${JSON.stringify(x)}`);
  }

  // A full-height jump for one cat while holding a direction (dir: -1, 0, 1) for `frames` frames.
  function jump(who, { dir = 0, frames = 30, holdJump = 14, others = {} } = {}) {
    const list = Array.isArray(who) ? who : [who];
    hold((f) => {
      const specs = [];
      for (let i = 0; i < cats.length; i++) specs[i] = { ...(others[i] || {}) };
      for (const c of list) {
        specs[c] = { jump: f < holdJump, ...(dir > 0 ? { right: true } : dir < 0 ? { left: true } : {}) };
      }
      return specs;
    }, frames);
  }

  // Jump with mid-air steering: hold jump for holdJump frames and steer each cat's centre toward its target x.
  // Ends when every jumper has left the ground and landed again (or max frames).
  function jumpTo(who, x, { holdJump = 14, max = 150, tol = 2, others = {}, label } = {}) {
    const list = Array.isArray(who) ? who : [who];
    const targets = Array.isArray(x) ? x : list.map(() => x);
    const left = new Set();
    let f = 0;
    until(() => f > 2 && list.every((c) => left.has(c) && cats[c].grounded), () => {
      const specs = [];
      for (let i = 0; i < cats.length; i++) specs[i] = { ...(others[i] || {}) };
      list.forEach((c, k) => {
        if (!cats[c].grounded) left.add(c);
        const dx = targets[k] - centreX(cats[c]);
        specs[c] = { jump: f < holdJump, ...(Math.abs(dx) <= tol ? {} : dx > 0 ? { right: true } : { left: true }) };
      });
      f++;
      return specs;
    }, max, label || `jump ${list.join(',')} to x ${JSON.stringify(x)}`);
  }

  // Cat `top` jumps onto the head of cat `bottom` (bottom stands still): it only closes in horizontally once its feet
  // are above the head, so it never bumps the bottom cat's side. Fails if it lands anywhere else.
  function climbOnto(top, bottom, { max = 150, others = {}, from } = {}) {
    const t = cats[top], b = cats[bottom];
    const side = Math.sign(centreX(t) - centreX(b)) || -1;
    const start = from ?? centreX(b) + side * 56;
    if (Math.abs(centreX(t) - start) > 4) walkTo(top, start, { tol: 3, others });
    let f = 0, left = false;
    until(() => left && t.grounded, () => {
      const specs = [];
      for (let i = 0; i < cats.length; i++) specs[i] = { ...(others[i] || {}) };
      if (!t.grounded) left = true;
      const above = feetY(t) <= b.rect.y + 1;
      const dx = centreX(b) - centreX(t);
      const move = Math.abs(dx) <= 2 ? {} : (above || Math.abs(dx) > 40) ? (dx > 0 ? { right: true } : { left: true }) : {};
      specs[top] = { jump: f < 16, ...move };
      f++;
      return specs;
    }, max, `cat ${top} could not jump onto cat ${bottom}`);
    if (Math.abs(feetY(t) - b.rect.y) > 2) block(`cat ${top} landed beside cat ${bottom} instead of on its head`);
  }

  // Wait until the cats (default all) are standing.
  function land(who, max = 240) {
    const list = who == null ? cats.map((_, i) => i) : Array.isArray(who) ? who : [who];
    until(() => list.every((c) => cats[c].grounded), [], max, 'cats ' + list.join(',') + ' never landed');
    wait(1);
  }

  function carrierOfKey() {
    const held = game.carriedKeys || [];
    return held.length ? cats.indexOf(held[0].player) : -1;
  }

  // Everybody at the door. While the door is shut, the key carrier walks into the door sensor (hopping over a cat
  // in its way) and taps UP; the others wait 100 units back on their side. Once open, every cat walks to the door
  // centre and taps UP to enter. Clear = all cats entered.
  // One cat (it must carry the key if the door is shut) walks into the door and taps UP until it has entered.
  function enterOne(who, { goal = game.goals[0], max = 600 } = {}) {
    const gx = goal.rect.x + goal.rect.width / 2;
    let f = 0;
    until(() => game.goalClearedPlayers?.has(cats[who]) || isCleared(run), () => {
      f++;
      const specs = [];
      const cat = cats[who];
      const dx = gx - centreX(cat);
      const walk = Math.abs(dx) <= 6 ? {} : dx > 0 ? { right: true } : { left: true };
      // Walk to the door centre (leaving room on both sides for the others), then tap UP.
      specs[who] = overlaps(cat.rect, goal.rect) && Math.abs(dx) <= 6 ? { up: f % 2 === 0 } : walk;
      return specs;
    }, max, () => `cat ${who} could not enter the door (door opened: ${!!goal.opened}, key carrier: cat ${carrierOfKey()})`);
  }

  function enterGoal({ goal = game.goals[0], max = 900 } = {}) {
    if (!goal) block('no goal on this stage');
    const gx = goal.rect.x + goal.rect.width / 2;
    const side = Math.sign(cats.reduce((sum, cat) => sum + centreX(cat), 0) / cats.length - gx) || -1;
    const lastX = cats.map((cat) => cat.rect.x);
    let f = 0;
    const towards = (cat, x, tol = 6) => {
      const dx = x - centreX(cat);
      return Math.abs(dx) <= tol ? {} : dx > 0 ? { right: true } : { left: true };
    };
    until(() => isCleared(run), () => {
      f++;
      const carrier = carrierOfKey();
      const specs = cats.map((cat, i) => {
        // An entered cat stays a body here: it moves on to the far side of the door to make room.
        if (game.goalClearedPlayers?.has(cat)) return towards(cat, gx - side * 8, 2);
        const inside = overlaps(cat.rect, goal.rect);
        const stuck = Math.abs(cat.rect.x - lastX[i]) < 0.01;
        lastX[i] = cat.rect.x;
        // Blocked by a wall or step (not by a cat standing beside it): hop.
        const besideCat = cats.some((other) => other !== cat && Math.abs(feetY(other) - feetY(cat)) < 4 &&
          (Math.abs(other.rect.x - (cat.rect.x + cat.rect.width)) < 2 || Math.abs(cat.rect.x - (other.rect.x + other.rect.width)) < 2));
        const hopUp = stuck && !besideCat && f % 20 < 12;
        if (goal.opened || carrier < 0) return inside ? { ...towards(cat, gx), up: f % 2 === 0 } : { ...towards(cat, gx), jump: hopUp };
        if (i !== carrier) return towards(cat, gx + side * 100, 10);
        // The carrier also hops over a cat in its way.
        return inside ? { up: f % 2 === 0 } : { ...towards(cat, gx), jump: stuck && f % 20 < 12 };
      });
      return specs;
    }, max, () => `at the door but no clear (door opened: ${!!goal.opened}, key carrier: cat ${carrierOfKey()}, ` +
      `cats in the door sensor: ${cats.filter((cat) => overlaps(cat.rect, goal.rect)).length}/${cats.length})`);
  }

  return {
    game, cats, run, n,
    get frame() { return frame; },
    get cleared() { return isCleared(run); },
    step, hold, wait, until, walkTo, jump, jumpTo, climbOnto, land, enterGoal, enterOne, carrierOfKey, snapshot, block, log,
    centreX, feetY,
  };
}

// Run one solver: { status, frames, party, blocker? }.
export async function runSolver(stage, solver, options = {}) {
  const result = await runSolverInner(stage, solver, options);
  return result;
}

async function runSolverInner(stage, solver, { onFrame, onGame } = {}) {
  const party = solver.party ?? 2;
  const run = loadStage(stage.source, party, solver.seed ?? 1);
  const api = createApi(run, { budget: solver.budget ?? 6000, party, onFrame });
  if (onGame) onGame(run.game, api);
  if (solver.skip) return { status: 'SKIPPED-UNIMPLEMENTED', party, reason: solver.skip };
  try {
    await solver.solve(stage, api);
  } catch (error) {
    if (!(error instanceof Blocked)) {
      return { status: 'BLOCKED', party, frames: api.frame, reason: 'solver error: ' + error.message,
        details: { frame: api.frame, cats: api.snapshot(), stack: String(error.stack).split('\n').slice(0, 4).join(' | ') } };
    }
    if (isCleared(run)) return { status: 'SOLVED', party, frames: api.frame };
    return { status: 'BLOCKED', party, frames: api.frame, reason: (solver.blocker ? solver.blocker + ' -- ' : '') + error.reason,
      details: error.details };
  }
  if (isCleared(run)) return { status: 'SOLVED', party, frames: api.frame };
  return { status: 'BLOCKED', party, frames: api.frame, reason: (solver.blocker ? solver.blocker + ' -- ' : '') +
    'solver finished without a clear', details: { frame: api.frame, cats: api.snapshot() } };
}

// --- planning aid: ASCII map of tiles + actor rects (one char per chip) -------------------------------------------
export function asciiMap(game, { from = 0, to = Infinity } = {}) {
  const map = game.tileMap;
  const chip = map.chipSize ?? 48;
  const cols = Math.round(map.pixelWidth / chip), rows = Math.round(map.pixelHeight / chip);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = String(r * chip).padStart(5) + ' ';
    for (let c = Math.max(0, from); c < Math.min(cols, to); c++) {
      const probe = { x: c * chip + 2, y: r * chip + 2, width: chip - 4, height: chip - 4 };
      line += map.rectHitsSolid(probe) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// --- solver discovery and the manifest ------------------------------------------------------------------------------
// Each stage has one solver file next to this driver: `<world>-<stage>_<source>.mjs`.
export function solverFileFor(stage) {
  return `${stage.tag}_${stage.source}.mjs`;
}

export async function loadSolver(stage) {
  const module = await import(new URL('./' + solverFileFor(stage), import.meta.url).href);
  return module.default;
}

// Run every stage's solver and return the manifest rows (what manifest.json records).
export async function solveAll({ only } = {}) {
  const rows = [];
  for (const stage of STAGES) {
    if (only && !only.includes(stage.tag)) continue;
    const solver = await loadSolver(stage);
    const result = await runSolver(stage, solver);
    const row = { tag: stage.tag, source: stage.source, title: stage.title, status: result.status, party: result.party };
    if (result.status === 'SOLVED') row.frames = result.frames;
    if (result.status === 'BLOCKED') {
      row.frame = result.details?.frame ?? result.frames;
      row.reason = result.reason;
      row.cats = result.details?.cats;
    }
    if (result.status === 'SKIPPED-UNIMPLEMENTED') row.reason = result.reason;
    rows.push(row);
  }
  return rows;
}
