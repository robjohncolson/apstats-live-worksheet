// 4-4 GIMMICK GIMMICK (stage_big_and_small).
// The puzzle: ScaleSwitches on the floor shrink (576, 1296: down to 0.4, 12.8 x 18.4) or grow (768, 1488: up to 3.2,
// 102 x 147) the cat standing on them; a small cat stays small, a big one shrinks back slowly. A Rect wall at 1008
// leaves a 24-unit crawl space (small cats only). Past it, the Key sits above a shelf (top 240) behind a wall whose
// only opening is a 20-unit slot at y 220..240, x 1728: only a small cat, standing at shelf height, fits. The door
// is under the shelf behind a Gate; the Gate switch is at the bottom of the shaft past the shelf's east end, where
// the tall PushBox on the shelf drops onto it.
// Intended route: both shrink (576) and hop over the grow pad (768); crawl under the wall; cat 0 climbs onto small
// cat 1's head; cat 1 grows on the 1488 pad, lifting cat 0 (cat 1's top reaches ~285); cat 1 walks to the gate;
// cat 0 jumps from its head (small jump 58: peak ~227) and slides into the slot onto the shelf, takes the key,
// pushes the PushBox off the shelf's east end onto the Gate switch, drops onto the box (now flush with the floor);
// both enter.
// Runtime finding (2026-10-08): the first growth tick shoves the rider sideways off the growing cat's head (~16
// units, then it falls) instead of lifting it, so no cat can ever stand on a grown cat; a small cat cannot jump onto
// a head higher than 58 units, so the slot is unreachable.
export default {
  party: 2,
  budget: 3000,
  blocker: 'ScaleSwitch growth (audit: Match; growth-with-rider not covered): a cat growing on a ScaleSwitch shoves the cat on its head sideways off it instead of lifting it',
  async solve(stage, api) {
    const { cats } = api;
    const [rider, grower] = cats;
    // Shrink both on the 576 pad; hop over the 768 grow pad.
    api.walkTo(1, 576);
    api.until(() => grower.rect.height < 19, [], 200, 'cat 1 did not shrink on the 576 pad');
    api.walkTo(1, 700); api.jumpTo(1, 860);
    api.walkTo(0, 576);
    api.until(() => rider.rect.height < 19, [], 200, 'cat 0 did not shrink on the 576 pad');
    api.walkTo(0, 690); api.jumpTo(0, 820);
    // Crawl under the Rect wall (1008..1056, gap 408..432).
    api.walkTo([0, 1], [1300, 1430], { max: 900 });
    // Cat 0 climbs onto small cat 1's head; cat 1 steps onto the 1488 grow pad.
    api.climbOnto(0, 1);
    let lastOnHead = api.frame;
    api.until(() => grower.rect.height > 140, () => {
      const onHead = Math.abs(api.feetY(rider) - grower.rect.y) < 1.5 && rider.grounded;
      if (onHead) lastOnHead = api.frame;
      if (!onHead && grower.rect.height > 19 && api.frame - lastOnHead > 3) {
        api.block(`growing on the 1488 ScaleSwitch, cat 1 (now ${grower.rect.height.toFixed(1)} tall) shoved cat 0 off its head ` +
          `(cat 0 at x ${rider.rect.x.toFixed(1)}, feet ${api.feetY(rider).toFixed(1)}; cat 1 at x ${grower.rect.x.toFixed(1)}); ` +
          'cat 0 cannot get back up (small jump 58), so the 20-unit slot at y 220..240 is out of reach');
      }
      return [{}, api.centreX(grower) < 1488 ? { right: true } : {}];
    }, 400, 'cat 1 did not grow on the 1488 pad');
    // (Not reached in the current runtime.) Walk to the gate, jump cat 0 into the slot, key, box, door.
    api.enterGoal();
  },
};
