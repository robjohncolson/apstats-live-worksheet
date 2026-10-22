# HETZNER_MIGRATION_SPEC — moving the backend fleet off Railway

Status: DRAFT 2026-10-21 (brainstormed after the Railway security incident of the same day; domain and timing still open).

## 0. Why, and what is decided

Railway disclosed on 2026-10-21 that customer environment variables may have been
read, and paused every deploy for the rest of the day. Two lessons drive this spec:

1. The secret store should be ours. A self-hosted PaaS keeps env vars on a box we
   control instead of in a shared platform database.
2. The frontends must never hardcode a host we rent. Every service gets a name on
   OUR domain, so the next move is a DNS change, not a 69-file codemod.

Decided (teacher, 2026-10-21):
- Target: ONE Hetzner Cloud VPS in Ashburn (US East) running Coolify, Cloudflare DNS
  in front. Data stays in Supabase (projects `bzqb…` and `hgvn…`); only compute moves.
- Sizing: CPX21-class (3 vCPU / 4 GB) plus Hetzner automatic backups and a Cloud
  Firewall. Target total under $15/month including the domain.

Open:
- The domain (Grok is researching names + Cloudflare Registrar prices).
- Timing relative to the secret rotation (§7).

## 1. Inventory — what runs on Railway today

Nine services. Names are the Railway service names; env vars are listed by NAME only.

| Service | Repo / dir | Start | State | Env (names) | Who calls it |
|---|---|---|---|---|---|
| apstats-roster | `follow-alongs/roster-server` | `node server.js` | none (Supabase bzqb) | ROSTER_SUPABASE_*, ROSTER_TEACHER_SECRET, TEACHER_KEY, ROSTER_TOKEN_SECRET, ROSTER_PROCTOR_SECRET, ROSTER_GRADER_SECRET, FRQ_*, PARK_KEY_GRANT_SECRET, PAYOUT_AGENT_KEY, WALLET_KEY_SECRET, ROSTER_PW_ENC_KEY, RECEIPT_ISSUER_PRIVATE_KEY, RETIRED_ISSUER_PUBKEYS, PC_FIGURES_SUPABASE_*, PC_TRACK_ENABLED, OPEN_SIGNUP_SECTIONS, TRAINER_DECK_ALLOWLIST, USE_V3_GRADING, BLOCKCYPHER_TOKEN | Desk, worksheets, dashboard, quiz app, Equation Trainer, cr (grader callback, bonus rail), Athena tasks (Schoology sync, PC reconcile, payout agent, nightly backup, slips, weekly DOK), GitHub Actions (mirror-ledger) |
| curriculum_render | `curriculum_render/railway-server` | `node server.js` | none (Supabase bzqb); **WebSocket** (Live Classroom / park relay) | DEEPSEEK_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, SUPABASE_*, PARK_KEY_GRANT_SECRET, RECEIPT_ISSUER_PRIVATE_KEY, ROSTER_GRADER_SECRET, ROSTER_TEACHER_KEY, ROSTER_TOKEN_SECRET, AI_GRADE_AUTH, PRESENCE_TTL_MS | worksheets (answer sync, AI grading), quiz app, Desk (park relay), roster (FRQ grader) |
| a2-live-worksheets | `algebra2-live-worksheet/roster-server` | `node server.js` | none (Supabase hgvn, schema `a2`) | CLASS_LOG_TOKEN, CORS_ORIGINS, OPEN_SIGNUP_SECTIONS, ROSTER_DB_SCHEMA, ROSTER_*, TEACHER_KEY, RECEIPT_ISSUER_PRIVATE_KEY, USE_DISTRICT_FORMULA, USE_V3_GRADING | a2 worksheets, Class Log phone, `pull-class-summaries` (also used by this repo), Agent lesson-prep |
| sidereal | (own repo) | ? | **SQLite volume** `/data/sidereal.db` | DEEPSEEK_API_KEY, SIDEREAL_DB, SIDEREAL_NATAL_BACKEND, SUPABASE_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | personal |
| aim-dojo | (own repo) | ? | none (hgvn) | ALLOW_ORIGIN, SUPABASE_SERVICE_KEY, SUPABASE_URL | personal |
| lesson_planning | `Lesson_planning/railway` (railway.toml) | ? | none (bzqb) | REBUILD_PASSCODE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | teacher |
| lrsl-driller | `lrsl-driller` | ? | none (hgvn) | GEMINI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TEACHER_PASSWORD | Algebra 2 students (6 hardcoded refs in this repo) |
| shared-grading-proxy | (own repo) | ? | none (hgvn) | ALLOWED_ORIGINS, GROQ_API_KEY, SUPABASE_* | lrsl-driller, cr |
| sish | upstream image | — | — | SISH_FORCE_REQUESTED_ALIASES | SSH tunnel service (confirm it is still used before moving; drop it otherwise) |

Build system today: Railpack/Nixpacks auto-detect, no Dockerfiles. Coolify does the
same (Nixpacks) or we add a 6-line Dockerfile per Node service — prefer the
Dockerfile so the build is reproducible anywhere.

## 2. Target

```
Cloudflare DNS (+proxy)  ──►  Hetzner CPX21 @ Ashburn
                              ├─ Coolify (Traefik/Caddy TLS, GitHub app, env store)
                              ├─ roster.<domain>   → apstats-roster
                              ├─ cr.<domain>       → curriculum_render   (WebSocket on)
                              ├─ a2.<domain>       → a2-live-worksheets
                              ├─ sidereal.<domain> → sidereal  (Coolify volume /data)
                              ├─ dojo., plan., lrsl., proxy.<domain>
                              └─ (sish only if still needed)
Supabase bzqb + hgvn         unchanged
Athena                       unchanged callers, new hostnames
GitHub Pages / Vercel        unchanged, new API hostnames
```

Box hardening (first day, before Coolify): Ubuntu LTS, SSH key only + root login
off, Hetzner Cloud Firewall allowing 22/80/443 only (22 limited to the teacher's
IP range or Cloudflare Tunnel later), `unattended-upgrades`, Hetzner backups on.
Coolify stays on its own update channel; its dashboard is reachable only over
the Cloudflare-proxied name with Cloudflare Access (email OTP) in front.

Secrets: Coolify's env store on the box. The rotation folder
`~/.config/apstats/rotation-2026-10-21/` (private, Athena) is the source of the
values; nothing is typed from chat. Coolify backups (its own Postgres) ride on the
Hetzner snapshot.

## 3. The URL swap (this repo + cr)

Counts from `git grep` on 2026-10-21 (tracked files, excluding markdown):

| Hardcoded host | Here | cr repo |
|---|---|---|
| `curriculumrender-production.up.railway.app` | 99 refs (69 worksheets carry an inline fallback, Desk 8, dashboard 3, study guide, tests) | 12 |
| `roster-production-12c1.up.railway.app` | 33 refs (roster_config.js, Desk, teacher pages, 14 Athena tools/scripts) | 5 |
| `lrsl-driller-production.up.railway.app` | 6 | — |
| `shared-grading-proxy-production.up.railway.app` | — | 1 |

Rule: after this spec lands, NO tracked file may contain `up.railway.app` except
history/docs. Do it in two steps so the move itself is a DNS flip:

1. **Alias step (before any server moves).** Point `roster.<domain>` and
   `cr.<domain>` at the Railway services (Railway custom domains, CNAME in
   Cloudflare). Codemod every reference to the new names: `railway_config.js`,
   `roster_config.js`, the Desk, teacher pages, study guide, `scripts/wire-*.mjs`-style
   pass over `^u\d+_lesson.+_live\.html$` for the inline fallbacks, `tools/*.py`
   ROSTER_BASE defaults, `scripts/*.mjs` defaults, the Athena config JSONs
   (`~/.config/apstats/.payout-agent.json`, `~/grade-backups/config.json`), the a2
   pull script, cr's references, cr's CORS list, roster's prepared allowlist patch
   (`roster-server/docs/cors-allowlist.patch`), the Equation Trainer's roster URL
   (external Vercel app — teacher updates its env). Guard test: a new
   `tests/no-railway-hosts.test.js` that fails on `up.railway.app` in tracked
   student-facing files.
2. **Cutover step** = change the CNAME target from Railway to the Hetzner box.
   Nothing in git changes.

## 4. Cutover order and checks

1. Domain on Cloudflare; box up and hardened; Coolify installed; GitHub app
   connected to the four repos that deploy (follow-alongs, curriculum_render,
   algebra2-live-worksheet, Lesson_planning) plus the personal ones.
2. Deploy **lesson_planning, aim-dojo, lrsl-driller, shared-grading-proxy** first
   (low blast radius) — each on its own name, same Supabase. Verify, flip CNAME.
3. **curriculum_render**: deploy, verify `/health`, a worksheet answer sync, an AI
   grade, the park relay WebSocket from the Desk (Live Classroom + calculator room),
   CORS for GH Pages, Vercel mirror, Equation Trainer. Flip CNAME. Watch 2 school
   days.
4. **apstats-roster**: deploy on the curve commit or later, verify `/health`
   commit, `/class/grades` for one section, a student sign-in from the Desk, the
   FRQ worker tick, then run `tools/daily_schoology_sync.ps1` dry-run and a PC
   reconcile dry-run from Athena against the new name. Flip CNAME before 16:00 on
   a school day so the 16:00–16:45 tasks exercise it while the teacher is around.
5. **a2-live-worksheets**: same shape; confirm the Class Log phone can post a
   summary (CLASS_LOG_TOKEN) and `npm run pull-summaries` works from this repo.
6. **sidereal**: stop on Railway, copy `/data/sidereal.db` (Railway volume →
   `railway run`/shell → scp), start on Coolify with a volume, verify, flip.
7. Keep Railway services running but unrouted for 7 days (rollback = CNAME back).
8. Delete every Railway variable, then the services, then close the account.

Rollback at any step is a CNAME change; nothing in git references the host.

## 5. Operations after the move

- Deploy = push to master (Coolify webhook), same as today. The local pre-push
  gate (`.git/PUSH_APPROVED`) and the bump-build rule are unchanged.
- Health: Coolify's per-service health check hits `/health`; add an external
  uptime ping (Cloudflare health check or a free pinger) for roster and cr.
- Logs: Coolify UI; the FRQ worker's `graded/failed` counters are in `/health`.
- Backups: Hetzner nightly snapshot (box + Coolify DB + sidereal volume); grades
  are in Supabase and `tools/nightly-backup.mjs` keeps dumping them to Athena.
- Monthly: `apt` security upgrades are automatic; Coolify update from its UI;
  glance at Hetzner's billing page.
- Cost estimate: CPX21 ≈ $8 + backups 20% ≈ $1.6 + domain ≈ $1/month amortized
  ⇒ about $11/month (confirm with Grok's research).

## 6. DO / DON'T

- DO put every service behind OUR domain before moving anything.
- DO keep Supabase where it is; this is a compute move.
- DO rotate secrets as part of the move (§7), never by copying Railway's values.
- DON'T expose Coolify's dashboard without Cloudflare Access.
- DON'T move sidereal until its SQLite file is copied and opened on the new box.
- DON'T delete Railway anything until 7 days after the last flip.
- DON'T put secrets, student names or AP Classroom data in this spec or the repo.

## 7. Sequencing with the 2026-10-21 secret rotation

Two valid orders:

- **A. Rotate on Railway first, then move.** Clean, but every secret is typed twice
  (Railway Raw Editor now, Coolify later) and waits for Railway builds to resume.
- **B. Treat the move as the rotation.** Deploy on Hetzner with the NEW values from
  the rotation folder; Railway keeps the old values until it is deleted. Only the
  upstream keys (DeepSeek, Groq, Gemini, BlockCypher, Supabase keys + the hgvn JWT
  secret) are rotated at their vendors, in the same create-now/revoke-after pattern
  already in use.

Recommendation: **B** if the box can be up within about a week; **A** if Railway
builds return first and the move slips. Either way the hgvn JWT rotation and the
deletion of old vendor keys happen once, after the last service is on new values.

## 8. Build lanes

Spec: main. Codemod + guard test (§3 step 1): Codex astra, reviewed by Opus 5.5.
Box setup + Coolify: teacher with Grok's checklist; Fable verifies each `/health`.
Cutover: Fable runs the checks in §4 and reports; the teacher flips each CNAME.
