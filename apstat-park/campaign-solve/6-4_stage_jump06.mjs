// 6-4 PUSH OR JUMP (stage_jump06).
// The puzzle: a long floor with seven DeadSwitch pads ("DON'T PUSH!": a cat touching one is sent back to spawn)
// to jump over, a one-chip step at x 1344, and the Key hanging over the raised floor (bottom 218 at party 2: out of reach of one
// cat's jump, so the cats stack under it). Route: walk east hopping each pad and the step; under the key cat 1
// stands still, cat 0 climbs onto its head and jumps through the key; hop the last pads and enter the door.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const pads = game.deadSwitches;
    // A cat touching a DeadSwitch is sent back to spawn: detect a cat far west of where it was.
    let furthest = 0;
    const check = () => {
      const x = Math.min(...cats.map((cat) => cat.rect.x));
      if (x < furthest - 300) api.block('a cat was sent back to spawn (it touched a DeadSwitch)');
      furthest = Math.max(furthest, x);
    };
    // Hop one pad: both line up just west of it (cat 1 in front, its right edge 14 short of the pad); each rises
    // 3 frames before moving east (a cat touching the pad's rect, even on take-off, is sent back), cat 1 first.
    const leap = (i, x) => {
      api.hold((f) => { const s = [{}, {}]; s[i] = { jump: f < 14, right: f >= 3 }; return s; }, 4);
      api.jumpTo(i, x);
      check();
    };
    const hopPad = (pad, lead = 1) => {
      const back = 1 - lead;
      const xs = []; xs[lead] = pad.rect.x - 30; xs[back] = pad.rect.x - 70;
      api.walkTo([0, 1], xs, { tol: 2 });
      leap(lead, pad.rect.x + 124);
      leap(back, pad.rect.x + 84);
    };
    api.walkTo([0, 1], [700, 760]);
    hopPad(pads[0]);
    // The step at 1344 (top 384) and pad 2 right after it (1374..1410). The step's top west of pad 2 is only 30 wide: hop onto it, then over the pad.
    for (const i of [1, 0]) {
      api.walkTo(i, 1290);
      api.jumpTo(i, 1358);
      // Rise clear of the pad's top (376) before moving east: only the touching cat is sent back to spawn.
      const specs = (f) => { const s = [{}, {}]; s[i] = { jump: f < 14, right: f >= 5 }; return s; };
      api.hold(specs, 6);
      api.jumpTo(i, 1480 + (i === 1 ? 40 : 0));
      check();
    }
    for (const pad of pads.slice(2, 4)) hopPad(pad);
    // Pads 5 (2190..2226) and 6 (2334..2370): the key (2264..2296, bottom 218) hangs between them.
    hopPad(pads[4]);
    // Between pads 5 and 6 (2226..2334): cat 1 under the key (centre 2281), cat 0 right beside it (left edge 2231).
    api.walkTo([0, 1], [2247, 2281], { tol: 1 });
    api.climbOnto(0, 1, { from: api.centreX(cats[0]) });
    api.jump(0, { frames: 40 });
    if (api.carrierOfKey() !== 0) api.block('cat 0 jumping from the head of cat 1 missed the key');
    api.land();
    check();
    // Cat 0 (the carrier, on cat 1's head) leaps pad 6 first and leads to the door.
    if (Math.abs(api.feetY(cats[0]) - cats[1].rect.y) < 2) leap(0, pads[5].rect.x + 124);
    else api.block('cat 0 did not land back on the head of cat 1 after the key');
    api.walkTo(0, pads[6].rect.x - 30, { tol: 2 });
    leap(1, pads[5].rect.x + 66);
    // Cat 0 (the carrier) leaps pad 7, opens the door and enters before cat 1 follows: if cat 1 lands touching the
    // carried key it takes it (steal rule) and the order at the door breaks.
    api.walkTo(1, pads[6].rect.x - 78, { tol: 3 });
    leap(0, pads[6].rect.x + 124);
    api.enterOne(0);
    check();
    leap(1, pads[6].rect.x + 84);
    api.enterGoal();
    check();
  },
};
