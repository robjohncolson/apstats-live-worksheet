// net-probe.test.js — NET_PROBE_SPEC.md server side. Mounts only net-probe.js on a bare express app
// with an in-memory store and a fake verifyToken ("tok-<studentId>"). Teacher auth via x-teacher-secret.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import {
  mountNetProbe, inSchoolHours, buildProbeRow, summarizeProbes, looksLikeAddress,
  createSignalStore, SIGNAL_TTL_MS,
} from '../net-probe.js';

beforeAll(() => { process.env.ROSTER_TEACHER_SECRET = 'TS'; });
afterEach(() => { delete process.env.NET_PROBE_ENABLED; });

const ROSTER = [
  { student_id: 'S1', section: 'PeriodB', role: 'student' },
  { student_id: 'S2', section: 'PeriodB', role: 'student' },
  { student_id: 'S3', section: 'PeriodE', role: 'student' },
  { student_id: 'T1', section: 'PeriodB', role: 'teacher' },
];
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=candidate:1 1 udp 1 192.168.1.20 5000 typ host\r\n';
// A Tuesday, 10:00 in New York (EDT, UTC-4).
const SCHOOL_TIME = Date.parse('2026-10-06T14:00:00Z');

function start({ storeError = null, now = () => SCHOOL_TIME } = {}) {
  const rows = [];
  const store = {
    async insert(row) { if (storeError) return { data: null, error: storeError }; rows.push({ id: 'r' + rows.length, ...row }); return { data: { id: 'x' }, error: null }; },
    async list({ since, section }) {
      if (storeError) return { data: null, error: storeError };
      return { data: rows.filter(r => r.ts >= since && (!section || r.section === section)), error: null };
    },
  };
  const db = {
    async findByStudentId(id) { return { data: ROSTER.find(r => r.student_id === id) || null, error: null }; },
    async getRoleByStudentId(id) { return (ROSTER.find(r => r.student_id === id) || {}).role || 'student'; },
  };
  const verifyToken = (t) => (typeof t === 'string' && t.startsWith('tok-') ? t.slice(4) : null);
  const app = express();
  app.use(express.json());
  mountNetProbe(app, { db, verifyToken, store, now });
  const server = http.createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = async (method, path, { sid, body, teacher } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (sid) headers.authorization = 'Bearer tok-' + sid;
      if (teacher) headers['x-teacher-secret'] = 'TS';
      const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    };
    resolve({ call, rows, close: () => server.close() });
  }));
}

const RECORD = {
  rttRoster: 42.4, rttRelay: 61,
  p2p: { connected: true, rtt: 3.2, role: 'offer', localPair: { local: 'host', remote: 'host' }, candidates: { host: 1, srflx: 1, relay: 0, prflx: 0, mdns: true } },
  conn: { effectiveType: '4g', rtt: 50, downlink: 10 },
  ua: 'Chrome 141; Chrome OS',
};

describe('inSchoolHours (America/New_York)', () => {
  it('weekday 07:30–15:30 NY is in school; edges and weekends are not', () => {
    expect(inSchoolHours(SCHOOL_TIME)).toBe(true);
    expect(inSchoolHours(Date.parse('2026-10-06T11:30:00Z'))).toBe(true);    // 07:30 EDT
    expect(inSchoolHours(Date.parse('2026-10-06T11:29:00Z'))).toBe(false);   // 07:29
    expect(inSchoolHours(Date.parse('2026-10-06T19:30:00Z'))).toBe(false);   // 15:30
    expect(inSchoolHours(Date.parse('2026-10-10T14:00:00Z'))).toBe(false);   // Saturday
    expect(inSchoolHours(Date.parse('2026-12-08T13:00:00Z'))).toBe(true);    // 08:00 EST
  });
});

describe('buildProbeRow — no addresses survive', () => {
  it('drops address-carrying junk anywhere in p2p / conn / ua / errors', () => {
    const row = buildProbeRow({
      studentId: 'S1', section: 'PeriodB', now: SCHOOL_TIME,
      body: {
        rttRoster: 10,
        p2p: { connected: true, rtt: 12.5, localPair: { local: '192.168.1.5', remote: 'host', address: '10.0.0.2' }, candidates: { host: 2, mdns: true, raw: 'abc.local' }, error: '10.1.2.3 refused', sdp: SDP, ip: 'fe80::1' },
        conn: { effectiveType: '4g', type: 'wifi', ssid: 'school.lan', rtt: 50 },
        ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/141.0.0.0 host 10.0.0.9',
        errors: { rttRoster: 'timeout', p2p: 'host athena.local unreachable', evil: '1.2.3.4' },
      },
    });
    const text = JSON.stringify(row);
    expect(text).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(text).not.toMatch(/\.local/);
    expect(text).not.toMatch(/fe80/);
    expect(text).not.toMatch(/school\.lan/);
    expect(row.p2p.localPair).toEqual({ local: null, remote: 'host' });
    expect(row.p2p.error).toBe('other');
    expect(row.p2p.rtt).toBe(12.5);
    expect(row.p2p).not.toHaveProperty('sdp');
    expect(row.conn).toEqual({ effectiveType: '4g', type: 'wifi', rtt: 50 });
    expect(row.errors).toEqual({ rttRoster: 'timeout', p2p: 'other' });
    expect(row.in_school_hours).toBe(true);
    expect(looksLikeAddress(row.ua || '')).toBe(false);
  });
});

describe('routes', () => {
  it('GET /net/probe/config reports the kill-switch, a null LAN relay, and Google STUN', async () => {
    const s = await start();
    try {
      let r = await s.call('GET', '/net/probe/config');
      expect(r.body).toMatchObject({ enabled: true, lanRelayUrl: null, stun: ['stun:stun.l.google.com:19302'] });
      for (const off of ['false', '0', 'no', 'OFF']) {
        process.env.NET_PROBE_ENABLED = off;
        r = await s.call('GET', '/net/probe/config');
        expect(r.body.enabled, off).toBe(false);
      }
    } finally { s.close(); }
  });

  it('POST /net/probe stores a cleaned student record with the ROSTER section', async () => {
    const s = await start();
    try {
      const r = await s.call('POST', '/net/probe', { sid: 'S1', body: { ...RECORD, section: 'PeriodE' } });
      expect(r.status).toBe(200);
      expect(r.body.inSchoolHours).toBe(true);
      expect(s.rows).toHaveLength(1);
      expect(s.rows[0]).toMatchObject({ student_id: 'S1', section: 'PeriodB', rtt_roster: 42.4, rtt_relay: 61, in_school_hours: true });
      expect(s.rows[0].p2p.localPair).toEqual({ local: 'host', remote: 'host' });
    } finally { s.close(); }
  });

  it('refuses signed-out, teacher, preview and disabled runs; rejects a bad shape', async () => {
    const s = await start();
    try {
      expect((await s.call('POST', '/net/probe', { body: RECORD })).status).toBe(401);
      expect((await s.call('POST', '/net/probe', { sid: 'T1', body: RECORD })).status).toBe(403);
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: { ...RECORD, preview: true } })).status).toBe(403);
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: { ...RECORD, rttRoster: 'fast' } })).status).toBe(400);
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: { ...RECORD, p2p: [1] } })).status).toBe(400);
      process.env.NET_PROBE_ENABLED = 'off';
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: RECORD })).status).toBe(403);
      expect(s.rows).toHaveLength(0);
    } finally { s.close(); }
  });

  it('caps records per student per day', async () => {
    const s = await start();
    try {
      for (let i = 0; i < 5; i++) expect((await s.call('POST', '/net/probe', { sid: 'S1', body: RECORD })).status).toBe(200);
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: RECORD })).status).toBe(429);
      expect((await s.call('POST', '/net/probe', { sid: 'S2', body: RECORD })).status).toBe(200);
    } finally { s.close(); }
  });

  it('503 until migration 0040 runs', async () => {
    const s = await start({ storeError: { code: '42P01', message: 'relation "net_probes" does not exist' } });
    try {
      expect((await s.call('POST', '/net/probe', { sid: 'S1', body: RECORD })).status).toBe(503);
      expect((await s.call('GET', '/class/net-probes', { teacher: true })).status).toBe(503);
    } finally { s.close(); }
  });

  it('signaling: offer → classmate claims → answer → owner reads it; section and ownership enforced', async () => {
    const s = await start();
    try {
      const offer = await s.call('POST', '/net/probe/offer', { sid: 'S1', body: { sdp: SDP } });
      expect(offer.status).toBe(200);
      const offerId = offer.body.offerId;

      // Self and other sections never see it.
      expect((await s.call('GET', '/net/probe/pending?section=PeriodB', { sid: 'S1' })).body.offer).toBeNull();
      expect((await s.call('GET', '/net/probe/pending?section=PeriodB', { sid: 'S3' })).body.offer).toBeNull();

      const pending = await s.call('GET', '/net/probe/pending?section=PeriodB', { sid: 'S2' });
      expect(pending.body.offer).toEqual({ offerId, sdp: SDP });
      // Claimed: nobody else gets it.
      expect((await s.call('GET', '/net/probe/pending?section=PeriodB', { sid: 'S2' })).body.offer).toBeNull();

      expect((await s.call('GET', '/net/probe/answer/' + offerId, { sid: 'S1' })).body.answer).toBeNull();
      expect((await s.call('POST', '/net/probe/answer/' + offerId, { sid: 'S3', body: { sdp: SDP } })).status).toBe(403);
      expect((await s.call('POST', '/net/probe/answer/' + offerId, { sid: 'S2', body: { sdp: 'nope' } })).status).toBe(400);
      expect((await s.call('POST', '/net/probe/answer/' + offerId, { sid: 'S2', body: { sdp: SDP } })).status).toBe(200);
      expect((await s.call('GET', '/net/probe/answer/' + offerId, { sid: 'S2' })).status).toBe(403);
      expect((await s.call('GET', '/net/probe/answer/' + offerId, { sid: 'S1' })).body.answer).toBe(SDP);
      expect((await s.call('GET', '/net/probe/answer/nope', { sid: 'S1' })).status).toBe(404);
      // Teachers do not take part.
      expect((await s.call('POST', '/net/probe/offer', { sid: 'T1', body: { sdp: SDP } })).status).toBe(403);
    } finally { s.close(); }
  });

  it('GET /class/net-probes is teacher-only and returns rows + summary', async () => {
    const s = await start();
    try {
      await s.call('POST', '/net/probe', { sid: 'S1', body: RECORD });
      await s.call('POST', '/net/probe', { sid: 'S2', body: { ...RECORD, rttRoster: 80, p2p: { error: 'noPeer', candidates: { host: 1, srflx: 1 } } } });
      await s.call('POST', '/net/probe', { sid: 'S3', body: { ...RECORD, p2p: { error: 'policy' } } });
      expect((await s.call('GET', '/class/net-probes', { sid: 'S1' })).status).toBe(401);
      const r = await s.call('GET', '/class/net-probes?days=7', { teacher: true });
      expect(r.status).toBe(200);
      expect(r.body.days).toBe(7);
      expect(r.body.rows).toHaveLength(3);
      const b = r.body.summary.find(x => x.section === 'PeriodB');
      expect(b.inSchool).toMatchObject({ samples: 2, students: 2, medianRttRoster: 61.2, peerFound: 1, p2pConnected: 1, hostHost: 1, mdnsSeen: 0.5, policyBlocked: 0, noPeer: 0.5 });
      expect(b.atHome.samples).toBe(0);
      const e = r.body.summary.find(x => x.section === 'PeriodE');
      expect(e.inSchool.policyBlocked).toBe(1);
      const only = await s.call('GET', '/class/net-probes?section=PeriodE', { teacher: true });
      expect(only.body.rows).toHaveLength(1);
    } finally { s.close(); }
  });
});

describe('summarizeProbes', () => {
  it('splits in-school / at-home and computes srflx-only over connected runs', () => {
    const rows = [
      { student_id: 'a', section: 'PeriodB', in_school_hours: true, rtt_roster: 10, rtt_relay: null, p2p: { connected: true, localPair: { local: 'srflx', remote: 'host' }, candidates: { host: 1, srflx: 1, mdns: false } } },
      { student_id: 'b', section: 'PeriodB', in_school_hours: true, rtt_roster: 30, rtt_relay: 20, p2p: { connected: true, localPair: { local: 'host', remote: 'host' } } },
      { student_id: 'a', section: 'PeriodB', in_school_hours: false, rtt_roster: 50, rtt_relay: 70, p2p: { connected: false, error: 'iceFailed' } },
    ];
    const [b] = summarizeProbes(rows);
    expect(b.inSchool).toMatchObject({ samples: 2, students: 2, medianRttRoster: 20, medianRttRelay: 20, p2pConnected: 1, hostHost: 0.5, srflxOnly: 0.5, mdnsSeen: 0 });
    expect(b.atHome).toMatchObject({ samples: 1, peerFound: 1, p2pConnected: 0, hostHost: null });
  });
});

describe('createSignalStore', () => {
  it('expires offers after the 60 s TTL and keeps one open offer per student', () => {
    let t = 0;
    const store = createSignalStore({ now: () => t });
    const first = store.addOffer({ studentId: 'S1', section: 'B', sdp: SDP });
    const second = store.addOffer({ studentId: 'S1', section: 'B', sdp: SDP });
    expect(store.get(first)).toBeNull();
    expect(store.size()).toBe(1);
    t = SIGNAL_TTL_MS + 1;
    expect(store.get(second)).toBeNull();
    expect(store.claimPending({ studentId: 'S2', section: 'B' })).toBeNull();
  });
});
