import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb6d170 ctor, bb6d4b0 Lua, bb6d5c0 PRE, bb6d780 continuous overlap.
export function createNativeUpDownEnemyActor({ spawn }) {
  const option = spawn.raw[6];
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    phase: 0, phaseSeconds: 0, verticalOffset: 0, networkType: 0x1f,
    replicationMode: typeof option === 'number' && Math.trunc(f(option)) > 0 ? 0 : 1,
    spriteFlags: 9, spriteDepth: f(-.1),
    spriteBounds: { x: -30, y: -26, width: 60, height: 52 },
    spriteUV: { x: .3759765625, y: 0, width: .029296875, height: .025390625 },
    spriteAction: { name: 'look', node: 'root', keys: [
      { frame: 0, uvX: 0, uvY: 0 }, { frame: 192, uvX: .03125, uvY: 0 },
      { frame: 240, uvX: .0625, uvY: 0 }, { frame: 288, uvX: 0, uvY: 0 },
    ] },
    onAdded(scene) {
      actor.scene = scene;
      if (actor.replication && scene.networkMode === 1) {
        actor.flags = actor.replicationMode ? (actor.flags | 8) & ~16 : actor.flags & ~24;
      }
      runNativeCommonActorAdded(actor, scene);
    },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion(dt) {
      const elapsed = actor.phaseSeconds;
      if (actor.phase === 0 || actor.phase === 2) {
        if (elapsed >= 2) { actor.phase++; actor.phaseSeconds = 0; }
        else actor.phaseSeconds = f(elapsed + f(dt));
      } else if (actor.phase === 1) {
        if (elapsed >= 2.5) {
          actor.phase = 2; actor.phaseSeconds = 0; actor.verticalOffset = -50;
        } else {
          actor.phaseSeconds = f(elapsed + f(dt));
          actor.verticalOffset = f(f(actor.phaseSeconds / 2.5) * -50);
        }
      } else if (actor.phase === 3) {
        if (elapsed >= 2.5) {
          actor.phase = 0; actor.phaseSeconds = 0; actor.verticalOffset = 0;
        } else {
          actor.phaseSeconds = f(elapsed + f(dt));
          actor.verticalOffset = f(f(1 - f(actor.phaseSeconds / 2.5)) * -50);
        }
      }
      actor.position = { x: actor.spawnPosition.x, y: f(actor.spawnPosition.y + actor.verticalOffset) };
    },
    // bb6d500/bb6d560: five 32-bit words. Transport and history remain scene-owned.
    readEnemyState() {
      return { x: actor.position.x, y: actor.position.y, phase: actor.phase,
        phaseSeconds: actor.phaseSeconds, verticalOffset: actor.verticalOffset };
    },
    applyEnemyState(state) {
      actor.position = { x: f(state.x), y: f(state.y) }; actor.phase = state.phase | 0;
      actor.phaseSeconds = f(state.phaseSeconds); actor.verticalOffset = f(state.verticalOffset);
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: -28, y: -22, width: 56, height: 48 }, 0, true);
  actor.body.category = 7;
  actor.body.onOverlap = other => {
    if (other.category === 1 && other.actor?.canReceiveDamage()) other.actor.onCommand(4, null);
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
