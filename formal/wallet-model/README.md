# Wallet Model

Layer C of the candy↔DOGE conservation audit (`WALLET_CONSERVATION_AUDIT_SPEC.md`).
A PLT Redex formal model of the **conservation arithmetic** of the bidirectional
candy↔DOGE economy — the per-student `doge_account` column fold:

```
acct = (E R Z G C M Bal Sent)
       Earned Received Realized Gifted Converted Materialized doge_balance doge_sent
Owed = E + R + Z − G − C − M           (the 7-number identity: E+R+Z = G+C+M+Owed)
```

`wallet-model.rkt` reduces each accepted op (buy / sell / gift-out / gift-in /
mark-given / mark-sent) over the columns in **exact rationals** — in particular the
sell's avg-cost-basis unwind (`C·d/Bal`, floored at 0) and the signed Realized P&L
(`payout − basis`), plus the monotone mark-given/mark-sent clamps. It is an
independent third implementation of the arithmetic that the SQL (`migrations/0023`)
and the JS reducer (`tests/fixtures/wallet-world.js`) also encode.

Scope (mirrors `formal/grade-model`): this models the conservation **arithmetic**,
not the spend / FIFO-maturity **guards** (those are property-fuzzed in Layer A and
differentially checked against the real plpgsql in Layer B). The cross-check feeds
only the JS-accepted op stream and verifies the Redex columns match the JS reducer
AND that I3 (Owed ≥ 0), I7 (Sent ≤ Bal), I5 (M, Sent monotone) hold at every step.

Racket note: run with Racket on PATH (this box has it via scoop —
`$env:Path += ";C:\Users\rober\scoop\shims"` in PowerShell). `racket` may segfault
under MSYS bash, so run the cross-check from **PowerShell**. Racket v9.2 + redex.

Generate the JS oracle cases:

```sh
node roster-server/tools/wallet-model-emit-cases.mjs
```

Cross-check the Redex model against those cases:

```sh
racket formal/wallet-model/crosscheck.rkt
```

`PASS n/n` means the Redex column model and the JS reducer agree on the resulting
balances + the 7-number identity for every generated trajectory, within the 1e-6
tolerance used by the cross-check (exact rationals vs JS floats).
