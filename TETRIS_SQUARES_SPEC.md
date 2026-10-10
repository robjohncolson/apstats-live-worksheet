# TETRIS_SQUARES_SPEC — gold and silver squares in Study Break (teacher 2026-10-10)

Inspired by The New Tetris (N64, 1999): four tetrominoes that form a solid 4×4 square fuse into one slab —
**gold** if all four were the same shape, **silver** if mixed. Squares pay when lines are cleared through them.
Teacher: "a gold clear sends extra garbage, and candy bets should pay a premium for a gold clear. Make sure to get
the sounds right!"

Hard rules carried over: the Tetris engine lives in the Desk's `studyBreak`; **relay message SHAPES never change**
(values may); the countdown never waits on the wallet; `STAKES_ENABLED` kill-switch; one game decides a match.

## 1. Squares (engine)
- After every piece locks, scan for 4×4 regions whose 16 cells are filled by **exactly four whole pieces** (each
  piece's four cells inside the region; no piece partly outside; no cell from an already-fused square or from
  garbage). Each cell keeps a `pieceId` from lock time to make this exact.
- Fuse: the 16 cells become one slab with `material: 'gold'` (all four pieces the same shape) or `'silver'`.
  A fused slab is still 16 ordinary cells for gravity and line clears; only the drawing and scoring change.
- A region can fuse only once; overlapping candidates resolve top-left first, deterministically.
- **Clear through a square:** when a cleared row contains slab cells, the clear is a *square clear*. Score:
  plain line 100 · silver line 500 · gold line 1000 (× the usual level multiplier). The slab's remaining rows keep
  their material after the row above/below is removed.
- Visual: on fuse, a 250 ms flash then the slab draws as one block: gold = warm `#F2C14E` with a lighter diagonal
  sheen, silver = cool `#C9D1D9` with the same sheen; outlines between the four pieces disappear. A square clear
  flashes the whole row white for 120 ms (normal clears keep today's effect).

## 2. 1v1: gold sends extra garbage
- Today each cleared line sends its usual garbage. A **gold square clear sends +2 garbage rows per gold line**
  (silver +1). Values ride in the existing garbage field of the existing game-state message — same shape.
- Garbage rows received are plain cells (never slab material).

## 3. Candy bets: gold premium
- Stake stays 1 candy. **Escrow becomes 2 candy per player** at join: 1 base + 1 **gold premium hold**.
- At resolve: the base candy goes to the winner as today. The premium candy moves to the winner **only if the
  winner made at least one gold square clear during the match**; otherwise both premiums are refunded.
- Both clients already report the result; each now also reports `goldClears` per player in the SAME resolve
  payload (a new optional field is allowed on the roster-server HTTP body; relay messages unchanged). The server
  pays the premium only when **both** reports agree on the winner's gold count ≥ 1; a disagreement refunds the
  premiums (never pays). A student who cannot cover 2 candy cannot join a staked match (today's "not enough candy").
- roster-server: `doge_tetris_bet_*` RPCs take the escrow 2 and the premium flag; `/wallet/bet/open` and
  `/wallet/bet/resolve` keep their routes. Kill-switch `STAKES_GOLD_PREMIUM` (default on; off = escrow 1, no premium).
  Grade-inert; money code — Codex review.

## 4. Sounds (WebAudio, synthesised — no sampled audio from the game)
- **Fuse (silver):** a bell: two sine partials (1318 Hz E6 + 1976 Hz B6), 2 ms attack, 350 ms exponential decay,
  plus a short noise "sparkle" (band-passed 6–9 kHz, 80 ms).
- **Fuse (gold):** the same bell a fourth higher (1760 Hz A6 + 2637 Hz E7) with a third partial (3520 Hz) and a
  450 ms decay — brighter and longer.
- **Square clear:** today's line-clear sound followed 60 ms later by a rising two-note chime (silver: E6→B6,
  gold: A6→E7), 200 ms each.
- All through the Desk's existing sound gate (`data-sfx` / the Sound option) so muted stays muted.

## 5. Out of scope
- No change to the match rule (one game), the challenge alert, presence, or any relay message shape.
- Classic Desk gets the same engine (the engine is shared); the Pico skin draws the same cells.
