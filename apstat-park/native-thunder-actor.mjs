import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { scaledNativeBounds } from './native-body-support.mjs';
import { sweepNativeMap } from './native-map-collision.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;
const DIRECTIONS = [{ x: 0, y: -2400 }, { x: 0, y: 2400 }, { x: -2400, y: 0 }, { x: 2400, y: 0 }];
const BOUNDS = [
  { x: -2, y: -2400, width: 4, height: 2400 },
  { x: -2, y: 0, width: 4, height: 2400 },
  { x: -2400, y: -2, width: 2400, height: 4 },
  { x: 0, y: -2, width: 2400, height: 4 },
];

// bb4d220/330, raw bb4d600 PRE, bb4d850 POST and bb4da00 overlap.
// The full sensor collects contacts; a separate square probes the tile map.
export function createNativeThunderActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const direction = integer(params[0]);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), isNativeThunder: true,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    direction, thunderFlags: (integer(params[1]) ? 2 : 0) | (integer(params[2]) ? 4 : 0),
    beamLength: 0, previousBeamLength: 0, maximumBeamLength: 0,
    animationSeconds: 0, animationFrame: 0, currentHits: 0, previousHits: 0, olderHits: 0,
    candidates: [], spriteFlags: 8, spriteDepth: integer(params[1]) ? 0 : f(-.4),
    spriteBounds: integer(params[1]) ? null : { x: -16, y: -8, width: 32, height: 8 },
    spriteUV: integer(params[1]) ? null : { x: .1875, y: .42578125, width: .015625, height: .00390625 },
    spriteAngle: [0, 0x8000, 0xc000, 0x4000][direction] ?? 0, beamDepth: f(.3),
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion(dt) {
      if (!(actor.thunderFlags & 1)) {
        const probe = actor.mapProbe;
        probe.position = { ...actor.position }; probe.previousPosition = { ...actor.position }; probe.flags &= ~0x40;
        const { movement } = sweepNativeMap(actor.scene.bodyWorld.map, probe, DIRECTIONS[direction] ?? { x: 0, y: 0 });
        const length = f(Math.sqrt(f(f(movement.x * movement.x) + f(movement.y * movement.y))));
        actor.maximumBeamLength = f(length + localBounds(probe).width);
        actor.beamLength = actor.maximumBeamLength;
        if (!(actor.thunderFlags & 4)) probe.flags &= ~1;
        actor.thunderFlags |= 1;
      }
      actor.animationSeconds = f(actor.animationSeconds + f(dt));
      if (actor.animationSeconds > f(.1)) {
        actor.animationFrame = actor.animationFrame ? 0 : 1;
        actor.animationSeconds = 0;
      }
      actor.olderHits = actor.previousHits; actor.previousHits = actor.currentHits; actor.currentHits = 0;
      actor.previousBeamLength = actor.beamLength; actor.beamLength = actor.maximumBeamLength;
      actor.candidates.length = 0;
    },
    afterMotion() {
      if (actor.scene.networkMode === 1) return;
      const beam = actor.getBeamBounds();
      for (const player of actor.candidates) {
        const body = player.bodies[0]?.body;
        if (!body || body.shape !== 0 || !overlaps(beam, worldBounds(body))) continue;
        const bit = 1 << (player.playerIndex & 31);
        actor.currentHits |= bit;
        // Native tests the ENTIRE older mask, not merely this player's bit.
        if ((actor.previousHits & bit) && actor.olderHits === 0) player.onCommand(5);
      }
    },
    getBeamBounds() {
      const bounds = worldBounds(actor.body);
      if (direction === 0) bounds.y = f(f(2400 - actor.beamLength) + bounds.y);
      if (direction === 2) bounds.x = f(f(2400 - actor.beamLength) + bounds.x);
      if (direction === 0 || direction === 1) bounds.height = actor.beamLength;
      if (direction === 2 || direction === 3) bounds.width = actor.beamLength;
      return bounds;
    },
    // bb4dc10: local upward strips, transformed by spriteAngle at draw time.
    getBeamStrips() {
      const count = f(actor.beamLength * .03125), last = Math.trunc(count) >>> 0;
      const fraction = f(count % 1), strips = [];
      for (let index = 0; index <= last; index++) {
        const height = index === last ? f(fraction * 32) : 32;
        const uvHeight = index === last ? f(.03125 * fraction) : .03125;
        strips.push({ bounds: { x: -16, y: f(-5 - f(f(index * 32) + height)), width: 32, height: f(height + 1) },
          uv: { x: actor.animationFrame ? .1875 : .15625, y: f(f(.03125 - uvHeight) + .390625), width: .03125, height: uvHeight } });
      }
      return strips;
    },
  };
  actor.body = createNativeActorRectangle(actor, BOUNDS[direction] ?? { x: 0, y: 0, width: 0, height: 0 }, 0, true);
  actor.body.category = 5;
  actor.mapProbe = createNativeActorRectangle(actor, { x: -16, y: -16, width: 32, height: 32 }, actor.thunderFlags & 2 ? 2 : 3, true);
  actor.body.onOverlap = other => {
    const recipient = other.actor;
    // Native RTTI c62a102 identifies the separate MagnetPlayer companion.
    if (recipient?.isNativeThunder || recipient?.isNativeMagnetCompanion) return;
    if (actor.scene.players.includes(recipient)) {
      if (actor.candidates.length < 10) actor.candidates.push(recipient);
      return;
    }
    if (actor.thunderFlags & 2) return;
    const bounds = worldBounds(other);
    if (!overlaps(actor.getBeamBounds(), bounds)) return;
    let length;
    if (direction === 0) length = f(f(bounds.y + bounds.height) - actor.position.y);
    else if (direction === 1) length = f(bounds.y - actor.position.y);
    else if (direction === 2) length = f(f(bounds.x + bounds.width) - actor.position.x);
    else if (direction === 3) length = f(bounds.x - actor.position.x);
    else return;
    actor.beamLength = Math.abs(length);
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}

function localBounds(body) { return scaledNativeBounds(body.rawBounds, body.scale, body.pivot); }
function worldBounds(body) {
  const bounds = localBounds(body);
  return { ...bounds, x: f(bounds.x + body.position.x), y: f(bounds.y + body.position.y) };
}
function overlaps(a, b) {
  return a.x < f(b.x + b.width) && b.x < f(a.x + a.width)
    && a.y < f(b.y + b.height) && b.y < f(a.y + a.height);
}
