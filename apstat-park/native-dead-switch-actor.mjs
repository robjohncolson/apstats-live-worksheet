import { createNativeSwitchActor } from './native-switch-actor.mjs';

// bb3f080 inherits mode0/style0 Switch; bb3f1f0 overrides virtual +108.
export function createNativeDeadSwitchActor({ spawn }) {
  const actor = createNativeSwitchActor({ spawn });
  actor.warningSprite = {
    flags: 8, depth: Math.fround(.1), componentFlags: 1, offset: { x: 0, y: -26 },
    bounds: { x: -72, y: -54, width: 144, height: 54 },
    uv: { x: .359375, y: .3125, width: .046875, height: .017578125 },
  };
  actor.onSwitchChanged = pressed => {
    if (!pressed) return;
    const scene = actor.scene;
    // bb1b8c0 stops music once through the application audio owner. Retain the
    // latch here and expose the audio operation to the eventual scene adapter.
    if (!scene.nativeMusicStopped) {
      scene.nativeMusicStopped = true;
      scene.stopNativeMusic?.();
    }
    scene.playSound('hit');
    scene.sendCommand(null, 3, null);
    if (actor.networkOwner && scene.networkMode === 2) {
      scene.sendNativeDeathPacket({ transport: 'host', target: 0xff,
        channel: 1, kind: 2, command: 0, value: 0 });
    }
  };
  return actor;
}
