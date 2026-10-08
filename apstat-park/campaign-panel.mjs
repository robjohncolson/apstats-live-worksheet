const V = new URL(import.meta.url).search;
const { CAMPAIGN } = await import('./campaign-catalog.mjs' + V);
const { createCampaignReplay } = await import('./campaign-replay.mjs' + V);
const { createStageClear } = await import('./stage-clear.mjs' + V);
const { createSceneDissolve } = await import('./scene-transition.mjs' + V);
const { createPicoAudio } = await import('./pico-audio.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { catBodyForHue, rgbHex } = await import('./pico-rules.mjs' + V);
const { createStageSelect, stageStates, choiceFor, startCursor, stageAt, moveCursor, describe } = await import('./campaign-select.mjs' + V);

export function mountCampaign({ container, getSocket, board, onClose }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const audio = createPicoAudio(win), clear = createStageClear();
  let game = null, disposed = false, socket = null, joined = false, state = null, error = '';
  let lastPacket = 0, lastJoin = -Infinity, lastInput = -Infinity, lastClear = -Infinity, lastResume = -Infinity;
  let bits = 0, buddy = 0, sentBits = -1, sentBuddy = -1, frame = null;
  let clearActive = false, soundClear = false, loadingState = null, hiddenTimer = null;
  let idle = false, activeJoin = false;
  let paintedFrame = -1, paintedEpoch = null, paintedHelpers = null, paintedWidth = 0;
  const held = new Set();
  // Teacher 2026-10-07: the door opens on the STAGE SELECT. The relay decides what may start
  // (campaign_progress); a choice is sent as campaign_join {stage} or campaign_open_stage {stage}.
  const select = createStageSelect(doc);
  let selecting = true, progress = null, chosenStage = null, pending = null, cursor = null;
  let selectMessage = '', lastSelect = -Infinity;
  const rejected = new Map();   // stage -> its state when the relay refused it (greyed until that changes)
  const replay = createCampaignReplay(inputs => game.step(inputs));
  // Teacher 2026-10-07: "no resizing of the game stage from the main — just widen and keep the
  // centre." The stage keeps its native scale (min(1, width / 720), never scaled up). A wider page
  // widens the drawn world to the page, split evenly left and right so the centre never moves.
  // Render-only: levels are keyboard-driven and the exit door is tested in game coordinates.
  const WORLD_W = 720;
  const scale = () => Math.min(1, board.viewportW() / WORLD_W);
  const viewW = () => Math.max(WORLD_W, Math.round(board.viewportW() / scale()));
  const pad = () => (viewW() - WORLD_W) / 2;
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
    if (socket?.readyState !== 1 || socket.bufferedAmount > 8192) return false;
    // The chosen stage rides on every join (also a reconnect's), so the relay places us on it.
    const stage = type === 'campaign_join' && chosenStage != null ? { stage: chosenStage } : {};
    socket.send(JSON.stringify({ type, epoch: state?.epoch, ...data, ...stage }));
    return true;
  }
  function states() { return stageStates(progress, board.username); }
  // Authoritative progress arrived: a refusal stays greyed only while its stage is in the same
  // state as when it was refused. Once the state moves on, the entry is gone for good, so a later
  // return to that state is a fresh, choosable stage.
  function reconcileRejected() {
    const current = states();
    for (const [stage, refusedIn] of rejected) if (current[stage]?.state !== refusedIn) rejected.delete(stage);
  }
  function showSelect(message = '') {
    selecting = true; selectMessage = message; lastSelect = -Infinity;
    for (const key of Object.keys(board.input)) board.input[key] = false;
    held.clear(); bits = 0; buddy = 0;
  }
  function choose(stage) {
    const entry = states()[stage];
    const choice = progress && choiceFor(entry);
    if (!choice || pending || rejected.get(stage) === entry.state) return;
    selectMessage = '';
    if (choice.type === 'campaign_open_stage') {
      if (send('campaign_open_stage', { stage })) pending = { kind: 'open', stage };
      return;
    }
    // The join itself goes through the regular join line in pump().
    pending = { kind: 'join', stage, state: entry.state };
    chosenStage = stage; selecting = false; joined = false; lastJoin = -Infinity;
    pump();
  }
  function selectKey(event) {
    if (event.type !== 'keydown') return;
    const key = event.key;
    if (key === 'Escape') { event.preventDefault(); dispose(); return; }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); if (!event.repeat && cursor != null) choose(cursor); return; }
    if (!key.startsWith('Arrow')) return;
    event.preventDefault();
    cursor = moveCursor(cursor ?? 0, key);
  }
  function pointerStage(event) {
    const rect = board.engine.canvas.getBoundingClientRect();
    return stageAt((event.clientX - rect.left) / scale(), (event.clientY - rect.top) / scale(), pad());
  }
  function selectClick(event) {
    if (!selecting) return;
    const stage = pointerStage(event);
    if (stage < 0) return;
    event.preventDefault(); cursor = stage; choose(stage);
  }
  function selectHover(event) {
    if (!selecting) return;
    const stage = pointerStage(event);
    if (stage >= 0) cursor = stage;
  }
  function resume() {
    if (performance.now() - lastResume < 500) return;
    lastResume = performance.now(); send('campaign_resume', { from: replay.received });
  }
  function presentationNames(packet) {
    const names = packet.roster.length ? packet.roster.slice() : (packet.helpers || []).slice(0, 1);
    while (names.length < 2) names.push(names[0] || 'practice');
    return names.concat((packet.helpers || []).slice(packet.roster.length ? 0 : 1));
  }
  function playerSlot(packet) { return packet ? Math.max(0, presentationNames(packet).indexOf(board.username)) : 0; }
  function present(packet) {
    game?.setPresentation({ focusSlot: playerSlot(packet),
      colours: presentationNames(packet).map(name => rgbHex(catBodyForHue(board.createPeer(name, { x: 0, y: 0 }).hue))) });
  }
  function start(packet) {
    if (!game) { loadingState = packet; return; }
    if (packet.epoch !== state?.epoch) {
      if (state) dissolve = createSceneDissolve(capture());
      replay.reset(Math.max(2, packet.roster.length));
      game.load(packet.stageIndex, Math.max(2, packet.roster.length), packet.seed);
      game.setPresentation({ focusSlot: playerSlot(packet),
        colours: presentationNames(packet).map(name => rgbHex(catBodyForHue(board.createPeer(name, { x: 0, y: 0 }).hue))) });
      clearActive = false; soundClear = false; sentBits = -1; sentBuddy = -1;
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
    if (packet.type === 'campaign_progress') {
      progress = packet; reconcileRejected(); if (pending?.kind === 'open') pending = null;
      if (cursor == null) cursor = startCursor(states());
      return;
    }
    if (packet.type === 'campaign_error' && pending) {
      // The relay refused a choice: grey that stage out and stay on (or return to) the select.
      if (pending.kind === 'join') { rejected.set(pending.stage, pending.state); chosenStage = state?.stageIndex ?? null; joined = false; }
      pending = null; showSelect(packet.message); return;
    }
    if (packet.type === 'campaign_error') { error = packet.message; joined = false; return; }
    if (packet.type === 'campaign_helpers' && packet.epoch === state?.epoch) { state.helpers = packet.helpers; present(state); return; }
    if (packet.type === 'campaign_state') {
      joined = true; idle = false; activeJoin = false;
      // The team cleared into a locked stage: everyone is back at the stage select.
      if (packet.phase === 'select') {
        if (packet.progress) { progress = { ...packet.progress, team: { stageIndex: packet.stageIndex, phase: 'select', roster: packet.roster } }; reconcileRejected(); }
        if (!selecting) showSelect(packet.reason || '');
        if (cursor == null) cursor = startCursor(states());
      } else { selecting = false; pending = null; chosenStage = packet.stageIndex; selectMessage = ''; }
      start(packet); return;
    }
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
    if (selecting && now - lastSelect > 1000 && send('campaign_select')) lastSelect = now;
    if (selecting && !joined) return;   // nobody joins a team until a stage is chosen
    if (!joined && now - lastJoin > 1000) { lastJoin = now; send('campaign_join', { protocol: 30, active: activeJoin }); }
    if (!state || !game) return;
    if (now - lastPacket > 1500) resume();
    // Keyboard edges send immediately. A blocked write must retain the jump
    // pulse until it actually reaches the ordered authoritative input stream.
    if (bits !== sentBits || buddy !== sentBuddy || now - lastInput > 500) {
      if (send('campaign_input', { bits, buddy })) {
        // Held buttons (31 = arrows + jump, 64 = action) stay; the jump (32) and action (256) edges were sent.
        sentBits = bits & 95; sentBuddy = buddy & 95;
        bits &= 95; buddy &= 95; lastInput = now;
      }
    }
    if (game.stats.cleared && !clearActive && now - lastClear > 500 && replay.frame > 0) {
      lastClear = now; send('campaign_clear', { frame: replay.frame });
    }
  }
  function keyboard(event) {
    if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (selecting) { selectKey(event); return; }
    const down = event.type === 'keydown', key = event.key.toLowerCase();
    if (key === 'escape' && down) { event.preventDefault(); dispose(); return; }
    if (key === 'r' && down && !event.repeat) { event.preventDefault(); send('campaign_retry'); return; }
    // 64 = the action button (native input bit 11, '[shot]': warp gun fires on the press, magnet works while held).
    const first = { arrowleft: 1, arrowright: 2, arrowup: 4, arrowdown: 8, ' ': 16, x: 64, k: 64 };
    const second = { a: 1, d: 2, w: 4, s: 8, f: 16, g: 64 };
    const mask = first[key] || second[key]; if (!mask) return;
    event.preventDefault();
    if (idle && down) { idle = false; activeJoin = true; lastJoin = -Infinity; pump(); return; }
    const fresh = down && !held.has(key);
    const local = game?.getView().screenPlayers[playerSlot(state)];
    const doorX = 50 + (game?.getView().projection.x || 0);
    if (key === 'arrowup' && fresh && local && Math.abs(local.x - doorX) < 24 && Math.abs(local.feet - 700) < 8) {
      dispose(); return;
    }
    if (down) held.add(key); else held.delete(key);
    // A fresh press also sets the edge bit: 32 for jump, 256 for action.
    const edge = fresh ? ({ 16: 32, 64: 256 })[mask] || 0 : 0;
    if (first[key]) { bits = down ? bits | mask : bits & ~mask; bits |= edge; }
    else { buddy = down ? buddy | mask : buddy & ~mask; buddy |= edge; }
    pump();
  }
  function blur() {
    held.clear(); bits = 0; buddy = 0;
    if (send('campaign_input', { bits, buddy })) { sentBits = 0; sentBuddy = 0; lastInput = performance.now(); }
    else { sentBits = -1; sentBuddy = -1; }
  }
  function visibility() {
    clearTimeout(hiddenTimer); blur();
    if (doc.hidden) hiddenTimer = setTimeout(dispose, 15000);
  }
  function update(dt) {
    board.setBoardHeight?.(Math.round(750 * scale()));
    if (!game || !state || state.phase === 'waiting') return;
    // The relay already supplies a 60 Hz clock. Apply available frames now;
    // a second client clock or refill threshold adds avoidable input latency.
    // Keep reconnect catch-up bounded so the page stays responsive.
    const deadline = performance.now() + 6;
    while (replay.frame < replay.received) {
      replay.advance(1);
      if (performance.now() >= deadline) break;
    }
    if (clearActive && !soundClear) { audio.clear(); soundClear = true; }
  }
  function renderSelect(ctx) {
    const dpr = win.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.scale(scale(), scale());
    ctx.imageSmoothingEnabled = false;
    const width = viewW(), left = pad();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, 700);
    ctx.fillStyle = '#ff864d'; ctx.fillRect(0, 700, width, 50);
    if (cursor == null && progress) cursor = startCursor(states());
    const { info } = select.render(ctx, { progress, username: board.username, cursor: cursor ?? 0, rejected, left,
      message: selectMessage || error });
    status.textContent = 'Stage select. ' + info;
    ctx.restore();
    dissolve.render(ctx);
  }
  function render(ctx) {
    if (selecting) { renderSelect(ctx); return; }
    if ((!game || !state) && board.transitionFrame && !error) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(board.transitionFrame, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore(); status.textContent = 'Loading PICO PARK campaign'; return;
    }
    // CSS px -> device px (the board canvas is sized width * dpr); the world is never scaled up.
    const dpr = win.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.scale(scale(), scale());
    ctx.imageSmoothingEnabled = false;
    const entry = CAMPAIGN[state?.stageIndex || 0];
    const width = viewW(), left = pad();
    frame = clear.sample(clearActive, state?.epoch, performance.now(), width, 750);
    if (frame) ctx.filter = frame.filter;
    // Reuse the last engine bitmap on high-refresh displays or while waiting
    // for a relay frame. Scene fades and the CLEAR banner still animate below.
    game?.setViewWidth?.(width);
    if (game && state && (paintedFrame !== replay.frame || paintedEpoch !== state.epoch || paintedHelpers !== state.helpers
      || paintedWidth !== width)) {
      game.render(); paintedFrame = replay.frame; paintedEpoch = state.epoch; paintedHelpers = state.helpers; paintedWidth = width;
    }
    // Same orange floor edge and exit doorway as the calculator room.
    if (!game || !state) { ctx.fillStyle = '#ff864d'; ctx.fillRect(0, 700, width, 50); }
    const atlas = board.atlas?.();
    const doorX = 30 + (game && state ? game.getView().projection.x : left);
    if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, doorX, 660, 40, 40);
    else { ctx.fillStyle = '#493d48'; ctx.fillRect(doorX, 660, 40, 40); }
    pixelText(ctx, 'ESC TO LEAVE', doorX - 6, 649, 7);
    // Door scenery sits behind cats, as it does in the calculator and old 1-1.
    if (game && state) ctx.drawImage(game.canvas, 0, 0);
    pixelText(ctx, 'PICO PARK ' + entry.world + '-' + entry.stage + '  /  48', 28 + left, 30, 14);
    pixelText(ctx, entry.title, 28 + left, 52, 14);
    let message = error || (idle ? 'INACTIVE. PRESS A GAME KEY TO REJOIN.' : !game ? 'LOADING PICO PARK...' : !joined ? 'RECONNECTING TO YOUR TEAM...'
      : state?.phase === 'waiting' ? 'GATHERING YOUR TEAM...'
      : state && !state.roster.includes(board.username) && !(state.helpers || []).includes(board.username) ? 'JOINING NEXT STAGE. TEAM CAN PRESS R TO RESTART.'
      : replay.received - replay.frame > 120 ? 'CATCHING UP WITH YOUR TEAM...'
      : clearActive ? 'NEXT STAGE...' : state?.roster.length === 1
        ? 'SOLO: ARROWS + SPACE + X / WASD + F + G.  R TO RETRY.' : 'ARROWS + SPACE. X = ACTION. UP TO ENTER DOORS. R TO RETRY.');
    pixelText(ctx, message, 28 + left, 74, 7);
    if (state) pixelText(ctx, state.roster.join(' + ').slice(0, 96), 28 + left, 91, 7);
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
    board.engine.canvas.removeEventListener('click', selectClick, true); board.engine.canvas.removeEventListener('mousemove', selectHover);
    if (board.engine.sceneEntities === entities) board.engine.sceneEntities = null;
    for (const key of Object.keys(board.input)) board.input[key] = false;
    status.remove(); container.removeAttribute('data-park-active'); onClose();
  }
  entities.set('campaign', { update, render }); board.engine.sceneEntities = entities;
  board.setBoardHeight?.(Math.round(750 * scale()));
  doc.addEventListener('keydown', keyboard); doc.addEventListener('keyup', keyboard); win.addEventListener('blur', blur);
  doc.addEventListener('visibilitychange', visibility);
  board.engine.canvas.addEventListener('click', selectClick, true); board.engine.canvas.addEventListener('mousemove', selectHover);
  const timer = setInterval(pump, 16); pump();
  import('./campaign-engine.mjs' + V).then(module => module.createCampaignEngine({ onEvent(event) {
    if (!game || replay.received - replay.frame > 120 || event.type === 'clear') return;
    audio.play(({ get: 'key', coin: 'key', dead: 'dead', hit: 'dead' })[event.type] || event.type);
  } })).then(next => {
    if (disposed) { next.dispose(); return; }
    game = next; if (loadingState) { const packet = loadingState; loadingState = null; start(packet); }
  }).catch(cause => { error = 'Could not load PICO PARK. Reload to try again.'; console.error(cause); });
  return { kind: 'campaign', dispose, getGame: () => game,
    getSelect: () => ({ selecting, cursor, progress, pending, chosenStage, message: selectMessage,
      rejected: [...rejected.keys()], states: states(), info: cursor == null ? '' : describe(states()[cursor], states()) }),
    getView: () => ({ ...state, frame: replay.frame, received: replay.received, clear: frame, ...game?.getView(),
      presentation: { scale: scale(), viewW: viewW(), pad: pad() } }) };   // for tests / smokes
}
