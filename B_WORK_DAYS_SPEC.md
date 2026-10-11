# B_WORK_DAYS_SPEC.md — stretch Period B with Work Days so it paces with Period E

**Teacher decision 2026-09-11 (evening):** instead of only shortening E, stretch B: "2nd row sounds good" =
**keep E's pairing (`E_PAIRING_V2_SPEC.md`) AND give B a Work Day whenever it is ≥ 2 topics ahead of E, at most one
per week.** Simulated result: 11 Work Days; every unit's Progress Check lands within two days in both sections; B U5 PC
Mar 15 / E Mar 17; B review ends Mar 22 / E Mar 24; seven weeks of exam slack; B never more than 2 topics ahead.

## 1. The rule (generator, mirror of E's lag rule)

In `generateSchedule`, B is placed before E on each date and `placedB`/`placedE` already exist. When placing Period B
on a meeting day, emit a **Work Day cell instead of shifting the queue** when ALL of:

1. `date >= B.workDayFrom` — new field `[2026,8,14]` (nothing before it changes; the first Work Day falls Oct 13).
2. `placedB - placedE >= B.workDayGap` — new field `2`, evaluated with the counts as they stand BEFORE today's B
   placement (E has not been placed for today yet; that is the order the sim used and is what reproduces the fixture).
3. At most `B.maxWorkDaysPerWeek = 1` in any Mon–Fri week.
4. The next B queue item is a **plain lesson** (no `kind`) — never push a Poster/PC/PCA/Review/Welcome day back with
   a Work Day (they stay glued to their unit's last lesson).

A Work Day does NOT consume a pacing item. `placedB` is unchanged that day. E's pairing rule is untouched and still
reads `placedB` (so a Work Day slightly reduces how often E needs to pair — the fixture below already reflects that).

Acceptance fixture (the build must reproduce it exactly; dates are the Work Days, "before X" = the lesson that moves
to B's next meeting):

| Work Day | Before |
|---|---|
| 2026-10-13 Tue | 2.1 |
| 2026-10-19 Mon | 2.3 |
| 2026-11-13 Fri | 5.2 |
| 2026-12-11 Fri | 6.6 |
| 2026-12-18 Fri | 6.8 |
| 2027-01-08 Fri | 8.4 |
| 2027-01-22 Fri | 5.7 |
| 2027-02-05 Fri | 7.6 |
| 2027-02-12 Fri | 7.9 |
| 2027-03-01 Mon | 2.4 |
| 2027-03-19 Fri | Review 1 |

B unit-end (PC Day 2), both periods, under this rule (CORRECTED 2026-09-11 evening after Codex's preflight replay —
the first draft listed unsimulated B dates and claimed "three E pairs shift"; both were wrong, the Work-Day table above
was right):

| Unit | B PC Day 2 | E PC Day 2 |
|---|---|---|
| U1 | 2026-10-09 | 2026-10-16 |
| U2 | 2026-11-24 | 2026-11-30 |
| U3 | 2027-01-21 | 2027-01-25 |
| U4 | 2027-02-26 | 2027-03-03 |
| U5 | 2027-03-15 | 2027-03-17 |

B review ends Mar 22; E review ends Mar 24. Because a Work Day leaves `placedB` unchanged, E's lag rule pairs less
often and later — E's pair table becomes **12 pairs** (this replaces the 13-row table in `E_PAIRING_V2_SPEC.md` §1 as
the live fixture; that spec's rule is unchanged):

| E date | Pair |
|---|---|
| 2026-09-16 | 1.4+1.5 |
| 2026-09-23 | 1.7+1.8 |
| 2026-09-25 | 1.9+3.1 |
| 2026-10-19 | 2.1+2.2 |
| 2026-10-23 | 4.1+4.2 |
| 2026-11-06 | 4.7+4.8 |
| 2026-11-20 | 5.1+5.3 |
| 2026-12-02 | 5.4+5.5 |
| 2027-01-11 | 8.1+8.4 |
| 2027-01-27 | 5.7+7.1 |
| 2027-03-05 | 2.4+2.5 |
| 2027-03-08 | 2.6+2.7 |

`dayGroups.E` = those 12 pairs in order; `dayGroups.B` stays empty. The two built group sheets (`1.4_1.5`, `1.7_1.8`)
are still the first two pairs. `dok/PENDING.md` is regenerated to the new list silently (DOK work is parked).

## 2. The Work Day cell

```js
{ t:'B-Work', n:'Work Day', u:0, kind:'work', due:'', as:'' }
```

- Distinct non-dot id so every lesson gate / Do Now / DOK / resource lookup ignores it (same trick as `U{u}-PCA`).
- Calendar tile: new class `cell-work`, neutral platinum with a hatched or dotted border (System-7 style, like the
  existing Poster/PC tiles but quieter), label "Work Day"; tooltip and aria: "Work Day — catch up on follow-alongs,
  flashcards, quiz retakes, and exit tickets (bonus)". Legend entry "Work Day" for SY26-27 only.
- Do Now on a Work Day (Period B): headline "Work Day — nothing new today." Body = the existing earliest-gap walk
  (the first incomplete lesson) framed as "Finish: …", plus one line "Exit tickets are bonus (+5)". No due chip.
- Progress bar / pace (`rProg`, `_computePace`): Work Days are not lessons — counted in neither total nor expected.
- Resource panel: opening a Work Day tile shows the same catch-up text and a button to the next-up lesson's panel.
- Completion calendar / cross-device greying: never greys (not a lesson); `_isLessonComplete('B-Work')` must return
  true so the sequence gate skips over it.

## 3. Schedule JSON / server / Schoology

- `scripts/build-lesson-schedule-sy2627.mjs`: `kind:'work'` cells are placed items that are NOT lessons, PCs, or
  posters — skip them in `lessons`/`progressChecks`/`posters`, but include them in the pacing-order invariant only if
  you add them to the pacing arrays (you don't — they are generated). Simplest: the "everything in pacing landed, in
  order" check filters `kind==='work'` out of `placed` first. Add `calendar.workDays = { B: [iso…], E: [] }`
  (additive, schemaVersion stays 2).
- Nothing in roster-server grading reads Work Days. Schoology sync: no column for a Work Day (it is not in
  `component_columns` scope) — add a regression asserting `build_scope` ignores `kind:'work'`.
- Update the B dates asserted in root/server tests (expected dates only); `--check` green; B column changes are the
  feature; E column changes are exactly those implied by the 12-pair E table in §1 and nothing else.

## 4. Tests

- `tests/desk-b-work-days.test.js` (real extracted Desk functions): reproduces §1 fixture; no Work Day before Oct 13;
  never two in a week; never displaces an event tile; `placedB` unchanged on a Work Day; Do Now copy; tile class;
  gate skips it; pace excludes it; legacy calendars (SUMMER26 / SY25-26 `_legacyS`) unaffected.
- Extend `tests/desk-e-pairing.test.js` fixture to the post-Work-Day E pair table.

## 5. Out of scope

No change to E's rule parameters, pacing lists, unit boundaries, grade engine, DOK (parked by the teacher).
