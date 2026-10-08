// 6-1 PUSH OR JUMP (stage_push01).
// The puzzle: eight ColorBoxes (party-2 colours 0,1,0,1,1,1,1,1: a box moves only for its colour's cat) used as
// steps: box 0 on the floor before the first block (912..1104, top 288, 144 above the floor), box 1 on that block,
// boxes 2..4 ("stair building" in the Lua) around the 288 platform (1200..1488), boxes 5/6 on the Rect at 1608
// (top 208), the Key and box 7 by the Rect at 2016 (top 112), and the door on the tall goal tower (2688.., top 71).
// Route: cat 0 pushes box 0 against the block (cat 1 riding its head); cat 0 stands on box 0, cat 1 climbs via
// box 0's sliver onto cat 0's head and jumps onto the block; cat 1 pushes box 1 (colour 1) west off the block onto
// box 0 as a second step, and cat 0 climbs box 0 -> box 1 -> block.
// Then platform -> Rect 1608 -> Rect 2016 (key) -> goal tower.
// UNSOLVED (solver): the Rect at 2016 ends at 2208 and the goal tower starts at 2688 -- a 480-wide gap at the
// same height with only the floor (448) below; no party-2 route across was found. See the block message.
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
    api.block('UNSOLVED: route stops on the first block; the 480-wide gap between the Rect at 2016 (top 112) and ' +
      'the goal tower (2688, top 71) has no party-2 crossing found by the solver');
  },
};
