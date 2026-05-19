# Gradebook Tagging — T2 FULL RUN Build Record (frozen contract)

**Status:** Contract frozen 2026-05-18 (session 100, autonomous loop task #1).
Follows `GRADEBOOK_TAGGING_T2_BUILD.md` §5 ("GO recommendation + the
deferred full run"). The T2 *harness* (`scripts/disambiguate-skills.mjs`)
+ U1 pilot shipped in `1dc5c05`; this is the controlled full ~2593-item run
+ the canonical merge.

**Reads:** `GRADEBOOK_TAGGING_SPEC.md` §3–§7, `GRADEBOOK_TAGGING_T2_BUILD.md`
§5, `GRADEBOOK_GRADING_SPEC.md` v2 (skill-map = diagnostic engine, NOT the
grade), `CONTINUATION_PROMPT.md` task #1.

## 1. Classifier decision (signed-off §5 knob #1 — empirically confirmed)

§5 knob #1 was signed off as **"reuse the Codex pipeline."** A 6/8-item
feasibility probe (`codex exec -s read-only --skip-git-repo-check
--ephemeral --output-schema -o`) confirmed it: every pick was inside the
item's candidate set (constraint respected), confidences were stochastic
(0.60–0.98 — real dual-pass signal, unlike the deterministic pilot
`builtInClassifier`), JSON was schema-clean, latency was workable in
batches. **Decision: Codex pipeline via batched `codex exec`, honored as
written.** No deviation to parallel-Sonnet.

- **`codex exec`** invoked directly (NOT the cross-agent runner — the
  runner echoes ~1.3MB & is for task delegation; direct `codex exec` with
  a compact ASCII prompt is the right primitive for bulk micro-classification).
- Flags: `-s read-only --skip-git-repo-check --ephemeral
  --output-schema <schema> -o <outfile>`; prompt via **stdin** (avoids
  Windows arg-length + cp1252 issues).
- **ASCII-only** prompt (carry-forward gotcha): item text sanitised to
  ASCII (math unicode → ASCII, strip the rest) before embedding.
- **Batch size 40** items/call. ~2593 unresolved → ~65 batches/pass.
- **Dual-pass = two INDEPENDENT codex invocations** per batch (pass A,
  pass B). Stochastic → genuine agreement signal.
- **Bounded concurrency 5**, **resumable** (per-batch result cached in
  gitignored `.t2tmp/`; existing cache files skipped on re-run).
- **Constraint enforcement:** any pick outside the item's candidates is
  dropped → that item routes to the review queue (never invents a code;
  never crashes the run).

## 2. Frozen interfaces (what gets built)

### 2a. `scripts/disambiguate-skills.mjs` (extend; protect the 34 tests)
- **New exported pure `resolveDualPass(id, entry, itemText, pass1, pass2)`**
  — single source of truth for the decision: no-text|appeal → queued
  `no-item-text`; single-candidate → resolved conf 1.0; pass outside
  candidates → queued `out-of-candidates`; agree → resolved
  `ai-constrained` conf=avg; disagree → queued `dual-pass-disagreement`.
- `disambiguateBatch` refactored to **delegate the decision** to
  `resolveDualPass` while preserving its EXACT observable behavior
  (classifier called pass1→pass2 in order; single-candidate does NOT call
  classifier; out-of-candidates still throws via the live path). The 34
  existing tests MUST stay green (verified on disk).
- **New exported `disambiguateAll(items, pass1Map, pass2Map)`** — replay
  path for `--all`: looks up precomputed passes, calls the SAME
  `resolveDualPass`. Out-of-candidates here → queue (not throw; a bulk run
  must not abort on one bad pick).
- **New `buildAllItemTextMap(root)`** — units 1–9 worksheets + curriculum
  (read-only) + frq, reusing the existing loaders.
- **New `codexBatchClassify(items, opts)`** — batches, builds ASCII
  prompt + schema, spawns `codex exec` (concurrency 5, resumable cache),
  parses `-o` output, returns `Map<id,{skill,confidence}>`. Two calls
  (passLabel 'A'/'B') give the two independent passes.
- **`--all` CLI**: load all `unresolved`; build text map; pass A then
  pass B (independent); `disambiguateAll`; write
  `data/skill-map.disambiguated.json` (ai-constrained resolutions) +
  `data/skill-map.review-queue.json` (global T3 queue). **NEVER writes
  canonical `data/skill-map.json`.** Prints agreement stats.

### 2b. `scripts/build-skill-map.mjs` (add the merge/overlay path)
- After the deterministic backbone + supplement/frq merge: **if
  `data/skill-map.disambiguated.json` exists, overlay** each entry whose
  id is present AND currently `unresolved` AND whose skill ∈ that entry's
  candidates → replace with the `ai-constrained` entry. Deterministic &
  idempotent: canonical map = f(frameworks, pools, disambiguated.json).
  `.js` wrapper regenerated in sync. This IS "the T1 generator's merge
  path" §5 step 3 calls for.

### 2c. `scripts/audit-skill-tagging.mjs` (dynamic verdict)
- Replace the hardcoded `### Verdict: NOT READY` with a verdict **computed
  from `data/skill-map.json`** provenance distribution + the T3 residual:
  - report provenance/confidence distribution table (spec §7);
  - **CONDITIONAL** when practice pools are AI/topic-tagged but the
    curriculum.js *certifier* pool still has `unresolved` or
    un-teacher-verified `ai-constrained` (residual = the Sprint T3 queue —
    exactly "move toward READY", T2 build §5 step 4);
  - **READY** only when every pool is tagged AND certifier `unresolved`
    == 0 AND certifier multi-skill tags are `teacher` (post-T3).
  - Still always emits the `## Phase 3 Readiness Verdict` section.
- `tests/audit-skill-tagging.test.js` line ~126 ("verdict contains NOT
  READY") updated to assert the new dynamic verdict string for the
  current state (this is a legitimate state change, in the sprint's own
  test file).

### 2d. T3 surface (Sprint T3 input — this run only PRODUCES it)
- `data/skill-map.review-queue.json` — machine queue (disagreements +
  no-text + out-of-candidates), with `pass1`/`pass2`/`reason`.
- `GRADEBOOK_TAGGING_T3_QUEUE.md` — human summary for the teacher
  (counts per unit × reason, certifier-pool items called out first per
  the §2/§3 priority order). Disagreements do NOT block this run.

## 3. Acceptance (GREEN for this loop task)

Per `CONTINUATION_PROMPT.md` GREEN gate, not the whole-workstream §7:
- follow-alongs root suite: exactly **1** pre-existing fail
  (`tests/study-guide.test.js` v3-structure). No NEW failures.
- New/updated sprint tests pass: `tests/disambiguate-skills.test.js`
  (34 + new `resolveDualPass`/`disambiguateAll`/codex-classify-with-fake
  cases), `tests/audit-skill-tagging.test.js` (verdict updated),
  `tests/skill-map.test.js` (post-merge invariants hold).
- Guards: `node scripts/audit-feeder-ids.mjs` → CLEAN 69 / MISMATCH 0;
  `tests/work-manifest*` green after `build-work-manifest.mjs` re-run
  (+ bundled `roster-server/data/work-manifest.json` copy).
- `data/skill-map.json` change is **REAL and committed** (T2 exception —
  the "revert GENERATED-header false-positive" rule does NOT apply here);
  `.js` wrapper regenerated; provenance now includes `ai-constrained`.
- Canonical map only changes `unresolved` → `ai-constrained` (no
  topic-inherit/formula-map/frq-xref entry altered; key set unchanged).
- roster-server redeployed; `/health` + `/donow` smoke 200.

## 4. Method (loop algorithm)

1. Contract frozen (this doc).
2. **Planner implements directly** — cohesive multi-script change to ONE
   workstream's tooling; parallel-Sonnet fan-out = clobber risk on
   interdependent scripts (loop EXCEPTION rule). Classification *runtime*
   = the batched `codex exec` background run.
3. Codex cross-agent **read-only review** of the implementation
   (ASCII-only prompt; parse `state/cross-agent/<id>.result.json` /
   transcript tail).
4. Planner **re-verify ON DISK**: full suites + guards + sample-audit the
   merged tags (stratified spot-check per §5 knob #3 — fixed sample).
5. GREEN → one tight commit (stage only own paths; audit/agreement stats
   in the commit message) → push → re-run `build-work-manifest.mjs` →
   redeploy roster-server → next task.

**Out of scope (unchanged):** never write `curriculum.js`; tags are
diagnostic only (v2); Sprint T3 (teacher verification of the certifier
pool + the disagreement queue) is the NEXT tagging sprint, not this run.
