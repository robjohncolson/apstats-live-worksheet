# Bonus Bank backend — Codex report (2026-09-23)

```json
{
  "status": "completed",
  "summary": "Implemented Bonus Bank backend and teacher entry script. Both requested test suites pass. No commits, UI edits, bundle generation, or golden regeneration.",
  "files_changed": [
    "roster-server/class.js",
    "roster-server/grade.js",
    "roster-server/lesson-grade.js",
    "roster-server/mastery.js",
    "roster-server/rollup.js",
    "roster-server/ledger.js",
    "roster-server/migrations/0036_item_ledger_bonus_source.sql",
    "roster-server/tests/bonus-bank.test.js",
    "scripts/enter-bonus.mjs",
    "tests/enter-bonus.test.js"
  ],
  "implementation_file_count": 10,
  "route_contracts": {
    "POST /class/bonus": {
      "auth": "requireTeacher; unauthorized returns 401",
      "body": "{sheetId, title, quarter, section?, entries:[{studentId?, username?, grade:'E'|'P'|'I'}]}",
      "validation": "sheetId must match ^[A-Za-z0-9][A-Za-z0-9_-]*$; title must be a nonempty string; quarter is uppercased and must be Q1..Q4; entries must be an array. Invalid top-level input returns 400.",
      "resolution": "Roster is scoped by section when supplied and excludes teacher accounts. studentId takes precedence over username; username matches trimmed login_username exactly. Unknown/ambiguous students or invalid grade letters are skipped into errors with the input index.",
      "writes": "insertLedgerRow upserts source=bonus, itemId=BONUS-<sheetId>, attempt=1, numeric score E=5/P=3/I=1, evidenceTier=practice, and JSON-string response {grade,quarter,title}.",
      "response": "200 {ok:true,sheetId,quarter,written,errors:[{index,error}]}; entry-level errors do not make ok false. Database failures return 500, or 503 with run migration 0036 guidance for source provisioning failures; partial written/errors counts are included."
    },
    "GET /class/quarter/deltas": {
      "auth": "requireTeacher; unauthorized returns 401",
      "query": "quarter=Q1..Q4&section=<optional>",
      "response": "{ok:true,quarter,frozenCount,deltas:[{studentId,realName,username,frozen,current,delta,bonus:{points,sheets:[{itemId,title,grade,points}],applied:null|{adjustedGrade,appliedAt}}}]}",
      "semantics": "Existing positive-only filtering remains for students without bonus. Frozen students with banked points are retained even with nonpositive deltas. A banked student with no current grade has current:null and delta:0. Points sum only bonus rows whose parsed response.quarter matches. Applied metadata comes from BONUS-APPLIED-<quarter>. Descending delta ordering remains."
    },
    "POST /class/quarter/apply-bonus": {
      "auth": "requireTeacher; unauthorized returns 401",
      "body": "{quarter,section?,dryRun?}; only literal dryRun:false writes; otherwise dry run",
      "response": "{ok:true,quarter,dryRun,rows:[{studentId,username,realName,frozenGrade,points,workBefore,workAfter,switched,adjustedGrade,sheets:[itemId]}],applied,skipped:[{studentId,username,reason:'already applied'}]}",
      "semantics": "Only frozen roster students in scope with quarter-matching bonus points and no existing application are considered. Coerces frozen numeric strings, caps Work at 100, preserves nullable PC, uses exported combineV3 with config.v3Gates, rounds computed grades to 0.1, and guards against lowering frozenGrade. switched reports crossing the configured Work floor. Dry runs return audits and applied:0. Real application writes one source=bonus_applied row per student/quarter with attempt=1, score=adjustedGrade, and JSON-string audit response including appliedAt. Sequential repeated calls apply zero and report already-applied students. Database failures include partial audit/applied/skipped results; source provisioning failures return 503 with migration 0036 guidance; missing snapshots return 503 with migration 0030 guidance."
    },
    "POST /ledger/record": {
      "additional_guard": "Rejects bonus and bonus_applied sources with 403 so student-authenticated generic ledger writes cannot forge banked points or application audits."
    }
  },
  "entry_script": {
    "commands": [
      "node scripts/enter-bonus.mjs <file>",
      "node scripts/enter-bonus.mjs <file> --apply"
    ],
    "flags": "--url and --secret follow import-pc-scores.mjs environment/config fallback handling; optional section= supported in input header.",
    "format": "sheet=<id> quarter=Q1 title=<multiword title>, followed by name|E/P/I rows. Blank lines, comment lines, and trailing whitespace-prefixed comments are ignored.",
    "matching": "Exact case-insensitive, whitespace-collapsed real name or roster username only. Prints match table and refuses apply for unmatched or ambiguous names. No fuzzy matching.",
    "exports": [
      "parseBonusFile",
      "matchBonusStudents"
    ]
  },
  "tests": [
    {
      "command": "cd roster-server && npx vitest run tests/bonus-bank.test.js",
      "exit_code": 0,
      "output": "RUN v1.6.1 C:/Users/rober/Downloads/Projects/school/follow-alongs/roster-server\n\u2713 tests/bonus-bank.test.js (22 tests) 450ms\nTest Files 1 passed (1)\nTests 22 passed (22)\nDuration 5.69s"
    },
    {
      "command": "npx vitest run tests/enter-bonus.test.js",
      "exit_code": 0,
      "output": "RUN v1.6.1 C:/Users/rober/Downloads/Projects/school/follow-alongs\n\u2713 tests/enter-bonus.test.js (13 tests) 10ms\nTest Files 1 passed (1)\nTests 13 passed (13)\nDuration 728ms"
    }
  ],
  "impact_analysis": {
    "performed_before_edits": true,
    "high_risk_warning_reported": "computeGrade: HIGH, 8 direct callers, 12 impacted symbols, 3 affected process groups. Engine edits are early source exclusions only.",
    "other_symbols": "mountClass, fanGrades, computeLessonGrades, masteryObservations, mountRollup, and mountLedger were impact-checked; GitNexus returned LOW for these symbols.",
    "commits": "None; detect_changes pre-commit requirement not triggered."
  },
  "ambiguities_and_limits": [
    "BONUS_BANK_SPEC.md is an older draft: it describes letter scores, a quarter-adjustment record, and a different CLI. Followed the explicit task's numeric ledger scores, bonus_applied source, and header/name|grade file format instead.",
    "The requested sim-world fixture is located at roster-server/tests/fixtures/sim-world.js; reused all five archetypes from that file.",
    "Added skipped to apply-bonus responses to satisfy the requirement to report already-applied students, since the requested response example did not specify that field.",
    "Number(null) treats a null frozen_work_avg as zero for bonus application, consistent with the requested Number coercion. PC null remains absent.",
    "Application idempotence is verified for sequential calls. Existing ledger upsert plus read-before-write does not provide a transaction-level first-writer guarantee for simultaneous application requests.",
    "Migration 0036 is provided for manual execution and was not run against a live database.",
    "Closed-quarter application is persisted in bonus_applied audit rows; no dashboard, Desk, or Schoology consumer changes were made in this backend package."
  ]
}
```
