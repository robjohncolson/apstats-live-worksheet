const V = new URL(import.meta.url).search;
const { pixelText } = await import('./pixel-text.mjs' + V);

// Recovered bb2bbf0 phases 21/22: 0.8s lead-in, then a one-second title entrance.
// bb2c2c0 draws CLEAR at x = t * (640 + t), clamped at t = 1.
export const CLEAR_DELAY_MS = 800;
export const CLEAR_SLIDE_MS = 1000;
export const CLEAR_WHITENING = 0.72;

export function createStageClear() {
  let startedAt = null, scene = null;
  return {
    sample(complete, identity, now, width, height) {
      if (identity !== scene || !complete) { startedAt = null; scene = identity; }
      if (!complete) return null;
      startedAt ??= now;
      const elapsed = Math.max(0, now - startedAt);
      const whitening = CLEAR_WHITENING * Math.min(1, elapsed / CLEAR_DELAY_MS);
      const t = Math.max(0, Math.min(1, (elapsed - CLEAR_DELAY_MS) / CLEAR_SLIDE_MS));
      const slide = t * (640 + t) / 641;
      const size = Math.max(28, Math.min(56, Math.floor(width / 9)));
      const textWidth = 35 * Math.max(1, Math.round(size / 7));
      return { whitening, visible: elapsed >= CLEAR_DELAY_MS, size,
        x: -textWidth / 2 + (width / 2 + textWidth / 2) * slide,
        y: height / 2 + size / 2,
        // These two filters implement c' = c * (1 - w) + w, preserving alpha.
        filter: `contrast(${(1 - whitening) / (1 + whitening)}) brightness(${1 + whitening})` };
    },
    render(ctx, frame) {
      if (!frame?.visible) return;
      ctx.save();
      ctx.filter = 'none';
      pixelText(ctx, 'CLEAR!', frame.x, frame.y, frame.size, '#71451f', 'center');
      ctx.restore();
    },
  };
}
