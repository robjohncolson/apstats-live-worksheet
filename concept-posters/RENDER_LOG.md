# Concept poster render log — 2026-09-04

Batch 1 covers P01–P08. Each has a one-page 22 × 28 inch PDF, a one-page true Letter PDF, and a PNG in `rendered/`. Letter pages preserve the 0.25-inch safe area. Sources were reviewed against spec §3 and the cartridge, then compiled and visually inspected as rasterized Letter pages. The shared style is unchanged.

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

All required content in this batch was placed. P02 now distinguishes the maximum outlier from the last non-outlier. P04's counts and percentages were recomputed. P08 qualifies the n ≥ 30 guideline instead of promising a normal shape for every population.

Physical production checks remain open: the existing style uses the proportional mockup typography described in the README, rather than literal 3-inch titles and 1.5-inch formulas. Test the lettering plan from the actual back row before inking. Photograph the completed physical posters afterward; no classroom photographs were available for this digital task.

Build: `make -B ENGINE=xelatex` uses two passes for remembered TikZ positions. Python helpers make Letter scaling and cleanup work on Windows. The final batch will record all fifteen posters, the complete coverage count, and both combined editions.
