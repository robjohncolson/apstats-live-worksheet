// bc2fca0 tile sweep, bc304f0 contact probe, bc12490 sliding movement.
// map.table contains native numeric chip IDs. IDs >=26 use map.customFlags;
// those flags are stage-specific and must not be inferred from artwork names.
const f = Math.fround;
const EPSILON = 2 ** -23;
const GAP = f(.01);
const MAX_FLOAT = 3.4028234663852886e38;
const NORMALS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
// Exact ID order in recovered lua_archive_sources/stage/stage_common.lua.
const CHIP_NAMES = ['MC_INV', 'MC_NON', 'MC_BLK', 'MC_FLC', 'MC_FLL', 'MC_FLR',
  'MC_CEC', 'MC_CEL', 'MC_CER', 'MC_WAL', 'MC_WAR', 'MC_INC', 'MC_ILU', 'MC_IRU',
  'MC_ILD', 'MC_IRD', 'MC_IUP', 'MC_IDW', 'MC_ILE', 'MC_IRG', 'MC_BHU', 'MC_BHC',
  'MC_BHD', 'MC_BWL', 'MC_BWC', 'MC_BWR', 'MC_DLU', 'MC_DLD', 'MC_DRU', 'MC_DRD',
  'MC_BR1', 'MC_BR2', 'MC_BR3', 'MC_BR4', 'MC_BR5'];

export function nativeMapFromRecovered(map, customFlags = null) {
  const table = map.table.map(chip => {
    const id = typeof chip === 'number' ? chip : CHIP_NAMES.indexOf(chip);
    if (!Number.isInteger(id) || id < 0) throw new Error(`Unknown native chip: ${chip}`);
    if (id >= 26 && customFlags === null) throw new Error('Native custom chip flags are required for this stage');
    return id;
  });
  return { width: map.width, height: map.height, chipSize: map.chipSize, table, customFlags: customFlags ?? [] };
}

// bc14040: retained map contacts precede newly discovered contact callbacks.
export function finalizeNativeMapContacts(body) {
  const map = body.contactMap;
  const active = body.mapContacts ??= [];
  const pending = body.pendingMapContacts ??= [];
  let cell = null;
  for (let i = 0; i < active.length;) {
    const normal = active[i];
    const enabled = (body.flags & 1) !== 0;
    if (enabled && map) cell = nativeMapContact(map, body, normal);
    if (!enabled || (map && !cell)) {
      body.onContactEnd?.(null, normal, 0, { map, cell });
      active.splice(i, 1);
      continue;
    }
    body.onContactStay?.(null, normal, 0, { map, cell });
    i++;
  }
  for (const normal of pending) {
    if (!map) continue;
    cell = nativeMapContact(map, body, normal);
    if (!cell) continue;
    body.onContactBegin?.(null, normal, 0, { map, cell });
    body.onContactStay?.(null, normal, 0, { map, cell });
    if (active.length < 8) active.push({ ...normal });
  }
  pending.length = 0;
}

export function nativeMapCellSolid(map, column, row) {
  // bc28270/bc28390/bc284a0 extend the edge cell beyond the map boundary.
  column = Math.max(0, Math.min(map.width - 1, column));
  row = Math.max(0, Math.min(map.height - 1, row));
  const id = map.table[row * map.width + column];
  if (id >= 0 && id < 26) return id >= 2;
  return id >= 26 && Boolean((map.customFlags?.[id - 26] ?? 0) & 1);
}

export function nativeMapContact(map, body, normal) {
  const length = f(Math.sqrt(f(f(normal.x * normal.x) + f(normal.y * normal.y))));
  const dx = length ? f(f(normal.x / length) * .5) : 0;
  const dy = length ? f(f(normal.y / length) * .5) : 0;
  const bounds = body.localBounds;
  let left = f(bounds.x + f(body.position.x + dx));
  let top = f(bounds.y + f(body.position.y + dy));
  let right = f(bounds.width + left), bottom = f(bounds.height + top);
  if (dy < 0) bottom = top;
  else if (dy > 0) top = bottom;
  if (dx < 0) right = left;
  else if (dx > 0) left = right;
  const firstColumn = Math.trunc(f(left / map.chipSize));
  const lastColumn = Math.trunc(f(right / map.chipSize));
  const firstRow = Math.trunc(f(top / map.chipSize));
  const lastRow = Math.trunc(f(bottom / map.chipSize));
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      if (nativeMapCellSolid(map, column, row)) return { column, row };
    }
  }
  return null;
}

export function moveNativeBodyOnMap(map, body, displacement, slide = true) {
  const actual = { x: 0, y: 0 };
  if (!(body.flags & 1)) return actual;
  if (!(body.type & 1)) {
    translate(body, displacement);
    return actual; // Native direct-move branch leaves the output vector zero.
  }
  let remaining = { ...displacement };
  for (;;) {
    const result = sweepNativeMap(map, body, remaining);
    actual.x = f(actual.x + result.movement.x);
    actual.y = f(actual.y + result.movement.y);
    const normal = result.normal;
    if (f(f(normal.x * normal.x) + f(normal.y * normal.y)) <= EPSILON) break;
    const active = body.mapContacts ??= [];
    const pending = body.pendingMapContacts ??= [];
    if (![...active, ...pending].some(contact => same(contact, normal))) {
      if (pending.length < 8) pending.push({ ...normal });
      body.contactMap = map;
    }
    if (!slide) break;
    remaining = { x: f(remaining.x - result.movement.x), y: f(remaining.y - result.movement.y) };
    const projection = f(f(normal.x * remaining.x) + f(normal.y * remaining.y));
    remaining.x = f(remaining.x - f(normal.x * projection));
    remaining.y = f(remaining.y - f(normal.y * projection));
  }
  return actual;
}

export function sweepNativeMap(map, body, displacement) {
  const none = { normal: { x: 0, y: 0 }, movement: { x: 0, y: 0 } };
  const length = f(Math.sqrt(f(f(displacement.x * displacement.x) + f(displacement.y * displacement.y))));
  if (length < EPSILON) return none;
  let dx = displacement.x, dy = displacement.y;
  let sx = direction(dx), sy = direction(dy), blocked = -1;
  if (sx && nativeMapContact(map, body, NORMALS[sx > 0 ? 3 : 2])) {
    blocked = sx > 0 ? 3 : 2; sx = 0; dx = 0;
  }
  if (sy && nativeMapContact(map, body, NORMALS[sy > 0 ? 1 : 0])) {
    blocked = sy > 0 ? 1 : 0; sy = 0; dy = 0;
  }
  const bounds = body.localBounds, size = map.chipSize;
  const left = f(bounds.x + body.position.x), top = f(bounds.y + body.position.y);
  const cell = value => Math.trunc(f(value / size));
  const firstColumn = cell(left), firstRow = cell(top);
  const lastColumn = cell(f(bounds.width + left)), lastRow = cell(f(bounds.height + top));
  const columns = lastColumn - firstColumn + 1, rows = lastRow - firstRow + 1;
  const targetColumn = cell(f(left + dx)), targetRow = cell(f(top + dy));
  const stepsX = sx > 0 ? cell(f(f(left + dx) + bounds.width)) - lastColumn : targetColumn - firstColumn;
  const stepsY = sy > 0 ? cell(f(f(top + dy) + bounds.height)) - lastRow : targetRow - firstRow;
  let edgeColumn = sx > 0 ? lastColumn : firstColumn;
  let edgeRow = sy > 0 ? lastRow : firstRow;
  let crossedX = 0, crossedY = 0;
  // These native boundary accumulators are uint32, including off-map values.
  let boundaryX = ((edgeColumn + sx) * size) >>> 0;
  let boundaryY = ((edgeRow + sy) * size) >>> 0;
  const slopeY = f(dy / dx), slopeX = f(dx / dy);
  for (;;) {
    const doneX = crossedX === stepsX, doneY = crossedY === stepsY;
    if (doneX && doneY) {
      const movement = { x: dx, y: dy };
      translate(body, movement);
      return { movement, normal: blocked < 0 ? none.normal : { ...NORMALS[blocked] } };
    }
    const atX = sx < 1 ? f(f(boundaryX) + f(size - bounds.x)) : f(f(boundaryX) - f(bounds.width + bounds.x));
    const atY = sy < 1 ? f(f(boundaryY) + f(size - bounds.y)) : f(f(boundaryY) - f(bounds.height + bounds.y));
    const timeX = doneX ? MAX_FLOAT : f(f(atX - body.position.x) / dx);
    const timeY = doneY ? MAX_FLOAT : f(f(atY - body.position.y) / dy);
    // Equal boundary times choose Y first in the binary.
    if (timeX < timeY) {
      edgeColumn += sx;
      if (columnBlocked(map, edgeColumn, firstRow + crossedY, rows)) {
        const x = f(atX - body.position.x);
        const movement = { x: f(x + (sx > 0 ? -GAP : GAP)), y: f(x * slopeY) };
        translate(body, movement);
        return { movement, normal: { ...NORMALS[sx > 0 ? 3 : 2] } };
      }
      boundaryX = (boundaryX + sx * size) >>> 0;
      crossedX += sx;
    } else {
      edgeRow += sy;
      if (rowBlocked(map, firstColumn + crossedX, edgeRow, columns)) {
        const y = f(atY - body.position.y);
        const movement = { x: f(y * slopeX), y: f(y + (sy > 0 ? -GAP : GAP)) };
        translate(body, movement);
        return { movement, normal: { ...NORMALS[sy > 0 ? 1 : 0] } };
      }
      boundaryY = (boundaryY + sy * size) >>> 0;
      crossedY += sy;
    }
  }
}

function direction(value) {
  return value > EPSILON ? 1 : value < -EPSILON ? -1 : 0;
}

function columnBlocked(map, column, firstRow, count) {
  for (let row = firstRow; row < firstRow + count; row++) if (nativeMapCellSolid(map, column, row)) return true;
  return false;
}

function rowBlocked(map, firstColumn, row, count) {
  for (let column = firstColumn; column < firstColumn + count; column++) if (nativeMapCellSolid(map, column, row)) return true;
  return false;
}

function translate(body, movement) {
  body.position = { x: f(body.position.x + movement.x), y: f(body.position.y + movement.y) };
  body.flags = same(body.position, body.previousPosition) ? body.flags & ~0x40 : body.flags | 0x40;
}

function same(a, b) {
  return Math.abs(f(a.x - b.x)) <= EPSILON && Math.abs(f(a.y - b.y)) <= EPSILON;
}
