# Part A plan

1. Refresh GitNexus once; if it fails or exceeds ten minutes use the authorized caller-inventory fallback. Record upstream impacts before symbol edits.
2. A1: replace only generateSchedule placement; bake VIDEO_MINUTES with deterministic builder/check; extract it in schedule builder; rename and extend real-generator tests. Preserve pacing, B, group consumers and built DOK sheets.
3. A2: regenerate both schedule files; update expected E dates and eleven pending DOK pairs; verify exact thirteen-row fixture, B byte identity and endpoints.
4. Run focused Vitest, both builder checks, root npm test, roster-server npm test and pytest tests/. List known environment failures by name. Run detect_changes before each commit, stage only owned Desk hunks with git add -p, never push.

Blast radii: current analysis pending. Previous generateSchedule analysis: LOW, direct caller loadYear, two upstream symbols, calendar loading processes. Extracted generator test harnesses and schedule builder also consume it (due dates and Schoology fixtures). Existing test helper generated must load the constant; its direct consumer is the test module. No completion-gate changes.

Pre-edit analysis: node .gitnexus/run.cjs analyze failed with EPERM opening C:/Users/rober/.gitnexus/registry.json.tmp. impact upstream for generateSchedule, generated and createDesk was attempted; database locked during rebuild. Authorized fallback: git grep inventories show generateSchedule -> loadYear (two call sites), schedule builder and four extracted test harnesses. Prior graph: LOW, 1 direct caller, 2 upstream symbols, loadYear calendar processes. generated -> module initializer only (LOW). createDesk -> local calendar test cases only (LOW). New builders/test callbacks have no production callers. Builder extraction is top-level; existing extractor functions unchanged. No other existing functions modified in A.

A1 focused verification: 27/27 pairing and video tests passed, including the exact table, cap/lag/weekly guards, B byte identity and unchanged group consumers. Builder produced E PC Day 2 March 15 and review end March 22.
