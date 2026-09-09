import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteMotion } from './remote-motion.mjs';
import { ParkReplica } from './replica.mjs';
const pose = x => ({ x, y: 525, vx: 200, vy: 0 });

test('sparse motion interpolates locally and stops at the last anchor through an outage', () => {
  let clock = 0;
  const motion = new RemoteMotion(() => clock);
  motion.push('alice', pose(100));
  clock = 250; motion.push('alice', pose(150));
  clock = 375; assert.equal(motion.sample('alice').x, 125);
  assert.equal(motion.sample('alice', false).x, 150);
  clock = 60000; assert.equal(motion.sample('alice').x, 150);
  motion.push('alice', pose(900));
  assert.equal(motion.sample('alice').x, 900, 'Respawn must not glide across the map');
});

test('tracks are bounded and old level samples are discarded', () => {
  let clock = 0;
  const motion = new RemoteMotion(() => clock);
  for (let i = 0; i < 10000; i++) { clock += 250; motion.push('alice', pose(i % 100)); }
  assert.equal(motion.tracks.get('alice').length, 4);
  motion.reset({ bob: pose(60) });
  assert.equal(motion.sample('alice'), null);
  assert.equal(motion.sample('bob').x, 60);
  assert.equal(motion.push('bob', { ...pose(20), x: NaN }), false);
});

test('wrong epoch, level and member motion cannot change presentation or enqueue traffic', () => {
  const replica = new ParkReplica({ now: () => 1000 });
  replica.resume({ epoch: 'one', revision: 0, sequence: 0, mode: 'summary', members: ['alice'],
    running: true, level: { id: 'level-one' }, progress: {}, poses: {} });
  for (const fields of [{ epoch: 'old' }, { level: 'old' }, { member: 'intruder' }]) {
    replica.peerMotion({ epoch: 'one', level: 'level-one', member: 'alice', pose: pose(100), ...fields });
  }
  assert.equal(replica.remoteMotion.sample('alice'), null);
  replica.peerMotion({ epoch: 'one', level: 'level-one', member: 'alice', pose: pose(120) });
  assert.equal(replica.remoteMotion.sample('alice').x, 120);
  assert.deepEqual(replica.outgoing({ connected: true }), []);
});
