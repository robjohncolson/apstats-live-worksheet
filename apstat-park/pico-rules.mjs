// Level 6 (PICO PARK 1-1, half scale) rules shared by the scene and its tests. Pure functions:
// no DOM, no clock of their own. The relay (railway-server/apstat-park/levels.mjs, session.mjs)
// is the authority; these mirror its published level data so the relay accepts what we send.

// ---- One conversion between the board sprite and the relay pose ----
// Board sprite: top-left of the 20x24 cat; the `pico` hitbox is 16 wide at x+2, feet at y+24.
// Relay pose: top-left of the 16x23 body, feet at y+23. Matching x and feet gives (x+2, y+1):
// a cat standing on the floor (sprite y 192, feet 216) is pose y 193, feet 216 on both sides.
// The extra board pixel is the top of the head.
export const POSE_DX = 2, POSE_DY = 1;
export function toPose(sprite) {
  return { x: sprite.x + POSE_DX, y: sprite.y + POSE_DY, vx: sprite.vx || 0, vy: sprite.vy || 0 };
}
export function fromPose(pose) {
  return { x: pose.x - POSE_DX, y: pose.y - POSE_DY };
}
const BODY = { w: 16, h: 23 };
export const bodyOf = (level, pose) => {
  const body = level?.body || BODY;
  return { cx: pose.x + body.w / 2, feet: pose.y + body.h, w: body.w, h: body.h };
};

// ---- Party ----
// A `party` field is one {min,max} range or an array of them (present in any range).
export const inRange = (range, n) => Array.isArray(range) ? range.some(r => inRange(r, n)) : n >= range.min && n <= range.max;
// Party = online members who have not arrived; the active party also leaves out idle members.
export function partyOf(state) {
  const arrived = state?.progress?.arrived || [];
  return (state?.online || []).filter(name => !arrived.includes(name));
}
export function activePartyOf(state) {
  const idle = state?.progress?.idle || [];
  return partyOf(state).filter(name => !idle.includes(name));
}
// Stable member order: spawn slot and colour.
export function memberIndex(state, member) {
  return Math.max(0, (state?.members || []).indexOf(member));
}
export const colourIndex = (state, member) => memberIndex(state, member) % 8;

// ---- Terrain ----
// Platforms with a `party` field exist only while the ACTIVE party is in range (the stairs).
// Callers pass activePartyOf(state).length: idle members and arrivals change the geometry too.
export function solidsFor(level, party) {
  return level.platforms.filter(p => !p.party || inRange(p.party, party));
}
// A body that a newly present platform appeared around stands on its top.
export function snapOntoNew(level, before, after, pose) {
  const body = bodyOf(level, pose);
  for (const p of after) {
    if (before.includes(p)) continue;
    if (pose.x + body.w > p.x && pose.x < p.x + p.w && body.feet > p.y && pose.y < p.y + p.h) return { ...pose, y: p.y - body.h, vy: 0 };
  }
  return null;
}

// Relay scene-clock interpolation of a {from,to,at,duration} state; `at` may lie in the
// future (a lift resuming after a block): hold at `from` until then.
export function stateValue(state, clock) {
  if (!state) return null;
  const t = state.duration ? Math.min(1, Math.max(0, (clock - state.at) / state.duration)) : 1;
  return state.from + (state.to - state.from) * t;
}

// ---- Bridge ----
// Resting segment is a level platform (kind 'bridge'). The gate's extension grows leftwards
// from extend.from to extend.to at extend.speed px/s, starting delayMs after the latch. An ACTIVE
// party of one sees it fully extended (party = activePartyOf(state).length).
export function bridgeLeft(level, progress, clock, party) {
  const gate = level.gates.find(item => item.id === 'bridge' && item.extend);
  if (!gate) return null;
  const { from, to, speed, delayMs = 0 } = gate.extend;
  if (gate.party && inRange(gate.party, party)) return to;
  const at = progress?.latches?.[gate.latch?.[0] ?? 'bridge'];
  if (at == null) return from;
  return Math.min(from, Math.max(to, from - speed * (clock - at - delayMs) / 1000));
}
// The solid under the extension only (the resting platform stays in level.platforms).
export function bridgeExtension(level, left) {
  const gate = level.gates.find(item => item.id === 'bridge' && item.extend);
  if (!gate || left == null || left >= gate.extend.from) return null;
  const t = gate.terrain[0];
  return { x: left, y: t.y, w: gate.extend.from - left, h: t.h, kind: 'bridge-extension' };
}

// ---- Lift ----
export const partyLift = level => (level.weightedLifts || []).find(item => item.perParty) || null;
export function liftSurface(level, progress, clock) {
  const lift = partyLift(level);
  if (!lift) return null;
  const value = stateValue(progress?.lifts?.[lift.id], clock);
  return value == null ? lift.rest : value;
}
export function ridersNeeded(lift, activeCount) {
  return Math.max(1, Math.min(lift.perParty.cap, activeCount));
}
// The number shown on the lift's panel: riders still missing.
export function liftCountdown(lift, activeCount, riders) {
  return Math.max(0, ridersNeeded(lift, activeCount) - riders);
}
// Relay rider rule (session.mjs 'hold' on a stacking lift): stack level k = round((surface -
// feet)/h) capped at stack.max; the body overlaps the lift widened by k*slack; feet + k*h within
// 16 of the surface. Returns k, or -1 when the relay would reject the hold.
// Stricter than the relay on purpose: a stacked rider (k >= 1) must have its centre over the lift's
// span (the relay is tightening its slack so the goal ledge is excluded).
export function liftRiderLevel(level, lift, pose, surface) {
  const body = bodyOf(level, pose);
  const k = lift.stack ? Math.min(lift.stack.max, Math.max(0, Math.round((surface - body.feet) / body.h))) : 0;
  const slack = k * (lift.stack?.slack ?? 0);
  const over = pose.x + body.w > lift.x - slack && pose.x < lift.x + lift.w + slack
    && (k === 0 || body.cx >= lift.x && body.cx <= lift.x + lift.w);
  return over && Math.abs(body.feet + k * body.h - surface) < 16 ? k : -1;
}
// The relay also refuses a k-high rider unless k other members already hold the lift.
export function liftHoldAllowed(level, lift, pose, surface, holders, member) {
  const k = liftRiderLevel(level, lift, pose, surface);
  return k >= 0 && (holders || []).filter(name => name !== member).length >= k;
}
// Relay under-lift rule: within the lift's span, the head below its surface (- 2), and the feet on
// the floor or on a k-high stack on it (feet = floor - h*k within 3 px, k <= stack.max).
export function underLift(level, lift, pose, surface) {
  const body = bodyOf(level, pose);
  if (!(pose.x + body.w > lift.x && pose.x < lift.x + lift.w && pose.y >= surface - 2)) return false;
  if (lift.floor == null) return true;
  const k = (lift.floor - body.feet) / body.h, whole = Math.round(k);
  return whole >= 0 && whole <= (lift.stack?.max ?? 0) && Math.abs(k - whole) * body.h <= 3;
}
// Locally a descending lift stops on the highest head under it (board hitbox top), never inside
// it. `heads` are the tops of bodies under the lift (spriteUnderLift).
export function liftStopAbove(lift, surface, heads) {
  let stop = surface;
  for (const head of heads) if (head - lift.h < stop) stop = head - lift.h;
  return stop;
}
// Is a board sprite (20x24; hitbox x+2..x+18, head y+1) under the lift: in its span with its head
// no more than 4 px above the lift's underside? `surface` is the lift as last drawn, so a stop holds
// even while the relay has not heard about it yet, and riders (head 23 above the surface) never count.
export function spriteUnderLift(lift, sprite, surface) {
  return sprite.x + POSE_DX + 16 > lift.x && sprite.x + POSE_DX < lift.x + lift.w && sprite.y + POSE_DY >= surface + lift.h - 4;
}
// The "you" marker: a small downward triangle whose tip sits 3 px above your cat's head, or above
// the key while you carry it (the key trails over your head). Returns the tip.
export function ownMarker(sprite, carriedKey = null) {
  const x = sprite.x + 10, overHead = sprite.y - 3;
  if (!carriedKey) return { x, y: overHead };
  return { x, y: Math.min(overHead, carriedKey.y - 14 - 3) };
}
// Board sprite y of a cat standing k bodies up on the lift: feet at surface - 23k.
export const riderSpriteY = (surface, k) => surface - 24 - 23 * k;

// ---- Trigger boxes (published by the relay; body centre x and feet) ----
export function inTrigger(level, box, pose) {
  if (!box) return false;
  const body = bodyOf(level, pose);
  return Math.abs(body.cx - box.cx) <= box.halfWidth && body.feet >= box.feetMin && body.feet <= box.feetMax;
}
export const onSwitch = (level, pose) => inTrigger(level, level.switches[0]?.trigger, pose);
export const atKey = (level, pose) => inTrigger(level, level.key?.pickup, pose);
// Entry needs the door open, a FRESH up-press (the caller passes the press edge), the centre in
// enter.cxMin..cxMax and the feet on the ledge (goal feet).
export function canEnterDoor(level, progress, pose, freshPress) {
  if (!freshPress || !progress?.doorOpen || !level.goal?.enter) return false;
  const body = bodyOf(level, pose), goalFeet = level.goal.y + body.h;
  return body.cx >= level.goal.enter.cxMin && body.cx <= level.goal.enter.cxMax && Math.abs(body.feet - goalFeet) < 0.5;
}
// Rising edge of a held key: true only on the frame it goes down.
export function createPressEdge(initial = false) {
  let held = initial;
  return pressed => { const fresh = pressed && !held; held = !!pressed; return fresh; };
}
// The relay's distance check for key/unlock/arrive anchors.
export const withinReach = (level, pose, anchor) => Math.hypot(pose.x - anchor.x, pose.y - anchor.y) <= (level.reach ?? 24);

// ---- Key ----
// The key's resting centre is the centre of its published body; it trails `trail` px behind its
// holder's centre and above the head, and unlocks the door once its centre x reaches unlockKeyX.
export function keyHome(level) {
  const body = bodyOf(level, level.key);
  return { x: body.cx, y: level.key.y + body.h / 2 };
}
export function keyTarget(level, holderPose, facingRight) {
  const body = bodyOf(level, holderPose), trail = level.key.trail ?? 8;
  return { x: body.cx - (facingRight ? trail : -trail), y: holderPose.y - trail };
}
// One fixed frame of the key easing toward its target (exponential, ~8 frames).
export function stepKey(key, target, rate = 0.125) {
  return { x: key.x + (target.x - key.x) * rate, y: key.y + (target.y - key.y) * rate };
}
export const keyUnlocks = (level, key) => key.x >= level.goal.unlockKeyX;

// ---- Falling: catch zones ----
export function catchZoneHit(level, pose) {
  const body = bodyOf(level, pose);
  return (level.catchZones || []).find(z => pose.x + body.w > z.x && pose.x < z.x + z.w && body.feet > z.y && pose.y < z.y + z.h) || null;
}
// Respawn above the zone's landing spot, one catchStack higher per other party member who is
// still dropping in from above the screen (pose y < 0), at most 7. No velocity is kept.
export function catchRespawn(level, zone, othersAbove) {
  const stack = Math.min(7, Math.max(0, othersAbove | 0));
  return { x: zone.to.x, y: zone.to.y - (level.catchStack ?? 25) * stack, vx: 0, vy: 0 };
}

// ---- Spawn and re-entry ----
export function spawnPose(level, index) {
  const slots = level.spawnSlots?.length ? level.spawnSlots : [level.spawn];
  return { ...slots[index % slots.length], vx: 0, vy: 0 };
}
// A saved pose is safe when its feet rest on a platform with no `party` field (tiles or the
// resting bridge): those never disappear.
export function restsOnPermanent(level, pose) {
  const body = bodyOf(level, pose);
  return level.platforms.some(p => !p.party && Math.abs(body.feet - p.y) < 0.5 && pose.x + body.w > p.x && pose.x < p.x + p.w);
}
// Re-entry: the saved pose if it is safe, else the nearest checkpoint to its left, else the
// member's spawn slot.
export function reentryPose(level, saved, index) {
  if (!saved || !['x', 'y'].every(key => Number.isFinite(saved[key]))) return spawnPose(level, index);
  if (restsOnPermanent(level, saved)) return { x: saved.x, y: saved.y, vx: 0, vy: 0 };
  let best = null;
  for (const point of level.checkpoints || []) if (point.x <= saved.x && (!best || point.x > best.x)) best = point;
  return best ? { x: best.x, y: best.y, vx: 0, vy: 0 } : spawnPose(level, index);
}

// ---- Tiles ----
// level.tiles.columns: one string per column, top row first.
export function tileCodeAt(level, col, row) {
  const column = level.tiles?.columns?.[col];
  return column ? column[row] || 'N' : 'N';
}

// ---- Page background ----
// The calendar strip's canvas is transparent: what shows is the first ancestor with a background
// colour. The level paints that same colour, so entering or leaving it never flashes.
export function isOpaqueColour(colour) {
  if (typeof colour !== 'string' || !colour || colour === 'transparent') return false;
  const m = /^rgba?\(([^)]*)\)$/i.exec(colour.trim());
  if (!m) return true;
  const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]) > 0;
}
export function pageBackground(start, getStyle, body = null, fallback = '#ffffff') {
  const colourOf = el => { try { return getStyle(el)?.backgroundColor; } catch { return null; } };
  for (let el = start; el; el = el.parentElement) {
    const colour = colourOf(el);
    if (isOpaqueColour(colour)) return colour;
  }
  const colour = body ? colourOf(body) : null;
  return isOpaqueColour(colour) ? colour : fallback;
}

// ---- Cat colours ----
// The calendar has always tinted each student's cat by rotating the hue of the pink cat
// (#ff8c8c) with the canvas `hue-rotate()` filter (the CSS/SVG feColorMatrix hueRotate matrix in
// sRGB, which is what Chrome applies). The body colour C that reproduces it is that matrix applied
// to #ff8c8c; the game's tint formula then gives the outline (0.7 C), highlight and eyes.
// classroom-board.js carries the same function (catBodyForHue) for the calendar strip.
export const CAT_BASE = [255, 140, 140];
export function hueRotate(rgb, hue) {
  const r = (Number(hue) || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const m = [[0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
             [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
             [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]];
  return m.map(row => Math.max(0, Math.min(255, Math.round(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))));
}
export const catBodyForHue = hue => hueRotate(CAT_BASE, typeof hue === 'number' && isFinite(hue) ? Math.round(hue) : 0);
export const rgbHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
// A park sprite's colour: the student's calendar hue when known, else the 8-colour game table.
export function catColour(sprite, state, member, table) {
  if (sprite && typeof sprite.hue === 'number' && isFinite(sprite.hue)) return rgbHex(catBodyForHue(sprite.hue));
  return table[colourIndex(state, member) % table.length];
}
