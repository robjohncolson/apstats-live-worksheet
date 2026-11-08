// feeder-bestwins-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (prop 12b),
// re-pinned 2026-11-07 for FLASHCARD_DECK_SLICES_SPEC.md §12 ("Commit gate").
// fast-check over the two Blooket/flashcard feeder callers, both extracted from the SHIPPED
// HTML and executed for real here:
//   - mobile-home.html   _fcCommit (+ _fcBlooketFloor / _fcBumpLocalBlooket / _applyGradeData)
//   - ap_stats_roadmap_square_mode.html   _blooketCommit → _studentMarkSave / _deskDoneRow
//
// What protects a stored best is the SERVER: roster-server/ledger.js keeps each
// BL-U…-L…-DESK_(DONE|DAY) row's best — a lower incoming score never replaces a higher stored
// one, and a failed floor read refuses the write (pinned for real in
// roster-server/tests/ledger.test.js, "deck floor"). DESK_DONE and DESK_DAY of one topic are
// different items, so they never floor each other. That is why EVERY finished run sends its
// row: the one Blooket number /grade shows is the max over a lesson's items and can belong to
// another item than this run's (a DESK_DAY 100 on 4.7, then a whole-deck DESK_DONE 90 that also
// credits 4.8), so a client that held back "lower" runs could lose credit.
//
// The CLIENT floor (the synced /grade blooket + this device's own best) now guards only what
// stays on the device: the Desk's local mark and the phone's local best, which only ever rise,
// and the finish copy. _fcCommit sends the row, then returns skipped:true exactly when
// score <= floor; the Desk saves the local mark exactly when score > max(0, /grade, mark) and
// otherwise sends the row straight through _deskDoneRow. A wrong verdict puts a false sentence
// on the result screen ("a higher one is already recorded" / "new best"); it never loses a grade.
//
// The end-to-end properties run both surfaces against deckServer, a model of that server floor,
// under a cross-device seed, a hostile network (failed refreshes; stale trailing /grade payloads
// that wipe the synced map) and a shared classroom device. They check that every run sends
// exactly one row with the right item id, that each row ends at the best score dealt for its
// item and never drops on the way, and that the verdict matches the floor. The phone's local
// best is scoped PER STUDENT (Codex blocker on the v1 fix): on a shared device student A's 90
// must not tell student B that "a higher one is already recorded". A signed-out run never
// persists a bump: gradebook-client drops its write (no-identity), so a stored best for it
// would claim a score the server never received.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { deskSource } from './helpers/desk-source.js';

const repo = resolve(import.meta.dirname, '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const DESK = deskSource();
const FLASHCARDS = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

const TOPIC = '4.1-2';                    // combined topic — exercises the BL-U4-L1-2-… id shape
const DONE_ID = 'BL-U4-L1-2-DESK_DONE';   // a run dealt from the whole CSV
const DAY_ID = 'BL-U4-L1-2-DESK_DAY';     // a run dealt from one day's slice (spec D3)
const itemFor = (perDay) => (perDay ? DAY_ID : DONE_ID);

// The one ledger row a finished run sends: the same shape on both surfaces
// (Desk _deskDoneRow = phone _fcCommit).
const deckRow = (score, perDay) => ({
  source: 'worksheet', itemId: itemFor(perDay), unit: 'U4', topic: TOPIC,
  response: { selfAttest: 'blooket' }, score, attempt: 1,
});

// ── The server floor the end-to-end properties run against ─────────────────────
// roster-server/ledger.js: a deck row is keyed by (student, item id), and a lower incoming
// score never replaces a higher stored one. /grade shows ONE Blooket number per lesson: the
// max over its items. `history` keeps every value each row has held, so a drop would show.
function deckServer() {
  const best = new Map();      // 'student|itemId' → the stored score
  const history = new Map();   // 'student|itemId' → every stored value, oldest first
  function write(student, row) {
    const key = student + '|' + row.itemId;
    const stored = best.get(key);
    const kept = stored !== undefined && stored > row.score ? stored : row.score;
    best.set(key, kept);
    history.set(key, [...(history.get(key) || []), kept]);
  }
  function blooket(student) {
    let max = null;
    for (const [key, score] of best) {
      if (!key.startsWith(student + '|')) continue;
      if (max === null || score > max) max = score;
    }
    return max;
  }
  return { write, blooket, best, history };
}

// What a student earned: per row, the best score of every run dealt for that item.
function earn(earned, student, itemId, score) {
  const key = student + '|' + itemId;
  earned[key] = earned[key] === undefined ? score : Math.max(earned[key], score);
}

// A row recorded before the run sequence starts (another device). It counts as earned too.
function seedRow(server, earned, student, itemId, score) {
  if (score == null) return;
  server.write(student, { itemId, score });
  earn(earned, student, itemId, score);
}

// Each row ends holding exactly the best score dealt for its item (no run was lost) and
// never dropped on the way there.
function expectEveryBestKept(server, earned) {
  expect(Object.fromEntries(server.best)).toEqual(earned);
  for (const values of server.history.values()) {
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  }
}

// ── Launcher harness: the REAL _fcCommit chain in a vm ─────────────────────────
// loadGrade is stubbed to a no-op: in the shipped code the trailing loadGrade inside
// _fcCommit is a fire-and-forget fetch whose (possibly stale) response lands LATER —
// the end-to-end properties model that response as an explicit applyGrade op instead,
// and a FAILED refresh attempt as no applyGrade at all (loadGrade resolves false
// without touching state when offline / not signed in / non-ok).
// Pass `storage` to back _fcLocalBest with a fake localStorage (reload persistence).
// The signed-in student is switchable via setUser (null = signed out) — _fcStudent
// reads the BARE rosterClient global (page scripts see window.* as globals), so the
// stub is installed as both window.rosterClient and a context global.
// window.gradebookClient.record is the sink: `emissions` holds every row the phone sent.
function loadLauncher({ storage } = {}) {
  const emissions = [];
  let currentUser = { username: 'kid' };
  const rosterClient = { current: () => currentUser, token: () => (currentUser ? 'tok' : null) };
  const win = {
    rosterClient,
    gradebookClient: { record: (row) => { emissions.push(row); return { ok: true, ledgerId: 'L1' }; } },
  };
  const ctx = createContext({
    window: win, rosterClient, document: { getElementById: () => null }, console,
    Math, JSON, String, Number, Array, Object, Promise, RegExp, Date,
    isFinite, parseInt, parseFloat,
    ...(storage ? { localStorage: storage } : {}),   // absent by default, like the vm has no DOM
  });
  const script = [
    FLASHCARDS,                                       // window.Flashcards (pure, no DOM)
    'var _gradeByTopic = {}, _lastLessons = [], _gradeOwner = null;',
    'function loadGrade() { return Promise.resolve(false); }',
    'var FC_BEST_KEY = "apstats_mobile_fcbest_v2";',
    fnBody(HOME, '_normTopic'),
    fnBody(HOME, '_applyGradeData'),
    'var FC = window.Flashcards;',
    fnBody(HOME, '_fcStudent'),
    fnBody(HOME, '_fcLoadLocalBest'),
    'var _fcLocalBest = _fcLoadLocalBest();',         // mirrors the shipped hydrate line
    fnBody(HOME, '_fcBlooketFloor'),
    fnBody(HOME, '_fcBumpLocalBlooket'),
    fnBody(HOME, '_fcCommit'),
    // applyGrade mirrors the shipped loadGrade success path: the owner is stamped from
    // the token that made the fetch (= the CURRENT student for a fresh refresh);
    // applyGradeAs models a PREVIOUS student's response landing late (owner ≠ current).
    '({ applyGrade: function (g) { _gradeOwner = _fcStudent(); _applyGradeData(g, false); },',
    '   applyGradeAs: function (o, g) { _gradeOwner = o; _applyGradeData(g, false); },',
    '   floor: function (t) { return _fcBlooketFloor(t); },',
    '   bump: function (t, s) { _fcBumpLocalBlooket(t, s); },',
    '   commit: function (t, s, p) { return _fcCommit(t, s, p); },',
    '   setEntry: function (t, v) { _gradeOwner = _fcStudent(); _gradeByTopic = {}; _gradeByTopic[_normTopic(t)] = { blooket: v }; },',
    '   reset: function () { _gradeByTopic = {}; _fcLocalBest = {}; _gradeOwner = null; } })',
  ].join('\n');
  const api = runInContext(script, ctx);
  const setUser = (name) => { currentUser = name ? { username: name } : null; };
  return { api, emissions, setUser };
}

// A /grade payload carrying one blooket value for TOPIC (null = no row recorded yet).
// Field fidelity: the roster server emits `lessonKey` (lesson-grade.js), NOT `topic`.
// The value is a plain number live; the {score} object shape is the floor's legacy
// cache branch — exercised via asObj below.
const payloadFor = (score, asObj) => ({
  ok: true, quarters: [],
  lessons: score == null ? [] : [{ lessonKey: TOPIC, lessonGrade: 55, blooket: asObj ? { score } : score }],
});

// One finished phone run: it must send exactly one row, the Desk-parity shape.
function phoneRun(L, run) {
  const sentBefore = L.emissions.length;
  const res = L.api.commit(TOPIC, run.score, run.perDay);
  expect(L.emissions).toHaveLength(sentBefore + 1);
  expect(L.emissions[sentBefore]).toEqual(deckRow(run.score, run.perDay));
  return { res, row: L.emissions[sentBefore] };
}

// ── Desk harness: the REAL _blooketCommit → _studentMarkSave / _deskDoneRow in a vm ──
// Shipped code end to end, except recordProgress, stubbed to its contract: it writes the
// local mark synchronously (localStorage in the Desk, so marks PERSIST across grade
// refreshes) and resolves true. A new best takes _studentMarkSave (the mark, then the row
// through _deskDoneRow); any other finished run sends its row straight through _deskDoneRow.
// Rows land in a recording window.gradebookClient. withRefresh wires the real internal
// _refreshGrade → renderDoNowGrades path to a host-supplied fresh /grade read; without it
// (offline Desk) the guard skips, exactly as the typeof-gated shipped code does.
function loadDesk({ withRefresh }) {
  const rows = [];
  let freshLessons = () => null;
  const win = {
    ROSTER_SERVICE_URL: 'https://api.test',
    rosterClient: { token: () => 'tok', studentId: () => 'student-a', current: () => ({ username: 'Alice' }) },
    gradebookClient: { record: (row) => { rows.push(row); return { ok: true, ledgerId: 'L1' }; } },
  };
  const ctx = createContext({
    window: win, console,
    Math, JSON, String, Number, Array, Object, Promise, Date, isFinite,
    __fresh: () => freshLessons(),
  });
  const script = [
    'var _gradeLessonsCache = null, _lastResourcePanel = null;',
    'var __marks = {}, __markWrites = 0;',
    'function getStudentEmail() { return "Alice"; }',
    'function getStudentMarks() { return __marks; }',
    'async function recordProgress(topic, artifact, score) {',
    '  __marks[topic + "|" + artifact] = { score: score };',
    '  __markWrites += 1;',
    '  return true;',
    '}',
    withRefresh
      ? 'function renderDoNowGrades(base, tok) { _gradeLessonsCache = __fresh(); return Promise.resolve(); }'
      : '',
    fnBody(DESK, '_blooketScoreFor'),
    fnBody(DESK, '_ftCaptureOwner'),
    fnBody(DESK, '_ftOwnerIsCurrent'),
    fnBody(DESK, '_blooketCommit'),
    fnBody(DESK, '_studentMarkSave'),
    fnBody(DESK, '_deskDoneRow'),
    // d4554599 (2026-09-23): _blooketCommit patches the /grade cache with the recorded
    // score (the REAL patch — raise-only) and repaints the zero card (DOM-only, stubbed here).
    fnBody(DESK, '_blooketPatchGradeCache'),
    'function _walletRefreshZeroCard() {}',
    '({ commit: function (t, s, p) { return _blooketCommit(null, t, s, p); },',
    '   setLessons: function (x) { _gradeLessonsCache = x; },',
    '   setMark: function (t, s) { __marks[t + "|blooket"] = { score: s }; },',
    '   mark: function (t) { var m = __marks[t + "|blooket"]; return m ? m.score : null; },',
    '   markWrites: function () { return __markWrites; },',
    '   synced: function (t) { return _blooketScoreFor(t); },',
    '   reset: function () { __marks = {}; __markWrites = 0; _gradeLessonsCache = null; } })',
  ].join('\n');
  const api = runInContext(script, ctx);
  return { api, rows, setFresh: (fn) => { freshLessons = fn; } };
}

const lessonsFor = (score) => (score == null ? null : [{ lessonKey: TOPIC, blooket: score }]);

// One finished Desk run: it must send exactly one row, the Desk-parity shape.
async function deskRun(H, run) {
  const sentBefore = H.rows.length;
  const res = await H.api.commit(TOPIC, run.score, run.perDay);
  expect(H.rows).toHaveLength(sentBefore + 1);
  expect(H.rows[sentBefore]).toEqual(deckRow(run.score, run.perDay));
  return { res, row: H.rows[sentBefore] };
}

// ────────────────────────────────────────────────────────────────────────────────
describe('launcher best-wins floor (mobile-home _fcCommit, prop 12b)', () => {
  let L;
  beforeAll(() => { L = loadLauncher(); });
  const start = () => { L.setUser('kid'); L.api.reset(); L.emissions.length = 0; };

  it('every finished run sends exactly one row, the Desk-parity shape, DESK_DAY iff a slice was dealt', () => {
    // FLASHCARD_DECK_SLICES_SPEC.md D3: the suffix depends only on "was a slice dealt?".
    // §12: the floor never holds a row back — the server keeps each item's best.
    fc.assert(fc.property(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // synced blooket (null = no row)
      fc.integer({ min: 0, max: 100 }),                             // run score
      fc.option(fc.boolean(), { nil: undefined }),                  // dealt from a slice (undefined = a two-argument caller)
      (synced, s, perDay) => {
        start();
        L.api.applyGrade(payloadFor(synced));
        phoneRun(L, { score: s, perDay });
      },
    ), { examples: [[50, 50, true], [50, 49, false], [100, 100, undefined], [null, 0, true]] });   // at and below the floor too
  });

  it('skipped is exactly "not above the floor" (synced /grade, legacy {score} shape too); a new best returns the real write result', () => {
    fc.assert(fc.property(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // synced blooket (null = no row)
      fc.boolean(),                                                 // legacy {score} object shape
      fc.integer({ min: 0, max: 100 }),                             // run score
      (synced, asObj, s) => {
        start();
        L.api.applyGrade(payloadFor(synced, asObj));
        const { res } = phoneRun(L, { score: s });
        const floor = synced == null ? -1 : synced;
        // A new best's sheet reads the real write result (recorded / queued / failed); any
        // other run's sheet says the best stays. The row went to the server either way.
        if (s > floor) expect(res).toEqual({ ok: true, ledgerId: 'L1' });
        else expect(res).toEqual({ skipped: true, floor });
      },
    ), { examples: [[50, false, 50], [50, true, 50], [50, false, 51], [100, false, 100], [null, false, 0]] });   // force the > vs >= boundary
  });

  it('bump→floor agreement for ANY topic spelling (a _normTopic mismatch would break the floor)', () => {
    // '__proto__' deliberately not generated: bracket-writes on it pollute the shared vm
    // realm's Object.prototype across runs; the launcher's topics come from teacher-authored
    // lesson ids, and the failure direction there is fail-safe (blocks records, never downgrades).
    fc.assert(fc.property(
      fc.oneof(fc.constantFrom('4.1-2', 'U4L1', 'u4-l1', '4.1', '9.10', ''), fc.string()),
      fc.integer({ min: 0, max: 100 }),
      (topic, s) => {
        fc.pre(topic !== '__proto__');
        start();
        L.api.bump(topic, s);
        expect(L.api.floor(topic)).toBeGreaterThanOrEqual(s);
      },
    ));
  });

  it('garbage synced blooket shapes never throw and read as unknown (-1): the run is sent and reported as a new best', () => {
    const junkBlooket = fc.oneof(
      fc.constant(undefined), fc.constant(null), fc.boolean(), fc.string(),
      fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity),
      fc.array(fc.integer(), { maxLength: 3 }),
      fc.record({ score: fc.oneof(fc.string(), fc.constant(NaN), fc.constant(null)) }),
    );
    fc.assert(fc.property(junkBlooket, fc.integer({ min: 0, max: 100 }), (junk, s) => {
      start();
      L.api.setEntry(TOPIC, junk);
      expect(L.api.floor(TOPIC)).toBe(-1);
      const { res } = phoneRun(L, { score: s });
      expect(res).toEqual({ ok: true, ledgerId: 'L1' });
    }));
  });

  it('within a session (no syncs) every run is sent, the local best is the running max, and the "new best" verdicts are EXACTLY the strictly-rising prefix maxima', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }),
      (runs) => {
        start();
        let best = -1;
        const rising = [];     // the strictly-rising prefix maxima
        const newBests = [];   // the runs the sheet reported as a new best
        for (const s of runs) {
          const { res } = phoneRun(L, { score: s });
          if (!res.skipped) newBests.push(s);
          if (s > best) { rising.push(s); best = s; }
          expect(L.api.floor(TOPIC)).toBe(best);   // a lower run never lowers the local best
        }
        expect(newBests).toEqual(rising);
      },
    ));
  });

  it('E2E-A CROSS-DEVICE: every run reaches the best-wins server, so a foreign best never drops; with a fresh /grade the verdict is exact', () => {
    fc.assert(fc.property(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // DESK_DONE row from another device
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // DESK_DAY row from another device
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        perDay: fc.boolean(),
      }), { minLength: 1, maxLength: 15 }),
      (seedDone, seedDay, runs) => {
        start();
        const server = deckServer();
        const earned = {};
        seedRow(server, earned, 'kid', DONE_ID, seedDone);
        seedRow(server, earned, 'kid', DAY_ID, seedDay);
        for (const run of runs) {
          const recorded = server.blooket('kid');
          L.api.applyGrade(payloadFor(recorded));        // _fcFinish refreshes BEFORE committing
          const { res, row } = phoneRun(L, run);
          server.write('kid', row);
          earn(earned, 'kid', itemFor(run.perDay), run.score);
          // The fresh /grade IS the floor: this device's own best never exceeds what the server holds.
          expect(res.skipped === true).toBe(!(run.score > (recorded ?? -1)));
        }
        expectEveryBestKept(server, earned);
      },
    ));
  });

  it('E2E-B SAME-DEVICE, HOSTILE NETWORK: failed refreshes and stale /grade wipes never lose a run or drop a stored best, and the verdict never contradicts this device\'s own best', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        perDay: fc.boolean(),
        refreshOk: fc.boolean(),                        // _fcFinish only ATTEMPTS the refresh — offline / hiccup commits anyway
        // a trailing fire-and-forget /grade response computed from an OLDER server state
        // (the GET racing this run's own record POST) — _applyGradeData rebuilds the map
        // from it, wiping any in-map bump
        staleIdx: fc.option(fc.nat(20), { nil: null }),
      }), { minLength: 1, maxLength: 15 }),
      (ops) => {
        start();
        const server = deckServer();
        const earned = {};
        const graded = [null];                          // every /grade Blooket number so far, oldest first
        let ownBest = -1;                               // the best run this device has finished
        for (const op of ops) {
          const recorded = server.blooket('kid');
          if (op.refreshOk) L.api.applyGrade(payloadFor(recorded));
          const { res, row } = phoneRun(L, op);
          server.write('kid', row);
          earn(earned, 'kid', itemFor(op.perDay), op.score);
          // "New best" is never said at or below this device's own best (the local best
          // survives every wipe); "the best stays" is never said above what the server holds.
          if (!res.skipped) expect(op.score).toBeGreaterThan(ownBest);
          if (res.skipped) expect(op.score).toBeLessThanOrEqual(recorded ?? -1);
          ownBest = Math.max(ownBest, op.score);
          graded.push(server.blooket('kid'));
          if (op.staleIdx != null) L.api.applyGrade(payloadFor(graded[op.staleIdx % graded.length]));
        }
        expectEveryBestKept(server, earned);
      },
    ));
  });

  it('SHARED DEVICE: two students take turns (each sign-in refreshes /grade); every run lands on its own student\'s rows, no row drops, and one student\'s best never decides the other\'s verdict', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        who: fc.constantFrom('kid', 'other_kid'),
        score: fc.integer({ min: 0, max: 100 }),
        perDay: fc.boolean(),
      }), { minLength: 1, maxLength: 15 }),
      (ops) => {
        start();
        const server = deckServer();
        const earned = {};
        let signedIn = null;
        for (const op of ops) {
          if (op.who !== signedIn) {                    // a sign-in, and its /grade refresh succeeds
            L.setUser(op.who);
            L.api.applyGrade(payloadFor(server.blooket(op.who)));
            signedIn = op.who;
          }
          const recorded = server.blooket(op.who);      // this student's own rows only
          const { res, row } = phoneRun(L, op);
          server.write(op.who, row);
          earn(earned, op.who, itemFor(op.perDay), op.score);
          expect(res.skipped === true).toBe(!(op.score > (recorded ?? -1)));
        }
        expectEveryBestKept(server, earned);
      },
    ));
  });

  it('SHARED DEVICE + FAILED REFRESH: A\'s in-memory synced map never decides B\'s verdict when B\'s /grade refresh fails', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100 }),               // student A's synced + recorded score
      fc.integer({ min: 0, max: 100 }),               // student B's run on the same device
      (a, b) => {
        start();                                      // signed in as 'kid' (A)
        L.api.applyGrade(payloadFor(a));              // A's own /grade sync fills the map
        phoneRun(L, { score: a });                    // and A re-runs at their best
        L.setUser('other_kid');                       // B signs in on the same device
        // NO applyGrade for B: the sign-in /grade refresh FAILED (offline / hiccup),
        // so A's blooket value is still sitting in the in-memory map.
        const { res } = phoneRun(L, { score: b });
        expect(res.skipped).toBeUndefined();          // B's first run is B's new best, whatever A holds
        // …and A's LATE-LANDING /grade response (fetched with A's token before the
        // switch) must not poison B either — clearing-on-sign-in alone misses this.
        L.api.applyGradeAs('kid', payloadFor(a));
        expect(L.api.floor(TOPIC)).toBe(b);           // only B's own local best floors B
      },
    ));
  });

  it('the shipped /grade cache + fetch are owner-stamped (the boot/loadGrade halves the vm harness cannot extract)', () => {
    expect(HOME).toContain('var owner = _fcStudent();');
    expect(HOME).toContain('JSON.stringify({ lessons: g.lessons, quarters: g.quarters, owner: owner })');
    expect(HOME).toContain("_gradeOwner = (_cgp && typeof _cgp.owner === 'string') ? _cgp.owner : null;");
  });

  it('a signed-out run never persists a bump (it cannot tell a later signed-in run that a higher score is recorded)', () => {
    const mem = {};
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const H = loadLauncher({ storage });
    H.setUser(null);                                    // wall failed open / signed out mid-session
    H.api.commit(TOPIC, 90);                            // gradebook-client drops this write (no-identity)
    expect(mem['apstats_mobile_fcbest_v2']).toBeUndefined();   // nothing persisted for it
    H.setUser('kid');
    H.api.applyGrade(payloadFor(null));                 // sign-in /grade refresh clears the session map
    expect(H.api.floor(TOPIC)).toBe(-1);                // the signed-in floor is clean
    expect(H.api.commit(TOPIC, 60).skipped).toBeUndefined();   // kid's 60 is reported as kid's new best
    expect(H.emissions.map((r) => r.score)).toEqual([90, 60]);
  });

  it('the local best survives a reload (localStorage-backed), stays per-student, and drops the v1 device-global key', () => {
    const mem = { apstats_mobile_fcbest_v1: JSON.stringify({ '4.1': 95 }) };   // leaky v1 leftover
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const A = loadLauncher({ storage });
    expect(mem['apstats_mobile_fcbest_v1']).toBeUndefined();   // v1 purged on load, not honored
    expect(A.api.floor(TOPIC)).toBe(-1);
    A.api.bump(TOPIC, 90);                              // e.g. the 90 POST is still queued offline
    const B = loadLauncher({ storage });                // page reload: fresh state, same device
    expect(B.api.floor(TOPIC)).toBe(90);                // same student ('kid'): the 90 came back
    expect(B.api.commit(TOPIC, 60)).toEqual({ skipped: true, floor: 90 });   // the sheet keeps the 90…
    expect(B.emissions.map((r) => r.score)).toEqual([60]);                   // …and the 60 still went out
    expect(B.api.floor(TOPIC)).toBe(90);                // a lower run never lowers the local best
    B.setUser('other_kid');                             // a different student on the same device
    expect(B.api.floor(TOPIC)).toBe(-1);                // is NOT floored by kid's 90
    expect(B.api.commit(TOPIC, 60).skipped).toBeUndefined();   // other_kid's 60 is their own new best
    expect(JSON.parse(mem['apstats_mobile_fcbest_v2'])).toEqual({ kid: { '4.1': 90 }, other_kid: { '4.1': 60 } });
  });

  it('the shipped _fcFinish refreshes /grade BEFORE _fcCommit (the discipline E2E-A models)', () => {
    const body = fnBody(HOME, '_fcFinish');
    expect(body).toContain('Promise.resolve(loadGrade()).then(finishCommit, finishCommit)');
    const gate = body.indexOf('function finishCommit');
    expect(gate).toBeGreaterThan(-1);
    expect(body.slice(0, gate)).not.toMatch(/_fcCommit\s*\(/);   // no commit path skips the refresh
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe('Desk best-wins floor (_blooketCommit, prop 12b)', () => {
  let OFFLINE, ONLINE;
  beforeAll(() => {
    OFFLINE = loadDesk({ withRefresh: false });
    ONLINE = loadDesk({ withRefresh: true });
  });
  const start = (H) => { H.api.reset(); H.rows.length = 0; };

  it('every finished run sends exactly one row (DESK_DAY iff a slice was dealt); the local mark is written iff the run beats max(0, synced /grade, mark), never lowered', async () => {
    await fc.assert(fc.asyncProperty(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // synced /grade blooket
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // prior local mark
      fc.integer({ min: 0, max: 100 }),                             // run score
      fc.boolean(),                                                 // dealt from a per-day slice
      async (synced, mark, s, perDay) => {
        start(OFFLINE);
        OFFLINE.api.setLessons(lessonsFor(synced));
        if (mark != null) OFFLINE.api.setMark(TOPIC, mark);
        const { res } = await deskRun(OFFLINE, { score: s, perDay });
        const floor = Math.max(0, synced ?? 0, mark ?? 0);
        const isBest = s > floor;
        expect(OFFLINE.api.markWrites()).toBe(isBest ? 1 : 0);   // only a new best goes through _studentMarkSave
        expect(OFFLINE.api.mark(TOPIC)).toBe(isBest ? s : mark);   // any other run leaves the mark alone
        expect(res).toEqual({ saved: isBest, best: isBest ? s : floor });   // what the outcome line says
      },
    ), { examples: [[50, null, 50, false], [null, 50, 50, true], [null, null, 0, false], [0, null, 0, true], [null, 40, 41, true]] });   // force the > vs >= boundary
  });

  it('END-TO-END: cross-device seed + the REAL internal refresh + stale cache scribbles — every run reaches the best-wins server, no row drops, and the fresh /grade decides the mark', async () => {
    await fc.assert(fc.asyncProperty(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // DESK_DONE row from another device
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // DESK_DAY row from another device
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        perDay: fc.boolean(),
        staleIdx: fc.option(fc.nat(20), { nil: null }),             // scribble an OLD /grade state into the cache
      }), { minLength: 1, maxLength: 12 }),
      async (seedDone, seedDay, ops) => {
        start(ONLINE);
        const server = deckServer();
        const earned = {};
        seedRow(server, earned, 'kid', DONE_ID, seedDone);
        seedRow(server, earned, 'kid', DAY_ID, seedDay);
        const graded = [server.blooket('kid')];         // every /grade Blooket number so far, oldest first
        ONLINE.setFresh(() => lessonsFor(server.blooket('kid')));
        for (const op of ops) {
          if (op.staleIdx != null) {
            ONLINE.api.setLessons(lessonsFor(graded[op.staleIdx % graded.length]));
          }
          const recorded = server.blooket('kid');
          const markBefore = ONLINE.api.mark(TOPIC);
          const { res, row } = await deskRun(ONLINE, op);   // real code: refresh → floor → mark or row
          server.write('kid', row);
          earn(earned, 'kid', itemFor(op.perDay), op.score);
          // The refresh replaces any stale cache, and the mark never exceeds what the server
          // holds (every saved run also sent its row), so the fresh /grade alone decides.
          expect(res.saved).toBe(op.score > Math.max(0, recorded ?? 0));
          expect(ONLINE.api.mark(TOPIC)).toBe(res.saved ? op.score : markBefore);
          graded.push(server.blooket('kid'));
        }
        expectEveryBestKept(server, earned);
      },
    ));
  });

  it('OFFLINE Desk (no /grade refresh): every run still sends its row, no row drops, and the persistent local mark only rises', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        perDay: fc.boolean(),
        staleIdx: fc.option(fc.nat(20), { nil: null }),             // a stale cached /grade
      }), { minLength: 1, maxLength: 12 }),
      async (ops) => {
        start(OFFLINE);
        const server = deckServer();
        const earned = {};
        const graded = [null];                          // every /grade Blooket number so far, oldest first
        for (const op of ops) {
          if (op.staleIdx != null) {
            OFFLINE.api.setLessons(lessonsFor(graded[op.staleIdx % graded.length]));
          }
          const markBefore = OFFLINE.api.mark(TOPIC);
          const floor = Math.max(0, OFFLINE.api.synced(TOPIC) ?? 0, markBefore ?? 0);
          const { res, row } = await deskRun(OFFLINE, op);
          server.write('kid', row);
          earn(earned, 'kid', itemFor(op.perDay), op.score);
          expect(res.saved).toBe(op.score > floor);
          expect(OFFLINE.api.mark(TOPIC)).toBe(res.saved ? op.score : markBefore);   // strictly up, or untouched
          graded.push(server.blooket('kid'));
        }
        expectEveryBestKept(server, earned);
      },
    ));
  });
});
