import { nativeRect } from './native-rect.mjs';
import { createNativeActorRectangle, unregisterNativeActorBodies, nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { nativeBodyPlacementBlocked } from './native-body-placement.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb5b820/bb5ba50/bb5bac0/bb5bb30; ordinary, invisible and darkness Rects.
// spriteFlags is the common actor sprite (+178); patchFlags is the separate
// tiled Rect component (+3f8), which commands e/2c modify independently.
export function createNativeRectActor({ spawn, partySize }) {
  const rect = nativeRect(spawn, partySize);
  const extraY = typeof spawn.raw[11] === 'number' ? f(spawn.raw[11]) : 0;
  const position = { x: rect.x, y: f(f(spawn.y) + f(f(partySize - 2) * extraY)) };
  const bounds = { x: 0, y: f(-rect.height), width: rect.width, height: rect.height };
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 2,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    spriteFlags: 8, patchFlags: 8, spriteBounds: { ...bounds }, spriteDepth: f(.2),
    patch: { tileWidth: 32, tileHeight: 32, uvWidth: .015625, uvHeight: .015625,
      uvX: 0, uvY: .515625, insetU: .015625, insetV: .015625 },
    dark: spawn.actorName === 'DarknessRect',
    setVisible(enabled) {
      actor.spriteFlags = enabled ? actor.spriteFlags | 8 : actor.spriteFlags & ~8;
      actor.patchFlags = enabled ? actor.patchFlags | 8 : actor.patchFlags & ~8;
    },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion: () => enableIfClear(),
    beforeAlternateMotion: () => enableIfClear(),
    onStopped() { actor.spriteFlags |= 2; actor.stepStartPosition = { ...actor.position }; },
    onCommand(command, value) {
      if (command === 0x13) {
        const right = f(f(bounds.x + nativeActorDisplayPosition(actor).x) + bounds.width);
        return right >= 0 ? 1 : 0;
      }
      if (command === 0x1c && actor.manager) {
        actor.flags |= 1;
        actor.onStopped();
      } else if (command === 0xe) {
        actor.patchFlags = value ? actor.patchFlags | 8 : actor.patchFlags & ~8;
      } else if (command === 0x2c && actor.dark) {
        actor.patchFlags &= ~8;
      }
      return 0;
    },
  };
  function enableIfClear() {
    if (!(actor.patchFlags & 8) || (actor.body.flags & 1)) return;
    if (!nativeBodyPlacementBlocked(actor.body.world, actor.body)) actor.body.flags |= 1;
  }
  actor.body = createNativeActorRectangle(actor, bounds, 2, true);
  actor.body.category = 6;
  actor.body.flags = (actor.body.flags & ~1) | 2;
  if (spawn.actorName === 'InvisibleRect') {
    actor.setVisible(false);
    actor.body.flags |= 1;
  }
  placeNativeActorBodies(actor, position);
  return actor;
}
