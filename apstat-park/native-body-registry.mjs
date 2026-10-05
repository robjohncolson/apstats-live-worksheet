// Native bc1d110/bc1ffa0: ordered body list and a separate ID dictionary.
// The dictionary starts with fixed capacity 128; list insertion can still
// succeed when dictionary insertion fails. Do not replace lookup with a scan.
export function createNativeBodyRegistry() {
  const collisionMatrix = new Int32Array(32 * 32);
  collisionMatrix[0] = 1;
  return { bodies: [], bodiesById: new Map(), bodyIdCounter: 0,
    bodyCount: 0, bodyIdCapacity: 128, bodyIdCanGrow: false,
    collisionMatrix, map: null };
}

export function findNativeBody(world, id) {
  if (world.bodiesById) return world.bodiesById.get(id >>> 0);
  // Older standalone fixtures supply an already ordered list, not a registry.
  return world.bodies.find(body => body.id === id);
}

export function insertNativeBody(world, body) {
  if (!body || body.world) return false;
  if (body.id && findNativeBody(world, body.id)) return false;
  const priority = body.priority | 0;
  let index = world.bodies.length;
  while (index > 0 && (world.bodies[index - 1].priority | 0) < priority) index--;
  world.bodies.splice(index, 0, body);
  if (!body.id) {
    world.bodyIdCounter = (world.bodyIdCounter + 1) >>> 0;
    body.id = world.bodyIdCounter;
  }
  world.bodyCount++;
  const key = body.id >>> 0;
  if (!world.bodiesById.has(key)) {
    if (world.bodiesById.size < world.bodyIdCapacity || world.bodyIdCanGrow) {
      world.bodiesById.set(key, body);
    }
  }
  return true;
}

// bc13b50 assigns ownership even if bc1ffa0 rejected a duplicate explicit ID.
export function attachNativeBody(world, body) {
  if (body.world) return false;
  insertNativeBody(world, body);
  body.world = world;
  return true;
}

export function removeNativeBody(world, body) {
  if (!body || body.world !== world) return false;
  const index = world.bodies.indexOf(body);
  // Native would dereference invalid list links after a rejected attachment.
  // Expose that invalid state instead of removing an unrelated list element.
  if (index < 0) throw new Error('Native body owner has no registered list entry');
  world.bodies.splice(index, 1);
  if (world.bodyCount) world.bodyCount--;
  world.bodiesById.delete(body.id >>> 0);
  return true;
}

// bc14290: while attached, remove reciprocal actor contacts and notify only
// accepted neighbors. Own contacts never receive END here. Pending map normals
// at +138 are retained; active count +e8 and map pointer +140 are cleared.
export function clearNativeBodyContacts(body) {
  for (const contact of body.contacts ?? []) {
    const other = body.world && findNativeBody(body.world, contact.bodyId);
    if (!other) continue;
    const index = other.contacts?.findIndex(row => row.bodyId === body.id) ?? -1;
    if (index < 0) continue;
    const reciprocal = other.contacts[index];
    if (reciprocal.state) other.onContactEnd?.(body, reciprocal.normal, 1);
    other.contacts.splice(index, 1);
  }
  (body.contacts ??= []).length = 0;
  (body.mapContacts ??= []).length = 0;
  body.contactMap = null;
}

// bc13bb0 clears ownership BEFORE contact cleanup. Neighbors retain stale IDs
// until their next finalization, which drops missing IDs without an END event.
export function detachNativeBody(body) {
  if (!body.world) return false;
  removeNativeBody(body.world, body);
  body.world = null;
  clearNativeBodyContacts(body);
  return true;
}
