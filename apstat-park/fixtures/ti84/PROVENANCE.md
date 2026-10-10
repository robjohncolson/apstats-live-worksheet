# TI-84 ROM evidence fixtures: provenance

Created 2026-10-10 for the APStatPark calculator handoff
(`ti84-transpile/APSTAT_PARK_CALCULATOR_HANDOFF_SPEC.md`).

These files are **test-only reference data**. They are compact copies of
evidence produced in the sibling repository `ti84-transpile`
(github.com/robjohncolson/ti84-transpile), working tree at HEAD
`27ef30c84c14e3063aeee8cd65ee942a6be482f2`. The source `logs/` directory is
gitignored there, so the files below are **not in that repo's history**; the
sha256 values are the only durable identity of the originals.

**Production code must not read these fixtures or depend on the sibling
checkout** (`C:/Users/rober/Downloads/Projects/school/ti84-transpile` or any
other absolute path). The relay does not need them. They are consumed only by
`apstat-park/calculator-oracles.test.mjs`.

## What was kept and what was dropped

Kept: inputs (dataset, frequencies, expanded values), the source's expected
values, observed screen text and verified numeric values, visual TRACE
transcriptions with the saved-screen sha256, geometry, scope and limits.

Dropped: VRAM `.bin` paths, per-run report paths, ROM block entry maps,
recovery-gap tables, step counts, differential data. No ROM bytes, no
decompiler output, no large logs.

In observed screen text, `?` marks a glyph the source's exact-glyph decoder
could not name (x-bar, Σ, σ, subscripts, superscript 2). The `value` field is
the verified number.

## Files

| Fixture | Source (relative to ti84-transpile) | sha256 of source |
|---|---|---|
| `statistics-clocked432.json` | `logs/curriculum-statistics-clocked432-evidence-1.json` | `63f5798f0677e1f9c484df143a45fd39eb3ce59fdba1570c04d3463f78d6b461` |
| `statistics-clocked432-zero-frequency.json` | `logs/curriculum-statistics-clocked432-zero-frequency-evidence-1.json` | `4a4811aa7eab7bc703fe49cf396495997d96f34b6ffe7027ac720fd5cf791d81` |
| `statistics-clocked433-all-zero-frequency.json` | `logs/curriculum-statistics-clocked433-all-zero-frequency-evidence-1.json` | `a06dbefbf1f1ff91a27369b854fca875bd8104759c17c582a165cf73db400185` |
| (inputs of the above) | `logs/curriculum-statistics-clocked433-all-zero-frequency-1-report.json` | `be19a2483e6f0a799e0c874e3a6a81421ba12904fd1aaec3f10ee7082b1d0efc` |
| `plots-clocked433.json` | `logs/curriculum-plots-clocked433-evidence-1.json` | `899e6ec4da402d0606b81318ae1fd24ab2deac4ec81e62d6d25c16a2d6692db6` |
| (boxplot dataset) | `logs/curriculum-boxplot-clocked433-outlier-1-report.json` | `40d3e9bc7feabcbfe149320179a29a099962c025dab9e946b56f93c534d70370` |
| (histogram dataset) | `logs/curriculum-histogram-clocked433-outlier-1-report.json` | `09077c663b6e4bb12ff38fbaa739ee580b61db70df5b5e4cbe8b52fa1b1244d1` |
| `plots-clocked433-trace-contact-sheet.png` | `logs/curriculum-plots-clocked433-trace-contact-sheet-1.png` (byte copy) | `83d6d861c4b8f515f42cea210084d1ee86967ad1cdca7a5285bc94bc756a184c` |
| `binomial-cdf-clocked431.json` | `logs/curriculum-binomial-cdf-clocked431-evidence-1.json` | `83a60c90a005e26f6c09ae10405c51b3fdea881c59fc9f2c7c8ccbcfb5acb440` |
| `binomial-clocked431-boundaries.json` | `logs/curriculum-binomial-clocked431-boundaries-evidence-1.json` | `facc9fb7a2eebbb5a4389fb218276331a4050d36743dfa41bef494f4390ea053` |

Cited, not copied:

| Source | sha256 | Why not copied |
|---|---|---|
| `TI-84_Plus_CE/semantic/trainer-curriculum-focus.json` | `ac96eac59667296c81abc914932b19cfa0809a354477b3d8a4c63c9e9cd57669` (4.8 MB, untracked in git) | Curriculum mapping/evidence inventory; too large. Read its scopes/limitations in place. |
| `logs/curriculum-onevar-entry-evidence-1.json` | `92e15fa80412a553044919df370ff66a174115179f842a8455377e4dea5f1c8f` | Recovered-block parity for the OneVarStats entry path; no student-facing values. |
| `logs/curriculum-onevar-error-evidence-1.json` | `6dbd1283f85ee1124f8030ed24900280064d8a75ded2c146e1dd9810d2aa0f08` | Recovered-block parity for the all-zero error path; no student-facing values. |

## What each fixture establishes

- **statistics-clocked432.json**: cold list entry → STAT CALC 1-Var Stats on
  `L1=[2,4,6]` (basic) and with `L2=[1,2,1]` as FreqList (expands to
  `[2,4,4,6]`). Every field n, x̄, Σx, Σx², Sx, σx, minX, Q1, Med, Q3, maxX was
  read from the saved screens with exact glyph matches. Quartiles follow
  median-of-halves.
- **statistics-clocked432-zero-frequency.json**: `L2=[1,0,1]` expands to
  `[2,6]`; the zero row contributes no observation.
- **statistics-clocked433-all-zero-frequency.json**: `L2=[0,0,0]` shows
  `Attempted calculation` / `contains division by 0.` / `Calculation fails.`
  plus a `2:Goto` menu line. No numeric result exists.
- **plots-clocked433.json**: data `[1,2,2,3,3,9]`. Modified boxplot geometry
  (Q1 2, Med 2.5, Q3 3, fences 0.5/4.5, whiskers 1 and 3, outlier 9) and
  histogram ZoomStat bins of width 2 from 1 (`[1,3)`:3, `[3,5)`:2, `[5,7)`:0,
  `[7,9)`:0, `[9,11)`:1, `[11,13)`:0). Rightward TRACE: boxplot
  `Med=2.5`, `Q3=3`, `X=3`, `maxX=9`, then stays on `maxX=9`; histogram
  `min=`/`max<`/`n=` per bin. Also records the histogram step-16 narration
  discrepancy in `ti84-procedures-data.json`.
- **binomial-cdf-clocked431.json**: `binomcdf(10,.5,3)` = `.171875` (176/1024).
- **binomial-clocked431-boundaries.json**: `binompdf(10,.5,3)` = `.1171875`,
  `binomcdf(10,0,0)` = `1`, `binomcdf(10,1,3)` = `0`.

## Stated limitations (carry these forward; do not overclaim)

- **Controlled device clock.** Every probe ran with all four device clocks
  starting at 0 and advancing 1 ms per 2,000-block execution budget. This
  proves these fixtures' behavior, not wall-clock/browser performance or
  hardware timing. The ROM workflow's wall-clock Paste timeout is unresolved.
- **TRACE labels are visually transcribed, not decoded.** No automatic
  small-font OCR ran on graph screens; a reader transcribed them from the saved
  screens (hashes recorded; see the contact sheet). On the contact sheet the
  histogram upper-boundary label reads `max<3`, `max<5`, …; the source evidence
  and the handoff spec write it as `maxX<`.
- **Unverified interactions.** Leftward boxplot TRACE (Q1, minX, lower
  whisker) was not exercised; a later bidirectional probe was stopped and is
  not evidence. Error dismissal, `Goto` execution and a subsequent correction
  after the all-zero error were not verified. Freq options on plots were not
  tested.
- **Narrow input coverage.** One dataset per scenario; positive-integer data
  only; one PDF and two CDF boundary cases plus one interior CDF. Other
  datasets, invalid parameters, the general ZoomStat bin-width rule,
  persistence and hardware equivalence remain unproven. The full calculator
  decompile is incomplete.
