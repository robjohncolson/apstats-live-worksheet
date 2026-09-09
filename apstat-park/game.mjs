import { ParkWorld } from './world.mjs';

const colorFor = name => 'hsl(' + [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0) + ' 65% 70%)';

export function mountParkGame({ container, replica, member, drawAvatar, onExit = () => {}, connected = () => true }) {
  const doc = container.ownerDocument;
  const heading = doc.createElement('div'), hint = doc.createElement('p');
  heading.style.cssText = 'font-weight:700;margin:4px 0';
  hint.style.cssText = 'margin:4px 0;color:#b8d4c8;font-size:12px';
  const canvas = doc.createElement('canvas'); canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'APStat Park puzzle. Arrows or A and D to move. Space to jump. E or Up to help or enter a door.');
  canvas.style.cssText = 'display:block;width:100%;height:220px;background:#10282d;border-radius:8px;touch-action:none';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'margin:6px 0;min-height:2.5em';
  const controls = doc.createElement('div'); controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  container.append(heading, canvas, hint, status, controls);
  const input = { left: false, right: false, jump: false };
  let world = null, worldEpoch = null, animation, last = performance.now(), disposed = false;
  let width = 640, height = 220, cameraX = 0, cameraY = 360;
  const ctx = canvas.getContext('2d');
  const clearInput = () => { input.left = input.right = input.jump = false; };
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  function resize() {
    width = Math.max(240, canvas.getBoundingClientRect().width || 640);
    const dpr = Math.min(doc.defaultView.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observer = new doc.defaultView.ResizeObserver(resize); observer.observe(canvas); resize();
  const act = () => {
    if (!world || !replica.state) return;
    if (Math.hypot(world.player.x - world.level.exit.x, world.player.y - world.level.exit.y) < 40) { onExit(); return; }
    const action = world.nearby(member, replica.state.progress);
    if (action) replica.queue(action.kind, action.target, world.pose());
  };
  const key = event => {
    const pressed = event.type === 'keydown';
    const bindings = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump' };
    if (bindings[event.code]) { event.preventDefault(); input[bindings[event.code]] = pressed; }
    if (pressed && !event.repeat && ['KeyE', 'ArrowUp', 'KeyW'].includes(event.code)) { event.preventDefault(); act(); }
    if (pressed && event.code === 'Escape') { event.preventDefault(); onExit(); }
  };
  canvas.addEventListener('keydown', key); canvas.addEventListener('keyup', key); canvas.addEventListener('blur', clearInput);
  const visibility = () => { if (doc.hidden) clearInput(); };
  doc.defaultView.addEventListener('blur', clearInput); doc.addEventListener('visibilitychange', visibility);
  for (const [label, name] of [['Left', 'left'], ['Right', 'right'], ['Jump', 'jump'], ['Help / enter', 'act']]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.style.cssText = 'padding:8px 14px;touch-action:none;background:#254a43;color:#fff;border:1px solid #537868;border-radius:7px;cursor:pointer';
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      if (name === 'act') act(); else input[name] = true;
    });
    // Keyboard activation remains available for the accessible control buttons.
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault(); if (name === 'act') { if (!event.repeat) act(); } else input[name] = true;
    });
    button.addEventListener('keyup', () => { if (name !== 'act') input[name] = false; });
    button.addEventListener('blur', clearInput);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { if (name !== 'act') input[name] = false; });
    controls.append(button);
  }
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left + cameraX, y = event.clientY - rect.top + cameraY;
    if (Math.abs(x - world?.level.exit.x) < 25 && Math.abs(y - (world.level.exit.y - 15)) < 45) onExit();
    else canvas.focus();
  });

  function door(point, label, open) {
    ctx.fillStyle = '#537868'; ctx.fillRect(point.x - 22, point.y - 53, 44, 69);
    ctx.fillStyle = open ? '#020908' : '#35574e'; ctx.fillRect(point.x - 18, point.y - 49, 36, 65);
    ctx.fillStyle = '#d9eee6'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(label, point.x, point.y - 62);
  }

  function draw() {
    const state = replica.state, level = state.level, progress = state.progress;
    cameraX = Math.max(0, Math.min(level.width - width, world.player.x - width * 0.45));
    cameraY = Math.min(360, world.player.y - 35);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#10282d'; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(-cameraX, -cameraY);
    // Quiet backdrop and clear ground keep the small embedded scene readable.
    ctx.fillStyle = '#173b38';
    for (let x = 100; x < level.width; x += 160) { ctx.beginPath(); ctx.arc(x, 540, 120, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#537868';
    for (const platform of level.platforms) ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    const bridge = level.bridge;
    if (progress.bridgeOpen) { ctx.fillStyle = '#f8b84e'; ctx.fillRect(bridge.x, bridge.y, bridge.w, bridge.h); }
    else { ctx.strokeStyle = '#60756e'; ctx.setLineDash([6, 6]); ctx.strokeRect(bridge.x, bridge.y, bridge.w, bridge.h); ctx.setLineDash([]); }
    door(level.exit, 'Calendar', true); door(level.goal, 'Finish', progress.bridgeOpen);
    for (const station of level.switches) {
      const saved = progress.switches.includes(station.id);
      ctx.fillStyle = saved ? '#f8b84e' : '#70d3ca'; ctx.fillRect(station.x - 14, station.y - 5, 28, 20);
      ctx.fillStyle = '#e4f0e6'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(saved ? 'Saved' : 'Station ' + station.label, station.x, station.y - 17);
    }
    for (const sample of level.samples) {
      if (progress.samples.includes(sample.id)) continue;
      ctx.fillStyle = '#f8b84e'; ctx.beginPath(); ctx.arc(sample.x, sample.y, 10, 0, Math.PI * 2); ctx.fill();
      const target = level.switches.find(station => station.id === sample.destination);
      ctx.fillStyle = '#e4f0e6'; ctx.font = '12px system-ui'; ctx.fillText('To ' + target.label, sample.x, sample.y - 17);
    }
    for (const name of state.members) {
      const p = name === member ? world.player : replica.remoteMotion.sample(name, true);
      if (!p) continue;
      const away = name !== member && !state.online?.includes(name);
      ctx.globalAlpha = away ? 0.2 : 1;
      if (drawAvatar) drawAvatar(ctx, name, p);
      else {
        ctx.fillStyle = colorFor(name); ctx.fillRect(p.x - 12, p.y - 15, 24, 30);
        ctx.fillStyle = '#17343b'; ctx.fillRect(p.x - 7, p.y - 7, 4, 4); ctx.fillRect(p.x + 3, p.y - 7, 4, 4);
      }
      ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(name === member ? 'You' : name, p.x, p.y - 24);
    }
    ctx.globalAlpha = 1; ctx.restore(); ctx.textAlign = 'left';
    if (progress.arrived.includes(member)) {
      ctx.fillStyle = '#254a43'; ctx.fillRect(8, 8, width - 16, 28);
      ctx.fillStyle = '#e4f0e6'; ctx.font = 'bold 13px system-ui'; ctx.fillText('You made it! Help friends or return through the calendar door.', 16, 27, width - 32);
    }
    if (progress.bridgeOpen && cameraX < 500) {
      ctx.fillStyle = '#f8b84e'; ctx.font = 'bold 12px system-ui'; ctx.fillText('Bridge open! Finish to the right >', Math.max(8, width - 210), 20);
    }
  }

  function frame(at) {
    if (disposed) return;
    const state = replica.state;
    if (state) {
      if (!world || world.level.id !== state.level.id || worldEpoch !== state.epoch) {
        world = new ParkWorld(state.level); worldEpoch = state.epoch;
        // Durable milestones restore a safe checkpoint even after a page reload.
        if (state.progress.arrived.includes(member)) Object.assign(world.player, state.level.goal);
        else if (state.progress.bridgeOpen) Object.assign(world.player, state.level.checkpoint);
      }
      world.update((at - last) / 1000, input, state.progress.bridgeOpen);
      replica.motion(world.pose());
      draw();
      const remaining = Math.max(0, Math.ceil((state.level.rotationAt - Date.now()) / 60000));
      setText(heading, state.level.title + ' | ' + (state.online?.length ?? 1) + ' here');
      setText(hint, state.level.hint);
      const arrival = state.progress.arrived.includes(member);
      const action = world.nearby(member, state.progress);
      const prompt = action?.kind === 'sample' ? 'Press E / Up to collect this sample.'
        : action?.kind === 'deliver' ? 'Press E / Up to deliver to this station.'
        : action?.kind === 'switch' ? 'Press E / Up to light this switch.'
        : action?.kind === 'arrive' ? 'Press E / Up to finish!' : 'Arrows: move | Space: jump | E / Up: help';
      setText(status, !connected() ? 'Connection interrupted. Keep moving; contributions send when you reconnect.'
        : replica.outbox.length ? 'Saving your contribution...'
        : replica.lastRejection || (arrival ? (remaining ? 'Puzzle complete. Next featured puzzle in ' + remaining + ' min.' : 'Next puzzle opens when everyone here finishes. Saved progress stays until then.')
        : state.progress.switches.length + '/4 switches saved. ' + prompt));
    }
    last = at; animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame); canvas.focus();
  return { canvas, getWorld: () => world, dispose() {
    disposed = true; cancelAnimationFrame(animation); observer.disconnect(); clearInput();
    doc.defaultView.removeEventListener('blur', clearInput); doc.removeEventListener('visibilitychange', visibility);
    heading.remove(); canvas.remove(); hint.remove(); status.remove(); controls.remove();
  } };
}
