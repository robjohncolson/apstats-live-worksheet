// 9-2 BALL PARK (stage_seesaw01) -- native seesaw-and-balance + seesaw-box2d (the ball, planks and PhysicsArea are a
// real Box2D 2.3 world: planck, stepped once per tick with (1/60, 10, 10)).
// Cats never touch the three planks: they steer them from the floor strip through the two Balance pans (left pan
// x 93..287, right pan x 993..1187, each beside a two-step stair whose upper step is x 288..320 / 960..992, top 608).
// One cat on a pan = full tilt (6.95 deg) toward that side; the pans move ~1 px/tick, so a full flip takes ~110 ticks.
// The ball drops onto the top plank at x 410 and waits there until the planks tilt. The route:
//   1. cat 0 waits on the right upper step, cat 1 on the left upper step (the pans sit 11 px above the steps: hop on);
//   2. cat 0 hops onto the right pan -> tilt right: the ball rolls right along the top plank;
//   3. when the ball passes FLIP_LEFT_AT, cat 0 hops back to its step and cat 1 hops onto the left pan -> tilt left.
//      The ball still leaves the top plank at x 790 (the flip takes ~55 ticks to cross level), lands on the middle
//      plank near x 840, slows, reverses and rolls left;
//   4. when the reversed ball passes FLIP_RIGHT_AT (still on the middle plank), the cats swap again -> tilt right.
//      The ball keeps rolling left off the middle plank's left end (x 490) onto the bottom plank, reverses there, rolls
//      right off x 790 and lands on the room floor just left of the PhysicsSwitch; its bounces cross the 16 px ray at
//      x 905.6 -> the Key (640,598) appears;
//   5. a cat takes the key and the party enters the Goal (640,674) with UP.
// The two flip points were swept with the cats in the Box2D runtime (FLIP_LEFT_AT 460..650 x FLIP_RIGHT_AT 620..860,
// 10 / 20 px grid, then 5 px around the centre): the switch latches for FLIP_LEFT_AT 490..550 with FLIP_RIGHT_AT
// about FLIP_LEFT_AT + 210..270; the values below sit in the middle of that band (every 5 px neighbour also clears).
const FLIP_LEFT_AT = 520;    // ball x on the top plank (moving right) at which the tilt is flipped to the left
const FLIP_RIGHT_AT = 760;   // ball x on the middle plank (moving left) at which the tilt is flipped back right

const RIGHT_STEP_X = 975;    // cat centre on the right upper step, just clear of the right pan
const LEFT_STEP_X = 305;     // cat centre on the left upper step, just clear of the left pan
const RIGHT_PAN_X = 1060;
const LEFT_PAN_X = 220;

/** The 9-2 solver with its two flip points (ball x); the default export uses the recorded values. */
export function seesawSolver(flipLeftAt = FLIP_LEFT_AT, flipRightAt = FLIP_RIGHT_AT) {
  return {
    party: 2,
    budget: 3000,
    async solve(stage, api) {
      const { game, walkTo, jumpTo, until, wait } = api;
      const pitcher = game.physicsPitchers[0];
      const physicsSwitch = game.nativePhysicsSwitches[0];
      const key = game.keys[0];

      // 1. Station the cats beside the pans.
      walkTo([0, 1], [RIGHT_STEP_X, LEFT_STEP_X], { hop: true, max: 600, stall: 200 });
      wait(5);
      const ball = pitcher.ball;
      if (!ball) api.block('no physics ball on the top plank after the walk to the steps');
      const wasted = () => pitcher.ball !== ball || ball.countdown > 0;
      const ballNumbers = () => `ball x ${ball.x.toFixed(1)} y ${ball.y.toFixed(1)} vx ${ball.vx.toFixed(2)}`;

      // 2. Tilt right.
      jumpTo(0, RIGHT_PAN_X);
      until(() => ball.x >= flipLeftAt || wasted(), [], 600, () => 'ball never reached the first flip: ' + ballNumbers());
      if (wasted()) api.block('ball lost before the first flip: ' + ballNumbers());

      // 3. Tilt left: cat 0 back to its step, cat 1 onto the left pan.
      jumpTo([0, 1], [RIGHT_STEP_X, LEFT_PAN_X]);
      until(() => (ball.vx < 0 && ball.x <= flipRightAt) || wasted(), [], 900,
        () => 'ball never came back along the middle plank: ' + ballNumbers());
      if (wasted()) api.block('ball lost before reversing on the middle plank: ' + ballNumbers());

      // 4. Tilt right again: the cats swap back.
      jumpTo([0, 1], [RIGHT_PAN_X, LEFT_STEP_X]);
      // The ball lands on the room floor before the ray: that contact starts its 30-tick death countdown, but it keeps
      // moving for 15 ticks, so wait for the switch or for the ball to be gone (not merely for the countdown).
      until(() => physicsSwitch.latched || pitcher.ball !== ball, [], 900, () => 'switch not pressed: ' + ballNumbers());
      if (!physicsSwitch.latched) api.block('ball lost without crossing the switch ray at x 905.6: ' + ballNumbers());

      // 5. Key, then the door.
      walkTo(0, 640, { hop: true, max: 600, stall: 200 });
      until(() => api.carrierOfKey() >= 0, () => [{ left: centreX(game.players[0]) > 640 }], 120,
        () => 'cat 0 could not take the key at (640,598): key active ' + key.active);
      api.enterGoal();
    },
  };
}

export default seesawSolver();

function centreX(cat) { return cat.rect.x + cat.rect.width / 2; }
