// Keep the outgoing room opaque while the new scenery dissolves in underneath.
export function createSceneDissolve(frame, duration = 320) {
  let startedAt = null;
  return { zIndex: 1000, render(ctx) {
    if (!frame) return;
    const now = performance.now();
    startedAt ??= now;
    const opacity = Math.max(0, 1 - (now - startedAt) / duration);
    if (!opacity) { frame = null; return; }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  } };
}
