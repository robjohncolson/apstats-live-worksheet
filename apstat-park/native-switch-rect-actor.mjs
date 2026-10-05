import { createNativeRectActor } from './native-rect-actor.mjs';

// bb5bcb0/5bef0/5bf60/5bfd0. Same rectangle geometry and clear-space probe,
// but separate command state, no party-dependent dimensions, and no alternate PRE.
export function createNativeSwitchRectActor({ spawn }) {
  const actor = createNativeRectActor({ spawn: { ...spawn, raw: spawn.raw.slice(0, 8) }, partySize: 2 });
  actor.networkType = 0x21;
  actor.replicationMode = 0;
  actor.activationCount = 0;
  actor.beforeAlternateMotion = null;
  const added = actor.onAdded, command = actor.onCommand;
  actor.onAdded = scene => {
    added(scene);
    actor.activationCount = 0;
    actor.setVisible(false);
    actor.body.flags &= ~1;
  };
  actor.onCommand = (code, value) => {
    if (code === 9) {
      actor.activationCount = (actor.activationCount + 1) | 0;
      if (actor.activationCount === 1) actor.setVisible(true);
    } else if (code === 10) {
      if (actor.activationCount !== 0) {
        actor.activationCount = (actor.activationCount - 1) | 0;
        if (actor.activationCount === 0) {
          actor.setVisible(false);
          actor.body.flags &= ~1;
        }
      }
    } else return command(code, value);
    return 0;
  };
  return actor;
}
