# CONTINUATION PROMPT — DOGE Effort Wallet (Phase 1+2 SHIPPED) + Desk polish; NEXT = run migration 0019, fix the spend race, build Phase 3 (real on-chain sends)

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-16 (session 8).
> follow-alongs HEAD = `46f5220`. Repo `apstats-live-worksheet`, branch `master`. **GH Pages auto-publishes `master`**
> and **`roster-server/` auto-deploys to Railway on push** (`roster-production-12c1.up.railway.app`). Sibling repo
> **curriculum_render** = branch `main`. Teacher tests on the **public GH Pages URL** — commit+push promptly;
> `file://` is not a valid surface. Style: brainstorm → spec → implement (user reviews). `browser-harness` can't run on
> this Windows host (no AF_UNIX). Memory dir: `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> **Spec for the active project: `DOGE_WALLET_SPEC.md`. Project memory: `project_doge_effort_wallet.md`.**
> A real **Dogecoin Core node (dogecoin-qt) runs on this Windows box with ~10,000 DOGE** — for Phase 3. RPC was just
> enabled (`%APPDATA%\Dogecoin\dogecoin.conf` → `server=1`, localhost cookie auth); **the node must be RESTARTED**
> for it to take effect, then `dogecoin-cli` works. **NEVER broadcast a real send without explicit per-send confirmation.**

## ⏭ NEXT (in priority order)

1. **RUN MIGRATION 0019** on the roster Supabase (USER-RUN, like 0011/0013/…/0017): `roster-server/migrations/0019_doge_wallet.sql`
   (creates `doge_account` + `doge_ledger`). Until it runs, every `/wallet*` route **503s** and the Desk wallet shows the
   display-only preview — harmless. After it runs, the eat/buy/disburse loop goes live.
2. **RESTART Dogecoin Core** so the new `dogecoin.conf` (RPC `server=1`) applies. Then CC can `dogecoin-cli getbalance` /
   `validateaddress` (authoritatively confirm the paper-wallet generator's `D…` addresses are network-valid — the
   "verify before funding" step) and Phase 3 can broadcast.
3. **FIX THE SPEND RACE before Phase 3 turns on real DOGE** (verification MAJOR). `/wallet/eat` + `/wallet/buy-doge` are
   read-modify-write with a **full-row** upsert (`rowFor` copies all fields). Two concurrent spends for one student
   clobber each other → silent balance corruption (kid told both succeeded; one debit vanishes). The realistic
   double-click vector is ALREADY client-mitigated (the Desk disables the Eat/Buy buttons during submit), but the proper
   fix is server-side atomic: a Postgres RPC / `UPDATE … SET candy_eaten = candy_eaten + $d WHERE (earned − eaten −
   cost_basis) >= $candy` (add the function to 0019), or optimistic CAS on `updated_at`. **Do this before any real coin moves.**
4. **BUILD PHASE 3** (now unblocked by the node): `tools/doge-send.mjs` — the offline grade-sync batch sender. Reads
   `GET /class/wallets` → for each kid with `dogeToDeposit > 0` + a registered address, broadcasts ONE batched tx (many
   outputs) from the node to the kids' paper-wallet addresses, then `POST /wallet/mark-sent`. **Spending key stays on the
   laptop/node; the app stays watch-only.** Add a watch-only on-chain balance display (block-explorer API or the node)
   to the Desk/dashboard so confirmations show. Spec §10/§13.
5. **VERIFY the My Ledger ↔ Pacing color fix landed** (`46f5220`): the Desk's summer-schedule fetch could fail silently →
   My Ledger showed fall 'eligible' (yellow) while the dashboard Pacing showed summer (green) for the same person. Fix
   retries the load on `openWallet` + re-paints on success. If it persists, console diag in the Desk:
   `console.log(!!window._summerSchedule, _walletDisplayReadiness())` — null schedule = the fetch is still failing.
6. **(verification minor backlog — optional hardening, none blocking):** surface (don't silently `Math.max(0,…)`-clamp) a
   negative candy balance if a ledger row is deleted after spending; validate `studentId` shape on teacher `/wallet/*`
   (return 404 not a generic 500 on a bad uuid); section-scope `GET /class/wallets`; clamp `mark-given/sent` ≤ owed/deposit.
   Document the **custodial price-window exposure** (coins priced at buy, deposited later — budget caps candy-dollars, not
   coin-dollars-at-deposit; deposit promptly or hold a DOGE float).
7. **(carried from session 7 — STATUS UNKNOWN, verify):** the 27 enrolled may still be under section `PERIODX` (caps) —
   canonical is `PeriodX` (`UPDATE roster SET section='PeriodX' WHERE section='PERIODX';`); Schoology UIDs for the 27;
   confirm both Railway servers picked up session-7 endpoints (`/commits`, cr `/api/user-answers/:u` etc.).

## ✅ SHIPPED THIS SESSION (2026-06-15/16, session 8)

**DOGE EFFORT WALLET — the headline. Spec `DOGE_WALLET_SPEC.md` (v2, `60a6485`); memory `project_doge_effort_wallet.md`.**
A reward system on top of the existing effort points (`js/wallet_logic.js` WALLET_POINTS): kids earn **candy** (stable
≈-dollar unit, FIXED 36 pts = 1 candy = $0.036) → **eat it** (consumed) or **buy DOGE** at the **live FLOATING price**
(buy early = cheaper; "33 candy/DOGE" if it appreciates). Real on-chain **paper wallets**, app **watch-only**. **Broker
economics**: teacher cost = candy-dollars forgone, capped at the $300 budget, no DOGE price exposure. Forced session-end
choice, one-way (no sell-back). Teacher confirmed all decisions; teaching goal = work-early + appreciating-asset-vs-consumable.
- **Phase 1a `f5f1152`** — `wallet_logic.js` conversion math (`candyFromPoints`/`candyPerDoge`/`dogeFromCandy`/`usdFromCandy`)
  + Desk My-Ledger preview panel. **Gated**: shows for teachers automatically (`_deskIsTeacher`) or `localStorage
  'apstats_doge_wallet_preview'='1'` for students (default OFF). **NOTE: gated OFF in `apstats_preview_as_student` mode.**
- **Phase 1b `6d2f366`** — `tools/doge-wallet-gen.mjs`: OFFLINE Dogecoin paper-wallet generator. 100% Node built-in crypto
  (secp256k1 via createECDH, SHA256+RIPEMD160), hand-rolled base58check self-tested vs the canonical vector each run.
  Prints HTML sheet (addr+QR / WIF+QR) + sealed addr↔key CSV. mainnet `D…` + `--testnet` `n…`. `qrcode` devDep. 9 tests + live testnet run.
- **Phase 2 backend `0935f55`** — migration `0019` (USER-RUN), `doge-econ.js` (shared frozen econ + `computeEffort`),
  `doge-wallet.js` mounted: student `GET /wallet` / `POST /wallet/eat` / `buy-doge` (server-stamped price, 25-candy floor);
  teacher `POST /wallet/address` / `mark-given` / `mark-sent` / `GET /class/wallets`. db helpers. 503-graceful pre-0019.
- **Phase 2 Desk wallet `cf0e8f1`** — interactive 🍬 Eat / Ɖ Buy-DOGE in My Ledger (display-only fallback pre-0019).
- **Phase 2 disbursement `c9bb63c`** + `369d25b` + `46f5220` — teacher-dashboard "🍬 Reward Disbursement": per-kid candy
  earned / **to give** (eaten−given) / **to deposit** (balance−sent) / address, with ✓gave/✓sent/set-address; `/class/grades`
  gained a per-student `effort:{points,candy}`. Now **includes teacher/test accounts** (badged 🧪) for testing.
- **Verified** by a 3-agent adversarial workflow: security CLEAN, integration CLEAN, economics correct single-threaded
  (the race is the one MAJOR → NEXT #3).

**DESK POLISH (secondary):** username-wheel login footer declutter (`10e4e04`); Do-Now card restructure + click-opens-My-
Ledger fix (`50203a1`/`36ec71e`); My Gradebook folded into My Ledger (`ed310a6`); Pacing Overview shows teacher/test rows
(`397927d`); **summer schedule woven INTO the calendar grid** as amber weeks (`856d643`→`07881c8`); **school year opens with
orientation + a no-stakes Unit-1 baseline** (`5d197c3`). All adversarially verified; weekend-anchor calendar bug fixed as a bonus.

## KEY FACTS / GOTCHAS
- **roster-server is self-contained** — can't import `../js`; the frozen econ is DUPLICATED in `roster-server/doge-econ.js`
  (mirror of `js/wallet_logic.js`). Keep in sync if the peg ever changes (it shouldn't).
- **Effort points** = receipt-carrying `item_ledger` rows (with `receipt_compact`), deduped by `source|item_id`, scored by
  WALLET_POINTS. `computeEffort` is the single source (class.js + wallet routes agree → teacher total = kid's wallet).
- **Numbers** (tunable, frozen at outset): 36 pts/candy, $0.036/candy ($13 / 360-pc bag), ~30 kids, ~$300 budget ≈ 8,300
  candy; DOGE ~$0.088 → 1 DOGE ≈ 2.4 candy. `POINTS_PER_CANDY=36` is the one dial — retune once real accrual lands, then freeze.
- **6 pre-existing root-suite failures** (desk-gating-fixes icon + desk-self-signup/signin-wall/user-role onboarding) are
  the user's parallel onboarding/icon refactor — NOT this session's; left untouched. Root suite otherwise green (~7080 pass).
- **Guests can't appear server-side** anywhere (pacing, disbursement) — device-local aliases, never on the roster.
