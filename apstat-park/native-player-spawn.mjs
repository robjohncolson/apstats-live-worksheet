import { createNativePlayer } from './native-player-actor.mjs';

// Ordinary local Player branch of bb72ae0 -> bb774a0, followed by bb67620.
// Saved checkpoint relocation, AI companions and specialized Player forms
// remain separate factory branches; this function handles only Player rows.
export function spawnNativePlayerRow(scene, spawn, { presentation, extensions = {} }) {
  if (spawn.actorName !== 'Player') throw new Error('Native ordinary Player factory received another actor type');
  const sequence = scene.players.length;
  if (scene.limitPlayer && sequence >= scene.playerCount) return null;
  if (!scene.playerSlots?.length) throw new Error('Native Player creation requires input-slot mapping');
  const playerIndex = scene.playerSlots[sequence % scene.playerSlots.length];
  const actor = createNativePlayer({ playerIndex, position: { x: spawn.x, y: spawn.y }, presentation, extensions });
  actor.name = (spawn.actorName + (spawn.label ?? '')).slice(0, 31);
  const facing = spawn.raw[6];
  if (typeof facing === 'number' && Math.trunc(Math.fround(facing)) === 1) actor.faceDirection(-1);
  scene.addPlayer(actor);
  return actor;
}
