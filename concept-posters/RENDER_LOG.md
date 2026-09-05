# Concept poster render log — 2026-09-04

All 15 posters are rendered. Each has a one-page 22 × 28 inch PDF, a one-page true Letter PDF, and a PNG in `rendered/`. Both combined editions contain all 15 pages in P01–P15 order. Letter pages preserve the 0.25-inch safe area. Sources were reviewed against spec §3 and the cartridge, then compiled and visually inspected as rasterized Letter pages. The shared style is unchanged.

The digital QA tick covers complete content/formulas, notation, unit color and required gold corner, applicable conditions/df, usable frames, a common-mistake rule, the old worksheet tag, absence of skill codes, and no overfull boxes, missing glyphs, clipped text, or overlapping content. Formula IDs are traceability labels; the review also checked the actual typeset mathematics and sketches.

| Poster | Poster / Letter pages | Digital QA | Checked formula IDs from §6 |
|---|---:|:---:|---|
| P01 Variables & Displays | 1 / 1 | ✓ | Concept-only: both display families, three sketches, shape vocabulary, comparisons |
| P02 Summary Statistics | 1 / 1 | ✓ | `mean`, `std-dev`, `variance`, `iqr`, `outlier-iqr` |
| P03 Collecting Data & Scope | 1 / 1 | ✓ | `random-condition`; sampling, bias, designs, scope grid, gold simulation corner |
| P04 Two Categorical Variables | 1 / 1 | ✓ | Concept-only: all three relative-frequency formulas, table, segmented and grouped bars |
| P05 Probability Rules | 1 / 1 | ✓ | `complement`, `add-rule`, `cond-prob`, `mult-rule`, `mult-independent` |
| P06 Random Variables & Binomial | 1 / 1 | ✓ | `rv-mean`, `rv-sd`, `lintransform`, `binom-pmf`, `binom-mean`, `binom-sd`; ★ `lincomb-mean`, `lincomb-var`, `geom-pmf`, `geom-mean`, `geom-sd` |
| P07 Normal Distribution | 1 / 1 | ✓ | `zscore`, `empirical-rule` |
| P08 Sampling Distributions & CLT | 1 / 1 | ✓ | `phat-mean`, `phat-sd`, `xbar-mean`, `xbar-sd`, `ten-pct-condition` |
| P09 Confidence Intervals | 1 / 1 | ✓ | `ci-formula`, `margin-error`, `width-ci`, `random-condition`, `ten-pct-condition`, `normal-condition` |
| P10 Significance Tests | 1 / 1 | ✓ | `z-test-stat`, `p-value-interp`, `type-i-error`, `type-ii-error`, `power` |
| P11 Proportions Toolbox | 1 / 1 | ✓ | `phat-se`, `one-prop-ci`, `one-prop-z`, `large-counts`, `diff-p-sd`, `diff-p-se`, `two-prop-ci`, `pooled-se`, `two-prop-z` |
| P12 Chi-Square Tests | 1 / 1 | ✓ | `chi-sq`, `expected-twoway`, `df-twoway`, `chi-sq-select`, `chi-sq-hyp`, `chi-sq-conditions`, `chi-sq-conclude`, `chi-sq-output`, `std-resid-chi`; ★ `expected-gof`, `df-gof` |
| P13 Means Toolbox | 1 / 1 | ✓ | `xbar-se`, `one-mean-ci`, `one-mean-t`, `paired-t`, `diff-x-sd`, `diff-x-se`, `two-mean-ci`, `two-mean-t`, `df-t` |
| P14 Scatterplots, Correlation & LSRL | 1 / 1 | ✓ | `corr-r`, `linreg`, `linreg-mean`, `slope-b`, `y-intercept` |
| P15 Residuals & Model Fit | 1 / 1 | ✓ | `residual`, `r-squared`, `resid-s`; ★ `log-transform`, `slope-mean`, `slope-sd`, `slope-se`, `slope-t`, `slope-ci` |

Coverage is complete: **81 unique IDs, 83 prescribed placements, zero unplaced §3 formulas or missing §6 IDs.** As §6 explicitly requires, `random-condition` appears on P03/P09 and `ten-pct-condition` on P08/P09. The cartridge's `df-t` family includes a regression case: means/paired/two-sample rules are on P13, while regression `df = n − 2` stays beside slope inference in P15's gold corner, following §3's placement. Conditions and shared rules also recur in the procedure toolboxes as §3 requests.

P02 now distinguishes the maximum outlier from the last non-outlier. P04's counts and percentages were recomputed. P08 qualifies the n ≥ 30 guideline instead of promising a normal shape for every population. P09 adds the test-count reference and df note and clarifies interval versus confidence-level language. P12's illustrative χ² = 9.21, df = 2 gives P ≈ .010. P14's points have mean (5, 5) and LSRL y = 1 + .8x. P15's displayed R-Sq was corrected to 78.9%, consistent with t = 4.83/.72 and df = 12. P11–P13 were reflowed after visual review caught text crossing zone boundaries and touching formula borders.

The [Fall-2026 CED formula appendix, printed pp. 228–229](https://apcentral.collegeboard.org/media/pdf/ap-statistics-course-and-exam-description-effective-fall-2026.pdf#page=233) was checked against the core formulas. It uses `SE` with a statistic subscript; the cartridge uses `s` with that subscript. The posters label these equivalent estimated-SD forms as allowed by spec §2.4. P05's Aᶜ and the cartridge's Eᶜ denote the same complement operation with a different event name. Supplemental formulas follow the requested cartridge and gold-corner assignments.

Physical production checks remain open: the existing style uses the proportional mockup typography described in the README, rather than literal 3-inch titles and 1.5-inch formulas. Test the lettering plan from the actual back row before inking. Photograph the completed physical posters afterward; no classroom photographs were available for this digital task.

Build: `make -B ENGINE=xelatex` uses two passes for remembered TikZ positions. Python helpers make Letter scaling and cleanup work on Windows. `python verify_posters.py` passes all coverage, page-count, dimension, text-boundary, missing-glyph, log-overflow, and combined-order checks; details are in [qa-summary.json](qa-summary.json). Whitespace checks and staged GitNexus reviews also pass. MiKTeX prints its routine update reminder; no LaTeX errors or overfull boxes remain.

Local commits: P01–P08 plus the portable build in `d35f6a4`; P10–P14, refreshed P09/P15, both complete collections, and this final log in the accompanying second batch. Nothing was pushed.
