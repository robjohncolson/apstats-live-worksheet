const V = new URL(import.meta.url).search;
const { createFixedStep } = await import('./physics.mjs' + V);

// Half-scale Pico's held jump rises about 39px. Keep approach rises <= 36px.
export function approachSteps(summary) {
  return summary
    ? [{ x: 70, y: 668, w: 48, h: 8 }, { x: 90, y: 636, w: 48, h: 8 }]
    : [{ x: 80, y: 668, w: 48, h: 8 }];
}

export function createCalculatorMotion(player, input, presses = {}, onJump = () => {}) {
  const clock = createFixedStep();
  const consumed = { ...presses };
  const walking = player.physics;
  const running = { ...walking, walk: walking.walk * 2 };
  return {
    advance(dt) {
      clock.advance(dt, () => {
        const forced = [];
        for (const key of Object.keys(presses)) {
          if (presses[key] === consumed[key]) continue;
          consumed[key] = presses[key];
          if (key === 'jump') player._jumpHandled = false;
          if (key === 'up') player._upHandled = false;
          if (!input[key]) { input[key] = true; forced.push(key); }
        }
        try {
          player.physics = input.run ? running : walking;
          player.update(clock.step);
          if (player._boostK === 0 && player.vy < 0) onJump();
        } finally {
          player.physics = walking;
          for (const key of forced) input[key] = false;
        }
      });
    },
  };
}
