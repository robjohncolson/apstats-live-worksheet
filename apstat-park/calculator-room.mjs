const V = new URL(import.meta.url).search;
const mission = await import('./calculator-mission.mjs' + V);
const { HOLD_MS, timeLimitFor, WORLD, tilesFor, tileAt, missionFor } = mission;
const { goalFor } = await import('./calculator-goals.mjs' + V);
const { DEFAULT_LEVEL, levelById, challengeFor, initializeCalculator } = await import('./calculator-curriculum.mjs' + V);
const { drawChallenge } = await import('./calculator-challenge-view.mjs' + V);
const { nativeScriptFilenames } = await import('../ti84-trainer-v2/native/manifest.mjs' + V);
const { pixelText } = await import('./pixel-text.mjs' + V);
const { keyboardLayer, keyLabel, keySublabels, keyInstruction } = await import('./calculator-key-labels.mjs' + V);
const { createWorldDisplay } = await import('./calculator-display.mjs' + V);
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { createPicoAudio } = await import('./pico-audio.mjs' + V);
const { PICO } = await import('./physics.mjs' + V);
const { approachSteps, createCalculatorMotion } = await import('./calculator-motion.mjs' + V);
const { createSceneDissolve } = await import('./scene-transition.mjs' + V);
const { catBodyForHue, rgbHex } = await import('./pico-rules.mjs' + V);
const { ATLAS } = await import('./assets/pico-atlas.mjs' + V);
const { TEAM_BLOCK, CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs' + V);
const { createPeerMotion } = await import('./peer-motion.mjs' + V);
const { createUpdateGate } = await import('./update-gate.mjs' + V);
const { createPoseSmoothing } = await import('./pose-smoothing.mjs' + V);
// Solo room deep links (APSTAT_PARK_TRAINER_ABSORB_SPEC §3, protocol 12):
//   #room=calc-solo&skill=<skillId>   one catalogue skill, new data every round
//   #room=calc-solo&topic=<topic>     the topic's first skill in data/ti84-lesson-map.json
//   #room=calc-solo                   the section's rotation (Phase 3: the first due skill)
// Anything else is the team room. Exported pure, so the Desk and tests share the parse.
export function parseRoomLink(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (params.get('room') !== 'calc-solo') return { mode: 'team', skill: null, topic: null };
  return { mode: 'solo', skill: params.get('skill') || null, topic: params.get('topic') || null };
}
// The lesson map's first skill for a topic: `lessons` first, then the bonus-only topics (teacher
// decision 4, 2026-10-15: bonus skills are reachable by deep link only). null = unknown topic.
export function skillForTopic(lessonMap, topic) {
  if (!lessonMap || !topic) return null;
  const skills = lessonMap.lessons?.[topic] || lessonMap.bonus?.[topic] || [];
  return skills[0] || null;
}
const ENTRY_WIDTH = 720;
const LEVEL_WIDTH = ENTRY_WIDTH + WORLD.width;
const RESET_DOOR = { x: 650, y: WORLD.floor - 48, w: 48, h: 48 };
// Same calculator, with its menu payloads painted directly into the level.
for (const file of nativeScriptFilenames) await import('../ti84-trainer-v2/native/' + file + V);

// Navigator round (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §3). Every client works it out from the
// round's own packet, so nobody has to send it. The relay could reproduce it exactly:
//   hash = FNV-1a 32-bit over the epoch string's UTF-16 code units
//          (h = 2166136261; for each unit c: h = ((h XOR c) * 16777619) mod 2^32)
//   navigator round  <=>  roster has >= 2 names  and  hash % 3 === 0
//   step k (0-based) belongs to sorted(roster)[k % roster.length]  (default JS sort: code units)
export function epochHash(epoch) {
  const text = String(epoch);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}
// null, or { roster } with the roster sorted (the relay's order follows pushing, not names).
export function navigatorPlan(epoch, roster = []) {
  if (epoch == null || roster.length < 2) return null;
  if (epochHash(epoch) % 3 !== 0) return null;
  return { roster: [...roster].sort() };
}
export function navigatorOf(plan, step) {
  return plan.roster[step % plan.roster.length];
}
// 0-based route steps this name navigates.
export function navigatorSteps(plan, name, routeLength) {
  const steps = [];
  for (let step = 0; step < routeLength; step++) if (navigatorOf(plan, step) === name) steps.push(step);
  return steps;
}
const RUNG_TAGS = ['HINTS: FULL', 'HINTS: GOALS', 'NO HINTS'];
const RUNG_SPEECH = ['Hints: full.', 'Hints: goals only.', 'No hints: read the calculator screen.'];
const WRONG_RED = '#b4442c';

// link: the parsed deep link ({ mode, skill, topic }); defaults to the page's own hash.
// lessonMap: the lesson map (topic -> skill ids) or a promise of it; defaults to fetching
// data/ti84-lesson-map.json beside the park. Only read when the link names a topic.
// reload: what the student's click or Enter does once the relay has said this page is too old.
export function mountParkPanel({ container, getSocket, board, onClose, onPark = () => {}, link = null, lessonMap = null, reload = null }) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const { engine, input, api } = board;
  link ||= parseRoomLink(win.location?.hash);
  reload ||= () => win.location.reload();
  // §3: 'solo' hides everything team-specific (the block, the roster, the navigator round, "ask
  // your team") behind one switch. One keypad renderer, one status column.
  const solo = link.mode === 'solo';
  let soloSkill = solo ? link.skill : null;
  // A topic link resolves through the lesson map before the first join; nothing joins until then.
  let soloReady = !solo || !link.topic || !!soloSkill;
  if (solo && !soloReady) {
    const map = lessonMap ? Promise.resolve(lessonMap)
      : win.fetch(new URL('../data/ti84-lesson-map.json', import.meta.url) + V).then(response => response.json());
    map.then(data => { soloSkill = skillForTopic(data, link.topic); }).catch(() => {}).finally(() => { soloReady = true; });
  }
  const art = createPicoArt(doc);
  const audio = createPicoAudio(win, { classMode: () => !!(board.classroom?.isLive?.() && !board.classroom?.soundAllowed?.()) });
  art.load(board.atlas?.());
  const savedCamera = { ...api._camera };
  const entities = new Map(), peers = new Map(), lobbyPeers = new Map();
  let lobby = null;
  const updates = createUpdateGate(), smoothing = createPoseSmoothing();
  let scenery = null, sceneryInk = null, sceneryAtlas = null, sceneryReady = false, sceneryUnlocked = false;
  let arrivalPending = true;
  // TRACE text comes from the trainer's own renderer: what the calculator shows is what the Park shows.
  // Teacher 2026-10-11: the CE-renderer screen (FEEL_SPEC §A) read worse than these lines; reverted.
  const display = createWorldDisplay({ traceLabel: win.TI84ScreenRenderer?.traceLabel });
  // level is missionFor(state) once a round is in: the catalogue level merged with the round's
  // random data (protocol 10, §2). Before that, the lobby's catalogue preview.
  let level = DEFAULT_LEVEL, challenge = challengeFor(level);
  // The round data the local calculator was loaded with (JSON of state.problem, 'null' = catalogue).
  let calculatorProblem = 'null';
  let calculator = freshCalculator(null);
  let computedSummary = null;
  // §1/§5: the step a wrong key dropped one rung ('epoch:step'), and the last wrong press to animate.
  let wrongStep = null, wrongPress = null, wrongAt = -Infinity;
  // The hint mode the screen reader last heard (rung or navigator round).
  let announcedMode = null;
  let state = null, socket = null, disposed = false, epoch = null, applied = 0;
  let joinedAt = 0, poseAt = 0, receivedAt = 0, clockOffset = 0, needsRelease = false;
  const openedAt = performance.now();
  let selected = null, lastRevision = -1;
  // The click is the press (teacher 2026-10-11): the chosen cap sinks for ~120 ms with the click sound.
  let clicked = null, clickedAt = 0;
  // When this page first saw the relay's authoritative team completion (key celebration).
  let rewardShownAt = null;
  const keyQueue = [];
  let pendingPress = null, pressAt = 0;
  let participating = false, cameraX = 0;
  // Codex P2 (2026-10-15): the relay answered a join with its protocol error. Terminal for this
  // page: no more joins (a 50 ms retry loop before), one drawn line, click or Enter reloads.
  let reloadNeeded = false;
  const peerMotion = createPeerMotion({ name: board.username,
    enabled: new URL(win.location.href).searchParams.get('parkRtc') !== '0',
    PeerConnection: win.RTCPeerConnection,
    signal: message => send('calculator_rtc_signal', message) });
  let ink = '#30263b', inkAt = -Infinity;
  const controls = doc.createElement('div');
  controls.dataset.calculatorControls = '';
  const screenReaderOnly = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;pointer-events:none';
  controls.style.cssText = screenReaderOnly;
  const status = doc.createElement('span');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'flex:1 1 240px;font:14px system-ui';
  status.textContent = solo ? 'Starting your calculator round…' : 'Connecting the calculator team…';
  // §3: the navigator steps and their goals, for screen readers, for the whole round.
  const navigatorList = doc.createElement('ul');
  navigatorList.setAttribute('aria-label', 'Your navigator steps');
  let navigatorListKey = '';
  controls.append(status, navigatorList); container.append(controls);
  const readings = doc.createElement('output');
  readings.setAttribute('aria-label', 'Calculator result');
  readings.style.cssText = screenReaderOnly;
  container.append(readings);
  container.setAttribute('data-calculator-active', '');

  const terrain = () => [
    { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 },
    ...(!solo && lobby?.phase === 'gathering' && player.vy >= 0 && player.y + 24 <= TEAM_BLOCK.y + 1
      ? [{ x: lobby.blockX, y: TEAM_BLOCK.y, w: TEAM_BLOCK.w, h: TEAM_BLOCK.h }] : []),
    // Key platforms are one-way: jump through from below, land from above.
    // A dense physical keypad must not trap cats underneath a row of keys.
    // Answer tiles stay climbable too (two floor ledges, then rows <= 34px apart), so a
    // team can stand on a choice; clicking or a number key works just as well.
    ...[...approachSteps(answering()), ...tilesFor(state?.step || 0, level)]
      .filter(tile => player.vy >= 0 && player.y + 24 <= tile.y + 1)
      .map(tile => ({ ...tile, x: tile.x + ENTRY_WIDTH, h: 8 })),
  ];
  const player = board.createPlayer({ x: 65, y: WORLD.floor - 24, input,
    terrain, peers: () => ({}), canvasW: () => LEVEL_WIDTH,
    onUpPressed: () => {
      if (player.x < 95 && campaignUnlocked()) onPark();
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
  function answering(step = state?.step || 0) { return step >= level.route.length; }
  // A new local calculator loaded with the current level's lists (a varied round's own data).
  // problem: the round's state.problem (null = the catalogue's data). Callers reset `applied`.
  function freshCalculator(problem) {
    const next = win.TI84Native.create(null, { renderer: display });
    initializeCalculator(next, level);
    calculatorProblem = JSON.stringify(problem ?? null);
    return next;
  }
  // §3: this round's navigator plan from the round packet (null outside a navigator round).
  function navigator() {
    if (!state) return null;
    return navigatorPlan(state.epoch, (state.members || []).map(member => member.name));
  }
  // §1: the hint rung for the current step. The relay's rung (older relay: none, so 0), one lower
  // after a wrong key on this step, and full while the relay's time-up help (hintKeys) is showing.
  function hintRung() {
    if (!state || state.hintKeys?.length) return 0;
    const rung = [0, 1, 2].includes(state.rung) ? state.rung : 0;
    if (wrongStep === state.epoch + ':' + state.step) return Math.max(0, rung - 1);
    return rung;
  }
  // The hint line for a route step ('' = no line). Rung 0: the key; rung 1: the goal; rung 2: nothing.
  // A navigator round ignores rungs: your own steps show their goal, the rest say ASK YOUR TEAM.
  // A varied randint round rewrites its goals (the seed, upper and n differ); the catalogue's otherwise.
  function goalAt(step) { return level.goals?.[step] || goalFor(level.id, step); }
  function hintFor(step, layer) {
    const full = keyInstruction(level.route[step], level.hints[step] || '', layer, level.route[step + 1]);
    const goal = goalAt(step) || full;
    if (state?.hintKeys?.length) return full;
    const plan = navigator();
    if (plan) return navigatorOf(plan, step) === board.username ? goal : 'ASK YOUR TEAM';
    const rung = hintRung();
    if (rung === 0) return full;
    if (rung === 1) return goal;
    return '';
  }
  // My navigator steps as 1-based numbers, with their goal phrases (consecutive equal phrases merged).
  function navigatorCard(plan) {
    const steps = navigatorSteps(plan, board.username, level.route.length);
    const groups = [];
    for (const step of steps) {
      const goal = goalAt(step) || level.hints[step] || '';
      const last = groups.at(-1);
      if (last && last.goal === goal) last.steps.push(step + 1);
      else groups.push({ steps: [step + 1], goal });
    }
    return { steps: steps.map(step => step + 1), groups };
  }
  // The lowest route step a teammate is still on (0-based): what the team needs from me now.
  // No teammate left on the route: my own step (or the route's end, which needs nothing).
  function teamStep() {
    const onRoute = step => Number.isInteger(step) && step < level.route.length;
    const steps = (state?.members || []).filter(member => member.name !== board.username).map(member => member.step).filter(onRoute);
    if (steps.length) return Math.min(...steps);
    return onRoute(state?.step) ? state.step : level.route.length;
  }
  // The part of my navigator list that fits, starting at the first group the team still needs.
  // compact (answer/solved phases): one row per group at y 254 and 282 in the status column (the hint
  // line is not drawn then; the challenge title starts at y 296). Otherwise the strip right of the
  // keypad: x 592, a blue STEP line plus the goal wrapped at 18 characters, from y 316 to 672.
  // lines: [{ text, y, blue }]; '...' rows mark hidden groups above or below.
  function navigatorWindow(card, compact) {
    const from = teamStep();
    const start = card.groups.findIndex(group => group.steps.at(-1) - 1 >= from);
    const shown = { from: from + 1, hiddenBefore: start > 0, hiddenAfter: false, groups: [], lines: [] };
    if (start < 0) return shown;
    const rest = card.groups.slice(start);
    const label = group => (group.steps.length > 1 ? 'STEPS ' : 'STEP ') + group.steps.join(', ');
    if (compact) {
      for (const [i, y] of [254, 282].entries()) {
        const group = rest[i];
        if (!group) break;
        const lead = i === 0 && shown.hiddenBefore ? '... ' : '';
        shown.groups.push(group);
        shown.lines.push({ text: lead + label(group) + ': ' + group.goal, y, blue: false });
      }
      shown.hiddenAfter = rest.length > shown.groups.length;
      if (shown.hiddenAfter) shown.lines.at(-1).text += ' ...';
      return shown;
    }
    let y = 316;
    if (shown.hiddenBefore) { shown.lines.push({ text: '...', y, blue: false }); y += 11; }
    for (const group of rest) {
      const rows = [label(group), ...wrapWords(group.goal, 18)];
      if (y + (rows.length - 1) * 11 > 672) { shown.hiddenAfter = true; break; }
      shown.groups.push(group);
      for (const [i, row] of rows.entries()) shown.lines.push({ text: row, y: y + i * 11, blue: i === 0 });
      y += rows.length * 11 + 5;
    }
    if (shown.hiddenAfter && y <= 672) shown.lines.push({ text: '...', y, blue: false });
    return shown;
  }
  // Keeps the offscreen list of my navigator steps current (rebuilt only when it changes).
  function updateNavigatorList() {
    const plan = navigator();
    const items = plan ? navigatorCard(plan).groups.map(group =>
      (group.steps.length > 1 ? 'Steps ' : 'Step ') + group.steps.join(', ') + ': ' + group.goal) : [];
    const key = JSON.stringify(items);
    if (key === navigatorListKey) return;
    navigatorListKey = key;
    navigatorList.replaceChildren(...items.map(item => {
      const li = doc.createElement('li');
      li.textContent = item;
      return li;
    }));
  }
  // "STEPS 2, 5, 8" capped to fit one row (52 small characters).
  function stepList(steps) {
    let list = '';
    for (const step of steps) {
      const next = list ? list + ', ' + step : String(step);
      if (next.length > 40) return list + ' ...';
      list = next;
    }
    return list;
  }
  // What the screen reader says about hints, once per change.
  function hintMode() {
    const plan = navigator();
    if (plan) {
      const steps = navigatorSteps(plan, board.username, level.route.length).map(step => step + 1);
      return 'Navigator round: talk. ' + (steps.length ? 'You are the navigator for steps ' + steps.join(', ') + '.'
        : 'You have no steps: ask your team.');
    }
    return RUNG_SPEECH[hintRung()];
  }
  function wrongKeyText(press) {
    return press.penaltyMs > 0 ? 'WRONG KEY · -' + press.penaltyMs / 1000 + 'S · CLEAR BACKS OUT' : 'WRONG KEY · CLEAR BACKS OUT';
  }
  function campaignUnlocked() {
    // Teacher 2026-10-07: keys are a spendable count and no longer gate the door (1-1 is always
    // startable; keys open later stages). A relay that sends campaignOpen has that rule.
    if (Array.isArray(lobby?.campaignOpen)) return true;
    // Older relay: one rule for everyone, the teacher included: you hold your own key.
    return (lobby?.campaignKeyHolders || []).includes(board.username);
  }
  // Teacher 2026-10-07: every cat in the park wears its unspent key count, in gold, above its name.
  const KEY_GOLD = '#C9A227';
  function keyCount(name) {
    const count = lobby?.campaignKeys?.[name];
    return Number.isInteger(count) && count > 0 ? count : 0;
  }
  function drawKeyCount(ctx, name, x, y) {
    const count = keyCount(name);
    if (count) text(ctx, String(count), x, y, 14, KEY_GOLD, 'center');
  }
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
    arrivalPending = true;
    Object.assign(player, { x: 65, y: WORLD.floor - 24, vx: 0, vy: 0, state: 'idle' });
    for (const key in input) input[key] = false;
  }
  function startMission() {
    player.x = ENTRY_WIDTH + 65;
    cameraX = Math.max(0, Math.min(ENTRY_WIDTH, LEVEL_WIDTH - board.viewportW() / scale()));
    pump();
  }
  function connected() { return socket?.readyState === 1 && performance.now() - receivedAt < 3000; }
  // Protocol 13: a solo page the relay answered with 'waiting' (no playable skill; the join retries quietly).
  function soloWaiting() { return solo && !state && lobby?.phase === 'waiting'; }
  function besideResetDoor() {
    return Math.abs(localPose().x + 10 - (RESET_DOOR.x + RESET_DOOR.w / 2)) < 34
      && player.y + 24 >= RESET_DOOR.y;
  }
  function enterResetDoor() {
    if (!participating || !state?.complete || !connected()) return;
    send('calculator_restart');
  }
  function send(type, extra = {}) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 4096) return false;
    socket.send(JSON.stringify({ type, epoch: state?.epoch, revision: state?.revision, ...extra }));
    return true;
  }
  function choose(tile) {
    if (!participating || !state || state.solved || state.failure || !connected()) return;
    for (const key in input) input[key] = false;
    if (state.step < level.route.length) {
      Object.assign(player, { x: ENTRY_WIDTH + tile.x + tile.w / 2 - 10, y: tile.y - 24, vx: 0, vy: 0, standingOn: null });
    }
    needsRelease = true; selected = tile.key; poseAt = 0;
    clicked = tile.key; clickedAt = performance.now(); audio.play('key');
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
  // Forgets the round: a team reset back to gathering, or a solo 'waiting' answer.
  function clearRound() {
    state = null; peers.clear(); epoch = null; applied = 0; lastRevision = -1; computedSummary = null;
    wrongStep = null; wrongPress = null; announcedMode = null; rewardShownAt = null;
    keyQueue.length = 0; pendingPress = null;
    // Back to the catalogue level: the last round's random data must not leak into the next preview.
    level = levelById(level.id) || DEFAULT_LEVEL; challenge = challengeFor(level);
    calculator = freshCalculator(null);
    readings.textContent = ''; updateNavigatorList();
  }
  function onMessage(event) {
    let packet;
    try { packet = JSON.parse(event.data); } catch { return; }
    if (packet.type === 'calculator_rtc_signal') { peerMotion.receive(packet); return; }
    if (packet.type === 'calculator_lobby_state') {
      if (packet.protocol !== CALCULATOR_PROTOCOL) return;
      // Protocol 13: 'waiting' (solo, no playable skill) is a terminal reset of the round: the relay
      // kept nothing, so neither does this page; the student stays on the keypad and the join is
      // retried quietly (pump) until the section has a skill.
      if (packet.phase === 'waiting') {
        lobby = packet;
        if (state) clearRound();
        status.textContent = 'No calculator skills are scheduled yet for this class.';
        return;
      }
      const reset = lobby && lobby.epoch !== packet.epoch && packet.phase === 'gathering';
      lobby = packet;
      peerMotion.sync(packet.epoch, packet.rtcPeers);
      if (arrivalPending) {
        arrivalPending = false;
        // Shared-room arrivals used to occupy exactly the same pixel. Give
        // idle newcomers a separate spot; never snap someone already moving.
        if (Math.abs(player.x - 65) < 1 && !input.left && !input.right) {
          const rank = Math.max(0, packet.members.findIndex(member => member.name === board.username));
          const slots = Array.from({ length: 12 }, (_, i) => 65 + ((rank + i) % 12) * 26);
          player.x = slots.find(x => !packet.members.some(member => member.name !== board.username
            && Math.abs(member.pose.x - x) < 24 && Math.abs(member.pose.y - player.y) < 24)) ?? slots[0];
        }
      }
      for (const member of packet.members) {
        if (member.name === board.username) continue;
        if (!lobbyPeers.has(member.name)) lobbyPeers.set(member.name, board.createPeer(member.name, member.pose));
        Object.assign(lobbyPeers.get(member.name), member.pose);
      }
      for (const name of lobbyPeers.keys()) if (!packet.members.some(member => member.name === name)) lobbyPeers.delete(name);
      if (reset) { clearRound(); returnToStart(); }
      const preview = levelById(packet.missionId);
      if (!state && preview && preview.id !== level.id) {
        level = preview; challenge = challengeFor(level);
        calculator = freshCalculator(null); applied = 0;
      }
      // Teacher decision 2026-10-06: the teacher plays as a peer: participate only from the roster (no spectate branch).
      if (packet.phase === 'active' && packet.roster.includes(board.username) && player.x >= ENTRY_WIDTH + 20) {
        setParticipating(true);
      }
      return;
    }
    if (!participating) return;
    if (packet.type === 'calculator_error') {
      status.textContent = packet.message;
      // The protocol error ('Reload the page ...'): stop joining; the drawn line says what to do.
      if (/reload/i.test(packet.message)) { reloadNeeded = true; keyQueue.length = 0; pendingPress = null; return; }
      // Any other refusal: the next join waits the usual 1.5 s instead of going out at once.
      joinedAt = performance.now(); receivedAt = 0; return;
    }
    if (packet.type !== 'calculator_state') return;
    if (packet.protocol !== CALCULATOR_PROTOCOL) { status.textContent = 'Waiting for the team-block server update.'; return; }
    if (state?.epoch === packet.epoch && packet.revision < state.revision) return;
    if (!levelById(packet.missionId)) { status.textContent = 'Reload to load this calculator skill.'; return; }
    // §2: the round's own data (state.problem) replaces the catalogue's for this round.
    level = missionFor(packet); challenge = challengeFor(level);
    const problemChanged = JSON.stringify(packet.problem ?? null) !== calculatorProblem;
    // §5: a fresh wrong press shakes its cap and floats the time it cost; it drops this step one rung.
    if (packet.lastPress?.wrong) {
      if (state?.epoch === packet.epoch && packet.revision > state.revision) { wrongPress = packet.lastPress; wrongAt = performance.now(); }
      wrongStep = packet.epoch + ':' + packet.step;
    }
    if (packet.complete && !state?.complete) { audio.clear(); rewardShownAt = performance.now(); }
    else if (state?.epoch === packet.epoch && packet.revision > state.revision) {
      if (packet.solved && !state.solved) audio.play('switch');
      else if ((packet.keys?.length || 0) > (state.keys?.length || 0)) audio.play('switch');
    }
    const restarted = state?.complete && epoch !== packet.epoch;
    // Solo: the door's next round starts where the student stands; the team walks back to the block.
    const soloRestarted = restarted && solo;
    const teamReset = state && epoch !== packet.epoch && packet.resetReason?.type === 'timeout';
    if (packet.failure && !state?.failure) {
      keyQueue.length = 0; pendingPress = null;
      for (const key in input) input[key] = false;
    }
    const timedOut = state && packet.timeoutCount !== state.timeoutCount && epoch === packet.epoch;
    receivedAt = performance.now(); clockOffset = packet.clock - receivedAt;
    if (epoch !== packet.epoch || timedOut || problemChanged) {
      keyQueue.length = 0; pendingPress = null;
      calculator = freshCalculator(packet.problem); applied = 0; epoch = packet.epoch;
      computedSummary = null;
    }
    // Replay committed input once, including when joining halfway through or reconnecting.
    const keys = packet.keys || level.route.slice(0, Math.min(packet.step, level.route.length));
    while (applied < keys.length) calculator.pressKey(keys[applied++]);
    if (packet.step >= level.route.length) computedSummary = challenge.answers;
    if (timedOut || teamReset || soloRestarted) {
      Object.assign(player, { x: ENTRY_WIDTH + 65, y: WORLD.floor - 24, vx: 0, vy: 0, standingOn: null });
      for (const key in input) input[key] = false;
      if (soloRestarted) rewardShownAt = null;
    } else if (answering(packet.step) && !(state && answering(state.step) && state.epoch === packet.epoch)) {
      // The keypad just turned into answer choices: start on the floor so nobody
      // lands on a choice by accident (choices are climbed on purpose, from the ledges).
      Object.assign(player, { y: WORLD.floor - 24, vx: 0, vy: 0, standingOn: null });
    }
    if (lastRevision >= 0 && packet.revision !== lastRevision) {
      needsRelease = true; selected = null;
      // Standing on a repeated key needs a fresh choice; clicks are queued.
    }
    if (state && packet.boxAttempts !== state.boxAttempts) { keyQueue.length = 0; pendingPress = null; }
    lastRevision = packet.revision; state = packet; updateNavigatorList();
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
    const answerIndex = state.step - level.route.length;
    const hint = state.solved ? (solo ? 'Your result is ready.' : 'Your result is ready. Help your teammates finish.')
      : state.step < level.route.length ? hintFor(state.step, keyboardLayer(calculator.save()))
      : challenge.prompts ? challenge.prompts[answerIndex] + ' Click a choice, press its number key, or stand on it.'
      : 'Choose ' + challenge.labels[answerIndex] + '. Click its value.';
    const feedback = answerFeedback();
    // The hint mode is spoken once when it changes (a new rung, a wrong key, a navigator round).
    const mode = state.solved || answering() ? null : hintMode();
    const modeNote = mode && mode !== announcedMode ? mode + ' ' : '';
    if (mode) announcedMode = mode;
    const press = state.lastPress;
    const pressNote = !press || press.advanced ? ''
      : press.wrong ? ' Wrong key: ' + press.key + '.' + (press.penaltyMs > 0 ? ' ' + press.penaltyMs / 1000 + ' seconds off the clock.' : '')
        + ' CLEAR backs out.'
      : ' Pressed ' + press.key + '. The countdown keeps running. Reach the next checkpoint before time runs out.';
    const text = state.failure ? (state.step >= level.route.length
      ? 'Time is up. Returning to your result checkpoint with a fresh timer.'
      : 'Time is up. Restarting the calculator portion.')
      : state.complete ? (solo ? 'Cleared! ' + level.title + ' complete. Walk to the door for the next round.'
        : 'Together! ' + level.title + ' complete. +1 key for everyone on the team.')
      : state.solved ? hint + ' ' + state.readyCount + '/' + state.teamSize + ' ready.'
      : modeNote + 'Step ' + (state.step + 1) + '/' + (level.route.length + challenge.answers.length)
        + (solo ? ' · solo. ' : ' · ' + state.teamSize + ' on the team. ') + hint
        + pressNote
        + (state.hintKeys?.length ? ' Hint: choose ' + state.hintKeys.join(' or ') + '. Step reset—30 seconds to try again.' : '')
        + (feedback ? ' Not yet: ' + feedback : '');
    if (status.textContent !== text) status.textContent = text;
    if (restarted && !solo) returnToStart();
  }
  function bind() {
    const next = getSocket();
    if (next === socket) return;
    peerMotion.reset();
    updates.reset();
    socket?.removeEventListener('message', onMessage);
    socket = next; joinedAt = 0; receivedAt = 0;
    socket?.addEventListener('message', onMessage);
  }
  function pump() {
    if (disposed || doc.hidden) return;
    bind();
    if (reloadNeeded) return;
    peerMotion.publish({ x: player.x, y: player.y });
    const missionCamera = Math.max(0, Math.min(ENTRY_WIDTH, LEVEL_WIDTH - board.viewportW() / scale()));
    // Teacher decision 2026-10-06: the teacher can push the team block.
    const pushing = !!input.right && !input.left;
    // Solo never sends a lobby packet: on the relay a lobby packet means the team block.
    if (!solo) updates.publish('lobby', { protocol: CALCULATOR_PROTOCOL, epoch: lobby?.epoch, rtc: peerMotion.supported ? 2 : false,
      rtcGeneration: peerMotion.connectionGeneration(),
      pose: { x: player.x, y: player.y }, pushing,
      ready: player.x >= ENTRY_WIDTH + 20 && cameraX >= missionCamera - 0.5 },
    value => send('calculator_lobby', value), pushing);
    if (!participating || !soloReady) return;
    if (socket?.readyState !== 1) { status.textContent = 'Reconnecting—your team progress is saved.'; return; }
    // Protocol 12: the relay answers a solo join with phase 'waiting' while the section has no
    // playable skill (the join is retried below; nothing is kept for it on the relay).
    if (soloWaiting()) status.textContent = 'No calculator skills are scheduled yet for this class.';
    if (!joinedAt || performance.now() - receivedAt > 3000) {
      if (soloWaiting()) {
        // Said above; keep retrying the join quietly.
      } else if (!state && performance.now() - openedAt > 8000) {
        status.textContent = 'The calculator room is waiting for the classroom server update. You can return to the room and try again.';
      } else if (state) {
        status.textContent = 'Reconnecting—your team progress is saved.';
      }
      if (performance.now() - joinedAt > 1500 || !joinedAt) {
        send('calculator_join', { protocol: CALCULATOR_PROTOCOL, ...(solo ? { mode: 'solo', skill: soloSkill } : {}) });
        joinedAt = performance.now();
      }
    }
    if (!state || !connected() || doc.hidden) return;
    flushPress();
    if (performance.now() - poseAt >= 100) {
      if (updates.publish('pose', { epoch: state.epoch, revision: state.revision,
        pose: localPose(), ready: !needsRelease && !pendingPress && !keyQueue.length },
      value => send('calculator_pose', value))) poseAt = performance.now();
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
    // Solo: walking into the calculator zone is the whole start; no block to push.
    else if (solo && !participating && player.x >= ENTRY_WIDTH + 20) setParticipating(true);
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
  function capPath(ctx, x, y, w, h) {
    const cut = 4;
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut);
    ctx.closePath();
  }
  function keyPlatform(ctx, tile, colour) {
    ctx.fillStyle = colour;
    capPath(ctx, tile.x, tile.y, tile.w, tile.h); ctx.fill();
  }
  // Keycaps (CALCULATOR_FEEL_SPEC §B1/§B2): the CE's colour groups, a darker 2 px base so the cap
  // reads as raised, a 2 px ink outline. A clicked cap sinks 4 px onto its base; `tint` washes the
  // cap while 2nd (blue) or ALPHA (green) is active. Cosmetic only: tileAt() still uses tile.y.
  const CAP = { dark: '#494458', light: '#e9e1d2', second: '#6fa8dc', alpha: '#7bc47f' };
  const TOP_ROW = new Set(['Y=', 'WINDOW', 'ZOOM', 'TRACE', 'GRAPH']);
  const LIGHT_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '(−)', 'ENTER', '÷', '×', '−', '+', 'ON']);
  function capColour(tile, showingBoxplot) {
    if (showingBoxplot) return CAP.light;
    if (tile.key === '2ND') return CAP.second;
    if (tile.key === 'ALPHA') return CAP.alpha;
    if (TOP_ROW.has(tile.key)) return '#30263b';
    return LIGHT_KEYS.has(tile.key) ? CAP.light : CAP.dark;
  }
  function keycap(ctx, tile, colour, { pressed = false, tint = null } = {}) {
    const { x, y, w, h } = tile, sink = pressed ? 4 : 0;
    ctx.save();
    ctx.lineWidth = 2; ctx.strokeStyle = ink;
    if (!pressed) { ctx.fillStyle = darken(colour); capPath(ctx, x, y + 2, w, h); ctx.fill(); }
    ctx.fillStyle = colour; capPath(ctx, x, y + sink, w, h); ctx.fill();
    if (tint) { ctx.globalAlpha = 0.45; ctx.fillStyle = tint; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.stroke();
    ctx.restore();
    return sink;
  }
  function darken(hex) {
    const n = parseInt(hex.slice(1), 16);
    const channel = shift => Math.max(0, ((n >> shift) & 255) - 48);
    return rgbHex([channel(16), channel(8), channel(0)]);
  }
  function lightCap(colour) { return colour === CAP.light || colour === '#f9c45f' || colour === '#9bdfae'; }
  function drawScenery(ctx, atlas) {
    // 'count' (keys are a count, door open) / 'holder' (older relay, own key) / false: also the cache key.
    const unlocked = campaignUnlocked() && (Array.isArray(lobby?.campaignOpen) ? 'count' : 'holder');
    if (!scenery || sceneryInk !== ink || sceneryAtlas !== atlas || sceneryReady !== art.ready || sceneryUnlocked !== unlocked) {
      scenery ||= doc.createElement('canvas');
      scenery.width = LEVEL_WIDTH; scenery.height = WORLD.height;
      const paint = scenery.getContext('2d');
      paint.imageSmoothingEnabled = false;
      art.block(paint, { x: 0, y: WORLD.floor, w: LEVEL_WIDTH, h: 50 });
      text(paint, solo ? 'CALCULATOR SOLO' : 'CALCULATOR TOGETHER', 85, 365, 21);
      text(paint, solo ? 'WALK RIGHT TO YOUR CALCULATOR >' : 'PUSH THE TEAM BLOCK RIGHT >', 85, 410, 19);
      text(paint, 'CLICK A KEY TO CHOOSE IT', 85, 451, 14);
      text(paint, 'PRACTICE THE SKILLS YOU HAVE LEARNED', 85, 485, 14);
      text(paint, solo ? 'YOUR OWN ROUND. YOUR OWN CLOCK.' : 'RANDOM SKILLS. ONE TEAM GOAL.', 85, 513, 14);
      text(paint, 'ARROWS MOVE . UP ENTERS DOORS', 85, 545, 14);
      text(paint, 'HOLD SHIFT TO RUN', 85, 573, 14);
      text(paint, solo ? 'NEW DATA EVERY ROUND' : 'THE PUSHERS BECOME YOUR TEAM', 85, 604, 14);
      if (atlas) paint.drawImage(atlas, unlocked ? 96 : 48, 0, 48, 48, 30, WORLD.floor - 40, 40, 40);
      else { paint.fillStyle = '#493d48'; paint.fillRect(30, WORLD.floor - 40, 40, 40); }
      text(paint, 'PICO PARK', 24, WORLD.floor - 70, 14);
      text(paint, !unlocked ? 'FINISH A CALCULATOR ACTIVITY TO EARN A KEY'
        : unlocked === 'count' ? 'UP TO ENTER . KEYS OPEN NEW STAGES' : 'KEY EARNED - UP TO ENTER', 24, WORLD.floor - 49, 7);
      text(paint, solo ? 'YOUR CALCULATOR' : 'TEAM START', TEAM_BLOCK.dock + 16, WORLD.floor + 32, 10, ink, 'center');
      sceneryInk = ink; sceneryAtlas = atlas; sceneryReady = art.ready; sceneryUnlocked = unlocked;
    }
    ctx.drawImage(scenery, 0, 0);
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
    const atlas = board.atlas?.();
    drawScenery(ctx, atlas);
    smoothing.retain(new Set(participating ? peers.keys() : lobbyPeers.keys()));
    if (!solo) drawTeamBlock(ctx, atlas);
    // Teacher report 2026-10-06: room classmates stay visible while participating (team members are drawn below).
    for (const [name, peer] of lobbyPeers) if (!participating || !peers.has(name)) {
      const original = { x: peer.x, y: peer.y };
      const direct = peerMotion.position(name);
      const visual = smoothing.sample(name, direct || original, { epoch: lobby?.epoch, direct: !!direct });
      peer.x = visual.x; peer.y = visual.y;
      peer.render(ctx); text(ctx, name.slice(0, 12), peer.x + 10, peer.y - 8, 10, ink, 'center');
      drawKeyCount(ctx, name, peer.x + 10, peer.y - 20);
      Object.assign(peer, original);
    }
    ctx.save(); ctx.translate(ENTRY_WIDTH, 0);
    text(ctx, solo ? 'CALCULATOR SOLO' : 'CALCULATOR TOGETHER', 28, 30, 20);
    const hasMission = !!state || !!lobby?.missionId;
    text(ctx, hasMission ? level.title.toUpperCase() : 'RANDOM SKILL ROUND', 28, 53, 14);
    const caption = reloadNeeded ? 'This page is an older version. Click or press Enter to reload it.'
      : hasMission ? inputCaption() : lobby?.eligibleCount === 0
        ? 'No calculator skills are scheduled yet for this class.' : 'Connecting to your class curriculum...';
    text(ctx, caption.slice(0, 106), 28, 76, 10);
    if (caption.length > 106) text(ctx, caption.slice(106), 28, 89, 10);
    if (showingBoxplot) text(ctx, 'CALCULATOR RESULT', 28, 103, 10);
    // No bezel or LCD background: live menu text is part of the scenery.
    for (const [i, line] of display.getLines().slice(0, 8).entries()) {
      const label = (line.selected ? '> ' : '  ') + line.text;
      text(ctx, label, 28, (showingBoxplot ? 123 : 106) + i * 18, label.length > 25 ? 7 : 14, ink);
    }
    text(ctx, state?.complete ? 'MISSION COMPLETE!' : solo ? 'SOLO PRACTICE' : 'ONE TEAM · ONE GOAL', 350, 112, 17);
    if (state?.complete) drawKeyReward(ctx, atlas);
    const plan = navigator();
    const coaching = state && !state.solved && !state.failure && !showingBoxplot;
    // The navigator card stays until the whole team is done: teammates may still need my steps.
    if (plan && !state.complete && !state.failure) drawNavigatorCard(ctx, plan, !coaching);
    // §1 rung tag: small, right-aligned on the title row (the title ends near x 576).
    else if (coaching) text(ctx, RUNG_TAGS[hintRung()], 665, 112, 7, ink, 'right');
    const elapsed = state ? clock() - state.startedAt : 0;
    const remain = Math.max(0, Math.ceil((timeLimitFor(state || { step: 0 }) - elapsed) / 1000));
    text(ctx, state?.failure ? (solo ? 'TIME UP! RESTART.' : 'TIME UP! TEAM RESTART.')
      : state ? (state.solved ? 'Your result is ready.'
        : remain + (showingBoxplot ? 's · finish the whole answer' : 's · reach the next step'))
        : lobby?.eligibleCount === 0 ? 'NO SKILLS TAUGHT YET'
        : solo ? 'WALK IN TO START'
        : lobby?.phase === 'assembling' ? 'TEAM FORMING · NO TIMER'
        : lobby?.phase === 'active' ? 'TEAM ROUND IN PROGRESS' : 'PUSH THE BLOCK HERE TO START', 350, 143, 12);
    text(ctx, state?.failure ? (showingBoxplot ? 'Return to the checkpoint.' : 'Restart the calculator.') : state?.complete ? 'Walk to the door. Press UP.' : state?.solved ? 'Help your teammates finish.'
      : showingBoxplot ? 'Click a value for the result.' : 'Click to press your own keys.', 350, 175, 12);
    text(ctx, solo ? (state ? 'Clear it to open the next-round door.' : 'Your own round. Your own clock.')
      : state ? state.readyCount + '/' + state.teamSize + ' matching results ready' : 'Everyone solves independently.', 350, 197, 12);
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
    else if (!state?.failure && state?.lastPress?.wrong) {
      text(ctx, wrongKeyText(state.lastPress), 350, 269, 10, WRONG_RED);
    }
    else if (!state?.failure && state?.lastPress && !state.lastPress.advanced) {
      text(ctx, state.lastPress.key + ' PRESSED · KEEP TRYING', 350, 269, 10);
    }
    // Ledges and answer choices are solid platforms in both phases.
    for (const ledge of approachSteps(showingBoxplot)) keyPlatform(ctx, ledge, '#494458');
    const modifier = layer === 'second' ? '#a9daff' : layer === 'alpha' ? '#b7edab' : null;
    for (const [index, tile] of tilesFor(step, level).entries()) {
      const hint = state?.hintKeys?.includes(tile.key);
      const chosen = selected === tile.key;
      const pressed = clicked === tile.key && performance.now() - clickedAt < 120;
      const colour = chosen ? '#f9c45f' : hint ? '#9bdfae' : capColour(tile, showingBoxplot);
      // The modifier keys themselves keep their own colour; everything else tints with the layer.
      const tint = modifier && !chosen && !hint && tile.key !== '2ND' && tile.key !== 'ALPHA' ? modifier : null;
      // §5: a wrong key's cap shakes for 200 ms (±2 px). Cosmetic only: tileAt() is unchanged.
      const shake = wrongShake(tile, showingBoxplot);
      ctx.save(); ctx.translate(shake, 0);
      const sink = keycap(ctx, tile, colour, { pressed, tint });
      ctx.save();
      if (state?.solved) ctx.globalAlpha *= 0.22;
      const label = showingBoxplot ? plainText(tile.label ?? tile.key) : keyLabel(tile.key, layer);
      const color = lightCap(colour) || tint ? '#30263b' : '#fff';
      // Use whole pixel sizes: no horizontally squeezed letters or crowded sublabels.
      const size = label.length * 12 - 2 <= tile.w - 8 ? 14 : 7;
      pixelText(ctx, label, tile.x + tile.w / 2, tile.y + sink + (size === 7 ? 16 : 20), size, color, 'center');
      // The printed legends above the key: blue 2nd function left, green alpha letter right. The
      // active layer's legend brightens; the other fades.
      if (!showingBoxplot) {
        const legends = keySublabels(tile.key);
        const bright = (name, colour) => layer === 'normal' ? colour : layer === name ? ink : colour + '55';
        if (legends.second) pixelText(ctx, legends.second, tile.x + 1, tile.y - 1, 7, bright('second', '#5b8fd0'), 'left');
        if (legends.alpha) pixelText(ctx, legends.alpha, tile.x + tile.w - 1, tile.y - 1, 7, bright('alpha', '#4f9a5a'), 'right');
      }
      // The number key that chooses this answer.
      if (showingBoxplot && index < 9) pixelText(ctx, String(index + 1), tile.x + 7, tile.y + sink + 11, 7, '#b06a1a', 'left');
      ctx.restore();
      ctx.restore();
    }
    if (!showingBoxplot) drawPenaltyFloat(ctx);
    if (step >= level.route.length) drawBoxplot(ctx, step - level.route.length);
    else if (state) {
      // §1/§3: the hint line fades with the rung, or belongs to the step's navigator.
      const line = hintFor(step, layer);
      if (line) text(ctx, line.slice(0, 52), 350, 252, 10);
    }
    if (showingBoxplot) {
      const flag = ATLAS.checkpoint;
      if (atlas) ctx.drawImage(atlas, flag.x, flag.y, flag.w, flag.h, 40, WORLD.floor - flag.h, flag.w, flag.h);
      text(ctx, 'CHECKPOINT', 32, WORLD.floor - 42, 10);
    }
    if (state?.complete) {
      const { x, y, w, h } = RESET_DOOR;
      if (atlas) ctx.drawImage(atlas, 96, 0, 48, 48, x, y, w, h);
      else { ctx.fillStyle = '#493d48'; ctx.fillRect(x, y, w, h); }
      text(ctx, solo && state.pinnedSkill ? 'NEXT ROUND' : 'NEXT SKILL', x + w / 2, y - 24, 10, ink, 'center');
      text(ctx, 'UP TO ENTER', x + w / 2, y - 9, 7, ink, 'center');
    }
    if (participating) for (const [name, peer] of peers) {
      const original = { x: peer.x, y: peer.y };
      const direct = peerMotion.position(name);
      const live = direct && direct.x >= ENTRY_WIDTH && !state.failure;
      const worldPose = live ? direct : { x: peer.x + ENTRY_WIDTH, y: peer.y };
      const visual = smoothing.sample(name, worldPose, { epoch: state.epoch, direct: !!live, snap: !!state.failure });
      peer.x = visual.x - ENTRY_WIDTH; peer.y = visual.y;
      drawCharacter(ctx, peer, name);
      text(ctx, name.slice(0, 12) + ' ' + (state.members.find(member => member.name === name)?.step || 0)
        + '/' + (level.route.length + challenge.answers.length), peer.x + 10, peer.y - 8, 10, ink, 'center');
      drawKeyCount(ctx, name, peer.x + 10, peer.y - 20);
      Object.assign(peer, original);
    }
    if (reloadNeeded) text(ctx, 'NEW VERSION - RELOAD THE PAGE', 360, 280, 14, ink, 'center');
    // The waiting answer is authoritative and never refreshes receivedAt: no reconnect line over it.
    else if (participating && !connected() && !soloWaiting()) text(ctx, 'CONNECTING TO YOUR TEAM...', 360, 280, 14, ink, 'center');
    ctx.restore();
    drawCharacter(ctx, player, board.username);
    // An older relay has no counts: keep its key sprite for a holder.
    if (!lobby?.campaignKeys && campaignUnlocked() && atlas) {
      const key = ATLAS.key;
      ctx.drawImage(atlas, key.x, key.y, key.w, key.h, player.x + 19, player.y - 18, key.w, key.h);
    }
    text(ctx, 'YOU', player.x + 10, player.y - 8, 10, ink, 'center');
    drawKeyCount(ctx, board.username, player.x + 10, player.y - 20);
    ctx.restore();
  }
  // Teacher 2026-10-07 economy: a completed round pays +1 key to every roster member. Only the
  // relay decides completion (state.complete), so the celebration never runs on a local guess;
  // the gold counts above every cat come from the relay's own key counts.
  function drawKeyReward(ctx, atlas) {
    // ABSORB_SPEC §6 (Phase 4) pays the solo clear its key; until then the clear itself is the prize.
    if (solo) { text(ctx, 'SKILL CLEARED · NEXT ROUND AT THE DOOR', 350, 272, 12, KEY_GOLD); return; }
    const key = ATLAS.key;
    // Row 269 holds hold/retry messages, which never show once the team is complete.
    if (atlas && key) ctx.drawImage(atlas, key.x, key.y, key.w, key.h, 350, 258, key.w, key.h);
    text(ctx, '+1 KEY FOR EVERY TEAMMATE', 350 + (atlas && key ? key.w + 8 : 0), 272, 12, KEY_GOLD);
    const age = rewardShownAt == null ? Infinity : (performance.now() - rewardShownAt) / 1000;
    if (age < 3) text(ctx, '+1', player.x - ENTRY_WIDTH + 10, player.y - 36 - age * 12, 14, KEY_GOLD, 'center');
  }
  // The pushable team block with its live pusher count (team room only).
  function drawTeamBlock(ctx, atlas) {
    const blockX = lobby?.blockX ?? TEAM_BLOCK.start;
    const block = ATLAS.pushBox;
    if (atlas && block) ctx.drawImage(atlas, block.x, block.y, block.w, block.h, blockX, TEAM_BLOCK.y, TEAM_BLOCK.w, TEAM_BLOCK.h);
    else art.block(ctx, { x: blockX, y: TEAM_BLOCK.y, w: TEAM_BLOCK.w, h: TEAM_BLOCK.h });
    const count = lobby?.phase === 'gathering' ? lobby.pushers.length : lobby?.roster.length || 0;
    text(ctx, String(count), blockX + 16, TEAM_BLOCK.y + 21, 14, ink, 'center');
    text(ctx, count + (count === 1 ? ' PUSHER' : ' PUSHERS'), blockX + 16, TEAM_BLOCK.y - 9, 10, ink, 'center');
  }
  // §3 navigator card. Two small rows in the status column's free gaps (between the title at y 112
  // and the timer at 143, and between 143 and 175), then the window of my steps the team still
  // needs (navigatorWindow): the strip right of the keypad while I am on the route, two status rows
  // once I am answering or solved (my teammates may still be on my steps).
  function drawNavigatorCard(ctx, plan, compact) {
    const card = navigatorCard(plan);
    text(ctx, 'NAVIGATOR ROUND · TALK', 350, 124, 7);
    text(ctx, card.steps.length ? 'YOU ARE THE NAVIGATOR FOR STEPS ' + stepList(card.steps)
      : 'NO STEPS FOR YOU · ASK YOUR TEAM', 350, 156, 7);
    if (!card.steps.length) return;
    const x = compact ? 350 : 592;
    if (!compact) text(ctx, 'YOUR STEPS', x, 300, 7);
    for (const line of navigatorWindow(card, compact).lines) text(ctx, line.text, x, line.y, 7, line.blue ? '#5b8fd0' : ink);
  }
  // Greedy word wrap for the small lettering.
  function wrapWords(value, width) {
    const lines = [];
    for (const word of String(value).split(/\s+/).filter(Boolean)) {
      const last = lines.at(-1);
      if (last != null && (last + ' ' + word).length <= width) lines[lines.length - 1] = last + ' ' + word;
      else lines.push(word);
    }
    return lines;
  }
  // §5: ±2 px for 200 ms on the cap of a fresh wrong press.
  function wrongShake(tile, showingBoxplot) {
    if (showingBoxplot || wrongPress?.key !== tile.key) return 0;
    const age = performance.now() - wrongAt;
    if (age >= 200) return 0;
    return Math.floor(age / 25) % 2 ? 2 : -2;
  }
  // §5: a red "-2S" rises off the wrong cap for 600 ms when the relay took time.
  function drawPenaltyFloat(ctx) {
    if (!(wrongPress?.penaltyMs > 0)) return;
    const age = (performance.now() - wrongAt) / 600;
    if (age >= 1) return;
    const tile = mission.KEYS.find(tile => tile.key === wrongPress.key);
    if (!tile) return;
    ctx.save(); ctx.globalAlpha = 1 - age;
    text(ctx, '-' + wrongPress.penaltyMs / 1000 + 'S', tile.x + tile.w / 2, tile.y - 6 - age * 28, 14, WRONG_RED, 'center');
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
    drawChallenge(ctx, { level, challenge, rejected, solved: state.solved, feedback: answerFeedback(), text, ink,
      values: rejected ? state.lastPlot.values : state.boxValues });
  }
  // The relay's explanation of the last wrong answer, until the team starts a new attempt.
  function answerFeedback() {
    if (!state || state.failure || state.solved || state.boxValues?.length) return null;
    return state.lastPlot?.correct === false ? state.lastPlot.feedback || null : null;
  }
  // Pixel lettering has no sigma / x-bar / <= glyphs.
  function plainText(value) {
    return String(value).replace(/x̄/g, 'xbar').replace(/σ/g, 'sigma ').replace(/≤/g, '<=').replace(/≥/g, '>=');
  }
  function inputCaption() {
    // A frequency list is part of the data: show it, not just "ready".
    if (level.values?.freq) return 'L1={' + level.setup.lists.L1.join(',') + '}  L2={' + level.setup.lists.L2.join(',') + '} (frequencies)';
    if (level.setup.lists.L1) return 'L1={' + level.setup.lists.L1.join(',') + '}' + (level.setup.lists.L2 ? '  L2 ready' : '');
    return Object.entries(level.values).map(([key, value]) => key + '=' + JSON.stringify(value)).join('  ');
  }
  function pointer(event) {
    if (reloadNeeded) { event.preventDefault(); event.stopImmediatePropagation(); reload(); return; }
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
    if (event.key === 'Enter' && reloadNeeded && !event.repeat) { event.preventDefault(); reload(); return; }
    if (event.key === 'Escape') { event.preventDefault(); returnToStart(); }
    // Number keys choose answer tiles (keyboard equivalent of clicking or standing on one).
    if (/^[1-9]$/.test(event.key) && !event.repeat && participating && state && answering() && !state.solved
      && !event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
      const tile = tilesFor(state.step, level)[Number(event.key) - 1];
      if (tile) { event.preventDefault(); choose(tile); }
    }
    // Handle brief taps even when keydown and keyup fall between physics steps.
    if (event.key === 'ArrowUp' && !event.repeat && !event.target?.closest?.('input, textarea, select, [contenteditable="true"]')
      && state?.complete && besideResetDoor()) {
      event.preventDefault(); enterResetDoor();
    }
  }
  // getView()'s fluency fields (§1-§3, §5): what the hint line, tag and navigator card show.
  function coachingView() {
    const routeStep = state && !answering() ? state.step : null;
    const plan = navigator();
    const press = state?.lastPress;
    return {
      hint: routeStep == null ? null : hintFor(routeStep, keyboardLayer(calculator.save())),
      rung: hintRung(),
      hintTag: routeStep == null || plan ? null : RUNG_TAGS[hintRung()],
      navigator: plan ? navigatorView(plan, routeStep == null || state.solved) : null,
      wrongKey: press?.wrong ? wrongKeyText(press) : null,
      caption: state || lobby?.missionId ? inputCaption() : null,
      calculatorLists: calculator.save().lists,
    };
  }
  // The plan, my steps, and the window drawn now (null once the card is gone: complete or failed).
  function navigatorView(plan, compact) {
    const card = navigatorCard(plan);
    const drawn = !state.complete && !state.failure && card.steps.length;
    return { roster: plan.roster, ...card, window: drawn ? navigatorWindow(card, compact) : null };
  }
  function visibility() {
    if (!doc.hidden) { joinedAt = 0; return; }
    setParticipating(false); for (const key in input) input[key] = false;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; send('calculator_leave');
    peerMotion.dispose();
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
  const timer = setInterval(pump, peerMotion.supported ? 50 : 100);
  // A solo deep link is the intent to practise: open on the keypad and join at once.
  if (solo) { startMission(); setParticipating(true); }
  pump();
  // The board calls this on hashchange: true when the page's hash now asks for a different room
  // (team <-> solo, another skill, another topic). The board then leaves this panel and mounts
  // the requested one, which parses the new hash itself (a fragment-only navigation never reloads).
  function linkChanged(hash) {
    const next = parseRoomLink(hash);
    return next.mode !== link.mode || next.skill !== link.skill || next.topic !== link.topic;
  }
  return { kind: 'calculator', dispose, startMission, returnToStart, linkChanged, getState: () => state,
    getNetworkStats: () => peerMotion.stats(),
    getView: () => ({ mode: solo ? 'solo' : 'team', skill: soloSkill, link: { ...link }, keyReward: !!state?.complete, reloadNeeded, cameraX, playerX: player.x, playerY: player.y, participating, campaignUnlocked: campaignUnlocked(), entranceX: ENTRY_WIDTH, lobby, missionId: level.id, challenge,
      keyCounts: Object.fromEntries([board.username, ...lobbyPeers.keys(), ...peers.keys()].map(name => [name, keyCount(name)])),
      resetDoor: state?.complete ? { ...RESET_DOOR } : null, lines: display.getLines(), ...coachingView() }),
    getCalculatorScreen: () => calculator.getScreen(),
    getKeyboard: () => {
      const layer = keyboardLayer(calculator.save());
      return { layer, labels: Object.fromEntries(mission.KEYS.map(tile => [tile.key, keyLabel(tile.key, layer)])) };
    } };
}
