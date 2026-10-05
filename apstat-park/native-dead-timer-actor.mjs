import { nativeActorDisplayPosition, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;
const secondBoundary = value => Math.trunc(f(value - f(.01))) | 0;
// cvttss2si r32 returns INT_MIN for a non-finite or out-of-range operand.
const displayInteger = value => Number.isFinite(value) && value >= -2147483648 && value < 2147483648
  ? Math.trunc(value) : -2147483648;

// DeadTimer factory bb7564c..bb75682: bb60c50(mode1), expiry action2.
// PRE bb60e10, POST bb610c0, commands bb61130, Lua bb618a0.
// Other subclasses of the native timer are deliberately separate factory work.
export function createNativeDeadTimerActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6);
  let initial = numeric(params[0]);
  if (params.length > 1) initial = f(initial + f(f(partySize >>> 0) * numeric(params[1])));
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: false, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    networkType: 0x23, replicationMode: 1,
    seconds: initial > 0 ? initial : 0, resetValue: 0, previousReplicatedSeconds: 0,
    timerFlags: 0, bonusCount: 0, timeUpSeconds: 0, fontSize: 32,
    spriteFlags: 9, spriteDepth: f(-.5), textDepth: f(-.6),
    spriteBounds: { x: -82, y: -32, width: 164, height: 64 },
    spriteUV: { x: .3125, y: .421875, width: .0400390625, height: .015625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion(dt) {
      const old = actor.seconds;
      const next = actor.timerFlags & 1 ? old : f(old - f(dt));
      actor.seconds = next < 0 ? 0 : next; // maxss preserves its second operand's NaN and signed zero.
      const replica = actor.replication && actor.scene.networkMode === 1;
      if (actor.seconds < 10 && !replica && secondBoundary(old) !== secondBoundary(actor.seconds)) {
        // bc16ab0 suppresses sound during client history replay.
        const scene = actor.scene;
        if (scene.networkMode !== 1 || (((actor.flags & 8) || (actor.historyDelay ?? 0))
            && scene.highestFrame === scene.frame)) scene.playSound('select');
      }
      if (!(Math.abs(actor.seconds) <= 2 ** -23) || (actor.timerFlags & 2)) return;
      if (!replica) {
        // Raw bb60fe6 confirms a null payload, not an integer zero.
        actor.scene.sendCommand(null, 3, null);
        actor.timerFlags |= 4;
        actor.scene.playSound('blip');
        if (actor.networkOwner && actor.scene.networkMode === 2) {
          actor.scene.sendNativeTimerPacket({ transport: 'host', target: 0xff,
            channel: 1, kind: 2, command: 2, value: 0 });
        }
      }
      actor.timerFlags |= 2;
    },
    afterMotion(dt) {
      if (actor.timerFlags & 4) actor.timeUpSeconds = f(actor.timeUpSeconds + f(dt));
      if (actor.fontSize > 32) actor.fontSize = Math.max(32, f(actor.fontSize * f(.98)));
    },
    onCommand(command, value) {
      if (command === 9 && !(actor.timerFlags & 2)) {
        if (value == null) actor.timerFlags |= 1;
        else {
          actor.seconds = f(Math.ceil(f(actor.seconds + f(value >>> 0))));
          actor.bonusCount = (actor.bonusCount + 1) >>> 0;
          actor.fontSize = f(36.8);
        }
      } else if (command === 10) actor.timerFlags &= ~1;
      else if (command === 0x14) {
        // Lua initializes current time only; this constructor field remains zero.
        actor.seconds = actor.resetValue;
        actor.timerFlags &= ~3;
      }
      return 0;
    },
    // bb61220/bb61270 snapshot fields. Transport remains scene-owned.
    readTimerState() {
      return { seconds: actor.seconds, flags: actor.timerFlags & 0xff, bonusCount: actor.bonusCount & 0xffff };
    },
    applyTimerState(state) {
      const seconds = f(state.seconds), bonusCount = state.bonusCount & 0xffff;
      if (secondBoundary(seconds) !== secondBoundary(actor.previousReplicatedSeconds)) actor.scene.playSound('select');
      actor.seconds = seconds; actor.previousReplicatedSeconds = seconds;
      actor.timerFlags = state.flags & 0xffff;
      if ((actor.bonusCount >>> 0) < bonusCount) actor.fontSize = f(36.8);
      actor.bonusCount = bonusCount;
    },
    // bb61320 layout metadata. Font/color binding belongs to the pending renderer.
    readTimerDisplay() {
      const display = nativeActorDisplayPosition(actor), seconds = displayInteger(f(Math.ceil(actor.seconds)));
      const minutes = Math.trunc(seconds / 60), remainder = seconds % 60;
      return { text: `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`,
        x: displayInteger(f(f(display.x - 82) + 82)), y: displayInteger(f(f(display.y - 32) + 32)),
        fontSize: Math.trunc(actor.fontSize) >>> 0, horizontalAlignment: 2, verticalAlignment: 2,
        timeUp: actor.timerFlags & 4 ? { text: 'TIME UP',
          x: displayInteger(f(f(f(1280 / actor.scene.viewScale) * .5) * Math.min(actor.timeUpSeconds, 1))),
          y: displayInteger(f(f(720 / actor.scene.viewScale) * .5)) } : null };
    },
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
