# Bulletproof Gradebook — Phase 0 Spec (Shared Roster / Login)

**Status:** Phase 0 design **SIGNED OFF 2026-05-17** (§6 decisions locked). No implementation yet — the Phase 0 build is a separate session.
**Author:** session 98 (continuation). **Date:** 2026-05-17.
**Scope of this doc:** Phase 0 only (the shared roster/login long pole). Phases 1–4 are sketched at the end for context but are *not* specified here.

---

## 1. Why Phase 0 exists

The teacher wants a **correctness/mastery-based grade of record** computed from a unified ledger of every gradeable thing a student does across the ecosystem. The architecture (already decided with the user) is a new Supabase analytics layer with three tables:

- `roster` — universal student key + real name + login. **The join key for everything.**
- `item_ledger` — one row per student × gradeable item (worksheet Q, FRQ AI grade, curriculum_render quiz answer).
- `skill_mastery` — per student × AP-skill BKT `pKnow`, rolled up from `item_ledger` (reuses the study-guide BKT).

Grade = mastery off `skill_mastery`; `item_ledger` completeness = an accountability check. **Blookets are excluded** (manual class-participation only).

**Every feeder is worthless without a stable student key.** A worksheet answer, an FRQ score, and a quiz response can only become a grade if they all resolve to the *same* student. Today they do not — there is no shared identity. Phase 0 builds that identity. It is the prerequisite for Phases 1–4 and the longest pole, so it is being done first and in parallel with everything else.

---

## 2. Current-state identity audit (verified 2026-05-17)

There are **three mutually isolated identity mechanisms** in the student-facing apps, plus one external write path. None of them share a key.

| | Follow-along worksheets | Study guide (`study_guide_diagnostic.html`) | Roadmap (`ap_stats_roadmap_square_mode.html`) |
|---|---|---|---|
| **Identifier** | Free-text `username` (self-typed, optional) | `fruit_animal[_vehicle\|_number]` username | Email address (self-reported) |
| **Auth** | None | Username **+ password**, verified server-side | None — email trusted |
| **Real name captured?** | No (only free-text "name") | **Yes** (`real_name`, required at signup) | No |
| **Backend** | Railway (`/api/submit-answer`) | Driller-style API (`{base}/api/users`, `/verify`) + optional Supabase `study_guide_state_backups` | Hardcoded Supabase `hgvnytaqmuybzbotosyj.supabase.co`, tables `students`/`student_progress` |
| **localStorage key** | `worksheet-user` = `{name, klass, username}` | `apStatsStudyGuideDiagnostic.v7` (+ `.userProfiles`, `.user.{username}`) | `apstats_desk_student_email` (+ `apstats_desk_marks_{email}`) |
| **FRQ attribution** | **`/api/ai/grade` and `/api/ai/appeal` send NO username** — FRQ scores are currently un-attributable to a student | n/a | n/a |
| **Weak shared breadcrumb** | — | legacy `progress-username` (write) | `progress-username` (read, display-only) |

External, not local, not yet wired:
- **curriculum_render quiz** — AP Classroom bank in the **sacred** `curriculum_render/data/curriculum.js` (never written to). The answer-submit path is a *new* write path (Phase 2, hardest). Identity mechanism currently unknown — must be confirmed when that repo is in scope.
- **TI-84 trainer** — localStorage SRS only. **Not a gradeable feeder.** Out of scope for the gradebook.

### Consequences that shape Phase 0

1. **No surrogate key anywhere.** The three handles (free-text name, fruit_animal username, email) are all user-facing and mutable. The universal key cannot be any of them.
2. **FRQ scores are orphaned today.** The AI-grade/appeal calls don't carry identity. Phase 1's FRQ feeder is blocked until Phase 0 gives those calls a key.
3. **Two live Supabase projects** (`hgvnytaqmuybzbotosyj` for the roadmap; whatever `window.AP_STATS_STUDY_GUIDE_SUPABASE` points to for the study guide). Phase 0 must pick **one canonical home** for `roster`.
4. **Only the study guide collects real names.** The teacher's gradebook is keyed on real students in a class. Real name + section must be captured at enrollment for everyone.
5. **Auth strength is uneven.** A grade of record needs identity at least as trustworthy as the study guide's (password). Worksheet/roadmap "trust" is too weak to grade on.

---

## 3. Phase 0 goal & non-goals

**Goal:** A single canonical `roster` table + a shared client contract such that any app can resolve "who is this student" to **one stable `student_id`**, with the teacher able to map every `student_id` to a real student in a real class section.

**In scope (Phase 0):**
- `roster` table schema + RLS.
- A shared, embeddable identity client (`roster-client.js`, sibling to `railway_client.js`) usable from every single-file HTML app.
- The login/enrollment UX and credential model.
- A migration/reconciliation plan for the existing three identity stores (or an explicit clean-start decision).
- Security/PII posture for storing real names.

**Explicitly NOT in scope (Phase 0):**
- `item_ledger` / `skill_mastery` tables and any feeder wiring (Phases 1–3).
- The curriculum_render quiz write path (Phase 2).
- Grade calculation / teacher dashboard (Phases 3–4).
- Touching `curriculum_render/data/curriculum.js` — **never**, in any phase.
- TI-84 trainer integration — not a feeder.

---

## 4. Proposed `roster` schema (Supabase / Postgres)

```
roster
─────────────────────────────────────────────────────────────────────
student_id      uuid     PK, default gen_random_uuid()   ← universal join key
real_name       text     NOT NULL                        ← teacher-facing anchor (PII)
section         text     NOT NULL                        ← e.g. "SUMMER26", "SY26-27-S1"
login_username  text     UNIQUE NOT NULL                  ← canonical handle (fruit_animal style)
password_hash   text     NOT NULL                         ← argon2/bcrypt, never plaintext
email           text     NULL                             ← optional, for roadmap-origin users
status          text     NOT NULL default 'active'        ← active | archived
created_at      timestamptz default now()
updated_at      timestamptz default now()
─────────────────────────────────────────────────────────────────────

roster_alias  (reconciliation table — maps legacy handles → student_id)
─────────────────────────────────────────────────────────────────────
alias_id      uuid    PK
student_id    uuid    FK → roster.student_id
source        text    NOT NULL   ← 'worksheet' | 'studyguide' | 'roadmap'
legacy_key    text    NOT NULL   ← the old free-text name / fruit_animal username / email
UNIQUE(source, legacy_key)
─────────────────────────────────────────────────────────────────────
```

- **`student_id` is the only thing `item_ledger`/`skill_mastery` ever reference.** Handles can change; the uuid never does.
- `roster_alias` lets historical rows (existing worksheet/study-guide/roadmap data) be back-joined to a `student_id` later without polluting `roster` itself.
- `password_hash`: never store or transmit plaintext; the salt-in-plaintext mistake from carry-over (g) (`teacher-code-generator.html`) must not be repeated here.

---

## 5. Shared client contract (`roster-client.js`)

A single embeddable script, deployed as a sibling like `../railway_client.js`, exposing one global:

```js
window.rosterClient = {
  // Resolve current identity from localStorage; null if not signed in.
  current(): { studentId, username, realName, section } | null,

  // Sign in with canonical credentials. Verifies server-side. Persists.
  signIn(username, password): Promise<{ ok, studentId, realName, section, error? }>,

  // Teacher-/enrollment-created account. Returns generated username.
  enroll({ realName, section, password? }): Promise<{ ok, username, studentId, error? }>,

  signOut(): void,

  // For feeders: the value to stamp on every ledger write.
  studentId(): string | null
}
```

- **One canonical localStorage key**, e.g. `apstats_roster.v1` = `{ studentId, username, realName, section, signedInAt }`. Every app reads this; the three legacy keys are migrated away.
- Apps call `rosterClient.studentId()` and stamp it on every gradeable submission. Worksheet `/api/submit-answer`, **`/api/ai/grade` and `/api/ai/appeal` gain a `student_id` field** (closes the FRQ-orphan gap).
- The client is the *only* place credential/Supabase logic lives. Single-file apps stay single-file; they just `<script src="../roster-client.js">`.

---

## 6. Locked decisions (signed off 2026-05-17)

1. **Canonical home — NEW dedicated Supabase project.** The gradebook is a system of record and will not inherit the roadmap's or study guide's ad-hoc schema/RLS. A fresh project is provisioned for `roster`/`roster_alias` (and later `item_ledger`/`skill_mastery`).
2. **Credential model — HAND-ROLLED username + password.** argon2/bcrypt password hashing in our own auth code, modeled on the study guide's proven fruit_animal-username + password flow, **teacher-provisioned** (no student self-signup). *Supabase Auth (GoTrue) was recommended for native `auth.uid()` RLS and zero new vendors; not selected. Clerk was considered and rejected (2nd vendor, network dependency on offline-capable apps, minors' PII to a third party). Revisit Supabase Auth only if the server-mediated RLS plumbing in §6.5 proves heavier than expected.*
3. **Historical data — CLEAN-START for the SUMMER26 cohort.** Fresh enrollment for the small active summer cohort. `roster_alias` exists in the schema but reconciliation of legacy worksheet/study-guide/roadmap identities is deferred until/unless old data must be graded.
4. **Adoption — SHARED client, single canonical login.** One sign-in surface on the **roadmap** (the hub students already open) + shared `roster-client.js` everywhere. Every app reads the same identity from the one localStorage key; no per-app login UI.

### 6.5 Design implication of (1)+(2) — server-mediated roster access

Hand-rolled auth means **no Supabase `auth.uid()`**, so RLS cannot key off a Supabase-issued JWT. Single-file apps also cannot safely hold a Supabase service-role key. Therefore:

- **Clients never talk to Supabase directly for `roster`.** All roster reads/writes go through a thin auth service we own (Railway endpoint or Supabase Edge Function) that holds the service key, does the argon2/bcrypt hash + verify, and issues a short signed **session token**.
- This mirrors how the study guide already works (driller-style `{base}/api/users` + `/api/users/verify`, not direct Supabase). The new service is the same shape against the new dedicated project: `POST /roster/enroll`, `POST /roster/verify` → `{ studentId, token }`, token cached in the one localStorage key.
- `roster-client.js` (§5) talks only to that service, never to Supabase. RLS on the Supabase side is then simply: service-role only; no anon access to `roster` at all.
- This is the accepted cost of choosing hand-rolled over GoTrue. It is more code than `auth.uid()` but reuses a pattern already running in production for the study guide.

---

## 7. Acceptance criteria (Phase 0 "done")

- `roster` + `roster_alias` exist in the **new dedicated** Supabase project. RLS posture: **no anon access at all** — service-role only. Per-student isolation ("a student sees only their own row") and bulk `real_name` protection are enforced by the auth service (§6.5), not by `auth.uid()` (we chose hand-rolled, so there is no Supabase session to key RLS on).
- Auth service (Railway endpoint or Supabase Edge Function) exists with `POST /roster/enroll` (teacher-provisioned) and `POST /roster/verify` → `{ studentId, token }`; argon2/bcrypt hashing server-side; service-role key never leaves the server.
- `roster-client.js` deployed as a parent-dir sibling; `rosterClient.current()/signIn()/enroll()/studentId()` work from a plain single-file HTML page with only a `<script src>`, talking **only to the auth service** (never directly to Supabase).
- A student enrolled once can be resolved to the same `student_id` from the roadmap, a worksheet, and the study guide.
- `/api/submit-answer`, `/api/ai/grade`, `/api/ai/appeal` accept and persist a `student_id` (wiring is Phase 1, but the contract/field is fixed here).
- No plaintext passwords or salts anywhere client-visible (carry-over (g) rule).
- A documented decision recorded for each of §6.1–§6.4.

---

## 8. Phases 1–4 (context only — not specified here)

Per the locked architecture:

- **Phase 1** — `item_ledger` + the two easy feeders: worksheet fill-ins (Railway `/api/submit-answer`) and FRQ AI grades (`/api/ai/grade`), now carrying `student_id`.
- **Phase 2** — curriculum_render quiz feeder. New write path only; **never** touches sacred `curriculum.js`. Depth = every selected option per student per question + full item analysis.
- **Phase 3** — `skill_mastery` rollup (reuse study-guide BKT) + the correctness/mastery grade calc; `item_ledger` completeness as accountability.
- **Phase 4** — teacher dashboard over the unified ledger.

Sequencing note: Phase 0 proceeds now in parallel with other threads. The U4/U5 per-lesson backfill was **de-scoped** (combined worksheets kept; registry already resolves them), so the only active threads are the roadmap (shipped, commit `27bc1df`) and this spec.
