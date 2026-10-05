import { createNativeActorRectangle, unregisterNativeActorBodies, nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// bb42810/42900/42d90, PRE bb429b0, STAY bb42fb0, horizontal cull bb42ff0.
export function createNativeFallBoxActor({ spawn }) {
  const params = spawn.raw.slice(6), width = numeric(params[0]), height = numeric(params[1]);
  const bounds = { x: f(0 - f(width * .5)), y: f(0 - height), width, height };
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 2,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    fallFlags: 0, triggeredSeconds: 0, spriteFlags: 8, patchFlags: 8,
    spriteBounds: bounds, spriteDepth: f(-.4), paletteIndex: 9,
    patch: { tileWidth: 16, tileHeight: 16, insetU: .0078125, insetV: .0078125,
      columns: [.140625, .15625, .1796875], rows: [.625, .640625, .6640625],
      uvWidth: .0078125, uvHeight: .0078125 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion(dt) {
      if (actor.fallFlags & 1) {
        if (actor.triggeredSeconds <= f(.22)) actor.triggeredSeconds = f(actor.triggeredSeconds + f(dt));
        else {
          actor.velocity.y = hasNativeDirectionalContact(actor.body, { x: 0, y: 1 }) ? 0 : f(actor.velocity.y + f(.65));
          for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
          const screenHeight = f(720 / actor.scene.viewScale);
          if (f(screenHeight + screenHeight) < actor.position.y) {
            markNativeActorForRemoval(actor); return;
          }
        }
      }
      const display = nativeActorDisplayPosition(actor);
      const left = f(bounds.x + display.x);
      const outside = f(f(left + bounds.width) + 1) < 0 || f(1280 / actor.scene.viewScale) <= f(left - 1);
      actor.body.flags = outside ? actor.body.flags & ~1 : actor.body.flags | 1;
      actor.patchFlags = outside ? actor.patchFlags & ~8 : actor.patchFlags | 8;
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: f(bounds.x + 2), y: f(bounds.y + 2),
    width: f(width - 4), height: f(height - 4) }, 3, true);
  actor.body.category = 2; actor.body.flags &= ~1;
  actor.body.onContactStay = (_other, normal) => { if (normal.y < 0) actor.fallFlags |= 1; };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
