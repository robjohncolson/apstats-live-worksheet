# roster-server — Deploy Runbook

This is the Phase 0 auth service for the AP Stats Gradebook. It is a standalone Node/Express service
deployed to Railway. It is the **only** component that holds the Supabase service-role key and bcrypt
password logic — clients never talk to Supabase directly.

Everything in this file is a **user-action handoff**: these steps require your Supabase and Railway
accounts and cannot be automated from code. The service itself is fully built and locally testable
against mocks (see `tests/`).

---

## Prerequisites

- A Supabase account (supabase.com)
- A Railway account (railway.app) with the CLI installed (`npm i -g @railway/cli`) or access via the
  Railway web dashboard
- `openssl` available in your terminal (for generating secrets)

---

## Step 1 — Use the existing curriculum_render Supabase project

> **Important (spec §6.1 revised 2026-05-17 / decision D-G):** Do **NOT** create a new project.
> The Supabase free tier caps the account at 2 projects, both already in use. The gradebook reuses
> the **existing curriculum_render project** `https://bzqbhtrurzzavhqbgqrs.supabase.co` — the same
> project that already holds worksheet `answers`, `users`, and AI-grade data (the Phase 1 feeders).
> Phase 0 adds **new, isolated** `roster`/`roster_alias` tables; it never inherits, alters, or reads
> the project's existing schema, so §6.1's intent (clean schema + own service-role-only RLS) holds.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → open the **curriculum_render
   project** (`bzqbhtrurzzavhqbgqrs`).
2. From **Project Settings → API**, copy:
   - **Project URL** = `https://bzqbhtrurzzavhqbgqrs.supabase.co` → this is `ROSTER_SUPABASE_URL`
   - **service_role** key (under "Project API keys") → this is `ROSTER_SUPABASE_SERVICE_KEY`
     (keep this secret; it bypasses RLS — it is the *same* service-role key the existing
     curriculum_render Railway server uses; `roster-server` just holds its own env copy)

---

## Step 2 — Run the migration

> ⚠ **Shared-project discipline:** this is the curriculum_render project, which already has live
> tables (`answers`, `users`, `identity_claims`, …). The migration is written to be safe here
> (`create … if not exists`, RLS only on the two new tables) but you must still:
> run **only** `0001_roster.sql`, never any destructive/`ALTER` statement, in this project.

1. In the Supabase dashboard (curriculum_render project), go to **SQL Editor** (left sidebar).
2. Click **New query**.
3. *(Sanity check first)* Run `select to_regclass('public.roster'), to_regclass('public.roster_alias');`
   — both should return `NULL` (no pre-existing tables of those names). If either is non-NULL, STOP
   and investigate before proceeding (do not blindly re-run the migration over an unknown table).
4. Open `roster-server/migrations/0001_roster.sql` from this repo and paste its entire contents into
   the editor.
5. Click **Run** (or press Cmd/Ctrl+Enter).
6. You should see a success message with no errors.
7. Verify in **Table Editor** that the project now has the two **new** tables `roster` and
   `roster_alias` **and that no pre-existing table (`answers`/`users`/…) changed**.

### What the migration does

- Enables `pgcrypto` for `gen_random_uuid()`.
- Creates `roster` (student identity + credentials) and `roster_alias` (legacy-handle reconciliation).
- Adds two indexes: `roster_section_idx` (for teacher queries by class section) and
  `roster_alias_student_idx` (for Phase 1 back-join lookups).
- Installs an `updated_at` trigger on `roster` so that any `UPDATE` automatically refreshes the
  timestamp.
- **Enables RLS with zero policies** on both tables (see RLS posture below).

### RLS posture — service-role-only, zero policies, why no `auth.uid()`

Row-Level Security is **enabled** on both tables. There are **no `CREATE POLICY` statements** —
intentionally. This means:

- The Supabase **anon** key gets zero rows from either table.
- Supabase **Auth** (`auth.uid()`) is not used — we chose hand-rolled username+password auth (spec
  §6.2), so there is no Supabase session to key RLS on.
- The **service-role** key bypasses RLS entirely (Postgres behavior for `BYPASSRLS`). Only
  `roster-server` holds the service-role key (server-side env var only, never in any client file).
- Per-student row isolation and bulk `real_name` protection are enforced by `roster-server`'s own
  logic (verify token → look up only that student's row), not by RLS policies.

This is the accepted cost of choosing hand-rolled auth over Supabase GoTrue. The tradeoff was
explicitly signed off in spec §6.2 and §6.5.

---

## Step 3 — Create a Railway service

### Option A: Railway web dashboard

1. Go to [railway.app](https://railway.app) → your project (or create a new project).
2. Click **New service → GitHub repo** and select this repo (`follow-alongs`).
3. In the service settings, set **Root directory** to `roster-server`.
4. Railway will detect `package.json` and build automatically.
5. The start command is set in `railway.json`: `node server.js`.

### Option B: Railway CLI

```bash
cd roster-server
railway login
railway link          # link to an existing project, or omit to create new
railway up
```

---

## Step 4 — Set environment variables

In the Railway service dashboard → **Variables** tab (or `railway variables set` CLI), add:

| Variable | Value |
|----------|-------|
| `ROSTER_SUPABASE_URL` | The Project URL from Step 1 (e.g. `https://xxxxxxxxxxx.supabase.co`) |
| `ROSTER_SUPABASE_SERVICE_KEY` | The service_role key from Step 1 — **server only, never public** |
| `ROSTER_TOKEN_SECRET` | Run `openssl rand -hex 32` and paste the output — keep this secret |
| `ROSTER_TEACHER_SECRET` | Pick a strong passphrase you will share only with yourself for enrollment |
| `PORT` | Leave unset — Railway injects it automatically |

> `ROSTER_TOKEN_SECRET` signs the session tokens students receive. If you rotate it, all existing
> sessions become invalid (students must sign in again). Keep it stable.

> `ROSTER_TEACHER_SECRET` is the shared secret required in the `x-teacher-secret` header when calling
> `POST /roster/enroll`. Students never see or use it.

After saving variables, Railway will redeploy automatically.

---

## Step 5 — Wire `roster_config.js` to the deployed URL

Once the Railway service has a public URL (shown in the Railway dashboard under **Settings → Networking**):

1. Open `roster_config.js` at the repo root (sibling of `railway_config.js`).
2. Replace the placeholder URL with your deployed URL:

```js
window.ROSTER_SERVICE_URL = window.ROSTER_SERVICE_URL ||
  'https://your-actual-service.up.railway.app';
```

3. Commit and push `roster_config.js`. Every worksheet and app will now point to your live service.

---

## Step 6 — Smoke test

### Health check (no auth needed)

```bash
curl https://your-service.up.railway.app/health
# Expected: {"ok":true,"service":"roster","time":"2026-..."}
```

### Enroll one student (teacher-gated)

```bash
curl -X POST https://your-service.up.railway.app/roster/enroll \
  -H "Content-Type: application/json" \
  -H "x-teacher-secret: YOUR_ROSTER_TEACHER_SECRET" \
  -d '{"realName":"Test Student","section":"SUMMER26","password":"testpass123"}'
# Expected: {"ok":true,"studentId":"<uuid>","username":"<fruit_animal>","realName":"Test Student","section":"SUMMER26"}
```

Save the returned `username` for the next step.

### Sign in as that student

```bash
curl -X POST https://your-service.up.railway.app/roster/verify \
  -H "Content-Type: application/json" \
  -d '{"username":"<fruit_animal_from_above>","password":"testpass123"}'
# Expected: {"ok":true,"studentId":"<uuid>","token":"<compact-hmac>","realName":"Test Student","section":"SUMMER26"}
```

### Browser smoke test via the demo page

Open `roster-client-demo.html` in your browser (served from the follow-alongs GitHub Pages site or
opened as a local file). Use the sign-in form with the credentials from above. Verify that
`rosterClient.current()` returns the student object and `rosterClient.studentId()` returns the uuid.

---

## Environment variable reference (`.env.example`)

See `.env.example` in this directory for the template. **Never commit a `.env` file with real values.**

```
ROSTER_SUPABASE_URL=          # curriculum_render project: https://bzqbhtrurzzavhqbgqrs.supabase.co (D-G)
ROSTER_SUPABASE_SERVICE_KEY=  # service-role key, SERVER ONLY, never shipped to a client
ROSTER_TOKEN_SECRET=          # long random string for HMAC (openssl rand -hex 32)
ROSTER_TEACHER_SECRET=        # shared secret the teacher uses to enroll students
PORT=8090
```

---

## Running locally (for development/testing)

```bash
cd roster-server
npm install
cp .env.example .env      # fill in real or test values
node server.js            # starts on PORT (default 8090)
```

For unit tests (no live Supabase needed — uses injected fake db):

```bash
cd roster-server
npm test
```

---

## Ledger (Sprint 1)

### Migration `0002_item_ledger.sql`

This migration is **additive and safe** in the shared curriculum_render project (`bzqbhtrurzzavhqbgqrs`).
It creates only the `item_ledger` table — it never alters or touches any existing tables
(`answers`, `users`, `roster`, etc.).

**Before running it:**

1. In the Supabase SQL Editor, run the sanity check first:
   ```sql
   select to_regclass('public.item_ledger');
   ```
   The result must be `NULL`. If it is non-NULL, a table of that name already exists — STOP and
   investigate before proceeding.
2. Paste the entire contents of `roster-server/migrations/0002_item_ledger.sql` and click **Run**.
3. Verify in Table Editor that `item_ledger` was created and that no pre-existing table changed.

### `ROSTER_PROCTOR_SECRET` environment variable

`ROSTER_PROCTOR_SECRET` controls proctored-tier evidence writes (decision L-C). You must set it on
the Railway service (Variables tab) before any `evidence_tier='proctored'` records can be written.
Practice-tier writes work without it — if the variable is absent or the header does not match,
all records default to `evidence_tier='practice'`. This variable is **server-side only**; it must
never appear in any client-side file or be shared with students.

---

## Do Now (DN1)

`GET /donow` — returns the student's current do-now completion structure. Additive; does not change
any `/roster/*` or `/ledger/*` behavior.

**Auth:** roster session token — same token issued by `POST /roster/verify`. Supply via:
- `Authorization: Bearer <token>` header, or
- `?token=<token>` query parameter.

Returns 401 if the token is absent or invalid.

**Behavior:** reads `item_ledger` rows for the authenticated student plus the work-manifest (path
configured by `WORK_MANIFEST_PATH` env, default `data/work-manifest.json` in the repo root). Computes
per-activity / per-lesson / per-unit-pc completion in manifest order (unit → lesson → activity; a
unit's progress-check after its lessons).

**Response (`200 OK`):**
```json
{
  "ok": true,
  "nextTask": {
    "unit": "U1", "lesson": "1.2", "activity": "worksheet", "source": "worksheet",
    "progress": { "done": 4, "total": 12 }, "reason": "earliest-incomplete"
  },
  "lessons": [
    { "unit": "U1", "lesson": "1.2",
      "activities": [
        { "activity": "worksheet", "source": "worksheet", "done": 4, "total": 12, "state": "partial" }
      ],
      "lessonState": "partial" }
  ],
  "units": [
    { "unit": "U1", "pc": { "done": 0, "total": 60, "state": "none" } }
  ],
  "earlierGapFlag": false
}
```

`nextTask` is `null` when all activities are complete. `earlierGapFlag` is `true` when any incomplete
activity exists before the student's most-advanced touched activity (drives the DN3 speed-bump).

---

## Redeploy runbook — activate `/donow` (unblocks DN2c)

> **Why this is needed:** the live Railway service was last deployed for Phase 0 / Sprint 1,
> **before** DN1 landed. `GET /donow` currently returns **404 on prod** simply because the deployed
> build has no `mountDonow`. The in-repo code is correct; this is purely a "push the current code"
> step. **This is a teacher/user action** — it requires your Railway account. No code change is
> required before redeploying; the manifest-reachability fix below is already committed.

### What was already fixed in the repo (so redeploy won't 500)

Railway deploys this service with **Root Directory = `roster-server`**, so the repo-root
`data/work-manifest.json` is **not** in the deployed container. `GET /donow` needs that manifest.
The fix (already in the repo):

- `scripts/build-work-manifest.mjs` now writes a **byte-identical bundled copy** to
  `roster-server/data/work-manifest.json`, which ships inside the deploy artifact.
- `loadLiveManifest()` resolves the manifest in this order: `WORK_MANIFEST_PATH` env →
  bundled `roster-server/data/work-manifest.json` → repo-root `../data/work-manifest.json`.
- `tests/work-manifest.test.js` has a drift guard so the two copies can never silently desync.

So after redeploy `/donow` works with **no env changes** — the bundled manifest is found
automatically. Setting `WORK_MANIFEST_PATH` is optional and only needed to point at a non-default
location.

> Before redeploying, make sure the bundled copy is current. If you (or a regen) recently changed
> `data/skill-map.json`, run `node scripts/build-work-manifest.mjs` and commit both
> `data/work-manifest.json` and `roster-server/data/work-manifest.json` first.

### Step R1 — Trigger the redeploy

The existing service (`apstats-roster` project, `roster` service,
`https://roster-production-12c1.up.railway.app`) is already wired to this repo with all secrets set
(`ROSTER_SUPABASE_URL`, `ROSTER_SUPABASE_SERVICE_KEY`, `ROSTER_TOKEN_SECRET`, `ROSTER_TEACHER_SECRET`,
`ROSTER_PROCTOR_SECRET`). You only need to ship the latest `master`.

**Option A — Railway dashboard:** open the `roster` service → **Deployments** → **Deploy** (or
trigger a redeploy of the latest commit on `master`). Confirm the build picks up the current commit.

**Option B — Railway CLI:**

```bash
cd roster-server
railway link            # select the existing apstats-roster project / roster service
railway up
```

No variables need to change. Railway will build and roll the new deployment.

### Step R2 — Smoke test `/donow` end-to-end

```bash
# 1. Health (sanity — should already pass pre-redeploy)
curl https://roster-production-12c1.up.railway.app/health
# → {"ok":true,"service":"roster","time":"..."}

# 2. Enroll a throwaway student (teacher-gated). Use the SMOKETEST section so the
#    existing `delete from roster where section='SMOKETEST';` chore cleans it up.
curl -X POST https://roster-production-12c1.up.railway.app/roster/enroll \
  -H "Content-Type: application/json" \
  -H "x-teacher-secret: $ROSTER_TEACHER_SECRET" \
  -d '{"realName":"DN1 Smoke","section":"SMOKETEST","password":"smoke-dn1-pass"}'
# → {"ok":true,"studentId":"...","username":"<fruit_animal>", ...}  (save the username)

# 3. Sign in to get a session token
curl -X POST https://roster-production-12c1.up.railway.app/roster/verify \
  -H "Content-Type: application/json" \
  -d '{"username":"<fruit_animal_from_step_2>","password":"smoke-dn1-pass"}'
# → {"ok":true,"studentId":"...","token":"<token>", ...}  (save the token)

# 4. THE proof — /donow must return 200, NOT 404 and NOT 500
curl "https://roster-production-12c1.up.railway.app/donow?token=<token_from_step_3>"
# → 200 {"ok":true,"nextTask":{...},"lessons":[...],"units":[...],"earlierGapFlag":false}
```

**Interpreting the result:**

| `/donow` response | Meaning | Action |
|-------------------|---------|--------|
| **404** | Redeploy didn't take — old build still live | Re-trigger the deploy; confirm it built the latest commit |
| **500** `"Could not load work manifest"` | Bundled manifest missing from the artifact | Confirm `roster-server/data/work-manifest.json` is committed and not in `.railwayignore`; redeploy |
| **401** | Token missing/invalid | Re-run steps 2–3; pass the token via `?token=` or `Authorization: Bearer` |
| **200** with the JSON shape above | ✅ DN1 is live — **DN2c is unblocked** | Proceed with DN2c; run the SMOKETEST cleanup chore |

### Step R3 — Cleanup

After a green `/donow`, clear the throwaway row (also cascades to any `item_ledger` test rows):

```sql
delete from roster where section='SMOKETEST';
```
