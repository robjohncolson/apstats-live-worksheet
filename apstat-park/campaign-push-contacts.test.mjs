import test from 'node:test';
import assert from 'node:assert/strict';
import { planBoxPush } from './campaign-push-contacts.mjs';
const rect = x => ({ x, y: 0, width: 20, height: 40 });
test('pushing in either direction carries the cat instead of crossing it', () => {
  for (const sign of [-1, 1]) {
    const box = rect(100), destination = rect(100 + sign * 4);
    const players = [rect(sign > 0 ? 80 : 120), rect(sign > 0 ? 120 : 80)];
    const result = planBoxPush(box, destination, players, 0, () => false);
    assert.equal(result.get(1).x, players[1].x + sign * 4);
    assert.equal(players[1].x, sign > 0 ? 120 : 80, 'planning never mutates a cat');
  }
});
test('a pinned cat blocks the entire push, including a chain of cats', () => {
  const box = rect(100), players = [rect(80), rect(120), rect(140)];
  assert.equal(planBoxPush(box, rect(104), players, 0, r => r.x + r.width > 160), null);
  const free = planBoxPush(box, rect(104), players, 0, () => false);
  assert.equal(free.get(1).x, 124); assert.equal(free.get(2).x, 144);
});
