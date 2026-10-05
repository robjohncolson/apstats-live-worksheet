import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerMotion } from './peer-motion.mjs';

class FakePeer {
  static instances = [];
  constructor() { FakePeer.instances.push(this); this.connectionState = 'new'; }
  createDataChannel(label, options) {
    this.channel = { label, options, readyState: 'open', bufferedAmount: 0, messages: [],
      send(value) { this.messages.push(JSON.parse(value)); }, close() { this.readyState = 'closed'; } };
    return this.channel;
  }
  async createOffer() { return { type: 'offer', sdp: 'offer' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate() {}
  close() { this.connectionState = 'closed'; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('ordered sequence and epoch validation, pose bounds, and stale/closed fallback', async () => {
  let time = 100;
  const signals = [];
  const motion = createPeerMotion({ name: 'alice', enabled: true, PeerConnection: FakePeer, now: () => time,
    signal: packet => signals.push(packet) });
  motion.sync('round-1', [{ id: 'a', name: 'alice' }, { id: 'b', name: 'bob', hub: true }]);
  await flush();
  const pc = FakePeer.instances.at(-1), channel = pc.channel;
  assert.deepEqual(channel.options, { ordered: false, maxRetransmits: 0 });
  assert.equal(signals[0].signal.type, 'offer');
  const receive = packet => channel.onmessage({ data: JSON.stringify(packet) });
  receive({ epoch: 'round-1', seq: 2, t: 1, poses: [{ id: 'b', seq: 2, x: 200, y: 676 }] });
  assert.equal(motion.position('bob').x, 200);
  for (const packet of [
    { epoch: 'round-1', seq: 1, t: 1, x: 100, y: 676 },
    { epoch: 'old', seq: 3, t: 1, x: 100, y: 676 },
    { epoch: 'round-1', seq: 3, t: 1, poses: [{ id: 'b', seq: 3, x: 99999, y: 676 }] },
    null,
  ]) receive(packet);
  assert.equal(motion.position('bob').x, 200);
  assert.equal(motion.stats().rejected, 4);
  motion.publish({ x: 300, y: 676 });
  const sent = channel.messages.at(-1);
  time += 12;
  receive({ epoch: 'round-1', ack: sent.seq, t: sent.t });
  assert.deepEqual(motion.stats().rttMs, [12]);
  time = 451;
  assert.equal(motion.position('bob'), null);
  channel.bufferedAmount = 20000;
  motion.publish({ x: 305, y: 676 });
  assert.equal(motion.stats().sent, 1, 'congested channel drops motion instead of queuing');
  motion.sync('round-2', [{ id: 'a', name: 'alice', hub: true }]);
  assert.equal(pc.connectionState, 'closed');
  assert.equal(motion.position('bob'), null);
  motion.dispose();
});

test('failed leaf retries with backoff without restarting the hub or unrelated students', async () => {
  let time = 0;
  const motion = createPeerMotion({ name: 'alice', PeerConnection: FakePeer, signal: () => {}, now: () => time });
  motion.sync('round', [{ id: 'a', name: 'alice' }, { id: 't', name: 'teacher', hub: true }]);
  await flush();
  const pc = FakePeer.instances.at(-1);
  pc.channel.close();
  assert.equal(motion.connectionGeneration(), 0);
  time = 15001;
  assert.equal(motion.connectionGeneration(), 1);
  motion.sync('round', [{ id: 'a-new', name: 'alice' }, { id: 't', name: 'teacher', hub: true }]);
  await flush();
  const retry = FakePeer.instances.at(-1);
  retry.channel.close();
  time = 30002;
  assert.equal(motion.connectionGeneration(), 1, 'second failure backs off');
  time = 45002;
  assert.equal(motion.connectionGeneration(), 2);
  motion.dispose();
});

test('disabled, unsupported, unselected, departed, and disposed clients use WebSocket positions', async () => {
  for (const options of [{ enabled: false, PeerConnection: FakePeer }, { enabled: true, PeerConnection: null }]) {
    const motion = createPeerMotion({ name: 'alice', signal: () => assert.fail('unexpected signal'), ...options });
    motion.sync('round', [{ id: 'a', name: 'alice' }, { id: 'b', name: 'bob' }]);
    motion.publish({ x: 65, y: 676 });
    assert.equal(motion.stats().connected, 0);
    assert.equal(motion.position('bob'), null);
  }
  const motion = createPeerMotion({ name: 'alice', enabled: true, PeerConnection: FakePeer, signal: () => {} });
  motion.sync('round', [{ id: 'b', name: 'bob' }]);
  assert.equal(motion.stats().selected, false);
  motion.sync('round', [{ id: 'a', name: 'alice' }, { id: 'b', name: 'bob', hub: true }]);
  await flush();
  const pc = FakePeer.instances.at(-1);
  motion.sync('round', [{ id: 'a', name: 'alice', hub: true }]);
  assert.equal(pc.connectionState, 'closed');
  motion.dispose();
  motion.sync('round', [{ id: 'a', name: 'alice' }, { id: 'b', name: 'bob' }]);
  assert.equal(motion.stats().connected, 0);
});

test('hub relays only verified leaf positions and stops repeating an inactive leaf', async () => {
  let time = 0;
  const motion = createPeerMotion({ name: 'teacher', PeerConnection: FakePeer, signal: () => {}, now: () => time });
  motion.sync('round', [{ id: 't', name: 'teacher', hub: true }, { id: 'a', name: 'alice' }, { id: 'b', name: 'bob' }]);
  const [a, b] = FakePeer.instances.slice(-2);
  for (const pc of [a, b]) pc.ondatachannel({ channel: pc.createDataChannel('park-motion-v2', {}) });
  a.channel.onmessage({ data: JSON.stringify({ epoch: 'round', seq: 1, t: 0, x: 200, y: 676,
    poses: [{ id: 'b', seq: 99, x: 999, y: 676 }] }) });
  assert.equal(motion.stats().rejected, 1);
  assert.equal(motion.position('bob'), null);
  a.channel.onmessage({ data: JSON.stringify({ epoch: 'round', seq: 2, t: 0, x: 200, y: 676 }) });
  motion.publish({ x: 65, y: 676 });
  assert.deepEqual(b.channel.messages.at(-1).poses.map(pose => pose.id), ['t', 'a']);
  time = 351;
  motion.publish({ x: 65, y: 676 });
  assert.deepEqual(b.channel.messages.at(-1).poses.map(pose => pose.id), ['t']);
  motion.dispose();
});

test('30 students use one connection each and hub replacement discards old relay frames', async () => {
  const roster = Array.from({ length: 31 }, (_, i) => ({ id: String(i), name: 'cat-' + i, hub: i === 0 }));
  const motion = createPeerMotion({ name: 'cat-30', PeerConnection: FakePeer, signal: () => {} });
  const before = FakePeer.instances.length;
  motion.sync('round', roster);
  await flush();
  assert.equal(FakePeer.instances.length - before, 1);
  assert.equal(motion.stats().members, 31);
  const original = FakePeer.instances.at(-1);
  original.channel.onmessage({ data: JSON.stringify({ epoch: 'round', seq: 1, t: 0,
    poses: [{ id: '29', seq: 1, x: 300, y: 676 }] }) });
  assert.equal(motion.position('cat-29').x, 300);
  const nextRoster = roster.slice(1).map(peer => ({ ...peer, hub: peer.id === '1' }));
  motion.sync('round', nextRoster);
  await flush();
  assert.equal(original.connectionState, 'closed');
  assert.equal(motion.position('cat-29'), null);
  assert.equal(FakePeer.instances.length - before, 2);
  motion.dispose();
});
