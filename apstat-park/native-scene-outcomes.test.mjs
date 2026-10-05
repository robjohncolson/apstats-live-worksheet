import test from 'node:test';
import assert from 'node:assert/strict';
import { updateNativeSceneOutcomes } from './native-scene-outcomes.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { requestNativePlayerDoorEntry } from './native-player-door.mjs';

const player = (kind = 2, flags = 0) => ({ controllerKind: kind, playerFlags: flags,
  carriedAttachments: [], position: { x: 0, y: 0 } });
const sceneWith = (...players) => ({ players, flags: 0x20, scrollFlags: 0,
  stageRetryEligible: true });

test('native team clear waits for actual door controller entry, then takes precedence over retry', () => {
  const scene = sceneWith(player(4));
  scene.playerInput = { pressed: action => action === 3 };
  const actor = createNativePlayer({ position: { x: 100, y: 100 }, presentation: {} });
  actor.scene = scene;
  scene.players.push(actor);
  requestNativePlayerDoorEntry({ opened: true, scene }, actor.body);
  assert.equal(actor.fallState, 4);
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.goalCount, 1);
  assert.equal(scene.flags & 4, 0, 'pending entry does not count as inside');
  actor.beforeMotion(1 / 60);
  scene.flags |= 8;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.goalCount, 2);
  assert.equal(scene.flags & 4, 4);
  assert.equal(scene.flags & 2, 0, 'all inside wins before explicit retry is considered');
});

test('native retry waits through death animation and obeys stage and scroll exemptions', () => {
  const scene = sceneWith(player(1), player(3));
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags & 2, 0);
  scene.players[1].controllerKind = 1;
  scene.scrollFlags = 0x40;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags & 2, 0);
  scene.scrollFlags = 0;
  scene.stageRetryEligible = false;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags & 2, 0);
  scene.stageRetryEligible = true;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags & 2, 2);
  const removed = sceneWith(player(2, 0x10), player(1));
  updateNativeSceneOutcomes(removed);
  assert.equal(removed.flags & 2, 2);
});

test('empty teams never clear or automatically retry; explicit retry and existing flags survive', () => {
  const scene = sceneWith();
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags, 0x20);
  scene.flags |= 8;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags, 0x2a);
  scene.flags |= 4;
  scene.players.push(player());
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.flags, 0x2e);
});

test('goal attachment traversal counts every native link and requires explicit type resolution', () => {
  const first = player(4), second = player(), third = player();
  first.carriedAttachments.push({ follower: second });
  second.carriedAttachments.push({ follower: third });
  const scene = sceneWith(first, second, third);
  assert.throws(() => updateNativeSceneOutcomes(scene), /RTTI/);
  scene.resolveGoalFollower = attachment => attachment.follower;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.goalCount, 3);
  assert.equal(scene.flags & 4, 4);
  scene.flags = 0x20;
  second.controllerKind = 4;
  updateNativeSceneOutcomes(scene);
  assert.equal(scene.goalCount, 5, 'native neither deduplicates nor clamps to party size');
  assert.equal(scene.flags & 4, 0, 'native requires equality, not at least party size');
  third.carriedAttachments.push({ follower: first });
  assert.throws(() => updateNativeSceneOutcomes(scene), /capacity/);
});

test('height ordering assigns original float depths, preserves ties and leaves input slots intact', () => {
  const a = player(), b = player(), c = player();
  a.position.y = 20; b.position.y = 40; c.position.y = 40;
  const scene = sceneWith(a, b, c);
  updateNativeSceneOutcomes(scene);
  assert.equal(a.spriteDepth, undefined);
  scene.scrollFlags = 0x800;
  updateNativeSceneOutcomes(scene);
  const f = Math.fround;
  assert.equal(b.spriteDepth, f(-.3));
  assert.equal(c.spriteDepth, f(f(-.3) - f(.01)));
  assert.equal(a.spriteDepth, f(f(-.3) - f(2 * f(.01))));
  assert.deepEqual(scene.players, [a, b, c]);
  scene.players = Array.from({ length: 11 }, () => player());
  assert.throws(() => updateNativeSceneOutcomes(scene), /capacity/);
});
