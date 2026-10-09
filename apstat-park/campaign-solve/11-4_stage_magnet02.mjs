// 11-4 HAND GIMMICK (stage_magnet02). Party 2: cats A (0) and B (1), both MagnetPlayers, start on the closed Gate lid.
//
// Map: lid {96,288,301,30} over the Key pit (Key (264,360), pit floor y 432); the step col 1 (x 48..96, top 240); the
// high platform x 192..576 (top 144) with the SmallBox (503..551); the ledge x 384..576 (top 288) with the DelaySwitch
// (x 552). The DelaySwitch fires the Lift 10 s (600 ticks) after a press: one round trip of ~430 ticks, rect.x
// 613 -> 2101 -> 613 (top y 144.6). Thunder fills the gap below (y 454). The Gate opens only while the momentary Switch
// on the pillar (x 1591..1625, top 432) is pressed.
//
// Route (native camera, batch 17): while a switch-driven Lift travels it raises stage flag 0x1000
// (FUN_7ff72bb55700 / FUN_7ff72bb55370): the camera snaps to the pair's midpoint and a cat off the west edge is pushed
// back onto the screen (FUN_7ff72bb6f0e0), so a cat left behind on the ledge while the other rides out is pushed off
// it into the Thunder gap. Both cats ride every trip. The Lift slab is 118 wide: box 48 + two cats 64.
// 1. Climb (a cat with a rider cannot jump): A hops onto the step facing right; B, on the lid, is in A's field and is
//    pulled up to A's feet level; A backs into the wall so B lands on the step lip (x 94); B hops onto A's head;
//    A walks to the step edge carrying B; B overhangs A's head and jumps right onto the high platform.
// 2. B grabs the SmallBox with the magnet (facing right), jumps the 37 px gap onto the Lift with it, sets it down at
//    the slab's east end and hops back onto the platform.
// 3. A presses the DelaySwitch (the Lift leaves 10 s later), comes back to the step and jumps into the field of B
//    (at the platform's west edge facing west); B lifts A and carries it (trailing 46 px west) onto the Lift's west
//    part, lets go, takes the box again and walks east until it hangs past the slab.
// 4. On the ride the locked box travels with B; B releases it when its centre reaches x 1604: it drops onto the
//    pillar and holds the Gate switch down. The lid retracts. Both ride back.
// 5. Both hop onto the platform; A drops off its west end into the Key pit, takes the Key, climbs out east and
//    re-presses the DelaySwitch, comes back to the step; B lifts A and carries it onto the Lift again.
// 6. Both ride; at the far end (rect.x >= 2060) they walk off its east edge onto the floor and enter the Goal.

const BOX_RELEASE_X = 1604;     // box centre x at release (pillar centre 1608; the box falls straight down)
const LIFT_HOME_X = 613;
const LIFT_EXIT_X = 2060;
const B_ON_LIFT_X = 662;       // B's centre landing on the Lift with A trailing: A's west half overhangs, the box fits east       // walk off the lift's east edge once it is this far out (floor starts at x 2160)

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
    const magnet = game.magnetAuxiliaries.get(cats[B]);
    const magnetLockedOn = (target) => magnet.target === target && magnet.locked;
    // A cat on the Lift hops the 37 px gap back west onto the platform.
    function hopToPlatform(i) {
      if (centreX(cats[i]) > 642) api.walkTo(i, 640, { tol: 2 });   // from the slab's west part: the hop spans ~115
      const specs = (f) => { const v = [{}, {}]; v[i] = { jump: f < 16, left: f > 0 && centreX(cats[i]) > 540 }; return v; };
      api.hold(specs, 40);
      api.land(i);
      if (feetY(cats[i]) > 145) api.block(`cat ${i} missed the platform hopping back from the Lift`);
    }
    // A presses the DelaySwitch from the ledge and steps off it (the Lift leaves 600 ticks later).
    function pressDelaySwitch() {
      api.walkTo(A, 552, { tol: 2, hop: true, max: 600 });
      api.until(() => delaySwitch.pressed, [], 10, 'the DelaySwitch did not take the press');
      api.walkTo(A, 470, { tol: 2 });
    }
    // A goes to the step; B, at the platform's west edge facing west, lifts A with its field and carries it (trailing
    // 46 px west) onto the Lift's west part, so the box (east end) still fits, and lets go.
    function liftAOntoLift() {
      api.walkTo([A, B], [72, 192], { tol: 1, hop: true, max: 600 });
      api.land();                                     // B faces west: its field {x 41, y 84, 110 x 80} covers the step
      api.hold((f) => [{ jump: f < 16 }, { action: true }], 20);
      api.until(() => magnetLockedOn(cats[A]), magnetB, 200,
        () => `B's field did not lock onto A (A ${centreX(cats[A]).toFixed(1)},${feetY(cats[A]).toFixed(1)})`);
      api.walkTo(B, 556, { tol: 1, extra: magnetB });
      api.hold((f) => [{}, { action: true, jump: f < 16, right: f > 0 && centreX(cats[B]) < B_ON_LIFT_X }], 40);
      api.land(B);
      api.wait(5);                                    // let go: A drops onto the Lift
      api.land();
      if (feetY(cats[A]) > 145 || feetY(cats[B]) > 145) api.block(`a cat missed the Lift (A ${JSON.stringify(api.snapshot()[A])}, B ${JSON.stringify(api.snapshot()[B])})`);
    }
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

    // 2. B grabs the SmallBox, carries it onto the Lift and sets it down at the slab's east end.
    api.walkTo(B, 440, { tol: 1 });
    api.hold([{}, { action: true }], 40);
    api.walkTo(B, 556, { tol: 1, extra: magnetB });
    api.hold((f) => [{}, { action: true, jump: f < 16, right: f > 0 && centreX(cats[B]) < 650 }], 40);
    api.land(B);
    if (feetY(cats[B]) > 145 || box.rect.x < 650) api.block(`box not carried onto the lift (B feet ${feetY(cats[B]).toFixed(1)}, box x ${box.rect.x.toFixed(1)})`);
    const liftRight = () => lift.rect.x + lift.rect.width;
    api.until(() => box.rect.x + box.rect.width >= liftRight() - 1, [{}, { action: true, right: true }], 60, 'the box never reached the slab end');
    api.hold([{}, {}], 20);                            // let go: the box rests on the slab
    if (box.rect.x + box.rect.width > liftRight() + 0.5 || Math.abs(box.rect.y + box.rect.height - lift.rect.y) > 1) {
      api.block(`the box is not resting on the Lift's east end (box ${JSON.stringify(box.rect)})`);
    }
    hopToPlatform(B);

    // 3. A presses the DelaySwitch and comes back to the step; B lifts A and carries it onto the Lift.
    pressDelaySwitch();
    liftAOntoLift();
    // B turns east (a one-tick tap; carrying A left it facing west), takes the box again and walks east until the box
    // hangs past the slab, held in the air.
    api.step([{}, { right: true }]);
    api.until(() => magnetLockedOn(box), magnetB, 60, 'B did not take the box on the Lift');
    api.until(() => box.rect.x >= liftRight() + 1, [{}, { action: true, right: true }], 60, 'the box never cleared the Lift edge');
    api.hold([{}, { action: true }], 10);

    // 4. The ride out: B drops the box onto the pillar switch; both ride back.
    api.until(() => lift.rect.x > LIFT_HOME_X + 5, [{}, { action: true }], 700, 'the Lift never left');
    api.until(() => box.rect.x + 24 >= BOX_RELEASE_X, [{}, { action: true }], 300, 'the box never reached the pillar');
    api.until(() => gate.opened, [], 120, () => `the box missed the pillar switch (box ${box.rect.x.toFixed(1)},${box.rect.y.toFixed(1)})`);
    api.until(() => lift.rect.x <= LIFT_HOME_X + 0.01, [], 600, 'the Lift never came home');
    if (feetY(cats[A]) > 145 || feetY(cats[B]) > 145) api.block('a cat fell off the Lift on the ride');

    // 5. Both hop onto the platform; A drops into the Key pit, takes the Key, re-presses the DelaySwitch and is lifted
    //    onto the Lift again.
    hopToPlatform(A);                                 // A (the west cat) first, out of B's way
    api.walkTo(A, 300, { tol: 3 });
    hopToPlatform(B);
    api.until(() => gate.rect.x + gate.rect.width < 230, [], 300, 'the lid never retracted');
    api.walkTo(A, 150, { tol: 3, max: 300 });         // off the platform's west end, down into the pit
    api.land(A);
    api.walkTo(A, 264, { tol: 3, max: 300 });
    api.until(() => api.carrierOfKey() === A, [], 120, 'A did not pick up the Key');
    pressDelaySwitch();
    liftAOntoLift();

    // 6. Both ride the Lift to the Goal side.
    api.until(() => lift.rect.x > LIFT_HOME_X + 5, [], 700, 'the Lift never left the second time');
    api.until(() => lift.rect.x >= LIFT_EXIT_X, [], 300, 'the Lift never reached the far end');
    api.until(() => feetY(cats[A]) > 430 && feetY(cats[B]) > 430 && cats[A].grounded && cats[B].grounded,
      [{ right: true }, { right: true }], 200, 'the cats did not reach the Goal floor');
    api.enterGoal();
  },
};
