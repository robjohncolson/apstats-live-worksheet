import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { nativeMapFromRecovered } from './native-map-collision.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
import { updateNativeSceneCamera, updateNativeVisibleColumns } from './native-scene-camera.mjs';
import { updateNativeGameTimer } from './native-scene-timer.mjs';
import { updateNativeSceneOutcomes } from './native-scene-outcomes.mjs';
import { setNativeSceneActive } from './native-scene-activation.mjs';
import { nativePlayerMovementBoundary, applyNativePlayerScrollBoundary, checkNativePlayerFallBounds } from './native-player-boundary.mjs';
const f = Math.fround;

// GameScene's 38 writes into BodyWorld's matrix (+38), bb7a9b0 tail.
// Registry construction independently enables (0,0). Direction is significant.
const COLLISION_PAIRS = [
  [1, 1], [1, 7], [7, 1], [1, 2], [2, 1], [1, 8], [8, 1], [1, 0], [0, 1],
  [1, 10], [10, 1], [1, 4], [4, 1], [3, 4], [4, 3], [1, 5], [5, 1],
  [3, 5], [5, 3], [2, 5], [5, 2], [5, 5], [1, 6], [6, 1], [3, 6],
  [6, 3], [2, 6], [6, 2], [5, 6], [6, 5], [7, 7], [2, 2], [8, 10],
  [10, 8], [8, 9], [9, 8], [3, 0], [0, 3],
];

// bb981b0, CRC32 table bcc1270. All shipped actor identifiers are ASCII.
// Consume the name through its first NUL, matching the native strlen caller.
export function nativeActorNameHash(name) {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(name.split('\0', 1)[0])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

// Local GameScene assembly from bb7a9b0 and its base constructors. Actor
// creation, input/presentation, saved checkpoints and network ownership are
// supplied by the caller. Construction does not activate the scene (bit20).
// No preview GameRuntime solver participates in this scene's frame loop.
export function createNativeGameScene({ stage, playerCount, createRigidWorld,
  playerInput, playSound, stageRetryEligible, notifyPlayerRelocation,
  getTimerPeer, resolveGoalFollower, spawnDueActors }) {
  const scale = f(stage.scale ?? 1);
  const bodyWorld = createNativeBodyRegistry();
  bodyWorld.map = nativeMapFromRecovered(stage.map, [3, 3, 3, 3, 1, 1, 1, 1, 1]); // bc2fc00/bcc8c40
  for (const [a, b] of COLLISION_PAIRS) bodyWorld.collisionMatrix[a * 32 + b] = 1;
  const scene = {
    flags: 0x600, frame: 0n, highestFrame: 0n, playerCount, players: [],
    actorManager: createNativeActorManager(4), bodyWorld,
    // bc1a070 passes pixel gravity980 through bbe76d0's .01f Y conversion.
    rigidWorld: createRigidWorld({ gravity: { x: 0, y: f(980 * f(.01)) } }),
    viewPosition: { x: 0, y: 0 }, previousViewPosition: { x: 0, y: 0 },
    viewOffset: { x: 0, y: 0 }, viewScale: scale,
    scrollFlags: 0x500, scrollMode: 0, scrollLimit: 0,
    scrollSpeed: f(f(stage.autoScrollSpeed ?? 0) + f(f(playerCount - 2) * f(stage.autoScrollSpeedOffset ?? 0))),
    mapOffset: 0, cameraMaxStep: 3, cameraBlend: 1, playerMinX: 0, playerMaxX: 0,
    mapWidth: stage.map.width, chipSize: stage.map.chipSize, mapFlags: 3,
    maximumPlayerY: f(f(720 / scale) * f(stage.failWindowScale ?? 3)),
    minimumPlayerY: f(stage.failUpY ?? 0), remainingSeconds: 0,
    limitPlayer: Boolean(stage.limitPlayer ?? 0), playerInput, playSound, stageRetryEligible,
    notifyPlayerRelocation, getTimerPeer, resolveGoalFollower, spawnDueActors,
    namedActors: [],
  };
  // A present, successfully decoded autoScroll=0 skips scrollable entirely.
  if (typeof stage.autoScroll === 'number') {
    if (Math.trunc(stage.autoScroll)) {
      scene.scrollMode = 2;
      scene.mapOffset = f(f(playerCount - 2) * f(stage.autoScrollEndOffset ?? 0));
    }
  } else if (stage.scrollable) scene.scrollMode = 1;
  for (const [option, bit] of [['unlimitScroll', 8], ['unreturnScroll', 0x10],
    ['isDarkness', 0x200], ['enableShufflePlayer', 0x20], ['disableFirstSnapshot', 0x2000]]) {
    if (stage[option]) scene.scrollFlags |= bit;
  }
  if (scene.scrollFlags & 0x200) scene.mapFlags &= ~2;

  scene.addActor = actor => {
    actor.scene = scene;
    queueNativeActor(scene.actorManager, actor, actor.managerPriority ?? 0, scene);
    const name = actor.name?.split('\0', 1)[0];
    if (!name) return actor;
    const hash = nativeActorNameHash(name);
    if (scene.namedActors.some(entry => entry.hash === hash)) return actor;
    scene.namedActors.push({ hash, actor });
    scene.namedActors.sort((a, b) => a.hash - b.hash);
    actor.references = (actor.references ?? 0) + 1;
    return actor;
  };
  scene.addPlayer = actor => {
    if (scene.players.length < 20) {
      scene.players.push(actor);
      actor.references = (actor.references ?? 0) + 1;
    }
    return scene.addActor(actor);
  };
  scene.findActor = name => scene.namedActors.find(entry => entry.hash === nativeActorNameHash(name))?.actor ?? null;
  scene.sendCommand = (name, command, value) => {
    if (name !== null && name !== undefined) return scene.findActor(name)?.onCommand?.(command, value) ?? 0;
    const count = scene.namedActors.length;
    for (let i = 0; i < count; i++) scene.namedActors[i].actor.onCommand?.(command, value);
    return 0;
  };
  scene.actorManager.onRemoving = actor => {
    const index = scene.namedActors.findIndex(entry => entry.actor === actor);
    if (index < 0) return;
    scene.namedActors.splice(index, 1);
    if (actor.references && !--actor.references) actor.onReleased?.();
  };
  scene.clipPlayerMovement = (actor, value) => nativePlayerMovementBoundary(scene, actor, value);
  scene.applyPlayerScrollBoundary = (actor, velocity) => applyNativePlayerScrollBoundary(scene, actor, velocity);
  scene.checkPlayerFallBounds = (actor, state) => checkNativePlayerFallBounds(scene, actor, state);
  scene.updateGameTimer = dt => updateNativeGameTimer(scene, dt);
  scene.updateCamera = () => { updateNativeSceneCamera(scene); updateNativeVisibleColumns(scene); };
  scene.updateOutcomes = () => updateNativeSceneOutcomes(scene);
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  scene.step = () => stepNativeSceneFrame(scene);
  scene.setActive = enabled => setNativeSceneActive(scene, enabled);
  return scene;
}
