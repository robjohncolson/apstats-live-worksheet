// Player physics profiles for APStat Park. classroom-board.js is a classic
// script, so it cannot import this module: the park scene passes a profile
// object as PlayerSprite's `physics` and the sprite reads its fields.
//
// Units: `legacy` is per second (dt-scaled, today's calendar constants);
// `pico` is per fixed 1/60 s frame, at half the scale of PICO PARK's native
// measurements (y down). PlayerSprite keeps vx/vy in px/s for the relay pose
// either way; under `pico` it integrates an exact per-frame copy.

export const STEP = 1 / 60;
// The engine caps a render frame's dt at 0.1 s (canvas_engine.js); 6 steps
// cover it, so nothing is dropped unless the cap itself was hit.
export const MAX_STEPS = 6;

// Equal to WALK_SPEED / JUMP_V0 / GRAVITY in classroom-board.js.
export const LEGACY = Object.freeze({ name: 'legacy', walkSpeed: 120, jumpV0: -280, gravity: 800 });

export const PICO = Object.freeze({
  name: 'pico',
  perFrame: true,
  walk: 1.5,             // px/frame, instant start/stop, full air control
  launchVy: -2.55,       // launch frame sets vy only: no x or y movement that frame
  gravity: 0.325,        // px/frame^2, applied AFTER position: y += vy; boost; vy += g
  boost: 0.51,           // held frame k (1..boostFrames): vy -= boost * (1 - k / boostDiv)
  boostFrames: 13,
  boostDiv: 14,
  terminal: 9.75,        // max fall speed, px/frame
  coyoteFrames: 4,       // a jump is allowed after 0..4 airborne frames, not 5
  // Hitbox: 16 px wide (half of the native 32), centred on the 20 px sprite.
  // Height stays 24 (the visible cat and the relay's y+24 feet checks), not 23.
  bodyW: 16,
  bodyOffsetX: 2,
  bodyH: 24,
  supportHalfWidth: 17,  // a rider stays supported while centres are within this
  snapMax: 16            // a carrier that jumps further than this in one frame drops its rider
});

export function profileFor(level) {
  return level && level.physics === 'pico' ? PICO : LEGACY;
}

// Fixed-step accumulator. advance(dt, step) calls step() once per whole
// STEP of accumulated time, at most MAX_STEPS times; returns the count.
// Leftover time past the cap is discarded so a stall never causes a burst.
export function createFixedStep(stepSeconds = STEP, maxSteps = MAX_STEPS) {
  let acc = 0;
  return {
    advance(dt, step) {
      if (!(dt > 0)) return 0;
      acc += dt;
      let count = 0;
      // The epsilon absorbs float drift (0.1 s is exactly 6 steps).
      while (acc >= stepSeconds - 1e-9 && count < maxSteps) {
        acc -= stepSeconds; count++;
        if (step() === false) { acc = 0; break; }
      }
      if (count === maxSteps && acc >= stepSeconds - 1e-9) acc = 0;
      if (acc < 0) acc = 0;
      return count;
    },
    step: stepSeconds,
    reset() { acc = 0; },
    get pending() { return acc; }
  };
}
