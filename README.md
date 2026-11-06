# AP Statistics classroom platform

This repository serves The Desk, lesson worksheets, student study tools, teacher tools, and APStat Park. It also contains the roster and gradebook API. Most browser entry points are static HTML with shared JavaScript; `roster-server/` is a separately deployed Node service.

## Find the right entry point

| Area | Start here |
| --- | --- |
| Student desktop and calendar | [ap_stats_roadmap_square_mode.html](ap_stats_roadmap_square_mode.html), extracted features in [js/](js/) |
| Mobile student home | [mobile-home.html](mobile-home.html) |
| Lesson worksheets | [TOC.html](TOC.html), root `u*_lesson*_live.html`, corresponding `ai-grading-prompts-*.js` |
| Adaptive study guide | [study_guide_diagnostic.html](study_guide_diagnostic.html), [lib/](lib/), [data/](data/) |
| Teacher workspace | [teacher-dashboard.html](teacher-dashboard.html), [teacher-classroom.html](teacher-classroom.html), [teacher-roster-console.html](teacher-roster-console.html) |
| Authentication, ledger, grades and class APIs | [roster-server/server.js](roster-server/server.js), [roster-server/](roster-server/) |
| Calculator room and multiplayer park | [apstat-park/README.md](apstat-park/README.md) |
| Offline Android app | [android-app/](android-app/), [ANDROID_PACKET_APP_SPEC.md](ANDROID_PACKET_APP_SPEC.md) |

The public filenames are existing links used by students and other services. Keep those URLs stable while moving implementation into smaller modules.

## Sources and generated copies

Read the relevant builder before regenerating an artifact. Some older builders remain for historical inputs and do not produce the current school-year data.

| Change | Source and update path |
| --- | --- |
| Grade calculations | Edit the canonical modules in `roster-server/`, including `grade.js`, `lesson-grade.js`, `gradebook-grid.js`, `scoring.js` and `grade-config.js`. Run `node scripts/build-grade-engine.mjs` to regenerate `grade-engine.bundle.js`; the bundle parity tests compare browser and server results. |
| SY26-27 lesson dates | Calendar definitions and pacing in the Desk feed `node scripts/build-lesson-schedule-sy2627.mjs`. It writes both `data/lesson-schedule.json` and `roster-server/data/lesson-schedule.json`. Use `--check` to detect drift without writing. The older `build-lesson-schedule.mjs` uses superseded roadmap dates. |
| Lesson resource URLs | `roadmap-data.json` supplies baked defaults; Supabase `lesson_urls` overrides them at runtime. Check the live overlay when a URL change in the file does not appear in the Desk. |
| CED labels and crosswalk | Edit `2026-crosswalk.json` and `lib/ced-label.*`. `node scripts/sync-ced-crosswalk.mjs` regenerates browser label data and copies the canonical files into the server and sibling curriculum checkout. Keep persisted lesson IDs unchanged. |
| Do Now work ordering | `build-work-manifest.mjs` refreshes the frozen nine-unit source in `scripts/fixtures/`. `build-work-manifest-ced.mjs` transforms that source using `2026-crosswalk.json`; its `--deploy` option writes both live `work-manifest.json` copies under `data/` and `roster-server/data/`. |
| Quiz answer key | `scripts/build-answer-key.mjs` reads the sibling curriculum bank and writes root and server `answer-key.json` copies. |
| Worksheet blank answer key | `scripts/build-worksheet-key.mjs` reads live worksheet HTML and writes root and server `worksheet-key.json` copies. |
| Shared offline queue | Root `offline-queue.js` is canonical. `scripts/sync-offline-queue.mjs` copies it and its shared behavior tests to the sibling `curriculum_render` checkout. |
| Shared park and calculator code | `scripts/sync-park-calculator.mjs` copies the files selected by `scripts/park-shared-modules.json` and the native calculator manifest into the sibling relay. |
| GitNexus inline-script index | `node scripts/gitnexus-shadow.mjs` derives `gitnexus-shadow/` from HTML apps. Edit the original HTML, then regenerate the shadow. |

The server deploy uses `roster-server/` as its root, so it needs its own data copies. A root data update alone does not update the deployed API. The sync scripts above write into another checkout; review and release those changes in that repository as well.

Lesson IDs, worksheet item IDs, usernames, storage keys and ledger schemas connect saved student work across these surfaces. A display-label change does not imply an ID migration. Preserve those contracts during extraction; see [types/contracts.js](types/contracts.js) and the relevant tests.

## Local development and checks

CI uses Node 22. Install both dependency trees from the repository root:

```sh
npm ci
npm --prefix roster-server ci
```

Serve the repository root with an HTTP static server, for example `python -m http.server 8000` if Python is installed. Open `/ap_stats_roadmap_square_mode.html` or another entry point. On localhost with a port, `roster_config.js` defaults to the API at `http://localhost:8091`; configure and start that service using [roster-server/README.md](roster-server/README.md) and its environment settings.

| Command from repository root | Scope |
| --- | --- |
| `npm run test:quick` | Selected grade-engine, Desk and contract checks for the edit loop; requires the server dependencies too. |
| `npm test` | Root Vitest suites in `tests/` and `lib/`. |
| `npm --prefix roster-server test` | Server Vitest suite. |
| `npm run test:park` | Park's Node test runner; these tests are outside the root Vitest include list. |
| `npm run typecheck` | Browser JavaScript allowlist in `tsconfig.json`. |
| `npm --prefix roster-server run typecheck` | Server typecheck allowlist. |

The quick suite supplements the full root and server release checks. Typechecking covers selected files, not the whole repository. For an extraction, also open the actual affected HTML page and exercise the feature; many tests inspect source or run code in a simulated browser.

Some checks and builders require neighboring repositories:

- `../curriculum_render/` supplies the quiz bank, relay and mirrored shared modules. Park integration tests also need that relay's dependencies. [ci.yml](.github/workflows/ci.yml) records the checkout layout and installations used in CI.
- `npm run pull-summaries` requires `../algebra2-live-worksheet/scripts/pull-class-summaries.mjs`.
- Rebuilding recovered park campaign assets requires the external browser-port sources described in [apstat-park/README.md](apstat-park/README.md).

## Continue the existing extraction pattern

Desk features already live in `js/desk-calendar.js`, `js/desk-class-log.js`, `js/desk-progress-app.js`, `js/desk-study-break.js`, `js/desk-gradebook-grid.js` and `js/desk-park-bridge.js`. These are classic scripts that share the Desk's globals and depend on script order. Moving another feature out should preserve its initialization order, public handlers and state behavior before changing its internal API.

[js/desk-missing-work.js](js/desk-missing-work.js) is a smaller boundary: its `DeskMissingWork` API takes lessons, period, date and warning-window inputs explicitly, without reading the DOM, storage or network. The Desk keeps its existing caller functions and rendering. Pre-extraction snapshots pin the calculations, and integration tests load the real page in both Desk skins and check service-worker caching.

Follow [AGENTS.md](AGENTS.md): query unfamiliar execution flows with GitNexus, run upstream impact analysis before editing a symbol, and run `detect_changes()` before committing. Inline HTML symbols are indexed through the generated shadows. A file move alone does not remove its runtime dependencies.

## Release boundaries

- [pages.yml](.github/workflows/pages.yml) publishes the repository root as a static site on pushes to `master`. [vercel.json](vercel.json) also serves static files and redirects `/` to `mobile-home.html`.
- [ci.yml](.github/workflows/ci.yml) runs tests and typechecks separately from Pages deployment. A failed CI run does not automatically stop that deployment workflow.
- The roster API, sibling relay and Android package have separate deployment or packaging steps. A Pages publish does not deploy them.
- Before publishing a Desk change, `node scripts/bump-build.mjs` coordinates the Desk stamp, extracted script versions, `version.json`, `sw.js` and `worksheet-diagnostics.js`. Include its related changes together so cached clients receive a consistent version.

Keep a maintenance refactor limited to its affected release surfaces. Use the builders and parity checks to carry intentional shared changes across boundaries.
