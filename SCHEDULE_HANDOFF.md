# SCHEDULE_HANDOFF — the fall SY2627 schedule (start here)

**For the teacher:** §1 is the exact data to hand over. Nothing else is needed.
**For the next Claude/Codex instance:** §2 is the state as of 2026-08-19, §3 the ordered
work, §4 the gates. Read `sy2627-schedule-reframe-spec.md` (Codex-reviewed v2) for the
full design; this file only sequences it and records what changed since.

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

## 5. Open decisions (teacher)

- Keep old-id keys internally for SY2627 (spec's recommendation: yes — no history rewrite)?
- Quarter dates: reuse last year's pattern or new?
- Archive SY25-26 topic-schedule (yes/no)?
