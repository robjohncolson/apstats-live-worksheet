// review.test.js — Nightly Review (NIGHTLY_REVIEW_SPEC.md) Phase 1 server.
// Covers: issueReviewReceipt (signed + comment-hash binds), GET /class/review-queue
// (priority order, unseen counts, daysSinceReview, since/window), POST /class/review
// (mark seen, signed receipt persisted, candy minted ONCE/student/day, notify only on a
// comment, idempotent re-mark), the /ledger/student review augment, and a pglite block
// that runs migration 0025 to prove the candy_bonus mint + that it becomes spendable.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import express from 'express';
import http from 'http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountReview, itemPriority, responseSnippet } from '../review.js';
import { mountLedger } from '../ledger.js';
import { initReceipts, issueReviewReceipt, getReceiptIssuer } from '../receipts.js';
import { verifyCompact, publicKeyFromX, verifySnapshot } from '../snapshot-verify.js';
import { buildStudentEntry } from '../admin-snapshot.js';
import { normalizeReviews } from '../admin-restore.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';
const TEACHER_SECRET = 'test-teacher-secret';
const SID_A = '00000000-0000-4000-8000-00000000000a';
const SID_B = '00000000-0000-4000-8000-00000000000b';

let savedKey, savedSecret;
beforeAll(() => {
  savedKey = process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  savedSecret = process.env.ROSTER_TEACHER_SECRET;
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
  initReceipts();
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.RECEIPT_ISSUER_PRIVATE_KEY; else process.env.RECEIPT_ISSUER_PRIVATE_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.ROSTER_TEACHER_SECRET; else process.env.ROSTER_TEACHER_SECRET = savedSecret;
  initReceipts();
});

// ── A fake roster+review db and a fake ledger db, in-memory ───────────────────
function makeWorld() {
  const roster = {
    [SID_A]: { student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana Apple', section: 'PeriodX', role: 'student' },
    [SID_B]: { student_id: SID_B, login_username: 'berry_owl', real_name: 'Ben Berry', section: 'PeriodX', role: 'student' },
  };
  const reviewMarks = new Map();     // ledger_id → mark row
  const grants = new Set();          // `sid|date`
  const ledger = [];                 // item_ledger rows
  const nudges = [];                 // sent teacher→student rows

  const db = {
    async listRoster() { return { data: Object.values(roster), error: null }; },
    async findByStudentId(sid) { return { data: roster[sid] || null, error: null }; },
    async findTeacherUsername() { return { data: { login_username: 'teach', section: 'PeriodX' }, error: null }; },
    async getRoleByStudentId() { return 'teacher'; },
    async listReviewMarksByStudents(ids) {
      return { data: Array.from(reviewMarks.values()).filter((m) => ids.includes(m.student_id)), error: null };
    },
    async listReviewMarksByStudent(sid) {
      return { data: Array.from(reviewMarks.values()).filter((m) => m.student_id === sid), error: null };
    },
    async upsertReviewMark(row) {
      const stored = {
        review_id: reviewMarks.get(row.ledgerId)?.review_id || ('rv-' + row.ledgerId),
        ledger_id: row.ledgerId, student_id: row.studentId, teacher_username: row.teacherUsername,
        seen_at: row.seenAt, comment: row.comment ?? null, candy_awarded: row.candyAwarded ?? 0,
        receipt_id: row.receiptId ?? null, receipt_compact: row.receiptCompact ?? null,
      };
      reviewMarks.set(row.ledgerId, stored);
      return { data: stored, error: null };
    },
    async reviewAward(sid, date) {
      const key = sid + '|' + date;
      if (grants.has(key)) return { data: 0, error: null };
      grants.add(key);
      return { data: 1, error: null };
    },
  };
  const ledgerDb = {
    async getLedgerByStudent(sid) {
      return { data: ledger.filter((r) => r.student_id === sid).sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0)), error: null };
    },
    async getRowsByLedgerIds(ids) { return { data: ledger.filter((r) => ids.includes(r.ledger_id)), error: null }; },
  };
  const nudgesDb = { async insertNudges(args) { nudges.push(args); return { data: [], error: null }; } };
  return { db, ledgerDb, nudgesDb, ledger, reviewMarks, grants, nudges, roster };
}

let seq = 0;
function addRow(world, sid, over = {}) {
  const row = {
    ledger_id: '00000000-0000-4000-9000-' + String(++seq).padStart(12, '0'),
    student_id: sid, source: 'worksheet', item_id: 'WS-' + seq, score: 1,
    response: 'answer ' + seq, recorded_at: new Date(Date.now() - seq * 1000).toISOString(),
    evidence_tier: 'practice', ...over,
  };
  world.ledger.push(row);
  return row;
}

function mountServer(world, extra = {}) {
  const app = express();
  app.use(express.json());
  mountReview(app, { db: world.db, ledgerDb: world.ledgerDb, nudgesDb: world.nudgesDb, loadAnswerKey: null, ...extra });
  // also mount /ledger/student to exercise the review augment (rosterDb = the review db)
  mountLedger(app, { db: world.ledgerDb, verifyToken: () => null, rosterDb: world.db });
  return http.createServer(app);
}
async function call(server, method, path, { body, secret } = {}) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body: json };
}

// ── issueReviewReceipt ────────────────────────────────────────────────────────
describe('issueReviewReceipt', () => {
  const pubKey = () => publicKeyFromX(getReceiptIssuer().pubkey);

  it('signs a verifiable t:review receipt that binds the comment by hash', () => {
    const r = issueReviewReceipt({ ledgerId: 'L1', studentId: SID_A, teacher: 'teach', seenAt: 1234, comment: 'Nice work!' });
    expect(r).toBeTruthy();
    const payload = verifyCompact(r.compact, pubKey());
    expect(payload).toBeTruthy();
    expect(payload.t).toBe('review');
    expect(payload.lid).toBe('L1');
    expect(payload.sid).toBe(SID_A);
    expect(payload.by).toBe('teach');
    expect(payload.ts).toBe(1234);
    expect(payload.ch).toBe(crypto.createHash('sha256').update('Nice work!', 'utf8').digest('hex').slice(0, 16));
  });

  it('omits ch when there is no comment, and a different comment yields a different ch', () => {
    const none = issueReviewReceipt({ ledgerId: 'L2', studentId: SID_A, teacher: 't', seenAt: 1 });
    expect(verifyCompact(none.compact, pubKey()).ch).toBeUndefined();
    const a = issueReviewReceipt({ ledgerId: 'L3', studentId: SID_A, teacher: 't', seenAt: 1, comment: 'A' });
    const b = issueReviewReceipt({ ledgerId: 'L3', studentId: SID_A, teacher: 't', seenAt: 1, comment: 'B' });
    expect(verifyCompact(a.compact, pubKey()).ch).not.toBe(verifyCompact(b.compact, pubKey()).ch);
  });

  it('returns null without a ledgerId or studentId', () => {
    expect(issueReviewReceipt({ studentId: SID_A })).toBeNull();
    expect(issueReviewReceipt({ ledgerId: 'L' })).toBeNull();
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────
describe('priority + snippet helpers', () => {
  it('floats FRQ/free-response above appeals above low-scores above proctored above auto-graded', () => {
    expect(itemPriority({ source: 'frq' })).toBe(100);
    expect(itemPriority({ source: 'quiz_review' })).toBe(90);
    expect(itemPriority({ source: 'worksheet', score: 0.2 })).toBe(80);
    expect(itemPriority({ source: 'worksheet', score: 1, evidence_tier: 'proctored' })).toBe(60);
    expect(itemPriority({ source: 'worksheet', score: 1 })).toBe(10);
  });
  it('truncates a long response and JSON-stringifies objects', () => {
    expect(responseSnippet('x'.repeat(200)).length).toBe(141); // 140 + ellipsis
    expect(responseSnippet({ a: 1 })).toBe('{"a":1}');
    expect(responseSnippet(null)).toBe('');
  });
});

// ── GET /class/review-queue ────────────────────────────────────────────────────
describe('GET /class/review-queue', () => {
  it('401s without the teacher secret', async () => {
    const world = makeWorld();
    const res = await call(mountServer(world), 'GET', '/class/review-queue');
    expect(res.status).toBe(401);
  });

  it('lists students with unseen counts and sorts FRQ-bearing students first', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { source: 'worksheet', score: 1 });            // low-priority auto-graded
    addRow(world, SID_B, { source: 'frq', score: 0.5, item_id: 'FRQ-1' }); // needs eyes
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.unseenTotal).toBe(2);
    expect(res.body.students[0].studentId).toBe(SID_B);                 // FRQ student floats up
    expect(res.body.students[0].items[0].sessionId).not.toBeNull();
  });

  it('counts a marked item as seen and reports daysSinceReview', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    world.reviewMarks.set(row.ledger_id, {
      ledger_id: row.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: new Date(Date.now() - 3 * 86400000).toISOString(), comment: 'seen it',
    });
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    const a = res.body.students.find((s) => s.studentId === SID_A);
    expect(a.unseen).toBe(0);
    expect(a.items[0].seen).toBe(true);
    expect(a.daysSinceReview).toBe(3);
    expect(res.body.unseenTotal).toBe(0);
  });

  it('503s when review_marks is not provisioned', async () => {
    const world = makeWorld();
    world.db.listReviewMarksByStudents = async () => ({ data: null, error: { code: '42P01' } });
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    expect(res.status).toBe(503);
  });
});

// ── POST /class/review ─────────────────────────────────────────────────────────
describe('POST /class/review', () => {
  it('marks an item seen, persists a signed receipt, and mints exactly one candy', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    const res = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [row.ledger_id], comment: 'great' } });
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(1);
    expect(res.body.candyAwarded).toBe(1);
    const mark = world.reviewMarks.get(row.ledger_id);
    expect(mark.comment).toBe('great');
    expect(mark.receipt_compact).toBeTruthy();
    const payload = verifyCompact(mark.receipt_compact, publicKeyFromX(getReceiptIssuer().pubkey));
    expect(payload.t).toBe('review');
    expect(payload.lid).toBe(row.ledger_id);
  });

  it('awards candy only ONCE per student per day across multiple items, and an idempotent re-mark adds no candy', async () => {
    const world = makeWorld();
    const r1 = addRow(world, SID_A), r2 = addRow(world, SID_A);
    const first = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [r1.ledger_id, r2.ledger_id] } });
    expect(first.body.marked).toBe(2);
    expect(first.body.candyAwarded).toBe(1);              // 2 items, 1 student → 1 candy
    const again = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [r1.ledger_id] } });
    expect(again.body.candyAwarded).toBe(0);              // re-mark same day → no second candy
  });

  it('sends a notify message ONLY when there is a comment', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    const silent = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [row.ledger_id] } });
    expect(silent.body.notified).toBe(0);
    expect(world.nudges.length).toBe(0);
    const r2 = addRow(world, SID_A);
    const spoke = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [r2.ledger_id], comment: 'see me' } });
    expect(spoke.body.notified).toBe(1);
    expect(world.nudges[0].recipientUsernames).toEqual(['apple_fox']);
    expect(world.nudges[0].text).toBe('see me');
  });

  it('resolves scope:day to that student\'s items on a given NY date', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { recorded_at: '2026-06-29T14:00:00.000Z' });
    addRow(world, SID_A, { recorded_at: '2026-06-20T14:00:00.000Z' });
    const res = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { studentId: SID_A, scope: 'day', date: '2026-06-29' } });
    expect(res.body.marked).toBe(1);                       // only the 6-29 row
  });

  it('400s when there are no items to review and 401s without the secret', async () => {
    const world = makeWorld();
    expect((await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [] } })).status).toBe(400);
    expect((await call(mountServer(world), 'POST', '/class/review', { body: { ledgerIds: ['x'] } })).status).toBe(401);
  });
});

// ── /ledger/student review augment ─────────────────────────────────────────────
describe('GET /ledger/student carries review state', () => {
  it('attaches { seenAt, teacher, comment } to a reviewed row and null otherwise', async () => {
    const world = makeWorld();
    const reviewed = addRow(world, SID_A);
    const fresh = addRow(world, SID_A);
    world.reviewMarks.set(reviewed.ledger_id, {
      ledger_id: reviewed.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: '2026-06-29T00:00:00.000Z', comment: 'nice',
    });
    const res = await call(mountServer(world), 'GET', `/ledger/student/${SID_A}`, { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.rows.map((r) => [r.ledger_id, r]));
    expect(byId[reviewed.ledger_id].review).toEqual({ seenAt: '2026-06-29T00:00:00.000Z', teacher: 'teach', comment: 'nice' });
    expect(byId[fresh.ledger_id].review).toBeNull();
  });
});

// ── Durability: reviews ride the snapshot / verify / restore (NIGHTLY_REVIEW §8) ─
describe('review durability (snapshot + verify + normalizeReviews)', () => {
  function snapshotWithReview(comment) {
    const ledgerRow = { ledger_id: '00000000-0000-4000-9000-0000000000ee', student_id: SID_A, source: 'frq', item_id: 'FRQ-9', score: 0.5, response: 'my answer', recorded_at: '2026-06-29T12:00:00.000Z' };
    const receipt = issueReviewReceipt({ ledgerId: ledgerRow.ledger_id, studentId: SID_A, teacher: 'teach', seenAt: 1000, comment });
    const mark = {
      ledger_id: ledgerRow.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: '2026-06-29T13:00:00.000Z', comment, candy_awarded: 1,
      receipt_id: receipt.receiptId, receipt_compact: receipt.compact,
    };
    const entry = buildStudentEntry({ student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana', section: 'PeriodX' }, [ledgerRow], [mark]);
    return { snapshot: { issuer: getReceiptIssuer(), students: [entry] }, entry };
  }

  it('carries reviews in the student entry and verifySnapshot validates the t:review receipt', () => {
    const { snapshot, entry } = snapshotWithReview('great FRQ');
    expect(entry.reviewCount).toBe(1);
    expect(entry.bundle.reviews[0].receipt_compact).toBeTruthy();
    const report = verifySnapshot(snapshot);
    expect(report.ok).toBe(true);
    expect(report.totals.reviews).toBe(1);
    expect(report.totals.verifiedReviews).toBe(1);
  });

  it('flags a review whose stored comment was tampered (ch no longer matches)', () => {
    const { snapshot } = snapshotWithReview('great FRQ');
    snapshot.students[0].bundle.reviews[0].comment = 'tampered!';   // edit under a valid signature
    const report = verifySnapshot(snapshot);
    expect(report.ok).toBe(false);
    expect(report.breaks.some((b) => b.kind === 'review-comment-tampered')).toBe(true);
  });

  it('normalizeReviews extracts reviews from a full snapshot and a bundles[] body', () => {
    const { snapshot } = snapshotWithReview('hi');
    expect(normalizeReviews(snapshot).length).toBe(1);                         // { students:[{bundle}] }
    expect(normalizeReviews({ bundles: [snapshot.students[0].bundle] }).length).toBe(1); // { bundles:[...] }
  });
});

// ── pglite: the REAL migration 0025 SQL ─────────────────────────────────────────
// Proves the candy_bonus mint is atomic + idempotent per day AND that a minted bonus
// becomes spendable through the real doge_spend guard (0 earned + 1 bonus → can buy 1).
describe('migration 0025 candy_bonus (real plpgsql via pglite)', () => {
  const migDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  let PGlite, pg;
  const S = '00000000-0000-4000-8000-0000000000c1';

  beforeAll(async () => {
    ({ PGlite } = await import('@electric-sql/pglite'));
    pg = new PGlite();
    await pg.exec(`create table roster (student_id uuid primary key default gen_random_uuid(), login_username text, section text, real_name text, role text default 'student', created_at timestamptz default now());`);
    await pg.exec(`create table item_ledger (ledger_id uuid primary key default gen_random_uuid(), student_id uuid, source text, item_id text, score numeric, recorded_at timestamptz default now());`);
    for (const f of ['0019_doge_wallet.sql', '0021_doge_gifting.sql', '0022_retire_candy_eaten.sql', '0023_doge_sell.sql', '0024_tetris_stakes.sql', '0025_review_marks.sql']) {
      await pg.exec(await readFile(resolve(migDir, f), 'utf8'));
    }
    await pg.query('insert into roster (student_id, login_username, section) values ($1, $2, $3)', [S, 'cherry_cat', 'PeriodX']);
  }, 60000);
  afterAll(async () => { if (pg) await pg.close(); });

  it('review_award mints exactly one candy_bonus, idempotent per NY date', async () => {
    const r1 = await pg.query('select review_award($1, $2) as r', [S, '2026-06-29']);
    expect(Number(r1.rows[0].r)).toBe(1);
    const r2 = await pg.query('select review_award($1, $2) as r', [S, '2026-06-29']);
    expect(Number(r2.rows[0].r)).toBe(0);                         // same day → no second mint
    const acc = await pg.query('select candy_bonus from doge_account where student_id = $1', [S]);
    expect(Number(acc.rows[0].candy_bonus)).toBe(1);
    const r3 = await pg.query('select review_award($1, $2) as r', [S, '2026-06-30']);
    expect(Number(r3.rows[0].r)).toBe(1);                         // next day → mints again
    const acc2 = await pg.query('select candy_bonus from doge_account where student_id = $1', [S]);
    expect(Number(acc2.rows[0].candy_bonus)).toBe(2);
    const legs = await pg.query("select count(*)::int as n from doge_ledger where student_id = $1 and kind = 'review_award'", [S]);
    expect(legs.rows[0].n).toBe(2);
  });

  it('a minted bonus is spendable: 0 earned + 1 bonus can buy 1 candy of DOGE', async () => {
    const T = '00000000-0000-4000-8000-0000000000c2';
    await pg.query('insert into roster (student_id, login_username, section) values ($1, $2, $3)', [T, 'date_dog', 'PeriodX']);
    // With 0 earned and 0 bonus, a 1-candy buy must FAIL (guard rejects → null row).
    const fail = await pg.query('select (doge_spend($1, 0, 1, $2, 1, 0.1, 10)).student_id as sid', [T, 'buy_doge']);
    expect(fail.rows[0].sid).toBeNull();
    // Mint 1 bonus, then the same buy SUCCEEDS (bonus is in the spendable guard).
    await pg.query('select review_award($1, $2)', [T, '2026-06-29']);
    const ok = await pg.query('select (doge_spend($1, 0, 1, $2, 1, 0.1, 10)).student_id as sid', [T, 'buy_doge']);
    expect(ok.rows[0].sid).toBe(T);
  });
});
