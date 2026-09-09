import { ParkWorld } from './world.mjs';

const colors = ['#f8b84e', '#70d3ca', '#e29edb', '#87baff', '#fa9383', '#c0d574', '#bea6ee', '#f1cf9e'];

export function mountParkGame({ container, replica, member, connected = () => true }) {
  const doc = container.ownerDocument;
  const canvas = doc.createElement('canvas');
  canvas.width = 1280; canvas.height = 600; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'APStat Park. Arrows or A and D to move. Space to jump. E or Up to contribute.');
  canvas.style.cssText = 'display:block;width:100%;background:#10282d;border-radius:12px;touch-action:none';
  const status = doc.createElement('p'); status.setAttribute('role', 'status');
  const presence = doc.createElement('p'); presence.setAttribute('role', 'status');
  const controls = doc.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  container.append(canvas, status, presence, controls);
  const input = { left: false, right: false, jump: false };
  let world = null, animation, last = performance.now(), disposed = false;
  const ctx = canvas.getContext('2d');
  const clearInput = () => { input.left = input.right = input.jump = false; };
  const act = () => {
    if (!world || !replica.state) return;
    const action = world.nearby(member, replica.state.progress);
    if (action) replica.queue(action.kind, action.target, world.pose());
  };
  const key = event => {
    const pressed = event.type === 'keydown';
    const bindings = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump' };
    if (bindings[event.code]) { event.preventDefault(); input[bindings[event.code]] = pressed; }
    if (pressed && !event.repeat && ['KeyE', 'ArrowUp', 'KeyW'].includes(event.code)) { event.preventDefault(); act(); }
  };
  canvas.addEventListener('keydown', key); canvas.addEventListener('keyup', key);
  canvas.addEventListener('blur', clearInput);
  const visibility = () => { if (doc.hidden) clearInput(); };
  doc.defaultView.addEventListener('blur', clearInput);
  doc.addEventListener('visibilitychange', visibility);
  for (const [label, name] of [['Left', 'left'], ['Right', 'right'], ['Jump', 'jump'], ['Help / enter', 'act']]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.style.cssText = 'padding:12px 20px;touch-action:none';
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      if (name === 'act') act(); else input[name] = true;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { if (name !== 'act') input[name] = false; });
    controls.append(button);
  }

  function draw() {
    const state = replica.state, level = state.level, progress = state.progress;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#10282d'; ctx.fillRect(0, 0, 1280, 600);
    ctx.fillStyle = '#d9eee6'; ctx.font = 'bold 30px system-ui'; ctx.fillText(level.title, 38, 55);
    ctx.font = '18px system-ui'; ctx.fillStyle = '#a8c6bc'; ctx.fillText(level.hint, 38, 90);
    ctx.fillStyle = '#537868';
    for (const platform of level.platforms) ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    if (progress.bridgeOpen) {
      ctx.fillStyle = '#f8b84e'; const b = level.bridge; ctx.fillRect(b.x, b.y, b.w, b.h);
    } else {
      ctx.strokeStyle = '#60756e'; ctx.setLineDash([8, 8]);
      const b = level.bridge; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
    }
    for (const station of level.switches) {
      const done = progress.switches.includes(station.id), slot = state.members.indexOf(station.owner);
      ctx.fillStyle = done ? '#efffea' : colors[slot]; ctx.fillRect(station.x - 18, station.y - 12, 36, 25);
      ctx.fillStyle = '#d9eee6'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(done ? 'Saved' : station.owner === member ? 'Your switch' : station.owner, station.x, station.y - 23);
    }
    for (const sample of level.samples) {
      if (progress.samples.includes(sample.id)) continue;
      ctx.fillStyle = colors[state.members.indexOf(sample.owner)];
      ctx.beginPath(); ctx.arc(sample.x, sample.y, 9, 0, Math.PI * 2); ctx.fill();
      if (sample.destination) {
        const recipient = level.switches.find(station => station.id === sample.destination).owner;
        ctx.fillStyle = '#e4f0e6'; ctx.font = '13px system-ui'; ctx.fillText(`For ${recipient}`, sample.x, sample.y - 18);
      }
    }
    ctx.fillStyle = progress.bridgeOpen ? '#70d3ca' : '#43605f'; ctx.fillRect(level.goal.x - 22, level.goal.y - 48, 44, 67);
    ctx.fillStyle = '#fff'; ctx.font = '16px system-ui'; ctx.fillText('Together', level.goal.x, level.goal.y - 60);
    for (const [slot, name] of state.members.entries()) {
      const p = name === member ? world.player : replica.remoteMotion.sample(name, state.running && !state.done);
      if (!p) continue;
      const away = name !== member && state.online && !state.online.includes(name);
      ctx.globalAlpha = name === member ? 1 : away ? 0.25 : 0.65;
      ctx.fillStyle = colors[slot]; ctx.fillRect(p.x - 12, p.y - 15, 24, 30);
      ctx.fillStyle = '#17343b'; ctx.fillRect(p.x - 7, p.y - 7, 4, 4); ctx.fillRect(p.x + 3, p.y - 7, 4, 4);
      const carrying = level.samples.some(item => item.owner === name && item.destination
        && progress.samples.includes(item.id) && !progress.deliveries.includes(item.id));
      if (carrying) { ctx.fillStyle = '#ffe0a0'; ctx.fillRect(p.x + 9, p.y - 4, 12, 12); }
      ctx.fillStyle = '#fff'; ctx.font = '13px system-ui'; ctx.fillText(name === member ? 'You' : away ? `${name} (away)` : name, p.x, p.y - 27);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
    if (progress.arrived.length === state.members.length) {
      ctx.fillStyle = '#254a43'; ctx.fillRect(330, 205, 620, 110);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e4f0e6'; ctx.font = 'bold 28px system-ui';
      ctx.fillText('Everyone made it!', 640, 248);
      ctx.font = '18px system-ui'; ctx.fillText('Your teacher can take the group to the next level.', 640, 283);
      ctx.textAlign = 'left';
    }
  }

  function frame(at) {
    if (disposed) return;
    const state = replica.state;
    if (state) {
      if (!world || world.level.id !== state.level.id) world = new ParkWorld(state.level);
      if (state.running && !state.done) {
        world.update((at - last) / 1000, input, state.progress.bridgeOpen);
        replica.motion(world.pose());
      }
      draw();
      const away = state.members.filter(name => name !== member && state.online && !state.online.includes(name));
      presence.textContent = connected() && away.length
        ? `Waiting for ${away.join(', ')} to reconnect or join the park. Saved contributions remain. Your teacher can help advance the level.` : '';
      const parcel = state.level.samples.find(item => item.owner === member && item.destination
        && state.progress.samples.includes(item.id) && !state.progress.deliveries.includes(item.id));
      const recipient = parcel && state.level.switches.find(station => station.id === parcel.destination).owner;
      status.textContent = state.done ? 'You brought the team home!'
        : !state.running ? 'Paused by your teacher.'
        : !connected() ? 'Connection interrupted. You can keep moving; contributions will be sent when you reconnect.'
        : replica.outbox.length ? 'Saving your contribution...'
        : state.progress.arrived.length === state.members.length ? 'Everyone reached the exit! Ready for the next level.'
        : state.progress.arrived.includes(member) ? `You made it! ${state.progress.arrived.length}/${state.members.length} teammates are home.`
        : parcel ? `Carry your parcel to ${recipient}'s switch and press E or Up to deliver it.`
        : replica.lastRejection || `${state.progress.switches.length}/${state.level.switches.length} switches saved. Arrows to move, Space to jump, E or Up to help.`;
    } else status.textContent = 'Joining your park group...';
    last = at; animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
  canvas.focus();
  return { canvas, getWorld: () => world, dispose() {
    disposed = true; cancelAnimationFrame(animation); clearInput();
    doc.defaultView.removeEventListener('blur', clearInput);
    doc.removeEventListener('visibilitychange', visibility);
    canvas.remove(); status.remove(); presence.remove(); controls.remove();
  } };
}
