const V = new URL(import.meta.url).search;
const mission = await import('./calculator-mission.mjs' + V);
const { HOLD_MS, timeLimitFor, WORLD, tilesFor, tileAt } = mission;
const { DEFAULT_LEVEL, levelById, challengeFor, initializeCalculator } = await import('./calculator-curriculum.mjs' + V);
const { drawChallenge } = await import('./calculator-challenge-view.mjs' + V);
const { nativeScriptFilenames } = await import('../ti84-trainer-v2/native/manifest.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { keyboardLayer, keyLabel, keyInstruction } = await import('./calculator-key-labels.mjs' + V);
const { createWorldDisplay } = await import('./calculator-display.mjs' + V);
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { createPicoAudio } = await import('./pico-audio.mjs' + V);
const { PICO } = await import('./physics.mjs' + V);
const { approachSteps, createCalculatorMotion } = await import('./calculator-motion.mjs' + V);
const { createSceneDissolve } = await import('./scene-transition.mjs' + V);
const { catBodyForHue, rgbHex } = await import('./pico-rules.mjs' + V);
const { ATLAS } = await import('./assets/pico-atlas.mjs' + V);
const { TEAM_BLOCK, CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs' + V);
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
  const entities = new Map(), peers = new Map(), lobbyPeers = new Map();
  let lobby = null, lobbyAt = -Infinity;
  const display = createWorldDisplay();
  let level = DEFAULT_LEVEL, challenge = challengeFor(level);
  let calculator = win.TI84Native.create(null, { renderer: display });
  initializeCalculator(calculator, level);
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
  readings.setAttribute('aria-label', 'Calculator result');
  readings.style.cssText = screenReaderOnly;
  container.append(readings);
  container.setAttribute('data-calculator-active', '');

  const terrain = () => [
    { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 },
    ...(lobby?.phase === 'gathering' && player.vy >= 0 && player.y + 24 <= TEAM_BLOCK.y + 1
      ? [{ x: lobby.blockX, y: TEAM_BLOCK.y, w: TEAM_BLOCK.w, h: TEAM_BLOCK.h }] : []),
    // Key platforms are one-way: jump through from below, land from above.
    // A dense physical keypad must not trap cats underneath a row of keys.
    // Once the boxplot appears, every ledge becomes scenery; only the floor is solid.
    ...(state?.step >= level.route.length ? [] : [...approachSteps(false), ...tilesFor(state?.step || 0, level)])
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
    cameraX = Math.max(0, Math.min(ENTRY_WIDTH, LEVEL_WIDTH - board.viewportW() / scale()));
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
    if (!participating || !state || state.solved || state.failure || !connected()) return;
    for (const key in input) input[key] = false;
    if (state.step < level.route.length) {
      Object.assign(player, { x: ENTRY_WIDTH + tile.x + tile.w / 2 - 10, y: tile.y - 24, vx: 0, vy: 0, standingOn: null });
    }
    needsRelease = true; selected = tile.key; poseAt = 0;
    keyQueue.push({ key: tile.key, summary: state.step >= level.route.length });
    flushPress();
  }
  function flushPress() {
    if (!participating || !state || state.solved || state.failure || !connected()) return;
    // Serialize rapid clicks against acknowledged personal revisions. Retries
    // carry the original revision, so a delayed reply cannot double-press.
    if (!pendingPress && keyQueue.length) {
      const next = keyQueue.shift();
      if (next.summary !== (state.step >= level.route.length)) { keyQueue.length = 0; return; }
      pendingPress = { key: next.key, epoch: state.epoch, revision: state.revision };
      pressAt = -Infinity;
    }
    if (pendingPress && performance.now() - pressAt >= 500) {
      send('calculator_press', pendingPress); pressAt = performance.now();
    }
  }
  function onMessage(event) {
    let packet;
    try { packet = JSON.parse(event.data); } catch { return; }
    if (packet.type === 'calculator_lobby_state') {
      if (packet.protocol !== CALCULATOR_PROTOCOL) return;
      const reset = lobby && lobby.epoch !== packet.epoch && packet.phase === 'gathering';
      lobby = packet;
      for (const member of packet.members) {
        if (member.name === board.username) continue;
        if (!lobbyPeers.has(member.name)) lobbyPeers.set(member.name, board.createPeer(member.name, member.pose));
        Object.assign(lobbyPeers.get(member.name), member.pose);
      }
      for (const name of lobbyPeers.keys()) if (!packet.members.some(member => member.name === name)) lobbyPeers.delete(name);
      if (reset) {
        state = null; peers.clear(); epoch = null; applied = 0; lastRevision = -1; computedSummary = null;
        calculator = win.TI84Native.create(null, { renderer: display }); initializeCalculator(calculator, level);
        readings.textContent = '';
        returnToStart();
      }
      const preview = levelById(packet.missionId);
      if (!state && preview && preview.id !== level.id) {
        level = preview; challenge = challengeFor(level);
        calculator = win.TI84Native.create(null, { renderer: display });
        initializeCalculator(calculator, level); applied = 0;
      }
      if ((board.role === 'teacher' || (packet.phase === 'active' && packet.roster.includes(board.username))) && player.x >= ENTRY_WIDTH + 20) {
        setParticipating(true);
      }
      return;
    }
    if (!participating) return;
    if (packet.type === 'calculator_error') {
      status.textContent = packet.message; joinedAt = 0; return;
    }
    if (packet.type !== 'calculator_state') return;
    if (packet.protocol !== CALCULATOR_PROTOCOL) { status.textContent = 'Waiting for the team-block server update.'; return; }
    if (state?.epoch === packet.epoch && packet.revision < state.revision) return;
    const incomingLevel = levelById(packet.missionId);
    if (!incomingLevel) { status.textContent = 'Reload to load this calculator skill.'; return; }
    level = incomingLevel; challenge = challengeFor(level);
    if (packet.complete && !state?.complete) audio.clear();
    else if (state?.epoch === packet.epoch && packet.revision > state.revision) {
      if (packet.solved && !state.solved) audio.play('switch');
      else if ((packet.keys?.length || 0) > (state.keys?.length || 0)) audio.play('switch');
    }
    const restarted = state?.complete && epoch !== packet.epoch;
    const teamReset = state && epoch !== packet.epoch && packet.resetReason?.type === 'timeout';
    if (packet.failure && !state?.failure) {
      keyQueue.length = 0; pendingPress = null;
      for (const key in input) input[key] = false;
    }
    const timedOut = state && packet.timeoutCount !== state.timeoutCount && epoch === packet.epoch;
    receivedAt = performance.now(); clockOffset = packet.clock - receivedAt;
    if (epoch !== packet.epoch || timedOut) {
      keyQueue.length = 0; pendingPress = null;
      calculator = win.TI84Native.create(null, { renderer: display });
      initializeCalculator(calculator, level); applied = 0; epoch = packet.epoch;
      computedSummary = null;
    }
    // Replay committed input once, including when joining halfway through or reconnecting.
    const keys = packet.keys || level.route.slice(0, Math.min(packet.step, level.route.length));
    while (applied < keys.length) calculator.pressKey(keys[applied++]);
    if (packet.step >= level.route.length) computedSummary = challenge.answers;
    if (timedOut || teamReset) {
      Object.assign(player, { x: ENTRY_WIDTH + 65, y: WORLD.floor - 24, vx: 0, vy: 0, standingOn: null });
      for (const key in input) input[key] = false;
    }
    if (lastRevision >= 0 && packet.revision !== lastRevision) {
      needsRelease = true; selected = null;
      // Standing on a repeated key needs a fresh choice; clicks are queued.
    }
    if (state && packet.boxAttempts !== state.boxAttempts) { keyQueue.length = 0; pendingPress = null; }
    lastRevision = packet.revision; state = packet;
    if (pendingPress && packet.revision > pendingPress.revision) pendingPress = null;
    if (state.solved) { keyQueue.length = 0; pendingPress = null; }
    flushPress();
    readings.textContent = computedSummary ? challenge.labels.map((label, i) => label + ': ' + computedSummary[i]).join(' · ') : '';
    for (const member of state.members) {
      if (member.name === board.username) continue;
      if (!peers.has(member.name)) peers.set(member.name, board.createPeer(member.name, member.pose));
      Object.assign(peers.get(member.name), member.pose);
    }
    for (const name of peers.keys()) if (!state.members.some(member => member.name === name)) peers.delete(name);
    const hint = state.solved ? 'Your result is ready. Help your teammates finish.'
      : state.step < level.route.length ? keyInstruction(level.route[state.step], level.hints[state.step], keyboardLayer(calculator.save()), level.route[state.step + 1])
      : 'Choose ' + challenge.labels[state.step - level.route.length] + '. Click its value.';
    const text = state.failure ? (state.step >= level.route.length
      ? 'Time is up. Returning to your result checkpoint with a fresh timer.'
      : 'Time is up. Restarting the calculator portion.')
      : state.complete ? 'Together! ' + level.title + ' complete.'
      : state.solved ? hint + ' ' + state.readyCount + '/' + state.teamSize + ' ready.'
      : 'Step ' + (state.step + 1) + '/' + (level.route.length + challenge.answers.length) + ' · ' + state.teamSize + ' on the team. ' + hint
        + (state.lastPress && !state.lastPress.advanced ? ' Pressed ' + state.lastPress.key + '. The countdown keeps running. Reach the next checkpoint before time runs out.' : '')
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
    if (performance.now() - lobbyAt >= 100) {
      lobbyAt = performance.now();
      const missionCamera = Math.max(0, Math.min(ENTRY_WIDTH, LEVEL_WIDTH - board.viewportW() / scale()));
      send('calculator_lobby', { protocol: CALCULATOR_PROTOCOL, epoch: lobby?.epoch,
        pose: { x: player.x, y: player.y }, pushing: !!input.right && !input.left,
        ready: player.x >= ENTRY_WIDTH + 20 && cameraX >= missionCamera - 0.5 });
    }
    if (!participating) return;
    if (socket?.readyState !== 1) { status.textContent = 'Reconnecting—your team progress is saved.'; return; }
    if (!joinedAt || performance.now() - receivedAt > 3000) {
      if (!state && performance.now() - openedAt > 8000) {
        status.textContent = 'The calculator room is waiting for the classroom server update. You can return to the room and try again.';
      } else if (state) {
        status.textContent = 'Reconnecting—your team progress is saved.';
      }
      if (performance.now() - joinedAt > 1500 || !joinedAt) {
        send('calculator_join', { protocol: CALCULATOR_PROTOCOL }); joinedAt = performance.now();
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
    if (state?.failure && participating) return;
    const previousX = player.x;
    movement.advance(dt);
    if (lobby?.phase === 'gathering' && player.y + 24 > TEAM_BLOCK.y + 1) {
      const left = lobby.blockX, right = left + TEAM_BLOCK.w;
      if (previousX + 20 <= left + 4 && player.x + 20 > left) player.x = left - 20;
      else if (previousX >= right - 4 && player.x < right) player.x = right;
    }
    if (player.y > WORLD.floor) Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0 });
    if (player.x < ENTRY_WIDTH) setParticipating(false);
    if (!tileAt(localPose(), state?.step || 0, level)) needsRelease = false;
    selected = needsRelease ? null : tileAt(localPose(), state?.step || 0, level);
    const viewport = board.viewportW() / scale();
    // Mouse-first solving: keep every key visible instead of chasing the selected cat.
    const assembling = lobby?.phase === 'assembling' && lobby.roster.includes(board.username);
    const target = Math.max(0, Math.min(LEVEL_WIDTH - viewport,
      participating || assembling ? ENTRY_WIDTH : player.x - viewport * 0.4));
    const cameraStep = (target - cameraX) * Math.min(1, dt * 8);
    const maxStep = (input.run ? 180 : 90) * dt;
    cameraX += Math.max(-maxStep, Math.min(maxStep, cameraStep));
  }
  function text(ctx, value, x, y, size = 14, color = ink, align = 'left') {
    value = String(value).replace(/x\u0304/g, 'xbar').replace(/μ/g, 'mu').replace(/σ/g, 'sigma')
      .replace(/β/g, 'beta').replace(/ρ/g, 'rho').replace(/≠/g, '!=');
    const width = Math.max(1, String(value).length * 6 - 1) * Math.max(1, Math.round(size / 7));
    const available = align === 'center' ? 680 : Math.max(100, WORLD.width - x - 20);
    const fit = Math.min(1, available / width);
    ctx.save(); ctx.translate(x, y); ctx.scale(fit, 1);
    pixelText(ctx, value, 0, 0, size, color, align);
    ctx.restore();
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
    const layer = keyboardLayer(calculator.save());
    const showingBoxplot = step >= level.route.length;
    if (performance.now() - inkAt > 1000) {
      ink = win.getComputedStyle(container).color || '#30263b';
      inkAt = performance.now();
    }
    ctx.save(); ctx.scale(scale(), scale()); ctx.translate(-Math.round(cameraX), 0);
    ctx.imageSmoothingEnabled = false;
    // CanvasEngine clears each frame; transparency reveals the actual calendar DOM.
    art.block(ctx, { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 });
    text(ctx, 'CALCULATOR TOGETHER', 85, 365, 21);
    text(ctx, 'PUSH THE TEAM BLOCK RIGHT >', 85, 410, 19);
    text(ctx, 'CLICK A KEY TO CHOOSE IT', 85, 451, 14);
    text(ctx, 'PRACTICE THE SKILLS YOU HAVE LEARNED', 85, 485, 14);
    text(ctx, 'RANDOM SKILLS. ONE TEAM GOAL.', 85, 513, 14);
    text(ctx, 'ARROWS MOVE . UP ENTERS DOORS', 85, 545, 14);
    text(ctx, 'HOLD SHIFT TO RUN', 85, 573, 14);
    text(ctx, 'THE PUSHERS BECOME YOUR TEAM', 85, 604, 14);
    const atlas = board.atlas?.();
    if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, 30, WORLD.floor - 40, 40, 40);
    else { ctx.fillStyle = '#493d48'; ctx.fillRect(30, WORLD.floor - 40, 40, 40); }
    text(ctx, 'PICO PARK', 24, WORLD.floor - 70, 14);
    text(ctx, 'UP TO ENTER', 24, WORLD.floor - 49, 10);
    const blockX = lobby?.blockX ?? TEAM_BLOCK.start;
    const block = ATLAS.pushBox;
    if (atlas && block) ctx.drawImage(atlas, block.x, block.y, block.w, block.h, blockX, TEAM_BLOCK.y, TEAM_BLOCK.w, TEAM_BLOCK.h);
    else art.block(ctx, { x: blockX, y: TEAM_BLOCK.y, w: TEAM_BLOCK.w, h: TEAM_BLOCK.h });
    const count = lobby?.phase === 'gathering' ? lobby.pushers.length : lobby?.roster.length || 0;
    text(ctx, String(count), blockX + 16, TEAM_BLOCK.y + 21, 14, ink, 'center');
    text(ctx, count + (count === 1 ? ' PUSHER' : ' PUSHERS'), blockX + 16, TEAM_BLOCK.y - 9, 10, ink, 'center');
    text(ctx, 'TEAM START', TEAM_BLOCK.dock + 16, WORLD.floor + 32, 10, ink, 'center');
    if (!participating) for (const [name, peer] of lobbyPeers) {
      peer.render(ctx); text(ctx, name.slice(0, 12), peer.x + 10, peer.y - 8, 10, ink, 'center');
    }
    ctx.save(); ctx.translate(ENTRY_WIDTH, 0);
    text(ctx, 'CALCULATOR TOGETHER', 28, 30, 20);
    const hasMission = !!state || !!lobby?.missionId;
    text(ctx, hasMission ? level.title.toUpperCase() : 'RANDOM SKILL ROUND', 28, 53, 14);
    const caption = hasMission ? inputCaption() : lobby?.eligibleCount === 0
      ? 'No calculator skills are scheduled yet for this class.' : 'Connecting to your class curriculum...';
    text(ctx, caption.slice(0, 106), 28, 76, 10);
    if (caption.length > 106) text(ctx, caption.slice(106), 28, 89, 10);
    // No bezel or LCD background: live menu text is part of the scenery.
    if (showingBoxplot) text(ctx, 'CALCULATOR RESULT', 28, 103, 10);
    for (const [i, line] of display.getLines().slice(0, 8).entries()) {
      const label = (line.selected ? '> ' : '  ') + line.text;
      text(ctx, label, 28, (showingBoxplot ? 123 : 106) + i * 18, label.length > 25 ? 7 : 14, ink);
    }
    text(ctx, state?.complete ? 'MISSION COMPLETE!' : 'ONE TEAM · ONE GOAL', 350, 112, 17);
    const elapsed = state ? clock() - state.startedAt : 0;
    const remain = Math.max(0, Math.ceil((timeLimitFor(state || { step: 0 }) - elapsed) / 1000));
    text(ctx, state?.failure ? 'TIME UP! TEAM RESTART.'
      : state ? (state.solved ? 'Your result is ready.'
        : remain + (showingBoxplot ? 's · finish the whole answer' : 's · reach the next step'))
        : lobby?.eligibleCount === 0 ? 'NO SKILLS TAUGHT YET'
        : lobby?.phase === 'assembling' ? 'TEAM FORMING · NO TIMER'
        : lobby?.phase === 'active' ? 'TEAM ROUND IN PROGRESS' : 'PUSH THE BLOCK HERE TO START', 350, 143, 12);
    text(ctx, state?.failure ? (showingBoxplot ? 'Return to the checkpoint.' : 'Restart the calculator.') : state?.complete ? 'Walk to the door. Press UP.' : state?.solved ? 'Help your teammates finish.'
      : showingBoxplot ? 'Click a value for the result.' : 'Click to press your own keys.', 350, 175, 12);
    text(ctx, state ? state.readyCount + '/' + state.teamSize + ' matching results ready' : 'Everyone solves independently.', 350, 197, 12);
    text(ctx, state?.solved ? 'All values matched.'
      : showingBoxplot ? 'Checked after the whole answer.'
      : layer === 'second' ? '2ND ACTIVE - CHOOSE A FUNCTION'
      : layer === 'alpha' ? 'ALPHA ACTIVE - CHOOSE A LETTER' : 'Equivalent keys count.', 350, 219, 12);
    const hold = state?.holdAt == null ? 0 : Math.min(1, (clock() - state.holdAt) / HOLD_MS);
    if (!state?.solved && state?.holdAt != null) {
      ctx.fillStyle = '#d5c5ae'; ctx.fillRect(350, 234, 315, 12);
      ctx.fillStyle = '#479b67'; ctx.fillRect(350, 234, 315 * hold, 12);
    }
    if (state?.holdAt != null) text(ctx, 'HOLD TO PRESS', 350, 269, 10);
    else if (!state?.failure && showingBoxplot && state?.lastPlot?.correct === false && !state.boxValues.length) {
      text(ctx, 'RESULT DID NOT MATCH. TRY AGAIN.', 350, 269, 10);
    }
    else if (!state?.failure && state?.lastPress && !state.lastPress.advanced) {
      text(ctx, state.lastPress.key + ' PRESSED · KEEP TRYING', 350, 269, 10);
    }
    ctx.save();
    if (showingBoxplot) ctx.globalAlpha *= 0.22;
    for (const ledge of approachSteps(showingBoxplot)) keyPlatform(ctx, ledge, '#494458');
    ctx.restore();
    for (const tile of tilesFor(step, level)) {
      const hint = state?.hintKeys?.includes(tile.key);
      ctx.save();
      if (showingBoxplot) ctx.globalAlpha *= 0.22;
      keyPlatform(ctx, tile, selected === tile.key ? '#f9c45f' : hint ? '#9bdfae' : '#494458');
      ctx.restore();
      ctx.save();
      if (state?.solved) ctx.globalAlpha *= 0.22;
      const label = showingBoxplot ? tile.key : keyLabel(tile.key, layer);
      const color = showingBoxplot ? ink : selected === tile.key || hint ? '#30263b'
        : layer === 'second' || tile.key === '2ND' ? '#a9daff'
        : layer === 'alpha' || tile.key === 'ALPHA' ? '#b7edab' : '#fff';
      // Use whole pixel sizes: no horizontally squeezed letters or crowded sublabels.
      const size = label.length * 12 - 2 <= tile.w - 8 ? 14 : 7;
      pixelText(ctx, label, tile.x + tile.w / 2, tile.y + (size === 7 ? 16 : 20), size, color, 'center');
      ctx.restore();
    }
    if (step >= level.route.length) drawBoxplot(ctx, step - level.route.length);
    else if (state) text(ctx, keyInstruction(level.route[step], level.hints[step] || '', layer, level.route[step + 1]).slice(0, 52), 350, 252, 10);
    if (showingBoxplot) {
      const flag = ATLAS.checkpoint;
      if (atlas) ctx.drawImage(atlas, flag.x, flag.y, flag.w, flag.h, 40, WORLD.floor - flag.h, flag.w, flag.h);
      text(ctx, 'CHECKPOINT', 32, WORLD.floor - 42, 10);
    }
    if (state?.complete) {
      const { x, y, w, h } = RESET_DOOR;
      if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, x, y, w, h);
      else { ctx.fillStyle = '#493d48'; ctx.fillRect(x, y, w, h); }
      text(ctx, 'NEXT SKILL', x + w / 2, y - 24, 10, ink, 'center');
      text(ctx, 'UP TO ENTER', x + w / 2, y - 9, 7, ink, 'center');
    }
    if (participating) for (const [name, peer] of peers) { drawCharacter(ctx, peer, name); text(ctx, name.slice(0, 12) + ' ' + (state.members.find(member => member.name === name)?.step || 0) + '/' + (level.route.length + challenge.answers.length), peer.x + 10, peer.y - 8, 10, ink, 'center'); }
    if (participating && !connected()) text(ctx, 'CONNECTING TO YOUR TEAM...', 360, 280, 14, ink, 'center');
    ctx.restore();
    drawCharacter(ctx, player, board.username);
    text(ctx, 'YOU', player.x + 10, player.y - 8, 10, ink, 'center');
    ctx.restore();
  }
  function drawCharacter(ctx, character, name) {
    if (state?.failure?.name !== name) { character.render(ctx); return; }
    const elapsed = Math.max(0, clock() - state.failure.at) / 1000;
    // Atlas cell 1 is Pico's dead cat (its crop starts two pixels lower).
    art.cat(ctx, rgbHex(catBodyForHue(character.hue)), 1, character.facingRight !== false,
      character.x, character.y + 110 * elapsed * elapsed);
  }
  function drawBoxplot(ctx, filled) {
    const rejected = state.lastPlot?.correct === false && !state.boxValues.length
      && clock() - state.lastPlot.at < 650;
    drawChallenge(ctx, { level, challenge, rejected, solved: state.solved, text, ink,
      values: rejected ? state.lastPlot.values : state.boxValues });
  }
  function inputCaption() {
    if (level.setup.lists.L1) return 'L1={' + level.setup.lists.L1.join(',') + '}' + (level.setup.lists.L2 ? '  L2 ready' : '');
    return Object.entries(level.values).map(([key, value]) => key + '=' + JSON.stringify(value)).join('  ');
  }
  function pointer(event) {
    if (state?.solved) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const rect = engine.canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left) / scale() + Math.round(cameraX);
    const x = worldX - ENTRY_WIDTH, y = (event.clientY - rect.top) / scale();
    const tile = tilesFor(state?.step || 0, level).find(tile => x >= tile.x && x <= tile.x + tile.w && y >= tile.y - 12 && y <= tile.y + tile.h);
    if (tile) { event.preventDefault(); event.stopImmediatePropagation(); choose(tile); }
  }
  function key(event) {
    if (event.key === 'Shift') {
      if (event.type === 'keyup') input.run = false;
      else if (!event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) input.run = true;
      return;
    }
    if (event.type === 'keyup') return;
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
    doc.removeEventListener('keydown', key); doc.removeEventListener('keyup', key);
    input.run = false;
    doc.removeEventListener('visibilitychange', visibility);
    controls.remove(); readings.remove(); container.removeAttribute('data-calculator-active');
    container.removeAttribute('data-calculator-participating');
    if (engine.sceneEntities === entities) engine.sceneEntities = null;
    Object.assign(api._camera, savedCamera); onClose();
  }
  entities.set('calculator-room', { update, render: draw });
  entities.set('dissolve', createSceneDissolve(board.transitionFrame));
  engine.sceneEntities = entities;
  engine.canvas.addEventListener('click', pointer, true); doc.addEventListener('keydown', key);
  doc.addEventListener('keyup', key);
  doc.addEventListener('visibilitychange', visibility);
  const timer = setInterval(pump, 100); pump();
  return { kind: 'calculator', dispose, startMission, returnToStart, getState: () => state,
    getView: () => ({ cameraX, playerX: player.x, playerY: player.y, participating, entranceX: ENTRY_WIDTH, lobby, missionId: level.id, challenge,
      resetDoor: state?.complete ? { ...RESET_DOOR } : null, lines: display.getLines() }),
    getCalculatorScreen: () => calculator.getScreen(),
    getKeyboard: () => {
      const layer = keyboardLayer(calculator.save());
      return { layer, labels: Object.fromEntries(mission.KEYS.map(tile => [tile.key, keyLabel(tile.key, layer)])) };
    } };
}
