import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeMapCellSolid, nativeMapContact, moveNativeBodyOnMap, sweepNativeMap,
  nativeMapFromRecovered, finalizeNativeMapContacts } from './native-map-collision.mjs';
import { solveNativeBodyPairs } from './native-body-world.mjs';

const f = Math.fround;
const map = () => ({ width: 12, height: 12, chipSize: 10, table: Array(144).fill(1), customFlags: [] });
const body = (x, y) => ({ flags: 1, type: 3, position: { x, y }, previousPosition: { x, y },
  localBounds: { x: 0, y: 0, width: 4, height: 4 } });

test('native chip occupancy uses numeric flags and extends boundary cells', () => {
  const grid = map();
  for (let id = 0; id < 26; id++) {
    grid.table[0] = id;
    assert.equal(nativeMapCellSolid(grid, -20, -20), id >= 2);
  }
  grid.table[0] = 26; grid.customFlags = [2];
  assert.equal(nativeMapCellSolid(grid, 0, 0), false);
  grid.customFlags[0] = 3;
  assert.equal(nativeMapCellSolid(grid, 0, 0), true);
  grid.table[0] = 27;
  assert.equal(nativeMapCellSolid(grid, 0, 0), false, 'unknown custom IDs are passable');
  grid.table[143] = 2;
  assert.equal(nativeMapCellSolid(grid, 100, 100), true);
});

test('single-tile collision stops .01 short on all four faces', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  for (const [start, delta, expected, normal] of [
    [[34, 41], [4, 0], [f(35.99), 41], [1, 0]],
    [[52, 41], [-4, 0], [f(50.01), 41], [-1, 0]],
    [[41, 34], [0, 4], [41, f(35.99)], [0, 1]],
    [[41, 52], [0, -4], [41, f(50.01)], [0, -1]],
  ]) {
    const item = body(...start);
    const result = sweepNativeMap(grid, item, { x: delta[0], y: delta[1] });
    assert.deepEqual(item.position, { x: expected[0], y: expected[1] });
    assert.deepEqual(result.normal, { x: normal[0], y: normal[1] });
  }
});

test('contact probe normalizes to .5 pixels and freezes only the blocked component', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(f(35.99), 41);
  assert.deepEqual(nativeMapContact(grid, item, { x: 12, y: 0 }), { column: 4, row: 4 });
  const movement = moveNativeBodyOnMap(grid, item, { x: 5, y: 2 });
  assert.deepEqual(movement, { x: 0, y: 2 });
  assert.deepEqual(item.pendingMapContacts, [{ x: 1, y: 0 }]);
  assert.equal(item.contactMap, grid);
});

test('diagonal sweep preserves trajectory until first impact, then slides along the wall', () => {
  const grid = map();
  for (let row = 0; row < 12; row++) grid.table[row * 12 + 4] = 2;
  const item = body(20, 20);
  const first = sweepNativeMap(grid, item, { x: 30, y: 10 });
  // Native rounds (16 - .01) before adding it to the actor's 20.
  const impactX = 35.98999786376953;
  assert.equal(item.position.x, impactX);
  assert.equal(first.movement.y, f(16 * f(10 / 30)));
  const slider = body(20, 20);
  const total = moveNativeBodyOnMap(grid, slider, { x: 30, y: 10 });
  assert.deepEqual(slider.position, { x: impactX, y: 30 });
  assert.equal(total.y, 10);
  assert.deepEqual(slider.pendingMapContacts, [{ x: 1, y: 0 }]);
});

test('corner tie visits Y first and catches a diagonal-only blocking cell on the next X crossing', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(34, 34);
  const result = sweepNativeMap(grid, item, { x: 4, y: 4 });
  // Y enters row 4 while the footprint still occupies column 3. X then
  // enters column 4 at the same time and sees the diagonal blocking tile.
  assert.deepEqual(item.position, { x: f(35.99), y: 36 });
  assert.deepEqual(result.normal, { x: 1, y: 0 });
});

test('long movement checks intermediate cells and cannot skip a one-tile obstacle', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(2, 41);
  moveNativeBodyOnMap(grid, item, { x: 100, y: 0 });
  assert.equal(item.position.x, f(35.99));
});

test('disabled and non-map bodies retain the distinct native output contract', () => {
  const grid = map(), disabled = body(10, 10), direct = body(10, 10);
  disabled.flags = 0; direct.type = 2;
  assert.deepEqual(moveNativeBodyOnMap(grid, disabled, { x: 5, y: 0 }), { x: 0, y: 0 });
  assert.equal(disabled.position.x, 10);
  assert.deepEqual(moveNativeBodyOnMap(grid, direct, { x: 5, y: 0 }), { x: 0, y: 0 });
  assert.equal(direct.position.x, 15);
});

test('map contact insertion deduplicates against old and pending normals', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(34, 41);
  item.mapContacts = [{ x: 1, y: 0 }];
  moveNativeBodyOnMap(grid, item, { x: 4, y: 0 });
  assert.deepEqual(item.pendingMapContacts, []);
  assert.equal(item.contactMap, undefined);
  item.mapContacts = [];
  moveNativeBodyOnMap(grid, item, { x: 4, y: 0 });
  moveNativeBodyOnMap(grid, item, { x: 4, y: 0 });
  assert.deepEqual(item.pendingMapContacts, [{ x: 1, y: 0 }]);
});

test('registered push recursion uses the native map sweep to detect a blocked chain', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const platform = { ...body(32, 41), id: 1, category: 1, flags: 0x43, previousPosition: { x: 28, y: 41 } };
  const box = { ...body(35, 41), id: 2, category: 1, flags: 0x41, previousPosition: { x: 34, y: 41 } };
  const collisionMatrix = new Uint8Array(1024); collisionMatrix[33] = 1;
  solveNativeBodyPairs({ bodies: [platform, box], collisionMatrix,
    moveMap: (item, delta) => moveNativeBodyOnMap(grid, item, delta) });
  assert.ok(platform.flags & 8, 'map obstruction demotes the priority mover');
  assert.equal(platform.position.x, f(30.99));
  assert.equal(box.position.x, 35, 'failed chain position is rolled back');
});

test('recovered chip conversion requires explicit custom occupancy and rejects unknown names', () => {
  const raw = { width: 2, height: 1, chipSize: 32, table: ['MC_NON', 'MC_BWR'] };
  assert.deepEqual(nativeMapFromRecovered(raw).table, [1, 25]);
  raw.table[1] = 'MC_BR5';
  assert.throws(() => nativeMapFromRecovered(raw), /custom chip flags/);
  assert.deepEqual(nativeMapFromRecovered(raw, Array(9).fill(1)).table, [1, 34]);
  raw.table[1] = 'invented-chip';
  assert.throws(() => nativeMapFromRecovered(raw), /Unknown native chip/);
});

test('map contacts dispatch BEGIN/STAY once, retain STAY, and END when a chip is removed', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(34, 41), events = [];
  for (const [callback, name] of [['onContactBegin', 'begin'], ['onContactStay', 'stay'], ['onContactEnd', 'end']]) {
    item[callback] = (other, normal, kind, payload) => {
      assert.equal(other, null); assert.equal(kind, 0); assert.equal(payload.map, grid);
      events.push(name);
    };
  }
  moveNativeBodyOnMap(grid, item, { x: 4, y: 0 });
  finalizeNativeMapContacts(item);
  assert.deepEqual(item.mapContacts, [{ x: 1, y: 0 }]);
  assert.deepEqual(item.pendingMapContacts, []);
  finalizeNativeMapContacts(item);
  grid.table[4 * 12 + 4] = 1;
  finalizeNativeMapContacts(item);
  assert.deepEqual(events, ['begin', 'stay', 'stay', 'end']);
  assert.deepEqual(item.mapContacts, []);
});

test('map refresh removes disabled retained contacts but still processes the native pending list', () => {
  const grid = map(); grid.table[4 * 12 + 4] = 2;
  const item = body(f(35.99), 41), events = [];
  item.flags = 0; item.contactMap = grid;
  item.mapContacts = [{ x: 1, y: 0 }]; item.pendingMapContacts = [{ x: 1, y: 0 }];
  item.onContactBegin = () => events.push('begin');
  item.onContactStay = () => events.push('stay');
  item.onContactEnd = () => events.push('end');
  finalizeNativeMapContacts(item);
  assert.deepEqual(events, ['end', 'begin', 'stay']);
  assert.deepEqual(item.mapContacts, [{ x: 1, y: 0 }]);
});
