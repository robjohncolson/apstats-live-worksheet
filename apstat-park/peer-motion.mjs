// Optional visual positions. The server remains the source of game state and membership.
export function createPeerMotion({ name, signal, enabled = false,
  PeerConnection = globalThis.RTCPeerConnection, now = () => performance.now() }) {
  const supported = enabled && typeof PeerConnection === 'function';
  const links = new Map();
  let epoch = null, self = null, sequence = 0, pending = [], disposed = false;
  const counts = { sent: 0, received: 0, rejected: 0 };

  function close(link) {
    link.failed = true;
    link.pose = null;
    try { link.channel?.close(); link.pc.close(); } catch { /* WebSocket continues. */ }
  }

  function reset() {
    for (const link of links.values()) close(link);
    links.clear(); pending = []; epoch = null; self = null;
  }

  function emit(link, value) {
    if (!link.failed && !disposed) signal({ epoch, from: self, to: link.id, signal: value });
  }

  function enqueue(link, action) {
    link.work = link.work.then(() => { if (!link.failed) return action(); }).catch(() => close(link));
  }

  function attach(link, channel) {
    if (link.channel || channel.label !== 'park-motion-v1') { channel.close(); return; }
    link.channel = channel;
    channel.onclose = () => { link.pose = null; };
    channel.onerror = () => close(link);
    channel.onmessage = event => {
      if (disposed || link.failed || typeof event.data !== 'string' || event.data.length > 512) return;
      let data;
      try { data = JSON.parse(event.data); } catch { counts.rejected++; return; }
      if (!data || data.epoch !== epoch) { counts.rejected++; return; }
      if (Number.isSafeInteger(data.ack) && data.ack === link.lastSent && data.t === link.lastSentAt) {
        link.rttMs = Math.round(now() - data.t);
        return;
      }
      if (!Number.isSafeInteger(data.seq) || data.seq <= link.lastSeq || !Number.isFinite(data.t)
        || !Number.isFinite(data.x) || data.x < 0 || data.x > 1420
        || !Number.isFinite(data.y) || data.y < 0 || data.y > 700) { counts.rejected++; return; }
      link.lastSeq = data.seq;
      link.pose = { x: data.x, y: data.y, at: now() };
      counts.received++;
      if (channel.readyState === 'open' && channel.bufferedAmount < 4096) {
        try { channel.send(JSON.stringify({ epoch, ack: data.seq, t: data.t })); } catch { close(link); }
      }
    };
  }

  function connect(peer) {
    let pc;
    // LAN pilot: no third-party STUN/TURN service. Blocked paths use WebSocket.
    try { pc = new PeerConnection({ iceServers: [] }); } catch { return; }
    const link = { id: peer.id, name: peer.name, pc, channel: null, work: Promise.resolve(),
      candidates: [], lastSeq: -1, pose: null, rttMs: null, failed: false };
    links.set(peer.id, link);
    pc.onicecandidate = event => {
      if (event.candidate) emit(link, { type: 'candidate', ...event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) close(link);
    };
    pc.ondatachannel = event => attach(link, event.channel);
    // One offerer per pair prevents simultaneous offers.
    if (self < peer.id) enqueue(link, async () => {
      attach(link, pc.createDataChannel('park-motion-v1', { ordered: false, maxRetransmits: 0 }));
      await pc.setLocalDescription(await pc.createOffer());
      emit(link, { type: 'offer', sdp: pc.localDescription.sdp });
    });
  }

  function receive(message) {
    if (!supported || disposed || message.epoch !== epoch || message.to !== self) return;
    const link = links.get(message.from);
    if (!link) {
      // An offer can beat the next server roster broadcast by one tick.
      if (pending.length < 32) pending.push(message);
      return;
    }
    const value = message.signal;
    if (!value || link.failed) return;
    enqueue(link, async () => {
      if (value.type === 'candidate') {
        const candidate = { candidate: value.candidate, sdpMid: value.sdpMid, sdpMLineIndex: value.sdpMLineIndex };
        if (link.pc.remoteDescription) await link.pc.addIceCandidate(candidate);
        else if (link.candidates.length < 32) link.candidates.push(candidate);
        return;
      }
      if (value.type !== 'offer' && value.type !== 'answer') return;
      if (value.type === 'offer' && self < link.id) return;
      await link.pc.setRemoteDescription({ type: value.type, sdp: value.sdp });
      for (const candidate of link.candidates.splice(0)) await link.pc.addIceCandidate(candidate);
      if (value.type === 'offer') {
        await link.pc.setLocalDescription(await link.pc.createAnswer());
        emit(link, { type: 'answer', sdp: link.pc.localDescription.sdp });
      }
    });
  }

  function sync(nextEpoch, roster = []) {
    if (!supported || disposed) return;
    const selected = roster.slice(0, 4);
    const nextSelf = selected.find(peer => peer.name === name)?.id || null;
    if (epoch !== nextEpoch || self !== nextSelf) { reset(); epoch = nextEpoch; self = nextSelf; }
    if (!self) return;
    for (const [id, link] of links) {
      if (!selected.some(peer => peer.id === id && peer.name === link.name)) { close(link); links.delete(id); }
    }
    for (const peer of selected) if (peer.id !== self && !links.has(peer.id)) connect(peer);
    const queued = pending; pending = [];
    for (const message of queued) if (links.has(message.from)) receive(message);
  }

  function publish(pose) {
    if (!supported || disposed || !self) return;
    const seq = ++sequence, time = now();
    const packet = JSON.stringify({ epoch, seq, t: time, x: pose.x, y: pose.y });
    for (const link of links.values()) {
      const channel = link.channel;
      if (link.failed || channel?.readyState !== 'open' || channel.bufferedAmount >= 4096) continue;
      try {
        link.lastSent = seq; link.lastSentAt = time;
        channel.send(packet); counts.sent++;
      } catch { close(link); }
    }
  }

  function position(peerName) {
    const link = [...links.values()].find(link => link.name === peerName);
    return link?.channel?.readyState === 'open' && link.pose && now() - link.pose.at < 350 ? link.pose : null;
  }

  function stats() {
    const peers = [...links.values()];
    return { enabled, supported, selected: !!self, connected: peers.filter(link => link.channel?.readyState === 'open').length,
      fresh: peers.filter(link => position(link.name)).length,
      rttMs: peers.map(link => link.rttMs).filter(value => value !== null), ...counts };
  }

  return { supported, sync, receive, publish, position, stats, reset,
    dispose() { disposed = true; reset(); } };
}
