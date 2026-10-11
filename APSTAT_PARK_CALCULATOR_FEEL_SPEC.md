# APStat Park calculator activities: real screen, Pico feel (spec)

Status: 2026-10-11 — all built: A shipped; B1+B2, B3 (revised, see below) and B4+B5 committed, awaiting the push go.

Teacher's brief (2026-10-11): keep the activities as they are ("currently pretty good"), make the screen show the
same menu geometry as the real TI-84 CE but in Pico colours — not green and black — and make the keypresses more
responsive and more Pico Park.

## 0. What exists (so the scope is honest)

- The **keypad is already physical**: `KEYS` in `apstat-park/calculator-mission.mjs` is the TI-84 CE's 11×5 grid
  (`Y= WINDOW ZOOM TRACE GRAPH` on top, `ON 0 . (−) ENTER` at the bottom, the arrow diamond right of `STAT`).
  Students already walk the real key path. **No tile moves in this spec.**
- Every press is verified against the real native engine (`calculator-engine.mjs` replays the route and
  fingerprints the screen), so correctness is not touched here.
- The **screen** is `calculator-display.mjs`: it flattens the engine's render payloads to text lines, drawn at
  `x 28, y 106`, 18 px apart in `calculator-room.mjs` ("no bezel or LCD background"). Correct content, wrong shape.
- The trainer already has the real screen: `ti84-trainer-v2/native/screen-renderer.js` (`TI84ScreenRenderer`)
  renders the CE's 320×240 LCD — 26 columns × 10 rows, menu tabs, `►` cursor, inverse-video selection, `▼` scroll
  indicator, 2nd/ALPHA flag, TRACE readouts. It hard-codes the LCD palette (`#C6D8A0` on black) and
  `12px monospace`. The park loads these native scripts already (`nativeScriptFilenames`), it just does not use
  the renderer.
- Shared-with-relay modules (`calculator-mission.mjs`, `calculator-curriculum.mjs`, `calculator-lobby.mjs`) must
  stay byte-identical with `curriculum_render/railway-server/apstat-park/`. Protocol is `CALCULATOR_PROTOCOL = 9`.

## A. The real screen, Pico-coloured

1. `screen-renderer.js` gains an **options** argument (additive, default = today's LCD look so the trainer is
   unchanged): `{ bg, fg, invertBg, invertFg, font }`. Nothing else in the renderer changes — same geometry,
   same rows/cols, same cursor and inverse rows.
2. `calculator-display.mjs` keeps its current line-flattening (it is what the tests and the relay-side
   interpretation use) **and** additionally forwards every render payload to a `TI84ScreenRenderer` drawing on an
   offscreen 320×240 canvas when one is given (`createWorldDisplay({ traceLabel, screen })`). No renderer in tests →
   behaviour exactly as today.
3. `calculator-room.mjs` blits that canvas at 1:1 into the entry panel at `x 28, y 103` (where the lines are now;
   the right-hand status column starts at 350, so 320 wide fits), drawn as a Pico prop: a 2 px ink outline, no
   bezel, no gloss, corners square. Palette from the song/level palette already in the room: `bg` = the panel's
   paper tone (today's `#d5c5ae` family, or `palette.hud`), `fg` = `ink`, inverse rows = `ink` on paper swapped.
   Font = the park's `pixel-text` face at the renderer's 12 px cell so the glyph grid still gives 26 columns.
4. The 2nd (blue) / ALPHA (green) flag the CE shows in the top-right of the screen is kept, in Pico's blue and
   green, and is the same colour the keypad tints in B2.
5. The boxplot/dotplot/interpretation challenge drawings (`calculator-challenge-view.mjs`) are untouched; when the
   challenge shows, the screen canvas shows the engine's result screen above it exactly as the CE does after
   `1-Var Stats` (the five-number summary scrolled with `▼`).

Out of scope: the 96×64 monochrome look of the older TI-84 Plus — the students' calculators are CEs.

## B. Feel

### B1. Keycaps (client only)
Tiles are drawn as keycaps instead of flat platforms: 2 px ink outline, a 3 px darker base so they read as raised,
label in the pixel font. Colour groups follow the CE: `2ND` blue, `ALPHA` green, `ENTER`/digits/operators light,
the top `Y=…GRAPH` row dark, `ON` the same light tone. Above each key, the small blue second-function label and green
alpha letter the real keypad prints (from `calculator-key-labels.mjs`, which already knows the layers) — so the
park's keypad reads like the one in their hands.

### B2. Keys that depress; modifier tint (client only)
- Standing on a tile sinks the cap 4 px and plays the SFX engine's `key` family click (one-shot via `playSfx`,
  on the vibe grid like every other park SFX). Leaving it springs back.
- While the engine's layer is `second`, every keycap's *second* label brightens and the caps tint blue; `alpha` →
  green. The status text "2ND ACTIVE - CHOOSE A FUNCTION" stays.
- The depress is cosmetic: `tileAt()` (hit test) and the relay's consensus are unchanged.

### B3. The stomp (client only — revised while building, 2026-10-11)
As specified: `holdMsFor(teamSize) = teamSize <= 1 ? 300 : 900` in `calculator-mission.mjs`, protocol 10.
Dropped, for two reasons found in the code: the relay already runs `advanceMission(state, [member])` per
student (everyone solves independently; the team agrees on *results*, not on holds), so the hold was never a
team agreement; and a 300 ms hold fires while a cat walks across a row of caps (~420 ms per cap at walk
speed), pressing keys nobody meant. Built instead: **DOWN, X or K while standing on a cap presses it now**
(the same `choose()` path as a click, so the relay sees an ordinary press). Standing still keeps the 900 ms
hold as the patient path; the status line says `HOLD TO PRESS . DOWN PRESSES NOW`. No shared-module change,
`CALCULATOR_PROTOCOL` stays 9, no relay push.

### B4. The timer is a hazard (client only)
`ROUND_MS` stays 15 s (30 s for the challenge). Instead of only a countdown number, the floor under the keypad
rises as water: `level = elapsed / limit` fills from `WORLD.floor` up toward the lowest keycap row. At time-up the
existing failure path runs unchanged ("TIME UP! TEAM RESTART."). The number stays in the status column for
anyone who wants it. Water is drawn, not simulated: no physics change, nobody drowns early.

### B5. The result arrives (client only)
On the final `ENTER` of a route, the screen canvas scrolls the result in from the bottom over ~250 ms and the
`clear` sound plays once (not the clear→fanfare chain, which stays the team's completion); "MISSION COMPLETE!" is unchanged. On the challenge's `TOGETHER! RESULT MATCHED.`
the water drains over ~400 ms.

## C. Verification

- Unit: `calculator-display.test.mjs` (renderer receives each payload kind; no renderer → identical lines),
  `calculator-mission.test.mjs` (`holdMsFor`, mirror test vs the relay copy), `calculator-key-labels.test.mjs`
  (layer labels per key), screen-renderer tests in `ti84-trainer-v2/native/tests` (default options == today's
  pixels; custom palette applied).
- Browser (local harness, then public URL): the trainer standalone looks unchanged; in the park, STAT → CALC →
  1-Var Stats shows the same screens as the CE in Pico colours, 2nd/ALPHA tint keypad + flag together, solo stomp
  is instant, team hold still needs agreement, water reaches the keypad at exactly time-up, challenge drawings
  unchanged, no console errors. `npm run test:park` green; calculator mirror test green against the relay tree.

## D. Order of work

1. A (renderer options → display → room blit). Client only. Show the teacher.
2. B1 + B2 together (keycaps, depress, tint). Client only.
3. B3 (stomp; client only).
4. B4, B5. Client only.

Each step is its own Desk push (bump-build), so the teacher can stop after any of them.
