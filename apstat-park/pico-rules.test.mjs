// Level 6 (PICO PARK 1-1) client rules against the relay's own level data. Like the relay's
// tests that import the frontend replica, this imports the sibling relay checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createParkLevel } from '../../curriculum_render/railway-server/apstat-park/levels.mjs';
import { ParkSession } from '../../curriculum_render/railway-server/apstat-park/session.mjs';
import * as R from './pico-rules.mjs';
import { ParkReplica } from './replica.mjs';
import { tintPixel } from './pico-art.mjs';
import { createPicoAudio, SOUND_MUTE_KEY } from './pico-audio.mjs';

const level = createParkLevel(6);
const sprite = (x, y) => ({ x, y, vx: 0, vy: 0 });
const standing = (cx, feet) => R.fromPose({ x: cx - 8, y: feet - 23 });   // board sprite whose body stands there
const progress = (extra = {}) => ({ arrived: [], idle: [], holds: {}, gates: [], latches: {}, lifts: {}, keyHolder: null, doorOpen: false, complete: false, ...extra });

test('pose conversion: one rule, feet on the floor are the same y on both sides', () => {
  assert.deepEqual(R.toPose(sprite(46, 192)), { x: 48, y: 193, vx: 0, vy: 0 });
  assert.deepEqual(R.fromPose({ x: 48, y: 193 }), { x: 46, y: 192 });
  // Board feet = sprite.y + 24 (PICO.bodyH); relay feet = pose.y + 23 (level.body.h).
  for (const y of [192, 168, 144, 72, -48.5]) assert.equal(R.toPose(sprite(0, y)).y + level.body.h, y + 24);
  // Board hitbox x + 2 .. x + 18 is the relay body x .. x + 16.
  assert.equal(R.toPose(sprite(100, 0)).x, 102);
  assert.equal(level.body.w, 16);
  for (const slot of level.spawnSlots) {
    const s = R.fromPose(slot);
    assert.equal(s.y + 24, 216, 'spawn slots stand on the floor');
    assert.deepEqual(R.toPose({ ...s, vx: 0, vy: 0 }), { ...slot, vx: 0, vy: 0 });
  }
  assert.deepEqual(R.bodyOf(level, level.spawnSlots[0]), { cx: 56, feet: 216, w: 16, h: 23 });
});

test('party and active party (online, not arrived, not idle)', () => {
  const state = { online: ['a', 'b', 'c', 'd'], members: ['d', 'a', 'b', 'c'], progress: progress({ arrived: ['b'], idle: ['c'] }) };
  assert.deepEqual(R.partyOf(state), ['a', 'c', 'd']);
  assert.deepEqual(R.activePartyOf(state), ['a', 'd']);
  assert.equal(R.memberIndex(state, 'b'), 2);
  assert.equal(R.colourIndex({ members: Array.from({ length: 10 }, (_, i) => 'm' + i) }, 'm9'), 1, 'colours cycle after 8');
});

test('party-conditional stairs follow the relay data for active parties 1, 4, 5, 6, 7, 8 (and range arrays)', () => {
  const blocks = n => R.solidsFor(level, n).filter(p => p.kind === 'block').map(p => [p.x, p.y]);
  const A = [648, 192], B = [672, 168];
  const inData = (p, n) => [].concat(p.party).some(r => n >= r.min && n <= r.max);
  const stepA = level.platforms.find(p => p.x === 648), stepB = level.platforms.find(p => p.x === 672);
  for (const n of [1, 4, 5, 6, 7, 8, 9, 30]) {
    const expected = [[stepA, A], [stepB, B]].filter(([p]) => inData(p, n)).map(([, at]) => at);
    assert.deepEqual(blocks(n), expected, 'party ' + n);
  }
  // Both forms of `party` are understood.
  assert.equal(R.inRange({ min: 0, max: 4 }, 4), true);
  assert.equal(R.inRange([{ min: 0, max: 4 }, { min: 9, max: 64 }], 5), false);
  assert.equal(R.inRange([{ min: 0, max: 4 }, { min: 9, max: 64 }], 9), true);
  // Tiles and the resting bridge never depend on the party.
  assert.ok(level.platforms.filter(p => !p.party).every(p => R.solidsFor(level, 7).includes(p)));
});

test('a stair appearing around a cat lifts it onto its top', () => {
  const stepB = level.platforms.find(p => p.x === 672);
  const inside = { x: 700, y: 170, vx: 0, vy: 0 };   // pose overlapping step B
  assert.deepEqual(R.snapOntoNew(level, [], [stepB], inside), { x: 700, y: 168 - 23, vx: 0, vy: 0 });
  assert.equal(R.snapOntoNew(level, [stepB], [stepB], inside), null, 'already there: no snap');
  assert.equal(R.snapOntoNew(level, [], [stepB], { x: 500, y: 193, vx: 0, vy: 0 }), null, 'elsewhere');
});

test('bridge extent against the relay clock', () => {
  const gate = level.gates[0];
  assert.deepEqual([gate.extend.from, gate.extend.to, gate.extend.speed, gate.extend.delayMs], [856, 746, 60, 33]);
  assert.equal(R.bridgeLeft(level, progress(), 5000, 1), 746, 'party of one: fully extended');
  assert.equal(R.bridgeLeft(level, progress({ latches: {} }), 5000, 2), 856, 'not latched: resting');
  const latched = progress({ latches: { bridge: 1000 } });
  assert.equal(R.bridgeLeft(level, latched, 1000, 2), 856);
  assert.equal(R.bridgeLeft(level, latched, 1033, 2), 856, 'waits delayMs');
  assert.equal(R.bridgeLeft(level, latched, 1033 + 500, 2), 826);
  assert.equal(R.bridgeLeft(level, latched, 1033 + 1000, 2), 796);
  assert.equal(R.bridgeLeft(level, latched, 1033 + 110 / 60 * 1000, 2), 746);
  assert.equal(R.bridgeLeft(level, latched, 99999, 8), 746, 'stays extended');
  assert.deepEqual(R.bridgeExtension(level, 796), { x: 796, y: 216, w: 60, h: 12, kind: 'bridge-extension' });
  assert.equal(R.bridgeExtension(level, 856), null);
  // Matches the relay's own gate state: latched or party of one.
  const s = new ParkSession({ epoch: 'b', levelIndex: 6, members: ['a', 'b'], now: () => 0 });
  s.setOnline(['a']);
  assert.equal(s.progress.gates.includes('bridge'), R.bridgeLeft(s.level, s.progress, 0, R.activePartyOf({ online: s.online, progress: s.progress }).length) === 746);
});

test('lift position from progress: interpolation, a future `at`, and a block', () => {
  const lift = R.partyLift(level);
  assert.deepEqual([lift.x, lift.w, lift.h, lift.rest], [1222, 92, 9.5, 201.5]);
  const p = state => progress({ lifts: { lift: state } });
  assert.equal(R.liftSurface(level, p({ from: 201.5, to: 105.5, at: 1000, duration: 3200, rate: 30 }), 1000), 201.5);
  assert.equal(R.liftSurface(level, p({ from: 201.5, to: 105.5, at: 1000, duration: 3200, rate: 30 }), 2600), 153.5);
  assert.equal(R.liftSurface(level, p({ from: 201.5, to: 105.5, at: 1000, duration: 3200, rate: 30 }), 9000), 105.5);
  // Resuming after a block: `at` lies in the future, hold at `from` until then.
  const resume = { from: 150, to: 201.5, at: 5067, duration: 51.5 / 30 * 1000, rate: 30 };
  assert.equal(R.liftSurface(level, p(resume), 5000), 150);
  assert.equal(R.liftSurface(level, p(resume), 5067), 150);
  assert.ok(R.liftSurface(level, p(resume), 5567) > 150);
  const blocked = { from: 160, to: 183.5, at: 0, duration: 1000, rate: 30, blocked: true };
  assert.equal(R.liftSurface(level, p(blocked), 99999), 183.5, 'stops at the head');
  assert.equal(R.liftSurface(level, progress(), 0), 201.5, 'no state yet: resting');
  // Riders needed and the panel number.
  assert.deepEqual([1, 2, 5, 8, 30].map(n => R.ridersNeeded(lift, n)), [1, 2, 5, 8, 8]);
  assert.equal(R.liftCountdown(lift, 2, 1), 1);
  assert.equal(R.liftCountdown(lift, 30, 3), 5);
  assert.equal(R.liftCountdown(lift, 2, 3), 0);
  // The local stop: never inside the highest head under it.
  assert.equal(R.liftStopAbove(lift, 190, [192]), 182.5);
  assert.equal(R.liftStopAbove(lift, 150, [192]), 150);
  assert.equal(R.liftStopAbove(lift, 190, [192, 168]), 158.5);
  assert.equal(R.spriteUnderLift(lift, sprite(1240, 192), 150), true);
  assert.equal(R.spriteUnderLift(lift, sprite(1240, 150 - 24), 150), false, 'a rider is not under');
  assert.equal(R.spriteUnderLift(lift, sprite(1180, 192), 150), false, 'beside');
});

test('lift holds and leases match what the relay accepts', () => {
  const lift = R.partyLift(level);
  const s = new ParkSession({ epoch: 'l', levelIndex: 6, members: ['a', 'b', 'c'], now: () => 0 });
  s.setOnline(['a', 'b', 'c']);
  const keys = Object.fromEntries(['a', 'b', 'c'].map(m => [m, s.open(m, 'browser_' + m)]));
  let seq = 0;
  const hold = (m, pose, target = 'lift') => s.command(keys[m], { epoch: s.epoch, level: s.level.id, sequence: ++seq, kind: 'hold', target, active: true, pose: { ...pose, vx: 0, vy: 0 } }).status;
  const seqs = {}; const holdAs = (m, pose, target) => { seq = seqs[m] = (seqs[m] || 0); const r = hold(m, pose, target); seqs[m] = seq; return r; };
  const onTop = R.toPose(standing(1260, 201.5));
  assert.equal(R.liftRiderLevel(level, lift, onTop, 201.5), 0);
  assert.equal(holdAs('a', onTop), 'accepted');
  // One up on a teammate (23 px above): stack level 1, allowed once one other holds.
  const stacked = R.toPose(standing(1262, 201.5 - 23));
  assert.equal(R.liftRiderLevel(level, lift, stacked, 201.5), 1);
  assert.equal(R.liftHoldAllowed(level, lift, stacked, 201.5, ['a'], 'b'), true);
  assert.equal(R.liftHoldAllowed(level, lift, stacked, 201.5, [], 'b'), false);
  assert.equal(holdAs('b', stacked), 'accepted');
  // Stacked but centred past the lift (over the ledge side): never claimed by the client.
  assert.equal(R.liftRiderLevel(level, lift, R.toPose(standing(1320, 201.5 - 23)), 201.5), -1);
  // Under-lift lease: a body on the floor within the span, with the lift above its head.
  const floor = R.toPose(standing(1250, 216));
  assert.equal(R.underLift(level, lift, floor, 150), true);
  assert.equal(R.underLift(level, lift, floor, 201.5), false, 'nobody fits under the resting lift');
  assert.equal(R.underLift(level, lift, R.toPose(standing(1200, 216)), 150), false);
  assert.equal(R.underLift(level, lift, R.toPose(standing(1250, 200)), 150), false, 'feet neither on the floor nor on a stack');
  assert.equal(R.underLift(level, lift, R.toPose(standing(1250, 193)), 120), true, 'one up on a teammate: feet at floor - 23');
});

test('catch zones: respawn above the near side, stacked over teammates still dropping in', () => {
  const [pit1, pit2] = level.catchZones;
  assert.equal(R.catchZoneHit(level, R.toPose(standing(444, 230))), null, 'not yet below the floor line');
  assert.equal(R.catchZoneHit(level, R.toPose(standing(444, 241))), pit1);
  assert.equal(R.catchZoneHit(level, R.toPose(standing(820, 245))), pit2);
  assert.equal(R.catchZoneHit(level, R.toPose(standing(600, 241))), null, 'no pit there');
  assert.deepEqual(R.catchRespawn(level, pit2, 0), { ...pit2.to, vx: 0, vy: 0 });
  assert.deepEqual(R.catchRespawn(level, pit2, 2), { x: pit2.to.x, y: pit2.to.y - 50, vx: 0, vy: 0 });
  assert.equal(R.catchRespawn(level, pit1, 30).y, pit1.to.y - 7 * 25, 'capped at 7');
  const s = new ParkSession({ epoch: 'c', levelIndex: 6, members: ['a'] });
  assert.ok(s.validPose(R.catchRespawn(level, pit1, 30)), 'the highest respawn is still a valid relay pose');
});

test('re-entry resumes at the last safe spot', () => {
  const index = 3;
  assert.deepEqual(R.reentryPose(level, null, index), { ...level.spawnSlots[3], vx: 0, vy: 0 });
  const floor = { x: 500, y: 193, vx: 0, vy: 0 };
  assert.deepEqual(R.reentryPose(level, floor, index), floor, 'floor tile: honoured');
  const bridge = { x: 880, y: 193, vx: 0, vy: 0 };
  assert.deepEqual(R.reentryPose(level, bridge, index), bridge, 'resting bridge: honoured');
  const ledge = { x: 1400, y: 73, vx: 0, vy: 0 };
  assert.deepEqual(R.reentryPose(level, ledge, index), ledge, 'goal ledge: honoured');
  const pit2 = level.catchZones[1].to;
  for (const unsafe of [{ x: 700, y: 145 }, { x: 1250, y: 100 }, { x: 1000, y: 120 }, { x: 790, y: 193 }]) {
    const at = R.reentryPose(level, { ...unsafe, vx: 0, vy: 0 }, index);
    const left = level.checkpoints.filter(c => c.x <= unsafe.x).sort((a, b) => b.x - a.x)[0];
    assert.deepEqual(at, { x: left.x, y: left.y, vx: 0, vy: 0 }, JSON.stringify(unsafe));
  }
  assert.deepEqual(R.reentryPose(level, { x: 700, y: 145, vx: 0, vy: 0 }, 0), { x: pit2.x, y: pit2.y, vx: 0, vy: 0 }, 'on a stair: the pit-2 respawn');
  assert.ok(R.restsOnPermanent(level, floor) && !R.restsOnPermanent(level, { x: 700, y: 145 }));
  assert.deepEqual(R.reentryPose(level, { x: 10, y: 50, vx: 0, vy: 0 }, 2), { ...level.spawnSlots[2], vx: 0, vy: 0 }, 'nothing to the left: spawn slot');
});

test('switch, key and door boxes (published by the relay) and the fresh-press rule', () => {
  const sw = level.switches[0].trigger, key = level.key.pickup;
  assert.equal(R.onSwitch(level, R.toPose(standing(960, 216))), true);
  assert.equal(R.onSwitch(level, R.toPose(standing(960 + sw.halfWidth, 212))), true);
  assert.equal(R.onSwitch(level, R.toPose(standing(960 + sw.halfWidth + 1, 216))), false);
  assert.equal(R.onSwitch(level, R.toPose(standing(960, 211))), false, 'too high');
  assert.equal(R.atKey(level, R.toPose(standing(1176, 100))), true);
  assert.equal(R.atKey(level, R.toPose(standing(1176 - key.halfWidth, key.feetMax))), true);
  assert.equal(R.atKey(level, R.toPose(standing(1176, 133))), false);
  assert.equal(R.atKey(level, R.toPose(standing(1192, 100))), false);
  // Every pose inside a box is within the relay's reach of its anchor.
  for (const [cx, feet] of [[1161, 82.7], [1191, 132], [946, 212], [974, 216]]) {
    const pose = R.toPose(standing(cx, feet)), anchor = cx > 1000 ? level.key : level.switches[0];
    assert.ok(R.withinReach(level, pose, anchor), cx + ',' + feet);
  }
  // Door: the key's centre at unlockKeyX trails a holder whose centre is 8 further right.
  const holder = R.toPose(standing(1428, 96));
  const settled = R.keyTarget(level, holder, true);
  assert.equal(settled.x, 1420);
  assert.equal(R.keyUnlocks(level, settled), true);
  assert.equal(R.keyUnlocks(level, { x: 1419.9, y: 0 }), false);
  assert.ok(R.withinReach(level, holder, level.goal));
  assert.deepEqual(R.keyHome(level), { x: 1176, y: 96 });
  let k = R.keyHome(level);
  for (let i = 0; i < 120; i++) k = R.stepKey(k, settled);
  assert.ok(Math.abs(k.x - 1420) < 0.01, 'the trailing key settles behind the holder');
  // Entry: open door, fresh press, centre in range, feet on the ledge.
  const open = progress({ doorOpen: true });
  const atDoor = R.toPose(standing(1440, 96));
  assert.equal(R.canEnterDoor(level, open, atDoor, true), true);
  assert.equal(R.canEnterDoor(level, progress(), atDoor, true), false, 'closed');
  assert.equal(R.canEnterDoor(level, open, atDoor, false), false, 'not a fresh press');
  assert.equal(R.canEnterDoor(level, open, R.toPose(standing(1420, 96)), true), false, 'centre left of cxMin');
  assert.equal(R.canEnterDoor(level, open, R.toPose(standing(1456, 96)), true), true);
  assert.equal(R.canEnterDoor(level, open, R.toPose(standing(1440, 80)), true), false, 'in the air');
  assert.ok(R.withinReach(level, atDoor, level.goal));
  // Holding Up through the opening does not enter: only the press edge counts.
  const edge = R.createPressEdge();
  const frames = [[true, false], [true, false], [true, true], [true, true], [false, true], [true, true]];
  const entered = frames.map(([up, doorOpen]) => R.canEnterDoor(level, progress({ doorOpen }), atDoor, edge(up)));
  assert.deepEqual(entered, [false, false, false, false, false, true]);
});

test('replica keeps latches and idle (protocol 5 events)', () => {
  const r = new ParkReplica({ now: () => 0 });
  const s = new ParkSession({ epoch: 'r', levelIndex: 6, members: ['a'], now: () => 0 });
  s.setOnline(['a']);
  const key = s.open('a', 'browser_a');
  r.resume({ ...s.resume(key), groupId: 'x', member: 'a', clientId: 'browser_a' });
  assert.deepEqual(r.state.progress.latches, {});
  assert.equal(r.event({ epoch: 'r', revision: r.revision + 1, kind: 'mechanisms', gates: ['bridge'], lifts: r.state.progress.lifts, bridgeOpen: true, latches: { bridge: 1234 } }), true);
  assert.deepEqual(r.state.progress.latches, { bridge: 1234 });
  assert.equal(r.event({ epoch: 'r', revision: r.revision + 1, kind: 'idle', idle: ['b'] }), true);
  assert.deepEqual(r.state.progress.idle, ['b']);
  assert.equal(r.needsResume, false, 'idle is a known event, no forced resume');
  // A legacy mechanisms event (no latches) leaves the field alone.
  r.event({ epoch: 'r', revision: r.revision + 1, kind: 'mechanisms', gates: [], lifts: {}, bridgeOpen: false });
  assert.deepEqual(r.state.progress.latches, { bridge: 1234 });
});

test('tile codes, colours and the tint formula', () => {
  assert.equal(R.tileCodeAt(level, 0, 0), 'A');
  assert.equal(R.tileCodeAt(level, 1, 9), 'C');
  assert.equal(R.tileCodeAt(level, 1, 8), 'N');
  assert.equal(R.tileCodeAt(level, 61, 0), 'W');
  assert.equal(R.tileCodeAt(level, 99, 0), 'N');
  assert.deepEqual(Object.keys(level.tiles.codes).sort(), ['A', 'C', 'I', 'L', 'N', 'R', 'W']);
  // rgb = r*C + b*C*0.7 + g
  assert.deepEqual(tintPixel(255, 0, 0, '#ff8c8c'), [255, 140, 140]);
  assert.deepEqual(tintPixel(0, 0, 255, '#7fbfff'), [89, 134, 179]);
  assert.deepEqual(tintPixel(0, 255, 0, '#7fbfff'), [255, 255, 255]);
  assert.deepEqual(tintPixel(0, 0, 0, '#ffff8c'), [0, 0, 0]);
});

test('sound: gated by the site mute and a user gesture, never throws', () => {
  const played = [];
  const store = new Map();
  function Audio(src) { this.src = src; }
  Audio.prototype.play = function () { played.push(this.src); return Promise.resolve(); };
  const listeners = {};
  const win = { localStorage: { getItem: k => store.get(k) ?? null }, navigator: {}, Audio,
    addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
  const audio = createPicoAudio(win);
  assert.equal(audio.play('jump'), false, 'no gesture yet');
  listeners.keydown();
  assert.equal(audio.play('jump'), true);
  assert.match(played[0], /assets\/pico-jump\.ogg$/);
  store.set(SOUND_MUTE_KEY, 'true');
  assert.equal(audio.play('jump'), false, 'muted on the calendar');
  store.set(SOUND_MUTE_KEY, 'false');
  Audio.prototype.play = () => { throw new Error('no audio device'); };
  assert.equal(audio.play('key'), false);
  assert.equal(createPicoAudio(undefined).play('jump'), false);
  audio.dispose();
});

// ---- Review fixes ----
test('a k-high stack under the lift (board cats 23 apart) is a lease the relay accepts, k = 0..7', () => {
  const lift = R.partyLift(level);
  for (let k = 0; k <= 7; k++) {
    const s = new ParkSession({ epoch: 'u', levelIndex: 6, members: ['a', 'b'], now: () => 0 });
    s.setOnline(['a', 'b']);
    s.progress.lifts.lift = { from: 0, to: 201.5, at: 0, duration: 1e9, rate: 30 };   // descending, still high
    const key = s.open('a', 'browser_a');
    const sprite = { x: 1248, y: 192 - 23 * k };                                       // feet on the cat below
    const pose = { ...R.toPose(sprite), vx: 0, vy: 0 };
    const surface = s.valueAt(s.progress.lifts.lift);
    assert.equal(R.underLift(level, lift, pose, surface), true, 'client rule, k=' + k);
    const r = s.command(key, { epoch: s.epoch, level: s.level.id, sequence: 1, kind: 'hold', target: 'lift-under', active: true, pose });
    assert.equal(r.status, 'accepted', 'relay, k=' + k + ' ' + (r.reason || ''));
    // And a stack level on the lift agrees with the relay's rider rule.
    const rider = R.toPose({ x: 1248, y: R.riderSpriteY(150, k) });
    assert.equal(R.liftRiderLevel(level, lift, rider, 150), Math.min(k, lift.stack.max));
  }
  // The old 24 px spacing was refused from k = 4 (3.000...03 px off): the regression.
  const s = new ParkSession({ epoch: 'v', levelIndex: 6, members: ['a'], now: () => 0 });
  s.setOnline(['a']);
  s.progress.lifts.lift = { from: 0, to: 201.5, at: 0, duration: 1e9, rate: 30 };
  const r = s.command(s.open('a', 'browser_a'), { epoch: s.epoch, level: s.level.id, sequence: 1, kind: 'hold', target: 'lift-under', active: true,
    pose: { ...R.toPose({ x: 1248, y: 192 - 24 * 4 }), vx: 0, vy: 0 } });
  assert.equal(r.status, 'rejected');
});

test('the "you" marker sits over your head, or over the key you carry', () => {
  assert.deepEqual(R.ownMarker({ x: 100, y: 192 }), { x: 110, y: 189 });
  const key = { x: 102, y: 185 };   // trailing key centre (12 px above its bottom)
  assert.deepEqual(R.ownMarker({ x: 100, y: 192 }, key), { x: 110, y: 168 });
  assert.ok(R.ownMarker({ x: 100, y: 192 }, key).y <= key.y - 14 - 3, 'tip clear of the key art');
});

test('PARK_UPDATE_REQUIRED: an old relay says "updating", an old page says "reload"', async () => {
  const { updateMessage, PARK_RELAY_OLD, PARK_CLIENT_OLD } = await import('./panel.mjs');
  const seven = Array.from({ length: 7 }, (_, levelIndex) => ({ levelIndex, online: [] }));
  assert.equal(updateMessage(seven.slice(0, 6), 6), PARK_RELAY_OLD, 'a relay with six levels predates level 6');
  assert.equal(updateMessage(null, 6), PARK_RELAY_OLD, 'no lobby answer: assume the relay');
  assert.equal(updateMessage(seven, 6), PARK_CLIENT_OLD, 'the relay knows level 6: this page is old');
  assert.match(PARK_RELAY_OLD, /few minutes/); assert.match(PARK_CLIENT_OLD, /Reload/);
});

test('park modules, art and sounds carry the board build stamp', async () => {
  const atlas = await import('./assets/pico-atlas.mjs?v=2026-10-03-test');
  assert.match(atlas.ATLAS_URL, /pico-1-1\.png\?v=2026-10-03-test$/);
  const audio = await import('./pico-audio.mjs?v=2026-10-03-test');
  assert.match(audio.soundUrl('jump'), /assets\/pico-jump\.ogg\?v=2026-10-03-test$/);
  const { readFileSync } = await import('node:fs');
  for (const file of ['panel.mjs', 'replica.mjs', 'board-scene.mjs', 'pico-scene.mjs', 'pico-art.mjs', 'pico-audio.mjs']) {
    const src = readFileSync(new URL('./' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import .* from '\.\//m, file + ': no unversioned static import');
    assert.match(src, /const V = new URL\(import\.meta\.url\)\.search;/, file);
  }
  const board = readFileSync(new URL('../classroom-board.js', import.meta.url), 'utf8');
  assert.match(board, /import\('\.\/apstat-park\/panel\.mjs' \+ parkBuildQuery\(\)\)/);
  assert.match(board, /root\.APP_BUILD/);
});
