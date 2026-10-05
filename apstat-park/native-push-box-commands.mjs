import { nativeBodyPlacementBlocked } from './native-body-placement.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

function notifyVelocity(actor) {
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
}

// bb350a0: placement does not change the saved spawn position or contacts.
function moveTo(actor, position) {
  actor.position = { x: f(position.x), y: f(position.y) };
  actor.stepStartPosition = { ...actor.position };
  for (const { body, followsActor } of actor.bodies) {
    if (!followsActor) continue;
    body.position = { ...actor.position };
    body.previousPosition = { ...actor.position };
    body.flags &= ~64;
  }
}

function probe(body, position) {
  const changed = Math.abs(f(body.previousPosition.x - position.x)) > EPSILON ||
    Math.abs(f(body.previousPosition.y - position.y)) > EPSILON;
  body.flags = changed ? body.flags | 64 : body.flags & ~64;
  body.position = { ...position };
}

// bb35210: (0,0) is the pending-position sentinel. Failed placement restores
// only the primary body's probe; success keeps actor/map contacts intact.
export function tryNativePushBoxRelocation(actor) {
  const target = actor.pendingPosition;
  const squared = f(f(target.x * target.x) + f(target.y * target.y));
  if (!(Math.abs(squared) > EPSILON)) return false;
  const body = actor.bodies[0]?.body;
  if (!body?.world) throw new Error('Native PushBox relocation requires a registered primary body');
  const original = { ...body.position };
  probe(body, target);
  if (nativeBodyPlacementBlocked(body.world, body)) {
    probe(body, original);
    return false;
  }
  moveTo(actor, target);
  actor.velocity = { x: 0, y: 0 };
  notifyVelocity(actor);
  actor.pendingPosition = { x: 0, y: 0 };
  return true;
}

// bb33d00, local command dispatcher. Native pointer payloads are represented
// as a vector for 0/2/7, and a scalar for e/1e.
export function receiveNativePushBoxCommand(actor, command, value) {
  if (command === 8) {
    moveTo(actor, actor.spawnPosition);
    return 0;
  }
  if (command === 7) {
    if (value != null) actor.pendingPosition = { x: f(value.x), y: f(value.y) };
    return 0;
  }
  if (command === 0xe) {
    actor.patchFlags = value ? actor.patchFlags | 8 : actor.patchFlags & ~8;
    actor.counterVisible = value | 0;
    return 0;
  }
  if (command === 0 || command === 2) {
    if (value != null) {
      const magnitude = Math.abs(f(value.x));
      actor.externalVelocity = { x: actor.velocity.x < 0 ? f(-magnitude) : magnitude, y: f(value.y) };
      actor.boxFlags |= 1;
    }
    return 0;
  }
  if (command === 0x1e && value != null) {
    actor.boxFlags = value ? actor.boxFlags | 2 : actor.boxFlags & ~2;
    actor.velocity = { x: 0, y: 0 };
    notifyVelocity(actor);
    return 1;
  }
  if (command === 0x2c) {
    actor.patchFlags &= ~8;
    actor.counterVisible = 0;
  }
  return 0;
}
