import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PICO } from './physics.mjs';
import { approachSteps, createCalculatorMotion } from './calculator-motion.mjs';
import { KEYS, ANSWERS } from './calculator-mission.mjs';

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../classroom-board.js', import.meta.url), 'utf8'), sandbox);
const Player = sandbox.window.ClassroomBoard._PlayerSprite;

function setup(platforms = []) {
  const input = {}, presses = { jump: 0, up: 0 };
  const floor = { x: 0, y: 700, w: 720, h: 50 };
  const player = new Player({}, { x: 20, y: 676, input, physics: PICO,
    canvasW: () => 720, peers: () => ({}),
    terrain: () => [floor, ...platforms.filter(p => player.vy >= 0 && player.y + 24 <= p.y + 1)] });
  const motion = createCalculatorMotion(player, input, presses);
  motion.advance(1 / 60);
  return { player, input, presses, motion };
}

test('Pico calculator movement is identical at 30, 60 and 144 Hz', () => {
  const results = [30, 60, 144].map(rate => {
    const { player, input, motion } = setup();
    input.right = true; input.jump = true;
    for (let i = 0; i < rate; i++) motion.advance(1 / rate);
    return [player.x, player.y, player.vy];
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('a tap between render frames jumps; holding gives the Pico variable jump height', () => {
  function height(held) {
    const { player, input, presses, motion } = setup();
    presses.jump++;
    input.jump = held;
    let top = player.y;
    for (let i = 0; i < 144; i++) {
      motion.advance(1 / 144);
      top = Math.min(top, player.y);
    }
    return 676 - top;
  }
  assert.ok(height(false) > 0);
  assert.ok(height(true) > height(false) * 2);
  assert.ok(Math.abs(height(true) - 39.285) < 0.001);
});

test('both phases have a physically jumpable route from the ground to every tile', () => {
  for (const summary of [false, true]) {
    const keys = summary ? ANSWERS : KEYS;
    const floor = { x: 0, y: 700, w: 720, h: 50 };
    const platforms = [...approachSteps(summary), ...keys.map(key => ({ ...key, h: 8 }))];
    const reachable = new Set([floor]);
    // Try takeoff points along each reached surface, with tap/held jumps and steering.
    // The real PlayerSprite performs landing and one-way collision checks.
    for (const source of reachable) {
      for (let x = source.x; x <= source.x + source.w - 20; x += 8) {
        for (const direction of [-1, 0, 1]) {
          for (const holdFrames of [1, 65]) {
            const { player, input, motion } = setup(platforms);
            Object.assign(player, { x, y: source.y - 24, vy: 0 });
            motion.advance(1 / 60);
            input.left = direction < 0; input.right = direction > 0;
            for (let frame = 0; frame < 65; frame++) {
              input.jump = frame < holdFrames;
              motion.advance(1 / 60);
              if (frame < 2 || player.vy !== 0) continue;
              const landed = platforms.find(p => Math.abs(player.y + 24 - p.y) < 0.01
                && player.x + 18 > p.x && player.x + 2 < p.x + p.w);
              if (landed) reachable.add(landed);
              break;
            }
          }
        }
      }
    }
    for (const key of keys) {
      assert.ok([...reachable].some(p => p.key === key.key), `${summary ? 'summary' : 'keyboard'}: ${key.key}`);
    }
  }
});
