import { nativeBodiesOverlap } from './native-body-overlap.mjs';
import { recordContact } from './native-body-world.mjs';
const f = Math.fround;
const NORMALS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

// bc1d580. The query body's enabled bit is intentionally ignored; candidates
// must be enabled. Matrix indexing is candidate category first, query second.
export function queryNativeBodyNeighbors(world, body, direction) {
  const result = [];
  if (!(body.type & 2)) return result;
  const normal = NORMALS[direction];
  if (!normal) throw new Error(`Invalid native neighbor direction: ${direction}`);
  const offsetB = { x: f(normal.x * .5), y: f(normal.y * .5) };
  const query = worldBounds(body);
  for (const other of world.bodies) {
    if (other.id === body.id || !(other.flags & 1) || !(other.type & 2)) continue;
    if (other.category < 0 || other.category >= 32 || body.category < 0 || body.category >= 32) continue;
    if (!world.collisionMatrix[other.category * 32 + body.category]) continue;
    if (nativeBodiesOverlap(other, body, { ignoreEnabled: true })) continue;
    if (!nativeBodiesOverlap(other, body, { ignoreEnabled: true, offsetB })) continue;
    const candidate = worldBounds(other);
    const centerX = f(f(candidate.width * .5) + candidate.x);
    const centerY = f(f(candidate.height * .5) + candidate.y);
    let accepted = false;
    if (direction === 0) accepted = centerY < query.y;
    if (direction === 1) accepted = f(query.y + query.height) < centerY;
    // Preserve the binary's horizontal comparisons. They are not the mirror
    // of its vertical cases; raw bc1d761..bc1d76a confirms direction 2.
    if (direction === 2) accepted = f(query.x + query.width) < centerX;
    if (direction === 3) accepted = centerX < query.x;
    if (accepted && result.length < 16) result.push(other);
  }
  return result;
}

// bc13c60 narrows X scale only, queries UP, inserts contacts, restores scale.
// A temporary descriptor gives the same query without exposing transient
// scale to caller code. Native raw geometry is required to preserve rounding.
export function refreshNativePlayerUpContacts(world, body) {
  if (!body.rawBounds) throw new Error('Native Player upward contact probe requires raw body bounds');
  const scale = { x: f((body.scale?.x ?? 1) * .5), y: body.scale?.y ?? 1 };
  const probe = { ...body, scale, localBounds: scaledNativeBounds(body.rawBounds, scale, body.pivot) };
  for (const other of queryNativeBodyNeighbors(world, probe, 0)) {
    recordContact(body, other, NORMALS[0]);
  }
}

// bb4e260: scale the local descriptor about its own pivot.
export function scaledNativeBounds(raw, scale, pivot = { x: 0, y: 0 }) {
  return { x: f(pivot.x + f(f(raw.x - pivot.x) * scale.x)),
    y: f(pivot.y + f(f(raw.y - pivot.y) * scale.y)),
    width: f(scale.x * raw.width), height: f(scale.y * raw.height) };
}

function worldBounds(body) {
  return { ...body.localBounds, x: f(body.localBounds.x + body.position.x), y: f(body.localBounds.y + body.position.y) };
}
