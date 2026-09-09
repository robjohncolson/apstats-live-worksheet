import { ParkWorld } from './world.mjs';

const colorFor = name => 'hsl(' + [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0) + ' 65% 70%)';

export function mountParkGame({ container, replica, member, drawAvatar, onExit = () => {}, connected = () => true }) {
  const doc = container.ownerDocument;
  const scale = 5 / 6; // Match the calendar's 20 x 24 pixel character.
  const assets = {};
  for (const name of ['door_open', 'door_closed', 'button', 'coin_0']) {
    const img = new doc.defaultView.Image(); img.src = new URL('../' + name + '.png', import.meta.url).href; assets[name] = img;
  }
  const heading = doc.createElement('div'), hint = doc.createElement('p');
  heading.style.cssText = 'position:absolute;top:4px;left:4px;right:120px;font:inherit;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  hint.style.cssText = 'position:absolute;top:23px;left:4px;right:4px;margin:0;font:inherit;font-size:11px;line-height:14px;pointer-events:none';
  const canvas = doc.createElement('canvas'); canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'APStat Park puzzle. Arrows or A and D to move. Space to jump. E or Up to help or enter a door.');
  canvas.style.cssText = 'display:block;width:100%;height:220px;background:transparent;touch-action:none;outline-offset:-1px;image-rendering:pixelated';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'position:absolute;bottom:35px;left:4px;right:4px;margin:0;font-size:11px;line-height:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none';
  const controls = doc.createElement('div'); controls.style.cssText = 'position:absolute;bottom:0;left:4px;display:flex;gap:6px';
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
    // Exit may synchronously restore the calendar. Never let this same key
    // bubble into its doorway handler and reopen the park.
    event.stopPropagation();
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
    button.style.cssText = 'padding:4px 10px;min-height:29px;touch-action:none;background:transparent;color:inherit;border:1px solid currentColor;border-radius:0;font:inherit;font-size:11px;cursor:pointer';
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
      if (name === 'act') act(); else input[name] = true;
    });
    // Keyboard activation remains available for the accessible control buttons.
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation(); if (name === 'act') { if (!event.repeat) act(); } else input[name] = true;
    });
    button.addEventListener('keyup', () => { if (name !== 'act') input[name] = false; });
    button.addEventListener('blur', clearInput);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { if (name !== 'act') input[name] = false; });
    controls.append(button);
  }
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale + cameraX, y = (event.clientY - rect.top) / scale + cameraY;
    if (Math.abs(x - world?.level.exit.x) < 25 && Math.abs(y - (world.level.exit.y - 15)) < 45) onExit();
    else canvas.focus();
  });

  function sprite(image, x, y, w, h) {
    if (!image.complete || !image.naturalWidth) return false;
    ctx.drawImage(image, x, y, w, h); return true;
  }

  function door(point, label, open, calendar = false) {
    ctx.save();
    if (calendar) ctx.filter = 'brightness(0)';
    if (!sprite(open ? assets.door_open : assets.door_closed, point.x - 23, point.y - 45, 46, 60)) {
      ctx.fillStyle = '#111'; ctx.fillRect(point.x - 20, point.y - 43, 40, 58);
    }
    ctx.restore();
    ctx.fillStyle = '#171717'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, point.x, point.y - 53);
  }

  function draw() {
    const state = replica.state, level = state.level, progress = state.progress;
    cameraX = Math.max(0, Math.min(level.width - width / scale, world.player.x - width / scale * 0.45));
    cameraY = Math.min(540 - 160 / scale, world.player.y - 58 / scale);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-cameraX, -cameraY);
    // The calendar itself remains the backdrop. Only the puzzle's geometry changes.
    ctx.fillStyle = '#aaa99e'; ctx.strokeStyle = '#45443b'; ctx.lineWidth = 1 / scale;
    for (const platform of level.platforms) {
      ctx.fillRect(platform.x, platform.y, platform.w, 5);
      ctx.beginPath(); ctx.moveTo(platform.x, platform.y); ctx.lineTo(platform.x + platform.w, platform.y); ctx.stroke();
    }
    const bridge = level.bridge;
    if (progress.bridgeOpen) { ctx.fillStyle = '#d6b669'; ctx.fillRect(bridge.x, bridge.y, bridge.w, 5); }
    else { ctx.strokeStyle = '#60756e'; ctx.setLineDash([6, 6]); ctx.strokeRect(bridge.x, bridge.y, bridge.w, bridge.h); ctx.setLineDash([]); }
    door(level.exit, 'Calendar', true, true); door(level.goal, 'Finish', progress.bridgeOpen);
    for (const station of level.switches) {
      const saved = progress.switches.includes(station.id);
      ctx.save(); if (saved) ctx.filter = 'hue-rotate(85deg)';
      if (!sprite(assets.button, station.x - 16, station.y + (saved ? 7 : -3), 32, saved ? 8 : 18)) {
        ctx.fillStyle = saved ? '#577c36' : '#a65032'; ctx.fillRect(station.x - 14, station.y, 28, 15);
      }
      ctx.restore();
      ctx.fillStyle = '#171717'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(saved ? 'Saved' : 'Station ' + station.label, station.x, station.y - 17);
    }
    for (const sample of level.samples) {
      if (progress.samples.includes(sample.id)) continue;
      if (!sprite(assets.coin_0, sample.x - 10, sample.y - 10, 20, 20)) {
        ctx.fillStyle = '#b88a18'; ctx.beginPath(); ctx.arc(sample.x, sample.y, 10, 0, Math.PI * 2); ctx.fill();
      }
      const target = level.switches.find(station => station.id === sample.destination);
      ctx.fillStyle = '#171717'; ctx.font = '12px system-ui'; ctx.fillText('To ' + target.label, sample.x, sample.y - 17);
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
      ctx.fillStyle = '#171717'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(name === member ? 'You' : name, p.x, p.y - 24);
    }
    ctx.globalAlpha = 1; ctx.restore(); ctx.textAlign = 'left';
    if (progress.arrived.includes(member)) {
      ctx.fillStyle = '#eee9d5'; ctx.fillRect(8, 53, width - 16, 23);
      ctx.fillStyle = '#171717'; ctx.font = 'bold 13px system-ui'; ctx.fillText('You made it! Help friends or return through the calendar door.', 16, 69, width - 32);
    }
    if (progress.bridgeOpen && cameraX < 500) {
      ctx.fillStyle = '#634b12'; ctx.font = '12px sans-serif'; ctx.fillText('Bridge open! Finish to the right >', Math.max(8, width - 210), 68);
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
