Follow-up adversarial review (read-only; do not edit files). Model: gpt-6-astra.
Your first pass (state/absorb2-codex-review.out, answer field) returned RED with 2 MAJOR + 2 MINOR findings on APSTAT_PARK_TRAINER_ABSORB_2_SPEC.md's implementation. The diffs have been updated: state/absorb2-client.diff and state/absorb2-relay.diff (relay = ../curriculum_render/railway-server).
Fixes made:
1. MAJOR handheld reload: apstat-park/calculator-room.mjs markHandheldInputs now locks a matched box only while it holds its value (`input.disabled = matched && input.value !== ''`); new test in apstat-park/calculator-handheld.test.mjs.
2. MAJOR branch credit vs unloaded SRS: srs-state and clears gained `loaded(section)`; recordBranchReview returns early while !srs.loaded(section); new test in railway-server/apstat-park/calculator-branch.test.mjs.
3. MINOR progress before load: service.progress returns `loading: true` while either store has not answered; the Desk does not cache a loading answer and re-fetches after 2.5 s while the modal is open; new test in calculator-progress.test.mjs.
4. MINOR explicit leave keeping the stack 30 s: DECLINED by design (a reload inside the solo room's 30 s retention resumes the branch like any round in progress); spec §1 wording updated.
Verify each fix is correct and complete, look for regressions the fixes introduce, and re-check anything you did not reach last time. Report findings ONLY in your final answer as: SEVERITY - file:line - what - why - fix. End with one line: GREEN / GREEN WITH MINORS / RED.
