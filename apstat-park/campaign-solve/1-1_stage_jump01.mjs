// 1-1 HELLO PICO PARK (stage_jump01).
// The puzzle: a floor with two pits (each has a Warp below it that returns fallen cats), two Rect steps before the
// second pit, a Bridge whose Switch is on the far side of that pit, a WeightedLift that needs the whole party, a Key
// floating left of the lift, and the Goal on the high wall right of the lift.
// Route: hop the first pit one cat at a time; climb the steps; cross the 240-wide second pit (1536..1776; the bridge
// stub retracts to 1872 by frame ~160) with a RELAY jump off the partner at the step edge (at the native 3/tick walk a
// plain head jump falls ~60 short); stand on the Bridge switch (the bridge extends for the partner); both cats ride
// the lift up; cat 1 jumps left into the key and drops; both ride the lift again, walk to its right end and jump right
// onto the high wall one by one; walk to the door and enter.
// Tuned for the native 3/tick walk (batch 10): carrier jump lag after the top cat's first press, and how far right of
// the carrier's x the top cat stands before the relay (cat bodies are 32 wide). Carrier x 1530 (centre 1546), lag 5,
// offset 24 lands cat 0 at x ~1772 (floor from 1776; lag 4 lands ~1763, lag >= 6 falls short).
const RELAY_LAG = 5;
const RELAY_OFFSET = 24;

// Relay jump: `top` (standing on `bottom`'s head) presses jump, `bottom` presses `lag` ticks later, `top` lands on the
// rising carrier and presses jump again (jump-off-body-contact). Ends once `top` has left the carrier the second time.
function relayJump(api, top, bottom, { lag, dir }) {
  const { cats } = api;
  const walk = dir > 0 ? { right: true } : dir < 0 ? { left: true } : {};
  let f = 0, phase = 'first', airborne = false, release = 0;
  api.until(() => phase === 'done', () => {
    f++;
    const t = cats[top], b = cats[bottom];
    const onCarrier = Math.abs(api.feetY(t) - b.rect.y) < 3 && t.rect.x < b.rect.x + b.rect.width && b.rect.x < t.rect.x + t.rect.width;
    if (phase === 'first' && !onCarrier) airborne = true;
    if (phase === 'first' && airborne && onCarrier && f > 3) { phase = 'second'; release = 0; }
    let topJump = phase === 'first' ? f <= 14 : false;
    if (phase === 'second') { release++; topJump = release >= 2; if (release > 2 && !onCarrier) phase = 'done'; }
    if (phase === 'second' && release > 16) phase = 'done';
    return Object.assign([], { [top]: { ...walk, jump: topJump }, [bottom]: { ...walk, jump: f > lag && f <= lag + 14 } });
  }, 90, 'relay jump never completed');
  api.hold(Object.assign([], { [top]: { ...walk, jump: true }, [bottom]: walk }), 12);
}

export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const both = [0, 1];
    // First pit (x 864..912). Native walk is 3/tick and the takeoff tick has no x, so a held jump covers ~100 units:
    // each cat takes off with its centre at 836 (right edge 852) and lands well past 912.
    api.walkTo(both, [780, 836]);
    api.jump(1, { dir: 1, frames: 40 });
    api.land(1);
    api.walkTo(0, 836);
    api.jump(0, { dir: 1, frames: 40 });
    api.land();
    // Steps: the Rect {1296, 384} then {1344, 336}; jump onto each.
    api.walkTo(both, [1210, 1250]);
    api.jump(both, { dir: 1, frames: 30 });
    api.land();
    api.jump(both, { dir: 1, frames: 30 });
    api.land();
    // The bridge stub folds back (1 unit per tick) while its switch is up, so the 240-wide pit (1536..1776) must be
    // jumped. At native 3/tick a plain head jump covers ~120 of the ~210 needed (to x >= 1744), so it is a RELAY
    // launch (a carrier cannot jump while loaded): cat 0 on cat 1's head jumps first, cat 1 jumps RELAY_LAG ticks later
    // (now unloaded), cat 0 lands on the rising carrier and jumps again from there. Both hold right throughout; cat 1
    // drops into the pit and the Warp returns it to the steps.
    api.walkTo(1, 1546, { tol: 1 });
    api.walkTo(0, api.centreX(cats[1]) - 56);
    api.climbOnto(0, 1);
    api.until(() => cats[0].rect.x >= cats[1].rect.x + RELAY_OFFSET, [{ right: true }], 20, 'cat 0 could not edge on the head');
    relayJump(api, 0, 1, { lag: RELAY_LAG, dir: 1 });
    api.until(() => cats[0].grounded, [{ right: true }], 120, 'cat 0 never landed after the relay');
    api.land(0);
    // Cat 0 holds the bridge switch (1920) while the bridge extends for cat 1.
    api.walkTo(0, 1920, { tol: 4 });
    const bridge = game.bridges[0];
    api.until(() => bridge.rect.x <= 1500, [], 260, 'bridge never fully extended');
    api.walkTo(1, 1870);
    // Lift (2444..2628, top 29 above the floor): both cats hop onto it (cat 0 leads now).
    const lift = game.weightedLifts[0];
    const restY = lift.rect.y;   // read before boarding (the slab starts rising as soon as both are on it)
    api.walkTo(both, [2400, 2350]);
    api.jumpTo(both, [2580, 2500]);
    // At 3/tick the hop lands short; walk both well onto the slab (a cat hanging off its edge does not count).
    api.walkTo(both, [2580, 2500]);
    api.until(() => lift.rect.y <= restY - 150, [], 400, 'lift did not rise with both cats');
    // Cat 1 (left on the slab) jumps left into the key (2336..2368, y 164..220).
    api.walkTo(1, 2462);
    api.jump(1, { dir: -1, frames: 40 });
    api.until(() => api.carrierOfKey() >= 0, [{}, { left: true }], 60, 'cat 1 missed the key');
    api.land(1);
    api.until(() => lift.rect.y >= restY - 0.5, [], 400, 'lift never came back down');
    // Back on the lift together, up, then jump right onto the wall top (x >= 2640, y 192).
    api.walkTo(1, 2400);
    api.jumpTo(1, 2500);
    api.until(() => lift.rect.y <= restY - 180, [], 400, 'lift did not rise the second time');
    // At 3/tick a jump covers ~100, so both first walk to the slab's right end (2628), then jump one after the other.
    api.walkTo(both, [2610, 2574]);
    api.jump(0, { dir: 1, frames: 40 });
    api.jump(1, { dir: 1, frames: 40 });
    api.land();
    api.enterGoal();
  },
};
