// 4-1 GIMMICK GIMMICK (stage_thunder01). Party 2 = cat 0 GuardPlayer DIR_RIGHT (6x60 plank at x+43, y-7) and
// cat 1 GuardPlayer DIR_UP (48x6 plank at x-8, y-12). Input slots are swapped ([1, 0]); step() handles that.
//
// Route map (all numbers measured in the runtime):
// - Floor y 384 from x 48 to 864, then a one-chip trench x 864..1200 (floor 432), then floor y 384 to the door.
// - Thunder 20 fires LEFT from (1200, 408): swept to the trench's left wall, beam x 848..1200, y 406..410. A cat in
//   the trench (y 386..432) is in it, so nobody may stand in the trench unshielded. Max jump rise is ~79, air ~165 px:
//   the trench cannot be jumped.
// - Trench: cat 0 (RIGHT plank) leads into the trench; its plank cuts the beam to [x+49, 1200], so cat 0 and anyone
//   LEFT of it are safe. Cat 1 follows behind. Cat 0 stops at x ~1140 (plank right edge < 1200, or the |dx| cut
//   wraps back over it); cat 1 climbs onto its head (above the beam), steps off right onto the far ledge, then cat 0
//   jumps out (its plank covers the band the whole time its body is in it).
// - Thunders 1..17 fire DOWN from y 48 at x 1680..2448 (every 48), each 352 long to the floor. Cat 1 rides on
//   cat 0's head: cat 1's UP plank (48 wide, at its y-12) cuts every beam over both cats' 32-wide bodies. Riders are
//   carried horizontally, so only cat 0 walks.
// - Past the last beam (x > 2452) cat 1 jumps from cat 0's head for the key (x 2528, y 182..238), then both enter
//   the door at x 2568.
export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats, walkTo, climbOnto, jumpTo, wait, hold, until, land, enterGoal, block, centreX } = api;
    const dead = () => cats.some((cat) => (cat.deathTimer || 0) > 0);
    const guard = (label) => { if (dead()) block(label + ': a cat died (thunder)'); };

    wait(10);
    // Swap order: cat 1 climbs onto cat 0, cat 0 carries it to the trench lip, cat 1 steps off behind (left).
    climbOnto(1, 0);
    walkTo(0, 820);
    land();
    walkTo(1, 760);
    land();
    guard('reorder');

    // Into the trench: cat 0 leads, cat 1 follows on its left.
    walkTo(0, 1112, { max: 200 });
    land();
    walkTo(1, 1050, { max: 200 });
    land();
    guard('trench walk');
    if (cats[0].rect.x + 49 >= 1200) block('cat 0 plank past the trench wall: x ' + cats[0].rect.x);

    // Cat 1 onto cat 0's head (above the beam band), then off to the right onto the far ledge.
    climbOnto(1, 0);
    guard('climb in trench');
    jumpTo(1, 1260, { holdJump: 8 });
    walkTo(1, 1420);
    guard('cat 1 out');

    // Cat 0 jumps out of the trench (its plank covers the beam band while its body is in it).
    jumpTo(0, 1290);
    land();
    guard('cat 0 out');

    // Stack for the DOWN beams: cat 1 on cat 0's head, cat 0 walks under all 17 beams.
    climbOnto(1, 0);
    walkTo(0, 2484, { max: 900 });   // native 3 px/tick: ~1200 px at 3/tick = ~400 frames + slack
    land();
    guard('beam corridor');

    // Key: cat 1 jumps from the head toward x 2544.
    until(() => (api.game.carriedKeys || []).length > 0, (f) => [{}, { jump: f < 20, ...(centreX(cats[1]) < 2544 ? { right: true } : {}) }], 80,
      'cat 1 could not reach the key');
    land();
    guard('key');
    enterGoal();
  },
};
