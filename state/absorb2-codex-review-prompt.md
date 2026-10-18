Adversarial code review (read-only; do not edit files). Model: gpt-6-astra.

Spec: APSTAT_PARK_TRAINER_ABSORB_2_SPEC.md (read it fully). Context specs: APSTAT_PARK_TRAINER_ABSORB_SPEC.md, APSTAT_PARK_CALCULATOR_FLUENCY_SPEC.md.
Diffs under review (uncommitted work in two repos, protocol 16 -> 17):
- state/absorb2-client.diff  (this repo: apstat-park/*, the Desk ap_stats_roadmap_square_mode.html, pico-home.js, tests)
- state/absorb2-relay.diff   (../curriculum_render/railway-server/apstat-park/*, server.js)
You may read any file in either repo for context.

Review for: correctness against the spec; round-flow bugs (epoch/reset handling, branch stack, solo vs team, time-up inside a branch, reconnect); protocol/compat (older client packets, older relay packets, byte-identical shared modules between apstat-park/ and railway-server/apstat-park/); the clears/rung rule and store writes; the handheld multi-field judging (expected values must never reach the client); data-entry prefix edge cases (negative numbers, decimals, L2 cursor, QUIT, DATA_ENTRY_MAX_KEYS); the progress endpoint (read-only, no room/attempt creation, section vs calendar section); Desk modal (Esc close, no raw old lesson keys printed, XSS via titles); Pico Desk item; test gaps.

Report findings ONLY in your final answer, as a list: SEVERITY (BLOCKER / MAJOR / MINOR) - file:line - what - why - suggested fix. End with a one-line verdict: GREEN / GREEN WITH MINORS / RED.
