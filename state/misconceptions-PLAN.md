# Persistent misconceptions implementation plan

Execution date: 2026-09-11. Never push. Preserve existing workspace edits.

## Data flow

Read-only prompt files (all 69) -> VM rubric enumeration -> draft rubric map
Read-only curriculum.js + answer-key + skill taxonomy -> draft distractor map
Both maps + controlled vocabulary -> deterministic signal extraction
Existing class roster + fanLedger/getLedgerByStudent -> windowed events
Events -> student persistence + class persistence + capped evidence
Teacher auth -> section/window cache (60 seconds) -> GET /class/misconceptions
Same computation -> review-by-item topMisconceptions -> existing review consumer
Dashboard section/window controls -> textContent rendering -> evidence expansion
Nudge action -> existing composer (teacher sends); worksheet action -> existing lesson

## Four commits

1. Vocabulary (40–60 NEW CED tags), both map builders, exhaustive drafted maps,
   map tests, and this plan. Every draft carries reviewed:false and provenance.
2. Pure misconceptions module, config block, authenticated cached class endpoint,
   shared computation integration, and server tests. No grade or ledger writes.
3. Dashboard panel, Nightly Review payload/consumer line, and UI tests.
4. Verification JSON and roster-server README documentation.

## Existing callers (git grep inventory before editing)

Commands run: `git grep -n -E 'mountClass\(|mountReview\(' -- '*.js'` and
`git grep -n '_paintReviewByItem(' -- '*.html' '*.js'`.

- mountClass: roster-server/server.js:1145 (createApp),
  roster-server/tests/class-blank.test.js:47. Definition: class.js:170.
  Other class tests exercise it indirectly through createApp.
- mountReview: roster-server/server.js:1213 (createApp),
  roster-server/tests/review.test.js:105 (mountServer). Definition: review.js:169.
- _paintReviewByItem: ap_stats_roadmap_square_mode.html:17645 (_reviewRefresh);
  definition at 17934. gitnexus-shadow contains a duplicate generated mirror.
- PHASE3_CONFIG: only add the independent misconceptions block; no existing
  scoring values change. It is configuration, not a function.
- Dashboard: add independent functions and listeners; reuse existing auth and
  composer helpers without modifying their definitions.
- listRoster and fanLedger: reuse unchanged. getLedgerByStudent already selects
  `*`, including response and frq_result; no projection change is necessary.

Extend this inventory and run upstream impact analysis before modifying any
additional existing function. GitNexus's stale index includes baseline duplicates;
use exact symbol UIDs. Initial mountClass analysis: LOW, direct createApp caller,
two impacted symbols, zero named execution processes. Refresh is in progress.

## Planned tests

- tests/misconception-maps.test.js: source coverage, wrong letters only, valid
  vocabulary/skills, draft metadata, deterministic builders and --check.
- roster-server/tests/misconceptions.test.js: MCQ and FRQ extraction, exact/fuzzy/
  unmatched resolution, verbatim mistakes, persistence thresholds, windows,
  sorting, evidence cap, draft flags, and immutable inputs.
- Endpoint harness: teacher authentication, empty section, section isolation,
  cache by window/section, and shared review computation.
- tests/teacher-dashboard-misconceptions.test.js: fixture rendering, draft pill,
  evidence expansion, textContent/XSS safety, controls and composer actions.
- Review consumer test: recurring-misconceptions line from fixture payload.

## Verification

Run both builders with --check, roster-server npm test, and root npm test.
Compare root failure names with state/pairing-v2-and-exit-bonus-verification.json;
do not fix known unrelated failures. Run pure-module smoke against available
local real rows or a clearly identified fixture; record the top five labels.
Run GitNexus detect_changes before each commit and review staged hunks. Stage
only this task's changes, using git add -p for shared files. No scratch directories
under state; use TEMP or test-results. If a requirement cannot be satisfied,
stop and report the concrete blocker instead of introducing a special case.
