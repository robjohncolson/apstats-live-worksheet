// tests/net-probe.test.js — NET_PROBE_SPEC.md: the Desk's passive network probe (lib/net-probe.js).
// jsdom has no RTCPeerConnection, so a small fake peer (FakePC / FakeDC) stands in for WebRTC: it
// "gathers" candidate lines that carry real-looking addresses, opens its data channel once the
// remote description is set, and echoes pings like a classmate would. fetch is a route table.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

let Lib;
beforeAll(async () => {
  await import('../lib/net-probe.js');   // installs globalThis.NetProbeLib
  Lib = globalThis.NetProbeLib;
});

const CANDIDATES = [
  'a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host generation 0',
  'a=candidate:2 1 udp 2122260223 3f2a9c1e-1b2c-4d5e-8f90-123456789abc.local 54322 typ host generation 0',
  'a=candidate:3 1 udp 1686052607 73.12.44.5 54321 typ srflx raddr 192.168.1.20 rport 54321',
].join('\r\n');
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n' + CANDIDATES + '\r\n';
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

const FAST = {
  idleMs: 20, busyRetryMs: 20, busyRetries: 3, budgetMs: 3000, postReserveMs: 300, configMs: 200,
  healthMs: 100, healthCount: 5, gatherMs: 30, pollEveryMs: 5, answerWaitMs: 60, connectMs: 300,
  pingCount: 10, pingMs: 100, lingerMs: 1,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class FakeTarget {
  constructor() { this.listeners = {}; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  emit(type, ev) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
}

class FakeDC extends FakeTarget {
  constructor() { super(); this.readyState = 'connecting'; }
  open() { this.readyState = 'open'; this.emit('open', {}); }
  send(data) {
    const msg = JSON.parse(data);
    // The classmate echoes our pings.
    if (msg.t === 'ping') setTimeout(() => this.emit('message', { data: JSON.stringify({ t: 'pong', id: msg.id }) }), 1);
  }
}

function makeFakePC({ pair = ['host', 'host'], connect = true, gather = true, failIce = false } = {}) {
  const made = [];
  class FakePC extends FakeTarget {
    constructor(config) {
      super();
      this.config = config;
      this.iceGatheringState = 'new';
      this.localDescription = null;
      this.closed = false;
      made.push(this);
    }
    createDataChannel() { this.dc = new FakeDC(); return this.dc; }
    async createOffer() { return { type: 'offer', sdp: SDP }; }
    async createAnswer() { return { type: 'answer', sdp: SDP }; }
    async setLocalDescription(d) {
      this.localDescription = gather ? d : { type: d.type, sdp: 'v=0\r\n' };
      if (gather) this.iceGatheringState = 'complete';
    }
    async setRemoteDescription(d) {
      this.remote = d;
      if (failIce) { setTimeout(() => { this.iceConnectionState = 'failed'; this.emit('iceconnectionstatechange', {}); }, 2); return; }
      if (!connect) return;
      if (d.type === 'answer') { setTimeout(() => this.dc.open(), 2); return; }
      const dc = new FakeDC();
      setTimeout(() => { this.emit('datachannel', { channel: dc }); setTimeout(() => dc.open(), 1); }, 2);
    }
    async getStats() {
      return new Map([
        ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'CP' }],
        ['CP', { id: 'CP', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'L', remoteCandidateId: 'R' }],
        ['L', { id: 'L', type: 'local-candidate', candidateType: pair[0], address: '192.168.1.20' }],
        ['R', { id: 'R', type: 'remote-candidate', candidateType: pair[1], address: '192.168.1.21' }],
      ]);
    }
    close() { this.closed = true; }
  }
  FakePC.made = made;
  return FakePC;
}

const ok = (body) => ({ ok: true, json: async () => body });

// Route table. Each handler may return a body, throw, or return a full response.
function makeFetch(overrides = {}) {
  const calls = [];
  const routes = {
    config: () => ok({ ok: true, enabled: true, lanRelayUrl: null, stun: ['stun:stun.l.google.com:19302'] }),
    rosterHealth: () => ok({ ok: true }),
    relayHealth: () => ok({ status: 'healthy' }),
    pending: () => ok({ ok: true, offer: null }),
    offer: () => ok({ ok: true, offerId: 'o1' }),
    getAnswer: () => ok({ ok: true, answer: SDP }),
    postAnswer: () => ok({ ok: true }),
    record: () => ok({ ok: true }),
    ...overrides,
  };
  async function fetch(url, init = {}) {
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    const route = url.startsWith('https://relay.test/health') ? 'relayHealth'
      : url.endsWith('/health') ? 'rosterHealth'
      : url.endsWith('/net/probe/config') ? 'config'
      : url.includes('/net/probe/pending') ? 'pending'
      : url.endsWith('/net/probe/offer') ? 'offer'
      : url.includes('/net/probe/answer/') ? (method === 'POST' ? 'postAnswer' : 'getAnswer')
      : url.endsWith('/net/probe') ? 'record'
      : null;
    if (!route) throw new Error('unexpected ' + url);
    return routes[route]();
  }
  fetch.calls = calls;
  fetch.posted = () => calls.filter(c => c.url.endsWith('/net/probe') && c.method === 'POST').map(c => c.body);
  return fetch;
}

function makeEnv({ fetch = makeFetch(), PC = makeFakePC(), role = 'student', ...extra } = {}) {
  return {
    document,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    performance: globalThis.performance,
    fetch,
    RTCPeerConnection: PC,
    ROSTER_SERVICE_URL: 'https://roster.test',
    RAILWAY_SERVER_URL: 'https://relay.test',
    navigator: {
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    },
    rosterClient: {
      current: () => ({ studentId: 'S1', section: 'PeriodB', role, expired: false }),
      token: () => 'tok-S1',
    },
    ...extra,
  };
}

function boardMount() {
  let mount = document.getElementById('classroom-board-mount');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'classroom-board-mount';
    document.body.appendChild(mount);
  }
  return mount;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  const mount = document.getElementById('classroom-board-mount');
  if (mount) mount.remove();
});

describe('schedule rules', () => {
  it('runs only after the idle wait following rCal; repeated rCal calls restart the wait; one run per page', async () => {
    const env = makeEnv();
    const probe = Lib.create(env, { ...FAST, idleMs: 60 });
    probe.afterCal();
    await sleep(30);
    probe.afterCal();                     // restarts the 60 ms wait
    await sleep(40);
    expect(env.fetch.calls).toHaveLength(0);
    await sleep(40);
    expect(probe.state.started).toBe(true);
    await probe.state.promise;
    expect(env.fetch.posted()).toHaveLength(1);
    probe.afterCal();
    await sleep(100);
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('stamps the day and does not run again on this device today', async () => {
    const first = makeEnv();
    await Lib.create(first, FAST).run();
    expect(window.localStorage.getItem(Lib.DAY_KEY)).toBe(Lib.localDay());
    const second = makeEnv();
    const probe = Lib.create(second, FAST);
    expect(probe.skipReason()).toBe('done-today');
    expect(await probe.run()).toBeNull();
    expect(second.fetch.calls).toHaveLength(0);
  });

  it('a stamp from yesterday does not block today', async () => {
    window.localStorage.setItem(Lib.DAY_KEY, '2000-01-01');
    const env = makeEnv();
    expect(await Lib.create(env, FAST).run()).not.toBeNull();
  });

  it('skips signed-out, teacher, preview-as-student and view-as', async () => {
    expect(Lib.create(makeEnv({ rosterClient: { current: () => null, token: () => null } }), FAST).skipReason()).toBe('signed-out');
    expect(Lib.create(makeEnv({ role: 'teacher' }), FAST).skipReason()).toBe('teacher');
    window.sessionStorage.setItem('apstats_preview_as_student', '1');
    expect(Lib.create(makeEnv(), FAST).skipReason()).toBe('preview');
    window.sessionStorage.clear();
    window.sessionStorage.setItem('apstats_view_as_context', '{"studentId":"S9"}');
    expect(Lib.create(makeEnv(), FAST).skipReason()).toBe('preview');
  });
});

describe('never during a park / Tetris / Live Classroom session', () => {
  it('data-park-active (and the team calculator) on the classroom board mean busy', async () => {
    const env = makeEnv();
    const probe = Lib.create(env, FAST);
    boardMount().setAttribute('data-park-active', '');
    expect(probe.skipReason()).toBe('busy');
    expect(await probe.run()).toBeNull();
    expect(env.fetch.calls).toHaveLength(0);
    boardMount().removeAttribute('data-park-active');
    boardMount().setAttribute('data-calculator-active', '');
    expect(probe.isBusy()).toBe(true);
  });

  it('Study Break Tetris open means busy', () => {
    const env = makeEnv({ studyBreak: { isOpen: () => true } });
    expect(Lib.create(env, FAST).skipReason()).toBe('busy');
  });

  it('a live classroom or an unfinished activity in _lastClassroomSummary means busy', () => {
    expect(Lib.create(makeEnv({ _lastClassroomSummary: { live: true } }), FAST).isBusy()).toBe(true);
    expect(Lib.create(makeEnv({ _lastClassroomSummary: { activity: { type: 'level', finished: false } } }), FAST).isBusy()).toBe(true);
    expect(Lib.create(makeEnv({ _lastClassroomSummary: { activity: { type: 'level', finished: true } } }), FAST).isBusy()).toBe(false);
  });

  it('busy at the idle mark → retries later and runs once the session ends', async () => {
    const env = makeEnv({ studyBreak: { open: true, isOpen() { return this.open; } } });
    const probe = Lib.create(env, FAST);
    probe.afterCal();
    await sleep(35);
    expect(probe.state.started).toBe(false);
    expect(probe.state.lastSkip).toBe('busy');
    env.studyBreak.open = false;
    await sleep(40);
    expect(probe.state.started).toBe(true);
    await probe.state.promise;
    expect(env.fetch.posted()).toHaveLength(1);
  });
});

describe('kill-switch', () => {
  it('server NET_PROBE_ENABLED off → no measurements, no record, no day stamp', async () => {
    const env = makeEnv({ fetch: makeFetch({ config: () => ok({ ok: true, enabled: false, lanRelayUrl: null }) }) });
    const probe = Lib.create(env, FAST);
    expect(await probe.run()).toBeNull();
    expect(probe.state.lastSkip).toBe('disabled');
    expect(env.fetch.calls.map(c => c.url)).toEqual(['https://roster.test/net/probe/config']);
    expect(window.localStorage.getItem(Lib.DAY_KEY)).toBeNull();
  });

  it('config unreachable → skip entirely', async () => {
    const env = makeEnv({ fetch: makeFetch({ config: () => { throw new Error('offline'); } }) });
    expect(await Lib.create(env, FAST).run()).toBeNull();
    expect(env.fetch.posted()).toHaveLength(0);
  });

  it("per-device localStorage apstats-net-probe='off' → not even the config call", async () => {
    window.localStorage.setItem(Lib.OFF_KEY, 'off');
    const env = makeEnv();
    const probe = Lib.create(env, FAST);
    expect(probe.skipReason()).toBe('off-device');
    expect(await probe.run()).toBeNull();
    expect(env.fetch.calls).toHaveLength(0);
  });
});

describe('the record', () => {
  it('offer side: connected host↔host with types, counts and timings — and no addresses', async () => {
    const env = makeEnv();
    const record = await Lib.create(env, FAST).run();
    const [posted] = env.fetch.posted();
    expect(posted).toEqual(record);
    const text = JSON.stringify(posted);
    expect(text).not.toMatch(IP_RE);
    expect(text).not.toMatch(/\.local/);
    expect(text).not.toMatch(/candidate:/);
    expect(posted.p2p).toMatchObject({
      connected: true, role: 'offer', error: null,
      localPair: { local: 'host', remote: 'host' },
      candidates: { host: 2, srflx: 1, prflx: 0, relay: 0, mdns: true },
    });
    expect(typeof posted.p2p.rtt).toBe('number');
    expect(typeof posted.rttRoster).toBe('number');
    expect(typeof posted.rttRelay).toBe('number');
    expect(posted.conn).toEqual({ effectiveType: '4g', rtt: 50, downlink: 10 });
    expect(posted.ua).toBe('Chrome 141; Chrome OS');
    expect(posted.preview).toBe(false);
    // Signed-in student session on every roster call; 5 health pings each way.
    const rosterCalls = env.fetch.calls.filter(c => c.url.includes('/net/probe') && !c.url.endsWith('/config'));
    expect(rosterCalls.every(c => c.headers.authorization === 'Bearer tok-S1')).toBe(true);
    expect(env.fetch.calls.filter(c => c.url === 'https://roster.test/health')).toHaveLength(5);
    expect(env.fetch.calls.filter(c => c.url === 'https://relay.test/health')).toHaveLength(5);
    // STUN only, no TURN, no candidate pool; the peer is closed afterwards.
    const pc = env.RTCPeerConnection.made[0];
    expect(pc.config).toEqual({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], iceCandidatePoolSize: 0 });
    expect(pc.closed).toBe(true);
  });

  it('answer side: a classmate offer is answered and the role recorded', async () => {
    const env = makeEnv({ fetch: makeFetch({ pending: () => ok({ ok: true, offer: { offerId: 'o9', sdp: SDP } }) }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p).toMatchObject({ connected: true, role: 'answer' });
    const answerPost = env.fetch.calls.find(c => c.method === 'POST' && c.url.endsWith('/net/probe/answer/o9'));
    expect(answerPost.body.sdp.startsWith('v=0')).toBe(true);
    expect(JSON.stringify(env.fetch.posted())).not.toMatch(IP_RE);
  });

  it('srflx pair types are recorded as types only', async () => {
    const env = makeEnv({ PC: makeFakePC({ pair: ['srflx', 'prflx'] }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p.localPair).toEqual({ local: 'srflx', remote: 'prflx' });
  });
});

describe('a failed step records its error and the rest continue', () => {
  it('roster /health down → rttRoster null, relay + p2p + POST still happen', async () => {
    const env = makeEnv({ fetch: makeFetch({ rosterHealth: () => { throw new Error('down'); } }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.rttRoster).toBeNull();
    expect(record.errors.rttRoster).toBe('timeout');
    expect(typeof record.rttRelay).toBe('number');
    expect(record.p2p.connected).toBe(true);
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('relay /health returning 5xx → rttRelay null only', async () => {
    const env = makeEnv({ fetch: makeFetch({ relayHealth: () => ({ ok: false, json: async () => ({}) }) }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.rttRelay).toBeNull();
    expect(typeof record.rttRoster).toBe('number');
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('no RTCPeerConnection (device policy) → p2p.error policy, still recorded', async () => {
    const env = makeEnv({ PC: null });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p).toMatchObject({ connected: false, error: 'policy' });
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('RTCPeerConnection constructor throws → policy', async () => {
    const env = makeEnv({ PC: function () { throw new Error('blocked by policy'); } });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p.error).toBe('policy');
  });

  it('no classmate answers within the window → noPeer', async () => {
    const env = makeEnv({ fetch: makeFetch({ getAnswer: () => ok({ ok: true, answer: null }) }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p).toMatchObject({ connected: false, error: 'noPeer', role: 'offer' });
    expect(record.p2p.candidates.mdns).toBe(true);
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('offer POST fails → signalFailed', async () => {
    const env = makeEnv({ fetch: makeFetch({ offer: () => { throw new Error('500'); } }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p.error).toBe('signalFailed');
    expect(env.fetch.posted()).toHaveLength(1);
  });

  it('no candidates gathered → gatherTimeout', async () => {
    const env = makeEnv({ PC: makeFakePC({ gather: false }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.p2p.error).toBe('gatherTimeout');
  });

  it('ICE failure → iceFailed; channel never opening → connectTimeout', async () => {
    const failed = await Lib.create(makeEnv({ PC: makeFakePC({ failIce: true }) }), FAST).run();
    expect(failed.p2p.error).toBe('iceFailed');
    window.localStorage.clear();
    const stuck = await Lib.create(makeEnv({ PC: makeFakePC({ connect: false }) }), { ...FAST, connectMs: 40 }).run();
    expect(stuck.p2p.error).toBe('connectTimeout');
  });

  it('the final POST failing never throws', async () => {
    const env = makeEnv({ fetch: makeFetch({ record: () => { throw new Error('offline'); } }) });
    const record = await Lib.create(env, FAST).run();
    expect(record.errors.post).toBe('network');
  });
});

describe('never throws into the Desk', () => {
  it('throwing storage / roster client / fetch → run resolves null, afterCal is quiet', async () => {
    const bad = makeEnv({
      localStorage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
      rosterClient: { current() { throw new Error('boom'); } },
      fetch: () => { throw new Error('boom'); },
    });
    const probe = Lib.create(bad, FAST);
    expect(await probe.run()).toBeNull();
    expect(() => probe.afterCal()).not.toThrow();
    await sleep(40);
  });

  it('the browser global is installed without a session and does nothing on its own', () => {
    expect(typeof globalThis.NetProbe.afterCal).toBe('function');
    expect(globalThis.NetProbe.state.started).toBe(false);
  });
});

describe('helpers', () => {
  it('countCandidates keeps types and an mDNS flag only', () => {
    expect(Lib.countCandidates(SDP)).toEqual({ host: 2, srflx: 1, prflx: 0, relay: 0, mdns: true });
    expect(Lib.countCandidates('')).toEqual({ host: 0, srflx: 0, prflx: 0, relay: 0, mdns: false });
  });

  it('uaSummary uses userAgentData brands when present', () => {
    const nav = { userAgentData: { brands: [{ brand: 'Not=A?Brand', version: '99' }, { brand: 'Chromium', version: '141' }, { brand: 'Google Chrome', version: '141' }], platform: 'Chrome OS', mobile: false } };
    expect(Lib.uaSummary(nav)).toBe('Chrome 141; Chrome OS');
  });
});
