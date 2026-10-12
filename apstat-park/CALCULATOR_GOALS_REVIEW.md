# Calculator goal hints: teacher review

Source: `apstat-park/calculator-goals.mjs` (edit the phrases there). The tables below are generated
from it by `node scripts/build-calculator-goals-review.mjs`; do not edit them by hand.

A goal is what the student sees at hint rung 1 (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §1): one phrase per
route key, and consecutive keys that serve the same purpose share it, so each row is one goal and the
keys it covers. Steps count from 1. Keys are the physical keys (`2ND Y=` is STAT PLOT).

<!-- notes:start (hand-written, kept by the build) -->

## Flags for the teacher

1. **Sigma fixed in three problems (2026-10-12).** The catalogue builder used to drop a typed `1` when the
   field already showed its default `1`, so these problems ran with the wrong sigma. The builder now presses
   CLEAR first (CLEAR empties a wizard field in the trainer and on a real CE), and the answers changed:
   - `normalcdf@1`: sigma 1.72 (was .72); answer 0.42278 (was 0.73769).
   - `invnorm@1`: sigma 100 (was 00); answer 432.55 (was 500).
   - `normalcdf-sampling@1`: sigma of x-bar 16 (was 6); answer 0.084566 (was 0.00012287).
   The CLEAR is required in the trainer: a `1` typed over the default does not change the screen, so it is
   ignored, and a student who skips CLEAR then types `0` and gets a wrong-key step.
2. **Binomial routes now use the menu letter** (`ALPHA MATH` = A:binompdf, `ALPHA APPS` = B:binomcdf), the way
   the geometpdf and chi-square routes already use `ALPHA COS` / `ALPHA x⁻¹`. This replaces ten or eleven DOWN
   presses. It is the one rewrite that is two keys, not one; say so if you want the scrolling route back.

## Trainer fidelity gaps

The trainer differs from a real TI-84 CE in these places. The goals are worded to be true on both.

1. **Paste needs a second ENTER on the CE.** In the distribution wizards (normalcdf, invNorm, binompdf,
   binomcdf, geometpdf, geometcdf and their variants) ENTER on Paste puts the command on Home and a second
   ENTER evaluates it; the trainer shows the result after one ENTER. Goal: "Paste it to Home (real CE: ENTER
   again)". (randIntNoRep already takes both ENTERs in the trainer: "Paste it to Home", "Run the random draw".)
2. **Inpt: Stats is pre-selected in 2-SampTTest / 2-SampTInt.** The trainer shows `Inpt: Stats` before the
   student picks it, so the route is RIGHT and then DOWN with no ENTER. On a CE in Data mode RIGHT only moves
   the cursor and ENTER selects. Goal: "Pick Stats for Inpt (real CE: ENTER)".
3. **Plot1 is already On** when the trainer's plot editor opens, so the goal is "Open Plot1 (check it is On)"
   rather than "Turn Plot1 On". On a CE a student may need ENTER on On.

## Routes shortened

`node scripts/audit-calculator-routes.mjs --apply` rewrote these routes (and their hints) to the short path the
engine already accepted; each still ends on the same final screen and result. `build-park-curriculum.mjs`
regenerates the long routes, so run the audit with `--apply` after it.

| Problem | Keys | Written route | Now | Why |
|---|---|---|---|---|
| histogram, histogram@1, histogram@bins, dotplot, dotplot@1 | 13 -> 11 | `DOWN DOWN ZOOM` | `ZOOM` | ZOOM from the plot editor |
| modified-boxplot, modified-boxplot@1 | 14 -> 12 | `DOWN DOWN ZOOM` | `ZOOM` | ZOOM from the plot editor |
| modified-boxplot@outlier | 16 -> 14 | `DOWN DOWN ZOOM` | `ZOOM` | ZOOM from the plot editor |
| scatterplot, scatterplot@1 | 10 -> 7 | `DOWN DOWN DOWN ZOOM` | `ZOOM` | ZOOM from the plot editor |
| binompdf, binompdf@1 | 24 -> 15 | `DOWN` x10 `ENTER` | `ALPHA MATH` | menu letter A:binompdf( |
| binompdf@exactly-3 | 23 -> 14 | `DOWN` x10 `ENTER` | `ALPHA MATH` | menu letter A:binompdf( |
| binomcdf | 25 -> 15 | `DOWN` x11 `ENTER` | `ALPHA APPS` | menu letter B:binomcdf( |
| binomcdf@1, binomcdf@2 | 26 -> 16 | `DOWN` x11 `ENTER` | `ALPHA APPS` | menu letter B:binomcdf( |
| binomcdf@at-most-3 | 24 -> 14 | `DOWN` x11 `ENTER` | `ALPHA APPS` | menu letter B:binomcdf( |
| binomcdf@never-heads, binomcdf@always-heads | 22 -> 12 | `DOWN` x11 `ENTER` | `ALPHA APPS` | menu letter B:binomcdf( |

Shortcuts the audit reports but deliberately keeps:

- `UP` wrapping from the first field to Calculate in LinReg(a+bx), LinRegTTest and χ²-Test (saves 2-4 keys):
  a real wrap, but not something students are taught; both paths stay accepted.
- In the randInt problems, `MATH`, `LEFT` or `8` "skip" the seed: the engine's screen fingerprint does not
  include the seed, but the draw then differs, so these are not shortcuts.

<!-- notes:end -->

## one-var-stats (1-Var Stats)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| one-var-stats | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats | 6 | `ENTER` | Calculate |
| one-var-stats | 7 | `DOWN` | Scroll to the five-number summary |
| one-var-stats@1 | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@1 | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@1 | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@1 | 6 | `ENTER` | Calculate |
| one-var-stats@1 | 7 | `DOWN` | Scroll to the five-number summary |
| one-var-stats@sample-sd | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@sample-sd | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@sample-sd | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@sample-sd | 6 | `ENTER` | Calculate |
| one-var-stats@population-sd | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@population-sd | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@population-sd | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@population-sd | 6 | `ENTER` | Calculate |
| one-var-stats@freq | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@freq | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@freq | 4 | `DOWN` | Move down to FreqList |
| one-var-stats@freq | 5-6 | `2ND 2` | Set FreqList to L2 |
| one-var-stats@freq | 7 | `DOWN` | Move down to Calculate |
| one-var-stats@freq | 8 | `ENTER` | Calculate |
| one-var-stats@zero-row | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@zero-row | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@zero-row | 4 | `DOWN` | Move down to FreqList |
| one-var-stats@zero-row | 5-6 | `2ND 2` | Set FreqList to L2 |
| one-var-stats@zero-row | 7 | `DOWN` | Move down to Calculate |
| one-var-stats@zero-row | 8 | `ENTER` | Calculate |
| one-var-stats@no-observations | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@no-observations | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@no-observations | 4 | `DOWN` | Move down to FreqList |
| one-var-stats@no-observations | 5-6 | `2ND 2` | Set FreqList to L2 |
| one-var-stats@no-observations | 7 | `DOWN` | Move down to Calculate |
| one-var-stats@no-observations | 8 | `ENTER` | Calculate |
| one-var-stats@mean-sd | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@mean-sd | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@mean-sd | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@mean-sd | 6 | `ENTER` | Calculate |
| one-var-stats@five-number | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@five-number | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@five-number | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@five-number | 6 | `ENTER` | Calculate |
| one-var-stats@five-number | 7 | `DOWN` | Scroll to the five-number summary |
| one-var-stats@center | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| one-var-stats@center | 3 | `ENTER` | Pick 1:1-Var Stats |
| one-var-stats@center | 4-5 | `DOWN DOWN` | Move down to Calculate |
| one-var-stats@center | 6 | `ENTER` | Calculate |
| one-var-stats@center | 7 | `DOWN` | Scroll to the five-number summary |

## histogram (Histogram)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| histogram | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram | 4 | `DOWN` | Move down to Type |
| histogram | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| histogram@1 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram@1 | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram@1 | 4 | `DOWN` | Move down to Type |
| histogram@1 | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram@1 | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram@1 | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| histogram@bins | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram@bins | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram@bins | 4 | `DOWN` | Move down to Type |
| histogram@bins | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram@bins | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram@bins | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| histogram@skewed | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram@skewed | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram@skewed | 4 | `DOWN` | Move down to Type |
| histogram@skewed | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram@skewed | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram@skewed | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| histogram@symmetric | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram@symmetric | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram@symmetric | 4 | `DOWN` | Move down to Type |
| histogram@symmetric | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram@symmetric | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram@symmetric | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| histogram@gap | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| histogram@gap | 3 | `ENTER` | Open Plot1 (check it is On) |
| histogram@gap | 4 | `DOWN` | Move down to Type |
| histogram@gap | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| histogram@gap | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| histogram@gap | 10-11 | `TRACE RIGHT` | TRACE across the plot |

## modified-boxplot (Modified Boxplot)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| modified-boxplot | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot | 4 | `DOWN` | Move down to Type |
| modified-boxplot | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot | 11-12 | `TRACE RIGHT` | TRACE across the plot |
| modified-boxplot@1 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot@1 | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot@1 | 4 | `DOWN` | Move down to Type |
| modified-boxplot@1 | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot@1 | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot@1 | 11-12 | `TRACE RIGHT` | TRACE across the plot |
| modified-boxplot@outlier | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot@outlier | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot@outlier | 4 | `DOWN` | Move down to Type |
| modified-boxplot@outlier | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot@outlier | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot@outlier | 11-14 | `TRACE RIGHT RIGHT RIGHT` | TRACE across the plot |
| modified-boxplot@high-outlier | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot@high-outlier | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot@high-outlier | 4 | `DOWN` | Move down to Type |
| modified-boxplot@high-outlier | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot@high-outlier | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot@high-outlier | 11-14 | `TRACE RIGHT RIGHT RIGHT` | TRACE across the plot |
| modified-boxplot@low-outlier | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot@low-outlier | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot@low-outlier | 4 | `DOWN` | Move down to Type |
| modified-boxplot@low-outlier | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot@low-outlier | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot@low-outlier | 11-12 | `TRACE RIGHT` | TRACE across the plot |
| modified-boxplot@no-outlier | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| modified-boxplot@no-outlier | 3 | `ENTER` | Open Plot1 (check it is On) |
| modified-boxplot@no-outlier | 4 | `DOWN` | Move down to Type |
| modified-boxplot@no-outlier | 5-8 | `RIGHT RIGHT RIGHT ENTER` | Pick the modified boxplot |
| modified-boxplot@no-outlier | 9-10 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| modified-boxplot@no-outlier | 11-12 | `TRACE RIGHT` | TRACE across the plot |

## normalcdf (normalcdf)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| normalcdf | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf | 3 | `2` | Pick 2:normalcdf( |
| normalcdf | 4-9 | `(−) 1 2ND , 9 9` | Enter lower = -1E99 |
| normalcdf | 10 | `DOWN` | Move down to upper |
| normalcdf | 11-13 | `2 4 0` | Enter upper = 240 |
| normalcdf | 14 | `DOWN` | Move down to μ |
| normalcdf | 15-17 | `2 7 6` | Enter μ = 276 |
| normalcdf | 18 | `DOWN` | Move down to σ |
| normalcdf | 19-20 | `3 8` | Enter σ = 38 |
| normalcdf | 21 | `DOWN` | Move down to Paste |
| normalcdf | 22 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| normalcdf@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf@1 | 3 | `2` | Pick 2:normalcdf( |
| normalcdf@1 | 4-5 | `1 4` | Enter lower = 14 |
| normalcdf@1 | 6 | `DOWN` | Move down to upper |
| normalcdf@1 | 7-8 | `1 6` | Enter upper = 16 |
| normalcdf@1 | 9 | `DOWN` | Move down to μ |
| normalcdf@1 | 10-13 | `1 5 . 5` | Enter μ = 15.5 |
| normalcdf@1 | 14 | `DOWN` | Move down to σ |
| normalcdf@1 | 15-19 | `CLEAR 1 . 7 2` | Enter σ = 1.72 |
| normalcdf@1 | 20 | `DOWN` | Move down to Paste |
| normalcdf@1 | 21 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| normalcdf@2 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf@2 | 3 | `2` | Pick 2:normalcdf( |
| normalcdf@2 | 4-6 | `3 5 0` | Enter lower = 350 |
| normalcdf@2 | 7 | `DOWN` | Move down to upper |
| normalcdf@2 | 8-12 | `1 2ND , 9 9` | Enter upper = 1E99 |
| normalcdf@2 | 13 | `DOWN` | Move down to μ |
| normalcdf@2 | 14-16 | `4 7 8` | Enter μ = 478 |
| normalcdf@2 | 17 | `DOWN` | Move down to σ |
| normalcdf@2 | 18-19 | `6 4` | Enter σ = 64 |
| normalcdf@2 | 20 | `DOWN` | Move down to Paste |
| normalcdf@2 | 21 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## invnorm (invNorm)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| invnorm | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| invnorm | 3 | `3` | Pick 3:invNorm( |
| invnorm | 4-6 | `0 . 9` | Enter area = 0.9 |
| invnorm | 7 | `DOWN` | Move down to μ |
| invnorm | 8-11 | `2 5 . 5` | Enter μ = 25.5 |
| invnorm | 12 | `DOWN` | Move down to σ |
| invnorm | 13-15 | `3 . 5` | Enter σ = 3.5 |
| invnorm | 16-17 | `DOWN DOWN` | Move down to Paste |
| invnorm | 18 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| invnorm@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| invnorm@1 | 3 | `3` | Pick 3:invNorm( |
| invnorm@1 | 4-7 | `0 . 2 5` | Enter area = 0.25 |
| invnorm@1 | 8 | `DOWN` | Move down to μ |
| invnorm@1 | 9-11 | `5 0 0` | Enter μ = 500 |
| invnorm@1 | 12 | `DOWN` | Move down to σ |
| invnorm@1 | 13-16 | `CLEAR 1 0 0` | Enter σ = 100 |
| invnorm@1 | 17-18 | `DOWN DOWN` | Move down to Paste |
| invnorm@1 | 19 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| invnorm@2 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| invnorm@2 | 3 | `3` | Pick 3:invNorm( |
| invnorm@2 | 4-7 | `0 . 0 5` | Enter area = 0.05 |
| invnorm@2 | 8 | `DOWN` | Move down to μ |
| invnorm@2 | 9-10 | `2 5` | Enter μ = 25 |
| invnorm@2 | 11 | `DOWN` | Move down to σ |
| invnorm@2 | 12 | `4` | Enter σ = 4 |
| invnorm@2 | 13-14 | `DOWN DOWN` | Move down to Paste |
| invnorm@2 | 15 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## linreg-a-plus-bx (LinReg(a+bx))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| linreg-a-plus-bx | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| linreg-a-plus-bx | 3 | `8` | Pick 8:LinReg(a+bx) |
| linreg-a-plus-bx | 4-7 | `DOWN DOWN DOWN DOWN` | Move down to Calculate |
| linreg-a-plus-bx | 8 | `ENTER` | Calculate |
| linreg-a-plus-bx@1 | 1-2 | `STAT RIGHT` | Open STAT > CALC |
| linreg-a-plus-bx@1 | 3 | `8` | Pick 8:LinReg(a+bx) |
| linreg-a-plus-bx@1 | 4-7 | `DOWN DOWN DOWN DOWN` | Move down to Calculate |
| linreg-a-plus-bx@1 | 8 | `ENTER` | Calculate |

## scatterplot (Scatterplot)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| scatterplot | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| scatterplot | 3 | `ENTER` | Open Plot1 (check it is On) |
| scatterplot | 4-5 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| scatterplot | 6-7 | `TRACE RIGHT` | TRACE across the plot |
| scatterplot@1 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| scatterplot@1 | 3 | `ENTER` | Open Plot1 (check it is On) |
| scatterplot@1 | 4-5 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| scatterplot@1 | 6-7 | `TRACE RIGHT` | TRACE across the plot |

## residual-plot (Residual plot)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| residual-plot | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| residual-plot | 3 | `ENTER` | Open Plot1 (check it is On) |
| residual-plot | 4-6 | `DOWN DOWN DOWN` | Move down to Ylist |
| residual-plot | 7-9 | `2ND STAT 7` | Set Ylist to RESID from LIST |
| residual-plot | 10-11 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| residual-plot | 12-13 | `TRACE RIGHT` | TRACE across the plot |
| residual-plot@1 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| residual-plot@1 | 3 | `ENTER` | Open Plot1 (check it is On) |
| residual-plot@1 | 4-6 | `DOWN DOWN DOWN` | Move down to Ylist |
| residual-plot@1 | 7-9 | `2ND STAT 7` | Set Ylist to RESID from LIST |
| residual-plot@1 | 10-11 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| residual-plot@1 | 12-13 | `TRACE RIGHT` | TRACE across the plot |

## binompdf (binompdf)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| binompdf | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binompdf | 3-4 | `ALPHA MATH` | Pick A:binompdf( |
| binompdf | 5-6 | `1 0` | Enter trials = 10 |
| binompdf | 7 | `DOWN` | Move down to p |
| binompdf | 8-11 | `0 . 7 5` | Enter p = 0.75 |
| binompdf | 12 | `DOWN` | Move down to x |
| binompdf | 13 | `8` | Enter x = 8 |
| binompdf | 14 | `DOWN` | Move down to Paste |
| binompdf | 15 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binompdf@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binompdf@1 | 3-4 | `ALPHA MATH` | Pick A:binompdf( |
| binompdf@1 | 5-6 | `1 5` | Enter trials = 15 |
| binompdf@1 | 7 | `DOWN` | Move down to p |
| binompdf@1 | 8-11 | `0 . 2 5` | Enter p = 0.25 |
| binompdf@1 | 12 | `DOWN` | Move down to x |
| binompdf@1 | 13 | `5` | Enter x = 5 |
| binompdf@1 | 14 | `DOWN` | Move down to Paste |
| binompdf@1 | 15 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binompdf@exactly-3 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binompdf@exactly-3 | 3-4 | `ALPHA MATH` | Pick A:binompdf( |
| binompdf@exactly-3 | 5-6 | `1 0` | Enter trials = 10 |
| binompdf@exactly-3 | 7 | `DOWN` | Move down to p |
| binompdf@exactly-3 | 8-10 | `0 . 5` | Enter p = 0.5 |
| binompdf@exactly-3 | 11 | `DOWN` | Move down to x |
| binompdf@exactly-3 | 12 | `3` | Enter x = 3 |
| binompdf@exactly-3 | 13 | `DOWN` | Move down to Paste |
| binompdf@exactly-3 | 14 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## binomcdf (binomcdf)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| binomcdf | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf | 5-6 | `1 0` | Enter trials = 10 |
| binomcdf | 7 | `DOWN` | Move down to p |
| binomcdf | 8-11 | `0 . 7 5` | Enter p = 0.75 |
| binomcdf | 12 | `DOWN` | Move down to x |
| binomcdf | 13 | `6` | Enter x = 6 |
| binomcdf | 14 | `DOWN` | Move down to Paste |
| binomcdf | 15 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binomcdf@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf@1 | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf@1 | 5-7 | `1 8 0` | Enter trials = 180 |
| binomcdf@1 | 8 | `DOWN` | Move down to p |
| binomcdf@1 | 9-12 | `0 . 0 5` | Enter p = 0.05 |
| binomcdf@1 | 13 | `DOWN` | Move down to x |
| binomcdf@1 | 14 | `7` | Enter x = 7 |
| binomcdf@1 | 15 | `DOWN` | Move down to Paste |
| binomcdf@1 | 16 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binomcdf@2 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf@2 | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf@2 | 5-6 | `2 0` | Enter trials = 20 |
| binomcdf@2 | 7 | `DOWN` | Move down to p |
| binomcdf@2 | 8-11 | `0 . 8 5` | Enter p = 0.85 |
| binomcdf@2 | 12 | `DOWN` | Move down to x |
| binomcdf@2 | 13-14 | `1 7` | Enter x = 17 |
| binomcdf@2 | 15 | `DOWN` | Move down to Paste |
| binomcdf@2 | 16 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binomcdf@at-most-3 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf@at-most-3 | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf@at-most-3 | 5-6 | `1 0` | Enter trials = 10 |
| binomcdf@at-most-3 | 7 | `DOWN` | Move down to p |
| binomcdf@at-most-3 | 8-10 | `0 . 5` | Enter p = 0.5 |
| binomcdf@at-most-3 | 11 | `DOWN` | Move down to x |
| binomcdf@at-most-3 | 12 | `3` | Enter x = 3 |
| binomcdf@at-most-3 | 13 | `DOWN` | Move down to Paste |
| binomcdf@at-most-3 | 14 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binomcdf@never-heads | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf@never-heads | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf@never-heads | 5-6 | `1 0` | Enter trials = 10 |
| binomcdf@never-heads | 7 | `DOWN` | Move down to p |
| binomcdf@never-heads | 8 | `0` | Enter p = 0 |
| binomcdf@never-heads | 9 | `DOWN` | Move down to x |
| binomcdf@never-heads | 10 | `0` | Enter x = 0 |
| binomcdf@never-heads | 11 | `DOWN` | Move down to Paste |
| binomcdf@never-heads | 12 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| binomcdf@always-heads | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| binomcdf@always-heads | 3-4 | `ALPHA APPS` | Pick B:binomcdf( |
| binomcdf@always-heads | 5-6 | `1 0` | Enter trials = 10 |
| binomcdf@always-heads | 7 | `DOWN` | Move down to p |
| binomcdf@always-heads | 8 | `1` | Enter p = 1 |
| binomcdf@always-heads | 9 | `DOWN` | Move down to x |
| binomcdf@always-heads | 10 | `3` | Enter x = 3 |
| binomcdf@always-heads | 11 | `DOWN` | Move down to Paste |
| binomcdf@always-heads | 12 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## geometpdf (geometpdf)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| geometpdf | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| geometpdf | 3-4 | `ALPHA COS` | Pick F:geometpdf( |
| geometpdf | 5-8 | `0 . 1 2` | Enter p = 0.12 |
| geometpdf | 9 | `DOWN` | Move down to x |
| geometpdf | 10 | `5` | Enter x = 5 |
| geometpdf | 11 | `DOWN` | Move down to Paste |
| geometpdf | 12 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| geometpdf@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| geometpdf@1 | 3-4 | `ALPHA COS` | Pick F:geometpdf( |
| geometpdf@1 | 5-8 | `0 . 0 3` | Enter p = 0.03 |
| geometpdf@1 | 9 | `DOWN` | Move down to x |
| geometpdf@1 | 10-11 | `1 0` | Enter x = 10 |
| geometpdf@1 | 12 | `DOWN` | Move down to Paste |
| geometpdf@1 | 13 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## geometcdf (geometcdf)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| geometcdf | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| geometcdf | 3-4 | `ALPHA TAN` | Pick G:geometcdf( |
| geometcdf | 5-8 | `0 . 1 2` | Enter p = 0.12 |
| geometcdf | 9 | `DOWN` | Move down to x |
| geometcdf | 10 | `8` | Enter x = 8 |
| geometcdf | 11 | `DOWN` | Move down to Paste |
| geometcdf | 12 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| geometcdf@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| geometcdf@1 | 3-4 | `ALPHA TAN` | Pick G:geometcdf( |
| geometcdf@1 | 5-7 | `0 . 2` | Enter p = 0.2 |
| geometcdf@1 | 8 | `DOWN` | Move down to x |
| geometcdf@1 | 9 | `4` | Enter x = 4 |
| geometcdf@1 | 10 | `DOWN` | Move down to Paste |
| geometcdf@1 | 11 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## normalcdf-sampling (normalcdf for sampling distribution)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| normalcdf-sampling | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf-sampling | 3 | `2` | Pick 2:normalcdf( |
| normalcdf-sampling | 4-9 | `(−) 1 2ND , 9 9` | Enter lower = -1E99 |
| normalcdf-sampling | 10 | `DOWN` | Move down to upper |
| normalcdf-sampling | 11-13 | `2 6 0` | Enter upper = 260 |
| normalcdf-sampling | 14 | `DOWN` | Move down to μ |
| normalcdf-sampling | 15-17 | `2 7 6` | Enter μ = 276 |
| normalcdf-sampling | 18 | `DOWN` | Move down to σ |
| normalcdf-sampling | 19-21 | `7 . 6` | Enter σ = 7.6 |
| normalcdf-sampling | 22 | `DOWN` | Move down to Paste |
| normalcdf-sampling | 23 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| normalcdf-sampling@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf-sampling@1 | 3 | `2` | Pick 2:normalcdf( |
| normalcdf-sampling@1 | 4-6 | `5 0 0` | Enter lower = 500 |
| normalcdf-sampling@1 | 7 | `DOWN` | Move down to upper |
| normalcdf-sampling@1 | 8-12 | `1 2ND , 9 9` | Enter upper = 1E99 |
| normalcdf-sampling@1 | 13 | `DOWN` | Move down to μ |
| normalcdf-sampling@1 | 14-16 | `4 7 8` | Enter μ = 478 |
| normalcdf-sampling@1 | 17 | `DOWN` | Move down to σ |
| normalcdf-sampling@1 | 18-20 | `CLEAR 1 6` | Enter σ = 16 |
| normalcdf-sampling@1 | 21 | `DOWN` | Move down to Paste |
| normalcdf-sampling@1 | 22 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| normalcdf-sampling@2 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| normalcdf-sampling@2 | 3 | `2` | Pick 2:normalcdf( |
| normalcdf-sampling@2 | 4-5 | `2 4` | Enter lower = 24 |
| normalcdf-sampling@2 | 6 | `DOWN` | Move down to upper |
| normalcdf-sampling@2 | 7-8 | `2 6` | Enter upper = 26 |
| normalcdf-sampling@2 | 9 | `DOWN` | Move down to μ |
| normalcdf-sampling@2 | 10-11 | `2 5` | Enter μ = 25 |
| normalcdf-sampling@2 | 12 | `DOWN` | Move down to σ |
| normalcdf-sampling@2 | 13-17 | `0 . 6 6 7` | Enter σ = 0.667 |
| normalcdf-sampling@2 | 18 | `DOWN` | Move down to Paste |
| normalcdf-sampling@2 | 19 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## invnorm-sampling (invNorm for sampling distribution)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| invnorm-sampling | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| invnorm-sampling | 3 | `3` | Pick 3:invNorm( |
| invnorm-sampling | 4-7 | `0 . 9 5` | Enter area = 0.95 |
| invnorm-sampling | 8 | `DOWN` | Move down to μ |
| invnorm-sampling | 9-12 | `6 4 . 5` | Enter μ = 64.5 |
| invnorm-sampling | 13 | `DOWN` | Move down to σ |
| invnorm-sampling | 14-18 | `0 . 3 5 7` | Enter σ = 0.357 |
| invnorm-sampling | 19-20 | `DOWN DOWN` | Move down to Paste |
| invnorm-sampling | 21 | `ENTER` | Paste it to Home (real CE: ENTER again) |
| invnorm-sampling@1 | 1-2 | `2ND VARS` | Open DISTR (2ND VARS) |
| invnorm-sampling@1 | 3 | `3` | Pick 3:invNorm( |
| invnorm-sampling@1 | 4-6 | `0 . 1` | Enter area = 0.1 |
| invnorm-sampling@1 | 7 | `DOWN` | Move down to μ |
| invnorm-sampling@1 | 8-11 | `1 2 0 0` | Enter μ = 1200 |
| invnorm-sampling@1 | 12 | `DOWN` | Move down to σ |
| invnorm-sampling@1 | 13-17 | `3 1 . 6 2` | Enter σ = 31.62 |
| invnorm-sampling@1 | 18-19 | `DOWN DOWN` | Move down to Paste |
| invnorm-sampling@1 | 20 | `ENTER` | Paste it to Home (real CE: ENTER again) |

## one-propztest (1-PropZTest)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| one-propztest | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propztest | 4 | `5` | Pick 5:1-PropZTest |
| one-propztest | 5-7 | `0 . 7` | Enter p0 = 0.7 |
| one-propztest | 8 | `DOWN` | Move down to x |
| one-propztest | 9-11 | `1 2 6` | Enter x = 126 |
| one-propztest | 12 | `DOWN` | Move down to n |
| one-propztest | 13-15 | `2 0 0` | Enter n = 200 |
| one-propztest | 16 | `DOWN` | Move down to prop |
| one-propztest | 17-18 | `RIGHT ENTER` | Pick Ha: prop &lt;p₀ |
| one-propztest | 19-20 | `DOWN DOWN` | Move down to Calculate |
| one-propztest | 21 | `ENTER` | Calculate |
| one-propztest@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propztest@1 | 4 | `5` | Pick 5:1-PropZTest |
| one-propztest@1 | 5-7 | `0 . 9` | Enter p0 = 0.9 |
| one-propztest@1 | 8 | `DOWN` | Move down to x |
| one-propztest@1 | 9-11 | `1 0 0` | Enter x = 100 |
| one-propztest@1 | 12 | `DOWN` | Move down to n |
| one-propztest@1 | 13-15 | `1 2 0` | Enter n = 120 |
| one-propztest@1 | 16 | `DOWN` | Move down to prop |
| one-propztest@1 | 17-18 | `RIGHT ENTER` | Pick Ha: prop &lt;p₀ |
| one-propztest@1 | 19-20 | `DOWN DOWN` | Move down to Calculate |
| one-propztest@1 | 21 | `ENTER` | Calculate |
| one-propztest@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propztest@2 | 4 | `5` | Pick 5:1-PropZTest |
| one-propztest@2 | 5-8 | `0 . 3 8` | Enter p0 = 0.38 |
| one-propztest@2 | 9 | `DOWN` | Move down to x |
| one-propztest@2 | 10-11 | `4 5` | Enter x = 45 |
| one-propztest@2 | 12 | `DOWN` | Move down to n |
| one-propztest@2 | 13-15 | `1 0 0` | Enter n = 100 |
| one-propztest@2 | 16-18 | `DOWN DOWN DOWN` | Move down to Calculate |
| one-propztest@2 | 19 | `ENTER` | Calculate |

## one-propzint (1-PropZInt)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| one-propzint | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propzint | 4-5 | `ALPHA MATH` | Pick A:1-PropZInt |
| one-propzint | 6-7 | `2 2` | Enter x = 22 |
| one-propzint | 8 | `DOWN` | Move down to n |
| one-propzint | 9-10 | `8 0` | Enter n = 80 |
| one-propzint | 11 | `DOWN` | Move down to C-Level |
| one-propzint | 12-15 | `0 . 9 9` | Enter C-Level = 0.99 |
| one-propzint | 16 | `DOWN` | Move down to Calculate |
| one-propzint | 17 | `ENTER` | Calculate |
| one-propzint@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propzint@1 | 4-5 | `ALPHA MATH` | Pick A:1-PropZInt |
| one-propzint@1 | 6-8 | `2 3 5` | Enter x = 235 |
| one-propzint@1 | 9 | `DOWN` | Move down to n |
| one-propzint@1 | 10-12 | `5 0 0` | Enter n = 500 |
| one-propzint@1 | 13 | `DOWN` | Move down to C-Level |
| one-propzint@1 | 14-17 | `0 . 9 5` | Enter C-Level = 0.95 |
| one-propzint@1 | 18 | `DOWN` | Move down to Calculate |
| one-propzint@1 | 19 | `ENTER` | Calculate |
| one-propzint@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| one-propzint@2 | 4-5 | `ALPHA MATH` | Pick A:1-PropZInt |
| one-propzint@2 | 6-7 | `3 5` | Enter x = 35 |
| one-propzint@2 | 8 | `DOWN` | Move down to n |
| one-propzint@2 | 9-10 | `5 0` | Enter n = 50 |
| one-propzint@2 | 11 | `DOWN` | Move down to C-Level |
| one-propzint@2 | 12-14 | `0 . 9` | Enter C-Level = 0.9 |
| one-propzint@2 | 15 | `DOWN` | Move down to Calculate |
| one-propzint@2 | 16 | `ENTER` | Calculate |

## two-propztest (2-PropZTest)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| two-propztest | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propztest | 4 | `6` | Pick 6:2-PropZTest |
| two-propztest | 5-6 | `3 0` | Enter x1 = 30 |
| two-propztest | 7 | `DOWN` | Move down to n1 |
| two-propztest | 8-10 | `2 5 0` | Enter n1 = 250 |
| two-propztest | 11 | `DOWN` | Move down to x2 |
| two-propztest | 12-13 | `4 5` | Enter x2 = 45 |
| two-propztest | 14 | `DOWN` | Move down to n2 |
| two-propztest | 15-17 | `2 4 0` | Enter n2 = 240 |
| two-propztest | 18 | `DOWN` | Move down to p1 |
| two-propztest | 19-20 | `RIGHT ENTER` | Pick Ha: p1 &lt;p2 |
| two-propztest | 21-22 | `DOWN DOWN` | Move down to Calculate |
| two-propztest | 23 | `ENTER` | Calculate |
| two-propztest@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propztest@1 | 4 | `6` | Pick 6:2-PropZTest |
| two-propztest@1 | 5-6 | `8 4` | Enter x1 = 84 |
| two-propztest@1 | 7 | `DOWN` | Move down to n1 |
| two-propztest@1 | 8-10 | `1 5 0` | Enter n1 = 150 |
| two-propztest@1 | 11 | `DOWN` | Move down to x2 |
| two-propztest@1 | 12-13 | `9 9` | Enter x2 = 99 |
| two-propztest@1 | 14 | `DOWN` | Move down to n2 |
| two-propztest@1 | 15-17 | `1 8 0` | Enter n2 = 180 |
| two-propztest@1 | 18-20 | `DOWN DOWN DOWN` | Move down to Calculate |
| two-propztest@1 | 21 | `ENTER` | Calculate |
| two-propztest@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propztest@2 | 4 | `6` | Pick 6:2-PropZTest |
| two-propztest@2 | 5-6 | `9 2` | Enter x1 = 92 |
| two-propztest@2 | 7 | `DOWN` | Move down to n1 |
| two-propztest@2 | 8-10 | `4 0 0` | Enter n1 = 400 |
| two-propztest@2 | 11 | `DOWN` | Move down to x2 |
| two-propztest@2 | 12-13 | `6 4` | Enter x2 = 64 |
| two-propztest@2 | 14 | `DOWN` | Move down to n2 |
| two-propztest@2 | 15-17 | `3 8 0` | Enter n2 = 380 |
| two-propztest@2 | 18 | `DOWN` | Move down to p1 |
| two-propztest@2 | 19-21 | `RIGHT RIGHT ENTER` | Pick Ha: p1 >p2 |
| two-propztest@2 | 22-23 | `DOWN DOWN` | Move down to Calculate |
| two-propztest@2 | 24 | `ENTER` | Calculate |

## two-propzint (2-PropZInt)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| two-propzint | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propzint | 4-5 | `ALPHA APPS` | Pick B:2-PropZInt |
| two-propzint | 6-7 | `7 8` | Enter x1 = 78 |
| two-propzint | 8 | `DOWN` | Move down to n1 |
| two-propzint | 9-11 | `1 2 0` | Enter n1 = 120 |
| two-propzint | 12 | `DOWN` | Move down to x2 |
| two-propzint | 13-14 | `5 5` | Enter x2 = 55 |
| two-propzint | 15 | `DOWN` | Move down to n2 |
| two-propzint | 16-18 | `1 1 0` | Enter n2 = 110 |
| two-propzint | 19 | `DOWN` | Move down to C-Level |
| two-propzint | 20-23 | `0 . 9 5` | Enter C-Level = 0.95 |
| two-propzint | 24 | `DOWN` | Move down to Calculate |
| two-propzint | 25 | `ENTER` | Calculate |
| two-propzint@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propzint@1 | 4-5 | `ALPHA APPS` | Pick B:2-PropZInt |
| two-propzint@1 | 6-8 | `2 1 0` | Enter x1 = 210 |
| two-propzint@1 | 9 | `DOWN` | Move down to n1 |
| two-propzint@1 | 10-12 | `3 5 0` | Enter n1 = 350 |
| two-propzint@1 | 13 | `DOWN` | Move down to x2 |
| two-propzint@1 | 14-16 | `1 6 2` | Enter x2 = 162 |
| two-propzint@1 | 17 | `DOWN` | Move down to n2 |
| two-propzint@1 | 18-20 | `3 0 0` | Enter n2 = 300 |
| two-propzint@1 | 21 | `DOWN` | Move down to C-Level |
| two-propzint@1 | 22-24 | `0 . 9` | Enter C-Level = 0.9 |
| two-propzint@1 | 25 | `DOWN` | Move down to Calculate |
| two-propzint@1 | 26 | `ENTER` | Calculate |
| two-propzint@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-propzint@2 | 4-5 | `ALPHA APPS` | Pick B:2-PropZInt |
| two-propzint@2 | 6-7 | `6 8` | Enter x1 = 68 |
| two-propzint@2 | 8 | `DOWN` | Move down to n1 |
| two-propzint@2 | 9-10 | `8 0` | Enter n1 = 80 |
| two-propzint@2 | 11 | `DOWN` | Move down to x2 |
| two-propzint@2 | 12-13 | `5 4` | Enter x2 = 54 |
| two-propzint@2 | 14 | `DOWN` | Move down to n2 |
| two-propzint@2 | 15-16 | `7 5` | Enter n2 = 75 |
| two-propzint@2 | 17 | `DOWN` | Move down to C-Level |
| two-propzint@2 | 18-21 | `0 . 9 9` | Enter C-Level = 0.99 |
| two-propzint@2 | 22 | `DOWN` | Move down to Calculate |
| two-propzint@2 | 23 | `ENTER` | Calculate |

## t-test-stats (T-Test (Stats input))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| t-test-stats | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-test-stats | 4 | `2` | Pick 2:T-Test |
| t-test-stats | 5-6 | `RIGHT ENTER` | Pick Stats for Inpt |
| t-test-stats | 7 | `DOWN` | Move down to μ0 |
| t-test-stats | 8-10 | `5 0 0` | Enter μ0 = 500 |
| t-test-stats | 11 | `DOWN` | Move down to x̄ |
| t-test-stats | 12-14 | `4 9 4` | Enter x̄ = 494 |
| t-test-stats | 15 | `DOWN` | Move down to Sx |
| t-test-stats | 16-17 | `1 8` | Enter Sx = 18 |
| t-test-stats | 18 | `DOWN` | Move down to n |
| t-test-stats | 19-20 | `3 6` | Enter n = 36 |
| t-test-stats | 21 | `DOWN` | Move down to μ ? μ0 |
| t-test-stats | 22-23 | `RIGHT ENTER` | Pick Ha: μ &lt; μ0 |
| t-test-stats | 24-25 | `DOWN DOWN` | Move down to Calculate |
| t-test-stats | 26 | `ENTER` | Calculate |
| t-test-stats@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-test-stats@1 | 4 | `2` | Pick 2:T-Test |
| t-test-stats@1 | 5-6 | `RIGHT ENTER` | Pick Stats for Inpt |
| t-test-stats@1 | 7 | `DOWN` | Move down to μ0 |
| t-test-stats@1 | 8-9 | `1 0` | Enter μ0 = 10 |
| t-test-stats@1 | 10 | `DOWN` | Move down to x̄ |
| t-test-stats@1 | 11-13 | `8 . 9` | Enter x̄ = 8.9 |
| t-test-stats@1 | 14 | `DOWN` | Move down to Sx |
| t-test-stats@1 | 15-17 | `3 . 2` | Enter Sx = 3.2 |
| t-test-stats@1 | 18 | `DOWN` | Move down to n |
| t-test-stats@1 | 19-20 | `2 5` | Enter n = 25 |
| t-test-stats@1 | 21 | `DOWN` | Move down to μ ? μ0 |
| t-test-stats@1 | 22-23 | `RIGHT ENTER` | Pick Ha: μ &lt; μ0 |
| t-test-stats@1 | 24-25 | `DOWN DOWN` | Move down to Calculate |
| t-test-stats@1 | 26 | `ENTER` | Calculate |
| t-test-stats@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-test-stats@2 | 4 | `2` | Pick 2:T-Test |
| t-test-stats@2 | 5-6 | `RIGHT ENTER` | Pick Stats for Inpt |
| t-test-stats@2 | 7 | `DOWN` | Move down to μ0 |
| t-test-stats@2 | 8-10 | `4 . 5` | Enter μ0 = 4.5 |
| t-test-stats@2 | 11 | `DOWN` | Move down to x̄ |
| t-test-stats@2 | 12-14 | `4 . 8` | Enter x̄ = 4.8 |
| t-test-stats@2 | 15 | `DOWN` | Move down to Sx |
| t-test-stats@2 | 16-18 | `1 . 1` | Enter Sx = 1.1 |
| t-test-stats@2 | 19 | `DOWN` | Move down to n |
| t-test-stats@2 | 20-21 | `4 0` | Enter n = 40 |
| t-test-stats@2 | 22 | `DOWN` | Move down to μ ? μ0 |
| t-test-stats@2 | 23-25 | `RIGHT RIGHT ENTER` | Pick Ha: μ > μ0 |
| t-test-stats@2 | 26-27 | `DOWN DOWN` | Move down to Calculate |
| t-test-stats@2 | 28 | `ENTER` | Calculate |

## t-test-data (T-Test (Data input))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| t-test-data | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-test-data | 4 | `2` | Pick 2:T-Test |
| t-test-data | 5 | `DOWN` | Move down to μ0 |
| t-test-data | 6-7 | `7 2` | Enter μ0 = 72 |
| t-test-data | 8-10 | `DOWN DOWN DOWN` | Move down to μ ? μ0 |
| t-test-data | 11-13 | `RIGHT RIGHT ENTER` | Pick Ha: μ > μ0 |
| t-test-data | 14-15 | `DOWN DOWN` | Move down to Calculate |
| t-test-data | 16 | `ENTER` | Calculate |
| t-test-data@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-test-data@1 | 4 | `2` | Pick 2:T-Test |
| t-test-data@1 | 5 | `DOWN` | Move down to μ0 |
| t-test-data@1 | 6-9 | `2 3 0 0` | Enter μ0 = 2300 |
| t-test-data@1 | 10-12 | `DOWN DOWN DOWN` | Move down to μ ? μ0 |
| t-test-data@1 | 13-15 | `RIGHT RIGHT ENTER` | Pick Ha: μ > μ0 |
| t-test-data@1 | 16-17 | `DOWN DOWN` | Move down to Calculate |
| t-test-data@1 | 18 | `ENTER` | Calculate |

## t-interval-stats (TInterval (Stats input))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| t-interval-stats | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-interval-stats | 4 | `8` | Pick 8:TInterval |
| t-interval-stats | 5-6 | `RIGHT ENTER` | Pick Stats for Inpt |
| t-interval-stats | 7 | `DOWN` | Move down to x̄ |
| t-interval-stats | 8-11 | `3 . 1 2` | Enter x̄ = 3.12 |
| t-interval-stats | 12 | `DOWN` | Move down to Sx |
| t-interval-stats | 13-16 | `0 . 4 8` | Enter Sx = 0.48 |
| t-interval-stats | 17 | `DOWN` | Move down to n |
| t-interval-stats | 18-19 | `4 5` | Enter n = 45 |
| t-interval-stats | 20 | `DOWN` | Move down to C-Level |
| t-interval-stats | 21-24 | `0 . 9 5` | Enter C-Level = 0.95 |
| t-interval-stats | 25 | `DOWN` | Move down to Calculate |
| t-interval-stats | 26 | `ENTER` | Calculate |
| t-interval-stats@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-interval-stats@1 | 4 | `8` | Pick 8:TInterval |
| t-interval-stats@1 | 5-6 | `RIGHT ENTER` | Pick Stats for Inpt |
| t-interval-stats@1 | 7 | `DOWN` | Move down to x̄ |
| t-interval-stats@1 | 8-10 | `4 2 5` | Enter x̄ = 425 |
| t-interval-stats@1 | 11 | `DOWN` | Move down to Sx |
| t-interval-stats@1 | 12-13 | `3 8` | Enter Sx = 38 |
| t-interval-stats@1 | 14 | `DOWN` | Move down to n |
| t-interval-stats@1 | 15-16 | `3 0` | Enter n = 30 |
| t-interval-stats@1 | 17 | `DOWN` | Move down to C-Level |
| t-interval-stats@1 | 18-21 | `0 . 9 9` | Enter C-Level = 0.99 |
| t-interval-stats@1 | 22 | `DOWN` | Move down to Calculate |
| t-interval-stats@1 | 23 | `ENTER` | Calculate |

## t-interval-data (TInterval (Data input))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| t-interval-data | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-interval-data | 4 | `8` | Pick 8:TInterval |
| t-interval-data | 5-7 | `DOWN DOWN DOWN` | Move down to C-Level |
| t-interval-data | 8-10 | `0 . 9` | Enter C-Level = 0.9 |
| t-interval-data | 11 | `DOWN` | Move down to Calculate |
| t-interval-data | 12 | `ENTER` | Calculate |
| t-interval-data@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| t-interval-data@1 | 4 | `8` | Pick 8:TInterval |
| t-interval-data@1 | 5-7 | `DOWN DOWN DOWN` | Move down to C-Level |
| t-interval-data@1 | 8-11 | `0 . 9 5` | Enter C-Level = 0.95 |
| t-interval-data@1 | 12 | `DOWN` | Move down to Calculate |
| t-interval-data@1 | 13 | `ENTER` | Calculate |

## two-samp-ttest (2-SampTTest)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| two-samp-ttest | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-samp-ttest | 4 | `4` | Pick 4:2-SampTTest |
| two-samp-ttest | 5 | `RIGHT` | Pick Stats for Inpt (real CE: ENTER) |
| two-samp-ttest | 6 | `DOWN` | Move down to x̄1 |
| two-samp-ttest | 7-10 | `7 8 . 5` | Enter x̄1 = 78.5 |
| two-samp-ttest | 11 | `DOWN` | Move down to Sx1 |
| two-samp-ttest | 12-14 | `9 . 2` | Enter Sx1 = 9.2 |
| two-samp-ttest | 15 | `DOWN` | Move down to n1 |
| two-samp-ttest | 16-17 | `2 8` | Enter n1 = 28 |
| two-samp-ttest | 18 | `DOWN` | Move down to x̄2 |
| two-samp-ttest | 19-22 | `7 3 . 1` | Enter x̄2 = 73.1 |
| two-samp-ttest | 23 | `DOWN` | Move down to Sx2 |
| two-samp-ttest | 24-27 | `1 0 . 4` | Enter Sx2 = 10.4 |
| two-samp-ttest | 28 | `DOWN` | Move down to n2 |
| two-samp-ttest | 29-30 | `3 2` | Enter n2 = 32 |
| two-samp-ttest | 31-34 | `DOWN DOWN DOWN DOWN` | Move down to Calculate |
| two-samp-ttest | 35 | `ENTER` | Calculate |
| two-samp-ttest@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-samp-ttest@1 | 4 | `4` | Pick 4:2-SampTTest |
| two-samp-ttest@1 | 5 | `RIGHT` | Pick Stats for Inpt (real CE: ENTER) |
| two-samp-ttest@1 | 6 | `DOWN` | Move down to x̄1 |
| two-samp-ttest@1 | 7-9 | `1 6 2` | Enter x̄1 = 162 |
| two-samp-ttest@1 | 10 | `DOWN` | Move down to Sx1 |
| two-samp-ttest@1 | 11-14 | `1 2 . 5` | Enter Sx1 = 12.5 |
| two-samp-ttest@1 | 15 | `DOWN` | Move down to n1 |
| two-samp-ttest@1 | 16-17 | `3 0` | Enter n1 = 30 |
| two-samp-ttest@1 | 18 | `DOWN` | Move down to x̄2 |
| two-samp-ttest@1 | 19-21 | `1 5 5` | Enter x̄2 = 155 |
| two-samp-ttest@1 | 22 | `DOWN` | Move down to Sx2 |
| two-samp-ttest@1 | 23-26 | `1 4 . 1` | Enter Sx2 = 14.1 |
| two-samp-ttest@1 | 27 | `DOWN` | Move down to n2 |
| two-samp-ttest@1 | 28-29 | `2 5` | Enter n2 = 25 |
| two-samp-ttest@1 | 30 | `DOWN` | Move down to μ1 ? μ2 |
| two-samp-ttest@1 | 31-33 | `RIGHT RIGHT ENTER` | Pick Ha: μ1 > μ2 |
| two-samp-ttest@1 | 34-36 | `DOWN DOWN DOWN` | Move down to Calculate |
| two-samp-ttest@1 | 37 | `ENTER` | Calculate |

## two-samp-tint (2-SampTInt)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| two-samp-tint | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-samp-tint | 4 | `0` | Pick 0:2-SampTInt |
| two-samp-tint | 5 | `RIGHT` | Pick Stats for Inpt (real CE: ENTER) |
| two-samp-tint | 6 | `DOWN` | Move down to x̄1 |
| two-samp-tint | 7-9 | `1 1 8` | Enter x̄1 = 118 |
| two-samp-tint | 10 | `DOWN` | Move down to Sx1 |
| two-samp-tint | 11-14 | `1 0 . 5` | Enter Sx1 = 10.5 |
| two-samp-tint | 15 | `DOWN` | Move down to n1 |
| two-samp-tint | 16-17 | `4 0` | Enter n1 = 40 |
| two-samp-tint | 18 | `DOWN` | Move down to x̄2 |
| two-samp-tint | 19-21 | `1 2 8` | Enter x̄2 = 128 |
| two-samp-tint | 22 | `DOWN` | Move down to Sx2 |
| two-samp-tint | 23-26 | `1 4 . 3` | Enter Sx2 = 14.3 |
| two-samp-tint | 27 | `DOWN` | Move down to n2 |
| two-samp-tint | 28-29 | `3 5` | Enter n2 = 35 |
| two-samp-tint | 30 | `DOWN` | Move down to C-Level |
| two-samp-tint | 31-34 | `0 . 9 5` | Enter C-Level = 0.95 |
| two-samp-tint | 35-36 | `DOWN DOWN` | Move down to Calculate |
| two-samp-tint | 37 | `ENTER` | Calculate |
| two-samp-tint@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| two-samp-tint@1 | 4 | `0` | Pick 0:2-SampTInt |
| two-samp-tint@1 | 5 | `RIGHT` | Pick Stats for Inpt (real CE: ENTER) |
| two-samp-tint@1 | 6 | `DOWN` | Move down to x̄1 |
| two-samp-tint@1 | 7-10 | `5 2 . 4` | Enter x̄1 = 52.4 |
| two-samp-tint@1 | 11 | `DOWN` | Move down to Sx1 |
| two-samp-tint@1 | 12-14 | `4 . 8` | Enter Sx1 = 4.8 |
| two-samp-tint@1 | 15 | `DOWN` | Move down to n1 |
| two-samp-tint@1 | 16-17 | `2 0` | Enter n1 = 20 |
| two-samp-tint@1 | 18 | `DOWN` | Move down to x̄2 |
| two-samp-tint@1 | 19-22 | `4 8 . 7` | Enter x̄2 = 48.7 |
| two-samp-tint@1 | 23 | `DOWN` | Move down to Sx2 |
| two-samp-tint@1 | 24-26 | `5 . 1` | Enter Sx2 = 5.1 |
| two-samp-tint@1 | 27 | `DOWN` | Move down to n2 |
| two-samp-tint@1 | 28-29 | `2 2` | Enter n2 = 22 |
| two-samp-tint@1 | 30 | `DOWN` | Move down to C-Level |
| two-samp-tint@1 | 31-33 | `0 . 9` | Enter C-Level = 0.9 |
| two-samp-tint@1 | 34-35 | `DOWN DOWN` | Move down to Calculate |
| two-samp-tint@1 | 36 | `ENTER` | Calculate |

## matrix-entry (Enter matrix)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| matrix-entry | 1-4 | `2ND x⁻¹ RIGHT RIGHT` | Open MATRIX > EDIT (2ND x⁻¹) |
| matrix-entry | 5 | `ENTER` | Pick 1:[A] |
| matrix-entry | 6-7 | `3 ENTER` | Set Rows = 3 |
| matrix-entry | 8-9 | `2 ENTER` | Set Columns = 2 |
| matrix-entry | 10-12 | `3 0 ENTER` | Enter row 1, column 1 = 30 |
| matrix-entry | 13-15 | `7 0 ENTER` | Enter row 1, column 2 = 70 |
| matrix-entry | 16-18 | `8 0 ENTER` | Enter row 2, column 1 = 80 |
| matrix-entry | 19-21 | `6 0 ENTER` | Enter row 2, column 2 = 60 |
| matrix-entry | 22-25 | `1 1 0 ENTER` | Enter row 3, column 1 = 110 |
| matrix-entry | 26-28 | `5 0 ENTER` | Enter row 3, column 2 = 50 |
| matrix-entry@1 | 1-4 | `2ND x⁻¹ RIGHT RIGHT` | Open MATRIX > EDIT (2ND x⁻¹) |
| matrix-entry@1 | 5 | `ENTER` | Pick 1:[A] |
| matrix-entry@1 | 6-7 | `3 ENTER` | Set Rows = 3 |
| matrix-entry@1 | 8-9 | `2 ENTER` | Set Columns = 2 |
| matrix-entry@1 | 10-12 | `3 3 ENTER` | Enter row 1, column 1 = 33 |
| matrix-entry@1 | 13-15 | `7 3 ENTER` | Enter row 1, column 2 = 73 |
| matrix-entry@1 | 16-18 | `8 3 ENTER` | Enter row 2, column 1 = 83 |
| matrix-entry@1 | 19-21 | `6 3 ENTER` | Enter row 2, column 2 = 63 |
| matrix-entry@1 | 22-25 | `1 1 3 ENTER` | Enter row 3, column 1 = 113 |
| matrix-entry@1 | 26-28 | `5 3 ENTER` | Enter row 3, column 2 = 53 |

## chi-square-gof-test (χ²GOF-Test)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| chi-square-gof-test | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| chi-square-gof-test | 4-5 | `ALPHA x⁻¹` | Pick D:χ²GOF-Test |
| chi-square-gof-test | 6-7 | `DOWN DOWN` | Move down to df |
| chi-square-gof-test | 8 | `4` | Enter df = 4 |
| chi-square-gof-test | 9-10 | `DOWN DOWN` | Move down to Calculate |
| chi-square-gof-test | 11 | `ENTER` | Calculate |
| chi-square-gof-test@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| chi-square-gof-test@1 | 4-5 | `ALPHA x⁻¹` | Pick D:χ²GOF-Test |
| chi-square-gof-test@1 | 6-7 | `DOWN DOWN` | Move down to df |
| chi-square-gof-test@1 | 8 | `5` | Enter df = 5 |
| chi-square-gof-test@1 | 9-10 | `DOWN DOWN` | Move down to Calculate |
| chi-square-gof-test@1 | 11 | `ENTER` | Calculate |
| chi-square-gof-test@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| chi-square-gof-test@2 | 4-5 | `ALPHA x⁻¹` | Pick D:χ²GOF-Test |
| chi-square-gof-test@2 | 6-7 | `DOWN DOWN` | Move down to df |
| chi-square-gof-test@2 | 8 | `3` | Enter df = 3 |
| chi-square-gof-test@2 | 9-10 | `DOWN DOWN` | Move down to Calculate |
| chi-square-gof-test@2 | 11 | `ENTER` | Calculate |

## chi-square-test (χ²-Test)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| chi-square-test | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| chi-square-test | 4-5 | `ALPHA PRGM` | Pick C:χ²-Test |
| chi-square-test | 6-8 | `DOWN DOWN DOWN` | Move down to Calculate |
| chi-square-test | 9 | `ENTER` | Calculate |
| chi-square-test@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| chi-square-test@1 | 4-5 | `ALPHA PRGM` | Pick C:χ²-Test |
| chi-square-test@1 | 6-8 | `DOWN DOWN DOWN` | Move down to Calculate |
| chi-square-test@1 | 9 | `ENTER` | Calculate |

## linreg-ttest (LinRegTTest)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| linreg-ttest | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| linreg-ttest | 4-5 | `ALPHA COS` | Pick F:LinRegTTest |
| linreg-ttest | 6-10 | `DOWN DOWN DOWN DOWN DOWN` | Move down to Calculate |
| linreg-ttest | 11 | `ENTER` | Calculate |
| linreg-ttest@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| linreg-ttest@1 | 4-5 | `ALPHA COS` | Pick F:LinRegTTest |
| linreg-ttest@1 | 6-8 | `DOWN DOWN DOWN` | Move down to β and ρ |
| linreg-ttest@1 | 9-11 | `RIGHT RIGHT ENTER` | Pick Ha: β and ρ >0 |
| linreg-ttest@1 | 12-13 | `DOWN DOWN` | Move down to Calculate |
| linreg-ttest@1 | 14 | `ENTER` | Calculate |
| linreg-ttest@2 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| linreg-ttest@2 | 4-5 | `ALPHA COS` | Pick F:LinRegTTest |
| linreg-ttest@2 | 6-8 | `DOWN DOWN DOWN` | Move down to β and ρ |
| linreg-ttest@2 | 9-10 | `RIGHT ENTER` | Pick Ha: β and ρ &lt;0 |
| linreg-ttest@2 | 11-12 | `DOWN DOWN` | Move down to Calculate |
| linreg-ttest@2 | 13 | `ENTER` | Calculate |

## linreg-tint (LinRegTInt)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| linreg-tint | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| linreg-tint | 4-5 | `ALPHA TAN` | Pick G:LinRegTInt |
| linreg-tint | 6-8 | `DOWN DOWN DOWN` | Move down to C-Level |
| linreg-tint | 9-12 | `0 . 9 5` | Enter C-Level = 0.95 |
| linreg-tint | 13-14 | `DOWN DOWN` | Move down to Calculate |
| linreg-tint | 15 | `ENTER` | Calculate |
| linreg-tint@1 | 1-3 | `STAT RIGHT RIGHT` | Open STAT > TESTS |
| linreg-tint@1 | 4-5 | `ALPHA TAN` | Pick G:LinRegTInt |
| linreg-tint@1 | 6-8 | `DOWN DOWN DOWN` | Move down to C-Level |
| linreg-tint@1 | 9-12 | `0 . 9 9` | Enter C-Level = 0.99 |
| linreg-tint@1 | 13-14 | `DOWN DOWN` | Move down to Calculate |
| linreg-tint@1 | 15 | `ENTER` | Calculate |

## randint-sampling (randIntNoRep (random sample))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| randint-sampling | 1-3 | `4 2 STO→` | Store 42 as the rand seed |
| randint-sampling | 4-7 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling | 8 | `1` | Pick 1:rand |
| randint-sampling | 9 | `ENTER` | Run it: rand is now seeded |
| randint-sampling | 10-13 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling | 14 | `8` | Pick 8:randIntNoRep( |
| randint-sampling | 15 | `1` | Enter lower = 1 |
| randint-sampling | 16 | `DOWN` | Move down to upper |
| randint-sampling | 17-18 | `3 0` | Enter upper = 30 |
| randint-sampling | 19 | `DOWN` | Move down to n |
| randint-sampling | 20 | `5` | Enter n = 5 |
| randint-sampling | 21 | `DOWN` | Move down to Paste |
| randint-sampling | 22 | `ENTER` | Paste it to Home |
| randint-sampling | 23 | `ENTER` | Run the random draw |
| randint-sampling@1 | 1-2 | `7 STO→` | Store 7 as the rand seed |
| randint-sampling@1 | 3-6 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling@1 | 7 | `1` | Pick 1:rand |
| randint-sampling@1 | 8 | `ENTER` | Run it: rand is now seeded |
| randint-sampling@1 | 9-12 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling@1 | 13 | `8` | Pick 8:randIntNoRep( |
| randint-sampling@1 | 14 | `1` | Enter lower = 1 |
| randint-sampling@1 | 15 | `DOWN` | Move down to upper |
| randint-sampling@1 | 16-17 | `8 0` | Enter upper = 80 |
| randint-sampling@1 | 18 | `DOWN` | Move down to n |
| randint-sampling@1 | 19 | `6` | Enter n = 6 |
| randint-sampling@1 | 20 | `DOWN` | Move down to Paste |
| randint-sampling@1 | 21 | `ENTER` | Paste it to Home |
| randint-sampling@1 | 22 | `ENTER` | Run the random draw |
| randint-sampling@2 | 1-3 | `1 5 STO→` | Store 15 as the rand seed |
| randint-sampling@2 | 4-7 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling@2 | 8 | `1` | Pick 1:rand |
| randint-sampling@2 | 9 | `ENTER` | Run it: rand is now seeded |
| randint-sampling@2 | 10-13 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-sampling@2 | 14 | `8` | Pick 8:randIntNoRep( |
| randint-sampling@2 | 15 | `1` | Enter lower = 1 |
| randint-sampling@2 | 16 | `DOWN` | Move down to upper |
| randint-sampling@2 | 17-18 | `2 4` | Enter upper = 24 |
| randint-sampling@2 | 19 | `DOWN` | Move down to n |
| randint-sampling@2 | 20 | `4` | Enter n = 4 |
| randint-sampling@2 | 21 | `DOWN` | Move down to Paste |
| randint-sampling@2 | 22 | `ENTER` | Paste it to Home |
| randint-sampling@2 | 23 | `ENTER` | Run the random draw |

## randint-assignment (randIntNoRep (random assignment))

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| randint-assignment | 1-2 | `8 STO→` | Store 8 as the rand seed |
| randint-assignment | 3-6 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-assignment | 7 | `1` | Pick 1:rand |
| randint-assignment | 8 | `ENTER` | Run it: rand is now seeded |
| randint-assignment | 9-12 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-assignment | 13 | `8` | Pick 8:randIntNoRep( |
| randint-assignment | 14 | `1` | Enter lower = 1 |
| randint-assignment | 15 | `DOWN` | Move down to upper |
| randint-assignment | 16-17 | `1 2` | Enter upper = 12 |
| randint-assignment | 18 | `DOWN` | Move down to n |
| randint-assignment | 19-20 | `1 2` | Enter n = 12 |
| randint-assignment | 21 | `DOWN` | Move down to Paste |
| randint-assignment | 22 | `ENTER` | Paste it to Home |
| randint-assignment | 23 | `ENTER` | Run the random draw |
| randint-assignment@1 | 1-3 | `2 3 STO→` | Store 23 as the rand seed |
| randint-assignment@1 | 4-7 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-assignment@1 | 8 | `1` | Pick 1:rand |
| randint-assignment@1 | 9 | `ENTER` | Run it: rand is now seeded |
| randint-assignment@1 | 10-13 | `MATH RIGHT RIGHT RIGHT` | Open MATH > PRB |
| randint-assignment@1 | 14 | `8` | Pick 8:randIntNoRep( |
| randint-assignment@1 | 15 | `1` | Enter lower = 1 |
| randint-assignment@1 | 16 | `DOWN` | Move down to upper |
| randint-assignment@1 | 17-18 | `1 0` | Enter upper = 10 |
| randint-assignment@1 | 19 | `DOWN` | Move down to n |
| randint-assignment@1 | 20-21 | `1 0` | Enter n = 10 |
| randint-assignment@1 | 22 | `DOWN` | Move down to Paste |
| randint-assignment@1 | 23 | `ENTER` | Paste it to Home |
| randint-assignment@1 | 24 | `ENTER` | Run the random draw |

## dotplot (Histogram to dot plot)

| Problem | Steps | Keys | Goal |
|---|---|---|---|
| dotplot | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| dotplot | 3 | `ENTER` | Open Plot1 (check it is On) |
| dotplot | 4 | `DOWN` | Move down to Type |
| dotplot | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| dotplot | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| dotplot | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| dotplot@1 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| dotplot@1 | 3 | `ENTER` | Open Plot1 (check it is On) |
| dotplot@1 | 4 | `DOWN` | Move down to Type |
| dotplot@1 | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| dotplot@1 | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| dotplot@1 | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| dotplot@2 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| dotplot@2 | 3 | `ENTER` | Open Plot1 (check it is On) |
| dotplot@2 | 4 | `DOWN` | Move down to Type |
| dotplot@2 | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| dotplot@2 | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| dotplot@2 | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| dotplot@3 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| dotplot@3 | 3 | `ENTER` | Open Plot1 (check it is On) |
| dotplot@3 | 4 | `DOWN` | Move down to Type |
| dotplot@3 | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| dotplot@3 | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| dotplot@3 | 10-11 | `TRACE RIGHT` | TRACE across the plot |
| dotplot@4 | 1-2 | `2ND Y=` | Open STAT PLOT (2ND Y=) |
| dotplot@4 | 3 | `ENTER` | Open Plot1 (check it is On) |
| dotplot@4 | 4 | `DOWN` | Move down to Type |
| dotplot@4 | 5-7 | `RIGHT RIGHT ENTER` | Pick the histogram |
| dotplot@4 | 8-9 | `ZOOM 9` | ZoomStat (ZOOM 9) |
| dotplot@4 | 10-11 | `TRACE RIGHT` | TRACE across the plot |
