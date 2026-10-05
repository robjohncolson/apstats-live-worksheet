const f = Math.fround;
const EPSILON = 2 ** -23;

// Body entries are actor+98 records { body, followsActor }. bc17ca0 runs
// after common PRE integration and again after the actor-specific POST hook.
export function syncNativeActorBodies(actor) {
  for (const { body, followsActor } of actor.bodies) {
    if (!followsActor) continue;
    const x = f(actor.position.x), y = f(actor.position.y);
    const moved = Math.abs(f(body.previousPosition.x - x)) > EPSILON
      || Math.abs(f(body.previousPosition.y - y)) > EPSILON;
    body.flags = moved ? body.flags | 0x40 : body.flags & ~0x40;
    body.position = { x, y };
  }
}

// Movement portion of bc16120, called AFTER the actor-specific PRE hook.
// Native units are per frame: position += velocity + acceleration/2, then
// velocity += acceleration. Keep every intermediate operation float32.
export function advanceNativeActorMotion(actor) {
  const dx = f(actor.velocity.x + f(actor.acceleration.x * .5));
  const dy = f(actor.velocity.y + f(actor.acceleration.y * .5));
  actor.position = { x: f(dx + actor.position.x), y: f(dy + actor.position.y) };
  actor.velocity = { x: f(actor.velocity.x + actor.acceleration.x), y: f(actor.velocity.y + actor.acceleration.y) };
  syncNativeActorBodies(actor);
}

// bc1a2c0 placement before actor-manager insertion: following bodies start at
// the actor position with no sweep. Independent sensors retain their position.
export function placeNativeActorBodies(actor, position) {
  actor.spawnPosition = { x: f(position.x), y: f(position.y) };
  actor.position = { ...actor.spawnPosition };
  for (const { body, followsActor } of actor.bodies) {
    if (!followsActor) continue;
    body.position = { ...actor.position };
    body.previousPosition = { ...actor.position };
    body.flags &= ~0x40;
  }
}
