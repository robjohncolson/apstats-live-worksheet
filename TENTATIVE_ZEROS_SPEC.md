# Tentative zeros on pending assignments — spec (2026-09-26)

Teacher: "on the potential zeros (not in Schoology yet, but coming up), the data should show the
zero as a different color (yellow) for tentative … include all the tentative zeros for the upcoming
deadlines." Decision: YES — a pending row shows *Monday's picture if nothing changes*.

Builds on `CLASS_SNAPSHOT_SPEC.md` (Phases 1–2) and the same-day follow-ups already shipped
(pooled `section=all`, pending rows, per-section `zeroDates`, focused view with advice).
Display-only. **No grade, ledger, Schoology, or Missing-work-card behaviour changes.**

## Vocabulary

- **Counting** item: `pending: false` — past its zero date in at least one section. Missing work
  there is a REAL 0 (already in `values`, drawn black; red when it is the viewer's).
- **Pending** item: `pending: true` — taught somewhere but past its zero date nowhere. Today its
  `values` hold recorded scores only.
- **Tentative 0**: a student in a section that has been *taught* the lesson (`lesson.due[period] <= asOf`)
  but is *not yet past* its zero date (`zeroDate[period] >= asOf`) and has no recorded score for
  that track. Becomes a real 0 on that section's zero date if nothing changes.

Note a MIXED item (B counting, E taught-not-counting) can carry both real zeros (from B) and
tentative zeros (from E). Today's server already pools B's zeros + E's recorded scores for it.

## 1. Server — `roster-server/class-snapshot.js`

### 1.1 Per-section (internal pooled call only, `pendingScores: true`)
For EVERY item (pending or not) computed with `pendingScores`, add
`tentativeZeros: <int>` = number of non-staff roster rows with no finite score for the track
**when this section is taught-but-not-counting for the lesson** (i.e. `pending` is true for this
section); otherwise `0`. `values` stays exactly as today (recorded scores; plus real zeros when the
section is counting).

The single-section public payload (`section=PeriodB`, no `pendingScores`) is **unchanged** — no
`tentativeZeros` key, pending lessons still omitted.

### 1.2 Merge (`mergeSnapshots`)
- `tentativeZeros` summed across sections; every pooled item carries it (0 when none).
- `values` remain REAL values only (recorded + real zeros). Do NOT inject zeros into `values`.
- Privacy floor: publish `values` when `values.length + tentativeZeros >= 5` (today the floor
  tests `values.length` alone). `n` stays `values.length` (real values). When the floor withholds,
  `values: []` and `tentativeZeros` is still published (a count identifies nobody).
- `zeros` (count of real zeros) unchanged; `null` under the floor as today.

### 1.3 Tests (`roster-server/tests/class-snapshot.test.js`)
- Pooled: lesson due only in B (B 6 rows: 3 scores, 3 missing) and taught-not-counting in E
  (E 6 rows: 2 scores, 4 missing) → item `{ values: [0,0,0,100,100,100,100,100], zeros: 3, tentativeZeros: 4, pending: false }`.
- Pooled: lesson pending everywhere → `tentativeZeros` = missing across both, `values` = recorded only.
- Floor: 2 recorded + 3 tentative → `values` published (total 5); 2 recorded + 2 tentative → `values: []`, `tentativeZeros: 2`.
- Single-section payload has no `tentativeZeros` key (pin with `toBeUndefined`).
- Existing pins must keep passing (update only the ones whose contract this spec changes).

## 2. Library — `lib/class-snapshot.js`

Public API additions (all optional, backwards compatible):

- `drawMini(canvas, { values, own, mode, tentativeZeros, ownTentative })`
- `assignmentCaption(a, own, { tentativeLabel, ownTentative })` where `a.tentativeZeros` may be set
- `miniHeight(mode, values, own, tentativeZeros)` (stem-and-leaf must count stem 0 when tentative zeros exist)

Colours: `TENTATIVE_FILL = '#f5d76e'`, `TENTATIVE_INK = '#8a6d00'`. Red (`#cc0000`) stays "you".

### 2.1 Distribution
Every statistic and every plot on a row uses the **display distribution**
`D = [0 × tentativeZeros] ++ values` (sorted). `fiveNumber`, fences, outliers, bins, stems, the
IQR-0 sentence, "below Q1 / inside the box / above Q3" all read from D.

### 2.2 The viewer's mark (`own`)
- `withOwn` rule as today, applied to D.
- Exactly one 0-mark is red when `own === 0`. Which one: if `ownTentative` and `tentativeZeros > 0`,
  a TENTATIVE 0 becomes the red mark (red fill, red stroke — the "you" rule does not change colour);
  else a real 0 is the red mark; else (no zeros in D) a red mark is added (today's `withOwn`).
- Never draw both a yellow and a red mark for the same person.

### 2.3 Per form
- **dot**: zeros stacked at 0 in order: real (white fill, black stroke), then tentative (yellow fill,
  `TENTATIVE_INK` stroke), the red one in place. Bin logic unchanged.
- **hist**: bin 0 bar is split: a black-outlined white segment for real values in the bin and a
  yellow segment (`TENTATIVE_FILL`, `TENTATIVE_INK` outline) for tentative zeros stacked on TOP of it
  (so the total height = the bin count in D). The count label shows the bin total.
- **stem**: stem 0 leaves in order real → tentative → the red "you" leaf if it is a real/tentative 0;
  tentative leaves in `TENTATIVE_INK`. Key line gains `· yellow = tentative 0` when `tentativeZeros > 0`.
- **box**: computed on D. Outlier dots at 0: a real-zero dot (white/black) if any real zeros; a
  tentative dot (yellow) drawn 6px below the centre line if any tentative zeros (so both show when
  mixed). The red "you" dot as today.
- Small-n text (`n < 5`) uses `D.length`.

### 2.4 Caption
`assignmentCaption(a, own, opts)`:
- Statistics from D.
- Zeros part: `<zeros> zeros` as today when `tentativeZeros === 0`; otherwise
  `<zeros> zeros + <tentativeZeros> tentative` followed by ` (<tentativeLabel>)` when
  `opts.tentativeLabel` is given (Desk passes e.g. `real after Sun 9/27`), e.g.
  `Median 100 · IQR 17 · 4 zeros + 11 tentative (real after Sun 9/27).`
  Singular: `1 zero`, `1 tentative`.
- The "You:" sentence: when `opts.ownTentative`, print `You: 0 (tentative) — <where>[ — outlier…].`
  The 0-at-Q1 sentence still applies.
- Tests in `tests/class-snapshot-lib.test.js`: caption strings above; drawMini in each mode with
  `{ tentativeZeros: 3, own: 0, ownTentative: true }` draws exactly 2 yellow marks + 1 red
  (assert via recorded `fillStyle` at each `arc`/`fillText`/`fillRect`); `miniHeight('stem', [50..100], 0, 2)` includes stem 0.

## 3. Desk — `ap_stats_roadmap_square_mode.html`

`_snapAssignmentRow(a, own, label)`:
- `tentative = Number(a.tentativeZeros) || 0`.
- `ownTentative = a.pending && own == null && label !== null && (viewer's section zero date is not past)`.
  The viewer's section is the one already derived in `_renderAssignmentsView`
  (`pickSection || 'Period' + cP || _snapSection()`); pass it into the row as a 4th argument
  `viewerSection` (add it; keep old call sites working with `undefined`). "Not past" =
  `_snapDaysUntil(a.zeroDates[viewerSection]) >= 0` when that date exists, else `a.pending`.
  A MIXED item where the viewer's own section is already counting → `ownTentative = false`
  (their 0 is real).
- Canvas: `ClassSnapshot.miniHeight(amode, a.values, ownForPlot, tentative)`;
  `drawMini(canvas, { values: a.values, own: ownForPlot, mode: amode, tentativeZeros: tentative, ownTentative })`.
- Caption: `assignmentCaption(a, ownArg, { tentativeLabel: tentative ? 'real after ' + <day text> : undefined, ownTentative })`
  where `<day text>` is `_snapZeroDateText(a).replace('counts from ', '')` for a pending item, or
  the viewer's own section date for a mixed one (use `a.zeroDates[viewerSection]` when present).
  The existing "You: nothing yet (…)" override is REPLACED by the library's `(tentative)` form.
- Score list (`.snap-alist`): chips in D order — tentative zeros first as
  `<span class="snap-alist-tentative">0</span>` (CSS: `color: #8a6d00; background: #fff3b0; padding: 0 3px;`),
  then real values as today. The red "you" chip follows §2.2 (a tentative chip becomes
  `.snap-alist-you` when `ownTentative`; keep `snap-alist-tentative` off it — red wins).
  Lead: `All <D.length> scores for <title>` + (tentative ? ` (<tentative> tentative)` : '') + `:`.
  Foot: `<have> of <D.length> classmates have a score here.` + (tentative ? ` <tentative> haven't yet — a tentative 0 until <day text>.` : '') + existing "Every 0 on this list can still be replaced." when the viewer's own is a 0/missing.
  `have` counts values > 0 (unchanged).
- Legend under a row with tentative zeros: a `div.snap-legend geneva` — `■ black = 0 already counting · ■ yellow = tentative 0 (real after <day text>) · ● red = you` (use small inline colour swatches, not emoji).
- `_snapAdvice` unchanged (already dated for pending).
- `_snapFocus` unchanged.

Tests (`tests/desk-class-snapshot-assignments.test.js`): fixture `W14` gains `tentativeZeros: 11`;
a Period B student missing 1.4 → caption `Median … · IQR … · 0 zeros + 11 tentative (real after Mon 9/28). You: 0 (tentative) — …`,
list has 11 `.snap-alist-tentative` chips of which one is also `.snap-alist-you` (and not tentative-styled),
foot text, legend present; a student WITH a 1.4 score → 11 yellow chips, red chip on their score;
a mixed item (`pending: false`, `zeros: 3`, `tentativeZeros: 4`) for a B viewer whose section is
counting → `ownTentative` false, caption `3 zeros + 4 tentative (real after <E day>)`.

## 4. Out of scope
- Teacher-workspace Class tab (quarter grades) — untouched.
- Missing-work card, Schoology comments, slips — untouched.
- Any toggle between "so far" and "if nothing changes" — deliberately not built.

## 5. Acceptance
- `npx vitest run tests/class-snapshot-lib.test.js tests/desk-class-snapshot-assignments.test.js tests/desk-class-snapshot.test.js` green.
- `cd roster-server && npx vitest run tests/class-snapshot.test.js` green, then the full roster-server suite green.
- No change to any single-section payload (pin).
- Files: LF line endings; no build bump, no shadow regen, no commit — the orchestrator does the release chain.
