# Pico Desk — spec (2026-10-05, draft for teacher review)

Teacher: "there is a large portion of the desk I never use… maybe it's time to clean things up… the
calendar is giving way too much information, in a cramped way… we could learn from the Pico Park menu
system aesthetic which is in the decompile." And: "the goal eventually is to completely supplant the
current desk with consistent Pico Park design language while preserving all the rules, all the
information, presented in a more digestible format."

Purpose: replace the System 7 Desk with a home that looks and behaves like a Pico Park menu scene —
one title, one sign, a few large choices, lots of empty space — without changing a single rule about
lessons, grades, or schedules. This spec covers the whole path; only **Phase 0 (the sketch)** is
approved for building now.

## Principles

1. **Presentation only.** No grade, gate, schedule, or sync rule changes in any phase. The new view
   calls the functions the Desk already has (labels, next-up, open-lesson, missing work, grades).
2. **Nothing is deleted by the redesign.** Every piece of information the Desk shows today gets a
   named new home (see the Preservation ledger). "Fewer things on screen" means "one click deeper",
   never "gone". Removal is a separate decision, made from usage data.
3. **Fewer assets, larger, one scale.** Sprites are drawn at one integer scale with
   `image-rendering: pixelated`. If a screen feels busy, remove a sprite; do not shrink them.
4. **One meaning per mark.** A door, tick, "!" block, flag, and triangle each mean exactly one thing
   everywhere (see the vocabulary table).
5. **Everything clickable and keyboard reachable.** Walking a cat to a door is optional, never
   required. Esc closes any panel. Reduced-motion is honoured.
6. **The old Desk keeps working** until the teacher retires it. No end date is set here.

## What comes from the decompile

Source checkout: `not-school/hermes/old-app/recovered/` (same one `apstat-park/assets/build-atlas.mjs`
already crops from).

| Recovered thing | Where | Used for |
|---|---|---|
| Menu window: thick orange frame, wider top bar, small ✕ top-right, white interior, centred all-caps list, rounded orange outline on the selected item | `tga_carved/tga_0004_0xabaab4.png` | Every panel: lesson, My Grade, OPTION |
| Hand and arrow cursors | same sheet | Hover over anything clickable |
| Signboard on a post (two sizes) | `tga_carved/tga_0002_0x4a1018.png` | The Do Now sign |
| Rounded orange outline frames and small button outlines (orange / pink / blue) | same | Buttons, day positions |
| Large triangle arrows (outline + filled) | same | Week paging |
| Small triangles in nine player colours (outline + filled) | same | "Continue here" marker, in the student's cat colour |
| Open door (black), closed door (tan), key | same | Lesson = open door. Closed door reserved (see vocabulary) |
| Tick box, crown, "!" block, flag, lying-down cat, "z z z", NEW tag | same | Day states |
| Cats, push block, floor tiles, hats | same (already shipped in `apstat-park/assets/pico-1-1.png`) | The floor scene |
| Digit strip and `00:13` timer box | same | Countdown, timers |
| Glyph sheet: a–z, A–Z, 0–9 and `= . - ! ? * + [ ] > < : _` in 64px cells, 16 per row | `tga_carved/tga_0000_0x28cd94.png` | Short headings and labels (see Lettering) |
| Sounds `select`, `select2`, `start`, `clear`, `fanf01` (named in the binary; five others already ship) | `assets_carved/ogg/` — files need matching to names | Menu move / confirm |
| Layout rules: no scrolling, 1.5× scale, one title text, ≤4 top-level choices, 560 of 600 map cells empty, paged select `STAGE SELECT (n/m)` | `lua_archive_sources/stage/stage_title.lua`, `stage_main_menu.lua`; binary strings | Home layout and week paging |

**Do not ship:** the Nintendo Switch logo and controller art, and the game's "PICO PARK" logo. The
title everywhere is **APSTAT PARK**. The site is public and this is a commercial game's artwork, so
the teacher decides how much of the sheet goes on GH Pages; the sketch uses only the rows above.

**Ours, not the game's** (say so in code comments): the five-day strip, the sign's wording, the
top navigation labels, and any lettering that is not the recovered glyph sheet.

## Lettering

- The recovered glyph sheet is a clean monospace gothic. It has no comma, apostrophe, `%`, `/`, or
  parentheses, so it can only carry short labels: `WEEK OF OCT 5`, `MY GRADE`, `WATCH`.
- The thin pixel capitals seen in the menu window (`GO!`, `STOP!`) are a different font
  (`font_famania.tga` by name). That sheet has not been recovered.
- Lesson titles, sign sentences, grades, and explanations are real HTML text in a plain readable
  sans-serif, 16px or larger. Never draw sentences from the glyph sheet.
- Anything drawn from the glyph sheet carries the same words as real text for screen readers.
- The sketch offers both options for headings — recovered glyphs, and plain real text in a system
  font — behind a preview control, so the teacher picks by looking. No font file is downloaded for
  the sketch; choosing a specific open-licence font is a later step if plain text wins.
- The glyph sheet is smooth lettering, not pixel art, so it may be scaled down to label size. The
  one-integer-scale rule applies to the pixel sprites.

## Home screen

One screen, no scrolling at 1366×768 (the classroom Chromebook size) and usable down to phone width.
Top to bottom:

```
 TODAY    LESSONS    MY GRADE    OPTION                    [name]

              ◀   WEEK OF OCT 5  (6/36)   ▶

          ┌──────────────────────────────────────┐
          │ CONTINUE YOUR FOLLOW-ALONG       87  │
          │ 2.4 · Comparing distributions        │
          └───────────────┬──────────────────────┘
                          │
   MON 5     TUE 6     WED 7     THU 8     FRI 9
   [door✓]   [door✓]   [door]▲   [door]    [flag]
   Dotplots  Stemplots Compare   Boxplots  Unit 2 PC

  cats  push block                      park doors ⌂ ⌂ ⌂
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

- **Navigation (4 items, like the game's main menu).** TODAY returns to this week. LESSONS opens the
  week browser and the existing two-week calendar, renamed **Schedule**. MY GRADE opens the ledger.
  OPTION holds sound, password, period, sign out, help, "Use Original Desk", and (teacher only) the
  teacher tools.
- **Week title.** `WEEK OF <date> (n/m)` with the recovered paging arrows. Units are named here
  ("UNIT 2") instead of colouring each day.
- **The sign.** See Sign states.
- **Five day positions.** Each shows three things only: the date, a short lesson name (two or three
  words), and one state mark. Clicking a position opens that day's panel.
- **The floor.** The existing classroom board content: cats, the push block, and the three park
  doors with occupancy. No lobby is added. Clicking a cat opens the existing name/candy/game menu.

### Day vocabulary

| Day kind | Marker | Meaning |
|---|---|---|
| Lesson, not finished | Open door | Available. Every lesson is open (the gate has returned "unlocked" for all lessons since 2026-09-10) |
| Lesson, finished | Open door + tick | Complete |
| Lesson with work that is, or is about to be, a zero | Open door + "!" block | Same rule as today's missing-work corner mark |
| Progress Check | Flag | Taken in AP Classroom |
| Work Day | Push block + the words "WORK DAY" | Catch-up day |
| Break Day / no class for this period / no school | Lying-down cat + "z z z" + the words "NO CLASS" | Nothing scheduled. It does **not** mean nothing is due |
| Review, poster, orientation, baseline, exam | Signboard + its label | Opens whatever it opens today |
| Today | The day's position sits on a raised floor tile | Position only; no colour change |
| Continue here | Small triangle in the student's cat colour | The existing next-up lesson |
| Whole week finished | Crown beside the week title | All assigned activities done. Says nothing about scores |

Reserved, not used on the week strip: the **closed door** (for something truly closed, such as a full
park room) and the **NEW tag** (newly published content only).

### Sign states

The sign shows one next action, one line of context, and the official quarter grade as a separate
clickable number (opens MY GRADE). Wording comes from the existing Do Now and missing-work text; this
spec does not write new grade claims.

| State | Sign shows |
|---|---|
| Caught up | The next activity and its lesson. Quiet: no marks |
| Behind, zero not yet landed | The one activity to do first, the "!" block, the date the zero lands, and a "See all missing work" link |
| Behind, zero landed | Same, with the existing recovery wording instead of the date |
| No class today | "No class today" plus whatever is still unfinished. Unfinished work never disappears from the sign |
| Signed out | "Sign in to see your work" and a sign-in button |
| Grade unavailable | The existing loading / unavailable message in place of the number |

Rules carried over unchanged: the sign may say **when** a grade drops, never **what it drops to**; a
warning uses the "!" block and the sign's border, never a tint over the whole scene; nothing flashes.
The Review deck and the Bulletin do not appear on the sign.

## Home screen, layout B — "stage select" (teacher 2026-10-05: "so many doors!")

Second layout on the same sketch page, behind a `Layout: Doors / Stage select` preview control, so
the two can be compared. Same nav, sign, floor, and data; only the week strip changes.

What the decompile gives (and what is ours):

| Recovered | Evidence | Used for |
|---|---|---|
| The main menu is a carousel: cat above, `◁ LOCAL PLAY MODE ▷`, one item at a time, small outline arrows either side, inside the orange window | runtime capture `browser_port/docs/runtime-observations/steam-input-bridge-results/steam-keybd-event-mainmenu-right-2-live-100-after.png` | The week picker |
| Modes `WORLD / BATTLE / ENDLESS`; stages are one flat paged list `STAGE SELECT (n/m)` with `%u PLAYERS BEST TIME --:--` | `all_strings.txt` | Week counter `(6/36)`; one status line per tile |
| Stage tiles: a mini-scene over an orange platform line; `?` = not yet seen, `✕` beside it | `tga_0002` lower right | The lesson tile frame and the `?` mark |
| Grid spacing and selection on the stage-select screen | **not recovered** (captures never reached it) | Our reconstruction, say so in a comment |

Layout B rules:

- **Week picker** = the carousel: `◁ WEEK OF OCT 5 ▷` in the window's top style with the small outline
  arrows, `(6/36)` beside it. Not the giant arrows.
- **Lesson tiles** = one row of up to five, each the stage-tile form: date above, an orange platform
  line below, the short lesson name under that. Inside the tile sits the day's mark only: nothing for
  not started (the `?` is reserved for a lesson with no published content), tick for done, "!" block
  for missing, flag for PC, push block for Work Day, lying-down cat for no class. No door anywhere on
  the strip. Doors belong only to the park entrances on the floor.
- **Selection** = the orange rounded outline around a tile, starting on the recommended lesson and
  following keyboard/mouse. The coloured triangle marks "continue here" and does not move. Enter or
  click opens the lesson panel.
- **Today** = the tile's platform line is the raised floor tile.
- Everything else (sign, states, floor, panel, vocabulary strip) is shared with layout A.

## Lesson panel

The recovered menu window, large, centred, over a dimmed home.

- Top bar: the day and date. ✕ and Esc close it.
- Title: the full lesson name in readable text, with the unit and CED codes on one smaller line.
- The list: the lesson's real actions, one per line — `WATCH`, `FOLLOW-ALONG`, `QUIZ`, and
  `FLASHCARDS` / calculator skill only where that lesson has them.
- The orange outline is the **selection**: it opens on the recommended action and then follows the
  keyboard or mouse. The coloured triangle is the **recommendation** and does not move.
- Under the list: details for the selected action only (status, score, due date). The 2x badge, poll
  results, and the day's grade (today hidden behind double-click and right-click) become visible
  rows here.

## Phases

| Phase | What ships | Touches the live Desk? |
|---|---|---|
| **0. Sketch** (approved) | `pico-desk-preview.html`: static, fictional data, no sign-in, no network | One new menu item only |
| 1. Live home | The same home fed by real schedule, next-up, missing-work, and grade data; the floor is the real board | Reads only |
| 2. Lesson panel + My Grade | Real lesson actions; ledger redrawn in the recovered window | Reads only |
| 3. Remaining windows | Bulletin, Review, Snapshot, This Week, chat, Study Break, sign-in, help — first inside a plain Pico frame, then redrawn in order of measured use | Reads only |
| 4. Default flip | Pico Desk becomes the page students land on; "Use Original Desk" under OPTION | Yes — separate spec |
| 5. Retire System 7 | Old view removed when the teacher says so | Yes — separate spec |

Teacher tools (workspace, inbox, grade check-in, DOK index) stay as they are until Phase 3 at the
earliest; only the teacher sees them.

### Phase 0 — the sketch (build this)

- **File:** `pico-desk-preview.html` at the repo root. Self-contained, no build step. It makes no
  application-data requests: it must not load `roster-client.js`, read `localStorage` grade keys,
  or call either Railway server. Its own art and any font file are served from this repo; no
  external font service.
- **No locks.** Every lesson door in the sketch is open, matching the live gate. The sketch must
  not show a prerequisite lock anywhere.
- **Size:** the home fits without scrolling at 1366×768. Smaller screens and browser zoom may
  scroll; text is never shrunk to avoid it.
- **Click targets:** the recovered ✕ is drawn at its own size inside a target of at least 44×44
  CSS pixels. The same minimum applies to every door, arrow, and list item.
- **Art:** a new cropped atlas beside the existing one (`apstat-park/assets/`), produced by the same
  kind of dev script as `build-atlas.mjs`, containing only the sprites this spec names. Commit the
  PNG before any page references it.
- **Screens:** the home, and the lesson panel opened by clicking any lesson door.
- **Preview controls**, in a clearly labelled strip that is obviously not part of the design:
  - State: `Caught up` / `Behind` / `No class today`
  - Lettering: `Recovered glyphs` / `Plain text`
  - Layout: `Doors` / `Stage select` (layout B above)
- **Data:** fictional names, lessons, and grades, with a visible "Example data" note. No real student
  information.
- **Behind state stays honest.** A zero lands 13 days after the class day, so the overdue lesson is
  from an earlier week and is not on this week's strip. The sign's action opens that lesson's panel
  directly, and the strip shows no "continue here" triangle (the real next-up lesson is the overdue
  one).
- **Vocabulary strip.** Inside the preview controls, one row shows every marker from the Day
  vocabulary table once, with its meaning, so marks that no example week contains (door + "!",
  Work Day, crown) can still be judged.
- **Entry:** one item, `Pico Desk Preview…`, at the bottom of the Desk's **View** menu, visible to
  students and the teacher, opening the page in a new tab. The page is headed
  `Preview · Example data` and has a `Back to the Desk` link. Nobody's default Desk changes. Run
  `scripts/bump-build.mjs` before that Desk push.
- **Grade on the sign:** always visible, for every example student, matching today's pill.
- **Not in the sketch:** real data, cat speech, lesson thumbnails, My Grade, sounds, the usage
  report, any change to the calendar.
- **Tests:** one jsdom test — each state renders five day positions and a non-empty sign; the
  lesson panel opens and closes with Esc; the page contains no fetch to a Railway host.
- **Ready for review when:** the page is built, the test passes, and an independent review is green.
- **Approved when:** the teacher has looked at all three states at classroom size and says so. Only
  that approval starts Phase 1.

## Usage report (runs alongside, separate build)

Before anything is removed or moved off the top level: extend `bumpUsage` to cover every entry
point (menus, icons, sign buttons), and send batched **feature counts only** for two weeks. No
per-student browsing history. Low use argues for moving a tool deeper, not for deleting it. This
needs a small roster-server endpoint, so it gets its own spec.

Removable without data, on the old Desk, whenever the teacher likes: the five joke menu items, and
the duplicate entries for My Ledger, Change Password, Start Here, and Message teacher.

## Preservation ledger

Every current Desk surface and where it lives in the Pico Desk. This table is the contract for "all
the information is preserved"; a row may not be dropped without the teacher saying so. Rows marked
**audit** were not traced line by line for this draft and must be confirmed before Phase 1.

| Today | Pico Desk home |
|---|---|
| Do Now message, zero tints | The sign |
| Quarter pills (Q1–Q4, official grade, "Today's estimate") | MY GRADE; the current quarter's official grade on the sign |
| Missing-work pill and card | "!" block on the sign and on the day; full list in MY GRADE |
| Bonus banked line, grade status banner | MY GRADE; status banner also replaces the sign's number |
| "Why so low?" coach | MY GRADE |
| "Today's calculator skill" chip | Lesson panel action |
| Calendar cell: date, label | Day position |
| Calendar cell: unit colour, legend | Week title names the unit; Schedule keeps colours |
| Calendar cell: done / in-progress marks | Tick; in-progress shown in the lesson panel |
| Calendar cell: next-up glow | Coloured triangle |
| Calendar cell: 2x badge, due date, poll dot, tooltip | Lesson panel rows |
| Calendar cell: double-click / right-click day grade | Lesson panel row |
| Two-week grid, quarter bands, prev / today / next | LESSONS → Schedule (unchanged calendar) |
| Countdown boxes (today, days to exam, school days, exam day) | One "days to exam" label by the week title; the rest in Schedule |
| Period B / E toggle | OPTION (and automatic from sign-in, as now) |
| Unit Progress bar | LESSONS |
| Info bar (session count, year, school) | Schedule |
| Classroom board, park doors, occupancy, polls, Live Classroom overlays | The floor (**audit** each overlay) |
| Doge presence menu, challenges, candy, Study Break | Click a cat; challenge alerts still reach every screen (**audit**) |
| My Ledger | MY GRADE |
| Class Snapshot | Inside MY GRADE ("See the class"), as today |
| Bulletin, Review, This Week | LESSONS, each with its existing badge |
| TI-84 Trainer, AP Stats Quiz, Formula Lab, Formula Defense | LESSONS → Practice |
| Start Here, All Worksheets, Study Guide, Phone Launcher | OPTION → Help |
| Message teacher, unread badge | OPTION → Help, with the badge shown on OPTION |
| Sign in / out, change password, sound, install app, About | OPTION |
| Teacher menu, Teacher Inbox icon, grade check-in banner, preview-as-student | OPTION → Teacher (teacher only) |
| Resource panel contents, sign-in and signup dialogs, lesson timers, Done buttons | **audit** |

## Out of scope for this spec

- Any change to grading, zero dates, gates, schedules, Schoology sync, or roster-server.
- Worksheets, the quiz app, and the trainers themselves — only how the Desk opens them.
- `mobile-home.html`.

## Open questions for the teacher

1. ~~Lettering~~ — **settled 2026-10-05: plain text.** The recovered glyph sheet is dropped from the
   design; the sketch keeps the glyph option only until the teacher says to remove it.
   **Layout — settled 2026-10-05: stage select (layout B).** Layout A (doors) is no longer the
   direction; its door sprites stay reserved for the park entrances on the floor.
3. When a student is behind, should the home open on this week (as the sketch does) or on the
   overdue lesson's week (as today's calendar does)?
2. ~~Artwork~~ — **settled 2026-10-05: all of the game's art may be used** (still never the
   Switch logo, controller art, or the PICO PARK logo).
   **Behind — settled 2026-10-05: always open on this week, centred on today.** The ledger (MY GRADE)
   is the route to overdue work; the sign's "Open" button stays as the shortcut. Teacher: adapt the
   ledger's form into the menu system — that is Phase 2 (My Grade in the recovered window).
   **Sign "Open" button on every state — settled: keep.**
   **Cat above the week picker — settled: no cat** (teacher reversed this the same evening).

Settled 2026-10-05: the grade stays always visible on the sign (a "hide my grade" preference, if
ever added, applies to everyone equally); the preview link sits in the View menu for students too.
