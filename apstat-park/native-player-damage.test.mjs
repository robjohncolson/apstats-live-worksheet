import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveNativePlayerDamage, packNativeDamagePosition, applyNativeDamagePosition } from './native-player-damage.mjs';
import { createNativeDeathController, applyNativePlayerControllerChange } from './native-player-death.mjs';

const fixture = () => {
  const events = [];
  const actor = { health: 1, playerFlags: 8, fallState: 0, damageReportPending: 1,
    position: { x: 1234.9, y: -12.8 }, velocity: { x: 3, y: 2 }, bodies: [{ body: { flags: 65 } }],
    components: [], controllerKind: 2,
    scene: { flags: 0x20, damageCounter: 7,
      playSound: name => events.push(['sound', name]),
      recordSpecialDamage: () => events.push(['special']),
      sendNativeDamagePacket: packet => events.push(packet) },
    resetSpriteBounds: () => events.push(['bounds']),
    setAnimation: value => events.push(['animation', value]) };
  return { actor, events };
};

test('accepted damage selects death on the next controller transition; repeated hits are suppressed', () => {
  const { actor, events } = fixture();
  assert.equal(receiveNativePlayerDamage(actor, 4), 1);
  assert.equal(actor.health, 0);
  assert.equal(actor.fallState, 3);
  assert.equal(actor.controllerKind, 2);
  assert.equal(actor.scene.flags, 0xa0);
  assert.equal(actor.scene.damageCounter, 0);
  assert.deepEqual(events, [['sound', 'hit']]);
  assert.equal(receiveNativePlayerDamage(actor, 4), null);
  applyNativePlayerControllerChange(actor, () => createNativeDeathController());
  actor.controller.pre(actor, 1 / 60);
  assert.equal(actor.controllerKind, 3);
  assert.deepEqual(events, [['sound', 'hit'], ['bounds'], ['animation', 4]]);
  assert.equal(actor.bodies[0].body.flags & 1, 0);
});

test('damage gates and surviving hits preserve native side effects and handled return', () => {
  for (const gate of ['invulnerable', 'global', 'health']) {
    const { actor, events } = fixture();
    if (gate === 'invulnerable') actor.playerFlags |= 0x80;
    if (gate === 'global') actor.scene.damageSuppressed = true;
    if (gate === 'health') actor.health = 0;
    assert.equal(receiveNativePlayerDamage(actor, 5), null);
    assert.deepEqual(events, []);
  }
  const { actor, events } = fixture();
  actor.health = 2;
  assert.equal(receiveNativePlayerDamage(actor, 5), 1);
  assert.equal(actor.health, 1);
  assert.equal(actor.fallState, 0);
  assert.deepEqual(events, [['sound', 'hit'], ['special']]);
  assert.equal(actor.scene.flags, 0x20);
  assert.equal(receiveNativePlayerDamage(actor, 2), null);
});

test('command3 zero payload selects player flag10 instead of death; nonzero respects client ownership', () => {
  const { actor, events } = fixture();
  assert.equal(receiveNativePlayerDamage(actor, 3, 0), 1);
  assert.equal(actor.playerFlags, 0x18);
  assert.equal(actor.fallState, 0);
  assert.deepEqual(events, []);
  actor.health = 1; actor.networkOwner = { id: 42 }; actor.scene.networkMode = 1;
  assert.equal(receiveNativePlayerDamage(actor, 3, 1), 1);
  assert.equal(actor.fallState, 0);
  actor.health = 1; actor.scene.networkMode = 2;
  assert.equal(receiveNativePlayerDamage(actor, 3, 1), 1);
  assert.equal(actor.fallState, 3);
});

test('client damage sends ordered native reports; host damage broadcasts and selects local death', () => {
  for (const command of [4, 5]) {
    const { actor, events } = fixture();
    actor.networkOwner = { id: 42 }; actor.scene.networkMode = 1;
    receiveNativePlayerDamage(actor, command);
    const packets = events.filter(value => value.transport);
    assert.equal(packets.length, command === 4 ? 3 : 2);
    assert.deepEqual(packets[0], { transport: 'client', target: 42, channel: 1, kind: 0, command: 3, value: 1 });
    if (command === 4) assert.deepEqual(packets[1], { transport: 'client', target: 42, channel: 1,
      kind: 0, command: 0x2f, value: packNativeDamagePosition(actor.position) });
    assert.deepEqual(packets.at(-1), { transport: 'client', target: 255, channel: 1,
      kind: 2, command: command === 4 ? 1 : 0, value: 0 });
    assert.equal(actor.damageReportPending, 0);
    assert.equal(actor.fallState, 0);
    actor.health = 1; actor.scene.networkMode = 2; events.length = 0;
    receiveNativePlayerDamage(actor, command);
    assert.equal(events.at(-1).transport, 'host');
    assert.equal(actor.fallState, 3);
  }
});

test('damage position packet preserves host X band, monotonic within-band X, and signed Y', () => {
  const { actor } = fixture();
  const packet = packNativeDamagePosition({ x: 1499.9, y: -12.8 });
  assert.equal(packet & 0xffff, 499);
  assert.equal(packet >> 16, -12);
  applyNativeDamagePosition(actor, packet);
  assert.equal(actor.position.x, 1234.9, 'unowned actor ignores packet');
  actor.networkOwner = {}; actor.scene.networkMode = 2;
  applyNativeDamagePosition(actor, packet);
  assert.deepEqual(actor.position, { x: 1499, y: -12 });
  applyNativeDamagePosition(actor, packNativeDamagePosition({ x: 1200, y: 100 }));
  assert.deepEqual(actor.position, { x: 1499, y: 100 });
  assert.equal(actor.bodies[0].body.flags, 64);
});
