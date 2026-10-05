import { spawnNativePlayerRow } from './native-player-spawn.mjs';
import { createNativeRectActor } from './native-rect-actor.mjs';
import { createNativePushBoxActor } from './native-push-box-actor.mjs';
import { createNativeWarpActor } from './native-warp-actor.mjs';
import { populateNativeSeesawActors } from './native-seesaw-stage.mjs';

// Explicit coverage for the assembled native scene. Unsupported actors must
// remain visible as missing work; never substitute a passive preview object.
export const NATIVE_STAGE_ACTOR_TYPES = Object.freeze([
  'Player', 'Rect', 'InvisibleRect', 'DarknessRect', 'Key', 'BreakoutKey', 'Goal',
  'SeesawParent', 'Seesaw', 'Balance', 'PhysicsArea', 'PhysicsRect',
  'PhysicsBallPitcher', 'PhysicsSwitch', 'PushBox',
  'Warp', 'WarpAll', 'WarpInitPos', 'WarpAllInitPos',
]);

export function spawnNativeStageActor(scene, spawn, { playerPresentation, playerExtensions } = {}) {
  if (spawn.actorName === 'Player') {
    if (!playerPresentation) throw new Error('Native Player factory requires presentation callbacks');
    return spawnNativePlayerRow(scene, spawn, { presentation: playerPresentation, extensions: playerExtensions });
  }
  if (['Rect', 'InvisibleRect', 'DarknessRect'].includes(spawn.actorName)) {
    return scene.addActor(createNativeRectActor({ spawn, partySize: scene.playerCount }));
  }
  if (spawn.actorName === 'PushBox') return scene.addActor(createNativePushBoxActor({ spawn }));
  if (['Warp', 'WarpAll', 'WarpInitPos', 'WarpAllInitPos'].includes(spawn.actorName)) {
    return scene.addActor(createNativeWarpActor({ spawn }));
  }
  if (!NATIVE_STAGE_ACTOR_TYPES.includes(spawn.actorName)) {
    throw new Error(`Native actor factory is not implemented: ${spawn.actorName}`);
  }
  return populateNativeSeesawActors(scene, [spawn])[0]?.actor ?? null;
}
