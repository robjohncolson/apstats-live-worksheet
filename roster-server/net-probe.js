// net-probe.js — passive classroom network probe (NET_PROBE_SPEC.md).
//
// Data gathering only; NOT grade-affecting. Nothing here reads or writes a grade table.
//
//   GET  /net/probe/config          {enabled, lanRelayUrl: null, stun}           (public)
//   POST /net/probe                 store one probe record                        (student session)
//   POST /net/probe/offer           {sdp} -> {offerId}  (in memory, 60 s TTL)     (student session)
//   GET  /net/probe/pending         one open offer from a classmate, or null      (student session)
//   POST /net/probe/answer/:id      {sdp}  (only the student who claimed it)      (student session)
//   GET  /net/probe/answer/:id      {answer: sdp|null}  (only the offer's owner)  (student session)
//   GET  /class/net-probes          raw rows + per-section summary               (teacher)
//
// Privacy: no IP address, hostname or candidate string is ever stored. The record is REBUILT from a
// whitelist of typed fields (enums, numbers, booleans) and then checked once more for anything that
// looks like an address. SDP (which must carry addresses to work) lives only in memory for 60 s and
// is only handed to a classmate in the same section.
//
// Kill-switch: NET_PROBE_ENABLED (default on; 'false' / '0' / 'no' / 'off' turn it off).
// Table: migration 0040_net_probes.sql. Until it runs, the store routes answer 503.

import { randomUUID } from 'node:crypto';
import { requireTeacher } from './teacher-auth.js';
import { createServiceClient } from './ledger-db.js';

export const STUN_URLS = ['stun:stun.l.google.com:19302'];
export const SIGNAL_TTL_MS = 60 * 1000;
const MAX_SDP_LENGTH = 16000;
const MAX_RECORDS_PER_DAY = 5;          // per student, in memory (the Desk sends one per device per day)
const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;
const ROW_LIMIT = 5000;
const SCHOOL_TZ = 'America/New_York';

const CANDIDATE_TYPES = ['host', 'srflx', 'prflx', 'relay'];
const P2P_ERRORS = [
  'noPeer', 'gatherTimeout', 'iceFailed', 'policy', 'signalFailed', 'connectTimeout',
  'pingFailed', 'noStats', 'timeout', 'budget', 'http', 'network', 'other',
];
const EFFECTIVE_TYPES = ['slow-2g', '2g', '3g', '4g'];
const CONN_TYPES = ['bluetooth', 'cellular', 'ethernet', 'none', 'wifi', 'wimax', 'other', 'unknown'];
const ERROR_STEPS = ['config', 'rttRoster', 'rttRelay', 'p2p', 'stats', 'post'];

// ── Kill-switch ──────────────────────────────────────────────────────────────

export function netProbeEnabled() {
  const raw = String(process.env.NET_PROBE_ENABLED || 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(raw);
}

// ── School hours (server-side, America/New_York) ─────────────────────────────

// Weekday 07:30–15:30 in New York. `now` is anything new Date() accepts.
export function inSchoolHours(now) {
  const instant = now === undefined ? new Date() : new Date(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type) => (parts.find(p => p.type === type) || {}).value;
  const weekday = part('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  return minutes >= 7 * 60 + 30 && minutes < 15 * 60 + 30;
}

function schoolDay(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now === undefined ? Date.now() : now));
}

// ── Address scrubbing (the second line of defence) ───────────────────────────

const IPV4_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const IPV6_RE = /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/i;
const HOSTNAME_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i;   // anything dotted, incl. <uuid>.local

export function looksLikeAddress(text) {
  const s = String(text);
  return IPV4_RE.test(s) || IPV6_RE.test(s) || HOSTNAME_RE.test(s);
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function msOrNull(v) {
  if (!isNum(v) || v < 0 || v > 60000) return null;
  return Math.round(v * 10) / 10;
}

function countOrZero(v) {
  if (!isNum(v) || v < 0) return 0;
  return Math.min(Math.floor(v), 1000);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function errorCode(value) {
  if (value === undefined || value === null || value === '') return null;
  return P2P_ERRORS.includes(value) ? value : 'other';
}

function cleanLocalPair(pair) {
  if (!pair || typeof pair !== 'object') return null;
  const local = pick(pair.local, CANDIDATE_TYPES);
  const remote = pick(pair.remote, CANDIDATE_TYPES);
  if (!local && !remote) return null;
  return { local, remote };
}

function cleanCandidates(c) {
  if (!c || typeof c !== 'object') return null;
  const out = { mdns: c.mdns === true };
  for (const type of CANDIDATE_TYPES) out[type] = countOrZero(c[type]);
  return out;
}

// Rebuild p2p from known fields only. Unknown keys (and their values) are dropped.
export function cleanP2p(p) {
  if (!p || typeof p !== 'object') return {};
  return {
    connected: p.connected === true,
    rtt: msOrNull(p.rtt),
    localPair: cleanLocalPair(p.localPair),
    candidates: cleanCandidates(p.candidates),
    error: errorCode(p.error),
    role: pick(p.role, ['offer', 'answer']),
  };
}

export function cleanConn(c) {
  if (!c || typeof c !== 'object') return {};
  const out = {};
  const effectiveType = pick(c.effectiveType, EFFECTIVE_TYPES);
  if (effectiveType) out.effectiveType = effectiveType;
  const type = pick(c.type, CONN_TYPES);
  if (type) out.type = type;
  if (isNum(c.rtt) && c.rtt >= 0 && c.rtt < 60000) out.rtt = Math.round(c.rtt);
  if (isNum(c.downlink) && c.downlink >= 0 && c.downlink < 100000) out.downlink = Math.round(c.downlink * 100) / 100;
  if (c.saveData === true) out.saveData = true;
  return out;
}

export function cleanErrors(e) {
  if (!e || typeof e !== 'object') return {};
  const out = {};
  for (const step of ERROR_STEPS) {
    const code = errorCode(e[step]);
    if (code) out[step] = code;
  }
  return out;
}

// "Chrome 141; Chrome OS". No dots or colons survive, so no address or hostname can.
export function cleanUa(ua) {
  if (typeof ua !== 'string') return null;
  const text = ua.replace(/[^A-Za-z0-9 ;()_-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return text || null;
}

// Every string inside a value (keys included). Numbers are skipped: "12.5" is a timing, not a host.
function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...stringsIn(inner)]);
}

// Belt and braces: whatever the whitelist produced, nothing address-shaped may remain.
function assertNoAddresses(record) {
  for (const key of ['p2p', 'conn', 'errors', 'ua']) {
    const dirty = stringsIn(record[key]).some(looksLikeAddress);
    if (!dirty) continue;
    record[key] = typeof record[key] === 'string' ? null : {};
  }
  return record;
}

// Validate the posted body's SHAPE. Returns an error string, or null when acceptable.
export function validateProbeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body must be an object';
  for (const key of ['rttRoster', 'rttRelay']) {
    if (body[key] !== undefined && body[key] !== null && !isNum(body[key])) return key + ' must be a number or null';
  }
  for (const key of ['p2p', 'conn', 'errors']) {
    const v = body[key];
    if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) return key + ' must be an object';
  }
  if (body.ua !== undefined && body.ua !== null && typeof body.ua !== 'string') return 'ua must be a string';
  return null;
}

// Build the stored row (snake_case, the table's columns) from a validated body.
export function buildProbeRow({ body, studentId, section, now }) {
  const row = {
    student_id: studentId,
    section,
    ts: new Date(now === undefined ? Date.now() : now).toISOString(),
    in_school_hours: inSchoolHours(now),
    rtt_roster: msOrNull(body.rttRoster),
    rtt_relay: msOrNull(body.rttRelay),
    p2p: cleanP2p(body.p2p),
    conn: cleanConn(body.conn),
    ua: cleanUa(body.ua),
    errors: cleanErrors(body.errors),
  };
  return assertNoAddresses(row);
}

// ── Summary for the teacher view ─────────────────────────────────────────────

function median(values) {
  const sorted = values.filter(isNum).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function rate(hits, of) {
  if (!of) return null;
  return Math.round((hits / of) * 1000) / 1000;
}

function isHostHost(p2p) {
  const pair = p2p && p2p.localPair;
  return !!pair && pair.local === 'host' && pair.remote === 'host';
}

// srflx-only = connected, but NOT host↔host, and the pair went through a NAT-mapped address.
// That is the "client isolation" signature: the classmates found each other only from outside.
function isSrflxOnly(p2p) {
  const pair = p2p && p2p.localPair;
  if (!p2p || !p2p.connected || !pair || isHostHost(p2p)) return false;
  const natTypes = ['srflx', 'prflx'];
  return natTypes.includes(pair.local) || natTypes.includes(pair.remote);
}

// One cell (a section × in-school / at-home). Denominators:
//   p2pConnected  over runs that found a peer (error not noPeer / policy)
//   hostHost      over connected runs
//   srflxOnly     over connected runs
//   mdnsSeen      over runs that gathered at least one candidate
//   policyBlocked over all runs
export function summarizeCell(rows) {
  const p2ps = rows.map(r => r.p2p || {});
  const attempted = p2ps.filter(p => p.connected || (p.error && p.error !== 'noPeer' && p.error !== 'policy'));
  const connected = p2ps.filter(p => p.connected);
  const gathered = p2ps.filter(p => p.candidates && CANDIDATE_TYPES.some(t => p.candidates[t] > 0));
  return {
    samples: rows.length,
    students: new Set(rows.map(r => r.student_id)).size,
    medianRttRoster: median(rows.map(r => (r.rtt_roster === null ? NaN : Number(r.rtt_roster)))),
    medianRttRelay: median(rows.map(r => (r.rtt_relay === null ? NaN : Number(r.rtt_relay)))),
    medianRttP2p: median(connected.map(p => p.rtt)),
    peerFound: attempted.length,
    p2pConnected: rate(connected.length, attempted.length),
    connectedRuns: connected.length,
    hostHost: rate(connected.filter(isHostHost).length, connected.length),
    srflxOnly: rate(connected.filter(isSrflxOnly).length, connected.length),
    gatheredRuns: gathered.length,
    mdnsSeen: rate(gathered.filter(p => p.candidates.mdns).length, gathered.length),
    policyBlocked: rate(p2ps.filter(p => p.error === 'policy').length, rows.length),
    noPeer: rate(p2ps.filter(p => p.error === 'noPeer').length, rows.length),
  };
}

export function summarizeProbes(rows) {
  const bySection = new Map();
  for (const row of rows) {
    const section = row.section || '(none)';
    if (!bySection.has(section)) bySection.set(section, { school: [], home: [] });
    bySection.get(section)[row.in_school_hours ? 'school' : 'home'].push(row);
  }
  return [...bySection.keys()].sort().map(section => ({
    section,
    inSchool: summarizeCell(bySection.get(section).school),
    atHome: summarizeCell(bySection.get(section).home),
  }));
}

// ── Store (Supabase) ─────────────────────────────────────────────────────────

export function createNetProbeStore(client) {
  return {
    async insert(row) {
      return client.from('net_probes').insert([row]).select('id').single();
    },
    async list({ since, section }) {
      let query = client.from('net_probes').select('*').gte('ts', since);
      if (section) query = query.eq('section', section);
      return query.order('ts', { ascending: false }).limit(ROW_LIMIT);
    },
  };
}

// Built lazily so a missing service key never breaks boot (or tests that never touch the probe).
function lazyLiveStore() {
  let store = null;
  return {
    async insert(row) { store = store || createNetProbeStore(createServiceClient()); return store.insert(row); },
    async list(opts) { store = store || createNetProbeStore(createServiceClient()); return store.list(opts); },
  };
}

function isTableMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  if (['42P01', 'PGRST205'].includes(code)) return true;
  return msg.includes('net_probes') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'net probe not provisioned (run migration 0040)' });
}

// ── In-memory signaling (60 s TTL; never persisted) ──────────────────────────

export function createSignalStore({ now = () => Date.now() } = {}) {
  const offers = new Map();   // offerId -> { offerId, studentId, section, sdp, createdAt, claimedBy, answer }

  function prune() {
    const cutoff = now() - SIGNAL_TTL_MS;
    for (const [id, offer] of offers) {
      if (offer.createdAt < cutoff) offers.delete(id);
    }
  }

  return {
    // One open offer per student: a new one replaces the old.
    addOffer({ studentId, section, sdp }) {
      prune();
      for (const [id, offer] of offers) {
        if (offer.studentId === studentId) offers.delete(id);
      }
      const offerId = randomUUID();
      offers.set(offerId, { offerId, studentId, section, sdp, createdAt: now(), claimedBy: null, answer: null });
      return offerId;
    },
    // The oldest unclaimed offer from a classmate (same section, not self). Claiming is atomic here.
    claimPending({ studentId, section }) {
      prune();
      for (const offer of offers.values()) {
        if (offer.section !== section) continue;
        if (offer.studentId === studentId) continue;
        if (offer.claimedBy) continue;
        offer.claimedBy = studentId;
        return { offerId: offer.offerId, sdp: offer.sdp };
      }
      return null;
    },
    get(offerId) {
      prune();
      return offers.get(offerId) || null;
    },
    size() { prune(); return offers.size; },
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

function extractToken(req) {
  const h = req.headers['authorization'];
  if (typeof h === 'string' && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim() || null;
  return null;
}

function validSdp(sdp) {
  return typeof sdp === 'string' && sdp.length > 0 && sdp.length <= MAX_SDP_LENGTH && sdp.startsWith('v=0');
}

export function mountNetProbe(app, { db, verifyToken, store, signals, now = () => Date.now() } = {}) {
  const probeStore = store || lazyLiveStore();
  const signalStore = signals || createSignalStore({ now });
  const postsToday = new Map();   // `${studentId}|${day}` -> count

  // Resolve the caller to a STUDENT (never a teacher, never a preview run). Sends the error itself
  // and returns null on any failure.
  async function requireStudent(req, res) {
    if (!netProbeEnabled()) {
      res.status(403).json({ ok: false, error: 'net probe disabled' });
      return null;
    }
    const token = extractToken(req);
    let studentId = null;
    try { studentId = token ? verifyToken(token) : null; } catch (_) { studentId = null; }
    if (!studentId) {
      res.status(401).json({ ok: false, error: 'sign in required' });
      return null;
    }
    let row = null;
    try {
      const result = await db.findByStudentId(studentId);
      row = result && result.data;
    } catch (_) { row = null; }
    if (!row || !row.section) {
      res.status(401).json({ ok: false, error: 'unknown student' });
      return null;
    }
    if (row.role === 'teacher') {
      res.status(403).json({ ok: false, error: 'teacher runs are not recorded' });
      return null;
    }
    if (req.body && req.body.preview === true) {
      res.status(403).json({ ok: false, error: 'preview runs are not recorded' });
      return null;
    }
    return { studentId, section: row.section };
  }

  app.get('/net/probe/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, enabled: netProbeEnabled(), lanRelayUrl: null, stun: STUN_URLS });
  });

  app.post('/net/probe', async (req, res) => {
    const who = await requireStudent(req, res);
    if (!who) return;
    const problem = validateProbeBody(req.body);
    if (problem) return res.status(400).json({ ok: false, error: problem });

    const key = who.studentId + '|' + schoolDay(now());
    const count = postsToday.get(key) || 0;
    if (count >= MAX_RECORDS_PER_DAY) return res.status(429).json({ ok: false, error: 'daily probe limit reached' });

    const row = buildProbeRow({ body: req.body, studentId: who.studentId, section: who.section, now: now() });
    let result;
    try {
      result = await probeStore.insert(row);
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'store failed' });
    }
    if (result && result.error) {
      if (isTableMissing(result.error)) return notProvisioned(res);
      return res.status(500).json({ ok: false, error: 'store failed' });
    }
    postsToday.set(key, count + 1);
    return res.json({ ok: true, inSchoolHours: row.in_school_hours });
  });

  app.post('/net/probe/offer', async (req, res) => {
    const who = await requireStudent(req, res);
    if (!who) return;
    const sdp = req.body && req.body.sdp;
    if (!validSdp(sdp)) return res.status(400).json({ ok: false, error: 'bad sdp' });
    const offerId = signalStore.addOffer({ studentId: who.studentId, section: who.section, sdp });
    return res.json({ ok: true, offerId, ttlMs: SIGNAL_TTL_MS });
  });

  // ?section= is accepted for the spec's shape, but the caller's ROSTER section always wins.
  app.get('/net/probe/pending', async (req, res) => {
    const who = await requireStudent(req, res);
    if (!who) return;
    res.setHeader('Cache-Control', 'no-store');
    const offer = signalStore.claimPending({ studentId: who.studentId, section: who.section });
    return res.json({ ok: true, offer });
  });

  app.post('/net/probe/answer/:offerId', async (req, res) => {
    const who = await requireStudent(req, res);
    if (!who) return;
    const offer = signalStore.get(req.params.offerId);
    if (!offer) return res.status(404).json({ ok: false, error: 'offer expired' });
    if (offer.claimedBy !== who.studentId) return res.status(403).json({ ok: false, error: 'not your offer to answer' });
    const sdp = req.body && req.body.sdp;
    if (!validSdp(sdp)) return res.status(400).json({ ok: false, error: 'bad sdp' });
    offer.answer = sdp;
    return res.json({ ok: true });
  });

  app.get('/net/probe/answer/:offerId', async (req, res) => {
    const who = await requireStudent(req, res);
    if (!who) return;
    res.setHeader('Cache-Control', 'no-store');
    const offer = signalStore.get(req.params.offerId);
    if (!offer) return res.status(404).json({ ok: false, error: 'offer expired' });
    if (offer.studentId !== who.studentId) return res.status(403).json({ ok: false, error: 'not your offer' });
    return res.json({ ok: true, answer: offer.answer });
  });

  app.get('/class/net-probes', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'teacher only' });
    res.setHeader('Cache-Control', 'no-store');
    const section = typeof req.query.section === 'string' && req.query.section ? req.query.section : null;
    const asked = Number(req.query.days);
    const days = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_DAYS) : DEFAULT_DAYS;
    const since = new Date(now() - days * 24 * 60 * 60 * 1000).toISOString();

    let result;
    try {
      result = await probeStore.list({ since, section });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'read failed' });
    }
    if (result && result.error) {
      if (isTableMissing(result.error)) return notProvisioned(res);
      return res.status(500).json({ ok: false, error: 'read failed' });
    }
    const rows = (result && result.data) || [];
    return res.json({
      ok: true,
      enabled: netProbeEnabled(),
      section,
      days,
      since,
      summary: summarizeProbes(rows),
      rows,
    });
  });
}
