import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastNativeGoalOpen, contactNativeGoalKeys, consumeNativeGoalKeys } from './native-goals.mjs';

const rect = (x = 0) => ({ x, y: 0, width: 32, height: 32 });
const key = (x = 0) => ({ active: true, rect: rect(x), consume() { this.active = false; } });
const goal = (x = 0, label = '') => ({ opened: false, rect: rect(x), spawn: { label } });

test('collecting a distant key does not open a door; delivery opens once and consumes next PRE', () => {
  const events = [], carried = key(100), door = goal();
  const runtime = { keys: [carried], goals: [door], carriedKeys: [{ key: carried, player: {} }], onEvent: e => events.push(e) };
  contactNativeGoalKeys(runtime);
  assert.equal(door.opened, false);
  carried.rect.x = 0;
  contactNativeGoalKeys(runtime);
  contactNativeGoalKeys(runtime);
  assert.equal(door.opened, true);
  assert.equal(carried.active, true);
  assert.equal(events.length, 1);
  consumeNativeGoalKeys(runtime);
  assert.equal(carried.active, false);
  assert.deepEqual(runtime.carriedKeys, []);
  assert.equal(door.opened, true);
});

test('hidden keys cannot open doors and dynamically created keys use the same contact path', () => {
  const hidden = key(), door = goal(); hidden.active = false;
  const runtime = { keys: [hidden], goals: [door], carriedKeys: [] };
  contactNativeGoalKeys(runtime);
  assert.equal(door.opened, false);
  runtime.keys.push(key());
  contactNativeGoalKeys(runtime);
  assert.equal(door.opened, true);
});

test('targeted command opens matching goals, remains latched and does not consume its sender', () => {
  const runtime = { goals: [goal(0, 'exit-a'), goal(100, 'exit-b')] };
  assert.equal(broadcastNativeGoalOpen(runtime, 'Gate'), false);
  assert.equal(broadcastNativeGoalOpen(runtime, 'exit-b'), true);
  assert.deepEqual(runtime.goals.map(goal => goal.opened), [false, true]);
  assert.equal(broadcastNativeGoalOpen(runtime, 'exit-b'), false);
  assert.equal(broadcastNativeGoalOpen(runtime, 'Goal'), true);
  assert.deepEqual(runtime.goals.map(goal => goal.opened), [true, true]);
});
