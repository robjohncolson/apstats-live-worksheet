# Grade Model

This directory contains the Layer C formal model for the v3 quarter-grade fold.
It models the combine math: the PC/work quarter fold (the 40%/70% gates, the
max-vs-mean branch), null-track handling, and the final `to100` rounding surface.
The Work-track weighting (`workAvgV3`, a plain weighted mean) is unit-tested on
the JS side and is not re-modeled here.

Racket note: run with Racket on PATH (this box has it via scoop —
`$env:Path += ";C:\Users\rober\scoop\shims"` in PowerShell). `racket` may
segfault under MSYS bash, so run the cross-check from PowerShell/cmd.

Generate the JS oracle cases:

```sh
node roster-server/tools/grade-model-emit-cases.mjs
```

Cross-check the Redex model against those cases:

```sh
racket formal/grade-model/crosscheck.rkt
```

`PASS n/n` means the Redex specification and the JS engine agree on the
quarter-grade fold for the generated oracle cases, within the 0.05 rounding
tolerance used by the cross-check.
