import { createNativeSwitchActor } from './native-switch-actor.mjs';
import { nativeActorDisplayPosition } from './native-actor-bodies.mjs';
const f = Math.fround;

// bb77a30 / bb78f00 / bb5f550. Its Lua parser replaces the base parser.
export function createNativeScaleSwitchActor({ spawn }) {
  const actor = createNativeSwitchActor({ spawn: { ...spawn, raw: spawn.raw.slice(0, 6) } });
  actor.managerPriority = 2;
  actor.switchFlags |= 0x40;
  actor.scaleIncrement = typeof spawn.raw[6] === 'number' ? f(spawn.raw[6]) : 0;
  const basePre = actor.beforeMotion;
  actor.beforeMotion = () => {
    if ((actor.switchFlags & 2) && actor.lastContactBody) {
      const body = actor.lastContactBody;
      if (!body.actor) return; // source returns before ordinary switch PRE
      if (body.category === 1) body.actor.onCommand(0x21, actor.scaleIncrement);
    }
    basePre();
  };
  actor.readScaleLabel = () => {
    const position = nativeActorDisplayPosition(actor);
    return { text: actor.scaleIncrement > 0 ? '+' : '-', x: Math.trunc(position.x),
      y: Math.trunc(f(position.y - 40)), fontSize: 32, horizontalAlignment: 2,
      verticalAlignment: 2, depth: f(.1) };
  };
  return actor;
}
