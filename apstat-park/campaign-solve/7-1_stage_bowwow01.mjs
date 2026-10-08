// 7-1 MOVE AND STOP (stage_bowwow01).
// Map: one flat room, floor top y 432 (chip row 9), walls left (col 0) and right; cats spawn at x 100 / 150.
// Key at x 768 (on the floor, y 384); door at x 1056. A BowwowEnemy (60 x 78 rect, view centre (768, 280), bobbing
// +-8 while asleep, chase speed p0 = 10 px/tick) floats over the key, high enough that a cat walking under it while
// it sleeps is never touched.
// Native dog rule (runtime BowwowEnemy, cited in the batch-6 brief): every frame each cat's 30-frame MEAN movement
// (net displacement of its feet centre over the last 30 frames / 30) is measured. A cat is a target only if that mean
// is > 0 and |cat x - dog x| < 300 (asleep, state 0) or < 400 (states 1..3).
//   0 -> 1 on any target; 1 -> 2 (warn) when the best mean > 1.5; 2 -> 0 when no target, -> 3 (chase) when > 2.5.
//   State 3 never ends: the dog steers toward a moving in-range cat and otherwise keeps flying on its last heading.
// So only the 30-frame mean matters, not single frames. Walking is ~4.9 px/frame, so a cat inside the range must
// cover < 45 px per any 30-frame window. Route: walk both cats at full speed to just outside the asleep range
// (x < 468), stand 31 frames so the ring empties, then SNEAK: each cat steps only while its own displacement over
// the last 29 frames plus one more step (+ release slide) stays under SNEAK_CAP px. The dog goes 0 -> 1 on the first
// sneak step and stays at 1 (harmless, it never moves). Cat 1 sneaks over the key (pickup by touch), both sneak to
// the door; cat 1 taps UP in the door sensor (opens it / enters) and sneaks on past it (an entered cat is still a body),
// then cat 0 sneaks into the door and taps UP.
// Measured: the cap settles into a steady 30-frame cadence of 8 moving frames (walk + coast) / 22 still frames; the
// highest in-range 30-frame mean is 1.31, the dog stays in state 1 the whole time; SOLVED in 666 frames.
// Traps: a trailing cat that touches the floating carried key takes it over (keep KEY_GAP); the key pickup registers
// one frame after the carrier first overlaps it; enterGoal() walks at full speed and would wake the dog -- don't use it.
const DOG_X = 768;
const SAFE_X = 430;          // centre x outside the asleep range (|dx| < 300 means x > 468)
const SNEAK_CAP = 42;        // px per 30 frames (mean 1.4 < 1.5) incl. one step + slide margin
const STEP_PX = 6;           // assumed movement of one walk frame plus coast
const KEY_GAP = 150;         // cat 0 trails this far: the carried key floats behind its carrier and a cat touching
                             // it takes it over (measured: at 60 apart the key passed from cat 1 to cat 0)

export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const dog = game.bowwowEnemies[0];
    const door = game.goals[0];
    const doorX = door.rect.x + door.rect.width / 2;
    const feet = (c) => ({ x: api.centreX(cats[c]), y: api.feetY(cats[c]) });
    const hist = cats.map(() => []);   // last 30 feet positions per cat (observation only)

    const checkDog = (what) => {
      if (dog.chaseState >= 2) api.block(`dog reached state ${dog.chaseState} while ${what}`);
      if (cats.some((c) => c.deathTimer > 0)) api.block(`a cat died while ${what}`);
    };
    const record = () => cats.forEach((_, c) => { hist[c].push(feet(c)); if (hist[c].length > 30) hist[c].shift(); });
    // Displacement over the last 29 frames; with the frame about to be taken it is exactly the native 30-delta ring.
    const recent = (c) => {
      const h = hist[c];
      if (h.length < 30) return Infinity;
      const a = h[0], b = h[h.length - 1];
      return Math.hypot(b.x - a.x, b.y - a.y);
    };

    // 1. Full-speed approach to the edge of the asleep range, then let the movement ring empty.
    api.walkTo([0, 1], [SAFE_X - 50, SAFE_X], { tol: 3 });
    api.hold([], 31);
    for (let i = 0; i < 30; i++) record();
    if (dog.chaseState !== 0) api.block(`dog woke during the approach (state ${dog.chaseState})`);

    // 2. Sneak each listed cat toward its target x; done when all are within tol and standing.
    const sneak = (targets, label, { tol = 4, max = 2500, extra = () => ({}) } = {}) => {
      api.until(() => Object.entries(targets).every(([c, x]) => Math.abs(api.centreX(cats[c]) - x) <= tol),
        () => {
          checkDog(label);
          record();
          const specs = [];
          for (const [c, x] of Object.entries(targets)) {
            const dx = x - api.centreX(cats[c]);
            const ok = Math.abs(dx) > tol && recent(c) + STEP_PX <= SNEAK_CAP;
            specs[c] = { ...(ok ? (dx > 0 ? { right: true } : { left: true }) : {}), ...extra(+c) };
          }
          return specs;
        }, max, `${label}: not done (dog state ${dog.chaseState})`);
      checkDog(label);
    };
    {
      sneak({ 1: DOG_X, 0: DOG_X - KEY_GAP }, 'sneaking cat 1 to the key');
      // the pickup is checked before the move in a tick, so it lands one standing frame after arrival
      api.until(() => api.carrierOfKey() === 1, () => { checkDog('waiting for the key'); record(); return []; }, 3,
        'cat 1 never picked up the key');
      if (api.carrierOfKey() !== 1) api.block(`cat 1 stands at the key (x ${Math.round(api.centreX(cats[1]))}) but has not picked it up`);
      sneak({ 1: doorX, 0: doorX - KEY_GAP }, 'sneaking both cats to the door');
      // 3. Enter: UP taps only (no motion). Cat 1 (key) first, then cat 0 sneaks into the door and taps UP.
      let f = 0;
      api.until(() => game.goalClearedPlayers?.has(cats[1]) || api.cleared,
        () => { checkDog('cat 1 entering'); record(); f++; return [{}, { up: f % 2 === 0 }]; }, 120, 'cat 1 could not enter the door');
      // an entered cat is still a body: cat 1 sneaks on past the door so cat 0 can stand in it
      sneak({ 1: doorX + 50, 0: doorX }, 'cat 1 clears the door, cat 0 to the door centre', { tol: 6 });
      f = 0;
      api.until(() => api.cleared,
        () => { checkDog('cat 0 entering'); record(); f++; return [{ up: f % 2 === 0 }, {}]; }, 120,
        () => `cat 0 could not enter the door (opened ${!!door.opened})`);
    }
  },
};
