import test from 'node:test';
import assert from 'node:assert/strict';
import { activateNativeBreakoutKeys } from './native-breakout-key.mjs';

test('all five native brick codes keep the breakout key hidden until the last brick is gone', () => {
  for (let code = 1; code <= 5; code++) {
    const key = { spawn: { actorName: 'BreakoutKey' }, active: false, collected: false,
      activate() { this.active = true; } };
    const runtime = { keys: [key], tileMap: { map: { table: ['MC_FLC', `MC_BR${code}`] } } };
    activateNativeBreakoutKeys(runtime);
    assert.equal(key.active, false, 'BR' + code);
    runtime.tileMap.map.table[1] = 'MC_NON';
    activateNativeBreakoutKeys(runtime);
    assert.equal(key.active, true);
  }
});

test('clearing bricks does not reactivate consumed keys or unrelated hidden keys', () => {
  const keys = [{ spawn: { actorName: 'BreakoutKey' }, active: false, collected: true },
    { spawn: { actorName: 'Key' }, active: false, collected: false }];
  activateNativeBreakoutKeys({ keys, tileMap: { map: { table: [] } } });
  assert.ok(keys.every(key => !key.active));
});
