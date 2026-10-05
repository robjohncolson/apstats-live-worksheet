import assert from 'node:assert/strict';
import test from 'node:test';
import { moveNativeBodyChain, solveNativeBodyPairs } from './native-body-world.mjs';

const f = Math.fround;
const body = (id, x, previousX = x, flags = 1) => ({ id, category: 1, type: 3,
  flags: flags | (x !== previousX ? 0x40 : 0), shape: 0,
  position: { x, y: 0 }, previousPosition: { x: previousX, y: 0 },
  localBounds: { x: 0, y: 0, width: 10, height: 10 }, contacts: [] });

function world(bodies, moveMap) {
  const collisionMatrix = new Uint8Array(32 * 32);
  collisionMatrix[1 * 32 + 1] = 1;
  return { bodies, collisionMatrix, moveMap: moveMap ?? ((body, delta) => {
    body.position = { x: f(body.position.x + delta.x), y: f(body.position.y + delta.y) };
    return { ...delta };
  }) };
}

test('ordinary pair phase rewinds unequal trajectories and inserts reciprocal contacts', () => {
  const a = body(1, 6, 0), b = body(2, 12, 14);
  solveNativeBodyPairs(world([a, b]));
  assert.equal(a.position.x, f(2.99));
  assert.equal(b.position.x, 13);
  assert.deepEqual(a.contacts, [{ state: 0, bodyId: 2, normal: { x: 1, y: 0 } }]);
  assert.deepEqual(b.contacts, [{ state: 0, bodyId: 1, normal: { x: -1, y: 0 } }]);
});

test('priority mover stays on its trajectory while recursively pushing the chain', () => {
  const platform = body(1, 6, 0, 3), a = body(2, 15, 14), b = body(3, 25);
  const moves = [];
  const scene = world([platform, a, b], (body, delta) => {
    moves.push({ id: body.id, delta: { ...delta } });
    body.position = { x: f(body.position.x + delta.x), y: f(body.position.y + delta.y) };
    return { ...delta };
  });
  solveNativeBodyPairs(scene);
  assert.equal(platform.position.x, 6);
  assert.equal(a.position.x, f(16.02));
  assert.ok(Math.abs(b.position.x - 26.021) < .00001);
  assert.deepEqual(moves.map(move => move.id), [2, 3]);
  assert.equal(moves[1].delta.x, f(moves[0].delta.x + f(.001)));
  assert.equal(a.contacts.length, 1);
  assert.equal(b.contacts.length, 0, 'recursive map displacement does not insert a guessed pair contact');
});

test('blocked chain restores the whole priority pass and demotes the mover before ordinary retry', () => {
  const platform = body(1, 6, 0, 3), a = body(2, 15, 14), wall = body(3, 25, 25, 0x11);
  solveNativeBodyPairs(world([platform, a, wall]));
  assert.equal(platform.position.x, f(4.99));
  assert.equal(a.position.x, 15);
  assert.equal(wall.position.x, 25);
  assert.ok(platform.flags & 8);
  assert.equal(platform.contacts.length, 1);
});

test('map obstruction fails the recursive move and triggers the same priority rollback', () => {
  const platform = body(1, 6, 0, 3), a = body(2, 15, 14);
  solveNativeBodyPairs(world([platform, a], (body, delta) => {
    body.position.x = f(body.position.x + delta.x / 2);
    return { x: f(delta.x / 2), y: delta.y };
  }));
  assert.equal(platform.position.x, f(4.99));
  assert.equal(a.position.x, 15);
  assert.ok(platform.flags & 8);
});

test('chain scan obeys active, type, category matrix and previously-overlapping gates', () => {
  const cases = [
    other => { other.flags = 0; },
    other => { other.type = 1; },
    other => { other.category = 32; },
    other => { other.category = 2; },
    other => { other.previousPosition.x = 9; },
  ];
  for (const configure of cases) {
    const a = body(1, 0), b = body(2, 10);
    configure(b);
    assert.equal(moveNativeBodyChain(world([a, b]), a, { x: 1, y: 0 }), true);
    assert.equal(b.position.x, 10);
  }
});

test('non-map type keeps native unwritten output behavior instead of reporting movement success', () => {
  const a = { ...body(1, 0), type: 2 };
  assert.equal(moveNativeBodyChain(world([a]), a, { x: 2, y: 0 }), false);
  assert.equal(a.position.x, 2);
  assert.ok(a.flags & 0x40);
});

test('old overlap and two priority bodies do not enter the pair solver', () => {
  const a = body(1, 2, 1), b = body(2, 10);
  solveNativeBodyPairs(world([a, b]));
  assert.equal(a.position.x, 2);
  const c = body(3, 6, 0, 3), d = body(4, 15, 14, 3);
  solveNativeBodyPairs(world([c, d]));
  assert.equal(c.position.x, 6);
  assert.equal(d.position.x, 15);
});

test('unsupported geometry and absent map handling fail explicitly', () => {
  const a = { ...body(1, 6, 0), shape: 1 }, b = { ...body(2, 12, 14), shape: 1 };
  assert.throws(() => solveNativeBodyPairs(world([a, b])), /circle overlap/);
  assert.throws(() => moveNativeBodyChain({ bodies: [a] }, a, { x: 7, y: 0 }), /map movement handler/);
});

test('a later failed chain rolls back an earlier successful push before replaying it', () => {
  const first = body(1, 6, 0, 3), firstBox = body(2, 15, 14);
  const second = body(3, 6, 0, 3), secondBox = body(4, 15, 14), wall = body(5, 25, 25, 0x11);
  for (const item of [second, secondBox, wall]) item.position.y = item.previousPosition.y = 100;
  const movedIds = [];
  const scene = world([first, firstBox, second, secondBox, wall], (body, delta) => {
    movedIds.push(body.id);
    body.position = { x: f(body.position.x + delta.x), y: f(body.position.y + delta.y) };
    return { ...delta };
  });
  solveNativeBodyPairs(scene);
  assert.deepEqual(movedIds, [2, 4, 2]);
  assert.equal(first.position.x, 6);
  assert.equal(firstBox.position.x, f(16.02));
  assert.equal(second.position.x, f(4.99));
  assert.equal(secondBox.position.x, 15);
  assert.equal(first.contacts.length, 1, 'contact row survives rollback without duplication');
});

test('reciprocal UP suppression and fixed contact capacity do not change resolved positions', () => {
  const a = body(1, 0), b = body(2, 0);
  a.position.y = 18; a.previousPosition.y = 22; a.flags |= 0x40;
  b.position.y = b.previousPosition.y = 10;
  b.contacts = [{ state: 1, bodyId: 1, normal: { x: 0, y: -1 } }];
  solveNativeBodyPairs(world([a, b]));
  assert.equal(a.position.y, f(20.01));
  assert.equal(a.contacts.length, 0);
  assert.equal(b.contacts[0].state, 1);
  const c = { ...body(3, 6, 0), contactCapacity: 0, contactsGrow: false }, d = body(4, 12, 14);
  solveNativeBodyPairs(world([c, d]));
  assert.equal(c.position.x, f(2.99));
  assert.equal(c.contacts.length, 0);
  assert.equal(d.contacts.length, 1);
});
