import test from 'node:test';
import assert from 'node:assert/strict';
import { nativePlayerHasInputAuthority, nativePlayerHeld, nativePlayerPressed } from './native-player-input.mjs';

const fixture = () => ({ playerIndex: 2, inputEnabled: 1, inputMode: 0,
  scene: { localPlayerIndex: 2, playerInput: { held: (action, slot) => action === 6 && slot === 2,
    pressed: (action, slot) => action === 2 && slot === 2 } },
  replayInput: { current: 1 << 5, previous: 0 },
  aiInput: { held: action => action === 5, pressed: action => action === 6 },
  inputStates: { 2: { current: 4, previous: 0 }, 3: { current: 32, previous: 32 },
    4: { current: 64, previous: 0 }, 5: { current: 4, previous: 4 } } });

test('native input selects system, AI and all four component modes', () => {
  const actor = fixture();
  assert.equal(nativePlayerHeld(actor, 6), true);
  assert.equal(nativePlayerPressed(actor, 2), true);
  actor.inputMode = 1;
  assert.equal(nativePlayerHeld(actor, 5), true);
  assert.equal(nativePlayerPressed(actor, 6), true);
  for (const [mode, action, pressed] of [[2, 2, true], [3, 5, false], [4, 6, true], [5, 2, false]]) {
    actor.inputMode = mode;
    assert.equal(nativePlayerHeld(actor, action), true);
    assert.equal(nativePlayerPressed(actor, action), pressed);
  }
  actor.inputMode = 6;
  assert.equal(nativePlayerHeld(actor, 2), false);
  assert.equal(nativePlayerPressed(actor, 2), false);
});

test('scene replay override and debug right obey disabled input and differ for pressed edges', () => {
  const actor = fixture();
  actor.scene.inputFlags = 8;
  assert.equal(nativePlayerHeld(actor, 5), true);
  assert.equal(nativePlayerPressed(actor, 5), true);
  assert.equal(nativePlayerHeld(actor, 6), false);
  actor.scene.debugForcedRightPlayer = 2;
  assert.equal(nativePlayerHeld(actor, 6), true);
  assert.equal(nativePlayerPressed(actor, 6), false);
  actor.inputEnabled = 0;
  assert.equal(nativePlayerHeld(actor, 6), false);
  assert.equal(nativePlayerPressed(actor, 5), false);
});

test('authority selects host slot0 or client local slot; remote held bits do not generate pressed edges', () => {
  const actor = fixture();
  assert.equal(nativePlayerHasInputAuthority(actor), true);
  actor.networkOwner = {}; actor.scene.networkMode = 2;
  assert.equal(nativePlayerHasInputAuthority(actor), false);
  actor.playerIndex = 0;
  assert.equal(nativePlayerHasInputAuthority(actor), true);
  actor.scene.networkMode = 1;
  actor.remoteHeldBits = 0x70;
  assert.equal(nativePlayerHasInputAuthority(actor), false);
  for (const action of [2, 5, 6]) assert.equal(nativePlayerHeld(actor, action), true);
  assert.equal(nativePlayerPressed(actor, 2), false, 'system input source still owns pressed edge');
  actor.scene.inputFlags = 8;
  assert.equal(nativePlayerPressed(actor, 5), true, 'pressed honors scene override independently');
});

test('remote special-form owner supplies fallback held state only after missing replay bit', () => {
  const actor = fixture();
  actor.networkOwner = {}; actor.scene.networkMode = 1; actor.playerIndex = 0;
  actor.inputMode = 3; actor.specialInputOwner = 2;
  assert.equal(nativePlayerHeld(actor, 5), true);
  assert.equal(nativePlayerHeld(actor, 6), false);
  actor.specialInputOwner = 1;
  assert.equal(nativePlayerHeld(actor, 5), false);
  actor.remoteHeldBits = 0x20;
  assert.equal(nativePlayerHeld(actor, 6), true);
});
