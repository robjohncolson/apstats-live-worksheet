const V = new URL(import.meta.url).search;
const mission = await import('./calculator-mission.mjs' + V);
const { DATA, ROUTE, HINTS, SUMMARY, LABELS, HOLD_MS, ROUND_MS, WORLD, tilesFor, tileAt } = mission;
const { nativeScriptFilenames } = await import('../ti84-trainer-v2/native/manifest.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { createWorldDisplay } = await import('./calculator-display.mjs' + V);
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { createPicoAudio } = await import('./pico-audio.mjs' + V);
const { PICO } = await import('./physics.mjs' + V);
const { approachSteps, createCalculatorMotion } = await import('./calculator-motion.mjs' + V);
const { createSceneDissolve } = await import('./scene-transition.mjs' + V);
const ENTRY_WIDTH = 720;
const LEVEL_WIDTH = ENTRY_WIDTH + WORLD.width;
const RESET_DOOR = { x: 650, y: WORLD.floor - 48, w: 48, h: 48 };
// Same calculator, with its menu payloads painted directly into the level.
for (const file of nativeScriptFilenames) await import('../ti84-trainer-v2/native/' + file + V);

export function mountParkPanel({ container, getSocket, board, onClose, onPark = () => {} }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const { engine, input, api } = board;
  const art = createPicoArt(doc);
  const audio = createPicoAudio(win);
  art.load(board.atlas?.());
  const savedCamera = { ...api._camera };
  const entities = new Map(), peers = new Map();
  const display = createWorldDisplay();
  let calculator = win.TI84Native.create(null, { renderer: display });
  calculator.setList('L1', DATA);
  let computedSummary = null;
  let state = null, socket = null, disposed = false, epoch = null, applied = 0;
  let joinedAt = 0, poseAt = 0, receivedAt = 0, clockOffset = 0, needsRelease = false;
  const openedAt = performance.now();
  let selected = null, lastRevision = -1;
  const keyQueue = [];
  let pendingPress = null, pressAt = 0;
  let participating = false, cameraX = 0;
  let ink = '#30263b', inkAt = -Infinity;
  const controls = doc.createElement('div');
  controls.dataset.calculatorControls = '';
  const screenReaderOnly = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;pointer-events:none';
  controls.style.cssText = screenReaderOnly;
  const status = doc.createElement('span');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'flex:1 1 240px;font:14px system-ui';
  status.textContent = 'Connecting the calculator team…';
  controls.append(status); container.append(controls);
  const readings = doc.createElement('output');
  readings.setAttribute('aria-label', 'Calculator five-number summary');
  readings.style.cssText = screenReaderOnly;
  container.append(readings);
  container.setAttribute('data-calculator-active', '');

  const terrain = () => [
    { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 },
    // Key platforms are one-way: jump through from below, land from above.
    // A dense physical keypad must not trap cats underneath a row of keys.
    // Once the boxplot appears, every ledge becomes scenery; only the floor is solid.
    ...(state?.step >= ROUTE.length ? [] : [...approachSteps(false), ...tilesFor(state?.step || 0)])
      .filter(tile => player.vy >= 0 && player.y + 24 <= tile.y + 1)
      .map(tile => ({ ...tile, x: tile.x + ENTRY_WIDTH, h: 8 })),
  ];
  const player = board.createPlayer({ x: 65, y: WORLD.floor - 24, input,
    terrain, peers: () => ({}), canvasW: () => LEVEL_WIDTH,
    onUpPressed: () => {
      if (player.x < 95) onPark();
      else if (besideResetDoor()) enterResetDoor();
    },
    physics: PICO });
  player.engine = engine;
  const movement = createCalculatorMotion(player, input, board.presses, () => audio.play('jump'));
  board.setBoardHeight(Math.round(WORLD.height * scale()));
  let layoutWidth = board.viewportW();
  // One world and one player. Only the camera moves at the mission boundary.
  Object.assign(api._camera, { enabled: false, x: 0 });
  function scale() { return Math.min(1, board.viewportW() / WORLD.width); }
  function clock() { return performance.now() + clockOffset; }
  function localPose() { return { x: player.x - ENTRY_WIDTH, y: player.y }; }
  function setParticipating(active) {
    if (active === participating) return;
    if (!active) send('calculator_leave');
    participating = active; joinedAt = 0; receivedAt = 0; needsRelease = true;
    keyQueue.length = 0; pendingPress = null;
    container.toggleAttribute('data-calculator-participating', active);
  }
  function returnToStart() {
    setParticipating(false);
    Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0, state: 'idle' });
    for (const key in input) input[key] = false;
  }
  function startMission() {
    player.x = ENTRY_WIDTH + 65;
    setParticipating(true);
    pump();
  }
  function connected() { return socket?.readyState === 1 && performance.now() - receivedAt < 3000; }
  function besideResetDoor() {
    return Math.abs(localPose().x + 10 - (RESET_DOOR.x + RESET_DOOR.w / 2)) < 34
      && player.y + 24 >= RESET_DOOR.y;
  }
  function enterResetDoor() {
    if (!participating || !state?.complete || !connected()) return;
    send('calculator_restart');
  }
  function send(type, extra = {}) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 4096) return;
    socket.send(JSON.stringify({ type, epoch: state?.epoch, revision: state?.revision, ...extra }));
  }
  function choose(tile) {
    if (!participating || !state || state.solved || !connected()) return;
    for (const key in input) input[key] = false;
    if (state.step < ROUTE.length) {
      Object.assign(player, { x: ENTRY_WIDTH + tile.x + tile.w / 2 - 10, y: tile.y - 24, vx: 0, vy: 0, standingOn: null });
    }
    needsRelease = true; selected = tile.key; poseAt = 0;
    keyQueue.push({ key: tile.key, summary: state.step >= ROUTE.length });
    flushPress();
  }
  function flushPress() {
    if (!participating || !state || state.solved || !connected()) return;
    // Serialize rapid clicks against acknowledged personal revisions. Retries
    // carry the original revision, so a delayed reply cannot double-press.
    if (!pendingPress && keyQueue.length) {
      const next = keyQueue.shift();
      if (next.summary !== (state.step >= ROUTE.length)) { keyQueue.length = 0; return; }
      pendingPress = { key: next.key, epoch: state.epoch, revision: state.revision };
      pressAt = -Infinity;
    }
    if (pendingPress && performance.now() - pressAt >= 500) {
      send('calculator_press', pendingPress); pressAt = performance.now();
    }
  }
  function onMessage(event) {
    if (!participating) return;
    let packet;
    try { packet = JSON.parse(event.data); } catch { return; }
    if (packet.type === 'calculator_error') {
      status.textContent = packet.message; joinedAt = 0; return;
    }
    if (packet.type !== 'calculator_state') return;
    if (packet.protocol !== 2) { status.textContent = 'Waiting for the individual-calculator server update.'; return; }
    if (state?.epoch === packet.epoch && packet.revision < state.revision) return;
    if (packet.complete && !state?.complete) audio.clear();
    else if (state?.epoch === packet.epoch && packet.revision > state.revision) {
      if (packet.solved && !state.solved) audio.play('switch');
      else if ((packet.keys?.length || 0) > (state.keys?.length || 0)) audio.play('switch');
    }
    const restarted = state?.complete && epoch !== packet.epoch;
    const timedOut = state && packet.timeoutCount !== state.timeoutCount && epoch === packet.epoch;
    receivedAt = performance.now(); clockOffset = packet.clock - receivedAt;
    if (epoch !== packet.epoch || timedOut) {
      keyQueue.length = 0; pendingPress = null;
      calculator = win.TI84Native.create(null, { renderer: display });
      calculator.setList('L1', DATA); applied = 0; epoch = packet.epoch;
      computedSummary = null;
    }
    // Replay committed input once, including when joining halfway through or reconnecting.
    const keys = packet.keys || ROUTE.slice(0, Math.min(packet.step, ROUTE.length));
    while (applied < keys.length) calculator.pressKey(keys[applied++]);
    const result = calculator.getComputedValues();
    if (result) computedSummary = [result.minX, result.Q1, result.Med, result.Q3, result.maxX];
    if (timedOut) {
      Object.assign(player, { x: ENTRY_WIDTH + 65, y: WORLD.floor - 24, vx: 0, vy: 0, standingOn: null });
      for (const key in input) input[key] = false;
    }
    if (lastRevision >= 0 && packet.revision !== lastRevision) {
      needsRelease = true; selected = null;
      // Standing on a repeated key needs a fresh choice; clicks are queued.
    }
    lastRevision = packet.revision; state = packet;
    if (pendingPress && packet.revision > pendingPress.revision) pendingPress = null;
    if (state.solved) { keyQueue.length = 0; pendingPress = null; }
    flushPress();
    readings.textContent = computedSummary ? LABELS.map((label, i) => label + ': ' + computedSummary[i]).join(' · ') : '';
    for (const member of state.members) {
      if (member.name === board.username) continue;
      if (!peers.has(member.name)) peers.set(member.name, board.createPeer(member.name, member.pose));
      Object.assign(peers.get(member.name), member.pose);
    }
    for (const name of peers.keys()) if (!state.members.some(member => member.name === name)) peers.delete(name);
    const hint = state.solved ? 'Your boxplot is ready. Help your teammates finish.'
      : state.step < ROUTE.length ? HINTS[state.step]
      : 'Choose ' + LABELS[state.step - ROUTE.length] + ' for the boxplot. Click its value.';
    const text = state.complete ? 'Together! Your five-number summary builds the boxplot. ' + state.bonus + '/12 quick decisions.'
      : state.solved ? hint + ' ' + state.readyCount + '/' + state.members.length + ' ready.'
      : 'Step ' + (state.step + 1) + '/12 · ' + state.members.length + ' on the team. ' + hint
        + (state.lastPress && !state.lastPress.advanced ? ' Pressed ' + state.lastPress.key + '. Goal not reached yet; keep trying or wait for the hint reset.' : '')
        + (state.hintKeys?.length ? ' Hint: choose ' + state.hintKeys.join(' or ') + '. Step reset—30 seconds to try again.' : '');
    if (status.textContent !== text) status.textContent = text;
    if (restarted) returnToStart();
  }
  function bind() {
    const next = getSocket();
    if (next === socket) return;
    socket?.removeEventListener('message', onMessage);
    socket = next; joinedAt = 0; receivedAt = 0;
    socket?.addEventListener('message', onMessage);
  }
  function pump() {
    if (disposed || doc.hidden) return;
    bind();
    if (!participating) return;
    if (socket?.readyState !== 1) { status.textContent = 'Reconnecting—your team progress is saved.'; return; }
    if (!joinedAt || performance.now() - receivedAt > 3000) {
      if (!state && performance.now() - openedAt > 8000) {
        status.textContent = 'The calculator room is waiting for the classroom server update. You can return to the room and try again.';
      } else if (state) {
        status.textContent = 'Reconnecting—your team progress is saved.';
      }
      if (performance.now() - joinedAt > 1500 || !joinedAt) {
        send('calculator_join', { protocol: 2 }); joinedAt = performance.now();
      }
    }
    if (!state || !connected() || doc.hidden) return;
    flushPress();
    if (performance.now() - poseAt >= 100) {
      poseAt = performance.now();
      send('calculator_pose', { pose: localPose(), ready: !needsRelease && !pendingPress && !keyQueue.length });
    }
  }
  function update(dt) {
    if (board.viewportW() !== layoutWidth) {
      layoutWidth = board.viewportW(); board.setBoardHeight(Math.round(WORLD.height * scale()));
    }
    if (disposed || doc.hidden) return;
    movement.advance(dt);
    if (player.y > WORLD.floor) Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0 });
    if (player.x >= ENTRY_WIDTH + 20) setParticipating(true);
    if (player.x < ENTRY_WIDTH) setParticipating(false);
    if (!tileAt(localPose(), state?.step || 0)) needsRelease = false;
    selected = needsRelease ? null : tileAt(localPose(), state?.step || 0);
    const viewport = board.viewportW() / scale();
    // Mouse-first solving: keep every key visible instead of chasing the selected cat.
    const target = Math.max(0, Math.min(LEVEL_WIDTH - viewport,
      participating ? ENTRY_WIDTH : player.x - viewport * 0.4));
    cameraX += (target - cameraX) * Math.min(1, dt * 8);
  }
  function text(ctx, value, x, y, size = 14, color = ink, align = 'left') {
    pixelText(ctx, value, x, y, size, color, align);
  }
  function keyPlatform(ctx, tile, colour) {
    const { x, y, w, h } = tile, cut = 4;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut);
    ctx.closePath(); ctx.fill();
  }
  function draw(ctx) {
    const step = state?.step || 0;
    const showingBoxplot = step >= ROUTE.length;
    if (performance.now() - inkAt > 1000) {
      ink = win.getComputedStyle(container).color || '#30263b';
      inkAt = performance.now();
    }
    ctx.save(); ctx.scale(scale(), scale()); ctx.translate(-Math.round(cameraX), 0);
    ctx.imageSmoothingEnabled = false;
    // CanvasEngine clears each frame; transparency reveals the actual calendar DOM.
    art.block(ctx, { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 });
    text(ctx, 'CALCULATOR TOGETHER', 85, 365, 21);
    text(ctx, 'WALK RIGHT TO START >', 85, 410, 21);
    text(ctx, 'CLICK A KEY TO CHOOSE IT', 85, 451, 14);
    text(ctx, 'FIND THE FIVE-NUMBER SUMMARY', 85, 485, 14);
    text(ctx, 'SOLVE YOUR WAY. MATCH THE BOXPLOT.', 85, 513, 14);
    text(ctx, 'ARROWS MOVE . UP ENTERS DOORS', 85, 545, 14);
    const atlas = board.atlas?.();
    if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, 30, WORLD.floor - 40, 40, 40);
    else { ctx.fillStyle = '#493d48'; ctx.fillRect(30, WORLD.floor - 40, 40, 40); }
    text(ctx, 'PICO PARK', 24, WORLD.floor - 70, 14);
    text(ctx, 'UP TO ENTER', 24, WORLD.floor - 49, 10);
    ctx.save(); ctx.translate(ENTRY_WIDTH, 0);
    text(ctx, 'CALCULATOR TOGETHER', 28, 30, 20);
    text(ctx, 'MISSION: MAKE A FIVE-NUMBER SUMMARY', 28, 53, 14);
    text(ctx, 'L1 = {' + DATA.join(', ') + '}', 28, 76, 12);
    // No bezel or LCD background: live menu text is part of the scenery.
    for (const [i, line] of (showingBoxplot ? [] : display.getLines().slice(0, 8)).entries()) {
      text(ctx, (line.selected ? '> ' : '  ') + line.text, 28, 106 + i * 21, 14,
        ink);
    }
    text(ctx, state?.complete ? 'MISSION COMPLETE!' : 'ONE TEAM · ONE GOAL', 350, 112, 17);
    const elapsed = state ? clock() - state.startedAt : 0;
    const remain = Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000));
    text(ctx, state ? (state.solved ? 'Your boxplot is ready.' : remain + 's · hint + reset') : 'READY TO PLAY', 350, 143, 14);
    text(ctx, state?.complete ? 'Walk to the door. Press UP.' : state?.solved ? 'Help your teammates finish.'
      : showingBoxplot ? 'Click a value for the boxplot.' : 'Click to press your own keys.', 350, 175, 12);
    text(ctx, state ? state.readyCount + '/' + state.members.length + ' matching boxplots ready' : 'Everyone solves independently.', 350, 197, 12);
    text(ctx, state?.solved ? 'All five values matched.'
      : state?.hintKeys?.length ? 'HINT: ' + state.hintKeys.join(' / ') : 'Equivalent keys count.', 350, 219, 12);
    const hold = state?.holdAt == null ? 0 : Math.min(1, (clock() - state.holdAt) / HOLD_MS);
    if (!state?.solved && state?.holdAt != null) {
      ctx.fillStyle = '#d5c5ae'; ctx.fillRect(350, 234, 315, 12);
      ctx.fillStyle = '#479b67'; ctx.fillRect(350, 234, 315 * hold, 12);
    }
    if (state?.holdAt != null) text(ctx, 'HOLD TO PRESS', 350, 269, 10);
    else if (state?.lastPress && !state.lastPress.advanced) {
      text(ctx, state.lastPress.key + ' PRESSED · KEEP TRYING', 350, 269, 10);
    }
    ctx.save();
    if (showingBoxplot) ctx.globalAlpha *= 0.22;
    for (const ledge of approachSteps(showingBoxplot)) keyPlatform(ctx, ledge, '#494458');
    ctx.restore();
    for (const tile of tilesFor(step)) {
      const hint = state?.hintKeys?.includes(tile.key);
      ctx.save();
      if (showingBoxplot) ctx.globalAlpha *= 0.22;
      keyPlatform(ctx, tile, selected === tile.key ? '#f9c45f' : hint ? '#9bdfae' : '#494458');
      ctx.restore();
      ctx.save();
      if (state?.solved) ctx.globalAlpha *= 0.22;
      text(ctx, tile.key, tile.x + tile.w / 2, tile.y + 18, 12,
        showingBoxplot ? ink : selected === tile.key || hint ? '#30263b' : '#fff', 'center');
      ctx.restore();
    }
    if (step >= ROUTE.length) drawBoxplot(ctx, step - ROUTE.length);
    if (state?.complete) {
      const { x, y, w, h } = RESET_DOOR;
      if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, x, y, w, h);
      else { ctx.fillStyle = '#493d48'; ctx.fillRect(x, y, w, h); }
      text(ctx, 'RESET', x + w / 2, y - 24, 14, ink, 'center');
      text(ctx, 'UP TO ENTER', x + w / 2, y - 9, 7, ink, 'center');
    }
    for (const [name, peer] of peers) { peer.render(ctx); text(ctx, name.slice(0, 12), peer.x + 10, peer.y - 8, 10, ink, 'center'); }
    if (participating && !connected()) text(ctx, 'CONNECTING TO YOUR TEAM...', 360, 280, 14, ink, 'center');
    ctx.restore();
    player.render(ctx);
    text(ctx, 'YOU', player.x + 10, player.y - 8, 10, ink, 'center');
    ctx.restore();
  }
  function drawBoxplot(ctx, filled) {
    text(ctx, state.solved ? 'Five numbers. One picture.' : 'BUILD THE BOXPLOT: ' + LABELS[filled], 360, 317, 18, ink, 'center');
    const x = value => 105 + (value - 4) * 30;
    ctx.strokeStyle = '#aaa18f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x(4), 448); ctx.lineTo(x(20), 448); ctx.stroke();
    for (let i = 0; i < filled; i++) {
      text(ctx, LABELS[i], x(SUMMARY[i]), 394, 11, ink, 'center');
      text(ctx, String(SUMMARY[i]), x(SUMMARY[i]), 417, 16, ink, 'center');
    }
    if (filled === 5) {
      ctx.fillStyle = '#aad9ac'; ctx.fillRect(x(7), 428, x(14) - x(7), 40);
      ctx.strokeStyle = ink; ctx.strokeRect(x(7), 428, x(14) - x(7), 40);
      for (const value of [4, 11, 20]) { ctx.beginPath(); ctx.moveTo(x(value), 428); ctx.lineTo(x(value), 468); ctx.stroke(); }
      text(ctx, 'Half the observations lie between Q1 and Q3.', 360, 510, 12, ink, 'center');
    }
  }
  function pointer(event) {
    if (state?.solved) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const rect = engine.canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left) / scale() + Math.round(cameraX);
    const x = worldX - ENTRY_WIDTH, y = (event.clientY - rect.top) / scale();
    const tile = tilesFor(state?.step || 0).find(tile => x >= tile.x && x <= tile.x + tile.w && y >= tile.y - 12 && y <= tile.y + tile.h);
    if (tile) { event.preventDefault(); event.stopImmediatePropagation(); choose(tile); }
  }
  function key(event) {
    if (event.key === 'Escape') { event.preventDefault(); returnToStart(); }
    // Handle brief taps even when keydown and keyup fall between physics steps.
    if (event.key === 'ArrowUp' && !event.repeat && !event.target?.closest?.('input, textarea, select, [contenteditable="true"]')
      && state?.complete && besideResetDoor()) {
      event.preventDefault(); enterResetDoor();
    }
  }
  function visibility() {
    if (!doc.hidden) { joinedAt = 0; return; }
    setParticipating(false); for (const key in input) input[key] = false;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; send('calculator_leave');
    audio.dispose();
    clearInterval(timer); socket?.removeEventListener('message', onMessage);
    engine.canvas.removeEventListener('click', pointer, true);
    doc.removeEventListener('keydown', key); doc.removeEventListener('visibilitychange', visibility);
    controls.remove(); readings.remove(); container.removeAttribute('data-calculator-active');
    container.removeAttribute('data-calculator-participating');
    if (engine.sceneEntities === entities) engine.sceneEntities = null;
    Object.assign(api._camera, savedCamera); onClose();
  }
  entities.set('calculator-room', { update, render: draw });
  entities.set('dissolve', createSceneDissolve(board.transitionFrame));
  engine.sceneEntities = entities;
  engine.canvas.addEventListener('click', pointer, true); doc.addEventListener('keydown', key);
  doc.addEventListener('visibilitychange', visibility);
  const timer = setInterval(pump, 100); pump();
  return { kind: 'calculator', dispose, startMission, returnToStart, getState: () => state,
    getView: () => ({ cameraX, playerX: player.x, playerY: player.y, participating, entranceX: ENTRY_WIDTH,
      resetDoor: state?.complete ? { ...RESET_DOOR } : null, lines: display.getLines() }),
    getCalculatorScreen: () => calculator.getScreen() };
}
