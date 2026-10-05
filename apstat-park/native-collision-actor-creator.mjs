import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// bb3a640/730, overlap bb3aa10, create bb3aa70, snapshots bb3a980/9c0.
export function createNativeCollisionActorCreator({ spawn }) {
  const params = spawn.raw.slice(6), configured = params.length > 4;
  const actorName = configured && typeof params[2] === 'string' ? params[2].slice(0, 31) : '';
  const x = configured ? numeric(params[3]) : 0, y = configured ? numeric(params[4]) : 0;
  const childParams = configured ? params.slice(5).map((value, index) => {
    if (index + 5 >= 32) return 0;
    return typeof value === 'string' ? value.slice(0, 63) : numeric(value);
  }) : [];
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    triggered: 0, silent: spawn.actorName === 'CollisionActorCreatorSilent', networkType: 0x27, replicationMode: 0,
    spriteFlags: 8, spriteBounds: { x: 0, y: 0, width: 0, height: 0 },
    childSpawn: { actorName, label: '', x, y, forceReplication: false,
      raw: [0, 0, actorName, '', x, y, ...childParams] },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    readCreatorState: () => actor.triggered,
    applyCreatorState(value) {
      value |= 0;
      if (!actor.triggered && value) createChild();
      actor.triggered = value;
    },
  };
  function createChild() {
    if (!actor.silent) actor.scene.playSound('generate');
    if (actorName === 'Key' || actorName === 'Goal') {
      if (actor.replication && actor.scene.networkMode === 1) return;
      actor.childSpawn.forceReplication = true; // native descriptor+10
    }
    actor.scene.spawnDynamicActor(actor.childSpawn);
  }
  actor.body = createNativeActorRectangle(actor,
    { x: 0, y: 0, width: numeric(params[0]), height: numeric(params[1]) }, 0, true);
  actor.body.category = 4;
  actor.body.onOverlap = other => {
    if (actor.replication && actor.scene.networkMode === 1) return;
    if (actor.triggered || other.category !== 1) return;
    createChild(); actor.triggered = 1;
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
