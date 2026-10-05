import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb5d230 / bb5d2e0, factory bb764fe..bb76546. The constructor's range
// field is retained, although the recovered PRE never reads it.
export function createNativeScrollLimitRangeActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    range: typeof params[0] === 'number' ? f(params[0]) : 0,
    requireAll: typeof params[1] === 'number' ? (Math.trunc(f(params[1])) | 0) !== 0 : false,
    phase: 0, spriteFlags: 8, spriteBounds: { x: 0, y: 0, width: 0, height: 0 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion() {
      const scene = actor.scene;
      if (actor.phase === 0) {
        const playerX = actor.requireAll ? scene.playerMinX : scene.playerMaxX;
        if (playerX > actor.position.x) { scene.scrollMode = 2; actor.phase = 1; }
      } else if (actor.phase === 1) {
        const key = scene.findActor('Key');
        if (key?.isNativeKey && key.carrier) { scene.scrollMode = 1; actor.phase = 2; }
      }
    },
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
