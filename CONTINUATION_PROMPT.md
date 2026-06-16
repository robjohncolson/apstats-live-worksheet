# CONTINUATION PROMPT — DOGE wallet LIVE-ready + Desk/gating/Live-Classroom polish ; NEXT = run migration 0021 + hand out wallets (Sept)

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-16 (session 11).
> follow-alongs HEAD = `7aa5891`. Repo `apstats-live-worksheet`, branch `master`. **GH Pages auto-publishes `master`**
> and **`roster-server/` auto-deploys to Railway on push** (`roster-production-12c1.up.railway.app`). Sibling repo
> **curriculum_render** (HEAD `42b74e3`, branch `main`) ALSO auto-deploys: GH Pages (the quiz app) + the cr Railway
> classroom/AI server (`curriculumrender-production.up.railway.app`) when `railway-server/**` changes. cr is local at
> `C:/Users/rober/Downloads/Projects/school/curriculum_render`; ⚠ stage only own paths (it has many unrelated dirty files).
> Teacher tests on the **public GH Pages URL** — commit+push promptly; `file://` is not a valid surface. Style:
> brainstorm → spec → implement (user reviews). ultracode ON = workflow-investigate + adversarial-review before pushing.
> `browser-harness` can't run on this Windows host (no AF_UNIX). Memory dir:
> `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> A real **Dogecoin Core node runs on this box with ~10,273 DOGE** (RPC LIVE; cli at `C:/Program Files/Dogecoin/daemon/dogecoin-cli.exe`,
> not on PATH). **NEVER broadcast a real send without explicit per-send confirmation.**

## ⏭ SESSION 11 SHIPPED (2026-06-16) — Desk/gating/Live-Classroom + cr login, all adversarially reviewed

- **STRICT topic-sequence lesson gate** (`0a79f1c`, LESSON_GATE_BUILD §8): the gate keyed on the previous CALENDAR CELL
  (parity leak: 1.2/1.4/1.6 open, 1.3/1.5 locked) → now gates on the true topic-predecessor (`_prevTopicInSequence`),
  window-independent + cross-portion (topic-keyed completion). Date bypass REMOVED (strict; fall too — teacher P5 unlock is
  the escape). **⚠ live config forces period E (combined pacing `1.2+1.3`…) but summer is individual (`1.1`..`1.10`)** → the
  gate DISPATCHES by cell surface (`_prevSummerTopic` for summer cells, `_prevTopicInSequence` for fall) + a completion
  bridge (`_isLessonComplete`: combined "A+B" done when its parts are). The review caught this as a BLOCKER (a naive single-
  sequence gate left summer always-open). Verified vs live cP=E.
- **Buy-min 25→5** (`d7b0636`) + disbursement **"✓ given/sent"** fix; **Teacher Tools launcher** + **Roster Console restored**
  (`5bd38cd`, Class Gradebook dropped); **voluntary "Change Password"** in the User menu (`c141867`); **"I'm not on the list"
  → straight to GUEST** (no self-signup) (`68eb697`).
- **Kid→kid candy gifting** (`db24a41`, migration `0021` USER-RUN) — `POST /wallet/gift` by username, Desk 🎁, atomic
  `doge_gift()` w/ HARD daily cap, active-student-only recipient, kill-switch. 15-finding review folded.
- **Guest + Teacher Live-Classroom AVATARS** (`7a1eb0c` guest; fa `7aa5891` + cr `42b74e3` teacher): guests + the teacher
  now render as avatars in the scene; the teacher's avatar is movable + can step into doorways (vote VISUAL-ONLY — doesn't
  steer the class winner; server checkin role-guard). ⚠ KNOWN minor: arrow/Space drive the avatar in the tall teacher
  cockpit (mouse-wheel scroll still works) — accepted cost.
- **cr↔Desk login tightened** (cr `6c60965`): 401/expiry surfaced ("sign in again", was silent grade loss); cross-tab
  `storage` sign-out listener; `roster-client.js` synced to the Desk's. **LEFT (user chose cheap-wins): cr focus-roster-
  refresh + clear stale peer `classData` on identity change.** Audit detail in `project_cr_identity_unify.md`.

## ⏭ NEXT — DOGE go-live is mostly DONE; remaining = run migration 0021 + hand out wallets (~September). ⚠ ABRAHAM LADNY ENROLLED (s11, `olive_sloth`, PeriodX=29) — set his Schoology UID `191627`.

0. **✅ DONE (session 10):** migrations **0019 + 0020 RUN**; **node restarted** (mainnet, synced, 10,273 DOGE, RPC live);
   **30 paper wallets generated + node-validated** at `C:/Users/rober/doge-wallets/` (OUTSIDE the repo — real keys; print
   the HTML, seal the `-KEYS.csv` offline, delete the HTML after printing); **canary send VERIFIED end-to-end** (1 DOGE →
   wallet #1 `DEuXEB47…`, txid `eaa5d3b6…`, 14 confs; `doge-chain.js` read it back `confirmedDoge:1`). The full loop works.
1. **RUN MIGRATION 0021** (`roster-server/migrations/0021_doge_gifting.sql`, USER-RUN) to turn on **kid→kid candy gifting**
   (adds `candy_gifted_out/in` + `gift_out/gift_in` ledger kinds + the atomic `doge_gift()` and patches `doge_spend`'s guard).
   Until it runs, `POST /wallet/gift` **503s** and the 🎁 button shows a "rewards not on yet" error — harmless.
2. **ENROL ABRAHAM LADNY** (Schoology id `191627`, the one student in the Schoology group but NOT yet on the app roster) via
   **Teacher ▸ 🧰 Teacher Tools ▸ 📋 Roster Console**, section `PeriodX`, then set his Schoology UID. All other 27 match.
3. **HAND OUT + REGISTER:** print the wallet sheet, give a card to each kid, register each address in the dashboard
   (Reward Disbursement → set). Then as kids buy DOGE, a DRY-RUN of `node tools/doge-send.mjs` (plan only) → first real
   `--send` when ready (CC runs dry-run only; `--send` is your deliberate call, irreversible).
   - **Optional:** set Railway env `BLOCKCYPHER_TOKEN` (lifts the explorer free-tier ~100 req/hr ceiling; on-chain display works without it).
   - **Buy minimum is now 5 candy** (~1 lesson, was 25) — budget-neutral, kids can convert sooner.
   - **PENDING discussion:** guest-workflow hardening (complement the no-guest sign-in wall, don't collide with the in-progress onboarding refactor).
4. **✅ DONE (session 9, `c84a8e4`): watch-only on-chain balance display.** `roster-server/doge-chain.js` (BlockCypher
   `doge/main`; testnet has NO provider → explicit error, registration mainnet-locked), `GET /wallet/chain` +
   `GET /class/wallets/chain`, Desk ⛓ on-chain line + dashboard On-chain Ɖ column. **Two NEW optional activation items:**
   (a) run migration `0020_doge_chain_cache` (USER-RUN, OPTIONAL — the live read works with just 0019 + a registered
   address; 0020 only adds durable cache cols read back on an explorer outage); (b) set Railway env `BLOCKCYPHER_TOKEN`
   (free tier ~100 req/hr; the Desk polls per open wallet every 5 min). Plus item-6 hardening (uuid-404, overspend ⚠,
   `?section=` scope, address regex → 34 chars). roster-server 944 green; root 7092 green.
5. **VERIFY the My Ledger ↔ Pacing color fix landed** (`46f5220`): the Desk's summer-schedule fetch could fail silently →
   My Ledger showed fall 'eligible' (yellow) while the dashboard Pacing showed summer (green) for the same person. Fix
   retries the load on `openWallet` + re-paints on success. If it persists, console diag in the Desk:
   `console.log(!!window._summerSchedule, _walletDisplayReadiness())` — null schedule = the fetch is still failing.
6. **✅ DONE (session 9): the verification minor-backlog hardening** — negative candy now SURFACED (`candyBalanceRaw` +
   dashboard ⚠ overspend badge, not silently clamped); `studentId` uuid-shape guard → 404 not 500; `GET /class/wallets`
   (+`/chain`) section-scoped; `mark-given/sent` clamp regression-tested; custodial price-window exposure documented (spec §3).
7. **(carried from session 7 — RESOLVED session 9):** section naming is **already canonical** — `/roster/section/PeriodX`
   returns the 27 students, `/roster/section/PERIODX` is empty → **NO `UPDATE` needed** (self-signup writes `PeriodX`; any
   all-caps would be legacy, and none exist). Both Railway servers are **deployed** (`/commits`→401 auth-gate, cr
   `/api/user-answers/<u>`→200). **Still open:** Schoology-UID coverage for the 27 — needs the teacher secret:
   `ROSTER_TEACHER_SECRET=… python tools/build_schoology_fixture.py --section PeriodX --inspect` (read `uid_bridge_covered`).

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
- **Spend race FIXED `f0d16fa`** — `/wallet/eat`+`/wallet/buy-doge` now use an atomic `doge_spend()` Postgres function
  (a single guarded UPDATE, folded into 0019) instead of read-modify-write; +tests (eat-then-buy conservation; the real
  PostgREST row-of-nulls guard).
- **Phase 3 `4ce2673`+`d4fe519`** — `tools/doge-send.mjs`: OFFLINE batch sender. Reads `/class/wallets`, plans ONE
  `sendmany` from the node to kids' addresses, broadcasts, then marks sent. DRY-RUN default; mainnet assert + fee buffer +
  validate-every-address before broadcast; **crash-resilient journal** (refuses `--send` while a prior batch is
  un-reconciled → no double-send); mark-given/sent clamped at owed/banked. `planSends` unit-tested (11). Spending key
  never leaves the node (watch-only app).
- **Verified by TWO 3-agent adversarial workflows:** Phase-2 (security + integration CLEAN; the race was the one MAJOR →
  now fixed) and Phase-3 (`doge_spend` SQL CLEAN; the sender's crash double-send MAJOR → now fixed; RLS + clamps folded).
  roster-server suite 919 green; root suites green except the 6 pre-existing onboarding failures.

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
