const f = Math.fround;

// Actor-contact lifecycle from bc13c60, after positional finalization.
// Map-contact lifecycle (bc14040) is separate. The Player half-width upward
// probe requires the original body-scale/pivot data and an explicit handler.
export function finalizeNativeActorContacts(world, body) {
  if (body.flags & 4) {
    if (typeof world.refreshUpContacts !== 'function') {
      throw new Error('Native Player upward contact probe is required');
    }
    world.refreshUpContacts(body);
  }
  const contacts = body.contacts ??= [];
  for (let index = 0; index < contacts.length;) {
    const contact = contacts[index];
    const other = world.bodies.find(candidate => candidate.id === contact.bodyId);
    if (!other) {
      // Missing registry entry is discarded without a synthetic END callback.
      contacts.splice(index, 1);
      continue;
    }
    const offset = { x: f(contact.normal.x * .5), y: f(contact.normal.y * .5) };
    if (!overlaps(body, other, offset)) {
      if (contact.state === 1) body.onContactEnd?.(other, contact.normal, 1);
      contacts.splice(index, 1);
      continue;
    }
    if (contact.state === 0) {
      contact.state = 1;
      body.onContactBegin?.(other, contact.normal, 1);
    }
    // BEGIN can disable a body. Native still dispatches this accepted STAY.
    body.onContactStay?.(other, contact.normal, 1);
    index++;
  }
}

// Final continuous-overlap scan of bc1da80. No type/moved-bit requirement:
// sensors participate even when they are not physical pair-solver bodies.
export function dispatchNativeOverlapCallbacks(world) {
  for (let i = 0; i < world.bodies.length - 1; i++) {
    const a = world.bodies[i];
    if (!(a.flags & 1)) continue;
    for (let j = i + 1; j < world.bodies.length; j++) {
      const b = world.bodies[j];
      if (!(b.flags & 1) || (!a.onOverlap && !b.onOverlap)) continue;
      if (a.category < 0 || a.category >= 32 || b.category < 0 || b.category >= 32) continue;
      if (!world.collisionMatrix[a.category * 32 + b.category]) continue;
      if (!overlaps(a, b)) continue;
      a.onOverlap?.(b);
      // B is checked after A's callback. Its enabled bit is NOT checked again.
      b.onOverlap?.(a);
    }
  }
}

function overlaps(a, b, offset = { x: 0, y: 0 }) {
  if (!(a.flags & 1) || !(b.flags & 1)) return false;
  if (a.shape === 1 && b.shape === 1) throw new Error('Native circle overlap is not implemented');
  const ax = f(f(a.localBounds.x + a.position.x) + offset.x);
  const ay = f(f(a.localBounds.y + a.position.y) + offset.y);
  const bx = f(b.localBounds.x + b.position.x), by = f(b.localBounds.y + b.position.y);
  return f(ax + a.localBounds.width) > bx && f(bx + b.localBounds.width) > ax
    && f(ay + a.localBounds.height) > by && f(by + b.localBounds.height) > ay;
}
