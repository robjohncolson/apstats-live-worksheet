// wallet-stakes-routes.test.js — the bet endpoints (STUDY_BREAK_STAKES_SPEC §4): the
// HTTP contract only (validation / auth / kill-switch / status→code mapping / casino
// tallies). The escrow MATH is proven against the real plpgsql in
// wallet-stakes-conservation.test.js; here the bet RPCs are canned-status stubs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { mountDogeWallet } from '../doge-wallet.js';

const SEC = 'PeriodB';
const UID = '00000000-0000-4000-8000-000000000001';
const OPP = '00000000-0000-4000-8000-000000000002';
const roster = [
  { student_id: UID, section: SEC, username: 'apple_fox', role: 'student', status: 'active' },
  { student_id: OPP, section: SEC, username: 'bo_cat', role: 'student', status: 'active' },
  { student_id: '00000000-0000-4000-8000-000000000003', section: 'PeriodC', username: 'far_owl', role: 'student', status: 'active' },
];

// `betOpen`/`betResolve` = the canned status the (fake) RPC returns; `settled` = the
// fake listSettledBets rows for the casino endpoints.
function start({ betOpen = 'opened', betResolve = 'pending', settled = [], isTeacher = false } = {}) {
  const db = {
    async findByUsername(u) {
      const row = roster.find((r) => r.username === String(u).toLowerCase());
      return { data: row || null, error: row ? null : { code: 'PGRST116' } };
    },
    async findByStudentId(id) { const r = roster.find((x) => x.student_id === id); return { data: r || null, error: null }; },
    async getDogeAccount(id) { return { data: { student_id: id, candy_escrowed: 1 }, error: null }; },
    async getRoleByStudentId() { return isTeacher ? 'teacher' : 'student'; },
    async listRoster(section) { return { data: roster.filter((r) => !section || r.section === section), error: null }; },
    async tetrisBetOpen() { return { data: betOpen, error: null }; },
    async tetrisBetResolve() { return { data: betResolve, error: null }; },
    async tetrisBetRefund() { return { data: 'refunded', error: null }; },
    async listStaleBets() { return { data: [], error: null }; },
    async listSettledBets() { return { data: settled, error: null }; },
  };
  const ledgerDb = { async getLedgerByStudent() { return { data: [], error: null }; } };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, { db, ledgerDb, verifyToken: (t) => (t && t.startsWith('tok:')) ? t.slice(4) : null, getPrice: async () => 0.088 });
  return http.createServer(app);
}

async function req(server, method, path, { token, secret, body } = {}) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body: json };
}

const openBody = { matchId: 'm1', opponentUsername: 'bo_cat' };

describe('POST /wallet/bet/open', () => {
  beforeEach(() => { process.env.STAKES_ENABLED = 'true'; process.env.ROSTER_TEACHER_SECRET = 'TS'; });
  afterEach(() => { delete process.env.STAKES_ENABLED; });

  it('403 when stakes are turned off', async () => {
    process.env.STAKES_ENABLED = 'false';
    const r = await req(start(), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: openBody });
    expect(r.status).toBe(403);
  });
  it('401 without a token', async () => {
    const r = await req(start(), 'POST', '/wallet/bet/open', { body: openBody });
    expect(r.status).toBe(401);
  });
  it('400 without matchId/opponent', async () => {
    const r = await req(start(), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: {} });
    expect(r.status).toBe(400);
  });
  it('404 for an unknown opponent', async () => {
    const r = await req(start(), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: { matchId: 'm', opponentUsername: 'ghost' } });
    expect(r.status).toBe(404);
  });
  it("400 when you bet yourself", async () => {
    const r = await req(start(), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: { matchId: 'm', opponentUsername: 'apple_fox' } });
    expect(r.status).toBe(400);
  });
  it('404 for an opponent in another section', async () => {
    const r = await req(start(), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: { matchId: 'm', opponentUsername: 'far_owl' } });
    expect(r.status).toBe(404);
  });
  it('400 + "need 1 candy" when the escrow guard fails (insufficient)', async () => {
    const r = await req(start({ betOpen: 'insufficient' }), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: openBody });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/1 candy/);
  });
  it('404 (opaque) when the caller is not a player in that match', async () => {
    const r = await req(start({ betOpen: 'not-a-player' }), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: openBody });
    expect(r.status).toBe(404);   // opaque: indistinguishable from a non-existent match
  });
  it('200 + status on a join (waiting) and on escrow (opened)', async () => {
    const w = await req(start({ betOpen: 'waiting' }), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: openBody });
    expect(w.status).toBe(200); expect(w.body.status).toBe('waiting'); expect(w.body.stake).toBe(1);
    const o = await req(start({ betOpen: 'opened' }), 'POST', '/wallet/bet/open', { token: 'tok:' + UID, body: openBody });
    expect(o.status).toBe(200); expect(o.body.status).toBe('opened');
  });
});

describe('POST /wallet/bet/resolve', () => {
  beforeEach(() => { process.env.STAKES_ENABLED = 'true'; });
  afterEach(() => { delete process.env.STAKES_ENABLED; });

  const body = { matchId: 'm1', winnerUsername: 'apple_fox' };
  it('403 when stakes are off', async () => {
    process.env.STAKES_ENABLED = 'off';
    const r = await req(start(), 'POST', '/wallet/bet/resolve', { token: 'tok:' + UID, body });
    expect(r.status).toBe(403);
  });
  it('404 for an unknown winner username', async () => {
    const r = await req(start(), 'POST', '/wallet/bet/resolve', { token: 'tok:' + UID, body: { matchId: 'm', winnerUsername: 'ghost' } });
    expect(r.status).toBe(404);
  });
  it('maps resolve statuses: pending/settled/refunded → 200, no-bet/not-a-player → 404 (opaque), bad-winner → 400', async () => {
    for (const [s, code] of [['pending', 200], ['settled', 200], ['refunded', 200], ['no-bet', 404], ['not-a-player', 404], ['bad-winner', 400]]) {
      const r = await req(start({ betResolve: s }), 'POST', '/wallet/bet/resolve', { token: 'tok:' + UID, body });
      expect(r.status, s).toBe(code);
      if (code === 200) expect(r.body.status).toBe(s);
    }
  });
});

describe('GET /wallet/casino + /class/casino', () => {
  const bets = [
    { player_a: UID, player_b: OPP, winner: UID, stake: 1 },   // UID win
    { player_a: OPP, player_b: UID, winner: OPP, stake: 1 },   // UID loss
    { player_a: UID, player_b: OPP, winner: UID, stake: 1 },   // UID win
  ];
  it('the student sees their own W-L and net', async () => {
    const r = await req(start({ settled: bets }), 'GET', '/wallet/casino', { token: 'tok:' + UID });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ wins: 2, losses: 1, games: 3, netCandy: 1 });
  });
  it('/class/casino is teacher-gated', async () => {
    const r = await req(start({ settled: bets }), 'GET', '/class/casino', { token: 'tok:' + UID });
    expect(r.status).toBe(401);
  });
  it('the teacher sees per-student tallies', async () => {
    process.env.ROSTER_TEACHER_SECRET = 'TS';
    const r = await req(start({ settled: bets, isTeacher: true }), 'GET', '/class/casino', { token: 'tok:' + UID, secret: 'TS' });
    expect(r.status).toBe(200);
    const me = r.body.players.find((p) => p.studentId === UID);
    expect(me).toMatchObject({ wins: 2, losses: 1, netCandy: 1 });
  });
});
