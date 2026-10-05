import { spawnNativePlayerRow } from './native-player-spawn.mjs';
import { createNativeRectActor } from './native-rect-actor.mjs';
import { createNativePushBoxActor } from './native-push-box-actor.mjs';
import { createNativeWarpActor } from './native-warp-actor.mjs';
import { createNativeSwitchActor } from './native-switch-actor.mjs';
import { createNativeDeadSwitchActor } from './native-dead-switch-actor.mjs';
import { createNativeBridgeActor } from './native-bridge-actor.mjs';
import { createNativeWeightedLiftActor } from './native-weighted-lift-actor.mjs';
import { createNativeDarknessLiftActor } from './native-darkness-lift-actor.mjs';
import { createNativeThunderActor } from './native-thunder-actor.mjs';
import { createNativeJumpStandActor } from './native-jump-stand-actor.mjs';
import { createNativeStepEnemyActor } from './native-step-enemy-actor.mjs';
import { createNativeUpDownEnemyActor } from './native-up-down-enemy-actor.mjs';
import { createNativeCheckPointActor } from './native-checkpoint-actor.mjs';
import { createNativeCollisionActorCreator } from './native-collision-actor-creator.mjs';
import { createNativeWindActor } from './native-wind-actor.mjs';
import { createNativeGhostActor } from './native-ghost-actor.mjs';
import { createNativeColorBoxActor } from './native-color-box-actor.mjs';
import { createNativeScrollLimitRangeActor } from './native-scroll-limit-range-actor.mjs';
import { createNativeUpDownLiftActor } from './native-up-down-lift-actor.mjs';
import { createNativeFallBoxActor } from './native-fall-box-actor.mjs';
import { createNativeDeadTimerActor } from './native-dead-timer-actor.mjs';
import { createNativeCollisionChangePlayerActor } from './native-collision-change-player-actor.mjs';
import { populateNativeSeesawActors } from './native-seesaw-stage.mjs';

// Explicit factory coverage (including the intentionally ignored Watch row).
// Unsupported actors must
// remain visible as missing work; never substitute a passive preview object.
export const NATIVE_STAGE_ACTOR_TYPES = Object.freeze([
  'Player', 'Rect', 'InvisibleRect', 'DarknessRect', 'Key', 'BreakoutKey', 'Goal',
  'SeesawParent', 'Seesaw', 'Balance', 'PhysicsArea', 'PhysicsRect',
  'PhysicsBallPitcher', 'PhysicsSwitch', 'PushBox',
  'Warp', 'WarpAll', 'WarpInitPos', 'WarpAllInitPos',
  'Switch',
  'DeadSwitch',
  'Bridge', 'KeyBridge', 'Gate',
  'WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2',
  'DarknessWeightedLift', 'InvisibleWeightedLift',
  'Thunder', 'Watch',
  'JumpStand', 'JumpStandEx',
  'StepEnemy',
  'UpDownEnemy',
  'CheckPoint',
  'CollisionActorCreator', 'CollisionActorCreatorSilent',
  'Wind', 'ScrollLimitRange',
  'Ghost',
  'ColorBox', 'ForceColorBox',
  'UpDownLift',
  'FallBox',
  'DeadTimer',
  'CollisionChangePlayer',
]);

export function spawnNativeStageActor(scene, spawn, { playerPresentation, playerExtensions } = {}) {
  // bb75806..bb75808 -> bb7730a returns null: the shipped factory skips Watch.
  if (spawn.actorName === 'Watch') return null;
  if (spawn.actorName === 'Player') {
    if (!playerPresentation) throw new Error('Native Player factory requires presentation callbacks');
    return spawnNativePlayerRow(scene, spawn, { presentation: playerPresentation, extensions: playerExtensions });
  }
  if (['Rect', 'InvisibleRect', 'DarknessRect'].includes(spawn.actorName)) {
    return scene.addActor(createNativeRectActor({ spawn, partySize: scene.playerCount }));
  }
  if (spawn.actorName === 'PushBox') return scene.addActor(createNativePushBoxActor({ spawn }));
  if (['ColorBox', 'ForceColorBox'].includes(spawn.actorName)) {
    return scene.addActor(createNativeColorBoxActor({ spawn, partySize: scene.playerCount }));
  }
  if (spawn.actorName === 'Thunder') return scene.addActor(createNativeThunderActor({ spawn }));
  if (spawn.actorName === 'StepEnemy') return scene.addActor(createNativeStepEnemyActor({ spawn }));
  if (spawn.actorName === 'UpDownEnemy') return scene.addActor(createNativeUpDownEnemyActor({ spawn }));
  if (spawn.actorName === 'CheckPoint') return scene.addActor(createNativeCheckPointActor({ spawn }));
  if (spawn.actorName === 'Wind') return scene.addActor(createNativeWindActor({ spawn, partySize: scene.playerCount }));
  if (spawn.actorName === 'Ghost') {
    const actor = createNativeGhostActor({ spawn });
    if (!scene.cameraAnchor) { scene.cameraAnchor = actor; actor.references = (actor.references ?? 0) + 1; }
    return scene.addActor(actor);
  }
  if (spawn.actorName === 'ScrollLimitRange') return scene.addActor(createNativeScrollLimitRangeActor({ spawn }));
  if (['CollisionActorCreator', 'CollisionActorCreatorSilent'].includes(spawn.actorName)) {
    return scene.addActor(createNativeCollisionActorCreator({ spawn }));
  }
  if (spawn.actorName === 'UpDownLift') return scene.addActor(createNativeUpDownLiftActor({ spawn, partySize: scene.playerCount }));
  if (spawn.actorName === 'FallBox') return scene.addActor(createNativeFallBoxActor({ spawn }));
  if (spawn.actorName === 'DeadTimer') return scene.addActor(createNativeDeadTimerActor({ spawn, partySize: scene.playerCount }));
  if (spawn.actorName === 'CollisionChangePlayer') return scene.addActor(createNativeCollisionChangePlayerActor({ spawn }));
  if (spawn.actorName === 'JumpStand' || spawn.actorName === 'JumpStandEx') {
    return scene.addActor(createNativeJumpStandActor({ spawn }));
  }
  if (spawn.actorName === 'Switch') return scene.addActor(createNativeSwitchActor({ spawn }));
  if (spawn.actorName === 'DeadSwitch') return scene.addActor(createNativeDeadSwitchActor({ spawn }));
  if (['Bridge', 'KeyBridge', 'Gate'].includes(spawn.actorName)) {
    return scene.addActor(createNativeBridgeActor({ spawn, partySize: scene.playerCount }));
  }
  if (['WeightedLift', 'WeightedLiftEx', 'WeightedLiftEx2'].includes(spawn.actorName)) {
    return scene.addActor(createNativeWeightedLiftActor({ spawn, partySize: scene.playerCount }));
  }
  if (['DarknessWeightedLift', 'InvisibleWeightedLift'].includes(spawn.actorName)) {
    return scene.addActor(createNativeDarknessLiftActor({ spawn }));
  }
  if (['Warp', 'WarpAll', 'WarpInitPos', 'WarpAllInitPos'].includes(spawn.actorName)) {
    return scene.addActor(createNativeWarpActor({ spawn }));
  }
  if (!NATIVE_STAGE_ACTOR_TYPES.includes(spawn.actorName)) {
    throw new Error(`Native actor factory is not implemented: ${spawn.actorName}`);
  }
  return populateNativeSeesawActors(scene, [spawn])[0]?.actor ?? null;
}
