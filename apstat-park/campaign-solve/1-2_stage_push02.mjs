// 1-2 HELLO PICO PARK (stage_push02).
// The puzzle: two floor-to-ceiling PushBox pillars. Pillar 1 (weight 30: one cat at party 2) hides the Key against
// the left wall; the Key hangs too high for one cat, so the cats stack under it. Pillar 2 (weight 100: the whole
// party) is pushed right into the one-chip pit (x 960..1008), where it drops and plugs the hole. Past the bump, the
// 96-tall box "2" (weight 50) stands before the raised door ledge: one cat climbs over it on the other's head, then
// pushes it back left against the bump so the second cat can step bump -> box top -> over.
export default {
  party: 2,
  budget: 5000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [pillar1, pillar2, box2] = game.pushBoxes;
    // Pillar 1: cat 0 walks left into it and shoves it to the left wall.
    api.until(() => pillar1.rect.x <= 51, [{ left: true }], 300, 'pillar 1 did not slide to the wall');
    // Key (x 96..128, bottom 302): cat 0 stands under it, cat 1 hops onto its head and jumps.
    api.walkTo(0, 112);
    api.walkTo(1, 175);
    api.jumpTo(1, 114);
    api.jump(1, { frames: 40 });
    if (api.carrierOfKey() < 0) api.block('the key stayed out of reach from the head of a cat');
    api.land();
    // Pillar 2: both cats push it right until it drops into the pit.
    api.walkTo([0, 1], [600, 650]);
    api.until(() => pillar2.rect.y > 60, [{ right: true }, { right: true }], 400, 'pillar 2 did not reach the pit');
    api.until(() => !pillar2.falling && pillar2.rect.y >= 383, [], 200, 'pillar 2 did not settle in the pit');
    // Over the plugged pit and the bump (brown block 1008..1056 top 336) to the floor left of box "2".
    api.walkTo([0, 1], [1300, 1350], { hop: true });
    // Stack: cat 1 stands against the box, cat 0 climbs onto its head and jumps onto the box top (336).
    api.walkTo(1, box2.rect.x - 17, { tol: 2 });
    api.walkTo(0, api.centreX(cats[1]) - 60);
    api.jumpTo(0, api.centreX(cats[1]));
    api.jumpTo(0, box2.rect.x + 48);
    // Cat 0 walks off the box's right side.
    api.walkTo(0, box2.rect.x + box2.rect.width + 40);
    // Cat 1 waits on the bump (x 1056..1104, top 384) while cat 0 pushes the box left against it.
    api.walkTo(1, 1080, { hop: true });
    api.until(() => box2.rect.x <= 1110, [{ left: true }, {}], 400, 'box 2 did not reach the bump');
    // Cat 1 steps bump -> box top -> over; then both go to the door ledge (top 384).
    api.jumpTo(1, 1150);
    api.enterGoal();
  },
};
