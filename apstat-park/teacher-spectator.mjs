const V = new URL(import.meta.url).search;
const { createCampaignReplay } = await import('./campaign-replay.mjs' + V);
const { createWorldDisplay } = await import('./calculator-display.mjs' + V);
const { initializeCalculator, challengeFor } = await import('./calculator-curriculum.mjs' + V);
const { drawChallenge } = await import('./calculator-challenge-view.mjs' + V);
const { tilesFor } = await import('./calculator-mission.mjs' + V);
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { catBodyForHue, rgbHex } = await import('./pico-rules.mjs' + V);
const { nativeScriptFilenames } = await import('../ti84-trainer-v2/native/manifest.mjs' + V);
for (const file of nativeScriptFilenames) await import('../ti84-trainer-v2/native/' + file + V);

// A separate connection has no player binding and never sends gameplay commands.
export function mountTeacherSpectator(container, { wsUrl, username, section = 'B' }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const root = doc.createElement('div'); root.dataset.teacherSpectator = '';
  const toolbar = doc.createElement('div');
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px';
  function selector(label) {
    const wrapper = doc.createElement('label'), select = doc.createElement('select');
    wrapper.textContent = label + ' '; wrapper.append(select); toolbar.append(wrapper); return select;
  }
  const classes = selector('Watch class'), scenes = selector('Activity'), focus = selector('Follow student');
  function options(select, rows) {
    const signature = JSON.stringify(rows);
    if (select.dataset.options === signature) return;
    const previous = select.value;
    select.replaceChildren(...rows.map(([value, label]) => {
      const option = doc.createElement('option'); option.value = value; option.textContent = label; return option;
    }));
    if (rows.some(([value]) => value === previous)) select.value = previous;
    select.dataset.options = signature;
  }
  const sections = ['PeriodB', 'PeriodE', 'PeriodX'];
  options(classes, sections.map(value => [value, value.replace('Period', 'Period ')]));
  let saved;
  try { saved = win.localStorage.getItem('apstats_park_watch_section'); } catch (_) {}
  classes.value = sections.includes(saved) ? saved : section.startsWith('Period') ? section : 'Period' + section;
  if (!classes.value) classes.value = 'PeriodB';
  options(scenes, [['auto', 'Active game'], ['classroom', 'Classroom'], ['calculator', 'Calculator']]);
  const status = doc.createElement('div'); status.setAttribute('role', 'status'); status.style.padding = '0 10px';
  const canvas = doc.createElement('canvas'); canvas.width = 720; canvas.height = 750;
  canvas.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:720/750';
  canvas.setAttribute('aria-label', 'Read-only live class game');
  root.append(toolbar, status, canvas); container.replaceChildren(root);
  const ctx = canvas.getContext('2d'), art = createPicoArt(doc); art.load();
  const display = createWorldDisplay();
  let socket, disposed = false, reconnect, poll, animation, packet = null, game = null, loadingGame = false;
  let campaign = null, calculator = null, calculatorKey = '', appliedKeys = [];
  let receivedAt = 0, pendingAt = 0, error = '', lastHeartbeat = 0;
  const replay = createCampaignReplay(inputs => game.step(inputs));
  const ink = () => win.getComputedStyle(container).color || '#43383e';
  function send(message) {
    if (socket?.readyState === 1 && socket.bufferedAmount < 8192) socket.send(JSON.stringify(message));
  }
  function request() {
    if (disposed || doc.hidden || socket?.readyState !== 1) return;
    if (pendingAt && performance.now() - pendingAt < 3000) return;
    if (performance.now() - lastHeartbeat > 10000) { send({ type: 'classroom_heartbeat' }); lastHeartbeat = performance.now(); }
    pendingAt = performance.now();
    send({ type: 'park_watch', team: scenes.value.startsWith('team:') ? scenes.value.slice(5) : campaign?.team,
      epoch: campaign?.epoch, from: replay.received });
  }
  function colour(name) {
    const member = packet?.students.find(member => member.username === name);
    return rgbHex(catBodyForHue(member?.hue ?? 180));
  }
  function acceptCampaign(state) {
    if (!game || !state) return;
    if (state.epoch !== campaign?.epoch) {
      game.load(state.stageIndex, Math.max(2, state.roster.length), state.seed);
      replay.reset(Math.max(2, state.roster.length));
    }
    campaign = state; replay.accept(state);
    if (state.more) request();
  }
  async function prepareGame() {
    if (game || loadingGame) return;
    loadingGame = true;
    try {
      const { createCampaignEngine } = await import('./campaign-engine.mjs' + V);
      const next = await createCampaignEngine();
      if (disposed) { next.dispose(); return; }
      game = next; acceptCampaign(packet?.campaign.state);
    } catch (failure) { error = 'Game view could not load: ' + failure.message; }
    finally { loadingGame = false; }
  }
  function connect() {
    if (disposed) return;
    packet = null; campaign = null; pendingAt = 0; calculatorKey = ''; replay.reset(0);
    status.textContent = 'Connecting to ' + classes.value.replace('Period', 'Period ') + '…';
    const current = new win.WebSocket(wsUrl); socket = current;
    current.onopen = () => {
      if (socket !== current || disposed) return;
      send({ type: 'classroom_join', section: classes.value, username, role: 'teacher' }); request();
    };
    current.onmessage = event => {
      if (socket !== current || disposed) return;
      let next; try { next = JSON.parse(event.data); } catch (_) { return; }
      if (next.type === 'park_error') { error = next.message; pendingAt = 0; return; }
      if (next.type !== 'park_watch_state' || next.section !== classes.value) return;
      packet = next; receivedAt = performance.now(); pendingAt = 0; error = '';
      options(scenes, [['auto', 'Active game'], ['classroom', 'Classroom'], ['calculator', 'Calculator'],
        ...next.campaign.teams.map((team, i) => ['team:' + team.id, 'Team ' + (i + 1) + ' · ' + team.roster.join(', ')])]);
      if (next.campaign.state) { acceptCampaign(next.campaign.state); prepareGame(); }
      else campaign = null;
    };
    current.onclose = () => {
      if (socket !== current || disposed) return;
      error = 'Reconnecting…'; clearTimeout(reconnect); reconnect = setTimeout(connect, 1500);
    };
    current.onerror = () => { if (socket === current) error = 'Connection interrupted'; };
  }
  classes.onchange = () => {
    try { win.localStorage.setItem('apstats_park_watch_section', classes.value); } catch (_) {}
    clearTimeout(reconnect); const old = socket; socket = null; old?.close(); connect();
  };
  scenes.onchange = () => { pendingAt = 0; request(); };
  function text(message, x, y, size = 12) { pixelText(ctx, message, x, y, size, ink()); }
  function drawCalculator(room) {
    const members = room.members;
    options(focus, members.map(member => [member.name, member.name]));
    const member = members.find(member => member.name === focus.value) || members[0];
    const state = member?.state, level = room.level;
    text(level?.title || level?.id || 'Calculator', 28, 42, 17);
    if (!state || !level) {
      text('GATHERING THE TEAM AT THE BLOCK', 28, 85);
      // The lobby spans two screens; fit the whole approach into this overview.
      ctx.save(); ctx.translate(0, 350); ctx.scale(.5, .5);
      art.block(ctx, { x: room.lobby.blockX || 400, y: 652, w: 48, h: 48 });
      for (const peer of room.lobby.members || []) {
        art.cat(ctx, colour(peer.name), 0, true, peer.pose.x, peer.pose.y);
        text(peer.name, peer.pose.x, peer.pose.y - 15, 14);
      }
      ctx.restore(); return;
    }
    const key = room.epoch + ':' + member.name;
    const keys = state.keys || [];
    if (key !== calculatorKey || appliedKeys.some((value, i) => keys[i] !== value)) {
      calculator = win.TI84Native.create(null, { renderer: display }); initializeCalculator(calculator, level);
      calculatorKey = key; appliedKeys = [];
    }
    for (let i = appliedKeys.length; i < keys.length; i++) calculator.pressKey(keys[i]);
    appliedKeys = keys.slice();
    const plotting = state.step >= level.route.length;
    const remaining = Math.max(0, Math.ceil(((plotting ? 30000 : 15000) - (room.clock - state.startedAt)) / 1000));
    text(member.name + ' · ' + (state.complete ? 'COMPLETE' : remaining + 's'), 28, 74);
    for (const [i, line] of display.getLines().slice(0, 8).entries()) text((line.selected ? '> ' : '') + line.text, 150, 105 + i * 20);
    if (plotting) drawChallenge(ctx, { level, challenge: challengeFor(level), values: state.boxValues,
      rejected: false, solved: state.complete, text: pixelText, ink: ink() });
    else for (const tile of tilesFor(state.step, level)) {
      art.block(ctx, tile); text(tile.key, tile.x + 5, tile.y + 9, 9);
    }
    for (const peer of members) {
      art.cat(ctx, colour(peer.name), 0, true, peer.pose.x, peer.pose.y);
      text(peer.name, peer.pose.x, peer.pose.y - 15, 9);
    }
  }
  function draw() {
    if (disposed) return;
    ctx.clearRect(0, 0, 720, 750); ctx.fillStyle = '#ff864d'; ctx.fillRect(0, 700, 720, 50);
    const choice = scenes.value;
    const showCampaign = choice.startsWith('team:') || (choice === 'auto' && packet?.campaign.state);
    const showCalculator = choice === 'calculator' || (choice === 'auto' && !showCampaign && packet?.calculator);
    if (showCampaign && campaign && game) {
      options(focus, campaign.roster.map(name => [name, name]));
      const deadline = performance.now() + 6;
      while (replay.frame < replay.received && performance.now() < deadline) replay.advance(1);
      game.setPresentation({ focusSlot: Math.max(0, campaign.roster.indexOf(focus.value)), colours: campaign.roster.map(colour) });
      game.render(); ctx.drawImage(game.canvas, 0, 0);
      text('PICO PARK ' + (Math.floor(campaign.stageIndex / 4) + 1) + '-' + (campaign.stageIndex % 4 + 1), 28, 35, 16);
      if (campaign.phase === 'clear') text('CLEAR!', 270, 220, 40);
      if (replay.received - replay.frame > 120) text('CATCHING UP…', 28, 64);
    } else if (showCalculator && packet?.calculator) drawCalculator(packet.calculator);
    else {
      options(focus, []);
      text(showCalculator ? 'NO ACTIVE CALCULATOR TEAM' : showCampaign ? 'LOADING GAME…' : 'CLASSROOM', 28, 40, 17);
      for (const [i, student] of (packet?.students || []).entries()) {
        const x = 30 + (i % 20) * 33, y = 676 - Math.floor(i / 20) * 52;
        art.cat(ctx, colour(student.username), 0, true, x, y); text(student.username, x, y - 12, 8);
      }
    }
    const count = packet?.students.length || 0;
    status.textContent = error || (!packet ? 'Connecting…' : performance.now() - receivedAt > 4000 ? 'Waiting for connection…'
      : 'Period ' + classes.value.replace('Period', '') + ' · ' + count + ' student' + (count === 1 ? '' : 's') + ' online · Watching only');
    animation = win.requestAnimationFrame(draw);
  }
  connect(); poll = setInterval(request, 200); animation = win.requestAnimationFrame(draw);
  return { destroy() {
    disposed = true; clearInterval(poll); clearTimeout(reconnect); win.cancelAnimationFrame(animation);
    socket?.close(); game?.dispose(); root.remove();
  } };
}
