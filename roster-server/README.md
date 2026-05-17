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
