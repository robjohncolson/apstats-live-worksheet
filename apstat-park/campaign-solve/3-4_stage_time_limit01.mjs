// 3-4 TIME LIMIT (stage_time_limit01).
// The puzzle (party 2): a DeadTimer starts at 10 s; every Switch adds 1 s the first time it is pressed (five on the
// floor at x 464..656, thirteen on the first slab at x 944..2096, under the second slab). A staircase of long Rect
// slabs rises east, each 96 above the last (tops 336, 240, 144, 48; west edges 720, 912, 1104, 1296). A push box
// stands near the west end of each of the first three slabs; the Key sits on the top slab (x 1616..1648); the door
// is on the floor at the east end.
// Route: walk the floor switches; at each slab one cat (base) stands against its west face, the other (top) climbs
// onto its head, jumps onto the slab's lip, hops over the slab's box and pushes it off the west edge -- the box falls
// to the level below (unsupported push boxes fall) and the base cat steps box -> slab. Roles alternate per slab
// (720: top 0; 912: top 1; 1104: top 0; top slab 1296: cat 1 from cat 0's head) so no cat has to pass the other on a
// slab. After the first slab cat 0 (the east one) runs the thirteen-switch corridor under the second slab
// (switches 944..2096, 48 high -- no jumping) to x 2120 and back while cat 1 waits at 770. On the top slab cat 1
// takes the key and walks off its east end (2352) onto the low Rect (2256..2496, top 192) while cat 0 walks the 144
// slab east, under the top slab, off its end (2160) to the floor; cat 1 walks west off the low Rect; both enter.
// Clock: DeadTimer.addSeconds rounds the remaining time UP to a whole second after adding 1 (each press refunds the
// running fraction, ~5 s over 18 switches); the clear lands at frame 1791 with ~3.7 s left. The two cats' final
// walks run concurrently -- done one after the other the clear was at frame 2005 with 0.10 s left.
export default {
  party: 2,
  budget: 5000,
  async solve(stage, api) {
    const { cats, game } = api;
    const timer = game.deadTimers[0];
    const timeUp = () => { if (timer.expired) api.block(`the DeadTimer ran out at frame ${api.frame}`); };
    const boxOn = (top) => game.pushBoxes.find((box) => Math.abs(box.rect.y + box.rect.height - top) < 2);
    // One slab: cat `base` stands against the west face at x `edge`, cat `up` climbs its head, jumps onto the
    // lip (top `top`), hops the box and pushes it off the west edge; cat `base` climbs box -> slab.
    function climbSlab(edge, top, up, base) {
      const box = boxOn(top);
      if (!box) api.block('no push box on the slab with top ' + top);
      api.walkTo([up, base], [edge - 80, edge - 18], { tol: 2 });
      timeUp();
      api.climbOnto(up, base);
      api.jumpTo(up, edge + 14);
      if (Math.abs(api.feetY(cats[up]) - top) > 2) api.block(`cat ${up} did not land on the lip of the slab at ${edge}: ` + JSON.stringify(api.snapshot()[up]));
      // The base cat steps back so the box can drop beside it; the top cat hops over the box and pushes it west
      // off the edge (it falls to the level below).
      api.walkTo(base, edge - 110, { tol: 4 });
      const both = (specUp) => { const specs = [{}, {}]; specs[up] = specUp; return specs; };
      // Hop the box: rise first, move east only once the feet clear its top (a box bumped from the side moves).
      let airborne = false;
      api.until(() => airborne && cats[up].grounded, (i) => {
        if (!cats[up].grounded) airborne = true;
        const clear = api.feetY(cats[up]) < box.rect.y - 1 || cats[up].rect.x > box.rect.x + box.rect.width;
        const past = cats[up].rect.x > box.rect.x + box.rect.width + 4;
        return both({ jump: i < 16, ...(clear && !past ? { right: true } : {}) });
      }, 120, `cat ${up} could not hop over the box`);
      if (cats[up].rect.x < box.rect.x + box.rect.width) api.block(`cat ${up} landed on the box instead of beyond it`);
      api.until(() => box.rect.y + box.rect.height > top + 40, () => both({ left: true }), 200,
        () => `the box did not drop off the slab edge (x ${edge}): ${JSON.stringify(box.rect)} falling ${box.falling}`);
      api.until(() => !box.falling && box.rect.y + box.rect.height >= top + 95, [], 120, 'the box did not land below');
      timeUp();
      // The base cat: onto the box, then onto the slab (the top cat stands back east).
      api.walkTo(up, edge + 120, { tol: 4 });
      api.jumpTo(base, box.rect.x + box.rect.width / 2);
      api.jumpTo(base, edge + 40);
      if (Math.abs(api.feetY(cats[base]) - top) > 2) api.block(`cat ${base} did not reach the slab at ${edge} from the box: ` + JSON.stringify(api.snapshot()[base]));
      timeUp();
    }
    // Floor switches (480..672).
    api.walkTo([0, 1], [560, 690], { tol: 4 });
    climbSlab(720, 336, 0, 1);
    // Cat 0 (the east one) runs the switch corridor on the first slab (switches 944..2096, under the second slab)
    // and comes back to stand against the second slab's face; cat 1 waits west of it.
    api.walkTo(1, 770, { tol: 4 });
    api.walkTo(0, 2120, { tol: 6, max: 600 });
    timeUp();
    // Roles alternate so neither cat ever has to pass the other on a slab.
    climbSlab(912, 240, 1, 0);
    climbSlab(1104, 144, 0, 1);
    // Top slab (west edge 1296, top 48): cat 1 from cat 0's head.
    api.walkTo([1, 0], [1210, 1278], { tol: 2 });
    api.climbOnto(1, 0);
    api.jumpTo(1, 1340);
    if (api.feetY(cats[1]) > 49) api.block('cat 1 could not reach the top slab: ' + JSON.stringify(api.snapshot()[1]));
    // Both at once (the clock is tight): cat 1 takes the key (1616..1648) and walks off the top slab's east end
    // (2352) onto the low Rect (2256..2496, top 192); cat 0 walks east along the 144 slab, under the top slab, and
    // off its end (2160) to the floor. Then cat 1 walks west off the low Rect to the floor beside the door.
    api.walkTo([1, 0], [2380, 2190], { stall: 200, max: 600 });
    if (api.carrierOfKey() !== 1) api.block('cat 1 walked through the key spot without the key');
    api.land([0, 1]);
    timeUp();
    api.walkTo(1, 2220, { stall: 200 });
    api.land(1);
    timeUp();
    api.enterGoal();
  },
};
