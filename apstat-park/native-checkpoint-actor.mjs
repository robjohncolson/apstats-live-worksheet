import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { scaledNativeBounds } from './native-body-support.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb50710 / bb509d0. The persistent store represents global per-scene records
// at cc98+sceneId*a0. The caller shares it across retries and clears it on exit.
export function createNativeCheckPointActor({ spawn }) {
  const bounds = { x: -16, y: -64, width: 32, height: 64 };
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    checked: false, spriteFlags: 9, spriteDepth: f(-.4), spriteBounds: bounds,
    spriteUV: { x: .03125, y: .3125, width: .015625, height: .03125 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
  };
  actor.body = createNativeActorRectangle(actor, bounds, 0, true);
  actor.body.category = 8;
  actor.body.onOverlap = other => {
    if (other.category !== 1 || actor.checked) return;
    const scene = actor.scene;
    scene.playSound('check');
    // Use the recipient actor's FIRST body, not necessarily the overlapping one.
    const body = other.actor.bodies[0].body;
    const size = scaledNativeBounds(body.rawBounds, body.scale, body.pivot);
    const position = { x: f(actor.position.x - f(size.width * .5)),
      y: f(f(actor.position.y - f(size.height * .5)) - 1) };
    const id = scene.sceneId >>> 0;
    if (id < 100) scene.checkpointStore.set(id, { position, sceneWord: scene.checkpointWord >>> 0 });
    actor.checked = true;
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
