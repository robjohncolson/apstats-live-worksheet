// 6-1 PUSH OR JUMP (stage_push01) -- "stair building" (階段作り).
// Map: floor 432 west of 1200 (map) / Rect floor 448 from 864; the block 912..1104 top 288 (144 above the floor;
// col 1104..1152 top 336 and Rect 1104..1200 top 393.6 step down its east side); the ledge 1200..1488 top 288 (one
// chip thick, underside 336); Rect 1608..1896 y 208..256; Rect 2016..2208 y 112..160; goal tower x >= 2688, top 71
// (door 2784..2832). Key 1976..2008, y 20..76 (hanging just west of the 2016 Rect).
// Eight ColorBoxes (body = drawn box inset 2), colours at N=2 [0,1,0,1,1,1,1,1]: a box moves only when a cat of its
// colour pushes somewhere in its side-contact chain (it also moves while airborne if the push continues); boxes
// resting on a pushed box ride it. Bodies (w x h): box 0 44x44 (floor, west), box 1 36x36 (on the block), box 2
// 58x58 (floor under the ledge), boxes 3 46x54 / 4 52x56 (on the ledge), 5 34x50 / 6 40x52 (on Rect 1608), 7 28x48
// (on Rect 2016). Cat jump rise 78.6.
// Route (party 2; cat 0 = colour 0 = the floor pusher, cat 1 = colour 1 = drops boxes from above):
//  A. Onto the block: cat 0 pushes box 0 to the block wall (cat 1 riding); cat 0 stands on box 0, cat 1 climbs its
//     west sliver -> cat 0's head -> block; cat 1 pushes box 1 west off the block onto box 0; cat 0 climbs box 0's
//     4-px sliver -> box 1 (352) -> block.
//  B. Cat 0 steps down the east side to the floor and pushes box 2 to x 1476 (just short of the ledge end 1488).
//  C. Cat 1 (on the ledge) pushes box 4 off the ledge end onto box 2, hops back over box 3 and pushes it off onto
//     box 4; the same push keeps sliding box 3 east on box 4 (the cat's body overlaps box 3 by 8 from the ledge), so
//     every layer steps EAST of the one below: west treads for the last climber. Stack top 280.
//  D. Cat 1 rides box 3; cat 0 pushes the stack to the 1608 Rect; cat 1 jumps from 280 to its top 208 (72 up).
//  E. Cat 0 pushes the stack under the Rect (underside 256, 24 clearance) to L3 1884; cat 1 pushes box 5 + box 6 off
//     the Rect end 1896 (box 6 onto box 3, tread 14), then box 5 onto box 6 and 12 further east (top 178).
//  F. Cat 1 hops onto box 5; the stack carries it to the 2016 Rect; it jumps from 178 up its face onto the top 112,
//     taking the key on the way (feet <= 122 at x 1984..2016).
//  G. Stack under the 2016 Rect (underside 160, 18 clearance) to L5 2196; cat 1 pushes box 7 off 2208 onto box 5
//     (top 130) and steps down onto it.
//  H. Cat 0 pushes until box 7 (cat 1 riding) reaches the tower face; cat 1 jumps 130 -> 71.
//  I. Cat 0 climbs the west treads box 2 -> 4 -> 3 -> 6 -> 5 -> 7 (steps 58/56/54/52/50/48, treads 12..27) and jumps
//     onto the tower; both enter the door (cat 1 has the key).
// Speeds (native, batch 10): cats walk 3 px/tick, a pushed ColorBox moves 1 px/tick, so push legs take ~3x longer
// than the walk; every stop condition reads box positions. A 96 gap at the same height (block -> ledge) is a full
// 3 px/tick jump: take it from the edge. Box 3 is too tall to hop over at 3 px/tick: hop onto it and walk off.
export default {
  party: 2,
  budget: 8000,
  async solve(stage, api) {
    const { cats, game } = api;
    const boxes = game.pushBoxes;
    const [box0, box1, box2, box3, box4, box5, box6, box7] = boxes;
    // Jump straight up and only steer toward x once the feet are above `clear` (never pushes a face on the way up).
    const hop = (who, x, clear, label) => {
      const cat = cats[who];
      let f = 0, left = false;
      api.until(() => f > 2 && left && cat.grounded, () => {
        if (!cat.grounded) left = true;
        const dx = x - api.centreX(cat);
        const go = api.feetY(cat) <= clear && Math.abs(dx) > 1.5;
        const s = [{}, {}];
        s[who] = { jump: f < 16, ...(go ? (dx > 0 ? { right: true } : { left: true }) : {}) };
        f++;
        return s;
      }, 150, label || `cat ${who} hop to ${x}`);
    };
    const dbg = (m) => api.block(m + ' boxes ' + JSON.stringify(boxes.map((b) => [Math.round(b.rect.x * 10) / 10, Math.round(b.rect.y * 10) / 10])));
    // A. Onto the block.
    api.climbOnto(1, 0, { from: 170 });
    api.until(() => box0.rect.x + box0.rect.width >= 911, [{ right: true }, {}], 1200, 'box 0 did not reach the block');
    api.jumpTo(1, api.centreX(cats[0]) - 70);
    api.jumpTo(0, box0.rect.x + box0.rect.width - 17);
    api.jumpTo(1, box0.rect.x - 4);
    if (Math.abs(api.feetY(cats[1]) - box0.rect.y) > 2) dbg('cat 1 not on the sliver of box 0');
    api.climbOnto(1, 0, { from: api.centreX(cats[1]) });
    api.jumpTo(1, 990);
    if (api.feetY(cats[1]) > 289) dbg('cat 1 not on the block');
    api.walkTo(0, 780);
    hop(1, box1.rect.x + box1.rect.width + 24, box1.rect.y - 2);
    api.until(() => box1.rect.y + box1.rect.height > 290, [{}, { left: true }], 900, 'box 1 did not leave the block edge');
    api.until(() => !box1.falling && box1.rect.y + box1.rect.height >= 387, [], 120, 'box 1 did not land on box 0');
    api.walkTo(0, 830, { tol: 2 });
    hop(0, box1.rect.x - 14, box0.rect.y - 1);
    if (Math.abs(api.feetY(cats[0]) - box0.rect.y) > 2) dbg('cat 0 not on the sliver of box 0');
    hop(0, box1.rect.x + 18, box1.rect.y - 1);
    if (Math.abs(api.feetY(cats[0]) - box1.rect.y) > 2) dbg('cat 0 not on box 1');
    api.walkTo(1, 1112, { tol: 2 });   // the block's east edge (1104): 96 to the ledge is a full 3 px/tick jump
    api.jumpTo(1, 1222);
    if (api.feetY(cats[1]) > 289) dbg('cat 1 missed the ledge');
    hop(0, 960, 287);
    if (api.feetY(cats[0]) > 289) dbg('cat 0 not on the block');
    // B. Cat 0 down the east steps to the floor under the ledge; pushes box 2 to x 1476.
    api.walkTo(0, 1270, { max: 300 });
    api.land(0);
    api.until(() => box2.rect.x >= 1476, [{ right: true }, {}], 1200, 'box 2 not pushed');
    api.walkTo(0, api.centreX(cats[0]) - 20);
    // C. Cat 1 pushes box 4 off the ledge end (1488) onto box 2, then box 3 onto box 4 and >= 12 further east.
    hop(1, 1340, box3.rect.y - 2);
    api.until(() => box4.rect.y > 233, [{}, { right: true }], 900, 'box 4 did not leave the ledge');
    api.until(() => !box4.falling && box4.rect.y > 333, [], 120, 'box 4 did not land on box 2');
    api.walkTo(1, 1318, { tol: 2 });
    // Over box 3 (46 x 54): at 3 px/tick one hop cannot clear it, so hop onto it and walk off its west side.
    hop(1, box3.rect.x + 23, box3.rect.y - 2);
    if (Math.abs(api.feetY(cats[1]) - box3.rect.y) > 2) dbg('cat 1 not on box 3');
    api.walkTo(1, 1218, { tol: 2 });
    api.land(1);
    api.until(() => box3.rect.x >= box4.rect.x + 12 && !box3.falling && box3.rect.y > 279, [{}, { right: true }], 1200, 'box 3 not set on box 4');
    // D. Cat 1 rides box 3; cat 0 pushes the stack to the Rect at 1608; cat 1 jumps up onto it (72 of the 78.6 rise).
    hop(1, box3.rect.x + 20, box3.rect.y - 1);
    if (Math.abs(api.feetY(cats[1]) - box3.rect.y) > 2) dbg('cat 1 not on box 3');
    api.walkTo(0, box2.rect.x - 16, { tol: 1 });
    api.until(() => box3.rect.x + box3.rect.width >= 1604, [{ right: true }, {}], 600, 'stack not at 1608');
    api.until(() => cats[1].rect.x + 32 >= 1607.5, [{}, { right: true }], 180, 'cat 1 not at the rect face');
    api.jumpTo(1, 1640, { holdJump: 20 });
    if (api.feetY(cats[1]) > 209) dbg('cat 1 missed the rect at 1608');
    // E. Stack to L3 1884; cat 1 pushes box 5 + box 6 east: box 6 drops onto box 3, then box 5 onto box 6 and is
    //    slid 12 further east.
    api.until(() => box3.rect.x >= 1884, [{ right: true }, {}], 1800, 'stack not at 1884');
    api.until(() => box6.rect.y > 157, [{}, { right: true }], 1200, 'box 6 did not leave the rect');
    api.until(() => !box6.falling && box6.rect.y > 227, [], 120, 'box 6 did not land on box 3');
    api.until(() => box5.rect.y > 159, [{}, { right: true }], 1200, 'box 5 did not leave the rect');
    api.until(() => !box5.falling && box5.rect.y > 177, [], 120, 'box 5 did not land on box 6');
    api.until(() => box5.rect.x >= box6.rect.x + 12, [{}, { right: true }], 180, 'box 5 not slid on box 6');
    api.wait(2);
    if (api.feetY(cats[1]) > 209) dbg('cat 1 fell off the rect');
    // F. Cat 1 onto box 5 (top 178); the stack carries it to the Rect at 2016; it jumps up onto the Rect past the key.
    hop(1, box5.rect.x + 17, box5.rect.y - 1);
    if (Math.abs(api.feetY(cats[1]) - box5.rect.y) > 2) dbg('cat 1 not on box 5');
    api.until(() => box5.rect.x >= 1975, [{ right: true }, {}], 600, 'stack not at 2016');
    api.until(() => cats[1].rect.x + 32 >= 2015.5, [{}, { right: true }], 180, 'cat 1 not at the 2016 face');
    api.jumpTo(1, 2040, { holdJump: 20 });
    if (api.feetY(cats[1]) > 113) dbg('cat 1 missed the rect at 2016');
    if (api.carrierOfKey() !== 1) dbg('cat 1 did not take the key');
    // G. Stack to L5 2196; cat 1 pushes box 7 off the Rect end (2208) onto box 5, then steps down onto box 7.
    api.until(() => box5.rect.x >= 2196, [{ right: true }, {}], 1200, 'stack not at 2196');
    api.until(() => box7.rect.y > 65, [{}, { right: true }], 900, 'box 7 did not leave the rect');
    api.until(() => !box7.falling && box7.rect.y > 129, [], 120, 'box 7 did not land on box 5');
    api.walkTo(1, box7.rect.x + 22, { tol: 2 });   // fully off the Rect end (centre >= 2224), still on box 7
    api.land(1);
    if (Math.abs(api.feetY(cats[1]) - box7.rect.y) > 2) dbg('cat 1 not on box 7');
    // H. The stack (cat 1 riding the top) to the goal tower; cat 1 jumps onto the tower top (59 up).
    api.until(() => Math.max(box7.rect.x + box7.rect.width, cats[1].rect.x + 32) >= 2686, [{ right: true }, {}], 1800, 'stack not at the tower');
    api.until(() => cats[1].rect.x + 32 >= 2686.5, [{}, { right: true }], 90, 'cat 1 not at the tower face');
    api.jumpTo(1, 2730, { holdJump: 20 });
    if (api.feetY(cats[1]) > 72) dbg('cat 1 missed the tower top');
    // I. Cat 0 climbs the west treads: box 2 -> 4 -> 3 -> 6 -> 5 -> 7 -> tower.
    const ladder = [[box2, box4], [box4, box3], [box3, box6], [box6, box5], [box5, box7]];
    for (const [step, next] of ladder) {
      hop(0, next.rect.x - 17, step.rect.y - 1);
      if (Math.abs(api.feetY(cats[0]) - step.rect.y) > 2) dbg(`cat 0 missed the tread at top ${Math.round(step.rect.y)}`);
    }
    hop(0, box7.rect.x + 14, box7.rect.y - 1);
    if (Math.abs(api.feetY(cats[0]) - box7.rect.y) > 2) dbg('cat 0 not on box 7');
    hop(0, 2730, 70);
    if (api.feetY(cats[0]) > 72) dbg('cat 0 missed the tower top');
    api.enterGoal();
  },
};
