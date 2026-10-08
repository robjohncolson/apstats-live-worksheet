// 10-2 TWO PLAYERS (stage_jump04).
// The map (party 2, cats 32x46, walk/air speed 4.9 per tick, gravity 0.65 per tick^2, a held jump rises ~79):
// - Spawn floor y 432 (x 48..672). A 144-tall block (x 384..672, top 288) stands between the spawn and the rest.
//   On top: the Bridge "1" switch (x 464..496). Bridge 1 is a head-push bridge: while the switch is held it grows a
//   64-wide step out of the block's WEST face (x 320..384, top 360) and shoves a cat standing there west.
// - Past the block: a pit x 672..864 with a Warp below (x 624..912, y 576..672) that returns a fallen cat to the block
//   top (x 576). A ceiling slab x 816..1104 hangs down to y 288, so over x 816+ only a cat whose feet are >= 334 fits.
// - East floor y 432 from x 864: Bridge 2 switch (x 944..976) grows Bridge 2 west from x 912 across the pit at floor
//   level (to x ~624) while held.
// - A JumpStand (solid 32x34, x 1400..1432, top 398) launches a cat resting on it with nothing on its head to feet
//   ~234 (rise 164), and relaunches it on every landing. A floating block x 1296..1344, y 240..288 sits west of it.
// - A pillar x 1488..1536, y 192..336 with the Gate (x 1497.6..1527.6) closing the 96-high gap under it. The Gate
//   sinks into the floor (~2 per tick, open after ~55 ticks) while its Switch on the FAR side (x 1568..1600) is held.
// - Two RouletteLifts: platforms 118x18 at y 391 (x 1909..2027 and 2149..2267), each with a solid 58x58 trigger block
//   130 above the platform. Head-bumping a trigger while its roulette shows 0 (state cycles every 0.4 s with a random
//   modulus 2..4) raises that lift 60; a bump on another state resets both. A lift cannot win twice ahead of its
//   partner, and a lift with no rider for 2 s resets both. The Key (x 2072..2104, y 68..124) hangs between them:
//   a cat jumping right off lift 1 needs lift 1 at round 3 (platform 211). Door x 2328..2376.
// - CollisionChangePlayer sensors above the three switches rotate the input slots by the party size; with party 2
//   the rotation is the identity (playerInputSlots stays [1, 0]; the driver's step() already maps cats to slots).
//
// Route:
// 1. Block (RELAY jump): cat 1 stands against the block's west face (x 366), cat 0 climbs onto its head; cat 0
//    presses+holds jump, cat 1 presses+holds jump 2 ticks later; cat 0 lands back on the rising cat 1 near its apex,
//    jumps again holding right and lands on the block top.
// 2. Cat 0 stands on the Bridge 1 switch (x ~480); the step grows and shoves cat 1 to x ~304; cat 1 hops onto the
//    step (feet 360) and then onto the block.
// 3. Pit: cat 1 rides cat 0's head; cat 0 walks east off the block edge (holding right); cat 1 jumps off the FALLING
//    carrier 21 ticks after it leaves the edge (rider feet ~391, already under the slab) holding right and lands on
//    the east floor at centre ~927. Cat 0 falls into the Warp and reappears on the block top.
// 4. Cat 1 stands on the Bridge 2 switch (x 960); cat 0 walks off the block onto Bridge 2 and across under the slab.
// 5. JumpStand: cat 1 hops onto the stand; while launched it steers to x ~1360 (clear of the floating block) and,
//    once its feet are above y 240, onto the floating block (feet 240). Cat 0 hops onto the stand and keeps bouncing.
//    Cat 1 jumps right off the floating block ~6 ticks before cat 0's second launch and lands on cat 0's head near
//    its apex (feet ~217), then jumps off it (any body contact below allows a jump) holding right: apex feet ~138,
//    clears the pillar top (192) and lands on the far floor (x ~1659).
// 6. Cat 1 walks back onto the Gate switch; the Gate sinks; cat 0 steps off the stand and walks under the pillar.
// 7. RouletteLifts: cat 1 on lift 2, cat 0 on lift 1; they bump the triggers on roulette 0 in the order
//    L1, L2, L1, L2, L1 (lift 1 to round 3), then cat 0 jumps right off lift 1 to the Key, and both cats go over
//    lift 2 to the door. A rider falls back onto its RISING platform after each bump (land-on-rising-lift).

const JUMP_AT = 21;            // pit: rider jumps this many ticks after the carrier leaves the block edge
const STAND_X = 1416;          // JumpStand centre
const BLOCK_TOP = 240;         // floating block x 1296..1344, top y 240
const RELAY_LEAD = 6;          // cat 1 leaves the floating block this many ticks before cat 0's second launch

export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats, game } = api;
    const cx = api.centreX;
    const feet = api.feetY;

    // 1. Relay jump onto the block.
    api.walkTo(1, 366, { tol: 2 });
    api.climbOnto(0, 1, { from: 300 });
    api.wait(5);
    let relayAt = null;
    let wasAirborne = false;
    for (let f = 0; f < 90; f++) {
      const top = { jump: f < 16 };
      const carrier = { jump: f >= 2 && f < 18 };
      if (f > 3 && !cats[0].grounded) wasAirborne = true;
      if (wasAirborne && cats[0].grounded && relayAt == null) relayAt = f;
      if (relayAt != null) {
        top.jump = f > relayAt && f < relayAt + 17;
        top.right = true;
        if (cats[0].grounded && feet(cats[0]) <= 289) break;
      }
      api.step([top, carrier]);
    }
    api.land();
    if (feet(cats[0]) > 289) api.block(`relay jump failed: cat 0 feet ${feet(cats[0]).toFixed(1)}, block top 288`);

    // 2. Cat 0 holds the Bridge 1 switch; cat 1 climbs the step, then the block.
    api.walkTo(0, 480, { tol: 3 });
    const step = game.bridges.find((bridge) => bridge.spawn?.label === '1') || game.bridges[0];
    api.until(() => step.rect.x <= 321 && cats[1].grounded, [], 120, 'Bridge 1 step never grew');
    api.hold((f) => [{}, { jump: f < 16, right: f > 2 && feet(cats[1]) < 395 }], 40);
    api.land();
    api.hold((f) => [{}, { jump: f < 16, right: cx(cats[1]) < 420 }], 40);
    api.land();
    if (feet(cats[1]) > 289) api.block(`cat 1 did not reach the block top via the step (feet ${feet(cats[1]).toFixed(1)})`);

    // 3. Pit: cat 0 carries cat 1 off the block edge; cat 1 jumps off the falling carrier, holding right.
    api.walkTo(0, 600, { tol: 3 });
    api.climbOnto(1, 0, {});
    api.wait(2);
    let left = -1;
    for (let f = 0; f < 120; f++) {
      if (left < 0 && !cats[0].grounded) left = f;
      const t = left < 0 ? -99 : f - left;
      api.step([{ right: t < 26 }, { jump: t >= JUMP_AT && t < JUMP_AT + 16, right: t >= JUMP_AT }]);
      if (t > JUMP_AT + 2 && cats[1].grounded) break;
    }
    if (!(cats[1].grounded && feet(cats[1]) >= 431 && cx(cats[1]) > 864)) {
      api.block(`pit: cat 1 did not land on the east floor (centre ${cx(cats[1]).toFixed(1)}, feet ${feet(cats[1]).toFixed(1)})`);
    }
    api.land();

    // 4. Cat 1 holds the Bridge 2 switch; cat 0 crosses on Bridge 2 under the slab; both walk east.
    api.walkTo(1, 960, { tol: 2 });
    api.walkTo(0, 920, { tol: 3, label: 'cat 0 across Bridge 2' });
    api.walkTo([1, 0], [1200, 1150], { tol: 3 });

    // 5. JumpStand: cat 1 launches onto the floating block; cat 0 bounces on the stand; cat 1 relays off its head.
    const A = cats[1];
    const B = cats[0];
    api.walkTo([1, 0], [1380, 1250], { tol: 2 });
    let phase = 0;
    for (let f = 0; f < 140; f++) {
      if (phase === 0 && f > 3 && A.grounded && Math.abs(feet(A) - 398) < 1) phase = 1;   // resting on the stand
      if (phase === 1 && feet(A) < 380) phase = 2;                                         // launched
      if (phase === 2 && feet(A) < BLOCK_TOP - 0.5) phase = 3;                              // above the block top
      const target = phase <= 1 ? STAND_X : phase === 2 ? 1361 : 1330;
      const dx = target - cx(A);
      api.step([{}, { jump: phase === 0 && f < 14, right: dx > 2.5, left: dx < -2.5 }]);
      if (phase === 3 && A.grounded) break;
    }
    if (!(A.grounded && Math.abs(feet(A) - BLOCK_TOP) < 1)) {
      api.block(`cat 1 did not land on the floating block (centre ${cx(A).toFixed(1)}, feet ${feet(A).toFixed(1)})`);
    }
    api.walkTo(0, 1380, { tol: 2 });
    let prevFeetB = feet(B);
    let launches = 0;
    let secondLaunch = -1;
    let onAt = -1;
    let relay = 0;
    for (let f = 0; f < 260; f++) {
      // A launch moves the stand's cat up 14.3 in one tick.
      if (prevFeetB - feet(B) > 10) {
        launches += 1;
        if (launches === 2) secondLaunch = f;
      }
      prevFeetB = feet(B);
      const dxB = STAND_X - cx(B);
      const b = { jump: f < 14 && launches === 0, right: dxB > 2.5, left: dxB < -2.5 };
      const t = secondLaunch < 0 ? -999 : f - secondLaunch;
      const onHead = Math.abs(feet(A) - B.rect.y) < 1.5 && Math.abs(cx(A) - cx(B)) < 32;
      if (relay === 0 && t >= -RELAY_LEAD) relay = 1;
      if (relay === 1 && t > 3 - RELAY_LEAD && onHead) { relay = 2; onAt = f; }
      let a = {};
      if (relay === 1) {
        const dx = cx(B) - cx(A);
        a = { jump: t < 16 - RELAY_LEAD, right: dx > 2.5, left: dx < -2.5 };
      }
      if (relay === 2) a = { jump: f < onAt + 16, right: true };
      api.step([b, a]);
      if (relay === 2 && f > onAt + 3 && A.grounded) break;
    }
    if (!(A.grounded && cx(A) > 1552 && feet(A) >= 431)) {
      api.block(`cat 1 did not clear the pillar (centre ${cx(A).toFixed(1)}, feet ${feet(A).toFixed(1)})`);
    }

    // 6. Cat 1 holds the Gate switch; cat 0 leaves the stand and walks under the pillar.
    const gate = game.gates[0];
    api.walkTo(1, 1604, { tol: 2 });
    api.until(() => gate.rect.y >= 431, [], 120, 'the Gate never opened');
    api.until(() => B.rect.x > gate.rect.x + gate.rect.width + 0.5, [{ right: true }], 200, 'cat 0 could not pass the Gate');

    // 7. RouletteLifts: cat 1 rides lift 2, cat 0 lift 1; bump on roulette 0 until lift 1 is at round 3.
    api.walkTo(1, 2208, { tol: 3, hop: true, max: 400 });
    api.walkTo(0, 1968, { tol: 3, hop: true, max: 400 });
    const [lift1, lift2] = game.rouletteLifts;
    const settled = (lift) => Math.abs(lift.offset - lift.round * lift.params.travelPerRound) < 0.01;
    const plan = [[lift1, 0], [lift2, 1], [lift1, 0], [lift2, 1], [lift1, 0]];
    for (const [lift, rider] of plan) {
      const want = lift.round + 1;
      let prev = lift.rouletteState;
      api.until(() => {
        const ok = !lift.busy && lift.rouletteState === 0 && prev !== 0;
        prev = lift.rouletteState;
        return ok;
      }, [], 300, 'the roulette never turned to 0');
      for (let f = 0; f < 40 && lift.round < want; f++) {
        const specs = [];
        specs[rider] = { jump: f < 10 };
        api.step(specs);
      }
      if (lift.round < want) {
        const cat = cats[rider];
        api.block(`RouletteLift ${lift.spawn.label} round ${lift.round}: cat ${rider} could not jump into the trigger -- ` +
          `it landed on the rising platform 0.2 inside it and stays grounded=false, vy ${cat.velocity.y}, unable to ` +
          `walk or jump (feet ${feet(cat).toFixed(2)} vs platform top ${lift.platformRect.y})`);
      }
      api.until(() => settled(lift1) && settled(lift2), [], 400, 'the lifts never settled');
    }

    // 8. Cat 0 jumps right off lift 1 to the Key, then everybody goes to the door.
    api.walkTo(0, 2030, { tol: 2 });
    for (let f = 0; f < 80; f++) {
      api.step([{ jump: f < 16, right: true }]);
      if (api.carrierOfKey() >= 0 && B.grounded) break;
    }
    if (api.carrierOfKey() < 0) api.block('cat 0 missed the Key from lift 1');
    api.enterGoal();
  },
};
