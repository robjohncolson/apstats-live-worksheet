import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody } from './native-body.mjs';
import { createNativeJumpState, nativePlayerJumpVelocity, stepNativePlayerJump } from './native-player-jump.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
const f = Math.fround;
const dt = f(1 / 60);
function fixture() {
  const state = createNativeJumpState(), events = [];
  const options = { body: createNativeBody(), velocity: { x: 3, y: 0 }, dt,
    playSound: sound => events.push(sound), setAnimation: id => events.push(id) };
  options.body.mapContacts.push({ x: 0, y: 1 });
  return { state, options, events };
}

test('jump resets horizontal motion, gets 13 hold boosts, and releases immediately when the button lifts', () => {
  const { state, options, events } = fixture();
  stepNativePlayerJump(state, { ...options, pressed: true });
  assert.deepEqual(options.velocity, { x: 0, y: f(-5.1) });
  assert.equal(state.holdTicks, 1);
  assert.equal(state.jumpStarted, 1);
  assert.deepEqual(events, ['jump', 2]);
  options.body.mapContacts.length = 0;
  for (let i = 1; i <= 13; i++) {
    const old = options.velocity.y;
    stepNativePlayerJump(state, { ...options, held: true });
    assert.ok(options.velocity.y < old);
  }
  assert.equal(state.holdTicks, 14);
  const old = options.velocity.y;
  stepNativePlayerJump(state, { ...options, held: true });
  assert.equal(options.velocity.y, old);
  // An eligible grace tick processes the release branch and clears the hold.
  state.holdTicks = 3;
  stepNativePlayerJump(state, { ...options, held: false });
  assert.equal(state.holdTicks, 0);
});

test('ledge grace allows the crossing-zero tick but not the following one', () => {
  for (const ticks of [5, 6]) {
    const { state, options } = fixture();
    stepNativePlayerJump(state, options);
    options.body.mapContacts.length = 0;
    for (let i = 1; i < ticks; i++) stepNativePlayerJump(state, options);
    stepNativePlayerJump(state, { ...options, pressed: true });
    assert.equal(state.jumpCount, ticks === 5 ? 1 : 0);
  }
});

test('jump cap, air-jump permission and faster upward motion follow separate gates', () => {
  const { state, options } = fixture();
  options.body.mapContacts.length = 0;
  state.jumpCount = 1;
  stepNativePlayerJump(state, { ...options, playerFlags: 2, jumpLimit: 1, pressed: true });
  assert.equal(options.velocity.y, 0);
  options.velocity.y = -8;
  stepNativePlayerJump(state, { ...options, playerFlags: 2, jumpLimit: 2, pressed: true });
  assert.equal(options.velocity.y, -8);
  assert.equal(state.holdTicks, 14);
  assert.equal(state.jumpCount, 2);
});

test('stored DOWN contacts allow a jump even when the other body is no longer registered', () => {
  const { state, options } = fixture();
  options.body.mapContacts.length = 0;
  options.body.contacts.push({ bodyId: 999, normal: { x: 0, y: 1 } });
  assert.equal(hasNativeDirectionalContact(options.body, { x: 0, y: 1 }, false), true);
  stepNativePlayerJump(state, { ...options, pressed: true });
  assert.equal(state.jumpCount, 1);
});

test('ceiling contact routes an impulse without setting free-jump velocity or hold ticks', () => {
  const { state, options, events } = fixture();
  options.body.mapContacts.push({ x: 0, y: -1 });
  let impulse;
  stepNativePlayerJump(state, { ...options, pressed: true, ceilingJump: (...args) => { impulse = args; } });
  assert.deepEqual(impulse, [options.body, f(-5.1), 2]);
  assert.deepEqual(options.velocity, { x: 3, y: 0 });
  assert.equal(state.holdTicks, 0);
  assert.deepEqual(events, ['jump', 2]);
});

test('pending bounce requires support unless its force flag is set', () => {
  for (const [supported, flags, expected] of [[false, 1, 0], [false, 3, -9], [true, 1, -9]]) {
    const { state, options } = fixture();
    if (!supported) options.body.mapContacts.length = 0;
    state.flags = flags; state.bounceVelocity = -9;
    stepNativePlayerJump(state, options);
    assert.equal(options.velocity.y, expected);
    assert.equal(state.bounceVelocity, 0);
    assert.equal(state.flags & 1, 0);
  }
});

test('shrinking changes jump speed while growth preserves ordinary jump speed', () => {
  assert.equal(nativePlayerJumpVelocity(2), f(-5.1));
  assert.ok(Math.abs(nativePlayerJumpVelocity(.5) + 4.59) < 1e-6);
});
