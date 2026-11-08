# State machine history audit and recommended next actions

Follow-up: [STATE_MACHINE_MAP.md](STATE_MACHINE_MAP.md) rechecks this audit against the 2026-11-08 working tree and records implemented fixes and remaining issues. This report preserves the original 2026-11-07 evidence; its unresolved status and WIP labels are historical.

The highest-value problems are at boundaries between **identity, asynchronous work, durable storage, and lifecycle ownership**. Most do not require an actor framework or a broad rewrite. They need narrowly defined invariants, guards at the actual write boundary, and tests that control the order in which operations complete.

This audit expands the roadmap inventory into shared clients, server routes and database operations, worksheet grading, mobile video, classroom and game clients, and the local relay they use. It combines a repository-wide survey with deeper investigation of consequential workflows. It does not claim every runtime state in every copied worksheet, native plugin, campaign engine or external deployment has been exhausted.

Baseline: `follow-alongs` branch `master`, HEAD `084d953ab8640259ff337ed6012f1707b65c68f2`, inspected on 2026-11-07 with substantial pre-existing uncommitted flashcard/grading work. The local relay comparison uses sibling `curriculum_render` HEAD `f83cbe4`; deployed parity was not checked. Findings distinguish committed behavior from WIP. Only reports and an isolated reproduction harness were added; no application implementation was changed or committed.

**How to read the findings**

“Confirmed” means the current source exhibited the stated behavior in a controlled reproduction. It does not mean a production incident was observed. P1 means address before relying on that workflow's correctness; P2 means a narrower defect or policy decision worth scheduling. Priority reflects impact, reachable trigger conditions and confidence, not the size of the eventual fix. Detailed reports include exact source anchors, histories, counterexample outputs, tests, and limits.

## Prioritized decisions

| Priority | Finding | Trigger and consequence | Next action and evidence |
| --- | --- | --- | --- |
| P1 | A failed write can be queued as the next student | A's request fails after the shared session changes to B; queue capture reads B's current ID and keeps A's answer. Replay then sees a superficially valid B-owned record. | Snapshot immutable ownership before the first await and preserve it across every delivery path. Identity report **IS-1**. |
| P1 | Correctly owned outbox rows can erase another student's work | A and B save the same source/item/attempt on a shared browser. The queue key omits student ID, so B replaces A before either replays. | Add owner to durable and in-memory keys with a non-destructive migration for existing queued work. **IS-2**. |
| P1 | Old grade responses can populate a new student's caches and completion latches | A's grade request resolves after switching to B and resetting state. Its data is applied under B's current identity, including persistent completion evidence. | Reject an obsolete request before any state, cache, latch or rendering mutation. Learning report **L1**. |
| P1 | Alias migration can union a previous roster student's marks into the next account | Sign-in passes the previous legacy identity to migration without proving both identities represent the same person. | Limit aliases to verified aliases of one student; test real account changes separately from legacy-key migration. Learning report **L2**. |
| P1 | Password-change completion can undo sign-out or an account switch | A's pending password response writes captured session A after another tab has replaced it with B or signed out. | Apply the existing refresh path's identity/token validation to password-change completion. **IS-4**. |
| P1 | My Progress displays the previous student's answers under the new student's name | A's Quiz Answers request resolves after actual logout/login as B; tab equality passes, so A's data repopulates B's visible body and cache. | Guard caching and painting by identity/session generation, including destroy/reopen. Supporting report **R1**. |
| P1 | Per-item send serialization breaks with three overlapping writes | A finishes while B waits; A deletes B's chain entry. C starts alongside B, permitting an older answer to finish last. | Delete only the completing operation's own chain entry. Test A/B/C, failures and owner changes. **IS-3**. |
| P1 WIP | New deck best-score handling is not atomic | Two writers both read the old floor; 100 writes first, then 60 overwrites it. Both requests succeed. | Make the floor decision and update atomic and bind the receipt to the resulting score. Test actual SQL concurrency before release. **IS-6**. This is not asserted to be deployed. |
| P1 | Timed flashcard completion can report a save that failed | A local persistence failure is caught by a lower helper, but the caller still reports success/updates displayed best score. Current resume lifecycle compounds the recovery consequence. | Propagate persistence failure and retain a retryable finished result until durable acceptance; reconcile this with the new spec's clear-at-finish rule. Learning report **L3**. |
| P1 | Rematch cleanup deletes the newly created relay room | Relay rebinds sockets to R2, then the client sends an old-room leave for R1; relay ignores the supplied room ID and removes current R2. | Define teardown ownership across the real client/relay protocol and test emitted packets through both sides. Classroom report **CG-1**; local relay revision confirmed, deployment unverified. |
| P2 | Password change postpones local expiry without renewing the token | Client resets session age, server returns the same token, and refresh scheduling incorrectly assumes another 30 days. | Preserve original age or explicitly renew the server token. Test a real token near expiry; revise the existing misleading test contract. **IS-5**. |
| P2 | Delayed AI blank feedback can validate edited text | The AI judged the previous answer, but completion reads/applies feedback to newly edited input. | Bind feedback, visual acceptance and recorded response to the submitted value/version. Official keyed scoring has a mitigating recomputation path; do not call this an unrestricted grade exploit. Learning report **L4**. |
| P2 | Rapid same-type level restart retains the prior level definition | Level B starts before A's 2.5-second disposal; type remains `level`, so the renderer survives with A's definition. | Track activity-instance identity or fully replace the level definition. **CG-2**. |
| P2 | A stale invitation timeout clears a new invitation to the same person | Decline A, retry the same target, then A's old timer sees the same username and clears invitation B early. | Use a per-invitation generation and cancel timers on terminal transitions. **CG-3**. |
| P2 conditional | Empty video is accepted as downloaded | Known positive catalog size plus stored zero-byte file skips the positive-only mismatch check, then is counted/downloaded and skipped on retry. | Distinguish unknown size from zero; reject/delete integrity failures. Supporting report **R2**, applicable to the Play-build path. |

Detailed evidence:

- `Identity, offline writes and wallet lifecycle` (local evidence file, not published)
- `Learning, grades, completion and worksheet lifecycle` (local evidence file, not published)
- `Classroom, game and relay lifecycle` (local evidence file, not published)
- `Supporting UI, video and operational lifecycle` (local evidence file, not published)
- `Runnable isolated Progress and video reproductions` (local evidence file, not published)
- [Earlier roadmap state inventory](IMPLICIT_STATE_MACHINES_AUDIT.md), retained as the breadth baseline; its older line numbers and observations must be read alongside this audit and current WIP.

## What history tells us the app is trying to guarantee

| Intended guarantee | Historical evidence | What the audit changes |
| --- | --- | --- |
| Work belongs to its original student through offline capture and replay | [OFFLINE_MODE_SPEC.md](OFFLINE_MODE_SPEC.md) specifies student-inclusive server keys; `1c3e867a` adds queued-owner checks; `772a26af` addresses durable progress/reset recovery. | Owner checks at replay are insufficient if ownership was captured late or the browser's deduplication key already erased another student's record. Identity must be part of the whole operation. |
| Older writes must not overwrite newer accepted intent | `4e135f5d` introduces send chains and transport sequencing; authoritative FRQ gets atomic SQL transitions. | A client chain's cleanup must respect the current tail. Separate tabs/devices also need server-side concurrency control. |
| Active students should not be unexpectedly signed out, without clobbering a newer session | `13c70261` preserves the token after password changes; `1c3e867a` adds elapsed-age expiry; `8a86fdef` adds guarded sliding refresh. | These individually reasonable rules conflict when password change resets age without a new token. Test the combined contract, not each helper's preferred outcome. |
| A rematch should retire the previous match while preserving compatibility | `03f67bc8` adds old-room cleanup; relay `6c13e344` predates it; [TETRIS_POLISH_SPEC.md](TETRIS_POLISH_SPEC.md) records compatibility constraints. | Message-shape tests missed that the receiver interprets leave differently. Integration tests must execute the receiving transition. |
| Completed downloads must be usable and incomplete files must not be advertised | `1dd2204e` explicitly adds size verification and atomic staging as review fixes. | Atomic staging does not validate length, and a zero-byte success is still a size mismatch. |

Commit messages were checked against pertinent diffs and tests. A later extraction commit is not treated as the introduction of unchanged behavior. Historical specs are evidence of intent; they do not override newer requirements or authorize a guessed implementation change.

## Decisions that should not be disguised as bug fixes

- **Below-80 flashcard results:** saving every useful result is intentional. The earlier inventory's completion concern needs a precise distinction between recording a score and declaring a lesson complete. Current WIP adds per-day deck slices and changes related behavior. Treat unresolved display semantics as a rule/documentation decision with tests, not a reason to discard lower-scoring work.
- **Disabling stakes with escrow already open:** confirmed behavior is that disabling also prevents resolve/refund recovery. History promises timeout refunds and provides a kill switch without resolving whether it means stop-new or freeze-all. Decide that policy, then test enabled → escrowed → disabled → timeout. Identity report **IS-7** describes the existing behavior; it is not counted above as an unconditional defect.
- **Review restoration after a total wipe:** signed review marks may not reattach to regenerated ledger IDs. The introducing `44b13e27` already documented this, while the specification makes a broader durability promise. Schedule a throwaway recovery drill and choose an ID mapping/preservation strategy or narrow the documented guarantee.
- **Cached numbers while grades are unavailable, monotonic completion latches, and retained expired identity:** these are intentional resilience choices. Do not collapse them into a single “online/saved/done” state.
- **Revised FRQ appeals retaining original answer binding, expired-but-unreclaimed worker completion, and unknown job-health tiles after restart:** each has explicit source/history support. No new defect was established simply from those choices.

## Obsolete behavior and deletion candidates

| Candidate | History and current reachability | Safe next step |
| --- | --- | --- |
| Sequential prerequisite lock | `1e2d6178` explicitly allows lesson access without completing prerequisites. `_isLessonUnlocked()` always returns true; surrounding old locking language remains. | Correct stale comments and clarify unlock/override UI purpose. Do not remove teacher override endpoints solely because this predicate is bypassed. |
| Year switching | `52ac6a77` intentionally collapses to one calendar; `cycleYear()` is a no-op retained for residual callers. | Remove misleading UI/docs or retain a clearly documented compatibility shim; inspect callers before deleting the symbol. |
| Inline nightly-review surface | `b023ff9e` redirects `openNightlyReview()` to the shared teacher workspace's recent view. Old inline painters and mutation helpers remain. | Audit the actual DOM/event/global entry points and tests before deletion. Server review/history functionality is still a separate live concern. |
| Old quick-check flashcard engine | Normal entry goes to the timed deck; shared DOM/teardown and test-facing globals still exist. | Candidate for a separate extraction/removal task after shared dependencies and migration requirements are resolved. Dormant normal entry is not proof of universal unreachability. |
| Study Break RTC setup and best-of-three comments | Active match start disables RTC and uses the presence websocket. One win is intentional; a test still exercises configurable longer series. | Update obsolete default/protocol descriptions. Do not mistake RTC tests for coverage of the live relay; preserve intentional configuration tests. |
| Completed Schoology column rename tooling | CED migration `d15952c3`, completion `8f395e81`; in-progress and interrupted-run recovery paths remain tested. | Keep operator recovery tooling unless its owner explicitly retires it. “Migration completed” alone is insufficient evidence for deletion. |

## Recommended work order

1. **Establish identity boundaries.** Address owner capture, outbox keys, alias migration, stale grade/progress callbacks and stale password-change completion together with shared transition tests. Queue-key changes require a migration that preserves unsent work. Do not clear local storage as a repair.
2. **Establish write and save guarantees.** Fix send-tail ownership, make the WIP server score floor atomic, and propagate explicit persistence outcomes through flashcard completion. Require tests with controlled completion order, not just sequential examples.
3. **Test both sides of lifecycle handoffs.** Add a client-plus-relay rematch scenario, same-type activity replacement, and invitation generations. Preserve deliberate legacy compatibility while correcting the actual ownership mismatch.
4. **Resolve policy and documentation gaps.** Specify score-versus-completion semantics, escrow disable behavior and disaster-recovery promises. Then remove obsolete descriptions and separately review deletion candidates.

A useful transition-test matrix crosses operation state (idle/in-flight/retrying/terminal) with identity change, close/reopen, reconnect, duplicate event, old response after a new response, and two independent writers. Assertion targets should include durable state and attribution, not only visible text or that a particular helper was called.

## Verification and limitations

Across the recorded targeted runs, **986 existing tests passed** while controlled reproductions exposed the cases above. Passing tests here demonstrate missing transition coverage, not overall application correctness. Detailed commands and per-suite totals are recorded in the domain reports. Some tests are textual integration pins; those cannot establish behavior of the actual sender/receiver pair. Audit reproductions that assert the observed bug are diagnostic evidence, not permanent regression tests expected to stay green after a fix.

No full-suite certification, deployed browser/relay session, production database mutation, or live recovery operation was performed. Cross-repository findings apply to the inspected local revisions. Source fingerprints and baseline metadata are recorded in `state/history-audit-manifest.json` (local evidence file, not published) so subsequent changes can be distinguished from the reviewed snapshot.
