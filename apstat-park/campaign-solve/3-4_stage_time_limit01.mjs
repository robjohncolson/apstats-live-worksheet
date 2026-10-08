// 3-4 TIME LIMIT (stage_time_limit01).
// The puzzle (party 2): a DeadTimer starts at 10 s; every Switch adds 1 s the first time it is pressed (five on the
// floor at x 480..672, thirteen on the first slab at x 960..2112, under the second slab). A staircase of long Rect
// slabs rises east, each 96 above the last (tops 336, 240, 144, 48; west edges 720, 912, 1104, 1296). A push box
// stands near the west end of each of the first three slabs; the Key sits on the top slab (x 1616..1648); the door
// is on the floor at the east end.
// Route: walk the floor switches; at each slab, the bottom cat stands against its west face, the other climbs onto
// its head and jumps onto the slab's lip, hops over the slab's box and pushes it off the west edge; the bottom cat
// steps box -> slab. On the first slab cat 1 first runs the thirteen-switch corridor and back. On the 144 slab cat 0
// climbs cat 1 onto the top slab, takes the key, walks off its east end onto the low Rect and down to the floor;
// cat 1 walks off the 144 slab's east end; both enter.
// Runtime finding (2026-10-08): the first box pushed off the 336 slab's west edge hangs in mid-air (push boxes outside
// stage_jump02 never fall off a ledge), so the bottom cat has no step and the party cannot climb the second slab.
export default {
  party: 2,
  budget: 5000,
  blocker: 'PushBox (audit: Match): an unsupported push box only falls in stage_jump02 or for the NormalBox/SmallBox family (nativeFall); elsewhere a box pushed off a ledge floats unless it fits a box-wide gap (findPushBoxGapSnapX)',
  async solve(stage, api) {
    const { cats, game } = api;
    const timer = game.deadTimers[0];
    const timeUp = () => { if (timer.expired) api.block(`the DeadTimer ran out at frame ${api.frame}`); };
    const boxOn = (top) => game.pushBoxes.find((box) => Math.abs(box.rect.y + box.rect.height - top) < 2);
    // One slab: cat 1 stands against the face at x `edge` (on level `floor`), cat 0 climbs its head, jumps onto the
    // lip, hops the box and pushes it off the west edge; cat 1 climbs box -> slab.
    function climbSlab(edge, top) {
      const box = boxOn(top);
      if (!box) api.block('no push box on the slab with top ' + top);
      api.walkTo([0, 1], [edge - 80, edge - 18], { tol: 2 });
      timeUp();
      api.climbOnto(0, 1);
      api.jumpTo(0, edge + 14);
      if (Math.abs(api.feetY(cats[0]) - top) > 2) api.block(`cat 0 did not land on the lip of the slab at ${edge}: ` + JSON.stringify(api.snapshot()[0]));
      // Cat 1 steps back so the box can drop beside it, cat 0 hops over the box and pushes it west off the edge.
      api.walkTo(1, edge - 110, { tol: 4 });
      // Hop the box: rise first, move east only once the feet clear its top (a box bumped from the side moves).
      let airborne = false;
      api.until(() => airborne && cats[0].grounded, (i) => {
        if (!cats[0].grounded) airborne = true;
        const clear = api.feetY(cats[0]) < box.rect.y - 1 || cats[0].rect.x > box.rect.x + box.rect.width;
        const past = cats[0].rect.x > box.rect.x + box.rect.width + 4;
        return [{ jump: i < 16, ...(clear && !past ? { right: true } : {}) }, {}];
      }, 120, 'cat 0 could not hop over the box');
      if (cats[0].rect.x < box.rect.x + box.rect.width) api.block('cat 0 landed on the box instead of beyond it');
      api.until(() => box.rect.y + box.rect.height > top + 40, () => {
        if (box.rect.x + box.rect.width < edge - 2 && !box.falling) {
          api.block(`push box pushed off the slab edge (x ${edge}) hangs in the air at ${JSON.stringify(box.rect)} ` +
            `(falling ${box.falling}, wasSupported ${box.wasSupported}); a cat jumping under it does not hop it either`);
        }
        return [{ left: true }, {}];
      }, 200, 'the box did not drop off the slab edge');
      api.until(() => !box.falling && box.rect.y + box.rect.height >= top + 95, [], 120, 'the box did not land below');
      timeUp();
      // Cat 1: onto the box, then onto the slab (cat 0 stands back east).
      api.walkTo(0, edge + 120, { tol: 4 });
      api.jumpTo(1, box.rect.x + box.rect.width / 2);
      api.jumpTo(1, edge + 40);
      if (Math.abs(api.feetY(cats[1]) - top) > 2) api.block(`cat 1 did not reach the slab at ${edge} from the box: ` + JSON.stringify(api.snapshot()[1]));
      timeUp();
    }
    // Floor switches (480..672).
    api.walkTo([0, 1], [560, 690], { tol: 4 });
    climbSlab(720, 336);
    // Cat 1 runs the switch corridor on the first slab (960..2112, under the second slab) and back.
    api.walkTo(1, 2120, { tol: 6, max: 600 });
    timeUp();
    climbSlab(912, 240);
    climbSlab(1104, 144);
    // Top slab (west edge 1296, top 48): cat 0 from cat 1's head.
    api.walkTo([0, 1], [1210, 1278], { tol: 2 });
    api.climbOnto(0, 1);
    api.jumpTo(0, 1340);
    if (api.feetY(cats[0]) > 49) api.block('cat 0 could not reach the top slab: ' + JSON.stringify(api.snapshot()[0]));
    api.walkTo(0, 1632, { tol: 4 });
    if (api.carrierOfKey() !== 0) api.block('cat 0 walked through the key spot without the key');
    timeUp();
    // Cat 0: off the top slab's east end (2352) onto the low Rect (2256.., top 192), west off it, down to the floor.
    api.walkTo(0, 2380, { stall: 200 });
    api.land(0);
    api.walkTo(0, 2220, { stall: 200 });
    api.land(0);
    // Cat 1: east along the 144 slab and off its end (2160) to the floor.
    api.walkTo(1, 2190, { stall: 200, max: 600 });
    api.land(1);
    timeUp();
    api.enterGoal();
  },
};
