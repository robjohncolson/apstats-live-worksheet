import { createNativeSwitchActor } from './native-switch-actor.mjs';
import { nativeActorDisplayPosition } from './native-actor-bodies.mjs';
const f = Math.fround;

// bb5f6d0/5f960/5f9c0/5fa40. The subclass Lua parser replaces base parameters.
export function createNativeDelaySwitchActor({ spawn }) {
  const actor = createNativeSwitchActor({ spawn: { ...spawn, raw: spawn.raw.slice(0, 6) } });
  actor.managerPriority = 2;
  actor.switchFlags |= 0x100;
  actor.delaySeconds = typeof spawn.raw[6] === 'number' ? f(spawn.raw[6]) : 0;
  actor.remainingSeconds = 0;
  const basePre = actor.beforeMotion, applyPressed = actor.applyPressedState;
  actor.onSwitchChanged = pressed => { if (pressed) actor.remainingSeconds = actor.delaySeconds; };
  actor.beforeMotion = dt => {
    if (actor.remainingSeconds > 0) {
      actor.remainingSeconds = f(actor.remainingSeconds - f(dt));
      if (actor.remainingSeconds <= 0) {
        actor.publishSwitchState(true);
        actor.switchFlags |= 4;
        actor.remainingSeconds = 0;
      }
    }
    basePre();
  };
  // bb5f7e0/5f830, preserving ordinary snapshot sound/pressed-state ordering.
  actor.readDelayState = () => ({ pressed: actor.readPressedState(), seconds: actor.remainingSeconds });
  actor.applyDelayState = state => {
    applyPressed(state.pressed);
    actor.remainingSeconds = f(state.seconds);
  };
  actor.readDelayLabel = () => {
    if (!(actor.remainingSeconds > 0)) return null;
    const position = nativeActorDisplayPosition(actor);
    return { text: String(Math.trunc(f(actor.remainingSeconds + f(.99)))),
      x: Math.trunc(position.x), y: Math.trunc(f(position.y - 75)),
      fontSize: 32, horizontalAlignment: 2, verticalAlignment: 2, depth: f(-.5) };
  };
  return actor;
}
