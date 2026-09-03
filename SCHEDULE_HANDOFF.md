# SCHEDULE_HANDOFF — the fall SY2627 schedule (start here)

**For the teacher:** §1 is the exact data to hand over. Nothing else is needed.
**For the next Claude/Codex instance:** §2 is the state as of 2026-08-19, §3 the ordered
work, §4 the gates. Read `sy2627-schedule-reframe-spec.md` (Codex-reviewed v2) for the
full design; this file only sequences it and records what changed since.

---

## 0. STATUS 2026-09-03 — the schedule is LIVE (steps 1–3 + 5 done)

Trigger: the Desk told Period B that 1.1 was due Fri 2026-09-04 — a district closure.
The Desk's baked `SCHEDULE_DEFS["SY26-27"]` still had the estimate calendar (start
Sep 1, exam May 14, 8 of 13 closures). Fixed in one pass, one source of truth:

- **`ap_stats_roadmap_square_mode.html` `SCHEDULE_DEFS["SY26-27"]`** now carries the real
  calendar (first day 09-02, exam 05-11, all 13 closures; B Mon/Tue/Thu/Fri, E Mon/Wed/Fri).
  Old `3.7` removed from both pacings (crosswalk: bonus since the 2026-08-07 retag; it was
  never in the Do-Now manifest either) → 66 core topics on the calendar.
- **`scripts/build-lesson-schedule-sy2627.mjs`** (NEW) extracts that block + the Desk's own
  `generateSchedule()` and writes BOTH `lesson-schedule.json` copies from it — so server
  "due" and the student calendar cannot disagree. Self-asserting (meeting days, closures,
  before-exam, core dated / bonus null, core order == the fixture generator's). The file now
  also carries `calendar{firstDay, examDate, breaks, meetingDays, quarters, events, slack}`;
  `progressChecks`/`posters` are keyed by NEW CED unit 1–5 (= Desk `U{n}-PC*` ids) with
  per-period `adminDay2` and `mcqPartA`. `lessons[].unit` stays the OLD id.
  Rerun after ANY change to the Desk calendar/pacing: `node scripts/build-lesson-schedule-sy2627.mjs`.
  `scripts/build-sy2627-schedule.mjs` (even-spread estimate) is SUPERSEDED — do not run it.
- **`roster-server/grade-config.js`** quarters = real LEHS marking periods (Q1 09-02→11-06,
  Q2 11-09→01-22, Q3 01-25→04-14, Q4 04-15→06-17).
- Tests moved with it: `quarters-by-date.test.js` (boundaries + a self-validating sanity block
  that reads the file's own `calendar`), `desk-grade-checkin.test.js` (preseason = Tue 09-01),
  J7 (66 lessons), m2b snapshot regenerated (`UPDATE_M2B_GOLDEN=1`; the Q1 band moved:
  old units 1/2/4 now finish after 11-06 under the CED order, so only old-unit 3 bands to Q1 —
  lesson attribution is per-lesson-date and unaffected).
- Step 4 (Supabase) needed NOTHING: `lesson_urls` keys are unchanged, and `topic_schedule`
  only feeds Schoology folder links/sync status in the Desk — never dates. The Agent repo's
  `config/topic-schedule.json` + `roadmap-data.json` PC/poster dates are still last year's
  (cosmetic; the Desk does not read dates from them). Step 6 (CED gradebook framing) still open.
- 2026-09-03 (later): teacher dropped the Day-2 **Unit 1 Baseline Check** from both pacings — the calendar now opens Welcome → 1.1 (B: 09-03 → 09-08; E: 09-02 → 09-09). Regenerated schedule + snapshots.
- **Grading-policy change (two adversarial reviews, 2026-09-03):** the v3 Lessons track now
  buckets a lesson by its CALENDAR DATE (`quarterOfLesson`, same as Phase 6) instead of the
  static old-unit band (`lesson-grade.js` computeQuarterV3). Under CED order the unit band put
  December work (old U8) in Q4 and let Q1 keep growing after 11-06 from 2.4–2.8. One-line
  revert if the teacher disagrees; `lesson-grade-v3.test.js` pins the new rule.
  The Desk's `QUARTER_WINDOWS` + `QUARTER_BAND_LABEL` (and start-here's) were also stale — now
  the real dates, labelled "Sep 2 – Nov 6" etc. instead of unit lists.
- **OPEN (blocks `PC_TRACK_ENABLED=true`):** PC ids are NEW CED units (`U{n}-PC-*`, pc_bank,
  Desk `U{n}-PC*`, `progressChecks` keys) but `grade.js`/`lesson-grade.js` (pcAnchor via
  `quarterOfUnit(unit)`, `unitPcDue`, `deriveQuarterBands` placement at :1145) treat `row.unit`
  as an OLD unit. With the real schedule `deriveQuarterBands` gives Q1=[3] (B), so new-U3's PC
  (administered 01-08) would be "due" in Q1 and zero every student's Q1 PC track. Resolve the
  old/new unit-id mapping in the PC path BEFORE flipping the flag.
- **OPEN:** `tools/schoology_sync_section.py:300-321` derives `PC{n}`/`POSTER{n}` scope keys
  from `progressChecks`/`posters` keys — those are now NEW units 1–5 (were old 1–9), while the
  grade-write side still keys `PC:U{old}`. Dry-run default + parked, but fix before the daily
  task is re-enabled.
- **OPEN (teacher):** Q4 (04-15 → 06-17) has NO scheduled lessons for either period (B finishes
  core 02-22, E 04-12); Q4 = bonus-only for B, one PC for E. Decide what Q4 grades on.
- MINOR: `lessonsTotal` counts the 11 null-dated bonus topics (they fall back to the unit band),
  so `/grade` says e.g. "of 26" where the Desk says "of 66 lessons" overall. Cosmetic.
- MINOR: old units 1 and 4 (B) finish 11-09/11-10 — one day into Q2 — so a one-day slip flips
  their derived band. Bands only matter for the PC path (above).
- **Watch: Period E slack before the exam is +3 meetings** (B +33). The Desk pacing spends
  E meetings on Welcome, baseline, 2 mid-unit MCQ-A days, 5 poster days, 5×2 PC days and 3
  review days; the intake's +14 assumed only 2 PC days/unit. Any "stop and extend" on E now
  costs a poster/review day — teacher decision.

---

## 1. Data the teacher provides (the intake)

Fill in `sy2627-calendar-intake.md` — it is the form. The minimum that unblocks everything:

| # | Item | Why it is needed |
|---|---|---|
| 1 | **First instructional day** and **AP exam date** | Term window; the generator places 67 core topics + review days inside it |
| 2 | **No-school days / breaks** (date ranges) | Skipped when placing lessons |
| 3 | **Period model**: still B and E? same-day cadence or offset? Any new section names? | `sectionToPeriod()` maps sections → the period whose dates gate "due"; PeriodX is the summer universal section |
| 4 | **Quarter boundaries** (Q1–Q4 start/end dates) — or "same pattern as last year" | `grade-config.js` `quarters[q].start/end`; the engine assigns lessons and (now) units to quarters BY DATE, so these dates are the grading calendar |
| 5 | **Pacing**: per-CED-2026-unit day budgets (recommended) or per-topic meetings | Distributes topics over the window; overflow is flagged, never silently compressed |
| 6 | Review days per new unit (yes/no; extras) | Adds `1.review`…`5.review` keys |
| 7 | Archive last year's `topic-schedule.json`? (yes/no) | Stops SY25-26 dates lingering |

If you already have a per-topic date list (topic → date per period), send that instead of
#5 — it wins over any pacing model.

---

## 2. State as of 2026-08-19 (verified in code, not from memory)

- **Everything is keyed by OLD 9-unit ids** (`1.1`…`9.x`): `roster-server/data/lesson-schedule.json`
  (77 lessons, dates 2026-09-09 → 2027-02-02 = **last year's sequence on this year's dates**, an
  estimate), answer key ids (`U1-L2-Q01`), PC bank, Blooket lists, worksheet files, ledger item ids.
  The CED-2026 view is a per-topic RELABEL (`roadmap-data.json` `ced2026.newUnit/newTopic/newLabel`);
  old→new is many-to-many at the unit level (old U2 → new U2+U5, old U5 → 2/3/4). No unit-level relabel is honest.
- **Quarter assignment is date-driven** for lessons (`quarterOfLesson`) and — since `ff20ee1` — for
  units too (`deriveQuarterBands` in `lesson-grade.js`: a unit belongs to the quarter of its latest
  scheduled lesson date; the static `config.quarters[q].units` list is only the fallback).
  Under the current estimate the dashboard shows Q1 U1–4 · Q2 U5–8 · Q3 U9 · Q4 —.
- **Teacher dashboard** labels quarters from the payload's derived bands and relabels gradebook
  column headers with the CED-2026 topic key (old key on hover). Desk calendar shows old-order
  topics with CED relabels.
- **Grade integrity is guarded**: golden master (`roster-server/tests/golden-master.test.js`;
  committed synthetic oracle + local real-data oracle from `~/grade-backups/`, see
  `roster-server/docs/golden-master.md`), answer key frozen per year (`docs/answer-key-freeze.md`),
  Desk journeys J1–J9 (`tests/journeys/`). Any schedule change WILL move golden outputs — that is
  expected; the gate is that every movement is reviewed before `--accept`.
- **Deploy verification**: `GET /health` on roster-server returns `commit` (Railway SHA).
- The July generator `scripts/build-topic-schedule-sy2627.mjs` produces a SYNTHETIC fixture until
  `CAL` (+ pacing) is filled from the intake (14 baked invariants).

---

## 3. Ordered work once §1 arrives

1. **Generate the real topic schedule** — set `CAL`/pacing in `build-topic-schedule-sy2627.mjs`
   from the intake; regenerate; invariants must pass; overflow flagged, not compressed.
2. **Registry / Do Now** — per the reframe spec §"Key correction": Do Now is manifest-order-driven,
   so the manifest (`roster-server/data/work-manifest.json` + `data/` copy) must be re-sequenced
   too; add registry titles for `N.review` keys. Rebake `roadmap-data.json`.
3. **roster-server schedule + bands** — write `roster-server/data/lesson-schedule.json` from the
   new topic schedule (still old-id keys unless the spec's id decision changes — the spec says NO
   id reindex, NO grade-history rewrite). Set `grade-config.js` `quarters[q].start/end` from #4;
   leave `units` lists as the fallback (they no longer drive anything with a schedule present).
   Also confirm the SY2627 freeze files (`grade-contexts.js` freeze validators) accept the new docs.
4. **Supabase `lesson_urls` overlay** — the table overrides baked URLs at runtime (CLAUDE.md); sync
   any new/renamed keys or the Desk will show stale rows.
5. **Gates (§4)** → commit → push. roster-server auto-deploys; verify `/health.commit`.
6. Then the CED-2026 unit *framing* of the gradebook (buttons in new units) becomes possible
   because the schedule is in new order; do it only after 1–5 are green.

---

## 4. Gates before any push that touches the schedule/grade path

- `cd roster-server && npx vitest run` — golden master WILL fail on the schedule change; run
  `node scripts/build-golden-fixture.mjs --accept` (local) and `node scripts/build-golden-synthetic.mjs`
  ONLY after reading the diff summary (which students/quarters moved and why); the m2b invariance
  snapshot regenerates with `UPDATE_M2B_GOLDEN=1`.
- `node scripts/build-grade-engine.mjs` (offline bundle parity) after any engine edit.
- `npx vitest run` (root) incl. `tests/journeys/` ×3; `pytest tests/`.
- Two adversarial Codex reviews (read-only) for anything under `roster-server/*.js`.
- Tell the teacher explicitly what students will SEE change (Desk calendar order, "due" labels)
  before pushing — the Desk is public on push.

---

## 4b. September env flips (Railway, teacher) — status 2026-08-19
- `PC_FIGURES_SUPABASE_URL/_SERVICE_KEY` — SET ✓. `TRAINER_DECK_ALLOWLIST` includes `ap-stats-flashcards` ✓. `USE_V3_GRADING=true` ✓ (production is V3; build the local golden oracle with the same flag).
- `TEACHER_KEY` — rotate off the published default (then update `~/grade-backups/config.json` teacherKey).
- `PC_TRACK_ENABLED=true` — **only after the first paper PC is scored** (SY2627_ACTIVATION_RUNBOOK.md Step 5); flipping early caps unscored students at 70% of Work. Rebuild the local oracle with the flag afterwards.

## 5. Open decisions (teacher)

- Keep old-id keys internally for SY2627 (spec's recommendation: yes — no history rewrite)?
- Quarter dates: reuse last year's pattern or new?
- Archive SY25-26 topic-schedule (yes/no)?
