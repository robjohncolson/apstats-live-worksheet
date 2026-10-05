const V = new URL(import.meta.url).search;
const { CAMPAIGN } = await import('./campaign-catalog.mjs' + V);
const { createCampaignReplay } = await import('./campaign-replay.mjs' + V);
const { createStageClear } = await import('./stage-clear.mjs' + V);
const { createSceneDissolve } = await import('./scene-transition.mjs' + V);
const { createPicoAudio } = await import('./pico-audio.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { catBodyForHue, rgbHex } = await import('./pico-rules.mjs' + V);

export function mountCampaign({ container, getSocket, board, onClose }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const audio = createPicoAudio(win), clear = createStageClear();
  let game = null, disposed = false, socket = null, joined = false, state = null, error = '';
  let lastPacket = 0, lastJoin = -Infinity, lastInput = -Infinity, lastClear = -Infinity, lastResume = -Infinity;
  let bits = 0, buddy = 0, sentBits = -1, sentBuddy = -1, accumulator = 0, frame = null;
  let clearActive = false, soundClear = false, loadingState = null, hiddenTimer = null;
  let idle = false, activeJoin = false, buffering = true;
  const held = new Set();
  const replay = createCampaignReplay(inputs => game.step(inputs));
  const scale = () => Math.min(1, board.viewportW() / 720);
  const entities = new Map();
  container.setAttribute('data-park-active', '');
  const status = doc.createElement('span'); status.setAttribute('role', 'status'); status.setAttribute('data-campaign-status', '');
  status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)'; container.append(status);
  function capture() {
    const canvas = doc.createElement('canvas'); canvas.width = board.engine.canvas.width; canvas.height = board.engine.canvas.height;
    canvas.getContext('2d').drawImage(board.engine.canvas, 0, 0); return canvas;
  }
  let dissolve = createSceneDissolve(board.transitionFrame);
  function send(type, data = {}) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 8192) return;
    socket.send(JSON.stringify({ type, epoch: state?.epoch, ...data }));
  }
  function resume() {
    if (performance.now() - lastResume < 500) return;
    lastResume = performance.now(); send('campaign_resume', { from: replay.received });
  }
  function start(packet) {
    if (!game) { loadingState = packet; return; }
    if (packet.epoch !== state?.epoch) {
      if (state) dissolve = createSceneDissolve(capture());
      replay.reset(Math.max(2, packet.roster.length));
      game.load(packet.stageIndex, Math.max(2, packet.roster.length), packet.seed);
      game.setPresentation({ focusSlot: Math.max(0, packet.roster.indexOf(board.username)),
        colours: packet.roster.map(name => rgbHex(catBodyForHue(board.createPeer(name, { x: 0, y: 0 }).hue))) });
      clearActive = false; soundClear = false; accumulator = 0; buffering = true; sentBits = -1; sentBuddy = -1;
      for (const key of Object.keys(board.input)) board.input[key] = false;
      held.clear(); bits = 0; buddy = 0;
    }
    state = packet; clearActive = packet.phase === 'clear';
    replay.accept(packet);
    if (packet.more) { lastResume = -Infinity; resume(); }
  }
  function onMessage(event) {
    let packet; try { packet = JSON.parse(event.data); } catch { return; }
    if (!packet.type?.startsWith('campaign_')) return;
    lastPacket = performance.now(); error = '';
    if (packet.type === 'campaign_idle') { idle = true; joined = false; activeJoin = false; blur(); return; }
    if (packet.type === 'campaign_error') { error = packet.message; joined = false; return; }
    if (packet.type === 'campaign_state') { joined = true; idle = false; activeJoin = false; start(packet); return; }
    if (packet.epoch !== state?.epoch) { joined = false; return; }
    if (packet.type === 'campaign_frames' && !replay.accept(packet)) resume();
    if (packet.type === 'campaign_clear') clearActive = true;
  }
  function bind() {
    const next = getSocket(); if (next === socket) return;
    socket?.removeEventListener('message', onMessage); socket = next; joined = false;
    socket?.addEventListener('message', onMessage);
  }
  function pump() {
    if (disposed) return;
    bind(); if (idle) return;
    const now = performance.now();
    if (!joined && now - lastJoin > 1000) { lastJoin = now; send('campaign_join', { protocol: 6, active: activeJoin }); }
    if (!state || !game) return;
    if (now - lastPacket > 1500) resume();
    if (now - lastInput >= 16 && (bits !== sentBits || buddy !== sentBuddy || now - lastInput > 500)) {
      send('campaign_input', { bits, buddy }); sentBits = bits & 31; sentBuddy = buddy & 31;
      bits &= 31; buddy &= 31; lastInput = now;
    }
    if (game.stats.cleared && !clearActive && now - lastClear > 500 && replay.frame > 0) {
      lastClear = now; send('campaign_clear', { frame: replay.frame });
    }
  }
  function keyboard(event) {
    if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const down = event.type === 'keydown', key = event.key.toLowerCase();
    if (key === 'escape' && down) { event.preventDefault(); dispose(); return; }
    if (key === 'r' && down && !event.repeat) { event.preventDefault(); send('campaign_retry'); return; }
    const first = { arrowleft: 1, arrowright: 2, arrowup: 4, arrowdown: 8, ' ': 16 };
    const second = { a: 1, d: 2, w: 4, s: 8, f: 16 };
    const mask = first[key] || second[key]; if (!mask) return;
    event.preventDefault();
    if (idle && down) { idle = false; activeJoin = true; lastJoin = -Infinity; pump(); return; }
    const fresh = down && !held.has(key);
    const local = game?.getView().screenPlayers[Math.max(0, state?.roster.indexOf(board.username) ?? 0)];
    const doorX = 50 + (game?.getView().projection.x || 0);
    if (key === 'arrowup' && fresh && local && Math.abs(local.x - doorX) < 24 && Math.abs(local.feet - 700) < 8) {
      dispose(); return;
    }
    if (down) held.add(key); else held.delete(key);
    if (first[key]) { bits = down ? bits | mask : bits & ~mask; if (mask === 16 && fresh) bits |= 32; }
    else { buddy = down ? buddy | mask : buddy & ~mask; if (mask === 16 && fresh) buddy |= 32; }
    pump();
  }
  function blur() { held.clear(); bits = 0; buddy = 0; sentBits = -1; sentBuddy = -1; }
  function visibility() {
    clearTimeout(hiddenTimer); blur();
    if (doc.hidden) hiddenTimer = setTimeout(dispose, 15000);
  }
  function update(dt) {
    board.setBoardHeight?.(Math.round(750 * scale()));
    if (!game || !state || state.phase === 'waiting') return;
    // Start each stream with one three-frame packet available. Otherwise the
    // first frame arrives late, accumulated time drains the whole packet at
    // once, and the avatar freezes until the next packet.
    if (buffering) {
      if (replay.received - replay.frame < 3) return;
      buffering = false; accumulator = 0;
    }
    // Drain a reconnect backlog in bounded slices; ordinary play remains fixed at 60 Hz.
    accumulator += Math.min(dt, .1);
    const catchingUp = replay.received - replay.frame > 120;
    const deadline = performance.now() + 6;
    while (replay.frame < replay.received && (catchingUp || accumulator >= 1 / 60)) {
      replay.advance(1); if (!catchingUp) accumulator -= 1 / 60;
      if (performance.now() >= deadline) break;
    }
    if (replay.frame === replay.received) { accumulator = 0; buffering = true; }
    if (clearActive && !soundClear) { audio.clear(); soundClear = true; }
  }
  function render(ctx) {
    if ((!game || !state) && board.transitionFrame && !error) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(board.transitionFrame, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore(); status.textContent = 'Loading PICO PARK campaign'; return;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(scale(), scale());
    const entry = CAMPAIGN[state?.stageIndex || 0];
    frame = clear.sample(clearActive, state?.epoch, performance.now(), 720, 750);
    if (frame) ctx.filter = frame.filter;
    if (game && state) game.render();
    // Same orange floor edge and exit doorway as the calculator room.
    if (!game || !state) { ctx.fillStyle = '#ff864d'; ctx.fillRect(0, 700, 720, 50); }
    const atlas = board.atlas?.();
    const doorX = 30 + (game?.getView().projection.x || 0);
    if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, doorX, 660, 40, 40);
    else { ctx.fillStyle = '#493d48'; ctx.fillRect(doorX, 660, 40, 40); }
    pixelText(ctx, 'ESC TO LEAVE', doorX - 6, 649, 7);
    // Door scenery sits behind cats, as it does in the calculator and old 1-1.
    if (game && state) ctx.drawImage(game.canvas, 0, 0);
    pixelText(ctx, 'PICO PARK ' + entry.world + '-' + entry.stage + '  /  48', 28, 30, 14);
    pixelText(ctx, entry.title, 28, 52, 14);
    let message = error || (idle ? 'INACTIVE. PRESS A GAME KEY TO REJOIN.' : !game ? 'LOADING PICO PARK...' : !joined ? 'RECONNECTING TO YOUR TEAM...'
      : state?.phase === 'waiting' ? 'GATHERING YOUR TEAM...'
      : state && !state.roster.includes(board.username) ? 'JOINING NEXT STAGE. TEAM CAN PRESS R TO RESTART.'
      : replay.received - replay.frame > 120 ? 'CATCHING UP WITH YOUR TEAM...'
      : clearActive ? 'NEXT STAGE...' : state?.roster.length === 1
        ? 'SOLO: ARROWS + SPACE / WASD + F.  R TO RETRY.' : 'ARROWS + SPACE. UP TO ENTER DOORS. R TO RETRY.');
    pixelText(ctx, message, 28, 74, 7);
    if (state) pixelText(ctx, state.roster.join(' + ').slice(0, 96), 28, 91, 7);
    status.textContent = entry.world + '-' + entry.stage + ' ' + entry.title + '. ' + message;
    ctx.filter = 'none'; clear.render(ctx, frame); ctx.restore();
    dissolve.render(ctx);
  }
  function dispose() {
    if (disposed) return; disposed = true; send('campaign_leave');
    clearInterval(timer); clearTimeout(hiddenTimer); game?.dispose(); audio.dispose();
    socket?.removeEventListener('message', onMessage);
    doc.removeEventListener('keydown', keyboard); doc.removeEventListener('keyup', keyboard); win.removeEventListener('blur', blur);
    doc.removeEventListener('visibilitychange', visibility);
    if (board.engine.sceneEntities === entities) board.engine.sceneEntities = null;
    for (const key of Object.keys(board.input)) board.input[key] = false;
    status.remove(); container.removeAttribute('data-park-active'); onClose();
  }
  entities.set('campaign', { update, render }); board.engine.sceneEntities = entities;
  board.setBoardHeight?.(Math.round(750 * scale()));
  doc.addEventListener('keydown', keyboard); doc.addEventListener('keyup', keyboard); win.addEventListener('blur', blur);
  doc.addEventListener('visibilitychange', visibility);
  const timer = setInterval(pump, 16); pump();
  import('./campaign-engine.mjs' + V).then(module => module.createCampaignEngine({ onEvent(event) {
    if (!game || replay.received - replay.frame > 120 || event.type === 'clear') return;
    audio.play(({ get: 'key', coin: 'key', dead: 'dead', hit: 'dead' })[event.type] || event.type);
  } })).then(next => {
    if (disposed) { next.dispose(); return; }
    game = next; if (loadingState) { const packet = loadingState; loadingState = null; start(packet); }
  }).catch(cause => { error = 'Could not load PICO PARK. Reload to try again.'; console.error(cause); });
  return { kind: 'campaign', dispose, getGame: () => game,
    getView: () => ({ ...state, frame: replay.frame, received: replay.received, clear: frame, ...game?.getView() }) };
}
