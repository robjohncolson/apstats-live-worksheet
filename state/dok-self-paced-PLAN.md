# DOK self-paced plan - 2026-09-12

Status: Proceeding under the fully re-read second revision of DOK_SELF_PACED_SPEC.md.
Starting HEAD: 221ba0f31d5d592e59f991f338ee528e3ceead82.

## Four commits
1. Generator, validator guards, EOL-preserving idempotent codemod, and tests.
2. Apply the codemod to all 69 YAMLs.
3. Hand edits and per-part on-page audit additions.
4. Rebuild all 207 PDFs with dok/compile.ps1 -All, documentation, verification report.
Never push. Preserve unrelated changes. Scratch work uses the Windows TEMP directory.

## Field deletion inventory
All 69 YAMLs: minutes, exit_reflection, teacher.phase_tag, teacher.teacher_does,
teacher.students_do, teacher.adult_role. Six fields per file, 414 total.
Keep standalone calendar metadata and worksheet/worksheets filename metadata.
Rewrite 14 stock first_take_note values to:
Ungraded commitment; accept any evidence-based first impression.

## Forbidden phrases and hand edits
Exact case-insensitive substrings (shared JSON list):
video; rules box; follow-along; scan the code; QR code; before we discuss; before the discussion; after the discussion; at minute; at the bell; turn in one sheet; Explore (; Do Now; class period; in class.
Parsed YAML/registry field-value occurrences before: 365.
Codemod preview remaining hits: 0, on 0 lines. No phrase-removal hand edits needed.
Per-part audit found six sheets requiring normal-area lookup additions:
5.2, 5.7, 5.8, 6.5, 6.6, 6.11. Keep every ask and all original content.
Also remove the standalone YAML comment's obsolete full-period finish-window copy.

## Previous blocking section resolved
Minutes: and min) are removed from the guard and section 6 check. Problem data
and unit labels remain unchanged. Any future phrase collision with protected
problem data requires dropping that phrase from the guard, never editing the problem.
No remaining preflight phrase contradiction. GitNexus index refresh is running
before existing-symbol impact analysis and edits.

## Verification
Run generator --validate, requested five-file Vitest suite, all dok-*.test.js,
pytest tests/test_dok_build.py -q, root npm test (compare failure names with baseline),
section 6 grep, all emitted-text guards, all student PDF page counts, protected-content
comparison, 207 PDF rebuild inventory, and verbatim 1.4+1.5 student page 2 extraction.
Run GitNexus detect_changes before each commit; never push.
