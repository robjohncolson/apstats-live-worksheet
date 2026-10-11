# E_PAIRING_V2_SPEC.md — lag-targeted, video-minute-capped pairing on ANY Period E day

**Supersedes §1 of `E_WEDNESDAY_DOUBLE_SPEC.md`** (the placement rule only). Everything else in that spec — the
group cell shape, `groupTopics()`, the consumer behaviour, the JSON flatten + `dayGroups`, the additive group DOK
sheets — stays exactly as built in `0c1e70b` / `d136b02` / `b93ba91`.

**Teacher decisions 2026-09-11 (afternoon):**
1. "Spread the video load out from just Wednesday, so that no class has more than 30 minutes of video time."
2. Class time has slack after the Blooket + video, so a 30-minute video cap is the right proxy for "two follow-alongs
   fit in one block." (Still NOT the Sep-5 packing: at most TWO topics on a day, E only, and only while E trails B.)

## 1. The rule (replaces the four-condition Wednesday rule)

`generateSchedule` already walks every weekday and places B and E in the same loop. Track `placedB` and `placedE`
(count of pacing items placed so far, events included). When placing Period E on a meeting day, pair the next two
queue items when ALL of:

1. `date >= E.doubleFrom` — now `[2026,8,16]` (Wed Sep 16; Mon Sep 14 has been taught single).
2. **E trails B:** `placedE + 1 < placedB` evaluated AFTER B has been placed for that same date (B is placed first
   in the loop; on days B does not meet, `placedB` is unchanged). This is what keeps the pairs spread out instead
   of front-loaded: E doubles only when it is actually behind.
3. **Weekly limit:** at most `E.maxPairsPerWeek = 2` pairs in any Mon–Fri week.
4. Both next items are **plain lessons in the same unit** (no `kind`, `u > 0`, equal `u`) — unchanged.
5. **Video cap:** `minutes(a) + minutes(b) <= cap`, where `cap = E.videoCapMin = 30` on a normal day and
   `E.videoCapEarlyReleaseMin = 20` on an early-release Wednesday (`earlyRelease` list already on the def).
   Minutes come from a new Desk constant `VIDEO_MINUTES` (§2). A topic missing from the table counts as `Infinity`
   (never pairs) — fail closed.

`doubleDay` is no longer consulted for SY26-27 (leave the field; the archived calendars still carry it).
B never pairs (no `doubleFrom` on B).

Deterministic result on the real calendar (acceptance fixture — the build must reproduce it exactly):

| Date | Day | Pair | Video min |
|---|---|---|---|
| 2026-09-16 | Wed | 1.4+1.5 | 27 |
| 2026-09-23 | Wed | 1.7+1.8 | 27 |
| 2026-09-25 | Fri | 1.9+3.1 | 14 |
| 2026-10-19 | Mon | 2.1+2.2 | 16 |
| 2026-10-21 | Wed (early release) | 2.3+4.1 | 15 |
| 2026-10-26 | Mon | 4.3+4.4 | 15 |
| 2026-11-02 | Mon | 4.6+4.7 | 28 |
| 2026-11-06 | Fri | 4.10+4.11 | 17 |
| 2026-11-13 | Fri | 5.2+5.1 | 27 |
| 2026-11-25 | Wed (early release) | 5.4+5.5 | 18 |
| 2027-01-06 | Wed | 8.1+8.4 | 16 |
| 2027-01-22 | Fri | 5.7+7.1 | 23 |
| 2027-03-01 | Mon | 2.4+2.5 | 23 |

13 pairs; heaviest day 28 video minutes; E Unit-5 PC Day 2 = **Mar 15** (was Mar 22; B Feb 25); E review ends
**Mar 22** (was Mar 31); max lag behind B during the year = 9 topics. **B byte-identical** in the schedule JSON.
The two group sheets already built (`1.4_1.5`, `1.7_1.8`) remain the first two pairs — do not rebuild them.
The eight `dok/PENDING.md` rows from the Wednesday rule are replaced by the eleven new pairs (rows 3–13).

## 2. `VIDEO_MINUTES` in the Desk

`data/video-minutes.json` (ffprobe over the offline pack, 2026-09-05, 80 topics) is the source. The Desk cannot
fetch it synchronously inside `generateSchedule`, so bake a constant:

```js
// GENERATED from data/video-minutes.json by scripts/build-video-minutes-const.mjs — do not hand-edit.
const VIDEO_MINUTES = {"1.1":6.7,"1.2":9.3, …};
```

- New `scripts/build-video-minutes-const.mjs` writes/updates that one line in place (anchored on the comment) and
  supports `--check` (drift guard, like the schedule builder).
- `scripts/build-lesson-schedule-sy2627.mjs` extracts `VIDEO_MINUTES` with `constArray`-style anchoring
  (`const VIDEO_MINUTES = {`) and passes it to the generator so the JSON is built by the same rule.
- Test: the baked constant equals the JSON (`tests/video-minutes-const.test.js`).

## 3. What else moves

- `tests/desk-e-wednesday-double.test.js` → rename to `tests/desk-e-pairing.test.js`; acceptance table = §1;
  negative cases: no pair before Sep 16, no pair when E is not behind, no third pair in a week, no pair over the
  cap (use 6.2+6.3 = 47 min as the over-cap case), early-release cap 20, fail-closed on a missing topic.
- Regenerate both `lesson-schedule.json` copies; `--check` green; update the E dates asserted in root/server tests
  (expected dates only, never the engine); Schoology shared-date regression still green.
- `dok/PENDING.md`, `dok/index.html`, coverage test: pairs 3–13 pending; per-topic sheets untouched.
- Do NOT touch B, pacing lists, `injectPcPosterEvents`, unit boundaries, the fixture, or the grade engine.
