# Review task — My Ledger balance card agrees with the Do Now zero state

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Repo: this working directory (AP Stats platform, "the Desk" = `ap_stats_roadmap_square_mode.html`).
The change under review is the UNCOMMITTED working-tree diff in:

- `ap_stats_roadmap_square_mode.html` — get it with `git diff -U3 -- ap_stats_roadmap_square_mode.html`
- `tests/desk-ledger-grade-agreement.test.js` (new file; read it whole)

The contract is `LEDGER_GRADE_AGREEMENT_SPEC.md` (read it fully first). Background: `LEDGER_CALM_SPEC.md`
§0, §1, §2.2, §2.3, §6. The teacher's complaint that motivated it is quoted at the top of the spec:
a yellow Do Now ("zeros coming") led into a ledger whose balance card was GREEN with a big green
grade, and nothing said the number would drop.

## What to look for (in priority order)

1. **Correctness bugs** — `_walletGradeDropText(warns)` wrong for any of the four cases in spec §3
   (soon-only 1 / soon-only N / now-only / mixed), wrong singular/plural, wrong day: the soon cases
   must use the EARLIEST not-past `zeroDate` (`_zeroEarliestSoonDay`), not the latest; a tint
   applied when `warns` is empty; the readiness (green hue) path altered when nothing is owed;
   `past` vs not-past confused; a throw when `_zeroCurrentWarnings` is undefined in a sandbox or
   returns a non-array.
2. **Spec drift** — anything in spec §4 touched (`_zeroWarnings`, `_zeroCurrentWarnings`, `_zeroStatusText`,
   `_zeroLatestSoonDay`, the Do Now painter or its CSS, `WalletLogic`, `_walletCurrentGrade`, teacher
   surfaces, roster-server, slips, `lib/*`); the Missing-work card or the balance card moved; a projected
   "drops to X" number printed (forbidden: LEDGER_CALM_SPEC §6).
3. **Colour parity** — balance-card soon/now inline colours must equal the Do Now CSS values exactly
   (`#fff3b0`/`#d9b400` and `#f7c9c9`/`#cc0000`); the CSS-parity test (spec §5 item 6) must really
   read the Desk CSS, not a copied literal. Big-grade text colours `#7a5c00` / `#a30000`.
   Window background `#fff9db` / `#fff3f3` only when warns exist.
4. **Regressions** — existing pins changed without the spec asking (grep the diff for edits inside
   `tests/desk-ledger-calm.test.js`, `tests/desk-wallet-render.test.js`, `tests/student-wallet.test.js`);
   non-ES5 syntax in the Desk hunks (arrow functions, `let`/`const`, template literals); CRLF introduced
   (`git diff -- ap_stats_roadmap_square_mode.html | grep -c $'\r'` should be 0).
5. **Tests** — do the new tests assert the sentence text verbatim for all four cases, both tint classes,
   the inline rgb values, the `Grade today` label, the no-warns green path, and the window tint?
   Would they still pass if `_walletApplyZeroTint` silently did nothing (i.e. are they real)?

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|REGRESSION|TEST] <file>:<line> — <one sentence: what is wrong>
   Repro/why: <one or two sentences, concrete inputs → wrong output>
   Fix: <one sentence>
2. ...
CHECKED-OK: <comma-separated list of the spec sections you verified with no finding>
```

If you find nothing, say `VERDICT: SHIP` and list CHECKED-OK. Do not pad with style nits; only
report things that would show a student a wrong colour, a wrong sentence, a crash, or break an
existing test.
