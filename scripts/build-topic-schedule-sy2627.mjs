#!/usr/bin/env node
// build-topic-schedule-sy2627.mjs — SY2627 reframe, real-calendar edition.
//
// Generates topic-schedule.json-shaped output for the Fall-2026 5-unit CED:
// core old-ids sequenced in NEW teaching order, one class meeting each, with a
// N.review marker at each new-unit boundary. Bonus old-ids are NOT scheduled
// (enrichment only). Old-id keys unchanged (Option B).
//
// CAL is the REAL SY2627 calendar (intake completed 2026-09-01 — see
// sy2627-calendar-intake.md; sources: district calendar lynn-public-schools-2026-2027.md
// + LEHS weekly schedule xlsx + teacher answers):
//   * Periods B and E have DIFFERENT weekly cadences (B: Mon/Tue/Thu/Fri;
//     E: Mon/Wed/Fri). There is no "offset" — each period walks its own meeting days.
//   * Early-release Wednesdays are normal (shortened) E meetings — no scheduling effect.
//   * N.review = the in-class Progress Check block for that unit. It consumes
//     pcDaysPerUnit meetings (teacher: "the PC often takes two class periods");
//     the recorded date is the FIRST of them.
//   * The AP exam date is a HARD END: every scheduled date must land before it,
//     or the build fails (overflow is flagged, never compressed).
//
// This writes the fixture path only. Production placement (roster-server
// lesson-schedule.json, Supabase, Desk rebake) is later, gated work — see
// SCHEDULE_HANDOFF.md §3 steps 2-6.
//
// Run: node scripts/build-topic-schedule-sy2627.mjs [--out <path>]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const CW  = resolve(REPO, '2026-crosswalk.json');
const OUT = resolve(REPO, arg('--out', 'scripts/fixtures/topic-schedule-sy2627.fixture.json'));

// ── REAL SY2627 calendar (sy2627-calendar-intake.md, completed 2026-09-01) ──
const CAL = {
  synthetic: false,
  schoolYear: 'SY2627',
  firstDay: '2026-09-02',            // Wed — Day 1 of 180 (LPS district calendar)
  examDate: '2027-05-11',            // Tue — AP Statistics exam (teacher-confirmed); HARD END
  breaks: [                          // every district closure (single days use from == to)
    { name: 'School Closed',        from: '2026-09-04', to: '2026-09-04' },
    { name: 'Labor Day',            from: '2026-09-07', to: '2026-09-07' },
    { name: "Indigenous Peoples' Day", from: '2026-10-12', to: '2026-10-12' },
    { name: 'Teacher In-Service',   from: '2026-11-03', to: '2026-11-03' },
    { name: 'Veterans Day',         from: '2026-11-11', to: '2026-11-11' },
    { name: 'Thanksgiving Recess',  from: '2026-11-26', to: '2026-11-27' },
    { name: 'School Closed',        from: '2026-12-24', to: '2026-12-25' },
    { name: 'Winter Recess',        from: '2026-12-28', to: '2027-01-01' },
    { name: 'MLK Jr. Day',          from: '2027-01-18', to: '2027-01-18' },
    { name: 'February Vacation',    from: '2027-02-15', to: '2027-02-19' },
    { name: 'Good Friday',          from: '2027-03-26', to: '2027-03-26' },
    { name: 'April Vacation',       from: '2027-04-19', to: '2027-04-23' },
    { name: 'Memorial Day',         from: '2027-05-31', to: '2027-05-31' },
  ],
  daysPerTopic: 1,                   // teacher pacing: one meeting per core topic (videos fill it)
  pcDaysPerUnit: 2,                  // N.review = in-class Progress Check, ~2 class periods
  meetingDays: {                     // ISO weekday numbers, Mon=1..Fri=5 (LEHS Block Summary)
    B: [1, 2, 4, 5],                 // Mon, Tue, Thu, Fri — never Wednesday
    E: [1, 3, 5],                    // Mon, Wed, Fri — Wed is E's 90+30 block
  },
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
// 1970-01-01 was a Thursday → ISO weekday (Mon=1..Sun=7) = ((epoch + 3) % 7) + 1
const isoWeekday = (epoch) => ((epoch + 3) % 7) + 1;
const closedDays = new Set();
for (const b of CAL.breaks) { for (let e = toEpochDay(b.from); e <= toEpochDay(b.to); e++) closedDays.add(e); }
const meetsOn = (epoch, period) =>
  CAL.meetingDays[period].includes(isoWeekday(epoch)) && !closedDays.has(epoch);

// A day walker that yields consecutive MEETING days for one period.
function makeWalker(startIso, period) {
  let e = toEpochDay(startIso);
  while (!meetsOn(e, period)) e++;
  return {
    current: () => fromEpochDay(e),
    advance: () => { do { e++; } while (!meetsOn(e, period)); },
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

// ── walk each period on its own cadence; N.review (= the unit's Progress Check
//    block, pcDaysPerUnit meetings) at each unit boundary ─────────────────────
function schedule(period) {
  const w = makeWalker(CAL.firstDay, period);
  const out = {};
  const placePC = (unit) => {
    out[`${unit}.review`] = w.current();
    for (let d = 0; d < CAL.pcDaysPerUnit; d++) w.advance();
  };
  let prevUnit = null;
  for (const t of core) {
    if (prevUnit !== null && t.newUnit !== prevUnit) placePC(prevUnit);
    out[t.oldId] = w.current();
    for (let d = 0; d < CAL.daysPerTopic; d++) w.advance();
    prevUnit = t.newUnit;
  }
  placePC(prevUnit);                                              // final unit's PC
  return out;
}

const B = schedule('B'), E = schedule('E');

// ── invariants (baked in + fail-fast) ────────────────────────────────────────
const bonusIds = Object.keys(cw).filter((k) => cw[k].status === 'bonus');
const examEpoch = toEpochDay(CAL.examDate);
function checkPeriod(m, period) {
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
    allMeetingDays: Object.values(m).every((d) => meetsOn(toEpochDay(d), period)),
    beforeExam: Object.values(m).every((d) => toEpochDay(d) < examEpoch),
  };
}
const invariants = {
  B: checkPeriod(B, 'B'),
  E: checkPeriod(E, 'E'),
  beDiffer: B[core[0].oldId] !== E[core[0].oldId],
  realCalendar: CAL.synthetic === false && !!CAL.examDate,
};
const checks = [];
for (const P of ['B', 'E']) for (const [k, v] of Object.entries(invariants[P])) checks.push([`${P}.${k}`, v]);
checks.push(['B/E cadences differ', invariants.beDiffer], ['real calendar', invariants.realCalendar]);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('INVARIANT FAILURE:\n  ' + failed.map(([m]) => m).join('\n  ')); process.exit(1); }

// Slack = meetings left between the last scheduled meeting and the exam ("stop and
// extend" budget). Counted per period on its own cadence.
function slackAfter(m, period) {
  const last = Math.max(...Object.values(m).map(toEpochDay));
  let n = 0;
  for (let e = last + 1; e < examEpoch; e++) if (meetsOn(e, period)) n++;
  return n;
}
const slack = { B: slackAfter(B, 'B'), E: slackAfter(E, 'E') };

const out = {
  _synthetic: false,
  _note: 'REAL SY2627 calendar (intake completed 2026-09-01; sources: LPS district calendar + LEHS weekly schedule + teacher answers). Core old-ids in Fall-2026 CED order, one meeting per topic; N.review = that unit\'s in-class Progress Check block (2 meetings, dated at its first day); bonus unscheduled. B meets Mon/Tue/Thu/Fri, E meets Mon/Wed/Fri (incl. shortened early-release Wednesdays). AP exam 2027-05-11 is a hard end. Production placement (roster-server, Supabase, Desk) is separate gated work — SCHEDULE_HANDOFF.md §3.',
  _reviewMarkers: 'Keys 1.review..5.review are NEW (Agent registry only has 6.review). Before Agent/roadmap/Supabase sync (P2), add registry entries or special-title handling for 1.review..5.review, else they surface as fallback "Topic N.review" rows. Their student-facing meaning is "Progress Check" days.',
  _calendar: CAL,
  _counts: { coreTopics: core.length, reviews: 5, scheduledPerPeriod: Object.keys(B).length },
  _slackMeetingsBeforeExam: slack,
  _invariants: invariants,
  B, E,
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${OUT}  [REAL SY2627 CALENDAR]  invariants: OK (${checks.length} checks)`);
console.log(`  core topics: ${core.length}; scheduled/period: ${Object.keys(B).length} (incl. 5 PC/review markers)`);
console.log(`  B (Mon/Tue/Thu/Fri): ${B[core[0].oldId]} (${core[0].oldId}) … 5.review ${B['5.review']}  | slack before exam: ${slack.B} meetings`);
console.log(`  E (Mon/Wed/Fri):     ${E[core[0].oldId]} (${core[0].oldId}) … 5.review ${E['5.review']}  | slack before exam: ${slack.E} meetings`);
console.log(`  AP exam (hard end): ${CAL.examDate}`);
console.log(`  NOTE: 1.review..5.review need P2 registry/special-title handling (see _reviewMarkers).`);
