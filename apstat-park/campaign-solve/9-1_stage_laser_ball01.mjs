// 9-1 BALL PARK (stage_laser_ball01).
// The puzzle: the LaserBallPitcher on the right fires one ball at a time straight left along the floor (ball lane
// y 386..410). The LaserKeyBox on the far left breaks after THREE CONSECUTIVE ball hits and drops a Key at (75,404).
// A ball that touches a cat first resets the box's hit count and the pitcher's speed. Each box hit speeds up the next
// ball (party 2: 7 -> 12.6 -> 22.68 px/tick).
// Route: both cats stand still at their spawns and jump together so their feet are above the lane while each ball
// passes under them. The jump is timed from the live ball position (see jumpPressTick). After the third hit the box
// fades for 40 ticks; then cat 0 walks left to the Key and carries it to the Goal (672,434), and both enter with UP.
export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { game, cats } = api;
    const cannon = game.nativeCannons[0];
    const keyBox = game.nativeKeyBoxes[0];

    // Measured jump (jump held 20 ticks): the press tick is step 0; feet are above y 385 on steps 8..32.
    const HIGH_FIRST = 8;
    const HIGH_LAST = 32;
    const HOLD_JUMP = 20;
    const BALL_R = 12;
    const MARGIN = 2;

    const bothGrounded = () => cats.every((cat) => cat.grounded);
    const ballInFlight = () => {
      const ball = cannon.ball;
      if (!ball || ball.gone || ball.fadeFrames > 0 || ball.delaySeconds > 0) return null;
      if (ball.vx >= 0) return null;
      return ball;
    };

    // Danger zone for the ball centre: the cats' combined x span widened by the ball radius.
    const dangerZone = () => {
      const left = Math.min(...cats.map((cat) => cat.rect.x)) - BALL_R - MARGIN;
      const right = Math.max(...cats.map((cat) => cat.rect.x + cat.rect.width)) + BALL_R + MARGIN;
      return { left, right };
    };

    // Steps (counted from a press made this tick) on which the ball centre is inside the danger zone.
    // After step k the ball centre is at x - (k + 1) * speed. One extra tick of margin on each side.
    const dangerSteps = (ball) => {
      const { left, right } = dangerZone();
      const speed = -ball.vx;
      const enter = Math.ceil((ball.x - right) / speed) - 1;
      const leave = Math.ceil((ball.x - left) / speed) - 1;
      return { first: enter - 1, last: leave + 1 };
    };

    // Press now when the danger steps sit in the middle of the high window [HIGH_FIRST, HIGH_LAST].
    const shouldPressNow = (ball) => {
      const { first, last } = dangerSteps(ball);
      const slack = (HIGH_LAST - HIGH_FIRST) - (last - first);
      if (slack < 0) api.block(`ball at ${(-ball.vx).toFixed(2)} px/tick spends ${last - first} steps over the cats; jump window is ${HIGH_LAST - HIGH_FIRST}`);
      return first <= HIGH_FIRST + Math.floor(slack / 2);
    };

    // One ball: wait until it is in flight and on time, jump both cats, then wait until it has hit the box.
    async function dodgeOneBall(hitsBefore) {
      api.land(undefined, 120);
      api.until(() => {
        const ball = ballInFlight();
        return ball && ball.x > dangerZone().right && shouldPressNow(ball);
      }, [], 400, 'no laser ball came within 400 ticks');
      api.hold((f) => [{ jump: f < HOLD_JUMP }, { jump: f < HOLD_JUMP }], HIGH_LAST + 2);
      api.until(() => keyBox.hits !== hitsBefore || keyBox.breaking, [], 200,
        () => `ball ${hitsBefore + 1} did not hit the LaserKeyBox (hits ${keyBox.hits}, speed ${cannon.speed})`);
      if (!keyBox.breaking && keyBox.hits !== hitsBefore + 1) api.block(`a ball touched a cat: hits reset to ${keyBox.hits}`);
    }

    api.wait(5);
    for (let hits = 0; hits < 3; hits++) await dodgeOneBall(hits);
    if (!keyBox.breaking) api.block(`LaserKeyBox not breaking after three hits (hits ${keyBox.hits})`);

    // The box stays solid while it fades (40 ticks); then the Key sits at (75,404).
    api.land(undefined, 120);
    api.until(() => !game.nativeKeyBoxes.includes(keyBox) || keyBox.breakFrames <= 0, [], 120, 'LaserKeyBox never finished fading');
    api.until(() => game.keys.length > 0, [], 60, 'no Key appeared after the LaserKeyBox broke');
    api.walkTo(0, 75, { tol: 3, label: 'cat 0 to the Key' });
    api.until(() => api.carrierOfKey() === 0, [], 60, 'cat 0 did not pick up the Key');
    api.enterGoal();
  },
};
