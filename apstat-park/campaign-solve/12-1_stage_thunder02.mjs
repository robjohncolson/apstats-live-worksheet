// 12-1 LAST PARK (stage_thunder02). Party 2 = cat 0 GuardPlayer DIR_LEFT (6x60 plank at x-15, y-7..y+53) and
// cat 1 plain Player. Input slots are swapped ([1, 0]); step() handles that. No largeParty variant: larger parties
// only add plain cats (still one guard), so party 2 is the minimum and the route below clears it.
//
// Map (all numbers measured in the runtime):
// - Floor y 384 from x 48 to 667.2 (cats stand feet 383.7). Rect 1 is a ledge from x 667.2, top y 302.4 (81.3 above
//   the floor; max jump rise is 78.57, so a plain cat needs a step). Rect 2 is a pillar x 864..912, top 254.4.
//   PushBox 1 drops at frame 0 onto Rect 1 at x 672..720 (top 254.4). Key x 872..904, y 58..114 above the pillar;
//   door x 1128..1176 on Rect 1.
// - Thunder (lower) fires RIGHT from x 48, band y 286..290, cut at the first blocker in the band (PushBox while it is
//   on Rect 1, the pillar at 864, or the guard plank). A plain cat is in it whenever its feet are in (286, 336):
//   any hop from the floor that rises more than 47.7, standing on Rect 1 left of the pillar, or standing on the box.
//   Death needs 2 consecutive frames in the band. Thunder (upper) band y 156..160, x 48..1312: a plain cat must
//   never jump from pillar/box-top height (feet 254.4).
// - Guard shield: the plank cuts the beam at guard.x - 15 whenever the guard's feet are in (279, 343). It is on a
//   cat's head, the floor box (top 336), Rect 1 -- or simply mid-jump from the floor with rise >= 40.7.
// - SYNCHRONIZED-JUMP SHIELD (the key): a plain cat to the RIGHT of the guard that jumps on the same frame from the
//   same floor has the same rise every frame; it is in the band only while rise > 47.7, and then the guard's rise
//   is > 40.7 too, so the plank covers it the whole time.
//
// Route:
// 1. Cat 1 stands at the wall (x 635.2); the guard climbs its head, jumps onto the 4.8-px lip and onto the box,
//    walks right onto Rect 1 and pushes the box left off the ledge at 1 px/tick (it drops straight down once wholly
//    past the lip and lands x 609..657, top 336). Cat 1 waits at x ~500 meanwhile.
// 2. The guard drops to the floor and hops over cat 1 to stand on its left.
// 3. Sync jump: both jump on the same frame (hold 14); cat 1 steers onto the floor box (it lands at feet 336, out
//    of the band; the box is nudged to x ~602), the guard lands back on the floor.
// 4. Cat 1 moves to the box's east end, the guard to its west face (a 3 px/tick jump cannot reach the box from
//    further out); the guard jumps onto the box; once its feet are <= 342 (shield on) cat 1 jumps from the box onto
//    Rect 1. The guard lands on the vacated box (feet 336, shield on), so cat 1 walks along Rect 1 shielded,
//    climbs onto the pillar (out of the band; right of the pillar the beam is cut).
// 5. The guard jumps onto Rect 1, onto the pillar's left part, onto cat 1's head (feet 208.4) and jumps for the key
//    (it is immune to the upper band). Both walk to the door.
export default {
  party: 2,
  budget: 1500,
  async solve(stage, api) {
    const { game, cats, wait, walkTo, climbOnto, jumpTo, land, step, until, enterGoal, block, centreX, feetY } = api;
    const box = game.pushBoxes[0];
    const dead = () => cats.some((cat) => (cat.deathTimer || 0) > 0);
    const guard = (label) => { if (dead()) block(label + ': a cat died (thunder)'); };
    const toward = (c, x, tol = 2) => {
      const dx = x - centreX(cats[c]);
      return Math.abs(dx) <= tol ? {} : dx > 0 ? { right: true } : { left: true };
    };

    // 1. Guard up via cat 1 at the wall, then shove the box off the ledge.
    wait(5);
    walkTo(1, 651.2);
    land();
    climbOnto(0, 1);
    jumpTo(0, 660, { holdJump: 14 });
    jumpTo(0, 720, { holdJump: 14 });
    walkTo(0, 820);
    land();
    walkTo(1, 500);
    land();
    until(() => box.rect.y >= 335.9 && cats[0].grounded, [{ left: true }, {}], 200, 'the guard could not push the box off Rect 1');   // 1 px/tick push (batch 10)
    land();
    guard('box drop');

    // 2. Guard to the floor, over cat 1, onto its left.
    walkTo(0, 580);
    land();
    jumpTo(0, 420, { holdJump: 14 });
    land();
    walkTo(1, 556);
    walkTo(0, 500);
    land();
    guard('reorder');

    // 3. Synchronized jump: cat 1 onto the floor box, shielded by the rising guard on its left.
    for (let f = 0; f < 60; f++) {
      step([{ jump: f < 14 }, { jump: f < 14, ...toward(1, 616) }]);
      if (f > 3 && cats[0].grounded && cats[1].grounded) break;
    }
    land();
    guard('sync jump onto the box');
    if (Math.abs(feetY(cats[1]) - box.rect.y) > 1) block('cat 1 missed the floor box (feet ' + feetY(cats[1]) + ')');

    // 4. Guard jumps toward the box; cat 1 leaves for Rect 1 once the shield is up; the guard lands on the box.
    // At 3 px/tick the guard cannot jump from the floor onto the box from afar: cat 1 moves to the box's east end
    // (clear of the guard's head), the guard walks up to the box's west face and jumps straight onto it.
    const boxMid = box.rect.x + box.rect.width / 2;
    walkTo(1, box.rect.x + box.rect.width - 16, { tol: 1 });
    walkTo(0, box.rect.x - 16, { tol: 1 });
    land();
    guard('lining up under the box');
    let start = -1;
    for (let f = 0; f < 90; f++) {
      if (start < 0 && feetY(cats[0]) <= 342) start = f;
      const k = start < 0 ? -1 : f - start;
      step([{ jump: f < 14, ...(feetY(cats[0]) < box.rect.y - 1 || centreX(cats[0]) > box.rect.x ? toward(0, boxMid) : {}) },
        start < 0 ? {} : { jump: k < 14, ...toward(1, 720) }]);
      if (f > 10 && cats[0].grounded && cats[1].grounded) break;
    }
    land();
    guard('box to Rect 1');
    if (feetY(cats[1]) > 303) block('cat 1 did not reach Rect 1');
    walkTo(1, 840);
    jumpTo(1, 896, { holdJump: 14 });
    land();
    guard('walk to the pillar');

    // 5. Guard up to the pillar, onto cat 1's head, key, door.
    jumpTo(0, 700, { holdJump: 14 });
    land();
    walkTo(0, 820);
    land();
    jumpTo(0, 864, { holdJump: 14 });
    land();
    climbOnto(0, 1, { from: 864 });
    until(() => (game.carriedKeys || []).length > 0, (f) => [{ jump: f < 20, ...toward(0, 888) }, {}], 80,
      'the guard could not reach the key');
    land();
    guard('key');
    enterGoal();
  },
};
