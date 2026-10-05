import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveNativePlayerCommand } from './native-player-command.mjs';
import { createNativeWalkController } from './native-walk-controller.mjs';

test('dispatcher passes movement commands to the real walking controller but intercepts accepted damage', () => {
  const actor = { scene: {}, health: 1, playerFlags: 8, velocity: { x: 0, y: 0 }, components: [],
    playerIndex: 3, controller: createNativeWalkController() };
  assert.equal(receiveNativePlayerCommand(actor, 1, { x: 7, y: -9 }), 0);
  assert.equal(actor.controller.state.forcedX, 7);
  assert.equal(actor.controller.state.bounceVelocity, -9);
  assert.equal(receiveNativePlayerCommand(actor, 0x1f), 4);
  actor.playerIndex = 10;
  assert.equal(receiveNativePlayerCommand(actor, 0x1f), 10);
  assert.equal(receiveNativePlayerCommand(actor, 0x1e, 1), 1);
  assert.equal(actor.controller.state.flags & 8, 8);
  assert.equal(receiveNativePlayerCommand(actor, 3, 1), 1);
  assert.equal(actor.fallState, 3);
});

test('input lock count, invulnerability and form effects precede controller dispatch', () => {
  const events = [];
  const actor = { scene: {}, inputEnabled: 2, defaultInputEnabled: 2, playerFlags: 8,
    inputMode: 2, jumpLimit: 3, formInput: { receive: command => events.push(['form', command]) },
    specialInput: { receive: command => events.push(['special', command]) },
    controller: { receive: (_actor, command) => { events.push(['controller', command, actor.inputEnabled]); return 7; } } };
  for (let i = 0; i < 3; i++) assert.equal(receiveNativePlayerCommand(actor, 0x1a), 7);
  assert.equal(actor.inputEnabled, 0);
  for (let i = 0; i < 3; i++) receiveNativePlayerCommand(actor, 0x1b);
  assert.equal(actor.inputEnabled, 2);
  actor.inputEnabled = 0;
  receiveNativePlayerCommand(actor, 0x14);
  assert.equal(actor.inputEnabled, 2);
  receiveNativePlayerCommand(actor, 0x27);
  assert.equal(actor.playerFlags, 0x88);
  receiveNativePlayerCommand(actor, 0x27, 0);
  assert.equal(actor.playerFlags, 8);
  events.length = 0;
  receiveNativePlayerCommand(actor, 9);
  assert.deepEqual(events, [['form', 9], ['controller', 9, 2]]);
  actor.inputMode = 3;
  receiveNativePlayerCommand(actor, 9);
  assert.equal(actor.jumpLimit, 6);
  events.length = 0;
  receiveNativePlayerCommand(actor, 0x17);
  assert.deepEqual(events, [['special', 0x17], ['controller', 0x17, 2]]);
});

test('stop/resume require manager membership, preserve repeated hooks and forward commands', () => {
  const events = [];
  const actor = { scene: {}, flags: 4, onStopped: () => events.push('stop'), onResumed: () => events.push('resume'),
    setMessage: value => events.push(['message', value]) };
  receiveNativePlayerCommand(actor, 0x1c);
  assert.deepEqual(events, []);
  actor.manager = {};
  receiveNativePlayerCommand(actor, 0x1c);
  receiveNativePlayerCommand(actor, 0x1c);
  assert.equal(actor.flags, 5);
  receiveNativePlayerCommand(actor, 0x1d);
  assert.equal(actor.flags, 4);
  receiveNativePlayerCommand(actor, 0x2b, 0);
  receiveNativePlayerCommand(actor, 0x2b, null);
  assert.deepEqual(events, ['stop', 'stop', 'resume', ['message', 0]]);
});
