// 6-1 PUSH OR JUMP (stage_push01).
// The puzzle: eight ColorBoxes (party-2 colours 0,1,0,1,1,1,1,1: a box moves only for its colour's cat) used as
// steps: box 0 on the floor before the first block (912..1104, top 288, 144 above the floor), box 1 on that block,
// boxes 2..4 ("stair building" in the Lua) around the 288 platform (1200..1488), boxes 5/6 on the Rect at 1608
// (top 208), the Key and box 7 by the Rect at 2016 (top 112), and the door on the tall goal tower (2688.., top 71).
// Route: cat 0 pushes box 0 against the block (cat 1 riding its head); cat 0 stands on box 0, cat 1 climbs via
// box 0's sliver onto cat 0's head and jumps onto the block; cat 1 pushes box 1 (colour 1) west off the block onto
// box 0 as a second step, and cat 0 climbs box 0 -> box 1 -> block.
// Then platform -> Rect 1608 -> Rect 2016 (key) -> goal tower.
// BLOCKED (batch 6/7 runtime, analysed at party 2..4): the goal tower (map cols 56-61, 2688..2976, capped by the
// Rect top 71; door 2784..2832 at y 40..72) stands 377 above the only floor (Rect y 448, x 864..3456). The nearest
// ledge is the Rect 2016..2208 (top 112): a 480-wide gap. Cat 32x46, jump rise 78.6, running jump 35 frames / 124
// across -> the gap cannot be jumped (it would take ~2800 of drop). From the floor a lone cat needs a support whose
// top is <= 149.6 (377 - 78.6 = 298.4 above the floor) against the tower = at least 6 stacked boxes (the 5 tallest are
// 62+60+58+56+54 = 290). Boxes never gain height: they slide when pushed, fall, or ride a WALKING cat's head at that
// cat's level; a cat with a body on its head cannot jump (head-stack-jump-impulse: the top free box hops 22 instead).
// Between 2208 and 2688 the only surface is the floor, so every box reaches the tower base at floor level (or on a
// carrier's head, 46 / 92 up, with the carrier stranded under it). The column's upper boxes (bottom >= 236) can never
// get there, so the LAST cat (no one left to boost it) can never climb. A human tower needs 7 cats under the first
// climber (448 - 46k - 78.6 <= 71 -> k >= 6.5). No party-dependent rows: no largeParty, Rect rows carry only W/H, and
// the ColorBox p3 only changes colours. Needs a native check of the intended (8-player?) solution.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const box = (name, n) => game.pushBoxes.filter((b) => b.spawn.actorName === name)[n];
    const box0 = box('ColorBox', 0), box1 = box('ColorBox', 1);
    // 1. Cat 1 rides cat 0's head while cat 0 (colour 0) pushes box 0 east to the block wall (x 912).
    api.climbOnto(1, 0, { from: 170 });
    api.until(() => box0.rect.x + box0.rect.width >= 905, [{ right: true }, {}], 400, 'box 0 did not reach the block');
    // 2. Cat 1 hops off west; cat 0 hops onto box 0's east part; cat 1 onto its west sliver, then onto cat 0's head,
    //    then onto the block (top 288).
    api.jumpTo(1, api.centreX(cats[0]) - 70);
    api.jumpTo(0, box0.rect.x + box0.rect.width - 17);
    api.jumpTo(1, box0.rect.x + box0.rect.width - 50);
    if (Math.abs(api.feetY(cats[1]) - box0.rect.y) > 2) api.block('cat 1 could not stand on the west sliver of box 0');
    api.climbOnto(1, 0, { from: api.centreX(cats[1]) });
    api.jumpTo(1, 990);
    if (api.feetY(cats[1]) > 289) api.block('cat 1 did not reach the block top from the head of cat 0');
    // 3. Cat 0 steps down west; cat 1 hops box 1 (on the block) and pushes it west off the edge onto box 0.
    api.walkTo(0, 780);
    api.jumpTo(1, box1.rect.x + box1.rect.width + 30);
    // Stop pushing the moment box 1 leaves the edge, so it drops flush with the wall onto box 0 (leaving box 0's
    // west sliver as a step) and cat 1 stays on the block.
    api.until(() => box1.rect.y + box1.rect.height > 290, [{}, { left: true }], 300, 'box 1 did not leave the block edge');
    api.until(() => !box1.falling && box1.rect.y + box1.rect.height >= 383, [], 120, 'box 1 did not land on box 0');
    if (api.feetY(cats[1]) > 289) api.block('cat 1 followed box 1 off the block');
    // 4. Cat 0: floor -> box 0's exposed sliver -> box 1 -> block.
    api.jumpTo(0, box1.rect.x - 17);
    if (Math.abs(api.feetY(cats[0]) - box0.rect.y) > 2) api.block('cat 0 could not stand on the west sliver of box 0: ' +
      JSON.stringify({ box0: box0.rect.x, box1: box1.rect.x }));
    api.jumpTo(0, box1.rect.x + 20);
    api.jumpTo(0, 960);
    if (api.feetY(cats[0]) > 289) api.block('cat 0 could not climb box 0 / box 1 onto the block');
    api.block('UNSOLVED (structural, party 2..4): goal tower top 71 is 377 above the only floor (448) and 480 east of ' +
      'the last ledge (Rect 2016..2208, top 112); jump rise 78.6 / running jump 124 across; a loaded cat cannot jump ' +
      'and boxes never rise (only a 22 head-hop), so no box support >= 298.4 tall (>= 6 boxes) can be built at the ' +
      'tower base and the last cat can never climb; a human tower needs 7 cats under the climber');
  },
};
