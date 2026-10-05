import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;
const uv = (x, y) => ({ x, y, width: .0244140625, height: .0283203125 });

// bb51b00/51ce0, PRE bb51e10, POST bb52360, command bb51db0.
export function createNativeGhostActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 2,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    networkType: 0x1c, replicationMode: 1, ghostFlags: 0, watcherCount: 0,
    stopRatio: numeric(params[0]), keyRange: params.length > 3 ? numeric(params[3]) : 100,
    speed: params.length > 2 ? numeric(params[2]) : f(1.3), bobSeconds: 0, opacity: 1,
    scale: { x: Math.trunc(numeric(params[1])) > 0 ? -1 : 1, y: 1 },
    spriteFlags: 8, spriteDepth: f(-.4), spriteColor: 0xffffffff,
    spriteBounds: { x: -25, y: -100, width: 50, height: 58 }, spriteUV: uv(.453125, .375),
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    onCommand(command) {
      if (command === 9) actor.ghostFlags |= 2;
      else if (command === 0x18) actor.ghostFlags |= 4;
      return 0;
    },
    beforeMotion() {
      if (actor.ghostFlags & 8) return;
      actor.velocity = { x: 0, y: 0 };
      let active = 0, watchers = 0, nearest = null, closest = f(3.4028234663852886e38);
      for (const player of actor.scene.players) {
        if (player.controllerKind !== 2 && player.controllerKind !== 5) continue;
        active++;
        const dx = f(player.position.x - actor.position.x), dy = f(player.position.y - actor.position.y);
        const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
        if (distance < closest) { closest = distance; nearest = player; }
        if (dx < 0 ? player.scale.x > 0 : !(player.scale.x > 0)) watchers++;
      }
      actor.watcherCount = watchers;
      const required = (Math.trunc(f(f(active) * actor.stopRatio)) >>> 0) || 1;
      if (!(actor.ghostFlags & 1)) {
        if (watchers === 0) { actor.ghostFlags |= 1; actor.spriteUV = uv(.453125, .28125); }
      } else if (watchers < required) {
        actor.spriteUV = uv([.453125, .515625, .546875, .578125][Math.min(watchers, 3)], .28125);
      } else { actor.ghostFlags &= ~1; actor.spriteUV = uv(.453125, .375); }
      if (actor.ghostFlags & 4) {
        actor.opacity = f(actor.opacity - f(.1));
        if (actor.opacity < 0) markNativeActorForRemoval(actor);
        else actor.spriteColor = ((actor.spriteColor & 0x00ffffff) | (Math.trunc(f(actor.opacity * 255)) << 24)) >>> 0;
        return;
      }
      if (!(actor.ghostFlags & 1)) return;
      const key = actor.scene.findActor('Key');
      if (nearest) {
        const target = key?.isNativeKey && !key.carrier && Math.abs(f(key.position.x - actor.position.x)) < actor.keyRange
          ? key : nearest;
        const dx = f(target.position.x - actor.position.x), dy = f(target.position.y - f(actor.position.y - 50));
        const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
        const amount = Math.min(actor.speed, distance);
        const nx = distance === 0 ? dx : f(dx / distance), ny = distance === 0 ? dy : f(dy / distance);
        actor.velocity = { x: f(nx * amount), y: f(ny * amount) };
        if (nx !== 0) actor.scale = { x: nx < 0 ? -1 : 1, y: 1 };
      }
      if (key?.isNativeKey && key.carrier) actor.body.flags &= ~1;
    },
    afterMotion(dt) {
      if (actor.scene.actorManager.flags & 8) return;
      actor.bobSeconds = f(actor.bobSeconds + f(dt));
      const angle = f(actor.bobSeconds + actor.bobSeconds);
      actor.renderOffset = { x: 0, y: f(f(Math.sin(angle)) * 8) };
      if (angle >= f(2 * Math.PI)) actor.bobSeconds = f(f(angle - f(2 * Math.PI)) * .5);
    },
  };
  const bounds = { x: -21, y: -99, width: 42, height: 56 };
  actor.body = createNativeActorRectangle(actor, bounds, 0, true); actor.body.category = 9;
  actor.damageBody = createNativeActorRectangle(actor, bounds, 0, true); actor.damageBody.category = 4;
  actor.damageBody.onOverlap = other => {
    if (other.category === 1 && other.actor.canReceiveDamage()) other.actor.onCommand(4, null);
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
