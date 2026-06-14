# Wallet Readiness Color — Spec

The wallet shows a continuous **red → yellow → green** signal of "am I caught up by
the current deadline?" — calendar-aware, from the live `/grade` payload.

Decisions (set by the teacher 2026-06-14):
- **Model:** completion gradient with **yellow pinned at best-of eligibility**.
- **Eligibility (the yellow waypoint):** **both PC and Work tracks ≥ 40%** (the v3
  engine gate where best-of = `max(pcAvg, workAvg)` turns on).
- **Surfaces:** whole wallet window tint, the balance card, the grade number, AND the
  desktop 👛 icon (so status shows before the wallet is even opened).
- **Scope:** the **current quarter**, due **by today** (the same quarter the wallet
  already displays).

## The metric — `WalletLogic.walletReadiness(quarter)`

`quarter` is the cached current-quarter object from `/grade` (`_gradeQuartersCache[gq]`),
which carries: `pcAvg`, `workAvg` (each `null` when that track has no due/graded data
yet), `lessonsDue`, `lessonsGraded`. Pure function; add to `js/wallet_logic.js` and test.

```
FLOOR = 0.40

walletReadiness(q):
  if !q or q.lessonsDue == null or q.lessonsDue <= 0:
      return { state:'nodue', r:null, hue:null }        // nothing due yet → NEUTRAL (no color signal)

  // Tracks with data gate eligibility; a null track is "not due yet", so it does
  // NOT drag the color (e.g. early in a unit before any Progress Check is due).
  tracks = [q.pcAvg, q.workAvg].filter(v => typeof v === 'number')
  e = tracks.length === 0 ? 0 : clamp(Math.min(...tracks) / FLOOR, 0, 1)   // progress to the floor
  eligible = e >= 1                                                         // both present tracks ≥ 40%

  completion = clamp(q.lessonsGraded / q.lessonsDue, 0, 1)                  // of due-by-today work

  // Two-segment readiness: red→yellow approaching the floor, yellow→green from
  // eligibility up to all-due-complete. Yellow (0.5) sits exactly at eligibility.
  r = eligible ? (0.5 + 0.5 * completion) : (0.5 * e)

  hue = 120 * r            // 0=red, 60=yellow, 120=green  (continuous)
  return { state: eligible ? (completion>=1 ? 'caughtup' : 'eligible') : 'behind',
           r, hue, eligible, completion, e }
```

Notes: the small bump at the moment of crossing eligibility is intentional — becoming
best-of eligible is a real unlock, and the color then reflects existing completion.

## Color application (in `ap_stats_roadmap_square_mode.html`)

Compute `walletReadiness(currentQuarterObj)` (reuse the wallet's existing current-quarter
pick — `quarterOfDate(new Date())` → `Q#`, fallback to first quarter with a numeric grade).
Map `hue` to each surface; when `state==='nodue'` (or no grade data), use a neutral grey
and no tint. All best-effort, never throw, degrade silently if the grade cache is absent.

- **Window tint:** the wallet window background → a soft `hsl(hue, 55%, 92%)` wash
  (light, non-distracting). Reset to default when neutral.
- **Balance card:** border + a faint background → `hsl(hue, 60%, 88%)` bg,
  `hsl(hue, 65%, 45%)` border.
- **Grade number:** the headline grade % text color → `hsl(hue, 70%, 35%)` (readable).
- **Desktop 👛 icon:** a status dot / tint on the `.app-icon[data-app="wallet"]` (e.g. a
  small colored ring or a corner dot `hsl(hue, 70%, 45%)`), updated whenever `/grade`
  loads (in `renderDoNowGrades`), not only when the wallet opens — so it reflects status
  on the desktop. Neutral state → no dot / grey.

Add a one-line legend in the wallet (e.g. a tiny "red → behind · yellow → eligible for
best-of · green → all caught up" caption under the balance card).

## Tests (`tests/wallet-logic.test.js`, extend)

- `nodue` when `lessonsDue` is 0/null → `state:'nodue'`.
- behind: `workAvg:0.2, pcAvg:null, lessonsDue:4, lessonsGraded:2` → `eligible:false`,
  `r ≈ 0.25` (e=0.5 → r=0.25), hue in the red-orange range.
- early unit, PC not due yet: `pcAvg:null, workAvg:0.5, lessonsDue:2, lessonsGraded:2`
  → eligible (work≥40, PC null ignored), `r = 1.0`, hue green.
- eligible-but-behind: `pcAvg:0.6, workAvg:0.5, lessonsDue:10, lessonsGraded:6` →
  eligible, `completion 0.6`, `r 0.8`.
- both below floor: `pcAvg:0.3, workAvg:0.5` → e=0.75, r=0.375 (the MIN track gates).
- caught up: all due graded + both tracks ≥0.4 → `r 1.0`, green.
- monotonic-ish sanity + clamping. Execute real imported code.
