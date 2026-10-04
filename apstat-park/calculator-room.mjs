const V = new URL(import.meta.url).search;
const mission = await import('./calculator-mission.mjs' + V);
const { DATA, ROUTE, HINTS, SUMMARY, LABELS, HOLD_MS, ROUND_MS, WORLD, tilesFor, expectedAt, tileAt } = mission;
const { nativeScriptFilenames } = await import('../ti84-trainer-v2/native/manifest.mjs' + V);
// The trainer's existing calculator and LCD renderer, not screenshots or a second evaluator.
for (const file of nativeScriptFilenames) await import('../ti84-trainer-v2/native/' + file + V);

export function mountParkPanel({ container, getSocket, board, onClose }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const { engine, input, api } = board;
  const savedCamera = { ...api._camera };
  const entities = new Map(), peers = new Map();
  const lcd = doc.createElement('canvas');
  const calculator = win.TI84Native.create(lcd);
  calculator.setList('L1', DATA);
  let computedSummary = null;
  calculator.on('compute', event => {
    const result = event.results;
    if (result) computedSummary = [result.minX, result.Q1, result.Med, result.Q3, result.maxX];
  });
  let state = null, socket = null, disposed = false, epoch = null, applied = 0;
  let joinedAt = 0, poseAt = 0, receivedAt = 0, clockOffset = 0, needsRelease = false;
  const openedAt = performance.now();
  let selected = null, lastRevision = -1;
  const controls = doc.createElement('div');
  controls.dataset.calculatorControls = '';
  controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;padding:8px;background:#fff5df;color:#342c39;position:relative;z-index:2';
  const status = doc.createElement('span');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'flex:1 1 240px;font:14px system-ui';
  status.textContent = 'Connecting the calculator team…';
  const exit = doc.createElement('button'); exit.textContent = 'Back to room'; exit.onclick = dispose;
  const restart = doc.createElement('button'); restart.textContent = 'Play again'; restart.hidden = true;
  restart.onclick = () => send('calculator_restart');
  controls.append(status, restart, exit); container.append(controls);
  const readings = doc.createElement('output');
  readings.setAttribute('aria-label', 'Calculator five-number summary');
  readings.style.cssText = 'display:none;padding:8px;background:#e2ebcc;color:#252b20;font:14px monospace';
  container.append(readings);
  container.setAttribute('data-calculator-active', '');

  // Native buttons provide keyboard/screen-reader/touch access to the same spatial choices.
  const choices = doc.createElement('div');
  choices.setAttribute('aria-label', 'Calculator key tiles');
  choices.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;background:#fff5df;padding:0 8px 8px';
  const accessible = doc.createElement('details');
  const caption = doc.createElement('summary');
  caption.textContent = 'Choose a tile without jumping (keyboard or touch)';
  accessible.style.cssText = 'background:#fff5df;color:#342c39;padding:8px;font:13px system-ui';
  accessible.append(caption, choices); container.append(accessible);
  let choicePhase = null;
  function rebuildChoices() {
    const phase = state?.step >= ROUTE.length ? 'summary' : 'keys';
    if (choicePhase === phase) return;
    choicePhase = phase; choices.replaceChildren();
    for (const tile of tilesFor(state?.step || 0)) {
      const button = doc.createElement('button');
      button.textContent = tile.key; button.dataset.calculatorKey = tile.key;
      button.setAttribute('aria-label', 'Stand on ' + tile.key);
      button.style.cssText = 'min-width:40px;min-height:32px;border:1px solid #b9a18a;border-radius:4px;background:#fff;color:#282339';
      button.onclick = () => choose(tile);
      choices.append(button);
    }
  }
  const terrain = () => [
    { x: 0, y: WORLD.floor, w: WORLD.width, h: 50 },
    // Key platforms are one-way: jump through from below, land from above.
    // A dense physical keypad must not trap cats underneath a row of keys.
    ...tilesFor(state?.step || 0).filter(tile => player.vy >= 0 && player.y + 24 <= tile.y + 1)
      .map(tile => ({ ...tile, h: 8 })),
  ];
  const player = board.createPlayer({ x: 65, y: WORLD.floor - 24, input,
    terrain, peers: () => ({}), canvasW: () => WORLD.width,
    physics: { name: 'legacy', walkSpeed: 210, jumpV0: -360, gravity: 800 } });
  player.engine = engine;
  board.setBoardHeight(Math.round(WORLD.height * scale()));
  let layoutWidth = board.viewportW();
  // Use a fixed world, scaled to the available desk width, for identical tile positions.
  Object.assign(api._camera, { enabled: false, x: 0 });
  function scale() { return Math.min(1, board.viewportW() / WORLD.width); }
  function clock() { return performance.now() + clockOffset; }
  function connected() { return socket?.readyState === 1 && performance.now() - receivedAt < 3000; }
  function send(type, extra = {}) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 4096) return;
    socket.send(JSON.stringify({ type, epoch: state?.epoch, revision: state?.revision, ...extra }));
  }
  function choose(tile) {
    if (!state || state.complete || !connected()) return;
    for (const key in input) input[key] = false;
    Object.assign(player, { x: tile.x + tile.w / 2 - 10, y: tile.y - 24, vx: 0, vy: 0, standingOn: null });
    needsRelease = false; selected = tile.key; poseAt = 0;
  }
  function onMessage(event) {
    let packet;
    try { packet = JSON.parse(event.data); } catch { return; }
    if (packet.type === 'calculator_error') {
      status.textContent = packet.message; joinedAt = 0; return;
    }
    if (packet.type !== 'calculator_state') return;
    if (state?.epoch === packet.epoch && packet.revision < state.revision) return;
    receivedAt = performance.now(); clockOffset = packet.clock - receivedAt;
    if (epoch !== packet.epoch) {
      calculator.reset(); calculator.setList('L1', DATA); applied = 0; epoch = packet.epoch;
      computedSummary = null;
      Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0, state: 'idle' });
    }
    // Replay committed input once, including when joining halfway through or reconnecting.
    while (applied < Math.min(packet.step, ROUTE.length)) calculator.pressKey(ROUTE[applied++]);
    if (lastRevision >= 0 && packet.revision !== lastRevision) {
      needsRelease = true; selected = null;
      // Repeated DOWN/ENTER needs a fresh decision: step/jump off, or choose
      // the accessible tile again. Keep the character where the team left it.
    }
    lastRevision = packet.revision; state = packet;
    readings.style.display = state.step >= ROUTE.length ? 'block' : 'none';
    readings.textContent = computedSummary ? LABELS.map((label, i) => label + ': ' + computedSummary[i]).join(' · ') : '';
    rebuildChoices(); restart.hidden = !state.complete;
    for (const member of state.members) {
      if (member.name === board.username) continue;
      if (!peers.has(member.name)) peers.set(member.name, board.createPeer(member.name, member.pose));
      Object.assign(peers.get(member.name), member.pose);
    }
    for (const name of peers.keys()) if (!state.members.some(member => member.name === name)) peers.delete(name);
    const elapsed = clock() - state.startedAt;
    const hint = state.step < ROUTE.length ? HINTS[state.step]
      : 'Read ' + LABELS[state.step - ROUTE.length] + ' from the summary. Stand on its value.';
    const text = state.complete ? 'Together! Your five-number summary builds the boxplot. ' + state.bonus + '/12 quick decisions.'
      : 'Step ' + (state.step + 1) + '/12 · ' + state.members.length + ' on the team. ' + hint
        + (elapsed >= ROUND_MS ? ' Hint: choose ' + expectedAt(state.step) + '. Keep going—no lives lost.' : '');
    if (status.textContent !== text) status.textContent = text;
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
    if (socket?.readyState !== 1) { status.textContent = 'Reconnecting—your team progress is saved.'; return; }
    if (!joinedAt || performance.now() - receivedAt > 3000) {
      if (!state && performance.now() - openedAt > 8000) {
        status.textContent = 'The calculator room is waiting for the classroom server update. You can return to the room and try again.';
      } else if (state) {
        status.textContent = 'Reconnecting—your team progress is saved.';
      }
      if (performance.now() - joinedAt > 1500 || !joinedAt) {
        send('calculator_join'); joinedAt = performance.now();
      }
    }
    if (!state || !connected() || doc.hidden) return;
    if (performance.now() - poseAt >= 100) {
      poseAt = performance.now();
      send('calculator_pose', { pose: { x: player.x, y: player.y }, ready: !needsRelease });
    }
  }
  function update(dt) {
    if (board.viewportW() !== layoutWidth) {
      layoutWidth = board.viewportW(); board.setBoardHeight(Math.round(WORLD.height * scale()));
    }
    if (disposed || doc.hidden || !connected()) return;
    player.update(dt);
    if (player.y > WORLD.floor) Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0 });
    if (!tileAt(player, state?.step || 0)) needsRelease = false;
    selected = needsRelease ? null : tileAt(player, state?.step || 0);
  }
  function text(ctx, value, x, y, size = 14, color = '#30263b', align = 'left') {
    ctx.fillStyle = color; ctx.font = 'bold ' + size + 'px monospace'; ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  function draw(ctx) {
    ctx.save(); ctx.scale(scale(), scale());
    ctx.fillStyle = '#fff7e7'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = '#eb9447'; ctx.fillRect(0, WORLD.floor, WORLD.width, 50);
    ctx.fillStyle = '#b95e30';
    for (let x = 0; x < WORLD.width; x += 24) ctx.fillRect(x, WORLD.floor + 20, 18, 3);
    text(ctx, 'CALCULATOR TOGETHER', 28, 30, 20);
    text(ctx, 'MISSION: MAKE A FIVE-NUMBER SUMMARY', 28, 53, 14);
    text(ctx, 'L1 = {' + DATA.join(', ') + '}', 28, 76, 12);
    ctx.fillStyle = '#373443'; ctx.fillRect(28, 92, 300, 174);
    ctx.drawImage(lcd, 75, 102, 205, 154);
    text(ctx, state?.complete ? 'MISSION COMPLETE!' : 'ONE TEAM · ONE KEY', 350, 112, 17);
    const elapsed = state ? clock() - state.startedAt : 0;
    const remain = Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000));
    text(ctx, state ? (state.complete ? 'You built a boxplot.' : remain + 's · then a hint') : 'Connecting…', 350, 143, 16);
    text(ctx, 'Arrows move · Space jumps', 350, 175, 12);
    text(ctx, 'Or tap a tile to stand there.', 350, 197, 12);
    text(ctx, 'Everyone holds the right tile.', 350, 219, 12);
    const hold = state?.holdAt == null ? 0 : Math.min(1, (clock() - state.holdAt) / HOLD_MS);
    ctx.fillStyle = '#d5c5ae'; ctx.fillRect(350, 234, 315, 12);
    ctx.fillStyle = '#479b67'; ctx.fillRect(350, 234, 315 * hold, 12);
    const step = state?.step || 0;
    for (const tile of tilesFor(step)) {
      const hint = state && elapsed >= ROUND_MS && tile.key === expectedAt(step);
      ctx.fillStyle = selected === tile.key ? '#f9c45f' : hint ? '#9bdfae' : '#494458';
      ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
      text(ctx, tile.key, tile.x + tile.w / 2, tile.y + 18, 12, selected === tile.key || hint ? '#30263b' : '#fff', 'center');
    }
    if (step >= ROUTE.length) drawBoxplot(ctx, step - ROUTE.length);
    for (const [name, peer] of peers) { peer.render(ctx); text(ctx, name.slice(0, 12), peer.x + 10, peer.y - 8, 10, '#3d3345', 'center'); }
    player.render(ctx);
    text(ctx, 'YOU', player.x + 10, player.y - 8, 10, '#3d3345', 'center');
    if (!connected()) { ctx.fillStyle = '#fff7e7d9'; ctx.fillRect(0, 270, WORLD.width, 400); text(ctx, 'Waiting for the classroom connection…', 360, 420, 16, '#30263b', 'center'); }
    ctx.restore();
  }
  function drawBoxplot(ctx, filled) {
    text(ctx, state.complete ? 'Five numbers. One picture.' : 'BUILD THE BOXPLOT: ' + LABELS[filled], 360, 317, 18, '#30263b', 'center');
    const x = value => 105 + (value - 4) * 30;
    ctx.strokeStyle = '#aaa18f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x(4), 448); ctx.lineTo(x(20), 448); ctx.stroke();
    for (let i = 0; i < filled; i++) {
      text(ctx, LABELS[i], x(SUMMARY[i]), 394, 11, '#30263b', 'center');
      text(ctx, String(SUMMARY[i]), x(SUMMARY[i]), 417, 16, '#30263b', 'center');
    }
    if (filled === 5) {
      ctx.fillStyle = '#aad9ac'; ctx.fillRect(x(7), 428, x(14) - x(7), 40);
      ctx.strokeStyle = '#30263b'; ctx.strokeRect(x(7), 428, x(14) - x(7), 40);
      for (const value of [4, 11, 20]) { ctx.beginPath(); ctx.moveTo(x(value), 428); ctx.lineTo(x(value), 468); ctx.stroke(); }
      text(ctx, 'Half the observations lie between Q1 and Q3.', 360, 510, 12, '#30263b', 'center');
    }
  }
  function pointer(event) {
    const rect = engine.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale(), y = (event.clientY - rect.top) / scale();
    const tile = tilesFor(state?.step || 0).find(tile => x >= tile.x && x <= tile.x + tile.w && y >= tile.y - 12 && y <= tile.y + tile.h);
    if (tile) { event.preventDefault(); event.stopImmediatePropagation(); choose(tile); }
  }
  function key(event) {
    if (event.key === 'Escape') { event.preventDefault(); dispose(); }
  }
  function visibility() {
    if (!doc.hidden) { joinedAt = 0; return; }
    send('calculator_leave'); for (const key in input) input[key] = false;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; send('calculator_leave');
    clearInterval(timer); socket?.removeEventListener('message', onMessage);
    engine.canvas.removeEventListener('click', pointer, true);
    doc.removeEventListener('keydown', key); doc.removeEventListener('visibilitychange', visibility);
    controls.remove(); readings.remove(); accessible.remove(); container.removeAttribute('data-calculator-active');
    if (engine.sceneEntities === entities) engine.sceneEntities = null;
    Object.assign(api._camera, savedCamera); onClose();
  }
  entities.set('calculator-room', { update, render: draw });
  engine.sceneEntities = entities;
  engine.canvas.addEventListener('click', pointer, true); doc.addEventListener('keydown', key);
  doc.addEventListener('visibilitychange', visibility);
  rebuildChoices(); const timer = setInterval(pump, 100); pump();
  return { dispose, getState: () => state, getCalculatorScreen: () => calculator.getScreen() };
}
