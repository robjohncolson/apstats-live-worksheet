// 11-4 HAND GIMMICK (stage_magnet02). Party 2: cats A (0) and B (1), both MagnetPlayers, start on the closed Gate lid.
//
// Map: lid {96,288,301,30} over the Key pit (Key (264,360), pit floor y 432); the step col 1 (x 48..96, top 240); the
// high platform x 192..576 (top 144) with the SmallBox (503..551); the ledge x 384..576 (top 288) with the DelaySwitch
// (x 552). The DelaySwitch fires the Lift 10 s (600 ticks) after a press: one round trip of ~430 ticks, rect.x
// 613 -> 2101 -> 613 (top y 144.6). Thunder fills the gap below (y 454). The Gate opens only while the momentary Switch
// on the pillar (x 1591..1625, top 432) is pressed.
//
// Route:
// 1. Climb (a cat with a rider cannot jump): A hops onto the step facing right; B, on the lid, is in A's field and
//    is pulled up to A's feet level; A backs into the wall so B lands on the step lip (x 94); B hops onto A's head;
//    A walks to the step edge carrying B; B overhangs A's head and jumps right onto the high platform.
// 2. B grabs the SmallBox with the magnet (facing right) and jumps the 37 px gap onto the Lift, holding it.
// 3. B walks to the Lift's east end so the held box hangs past the slab (over the slab it would rest ON it and ride).
//    A presses the DelaySwitch and steps off. On the ride the locked box travels with B; B releases it when its centre
//    reaches x 1604: it drops onto the pillar and holds the Gate switch down. The lid retracts.
// 4. A drops into the pit (takes the Key), climbs out to the right and re-presses the DelaySwitch.
// 5. B rides back, hops onto the platform and stands at its west edge facing left. A crosses the pit to the step and
//    jumps into B's field: B lifts A to the platform level and backs east, then lets go.
// 6. Both board the Lift; at the far end (rect.x >= 2060) they walk off its east edge onto the floor and enter the Goal.

const BOX_RELEASE_X = 1604;     // box centre x at release (pillar centre 1608; the box falls straight down)
const LIFT_HOME_X = 613;
const LIFT_EXIT_X = 2060;       // walk off the lift's east edge once it is this far out (floor starts at x 2160)

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game, centreX, feetY } = api;
    const A = 0, B = 1;
    const box = game.pushBoxes[0];
    const lift = game.weightedLifts[0];
    const gate = game.gates[0];
    const delaySwitch = game.delaySwitches[0];
    const magnetB = { [B]: { action: true } };
    api.land();

    // 1. Climb to the high platform.
    api.jumpTo(A, 70);
    api.step([{ right: true }]);                       // face right (the field is in front of the cat)
    api.walkTo(B, 150, { tol: 2 });
    api.hold([{ action: true }], 40);                 // B floats up to A's feet level (y 240)
    api.hold([{ action: true, left: true }], 20);     // A backs into the wall; B now hangs over the step lip
    api.wait(30);                                     // release: B drops onto the step
    if (Math.abs(feetY(cats[B]) - feetY(cats[A])) > 1) api.block(`B missed the step (feet ${feetY(cats[B]).toFixed(1)})`);
    api.climbOnto(B, A, { from: centreX(cats[B]) });
    api.walkTo(A, 109, { tol: 1 });                   // A to the step edge, B riding
    api.walkTo(B, 136, { tol: 1 });                   // B overhangs A's head
    api.hold((f) => [{}, { jump: f < 16, right: true }], 30);
    api.land(B);
    if (feetY(cats[B]) > 145) api.block(`B missed the high platform (feet ${feetY(cats[B]).toFixed(1)})`);

    // 2. B grabs the SmallBox and carries it onto the Lift.
    api.walkTo(B, 440, { tol: 1 });
    api.hold([{}, { action: true }], 40);
    api.walkTo(B, 556, { tol: 1, extra: magnetB });
    api.hold((f) => [{}, { action: true, jump: f < 16, right: f > 0 && centreX(cats[B]) < 650 }], 40);
    api.land(B);
    if (feetY(cats[B]) > 145 || box.rect.x < 650) api.block(`box not carried onto the lift (B feet ${feetY(cats[B]).toFixed(1)}, box x ${box.rect.x.toFixed(1)})`);
    // The box rests ON the Lift slab when it hangs over it (a pulled body stops at solid actors), so B walks to the
    // Lift's east end: the box then hangs past the slab's edge, held in the air, and drops freely on release.
    api.until(() => box.rect.x >= lift.rect.x + lift.rect.width + 1, [{}, { action: true, right: true }], 60, 'the box never cleared the Lift edge');
    api.hold([{}, { action: true }], 20);
    if (feetY(cats[B]) > 145) api.block(`B walked off the Lift (feet ${feetY(cats[B]).toFixed(1)})`);

    // 3. A presses the DelaySwitch; B drops the box onto the pillar switch on the way out.
    api.walkTo(A, 552, { tol: 2, others: magnetB });
    api.walkTo(A, 470, { tol: 2, others: magnetB });
    api.until(() => lift.rect.x > LIFT_HOME_X + 5, [{}, { action: true }], 700, 'the Lift never left');
    api.until(() => box.rect.x + 24 >= BOX_RELEASE_X, [{}, { action: true }], 300, 'the box never reached the pillar');
    api.until(() => gate.opened, [], 120, () => `the box missed the pillar switch (box ${box.rect.x.toFixed(1)},${box.rect.y.toFixed(1)})`);

    // 4. A takes the Key from the pit, climbs out east and re-presses the DelaySwitch.
    api.until(() => gate.rect.x + gate.rect.width < 230, [], 300, 'the lid never retracted');
    api.walkTo(A, 264, { tol: 3, max: 300 });
    api.until(() => api.carrierOfKey() === A, [], 120, 'A did not pick up the Key');
    api.walkTo(A, 552, { tol: 2, hop: true, max: 600 });
    api.until(() => delaySwitch.pressed, [], 10, 'the DelaySwitch did not take the second press');

    // 5. B rides back and lifts A from the step onto the platform.
    api.until(() => lift.rect.x <= LIFT_HOME_X + 0.01, [], 600, 'the Lift never came home');
    api.walkTo(B, 640, { tol: 2 });                   // back to the Lift's west part (B rode out at its east end)
    api.hold((f) => [{}, { jump: f < 16, left: f > 0 && centreX(cats[B]) > 540 }], 40);
    api.land(B);
    api.walkTo([A, B], [72, 192], { tol: 1, hop: true, max: 600 });
    api.land();                                       // B faces west: its field {x 41, y 84, 110 x 80} covers the step
    const magnet = game.magnetAuxiliaries.get(cats[B]);
    api.hold((f) => [{ jump: f < 16 }, { action: true }], 20);
    api.until(() => magnet.target === cats[A] && magnet.locked, magnetB, 200,
      () => `B's field did not lock onto A (A ${centreX(cats[A]).toFixed(1)},${feetY(cats[A]).toFixed(1)})`);

    // 6. B carries A (trailing 46 px west) onto the Lift, lets go there, and both ride it to the Goal side.
    api.walkTo(B, 556, { tol: 1, extra: magnetB });
    api.hold((f) => [{}, { action: true, jump: f < 16, right: f > 0 && centreX(cats[B]) < 700 }], 40);
    api.land(B);
    api.wait(5);                                      // let go: A drops onto the Lift
    api.land();
    if (feetY(cats[A]) > 145 || feetY(cats[B]) > 145) api.block('a cat missed the Lift');
    api.until(() => lift.rect.x > LIFT_HOME_X + 5, [], 700, 'the Lift never left the second time');
    api.until(() => lift.rect.x >= LIFT_EXIT_X, [], 300, 'the Lift never reached the far end');
    api.until(() => feetY(cats[A]) > 430 && feetY(cats[B]) > 430 && cats[A].grounded && cats[B].grounded,
      [{ right: true }, { right: true }], 200, 'the cats did not reach the Goal floor');
    api.enterGoal();
  },
};
