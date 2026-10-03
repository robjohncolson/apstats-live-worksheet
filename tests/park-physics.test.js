// APStat Park physics: the opt-in `pico` profile (half-scale PICO PARK
// measurements) and the fixed 60 Hz step that the park scene runs it in.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { PICO, LEGACY, STEP, MAX_STEPS, createFixedStep, profileFor } from '../apstat-park/physics.mjs';

const source = readFileSync(resolve(__dirname, '../classroom-board.js'), 'utf8');
const FLOOR = { x: 0, y: 170, w: 2000, h: 30 };
const STAND = 146;   // FLOOR.y - 24

function sprite({ terrain = [FLOOR], peers = {}, physics = PICO, x = 40, y = STAND } = {}) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return new sandbox.window.ClassroomBoard._PlayerSprite({}, {
    x, y, scale: 0.25, input: {}, canvasW: () => 5000,
    terrain: () => terrain, peers: () => peers, physics
  });
}
const frame = (p, n = 1) => { for (let i = 0; i < n; i++) p.update(STEP); };

// Independent statement of the measured recurrence: the launch frame only
// sets vy; every later frame does y += vy, then the held boost, then gravity.
function recurrenceHeight(heldFrames) {
  let y = 0, vy = PICO.launchVy, top = 0;
  for (let k = 1; k < 500; k++) {
    y += vy;
    if (k <= Math.min(heldFrames, 13)) vy -= 0.51 * (1 - k / 14);
    vy = Math.min(vy + 0.325, 9.75);
    top = Math.min(top, y);
    if (y >= 0) break;
  }
  return -top;
}

function jumpHeight(heldFrames) {
  const p = sprite();
  frame(p);                       // settle on the floor
  p.input.jump = true;
  frame(p);                       // launch frame
  let top = p.y;
  for (let k = 1; k < 200; k++) {
    p.input.jump = k <= heldFrames;
    frame(p);
    top = Math.min(top, p.y);
  }
  expect(p.y).toBe(STAND);        // landed again
  return STAND - top;
}

describe('pico profile: jump heights', () => {
  it('tap height is 11.3 px (half of the native 22.6)', () => {
    expect(recurrenceHeight(0)).toBeCloseTo(11.3, 10);
    expect(jumpHeight(0)).toBeCloseTo(recurrenceHeight(0), 9);
    expect(Math.abs(jumpHeight(0) - 11.3)).toBeLessThan(0.01);
  });

  it('full-hold height is 39.285 px (the 39.3 in the table, half of 78.57)', () => {
    expect(recurrenceHeight(13)).toBeCloseTo(39.285, 9);
    expect(jumpHeight(40)).toBeCloseTo(recurrenceHeight(13), 9);
    expect(jumpHeight(13)).toBeCloseTo(recurrenceHeight(13), 9);
  });

  it('a partial hold boosts only on the frames it was held', () => {
    expect(jumpHeight(5)).toBeCloseTo(recurrenceHeight(5), 9);
    expect(jumpHeight(5)).toBeGreaterThan(jumpHeight(0));
    expect(jumpHeight(5)).toBeLessThan(jumpHeight(13));
  });

  it('re-pressing after a release does not restart the boost', () => {
    const p = sprite(); frame(p);
    p.input.jump = true; frame(p, 3);
    p.input.jump = false; frame(p);
    p.input.jump = true;
    let top = p.y;
    for (let i = 0; i < 120; i++) { frame(p); top = Math.min(top, p.y); }
    expect(STAND - top).toBeCloseTo(recurrenceHeight(2), 9);
  });

  it('launch frame: vy is set, nothing moves, not even horizontally', () => {
    const p = sprite(); frame(p);
    p.input.right = true; p.input.jump = true;
    frame(p);
    expect(p.x).toBe(40);
    expect(p.y).toBe(STAND);
    expect(p.vy).toBeCloseTo(PICO.launchVy * 60, 9);
    frame(p);
    expect(p.x).toBe(41.5);
    expect(p.y).toBeCloseTo(STAND + PICO.launchVy, 9);
  });

  it('walks 1.5 px per frame with instant start and stop, also in the air', () => {
    const p = sprite(); frame(p);
    p.input.right = true; frame(p);
    expect(p.x).toBe(41.5);
    p.input.right = false; frame(p);
    expect(p.x).toBe(41.5);
    p.input.jump = true; frame(p);            // launch
    p.input.left = true; frame(p, 4);
    expect(p.x).toBe(41.5 - 6);
  });

  it('falls at no more than 9.75 px per frame', () => {
    const p = sprite({ terrain: [{ x: 0, y: 5000, w: 2000, h: 30 }], y: 0 });
    let last = p.y, fastest = 0;
    for (let i = 0; i < 200; i++) { frame(p); fastest = Math.max(fastest, p.y - last); last = p.y; }
    expect(fastest).toBeCloseTo(9.75, 9);
    expect(p.vy).toBeCloseTo(9.75 * 60, 9);
  });
});

describe('pico profile: coyote time, no buffer, no double jump', () => {
  // Walk off a ledge; k = airborne frames completed before the press.
  function pressAfterAirFrames(k) {
    const p = sprite({ terrain: [{ x: 0, y: 170, w: 100, h: 30 }, { x: 0, y: 900, w: 2000, h: 30 }], x: 90 });
    frame(p);
    p.input.right = true;
    let guard = 0;
    while (p.state !== 'jumping' && guard++ < 100) frame(p);
    p.input.right = false;
    frame(p, k - 1);
    const y = p.y;
    p.input.jump = true; frame(p);
    return { launched: p.vy < 0, y, p };
  }
  it('jumps after 1..4 airborne frames', () => {
    for (const k of [1, 2, 3, 4]) expect(pressAfterAirFrames(k).launched).toBe(true);
  });
  it('does not jump from the 5th airborne frame', () => {
    expect(pressAfterAirFrames(5).launched).toBe(false);
    expect(pressAfterAirFrames(6).launched).toBe(false);
  });

  it('a press in the air is not buffered, and holding through a landing does not re-jump', () => {
    const p = sprite(); frame(p);
    p.input.jump = true; frame(p);
    p.input.jump = false; frame(p, 10);       // past the apex of a tap
    expect(p.state).toBe('jumping');
    p.input.jump = true;                      // pressed late, held through the landing
    for (let i = 0; i < 60; i++) { frame(p); }
    expect(p.y).toBe(STAND);
    expect(p.vy).toBe(0);
    p.input.jump = false; frame(p);
    p.input.jump = true; frame(p);            // a fresh press works
    expect(p.vy).toBeLessThan(0);
  });

  it('holding a full jump through the landing does not bounce', () => {
    const p = sprite(); frame(p);
    p.input.jump = true;
    let landedAt = -1;
    for (let i = 0; i < 120; i++) { frame(p); if (landedAt < 0 && i > 2 && p.y === STAND) landedAt = i; }
    expect(landedAt).toBeGreaterThan(0);
    expect(p.y).toBe(STAND);
  });

  it('no double jump', () => {
    const p = sprite(); frame(p);
    p.input.jump = true; frame(p);
    p.input.jump = false; frame(p, 3);
    const vy = p.vy;
    p.input.jump = true; frame(p);
    expect(p.vy).toBeGreaterThan(vy);         // only gravity acted
  });
});

describe('pico profile: stacking on teammates', () => {
  it('a carrier with a rider on its head cannot jump', () => {
    const peers = { rider: { x: 45, y: STAND - 24, state: 'idle' } };
    const p = sprite({ peers }); frame(p);
    p.input.jump = true; frame(p, 3);
    expect(p.y).toBe(STAND);
    expect(p._blockedTwitchMs).toBeGreaterThan(0);
  });

  it('a rider is not carried horizontally and inherits no speed when jumping off', () => {
    const carrier = { x: 40, y: STAND, state: 'idle' };
    const p = sprite({ peers: { carrier }, y: STAND - 24 });
    frame(p);
    expect(p.standingOn).toBe(carrier);
    for (let i = 0; i < 6; i++) { carrier.x += 1.5; frame(p); }
    expect(p.x).toBe(40);
    expect(p.y).toBe(STAND - 24);
    p.input.jump = true;
    for (let i = 0; i < 20; i++) { carrier.x += 1.5; frame(p); }
    expect(p.x).toBe(40);
  });

  it('support holds while centres are within 17 px', () => {
    const carrier = { x: 40, y: STAND, state: 'idle' };
    const p = sprite({ peers: { carrier }, y: STAND - 24 });
    frame(p);
    carrier.x = 40 + 16.9; frame(p);
    expect(p.standingOn).toBe(carrier);
    expect(p.y).toBe(STAND - 24);
    carrier.x = 40 + 17; frame(p, 2);
    expect(p.standingOn).toBe(null);
    expect(p.y).toBeGreaterThan(STAND - 24);
    expect(p.x).toBe(40);
  });

  it('a rider stays on a rising carrier (no fall-through)', () => {
    const carrier = { x: 40, y: STAND, state: 'idle' };
    const p = sprite({ peers: { carrier }, y: STAND - 24 });
    frame(p);
    let vy = PICO.launchVy;
    for (let k = 1; k <= 8; k++) {
      carrier.y += vy; vy += PICO.gravity;
      frame(p);
      expect(p.y).toBeCloseTo(carrier.y - 24, 9);
      expect(p.standingOn).toBe(carrier);
    }
  });

  it('a rider stays on a falling carrier, and that counts as ground for jumping', () => {
    const carrier = { x: 40, y: STAND, state: 'idle' };
    const p = sprite({ terrain: [{ x: 0, y: 900, w: 2000, h: 30 }], peers: { carrier }, y: STAND - 24 });
    frame(p);
    let vy = 0;
    for (let k = 0; k < 20; k++) {
      carrier.y += vy; vy = Math.min(vy + PICO.gravity, PICO.terminal);
      frame(p);
      expect(p.y).toBeCloseTo(carrier.y - 24, 9);
    }
    p.input.jump = true; frame(p);
    expect(p.vy).toBeCloseTo(PICO.launchVy * 60, 9);
  });

  it('teammates block at one body width (16 px) without pushing', () => {
    const friend = { x: 80, y: STAND, state: 'idle' };
    const p = sprite({ peers: { friend } }); frame(p);
    p.input.right = true; frame(p, 40);
    expect(p.x).toBe(80 - PICO.bodyW);
    expect(friend.x).toBe(80);
    friend.x = 70;                            // overlapping: cannot get closer, can leave
    frame(p);
    expect(p.x).toBe(64);
    expect(friend.x).toBe(70);
    p.input.right = false; p.input.left = true; frame(p);
    expect(p.x).toBe(62.5);
  });

  it('a rising player bumping a teammate underside stops and does not launch them', () => {
    const above = { x: 42, y: STAND - 44, state: 'idle' };   // feet 20 px above our head
    const p = sprite({ peers: { above } }); frame(p);
    p.input.jump = true;
    let top = p.y;
    for (let i = 0; i < 60; i++) { frame(p); top = Math.min(top, p.y); }
    expect(top).toBeCloseTo(above.y + 24, 9);
    expect(above.y).toBe(STAND - 44);
    expect(p.y).toBe(STAND);
  });
});

describe('fixed 60 Hz step', () => {
  function script(p, i) {
    p.input.right = i >= 5 && i < 60;
    p.input.jump = (i >= 10 && i < 22) || (i >= 70 && i < 72);
  }
  function trajectory(physics, dts) {
    const p = sprite({ physics, terrain: [FLOOR, { x: 120, y: 150, w: 60, h: 20 }] });
    const clock = createFixedStep();
    const out = [];
    let i = 0;
    for (const dt of dts) {
      clock.advance(dt, () => { script(p, i++); p.update(clock.step); out.push([p.x, p.y]); });
      if (out.length >= 150) break;
    }
    return out.slice(0, 150);
  }
  const seq = (dt, seconds = 3) => Array.from({ length: Math.ceil(seconds / dt) + 2 }, () => dt);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jitter = Array.from({ length: 2000 }, () => 0.002 + random() * 0.06);

  for (const physics of [PICO, LEGACY]) {
    it(physics.name + ': identical trajectories at 30, 60, 144 Hz and jittered frames', () => {
      const reference = trajectory(physics, seq(1 / 60));
      expect(reference).toHaveLength(150);
      expect(trajectory(physics, seq(1 / 30))).toEqual(reference);
      expect(trajectory(physics, seq(1 / 144))).toEqual(reference);
      expect(trajectory(physics, jitter)).toEqual(reference);
    });
  }

  it('the legacy profile equals the calendar constants', () => {
    const a = sprite({ physics: null, terrain: [FLOOR] }), b = sprite({ physics: LEGACY, terrain: [FLOOR] });
    for (let i = 0; i < 90; i++) {
      for (const p of [a, b]) { script(p, i); p.update(STEP); }
      expect([b.x, b.y, b.vy]).toEqual([a.x, a.y, a.vy]);
    }
  });

  it('legacy: a fixed step can cross a sprite-wide seam between two floors (Lift relay x 400..420)', () => {
    const p = sprite({ physics: LEGACY, x: 118, terrain: [{ x: 0, y: 170, w: 400, h: 50 }, { x: 420, y: 170, w: 70, h: 10 }] });
    p.input.right = true;
    let lowest = p.y;
    for (let i = 0; i < 200 && p.x < 440; i++) { p.update(STEP); lowest = Math.max(lowest, p.y); }
    expect(p.x).toBeGreaterThanOrEqual(440);
    expect(p.y).toBe(STAND);
    expect(lowest).toBeLessThan(STAND + 0.5);
  });

  it('runs at most MAX_STEPS per frame and drops time past the cap', () => {
    const clock = createFixedStep();
    let n = 0;
    expect(clock.advance(0.1, () => { n++; })).toBe(MAX_STEPS);
    expect(clock.advance(0.5, () => { n++; })).toBe(MAX_STEPS);
    expect(clock.pending).toBeLessThan(STEP);
    expect(clock.advance(1 / 120, () => { n++; })).toBeLessThanOrEqual(1);
    expect(clock.advance(0, () => { n++; })).toBe(0);
  });

  it('levels opt in to pico physics by name; everything else stays legacy', () => {
    expect(profileFor({ physics: 'pico' })).toBe(PICO);
    expect(profileFor({})).toBe(LEGACY);
    expect(profileFor(null)).toBe(LEGACY);
  });
});
