import { runNativeActorPre } from './native-actor-manager.mjs';
import { checkNativeTimerExpired } from './native-scene-timer.mjs';
const f = Math.fround;

// bc1b610 + bb7b9c0. spawnDueActors is bc2a1a0's creation-table scheduler,
// driven by scene virtual68 (viewPosition.x), not wall-clock time.
export function setNativeSceneActive(scene, enabled) {
  enabled = Boolean(enabled);
  if (Boolean(scene.flags & 0x20) === enabled) return;
  if (!enabled) { scene.flags &= ~0x20; return; }
  if (typeof scene.spawnDueActors !== 'function') {
    throw new Error('Native scene activation requires creation-table scheduling');
  }
  scene.flags |= 0x20;
  scene.spawnDueActors(scene.viewPosition.x);
  runNativeActorPre(scene.actorManager, 0);
  if (scene.scrollMode === 1 && !(scene.scrollFlags & 4) && scene.players.length) {
    let min = f(3.4028234663852886e38), max = -min;
    for (const player of scene.players) {
      if (player.controllerKind === 2 && !(player.spriteFlags & 8)) continue;
      min = Math.min(min, player.position.x);
      max = Math.max(max, player.position.x);
    }
    if (scene.cameraAnchor) {
      min = Math.min(min, scene.cameraAnchor.position.x);
      max = Math.max(max, scene.cameraAnchor.position.x);
    }
    scene.viewPosition = { x: Math.max(0, f(f(f(min + max) * .5) - f(f(1280 / scene.viewScale) * .5))), y: 0 };
    scene.scrollFlags |= 4;
  }
  checkNativeTimerExpired(scene);
}
