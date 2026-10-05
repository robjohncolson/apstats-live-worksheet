import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeSpawnScheduler } from './native-spawn-scheduler.mjs';

const row = (trigger, rule, label) => ({ raw: [trigger, rule, 'Rect', label, 0, 0],
  actorName: 'Rect', label, x: 0, y: 0 });

test('native party rules include minimum, maximum, inclusive range and ten-player lower bounds', () => {
  const rules = [0, 3, -3, 37, 77, 100, 120, -2147483648];
  const expected = new Map([[2, [0, -3]], [3, [0, 3, -3, 37]], [7, [0, 3, 37, 77]],
    [8, [0, 3]], [10, [0, 3, 100]], [12, [0, 3, 100, 120]]]);
  for (const [playerCount, accepted] of expected) {
    const spawned = [];
    const scheduler = createNativeSpawnScheduler({ playerCount, spawns: rules.map(rule => row(0, rule, String(rule))),
      onSpawn: spawn => spawned.push(spawn.raw[1]) });
    scheduler.update(0);
    assert.deepEqual(spawned, accepted, `party size ${playerCount}`);
    assert.equal(scheduler.state.cursor, rules.length);
    assert.equal(scheduler.state.entries.filter(entry => entry.created).length, accepted.length);
    scheduler.state.playerCount = 12;
    scheduler.update(100);
    assert.deepEqual(spawned, accepted, 'passed-over rejected rows are not reconsidered');
  }
});

test('source order blocks later rows and creation is recorded before callback, even if no actor is returned', () => {
  const calls = [];
  const scheduler = createNativeSpawnScheduler({ playerCount: 2,
    spawns: [row(20, 0, 'first'), row(0, 0, 'later')], onSpawn: (spawn, entry) => {
      assert.equal(entry.created, true);
      calls.push(spawn.label);
      return null;
    } });
  scheduler.update(19);
  assert.deepEqual(calls, []);
  assert.equal(scheduler.state.cursor, 0);
  scheduler.update(20);
  assert.deepEqual(calls, ['first', 'later']);
  scheduler.update(100);
  assert.equal(calls.length, 2);
});

test('trigger comparison uses float32 and stops for unordered positions', () => {
  const calls = [];
  const scheduler = createNativeSpawnScheduler({ playerCount: 2,
    spawns: [row(16777217, 0, 'rounded')], onSpawn: spawn => calls.push(spawn.label) });
  scheduler.update(NaN);
  assert.equal(scheduler.state.cursor, 0);
  scheduler.update(16777216);
  assert.deepEqual(calls, ['rounded']);
});

test('indexed creation bypasses party and position gates but never repeats or advances cursor', () => {
  const calls = [], packet = { source: 'peer' };
  const scheduler = createNativeSpawnScheduler({ playerCount: 2,
    spawns: [row(100, 8, 'remote'), row(0, 0, 'ordinary')], onSpawn: (spawn, entry) => {
      calls.push([spawn.label, entry.payload]);
      scheduler.spawnIndex(entry.index, { shouldNotReenter: true });
    } });
  scheduler.spawnIndex(0, packet);
  assert.deepEqual(calls, [['remote', packet]]);
  assert.equal(scheduler.state.cursor, 0);
  assert.equal(scheduler.state.entries[0].payload, null);
  scheduler.spawnIndex(-1); scheduler.spawnIndex(999); scheduler.spawnIndex(0);
  scheduler.update(0);
  assert.deepEqual(calls, [['remote', packet], ['ordinary', null]]);
  assert.equal(scheduler.state.cursor, 2, 'already-created future row does not block following row');
});

test('checkpoint skip excludes the exact boundary and preserves creation bits', () => {
  const calls = [];
  const scheduler = createNativeSpawnScheduler({ playerCount: 2,
    spawns: [row(0, 0, 'old'), row(10, 0, 'boundary'), row(20, 0, 'future')],
    onSpawn: spawn => calls.push(spawn.label) });
  scheduler.skipBefore(10);
  assert.equal(scheduler.state.cursor, 1);
  assert.deepEqual(scheduler.state.entries.map(entry => entry.created), [false, false, false]);
  scheduler.skipBefore(0);
  assert.equal(scheduler.state.cursor, 1);
  scheduler.update(10);
  assert.deepEqual(calls, ['boundary']);
  scheduler.spawnIndex(0);
  assert.deepEqual(calls, ['boundary', 'old'], 'explicit indexed creation can still construct a skipped row');
});

test('shipped jump02 selects its seven-player ledge only for seven players', async () => {
  const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
  const stage = stages.find(stage => stage.name === 'stage_jump02');
  const ledge = stage.createTable.find(row => row.raw[1] === 77);
  assert.deepEqual([ledge.x, ledge.y], [720, 144]);
  for (const playerCount of [2, 6, 7, 8]) {
    const spawns = [];
    const scheduler = createNativeSpawnScheduler({ playerCount, spawns: stage.createTable, onSpawn: row => spawns.push(row) });
    scheduler.update(0);
    assert.equal(spawns.includes(ledge), playerCount === 7);
  }
});

test('shipped auto_scroll02 delays StepEnemy until the original camera threshold', async () => {
  const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
  const stage = stages.find(stage => stage.name === 'stage_auto_scroll02');
  const enemy = stage.createTable.find(row => row.raw[0] === 1968);
  assert.equal(enemy.actorName, 'StepEnemy');
  const spawns = [];
  const scheduler = createNativeSpawnScheduler({ playerCount: 2, spawns: stage.createTable, onSpawn: row => spawns.push(row) });
  scheduler.update(0);
  scheduler.update(1967);
  assert.equal(spawns.includes(enemy), false);
  scheduler.update(1968);
  assert.equal(spawns.includes(enemy), true);
  assert.equal(enemy.x, 2880, 'spawn position is distinct from creation trigger');
});
