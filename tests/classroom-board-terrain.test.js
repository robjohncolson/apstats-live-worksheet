import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

function player(terrain, extra = {}) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../classroom-board.js'), 'utf8'), sandbox);
  return new sandbox.window.ClassroomBoard._PlayerSprite({}, {
    x: 40, y: 146, scale: 0.25, input: {}, canvasW: () => 1000,
    terrain: () => terrain, ...extra
  });
}
function step(p, count = 60) { for (let i = 0; i < count; i++) p.update(1 / 60); }

describe('board player on puzzle terrain', () => {
  it('lands on a ledge and can jump from it', () => {
    const p = player([{ x: 0, y: 170, w: 300, h: 30 }, { x: 30, y: 110, w: 70, h: 20 }], { y: 20 });
    step(p);
    expect(p.y).toBe(86);
    p.input.jump = true; p.update(1 / 60);
    expect(p.y).toBeLessThan(86);
  });

  it('stops at a wall and hits the underside of a ceiling', () => {
    const p = player([{ x: 0, y: 170, w: 300, h: 30 }, { x: 80, y: 90, w: 30, h: 80 },
      { x: 0, y: 105, w: 80, h: 10 }]);
    p.input.right = true; step(p);
    expect(p.x).toBe(60);
    p.input.right = false; p.input.jump = true;
    let highest = p.y;
    for (let i = 0; i < 30; i++) { p.update(1 / 60); highest = Math.min(highest, p.y); }
    expect(highest).toBe(115);
  });

  it('falls through a gap instead of landing on the calendar floor', () => {
    const p = player([{ x: 0, y: 170, w: 80, h: 30 }]);
    p.input.right = true; step(p);
    expect(p.y).toBeGreaterThan(200);
    expect(p._onFloor()).toBe(false);
  });

  it('retains teammate stacking over terrain', () => {
    const p = player([{ x: 0, y: 170, w: 300, h: 30 }], { y: 30,
      peers: () => ({ friend: { x: 40, y: 146, state: 'idle' } }) });
    step(p);
    expect(p.y).toBe(122);
    expect(p.standingOn).toBeTruthy();
  });

  it('keeps a carried player supported across fractional lift coordinates', () => {
    const lift = { x: 30, y: 170, w: 60, h: 10 };
    const p = player([lift]);
    for (let i = 0; i < 180; i++) {
      const next = 170 - 106 * (i + 1) / 180;
      p.y += next - lift.y;
      lift.y = next;
      p.update(1 / 60);
      expect(p.y + 24).toBeCloseTo(lift.y, 8);
      expect(p._onFloor()).toBe(true);
    }
  });
});
