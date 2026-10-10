// Level 6 (PICO PARK 1-1 at half scale) inside the board scene. board-scene.mjs keeps the
// shared lifecycle (fixed step, camera, exits, peers' entities); this module owns the level's
// terrain, mechanisms, relay intents, art and sound. All relay traffic uses toPose(); the
// relay's published trigger boxes, never the legacy x+20 checks.
// Same build as whoever imported this module: the board imports panel.mjs?v=<APP_BUILD> and every
// park module passes its own query on, so a deploy never mixes old and new modules (HTTP/CDN cache).
const V = new URL(import.meta.url).search;
const R = await import('./pico-rules.mjs' + V);
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { createPicoAudio, placeSound } = await import('./pico-audio.mjs' + V);
const { WALK_CELLS, WALK_TICKS, IDLE_CELL, JUMP_CELL, PLAYER_COLOURS } = await import('./assets/pico-atlas.mjs' + V);

const CAT_H = 24, BODY_H = 23, HEAD = 1;   // board sprite 24 tall; pico hitbox 23 tall from y + 1
const HOLD_RENEW_MS = 2000, RETRY_MS = 1500, REMOTE_DELAY_MS = 500;   // remote-motion.mjs DELAY_MS
// No local input for this long: stop renewing lift leases, so an absent student neither holds the
// lift down nor keeps the relay's idle rule from removing them (it renews on the next input).
export const LEASE_IDLE_MS = 120000;
// A hidden tab this long leaves the park (same path as Escape), so its student leaves the party.
export const HIDDEN_LEAVE_MS = 15000;

export function createPicoScene({ board, replica, member, player, peers, status, connected, ensurePeer, dropPeer, onExit = () => {} }) {
  const doc = board.engine?.canvas?.ownerDocument || globalThis.document;
  const win = doc?.defaultView || globalThis.window;
  const art = createPicoArt(doc); art.load(typeof board.atlas === 'function' ? board.atlas() : null);
  const audio = createPicoAudio(win, { classMode: () => !!(board.classroom?.isLive?.() && !board.classroom?.soundAllowed?.()) });
  // A tab hidden for HIDDEN_LEAVE_MS leaves the park (rAF, and so the fixed step, stops while hidden).
  let hiddenTimer = null;
  const timers = win && typeof win.setTimeout === 'function' ? win : globalThis;
  function onVisibility() {
    if (hiddenTimer != null) { timers.clearTimeout(hiddenTimer); hiddenTimer = null; }
    if (doc?.hidden) hiddenTimer = timers.setTimeout(() => { hiddenTimer = null; if (doc.hidden) onExit(); }, HIDDEN_LEAVE_MS);
  }
  try { doc?.addEventListener?.('visibilitychange', onVisibility); } catch {}
  let level = null, lift = null, terrain = [], active = [], relayLift = null, liftLocal = null, liftPrev = null;
  let bridgeL = null, prevBlocks = null, prevBridgeL = null, key = null, walkTick = 0, lastRest = null;
  let seen = null, switchPressedLocally = false, statusStyled = false;
  const sentAt = new Map(), holdSent = new Map(), riderLevels = new Map();
  let lastInputAt = null, hiddenSince = null, background = null, backgroundAt = -Infinity;
  // The page colour around the board (see R.pageBackground); re-read once a second so a page
  // whose colours change while the level is open follows along.
  function pageColour() {
    const at = now();
    if (background && at - backgroundAt < 1000) return background;
    backgroundAt = at;
    const canvas = board.engine?.canvas, getStyle = win && typeof win.getComputedStyle === 'function' ? el => win.getComputedStyle(el) : null;
    background = getStyle ? R.pageBackground(canvas?.parentElement || null, getStyle, doc?.body || null) : '#ffffff';
    return background;
  }
  const now = () => replica.now();
  const state = () => replica.state;
  const progress = () => replica.state.progress;
  const grounded = () => player._airFrames === 0;
  const pose = () => R.toPose(player);

  function throttle(id, ms = RETRY_MS) {
    if (now() - (sentAt.get(id) ?? -Infinity) < ms) return false;
    sentAt.set(id, now()); return true;
  }
  // Leased pressure (hold) with the replica: renew every 2 s while active, release once.
  function pressure(id, on) {
    const held = (progress().holds[id] || []).includes(member), at = now();
    if (!on) {
      if (!holdSent.has(id) && !held) return;
      if (replica.queue('hold', id, pose(), { active: false }).status === 'queued') holdSent.delete(id);
      return;
    }
    // Renew a held lease every 2 s; a refused (or not yet confirmed) one waits RETRY_MS (>= 500 ms).
    if (held && at - (holdSent.get(id) ?? -Infinity) < HOLD_RENEW_MS) return;
    if (!held && at - (holdSent.get(id) ?? -Infinity) < RETRY_MS) return;
    if (replica.queue('hold', id, pose(), { active: true }).status === 'queued') holdSent.set(id, at);
  }

  function snapshot() {
    const p = progress();
    return { keyHolder: p.keyHolder, doorOpen: p.doorOpen, latched: p.latches?.bridge != null, complete: !!p.complete };
  }

  // A new level identity (first join, retry, a reset room): place the cat. Socket resumes keep
  // the local pose because board-scene only calls this when epoch/level id changes.
  function enter(nextLevel) {
    level = nextLevel; lift = R.partyLift(level);
    const s = state(), p = s.progress;
    const index = R.memberIndex(s, member);
    const target = p.arrived.includes(member) ? { ...level.goal, vx: 0, vy: 0 } : R.reentryPose(level, s.poses[member], index);
    Object.assign(player, R.fromPose(target), { vx: 0, vy: 0, _vyF: 0, _vyOut: 0, _airFrames: 99, _boostK: -1,
      state: 'idle', standingOn: null, _hidden: false, facingRight: true });
    key = R.keyHome(level); liftPrev = null; prevBlocks = null; prevBridgeL = null; lastRest = null;
    holdSent.clear(); sentAt.clear(); riderLevels.clear(); switchPressedLocally = false; walkTick = 0;
    lastInputAt = now(); hiddenSince = null;
    seen = snapshot();
    if (!statusStyled && status?.style) {
      // Keep the status off the floor row: a short line at the top of the 240 px board.
      Object.assign(status.style, { top: '2px', bottom: 'auto', fontSize: '11px', textAlign: 'center' });
      statusStyled = true;
    }
  }

  function placePeers() {
    const s = state(), p = s.progress, present = s.online || [];
    for (const name of Object.keys(peers)) if (!present.includes(name)) dropPeer(name);
    const riders = (lift && p.holds[lift.id]) || [];
    for (const name of present) {
      if (name === member) continue;
      const anchor = replica.remoteMotion.sample(name);
      if (!anchor) continue;
      const peer = ensurePeer(name, anchor), at = R.fromPose(anchor);
      peer._pose = anchor;
      peer.x = at.x; peer.y = at.y; peer.vx = anchor.vx; peer.vy = anchor.vy;
      if (anchor.vx > 1) peer.facingRight = true; else if (anchor.vx < -1) peer.facingRight = false;
      const arrived = p.arrived.includes(name);
      peer.state = arrived ? 'in-doorway' : 'idle'; peer._hidden = arrived;
      // Presentation only: a relay-registered lift rider is drawn (and stood on) on the lift, not
      // 500 ms behind it inside the platform. Its stack level is latched once, from where it stood
      // (its interpolated pose against the lift as it was then, or its last relay pose), and kept
      // for the whole ride; a lagging 2 Hz sample can no longer drop it off the stack.
      if (lift && riders.includes(name) && relayLift != null) {
        if (!riderLevels.has(name)) {
          let k = R.liftRiderLevel(level, lift, anchor, R.liftSurface(level, p, replica.clock() - REMOTE_DELAY_MS));
          const last = s.poses?.[name];
          if (k < 0 && last) k = R.liftRiderLevel(level, lift, last, relayLift);
          if (k >= 0) riderLevels.set(name, k);
        }
        if (riderLevels.has(name)) peer.y = R.riderSpriteY(relayLift, riderLevels.get(name));
      } else riderLevels.delete(name);
    }
  }

  const overlapsBody = (r, x = player.x, y = player.y) => x + 2 + 16 > r.x && x + 2 < r.x + r.w && y + CAT_H > r.y && y < r.y + r.h;
  function snapOnto(r) {
    if (!overlapsBody(r)) return;
    Object.assign(player, { y: r.y - CAT_H, vy: 0, _vyF: 0, _vyOut: 0, _boostK: -1 });
  }

  function prepare() {
    const s = state(), p = s.progress, clock = replica.clock();
    active = R.activePartyOf(s);
    relayLift = lift ? R.liftSurface(level, p, clock) : null;
    placePeers();
    if (lift) {
      // Stop the lift on the highest head beneath it (ours or a teammate's), never inside it.
      const ref = liftPrev ?? relayLift, heads = [];
      const ridingBefore = liftPrev != null && grounded() && !player.standingOn && Math.abs(player.y + CAT_H - liftPrev) < 0.1
        && player.x + 18 > lift.x && player.x + 2 < lift.x + lift.w;
      if (!ridingBefore && !player._hidden && R.spriteUnderLift(lift, player, ref)) heads.push(player.y + HEAD);
      for (const name of Object.keys(peers)) {
        const peer = peers[name];
        if (peer._hidden || (p.holds[lift.id] || []).includes(name)) continue;
        if (R.spriteUnderLift(lift, peer, ref)) heads.push(peer.y + HEAD);
      }
      liftLocal = R.liftStopAbove(lift, relayLift, heads);
      if (ridingBefore && liftLocal !== liftPrev) { player.y += liftLocal - liftPrev; player._carriedThisTick = true; }
      liftPrev = liftLocal;
      // Standing on a registered rider: follow the lift with them, directly.
      const carrier = player.standingOn, name = carrier && Object.keys(peers).find(n => peers[n] === carrier);
      if (name && riderLevels.has(name) && grounded()) player.y = carrier.y - BODY_H;
    }
    const solids = R.solidsFor(level, active.length);
    bridgeL = R.bridgeLeft(level, p, clock, active.length);
    const extension = R.bridgeExtension(level, bridgeL);
    // Geometry that appears around the cat (stairs for a smaller active party, the bridge
    // growing or the solo aid) lifts it onto its top; geometry that vanishes lets it fall.
    const blocks = solids.filter(item => item.party);
    if (prevBlocks) for (const block of blocks) if (!prevBlocks.includes(block)) snapOnto(block);
    if (extension && prevBridgeL != null && bridgeL < prevBridgeL) snapOnto({ ...extension, w: prevBridgeL - bridgeL });
    prevBlocks = blocks; prevBridgeL = bridgeL;
    terrain = [...solids];
    if (extension) terrain.push(extension);
    if (lift) terrain.push({ x: lift.x, y: liftLocal, w: lift.w, h: lift.h, kind: 'lift' });
  }

  // After the local PlayerSprite update: jump sound and walk animation.
  function afterUpdate() {
    if (player._boostK === 0 && player.state === 'jumping') audio.play('jump');
    walkTick = player.vx !== 0 && grounded() ? walkTick + 1 : 0;
  }

  // A teammate's key / door / switch sounds from where it happened, relative to our own cat
  // (panned, quieter with distance). The board is 240 px tall; ~400 px is "far away".
  const HEARING_SPAN = 400;
  const heard = at => placeSound(at, pose(), HEARING_SPAN);

  function sounds() {
    const next = snapshot();
    if (!seen.keyHolder && next.keyHolder && !next.doorOpen) audio.play('key', heard(key));
    if (!seen.doorOpen && next.doorOpen) audio.play('key', heard(level?.goal));
    if (!seen.latched && next.latched && !switchPressedLocally) audio.play('switch', heard(level?.switches?.[0]));
    if (!seen.complete && next.complete) audio.clear();
    seen = next;
  }

  function stepKey() {
    const p = progress();
    if (p.doorOpen) return;
    if (!p.keyHolder) { key = R.keyHome(level); return; }   // returns to its spot (holder left or idle)
    const holder = p.keyHolder === member ? { pose: pose(), facing: player.facingRight }
      : peers[p.keyHolder] ? { pose: R.toPose(peers[p.keyHolder]), facing: peers[p.keyHolder].facingRight !== false } : null;
    if (!holder) return;
    key = R.stepKey(key, R.keyTarget(level, holder.pose, holder.facing));
  }

  function setStatus(text) { if (connected() && status.textContent !== text) status.textContent = text; }

  // One fixed step after the player moved. Returns nothing; board-scene sends no legacy intents.
  function interact() {
    const s = state(), p = s.progress, input = board.input || {};
    if (input.left || input.right || input.jump || input.up) lastInputAt = now();
    sounds();
    stepKey();
    if (p.arrived.includes(member)) {
      player._hidden = true;
      for (const id of holdSent.keys()) holdSent.delete(id);
      setStatus(p.complete ? 'Together! Up returns to the calendar.' : 'In the door. Up returns to the calendar.');
      return;
    }
    // Falling: a catch zone (both pits) puts the cat back above the near side, stacked over
    // teammates still dropping in, with no speed. Fires before the pose is sent.
    let here = pose();
    const zone = R.catchZoneHit(level, here)
      || (here.y + 23 > level.height ? { to: R.reentryPose(level, here, R.memberIndex(s, member)) } : null);
    if (zone) {
      const above = R.partyOf(s).filter(name => name !== member && peers[name] && R.toPose(peers[name]).y < 0).length;
      const to = zone.x != null ? R.catchRespawn(level, zone, above) : zone.to;
      Object.assign(player, R.fromPose(to), { vx: 0, vy: 0, _vyF: 0, _vyOut: 0, _boostK: -1, _airFrames: 99, standingOn: null, state: 'jumping' });
      here = pose();
    }
    replica.motion(here);
    if (!s.running) { setStatus('Waiting for the park to start...'); return; }
    // Liftwork. Riders: on the lift itself, or on a teammate stacked over its span.
    const surface = relayLift;
    let riding = false, under = false;
    if (lift) {
      const k = R.liftRiderLevel(level, lift, here, surface);
      const onLiftItself = grounded() && !player.standingOn && Math.abs(player.y + CAT_H - liftLocal) < 0.6
        && player.x + 18 > lift.x && player.x + 2 < lift.x + lift.w;
      const others = (p.holds[lift.id] || []).filter(name => name !== member).length;
      riding = onLiftItself ? k === 0 : grounded() && !!player.standingOn && k >= 1 && others >= k;
      const st = p.lifts[lift.id];
      const descending = st && (st.to > st.from + 0.01 && replica.clock() < st.at + st.duration || st.blocked);
      under = !riding && !!descending && R.underLift(level, lift, here, surface) && R.spriteUnderLift(lift, player, liftLocal);
      // Leases need someone at the keyboard: after LEASE_IDLE_MS without input release them once
      // and send nothing more until the next real input.
      const away = now() - (lastInputAt ?? now()) >= LEASE_IDLE_MS;
      pressure(lift.id, riding && !away);
      pressure(lift.blockId, under && !away);
    }
    // Resting anchor (relay `settle`), only when still and not on the moving lift.
    if (!riding && grounded() && player.vx === 0 && player.vy === 0) {
      const rest = here.x.toFixed(1) + ',' + here.y.toFixed(1);
      if (rest !== lastRest && replica.queue('settle', 'rest', here).status === 'queued') lastRest = rest;
    } else lastRest = null;
    // Switch: one-shot latch when the body enters the published trigger box.
    if (p.latches?.bridge == null && R.onSwitch(level, here) && throttle('switch', 2000)) {
      if (replica.queue('switch', level.switches[0].id, here).status === 'queued' && !switchPressedLocally) {
        switchPressedLocally = true; audio.play('switch');
      }
    }
    if (!p.keyHolder && !p.doorOpen && R.atKey(level, here) && throttle('key')) replica.queue('key', 'key', here);
    if (p.keyHolder === member && !p.doorOpen && R.keyUnlocks(level, key) && R.withinReach(level, here, level.goal) && throttle('unlock')) {
      replica.queue('unlock', 'door', here);
    }
    const body = R.bodyOf(level, here), onLedge = body.cx >= level.goal.enter.cxMin - 40 && Math.abs(body.feet - (level.goal.y + 23)) < 1;
    setStatus(replica.outbox.length > 2 ? 'Saving your progress...'
      : stairTeam(here) ? 'Stand at the edge. A friend jumps from your head.'
      : onLedge && p.doorOpen ? 'Press Up to go in.'
      : onLedge && !p.doorOpen ? (p.keyHolder ? 'Bring the key to the door.' : 'The door needs the key.')
      : here.x < 260 && p.latches?.bridge == null ? 'Jump together! Space jumps, Up at a door.'
      : '');
  }

  // The wide pit's crossing: a still carrier at the far edge of the top stair, a rider who jumps
  // from its head. Taught while a cat stands on the top stair with a teammate near and the bridge
  // is not yet out.
  function stairTeam(here) {
    if (!grounded() || bridgeL == null || bridgeL < level.gates.find(g => g.extend)?.extend.from) return false;
    const stairs = terrain.filter(t => t.kind === 'block');
    if (!stairs.length) return false;
    const topStair = stairs.reduce((a, b) => (b.y < a.y ? b : a));
    const body = R.bodyOf(level, here);
    const onTop = Math.abs(body.feet - topStair.y) < 0.5 || player.standingOn;
    const overStair = body.cx > topStair.x && body.cx < topStair.x + topStair.w;
    if (!onTop || !overStair) return false;
    return R.partyOf(state()).some(name => name !== member && peers[name] && !peers[name]._hidden
      && Math.abs(peers[name].x - player.x) < 40 && Math.abs(peers[name].y - player.y) < 30);
  }

  // Up (fresh press, from PlayerSprite's edge trigger): enter the open goal door.
  function act() {
    const s = state();
    if (!level || !s?.running || s.progress.arrived.includes(member)) return;
    if (grounded() && R.canEnterDoor(level, s.progress, pose(), true)) replica.queue('arrive', 'door', pose());
  }

  // ---- Drawing ----
  function offset() {
    const cam = board.api._camera || {}, vw = cam.vw || board.viewportW(), lw = cam.levelW || vw;
    const raw = lw < vw ? (vw - lw) / 2 : lw > vw ? -(cam.x || 0) : 0;
    const dpr = win?.devicePixelRatio || 1;
    return Math.round(raw * dpr) / dpr;
  }
  const snap = v => { const dpr = win?.devicePixelRatio || 1; return Math.round(v * dpr) / dpr; };
  function world(ctx, draw) {
    ctx.save(); ctx.translate(offset(), 0); ctx.imageSmoothingEnabled = false;
    try { draw(); } finally { ctx.restore(); }
  }
  function scenery(ctx) {
    if (!level) return;
    const p = progress(), vw = board.api._camera?.vw || board.viewportW();
    ctx.save(); ctx.filter = 'none'; ctx.fillStyle = pageColour(); ctx.fillRect(0, 0, Math.max(vw, level.width), level.height); ctx.restore();
    world(ctx, () => {
      const room = board.roomPresentation;
      if (room) {
        const bottom = room.height - room.floor + level.exit.y + 23;
        for (const tile of level.platforms) if (tile.y + tile.h >= level.height) {
          art.block(ctx, { ...tile, h: bottom - tile.y });
        }
      }
      art.tiles(ctx, level);
      for (const item of terrain) if (item.party) art.block(ctx, item);
      const resting = level.platforms.find(item => item.kind === 'bridge');
      if (resting) art.bridge(ctx, Math.min(bridgeL ?? resting.x, resting.x), resting.x + resting.w, resting.y);
      const pad = level.switches[0];
      if (pad) art.switchPad(ctx, pad.trigger.cx, pad.trigger.feetMax, p.latches?.bridge != null || switchPressedLocally);
      const exitFeet = level.exit.y + 23, exitCx = room ? room.doorX + room.doorSize / 2 : Math.max(level.exit.x + 8, 40);
      ctx.save();
      ctx.translate(exitCx, exitFeet);
      const doorScale = room ? room.doorSize / 32 : 1;
      ctx.scale(doorScale, doorScale);
      art.door(ctx, 0, 0, true);
      ctx.restore();
      ctx.fillStyle = '#c2643a'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Calculator', exitCx, exitFeet - (room?.doorSize || 32) - 8);
      art.door(ctx, level.goal.x + 8, level.goal.y + 23, p.doorOpen);
      if (lift) art.lift(ctx, lift, liftLocal ?? lift.rest, R.liftCountdown(lift, active.length, (p.holds[lift.id] || []).length));
      if (!p.doorOpen && !p.keyHolder) art.key(ctx, key.x, key.y);
    });
  }
  function cellFor(sprite, local) {
    if (local) {
      if (!grounded()) return JUMP_CELL;
      return sprite.vx !== 0 ? WALK_CELLS[Math.floor(walkTick / WALK_TICKS) % WALK_CELLS.length] : IDLE_CELL;
    }
    if (Math.abs(sprite.vy || 0) > 1) return JUMP_CELL;
    return Math.abs(sprite.vx || 0) > 1 ? WALK_CELLS[Math.floor(now() / (WALK_TICKS * 1000 / 60)) % WALK_CELLS.length] : IDLE_CELL;
  }
  // Each student's own calendar colour (sprite.hue); the 8-colour table only if it is unknown.
  const colourOf = (sprite, name) => R.catColour(sprite, state(), name, PLAYER_COLOURS);
  function drawCat(ctx, sprite, name) {
    if (!level || sprite._hidden) return;
    const local = sprite === player;
    world(ctx, () => art.cat(ctx, colourOf(sprite, name), cellFor(sprite, local), sprite.facingRight !== false, snap(sprite.x), snap(sprite.y)));
  }
  // Above the cats: the carried key, a marker over your own cat, and markers for teammates
  // outside the view.
  function overlay(ctx) {
    if (!level) return;
    const p = progress();
    if (!p.doorOpen && p.keyHolder) world(ctx, () => art.key(ctx, key.x, key.y));
    if (!player._hidden) {
      const m = R.ownMarker(player, p.keyHolder === member && !p.doorOpen ? key : null);
      world(ctx, () => {
        ctx.save();
        ctx.fillStyle = colourOf(player, member); ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(snap(m.x) - 4, snap(m.y) - 5); ctx.lineTo(snap(m.x) + 4, snap(m.y) - 5); ctx.lineTo(snap(m.x), snap(m.y)); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      });
    }
    const off = offset(), vw = board.api._camera?.vw || board.viewportW();
    for (const name of R.partyOf(state())) {
      const peer = peers[name];
      if (name === member || !peer || peer._hidden) continue;
      const sx = peer.x + off;
      if (sx + 20 >= 0 && sx <= vw) continue;
      const right = sx > vw, y = Math.min(level.height - 8, Math.max(8, peer.y + 12)), x = right ? vw - 3 : 3;
      ctx.save();
      ctx.fillStyle = colourOf(peer, name); ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + (right ? -9 : 9), y - 6); ctx.lineTo(x + (right ? -9 : 9), y + 6); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  return {
    enter, prepare, afterUpdate, interact, act, scenery, drawCat, overlay,
    get terrain() { return terrain; },
    get lift() { return lift ? { x: lift.x, y: liftLocal, w: lift.w, h: lift.h, relay: relayLift } : null; },
    get key() { return key; },
    get bridgeLeft() { return bridgeL; },
    get activeParty() { return active; },
    get background() { return pageColour(); },
    art, audio,
    dispose() {
      audio.dispose();
      if (hiddenTimer != null) timers.clearTimeout(hiddenTimer);
      try { doc?.removeEventListener?.('visibilitychange', onVisibility); } catch {}
    },
  };
}
