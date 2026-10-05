import { createNativeActorRectangle, unregisterNativeActorBodies, nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { countNativeContactBodies } from './native-body-contact-count.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { canMoveNativeActor, carryNativeBalanceRiders } from './native-actor-carry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const numeric = value => typeof value === 'number' ? f(value) : 0;
const integer = value => Math.trunc(numeric(value)) | 0;

// bb63cf0, bb64050, bb64100 and factory bb740fb..74390.
// Darkness/InvisibleWeightedLift are a different native class, not variants
// of this constructor. The Ex2 variant uses the narrower platform art/body.
export function createNativeWeightedLiftActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6), extended = spawn.actorName !== 'WeightedLift';
  const narrow = spawn.actorName === 'WeightedLiftEx2';
  let maximumOffset = -70, loadSpeed = 1, returnSpeed = 1, returnsWhenEmpty = true;
  let requiredLoad = Math.max(2, Math.ceil(f(f(partySize) * f(.2))));
  if (integer(params[0])) {
    maximumOffset = numeric(params[0]);
    if (extended) maximumOffset = f(maximumOffset + f(integer(params[partySize + 1])));
    else if (integer(params[2])) maximumOffset = f(maximumOffset + f(numeric(params[2]) * f(partySize)));
  }
  if (integer(params[1]) > 0) {
    const minimum = extended ? 2 : (integer(params[3]) >>> 0) || 2;
    requiredLoad = Math.max(minimum, Math.ceil(f(f(f(integer(params[1]) >>> 0) / 100) * f(partySize))));
  }
  if (extended) loadSpeed = returnSpeed = numeric(params[2]);
  else {
    returnsWhenEmpty = integer(params[4]) <= 0;
    if (Math.abs(numeric(params[5])) > EPSILON) returnSpeed = f(1 + f(numeric(params[5]) * f(Math.max(0, partySize - 2))));
  }
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    offset: { x: 0, y: 0 }, maximumOffset, loadSpeed, returnSpeed, returnsWhenEmpty,
    requiredLoad, supportCount: 0, groundCooldown: 0, narrow, spriteFlags: 8, spriteDepth: f(-.1),
    spriteBounds: narrow ? { x: -34, y: 0, width: 68, height: 84 } : { x: -93, y: 0, width: 196, height: 84 },
    spriteUV: narrow ? { x: .3740234375, y: .5458984375, width: .033203125, height: .041015625 } :
      { x: .3427734375, y: .4990234375, width: .095703125, height: .041015625 },
    indicatorBounds: { x: -44, y: -2, width: 26, height: 50 },
    indicatorUV: { x: .3427734375, y: maximumOffset < 0 ? .1240234375 : .1484375,
      width: .0126953125, height: maximumOffset < 0 ? .0244140625 : -.0244140625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion: dt => stepLift(actor, dt),
    onPositionResolved(position) {
      actor.offset = { x: f(position.x - actor.spawnPosition.x), y: f(position.y - actor.spawnPosition.y) };
    },
    counterPresentation() {
      const display = nativeActorDisplayPosition(actor);
      return { text: String(Math.max(0, (actor.requiredLoad - actor.supportCount) | 0)), fontSize: 32,
        alignX: 2, x: Math.trunc(f(display.x + (narrow ? 0 : 5))), y: Math.trunc(f(display.y + 7)), depth: f(-.2) };
    },
  };
  actor.body = createNativeActorRectangle(actor,
    { x: narrow ? -28 : -92, y: 67, width: narrow ? 56 : 194, height: 18 }, 2, true);
  actor.body.category = 5; actor.body.flags |= 2;
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}

// bb64310: connected UP categories1/2 load the lift. DOWN contact continually
// refreshes a .06-second pause. Motion and carry remain per-frame, not dt-scaled.
function stepLift(actor, dt) {
  if (actor.groundCooldown > 0) actor.groundCooldown = f(actor.groundCooldown - f(dt));
  if (hasNativeDirectionalContact(actor.body, { x: 0, y: 1 })) actor.groundCooldown = f(.06);
  actor.supportCount = countNativeContactBodies(actor.body, { x: 0, y: -1 }, 6, true);
  if (actor.groundCooldown > 0) return;
  let next = actor.offset.y;
  if (actor.supportCount >= actor.requiredLoad) next = Math.min(Math.abs(actor.maximumOffset), f(Math.abs(next) + actor.loadSpeed));
  else if (actor.returnsWhenEmpty) next = Math.max(0, f(Math.abs(next) - actor.returnSpeed));
  next = f(next * (actor.maximumOffset < 0 ? -1 : 1));
  const movement = { x: 0, y: f(next - actor.offset.y) };
  if (!canMoveNativeActor(actor, movement, 0, 0)) return;
  actor.offset.y = next;
  actor.position = { x: f(actor.spawnPosition.x + actor.offset.x), y: f(actor.spawnPosition.y + next) };
  if (Math.abs(f(movement.y * movement.y)) > EPSILON) carryNativeBalanceRiders(actor, movement);
}
