// bb7ccc0. Expiration clears the map's bit2 (+51768), then broadcasts
// command 2c with null target/payload. It does not directly kill players or
// restart the scene; the command recipients own that behavior.
export function checkNativeTimerExpired(scene) {
  if (!(scene.scrollFlags & 0x200) || !(scene.remainingSeconds <= 0)) return;
  if (typeof scene.sendCommand !== 'function') throw new Error('Native timer requires scene command dispatch');
  scene.mapFlags &= ~2;
  scene.sendCommand(null, 0x2c, null);
}

// bb7bbe0 before either physics pass. getTimerPeer represents bc2d750 on
// the client's network context; absence of a peer pauses the local clock.
export function updateNativeGameTimer(scene, dt) {
  if (!(scene.scrollFlags & 0x200) || !(scene.remainingSeconds > 0)) return;
  if (scene.actorManager.flags & 8) return;
  if (scene.networkMode === 1) {
    if (typeof scene.getTimerPeer !== 'function') throw new Error('Native timer requires client peer lookup');
    if (!scene.getTimerPeer()) return;
  }
  scene.remainingSeconds = Math.fround(scene.remainingSeconds - Math.fround(dt));
  checkNativeTimerExpired(scene);
}
