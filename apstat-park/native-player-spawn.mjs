import { createNativePlayer } from './native-player-actor.mjs';

// Ordinary local Player branch of bb72ae0 -> bb774a0, followed by bb67620.
// AI companions and specialized Player forms remain separate factory branches.
export function spawnNativePlayerRow(scene, spawn, { presentation, extensions = {}, configureActor }) {
  if (spawn.actorName !== 'Player') throw new Error('Native ordinary Player factory received another actor type');
  const sequence = scene.players.length;
  if (scene.limitPlayer && sequence >= scene.playerCount) return null;
  if (!scene.playerSlots?.length) throw new Error('Native Player creation requires input-slot mapping');
  const playerIndex = scene.playerSlots[sequence % scene.playerSlots.length];
  let position = { x: spawn.x, y: spawn.y };
  const saved = (scene.sceneId >>> 0) < 100 ? scene.checkpointStore?.get(scene.sceneId >>> 0) : null;
  if (saved) {
    // bb774a0: scene+178 word, spawnY -= inputSlot*48, initial viewX=max(0,X-180).
    const f = Math.fround;
    scene.checkpointWord = saved.sceneWord >>> 0;
    position = { x: saved.position.x, y: f(saved.position.y - f(f(playerIndex >>> 0) * 48)) };
    scene.viewPosition = { x: Math.max(0, f(saved.position.x - 180)), y: 0 };
  }
  const actor = createNativePlayer({ playerIndex, position, presentation, extensions });
  actor.name = (spawn.actorName + (spawn.label ?? '')).slice(0, 31);
  configureActor?.(actor);
  const facing = spawn.raw[6];
  if (typeof facing === 'number' && Math.trunc(Math.fround(facing)) === 1) actor.faceDirection(-1);
  scene.addPlayer(actor);
  return actor;
}
