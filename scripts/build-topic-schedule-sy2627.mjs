#!/usr/bin/env node
// build-topic-schedule-sy2627.mjs — P1 Layer 2 of the SY2627 reframe.
//
// Generates a topic-schedule.json-shaped fixture for the Fall-2026 5-unit CED:
// core old-ids sequenced in NEW teaching order, one class meeting each, with a
// N.review marker at each new-unit boundary. Two periods (B/E). Bonus old-ids are
// NOT scheduled (enrichment only). Old-id keys unchanged (Option B).
//
// IMPORTANT — this output is a CLEARLY SYNTHETIC FIXTURE:
//   * the calendar (start date, breaks) is a placeholder, NOT the real SY2627
//     school calendar; the AP exam date is deliberately absent (confirm w/ the AP
//     coordinator when known).
//   * there is NO Supabase / production sync here. Do not `--execute` anything.
// The real schedule waits on the user's actual calendar + pacing (spec §6).
//
// Run: node scripts/build-topic-schedule-sy2627.mjs [--out <path>]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const CW  = resolve(REPO, '2026-crosswalk.json');
const OUT = resolve(REPO, arg('--out', 'scripts/fixtures/topic-schedule-sy2627.fixture.json'));

// ── SYNTHETIC calendar fixture (placeholder — replace with the real SY2627 cal) ──
const CAL = {
  synthetic: true,
  firstDay: '2026-08-24',            // placeholder Monday
  // placeholder breaks (weekday ranges skipped), NOT the real district calendar:
  breaks: [
    { name: 'Thanksgiving (placeholder)', from: '2026-11-25', to: '2026-11-27' },
    { name: 'Winter (placeholder)',       from: '2026-12-21', to: '2027-01-01' },
    { name: 'Spring (placeholder)',       from: '2027-03-15', to: '2027-03-19' },
  ],
  daysPerTopic: 1,                   // synthetic pacing: one meeting per core topic
  periodStartOffsetDays: { B: 0, E: 1 },  // E lags B by one school day (synthetic)
};

// Deterministic date math WITHOUT Date.now()/new Date() side-channels: use UTC epoch-day arithmetic.
const MONTH_CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // non-leap
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function toEpochDay(iso) {           // days since 1970-01-01
  const [y, m, d] = iso.split('-').map(Number);
  let days = 0;
  for (let yy = 1970; yy < y; yy++) days += isLeap(yy) ? 366 : 365;
  days += MONTH_CUM[m - 1] + (m > 2 && isLeap(y) ? 1 : 0) + (d - 1);
  return days;
}
function fromEpochDay(n) {
  let y = 1970;
  while (true) { const len = isLeap(y) ? 366 : 365; if (n < len) break; n -= len; y++; }
  const leap = isLeap(y);
  let m = 11;
  for (let i = 11; i >= 0; i--) { const cum = MONTH_CUM[i] + (i >= 2 && leap ? 1 : 0); if (n >= cum) { m = i; n -= cum; break; } }
  const mm = String(m + 1).padStart(2, '0'), dd = String(n + 1).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
// 1970-01-01 was a Thursday → dow = (epochDay + 4) % 7, 0=Sun..6=Sat
const dow = (epoch) => (epoch + 4) % 7;
const breakDays = new Set();
for (const b of CAL.breaks) { for (let e = toEpochDay(b.from); e <= toEpochDay(b.to); e++) breakDays.add(e); }
const isSchoolDay = (epoch) => { const w = dow(epoch); return w !== 0 && w !== 6 && !breakDays.has(epoch); };

// A day walker that yields consecutive school days from a start.
function makeWalker(startIso) {
  let e = toEpochDay(startIso);
  while (!isSchoolDay(e)) e++;
  return {
    current: () => fromEpochDay(e),
    advance: () => { do { e++; } while (!isSchoolDay(e)); },
  };
}

// ── ordered CORE old-ids by new CED topic ────────────────────────────────────
const cw = JSON.parse(readFileSync(CW, 'utf8')).map;
const _tk = (t) => { const [a, b] = String(t || '').split('.').map(Number); return (a || 0) * 100 + (b || 0); };
const _oid = (id) => { const [a, b] = String(id).split('.').map(Number); return (a || 0) * 100 + (b || 0); };
const core = Object.entries(cw)
  .filter(([, c]) => c && c.status === 'core')
  .map(([oldId, c]) => ({ oldId, newUnit: c.newUnit, newTopic: c.newTopic }))
  .sort((a, b) => a.newUnit - b.newUnit || _tk(a.newTopic) - _tk(b.newTopic) || _oid(a.oldId) - _oid(b.oldId));

// ── walk each period, assigning dates + inserting N.review at unit boundaries ──
function schedule(period) {
  const w = makeWalker(fromEpochDay(toEpochDay(CAL.firstDay) + (CAL.periodStartOffsetDays[period] || 0)));
  const out = {};
  let prevUnit = null;
  for (const t of core) {
    if (prevUnit !== null && t.newUnit !== prevUnit) {           // unit boundary → review day for the unit just finished
      out[`${prevUnit}.review`] = w.current(); w.advance();
    }
    out[t.oldId] = w.current();
    for (let d = 0; d < CAL.daysPerTopic; d++) w.advance();
    prevUnit = t.newUnit;
  }
  out[`${prevUnit}.review`] = w.current();                        // final unit review
  return out;
}

const B = schedule('B'), E = schedule('E');

// ── invariants (baked in + fail-fast, matching P1a) ──────────────────────────
const bonusIds = Object.keys(cw).filter((k) => cw[k].status === 'bonus');
function checkPeriod(m) {
  // rebuild the intended date sequence (core + boundary reviews) in CED order
  const seq = []; let pu = null;
  for (const t of core) { if (pu !== null && t.newUnit !== pu) seq.push(m[`${pu}.review`]); seq.push(m[t.oldId]); pu = t.newUnit; }
  seq.push(m[`${pu}.review`]);
  let mono = true; for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) mono = false;
  return {
    count: Object.keys(m).length === core.length + 5,
    allCoreScheduled: core.every((t) => !!m[t.oldId]),
    noBonusScheduled: bonusIds.every((b) => !m[b]),
    reviews1to5: [1, 2, 3, 4, 5].every((n) => !!m[`${n}.review`]),
    monotonic: mono,
    allSchoolDays: Object.values(m).every((d) => isSchoolDay(toEpochDay(d))),
  };
}
const invariants = { B: checkPeriod(B), E: checkPeriod(E), beOffset: B[core[0].oldId] !== E[core[0].oldId], synthetic: CAL.synthetic === true, noExamDate: true };
const checks = [];
for (const P of ['B', 'E']) for (const [k, v] of Object.entries(invariants[P])) checks.push([`${P}.${k}`, v]);
checks.push(['B/E offset', invariants.beOffset], ['synthetic flag', invariants.synthetic]);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('INVARIANT FAILURE:\n  ' + failed.map(([m]) => m).join('\n  ')); process.exit(1); }

const out = {
  _synthetic: true,
  _note: 'SYNTHETIC FIXTURE — placeholder calendar, not the real SY2627 school calendar; AP exam date intentionally absent; NO production/Supabase sync. Core old-ids in Fall-2026 CED order, one meeting each, N.review at unit boundaries; bonus unscheduled. Replace CAL with the real calendar + pacing (spec §6) before any live use.',
  _reviewMarkers: 'Keys 1.review..5.review are NEW (Agent registry only has 6.review). Before Agent/roadmap/Supabase sync (P2), add registry entries or special-title handling for 1.review..5.review, else they surface as fallback "Topic N.review" rows.',
  _calendar: CAL,
  _counts: { coreTopics: core.length, reviews: 5, scheduledPerPeriod: Object.keys(B).length },
  _invariants: invariants,
  B, E,
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${OUT}  [SYNTHETIC]  invariants: OK (${checks.length} checks)`);
console.log(`  core topics: ${core.length}; scheduled/period: ${Object.keys(B).length} (incl. 5 reviews)`);
console.log(`  B: ${B[core[0].oldId]} (${core[0].oldId}) … ${B[core[core.length - 1].oldId]} (${core[core.length - 1].oldId}), 5.review ${B['5.review']}`);
console.log(`  E starts ${E[core[0].oldId]} (lags B by ${CAL.periodStartOffsetDays.E} school day)`);
console.log(`  NOTE: 1.review..5.review need P2 registry/special-title handling (see _reviewMarkers).`);
