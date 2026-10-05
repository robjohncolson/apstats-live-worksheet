import { nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;
const integer = value => Math.trunc(numeric(value)) | 0;
const text64 = value => String(value).split('\0')[0].slice(0, 63);

// Text ctor bb60150, Lua bb602f0, PRE bb607c0, draw bb60820.
export function createNativeTextActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6);
  let text = typeof params[0] === 'string' ? text64(params[0]) : '';
  text = text64(text.replace('[pl]', String(partySize >>> 0)));
  const token = text.indexOf('[shot]');
  const inverted = integer(params[2]) !== 0;
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: numeric(params[3]), y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    text, fontSize: integer(params[1]) > 0 ? integer(params[1]) : -1,
    textColor: inverted ? 0xffffffff : 0xffff864d, outlineColor: inverted ? 0xffff864d : 0xffffffff,
    outline: integer(params[4]) !== 0, textVisible: true,
    textDepth: integer(params[5]) !== 0 ? f(.1) : f(-.4), lifetime: -1,
    inputAction: token < 0 ? 12 : 11, inputRevision: token < 0 ? 1 : 2,
    // Native bb602f0 copies token LENGTH characters for the prefix, not the
    // match offset. This happens to agree with shipped "PRESS [shot]" text.
    prefix: token > 0 ? text.slice(0, 6) : '', suffix: token < 0 ? '' : text.slice(token + 6),
    onAdded(scene) { actor.scene = scene; refreshInputLabel(); runNativeCommonActorAdded(actor, scene); },
    onRemoved() { actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    onCommand: () => 0,
    setVisible(value) { actor.textVisible = Boolean(value); }, // bb60c20
    beforeMotion(dt) {
      if (actor.lifetime >= 0) {
        actor.lifetime = f(actor.lifetime - f(dt));
        if (actor.lifetime <= 0) markNativeActorForRemoval(actor);
      }
      refreshInputLabel();
    },
    readTextDisplay() {
      const position = nativeActorDisplayPosition(actor);
      return { visible: actor.textVisible, text: actor.text,
        x: Math.trunc(position.x), y: Math.trunc(position.y), fontSize: actor.fontSize,
        horizontalAlignment: actor.inputAction === 12 ? 2 : 0, verticalAlignment: 2,
        color: actor.textColor, outline: actor.outline, outlineColor: actor.outlineColor,
        depth: actor.textDepth, fontKind: actor.inputAction === 12 ? 'pixel' : 'input-label' };
    },
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;

  // bb609a0 refreshes only on an input-mode revision change. Label glyphs are
  // supplied by the input adapter, rather than inventing keyboard bindings.
  function refreshInputLabel() {
    if (actor.inputAction === 12) return;
    const revision = actor.scene.nativeInputLabelRevision ?? 1;
    if (revision === actor.inputRevision) return;
    const label = actor.scene.resolveNativeInputLabel?.(actor.inputAction) ?? '';
    actor.text = text64(actor.prefix + text64(label) + actor.suffix);
    actor.inputRevision = revision;
  }
}
