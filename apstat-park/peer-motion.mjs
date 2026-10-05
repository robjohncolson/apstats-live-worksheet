// Visual positions through a server-selected browser hub. Game state stays on the server.
export function createPeerMotion({ name, signal, enabled = true,
  PeerConnection = globalThis.RTCPeerConnection, now = () => performance.now() }) {
  const supported = enabled && typeof PeerConnection === 'function';
  const links = new Map();
  const members = new Map(), positions = new Map();
  let epoch = null, self = null, hub = null, sequence = 0, pending = [], disposed = false;
  const counts = { sent: 0, received: 0, rejected: 0 };
  const failures = {};
  let generation = 0, retriedAt = -Infinity, retryDelay = 15000;

  function close(link, reason) {
    if (!link.failed && reason) failures[reason] = (failures[reason] || 0) + 1;
    link.failed = true;
    positions.delete(link.name);
    try { link.channel?.close(); link.pc.close(); } catch { /* WebSocket continues. */ }
  }

  function reset() {
    for (const link of links.values()) close(link);
    links.clear(); members.clear(); positions.clear(); pending = []; epoch = null; self = null; hub = null;
  }

  function emit(link, value) {
    if (!link.failed && !disposed) signal({ epoch, from: self, to: link.id, signal: value });
  }

  function enqueue(link, action) {
    link.work = link.work.then(() => { if (!link.failed) return action(); }).catch(error => close(link, 'signal-' + error.name));
  }

  function validPose(data) {
    return data && Number.isSafeInteger(data.seq) && data.seq >= 0
      && Number.isFinite(data.x) && data.x >= 0 && data.x <= 1420
      && Number.isFinite(data.y) && data.y >= 0 && data.y <= 700;
  }

  function acceptPose(id, data) {
    const member = members.get(id);
    if (!member || id === self) return;
    const previous = positions.get(member.name);
    if (previous && previous.id === id && data.seq <= previous.seq) return;
    positions.set(member.name, { id, seq: data.seq, x: data.x, y: data.y, at: now() });
  }

  function attach(link, channel) {
    if (link.channel || channel.label !== 'park-motion-v2') { channel.close(); return; }
    link.channel = channel;
    channel.onclose = () => {
      if (self !== hub) positions.clear();
      else positions.delete(link.name);
    };
    channel.onerror = () => close(link, 'channel-error');
    channel.onmessage = event => {
      if (disposed || link.failed || typeof event.data !== 'string' || event.data.length > 8192) return;
      let data;
      try { data = JSON.parse(event.data); } catch { counts.rejected++; return; }
      if (!data || data.epoch !== epoch) { counts.rejected++; return; }
      if (Number.isSafeInteger(data.ack) && data.ack === link.lastSent && data.t === link.lastSentAt) {
        link.rttMs = Math.round(now() - data.t);
        return;
      }
      if (!Number.isSafeInteger(data.seq) || data.seq <= link.lastSeq || !Number.isFinite(data.t)) { counts.rejected++; return; }
      if (self === hub) {
        // A leaf can supply only its own position, never positions for another student.
        if (!validPose(data) || data.poses !== undefined) { counts.rejected++; return; }
        acceptPose(link.id, data);
      } else {
        if (link.id !== hub || !Array.isArray(data.poses) || data.poses.length > 64
          || !data.poses.every(pose => typeof pose?.id === 'string' && validPose(pose))) { counts.rejected++; return; }
        for (const pose of data.poses) acceptPose(pose.id, pose);
      }
      link.lastSeq = data.seq;
      counts.received++;
      if (channel.readyState === 'open' && channel.bufferedAmount < 16384) {
        try { channel.send(JSON.stringify({ epoch, ack: data.seq, t: data.t })); } catch { close(link, 'ack-send'); }
      }
    };
  }

  function connect(peer) {
    let pc;
    // Local connections first; blocked paths continue over WebSocket.
    try { pc = new PeerConnection({ iceServers: [] }); } catch { return; }
    const link = { id: peer.id, name: peer.name, pc, channel: null, work: Promise.resolve(),
      candidates: [], lastSeq: -1, rttMs: null, failed: false, createdAt: now() };
    links.set(peer.id, link);
    pc.onicecandidate = event => {
      if (event.candidate) emit(link, { type: 'candidate', ...event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) close(link, 'connection-' + pc.connectionState);
    };
    pc.ondatachannel = event => attach(link, event.channel);
    // Leaves initiate; the hub only answers, including after hub replacement.
    if (self !== hub) enqueue(link, async () => {
      attach(link, pc.createDataChannel('park-motion-v2', { ordered: false, maxRetransmits: 0 }));
      await pc.setLocalDescription(await pc.createOffer());
      emit(link, { type: 'offer', sdp: pc.localDescription.sdp });
    });
  }

  function receive(message) {
    if (!supported || disposed || message.epoch !== epoch || message.to !== self) return;
    const link = links.get(message.from);
    if (!link) {
      // An offer can beat the next server roster broadcast by one tick.
      if (pending.length < 256) pending.push(message);
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
      if (value.type === 'offer' && self !== hub) return;
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
    const selected = roster.slice(0, 64);
    const nextSelf = selected.find(peer => peer.name === name)?.id || null;
    const nextHub = selected.find(peer => peer.hub)?.id || null;
    if (epoch !== nextEpoch || self !== nextSelf || hub !== nextHub) {
      reset(); epoch = nextEpoch; self = nextSelf; hub = nextHub;
    }
    if (!self || !hub) return;
    members.clear();
    for (const peer of selected) members.set(peer.id, peer);
    for (const [peerName, pose] of positions) if (!members.has(pose.id)) positions.delete(peerName);
    const neighbors = self === hub ? selected.filter(peer => peer.id !== self) : selected.filter(peer => peer.id === hub);
    for (const [id, link] of links) {
      if (!neighbors.some(peer => peer.id === id && peer.name === link.name)) { close(link); links.delete(id); }
    }
    for (const peer of neighbors) if (!links.has(peer.id)) connect(peer);
    const queued = pending; pending = [];
    for (const message of queued) if (links.has(message.from)) receive(message);
  }

  function publish(pose) {
    if (!supported || disposed || !self) return;
    const seq = ++sequence, time = now();
    const data = { epoch, seq, t: time };
    if (self === hub) {
      data.poses = [{ id: self, seq, x: pose.x, y: pose.y },
        ...[...positions.values()].filter(value => time - value.at < 350)
          .map(({ id, seq, x, y }) => ({ id, seq, x, y }))];
    } else { data.x = pose.x; data.y = pose.y; }
    const packet = JSON.stringify(data);
    for (const link of links.values()) {
      const channel = link.channel;
      if (link.failed || channel?.readyState !== 'open' || channel.bufferedAmount >= 16384) continue;
      try {
        link.lastSent = seq; link.lastSentAt = time;
        channel.send(packet); counts.sent++;
      } catch { close(link, 'pose-send'); }
    }
  }

  function position(peerName) {
    const pose = positions.get(peerName);
    const link = self === hub ? links.get(pose?.id) : links.get(hub);
    return link?.channel?.readyState === 'open' && !link.failed && pose && now() - pose.at < 350 ? pose : null;
  }

  function stats() {
    const peers = [...links.values()];
    return { enabled, supported, selected: !!self, hub: !!self && self === hub, members: members.size,
      connected: peers.filter(link => link.channel?.readyState === 'open').length,
      fresh: [...positions.keys()].filter(peerName => position(peerName)).length,
      rttMs: peers.map(link => link.rttMs).filter(value => value !== null), failures: { ...failures }, ...counts };
  }

  function connectionGeneration() {
    if (!self || self === hub || disposed) return generation;
    const link = links.get(hub);
    if (link?.channel?.readyState === 'open' && !link.failed) { retryDelay = 15000; return generation; }
    if (!link || now() - link.createdAt < 15000 || now() - retriedAt < retryDelay) return generation;
    // A new server-issued identity retires old offers/candidates on both ends.
    // Only this leaf retries; one blocked device must not restart the whole class.
    retriedAt = now(); generation++; retryDelay = Math.min(120000, retryDelay * 2);
    return generation;
  }

  return { supported, sync, receive, publish, position, stats, reset, connectionGeneration,
    dispose() { disposed = true; reset(); } };
}
