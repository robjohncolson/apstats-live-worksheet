import { createNativePushBoxActor } from './native-push-box-actor.mjs';

// Factory bb73afb selects shape3 of bb333d0's bcb66a0 table. It shares
// PushBox's vtable/Lua parser, but uses (-25,-48,48,48), not centered X=-24.
export function createNativeSmallBoxActor({ spawn }) {
  const actor = createNativePushBoxActor({ spawn: {
    ...spawn, raw: [...spawn.raw.slice(0, 6), spawn.raw[6], 48, 48],
  } });
  actor.spriteBounds.x = -25;
  actor.body.rawBounds.x = -24;
  actor.body.localBounds.x = -24;
  actor.motionFlags |= 0x10;
  actor.mass = 100; // bb37500 effective mass for motion flag10
  return actor;
}
