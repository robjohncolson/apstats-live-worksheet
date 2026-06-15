# CONTINUATION PROMPT — identity layer + guest mode + proto-git ledger + next-year roster; NEXT = 2 Railway deploys + section-case fix

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-15 (session 7).
> follow-alongs HEAD (last feature commit) = `e78d4af`. Repo `apstats-live-worksheet`, branch `master`, GH Pages +
> `roster-server/` auto-deploy to Railway on push. Sibling repo **curriculum_render** = branch `main` (GH Pages +
> `railway-server/` → `curriculumrender-production.up.railway.app`). Teacher tests on the **public GH Pages URL** —
> commit+push promptly; `file://` is not a valid surface. Style: brainstorm → spec → implement (user reviews).
> Memory dir: `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> **27 real students enrolled and LIVE — but under section `PERIODX` (caps); canonicalize to `PeriodX` (NEXT #2). A colleague teacher may onboard.**

## ⏭ NEXT (in priority order)
1. **DEPLOYS — confirm BOTH Railway servers picked up this session's endpoints** (push auto-deploys, but verify):
   - **roster-server** (follow-alongs): `GET /commits` (signed prev-chained progress ledger). Until live, the wallet
     **Sessions** per-session QR + the **🔐 Sign & QR** modal show "No signed commit yet." Issuer is enabled
     (pubkey `DRfEbaWByfat…`).
   - **cr `railway-server`**: NEW `GET /api/user-answers/:username`, `POST /api/guest/reconcile`,
     `POST /api/roster/assign`, + username normalization on `/api/submit-answer` & `/api/batch-submit`. Until live,
     the guest backup count, the teacher QR-scanner reconcile, and the roster panel write all fail. Smoke:
     `/health` ok; `GET /api/user-answers/Date_Tiger` → count 43.
2. **SECTION-CASE FIX (one SQL).** The 27 enrolled under **`PERIODX`** (all-caps); canonical is **`PeriodX`** (where
   `date_tiger`/Robert Colson lives, what `/roster/open-sections` serves, the Desk fallback). Section match is
   case-sensitive → self-signups + the name-picker would split off. Run on Supabase:
   `UPDATE roster SET section='PeriodX' WHERE section='PERIODX';`
3. **SCHOOLOGY UIDs** for the 27 — if not yet run, the `UPDATE roster SET schoology_uid=… WHERE real_name=…` block
   (keyed by the exact enrolled real names; `/roster/enroll` has no UID field). Verify:
   `SELECT count(*) FROM roster WHERE schoology_uid IS NOT NULL;`
4. **(optional) Quiz↔Desk roster parity.** The 27 live in the **roster-server** (powers the *Desk's* real-name panel).
   The **quiz's** identity panel reads a SEPARATE `users` table in curriculum_render (empty) → it won't show these
   real names. Fix: push them via `POST /api/roster/assign`, or wire the quiz to read the roster-server.
5. **(carried, de-prioritized) LIVE go-live req.ip diagnostic** — the temp `[GOLIVE]` log in `POST /roster/claim`
   (`3bf0e29`) is still deployed; glance once during onboarding, then ask CC to revert the 4 TEMP lines.

## ✅ SHIPPED THIS SESSION (2026-06-14/15, s7) — identity, guest mode, proto-git ledger, roster, desk cleanup
Cross-repo: **follow-alongs `master`** (Desk + roster-server) + **curriculum_render `main`** (quiz + railway-server +
verify.html) + live Supabase data fixes. (A concurrent process committed some Desk edits mid-session — they landed.)

**Original bug → full identity layer.** `date_tiger` saw none of their work on a new laptop. Root cause = **username
case-split**: the main app normalizes to Title_Case (`Date_Tiger`) but worksheets wrote raw lowercase (`date_tiger`),
and cloud restore (`smartSyncWithSupabase`) used case-sensitive `.eq`.
- **cr `fbce1fe`** — restore now case-insensitive (`ilike`+client filter) + re-runs on turbo-connect (race fix);
  usernames normalized server-side on every write + in the 3 cr worksheets; **Who's Online identity panel**
  (`RosterIdentity`) + `POST /api/roster/assign`. cr `7fa7d1e` — worksheets set `currentUsername` so they join presence.
- Live Supabase: **merged `date_tiger`→`Date_Tiger`** (43 answers), then **bulk-canonicalized 13** case/format-split
  usernames (e.g. `Valeria Sanchez`→`Valeria_Sanchez`, `apple_monkey`→`Apple_Monkey`).
- **Desk `40f2cb5`** — doge "Online Now" resolves usernames → **real names** via the roster (`/roster/list` for
  teachers, `/roster/section`+PeriodX for students) and flags `Guest_`/`player#` as guests. **`dba0dcf`** —
  `railway_client._presenceUsername` falls back currentUsername → rosterClient → guest, so **live worksheets now
  join presence**.

**Guest mode (signed-out resilience).**
- **`006435e`** — stable persisted **`Guest_Fruit_Animal`** identity (replaces random `Player####`); presence +
  `submitAnswerViaRailway` fall back to it. **"My Guest Pass"** (doge footer, guest-only): name + QR (`?claimGuest=`)
  + cloud count + downloadable backup. cr `d08965f` adds `GET /api/user-answers/:username`.
- **`6662dae`** — fix: `DogePresence.getUsername()` prefers `rosterClient.current().username` so a signed-in student
  isn't mis-tagged guest (was: missing `student-name`/`username` legacy keys → fell through to guest).
- **Teacher reconcile:** cr `21aea3a` `POST /api/guest/reconcile` (collision-safe re-key guest→roster student); desk
  `1b2c99b` **`teacher-guest-reconcile.html`** mobile QR scanner; `7fcb13d` teacher-only "Guest Reconcile" doge entry
  (QR to open the scanner on a phone); `dac4f7c` robust scanner (explicit back camera + **photo/screenshot fallback**
  + vendored `lib/html5-qrcode.min.js`); `e0ce643` dropped the admin-token field (open by default; `?adminToken=` opt).

**Proto-git progress ledger** (blob = signed Ed25519 `item_ledger` receipt; commit = signed merkle manifest;
verify.html = fsck).
- **roster-server `7ece0db`** — `GET /commits`: **deterministic, signed, prev-chained** commit history computed from
  the immutable `item_ledger` receipts (**NO table/migration**). Gap-grouped sessions (25-min) → 8-receipt QR chunks
  → Ed25519 manifests chained by `prev`. `commits.js buildCommits` is order-independent + stable; `issueCommitReceipt`
  (t:'commit') in `receipts.js`. roster-server **903 tests pass**.
- **cr verify.html `b7ea669`** — `#commit=` verifier (decode {manifest,receipts} → verify manifest + each receipt +
  recompute root + show prev). `aa31805` — UI polish (✓/✕ glyph in the seal, fact-row dividers, mobile).
- **Desk wallet** — `155f0a5` "Sessions" view + **Vault Hex** icon (`icons/icon-ledger.svg`); `aeef2fd` **Sessions =
  default wallet lens** (session = 25-min time-burst; lesson/type nested under it; Lessons/Types/Days kept secondary —
  `WalletLogic.groupReceipts(_,'session')`); `532f856` per-session **Verify/QR** in the feed (maps a feed session to
  its signed commit by receipt-subset) + Vault icon in the menu. (The `🔐 Sign & QR` modal is the full-chain view.)

**Next-year roster.** 27 students enrolled via the **teacher-roster-console "Enroll Class"** (→ `/roster/enroll`, auto
Fruit_Animal usernames, bcrypt pw `apstats2627` must-change, credentials CSV). Section `PERIODX` (NEXT #2); UID
backfill SQL provided (NEXT #3).

**Desk cleanup.** `a7847bf` — removed redundant desktop icons (TI-84/Quiz/Equation Trainer/Study Break); apps now live
in the **Apps menu** (Study Break on the doge); **My Ledger** keeps its desktop icon. Each in-desk app window got an
**↗ "open in new window"** button (`popOutApp`→`window.open` of `APP_REGISTRY[id].url`); `c3aebed`/`a703240` fixed its
visibility (z-index over the title stripes) + styled it as a purple button.

**Roster enrolled.** 27 next-year students enrolled via teacher-roster-console "Enroll Class" (CSV downloaded;
usernames auto Fruit_Animal, pw `apstats2627`). Verified live: `/roster/section/PERIODX` → 27. SECTION-CASE BUG: they
landed in `PERIODX` not the canonical `PeriodX` (NEXT #2). (`date_tiger` resolves to "Robert Colson" in `PeriodX`.)

**QR scannability fix** (cr `e883f7b`/`b0f775b…e883f7b` + fa `4434ec2`,`e78d4af`). Teacher couldn't scan the
report/commit QRs (only a short plain-URL QR worked). Root cause: payload QRs are ~v19 (~93 modules) rendered at
~150px = ~1.6px/module = unscannable, and the QR lib draws NO quiet zone. Fixes: (1) commit QR carries ONLY the
signed manifest (`_commitShowQR` decodes `data-deep`→`obj.m`; ~v15) — verify.html `runCommitDeep` now accepts a bare
compact manifest (one dot) OR the full `base64url(JSON{m,r})`, and `verifyCommitManifestOnly` verifies the signature
alone (the signed root already commits to the receipts); (2) `_renderScanQR` wraps every generated QR (commit/guest/
reconcile) in a WHITE QUIET-ZONE and makes it **tap-to-enlarge** → `_showBigQR` fills the screen (~460px) so it's
scannable off the student's screen; (3) the printed sealed-transcript QR enlarged to 300px + white padding.

## ⚠ GOTCHAS (load-bearing)
- **CASE-SENSITIVITY is the recurring footgun.** Supabase `.eq` is byte-exact for usernames AND `roster.section`.
  Normalize on write; canonicalize usernames to Title_Case and section to `PeriodX`. (Both the `date_tiger` bug and
  the `PERIODX` enrollment are this.)
- **TWO roster stores, SAME Supabase (`bzqbhtru…`).** roster-server's **`roster`** table (real names, sections,
  `schoology_uid`; powers the **Desk** panel; RLS = service-role only) vs curriculum_render's **`users`** table
  (powers the **quiz** panel; empty). Different tables — don't conflate.
- **Guest identity** = persisted `Guest_Fruit_Animal` (localStorage `apstats_guest_identity`), from
  `railway_client.getGuestIdentity()`; `Guest_` prefix = the flag. Signed-in users MUST resolve via rosterClient
  first (`6662dae`) or they're mis-tagged.
- **Commit chain is RECOMPUTED, not stored.** `GET /commits` is deterministic from the ledger; same input → same
  chain; new work appends at the head. No `student_commits` table (that's Phase 3 if you ever want persistence).
- **Two Railway servers** both need deploys for this session's endpoints (NEXT #1).
- **QR scannability = px-per-module + quiet zone.** `lib/qrcode.min.js` renders at the requested px regardless of
  version and draws NO quiet zone. Dense payloads (commit/transcript ~v19, ~93 modules) need ~3+px/module AND a white
  border. So: embed receipts sparingly (commit QR is **manifest-only** — the signed root commits to them), wrap every
  generated QR in `_renderScanQR` (white quiet-zone + **tap-to-enlarge** via `_showBigQR`), and print big (300px). A
  short-URL QR (v4) scans anywhere — not a useful baseline. `verify.html#commit=` accepts manifest-only OR full {m,r}.
- **USE_V3_GRADING is LIVE.** Grade-engine / `gradebook-grid.js` / `blooket-lessons.json` changes move REAL grades.
  Prior live-grade moves (s5, all raise/hold-only): **#3d PeriodX→E** due-filter; Blooket backfill; **#3e
  verifyIpLimiter** + delete-cascade to cr `answers` are also live.
- **The Desk** (`ap_stats_roadmap_square_mode.html`, ~14k lines, SINGLE FILE). Title-bar stacking: `.title-stripes`
  are `position:absolute z-index:1`, `.close-box`/`.collapse-box` `z-index:3` — any new title-bar control needs
  `z-index:3+` or it's painted over. jsdom can host the file (canvas `getContext` throws on load → hoisted functions
  stay callable). Keep render helpers function-local + typeof-guard cross-feature calls.
- **Commit own paths only** — both repos have unrelated dirty/untracked files; stage explicit paths, never `git add -A`.
  `git commit -m @'…'@` here-strings LEAK a stray `@` → use `git commit -F` a temp file (or the Bash heredoc).
- **Bash tool resets cwd between calls.** Use absolute paths + the Write tool for node scripts. Syntax-check the
  Desk's inline JS by regex-extracting `<script>` blocks through `vm.Script`. roster-server uses **bcryptjs** (pw
  cost 12). In `node -e`, don't name a var `URL`.
- **Green baselines:** roster-server **903**; wallet-logic **28**; cr railway-server **350**. Migrations are USER-RUN
  on Supabase; **NONE new this session** (the commit chain deliberately avoids one). `roster.login_username` DB UNIQUE
  is the FCFS guarantee.

## 🔁 BLOOKET PIPELINE (durable reference — unchanged this session)
**⚠ LIVE SOURCE = Supabase `lesson_urls.blooket_url`** (project `hgvnytaqmuybzbotosyj`; the Desk
`loadSupabaseOverlay()` fetches `select=topic,worksheet_url,drills_url,quiz_url,blooket_url` at runtime). All 77
topics are covered (s6). Rows are authored by the Agent repo's lesson-prep pipeline (`upload-blooket.mjs` creates the
set via CDP on the teacher's logged-in Edge; `lesson-prep.mjs`/`sync-schedule-to-supabase.mjs` call `upsertLessonUrls`)
— cr only READS the table; `units.js` is NOT the live source and the STATIC files lag. **Recipe to backfill a topic:**
query `lesson_urls.blooket_url` → write `urls.blooket` into BOTH `roadmap-data.json` (`.lessons[topic].urls.blooket`;
`JSON.stringify(obj,null,2)` NO trailing newline) AND `Agent/state/lesson-registry.json` (`+'\n'`) → run
`roster-server/scripts/gen-blooket-lessons.mjs` (→ `blooket-lessons.json`, the v3 Blooket denominator) → verify →
commit fa + Agent. A topic isn't COUNTED by the v3 engine until propagated.

---
_(s5/s6 session narratives pruned 2026-06-15 s7; the above is authoritative. Durable s5 facts folded into GOTCHAS.)_
