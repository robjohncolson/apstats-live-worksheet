import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeActorManager, queueNativeActor, markNativeActorForRemoval,
  runNativeActorPre, runNativeActorPost } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { createNativeActorRectangle, registerNativeActorBodies, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';

const actor = (name, events, flags = 0) => ({ flags,
  onAdded: () => events.push(`${name}:add`), onPre: () => events.push(`${name}:pre`),
  onAlternatePre: () => events.push(`${name}:alternate`), onPost: () => events.push(`${name}:post`),
  onRemoved: () => events.push(`${name}:remove`), onReleased: () => events.push(`${name}:release`) });

test('native manager promotes at PRE and visits ascending priority buckets with stable insertion order', () => {
  const manager = createNativeActorManager(3), events = [];
  const a = actor('a', events), b = actor('b', events), c = actor('c', events);
  queueNativeActor(manager, a, 2);
  queueNativeActor(manager, b, 0);
  queueNativeActor(manager, c, 2);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events, ['a:add', 'b:add', 'c:add']);
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events.slice(3), ['b:pre', 'a:pre', 'c:pre', 'b:post', 'a:post', 'c:post']);
  assert.equal(manager.flags & 4, 0);
});

test('actor spawned during PRE has immediate attachment but no PRE or POST until the next PRE promotion', () => {
  const manager = createNativeActorManager(2), events = [];
  const child = actor('child', events), parent = actor('parent', events);
  parent.onPre = () => {
    assert.ok(manager.flags & 4);
    events.push('parent:pre');
    queueNativeActor(manager, child, 1);
  };
  queueNativeActor(manager, parent, 0);
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events, ['parent:add', 'parent:pre', 'child:add', 'parent:post']);
  events.length = 0;
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events, ['parent:pre', 'child:pre', 'parent:post', 'child:post']);
});

test('pending removals detach on promotion before actor PRE, regardless of disabled actor flag', () => {
  const manager = createNativeActorManager(1), events = [];
  const a = actor('a', events, 1), b = actor('b', events);
  manager.onRemoving = () => events.push('manager:remove');
  queueNativeActor(manager, a, 0);
  queueNativeActor(manager, b, 0);
  markNativeActorForRemoval(a);
  runNativeActorPre(manager, 1);
  assert.deepEqual(events, ['a:add', 'b:add', 'a:remove', 'manager:remove', 'a:release', 'b:pre']);
  assert.equal(a.manager, null);
  assert.equal(manager.buckets[0], b);
});

test('removing bucket head during PRE ends that bucket walk after rereading head', () => {
  const manager = createNativeActorManager(2), events = [];
  const a = actor('a', events), b = actor('b', events), c = actor('c', events);
  a.onPre = () => { events.push('a:pre'); markNativeActorForRemoval(a); };
  queueNativeActor(manager, a, 0);
  queueNativeActor(manager, b, 0);
  queueNativeActor(manager, c, 1);
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events.slice(3), ['a:pre', 'a:remove', 'a:release', 'c:pre', 'b:post', 'c:post']);
});

test('manager pause prevents promotion; actor disabled bit skips both phases without unregistering', () => {
  const manager = createNativeActorManager(1), events = [];
  const a = actor('a', events, 1);
  queueNativeActor(manager, a, 0);
  manager.flags |= 1;
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.equal(manager.pending, a);
  manager.flags &= ~1;
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events, ['a:add']);
  assert.equal(manager.buckets[0], a);
  a.flags = 0;
  runNativeActorPre(manager, 1);
  assert.deepEqual(events, ['a:add', 'a:pre']);
});

test('history mode selects alternate PRE and bounds POST using the pre-increment cursor', () => {
  const manager = createNativeActorManager(1), events = [];
  const ordinary = actor('ordinary', events), recorded = actor('recorded', events, 4);
  recorded.historyDelay = 1;
  queueNativeActor(manager, ordinary, 0);
  queueNativeActor(manager, recorded, 0);
  manager.flags |= 8;
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  runNativeActorPre(manager, 1);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events.slice(2), ['ordinary:alternate', 'recorded:pre', 'recorded:post',
    'ordinary:alternate', 'recorded:alternate']);
  assert.equal(recorded.historyCursor, 2);
  assert.equal(ordinary.historyCursor, undefined);
  manager.flags &= ~8;
  runNativeActorPost(manager, 1);
  assert.equal(recorded.historyCursor, 0);
  assert.equal(recorded.historyDelay, 0);
});

test('automatic history delay seeds at two and resumes within cursor/capacity bounds', () => {
  const manager = createNativeActorManager(1), events = [];
  const a = actor('a', events, 4 | 0x10);
  a.historyCapacity = 3;
  a.historyCursor = 5;
  queueNativeActor(manager, a, 0);
  runNativeActorPre(manager, 1);
  assert.equal(a.historyDelay, 2);
  assert.equal(events.at(-1), 'a:alternate');
  runNativeActorPost(manager, 1);
  assert.equal(a.historyDelay, 3);
  assert.equal(a.historyCursor, 0);
  assert.equal(events.at(-1), 'a:post');
});

test('alternate PRE does not process a removal flag; normal POST does', () => {
  const manager = createNativeActorManager(1), events = [];
  const a = actor('a', events, 4);
  queueNativeActor(manager, a, 0);
  runNativeActorPre(manager, 1);
  markNativeActorForRemoval(a);
  runNativeActorPre(manager, 1);
  assert.equal(a.manager, manager);
  runNativeActorPost(manager, 1);
  assert.equal(a.manager, null);
  assert.deepEqual(events.slice(-3), ['a:post', 'a:remove', 'a:release']);
});

test('newly spawned actor body participates in the current physics pass before actor PRE begins', () => {
  const manager = createNativeActorManager(2), world = createNativeBodyRegistry(), events = [];
  const child = { ...actor('child', events), bodies: [], position: { x: 0, y: 0 }, components: [] };
  const childBody = createNativeActorRectangle(child, { x: 0, y: 0, width: 10, height: 10 }, 0, false);
  childBody.onOverlap = () => events.push('child:overlap');
  child.onAdded = () => { events.push('child:add'); registerNativeActorBodies(child, world); };
  child.onRemoved = () => unregisterNativeActorBodies(child);
  const obstacle = { bodies: [], position: { x: 0, y: 0 }, components: [] };
  createNativeActorRectangle(obstacle, { x: 5, y: 0, width: 10, height: 10 }, 0, false);
  registerNativeActorBodies(obstacle, world);
  const parent = actor('parent', events);
  parent.onPre = () => queueNativeActor(manager, child, 1);
  queueNativeActor(manager, parent, 0);
  runNativeActorPre(manager, 1);
  stepNativeBodyWorld(world);
  runNativeActorPost(manager, 1);
  assert.deepEqual(events, ['parent:add', 'child:add', 'child:overlap', 'parent:post']);
  runNativeActorPre(manager, 1);
  assert.equal(events.at(-1), 'child:pre');
});
