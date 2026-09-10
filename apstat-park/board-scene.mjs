// A scene in the classroom's existing engine. No canvas, RAF, keyboard
// listener, player physics implementation, or network tick is created here.
export function mountBoardScene({ board, replica, member, onExit, onLobby, onSelect, lobby = false, completed = [], remember = () => {}, status, connected }) {
  const { engine, input, api } = board;
  const doors = [{ x: 240, y: 146, title: 'Hello together' }, { x: 460, y: 146, title: 'Switchback' }, { x: 680, y: 146, title: 'Lift relay' }];
  const lobbyDoor = { x: 145, y: 146 };
  let wasArrived = false;
  const entities = new Map(), peers = {};
  const oldCamera = { ...api._camera };
  let level = null, terrain = [], lift = null, disposed = false;
  let lastLevel = null, returnWalk = 0, lastRest = null;
  const keyImage = new Image(); keyImage.src = 'key.png';
  const buttonImage = new Image(); buttonImage.src = 'button.png';
  const pose = () => ({ x: player.x, y: player.y, vx: player.vx, vy: player.vy });
  const near = item => item && Math.hypot(player.x - item.x, player.y - item.y) < 22;
  const player = board.createPlayer({
    x: 90, y: 146, input, terrain: () => terrain, peers: () => peers,
    canvasW: () => level?.width || 960, onUpPressed: act
  });
  player.engine = engine;
  Object.assign(api._camera, {
    x: 0, enabled: true, followFn: () => player,
    levelWFn: () => Math.max(level?.width || 960, board.viewportW()),
    vwFn: board.viewportW, cameraStateFn: () => null
  });

  function act() {
    if (disposed) return;
    if (near(level?.exit || { x: 43, y: 146 })) { onExit(); return; }
    if (lobby) {
      const index = doors.findIndex(near);
      if (index >= 0) onSelect(index);
      return;
    }
    if (level && near(lobbyDoor)) { onLobby(); return; }
    if (!level || !near(level.goal)) return;
    const progress = replica.state.progress;
    if (progress.arrived.includes(member)) { onLobby(); return; }
    if (progress.doorOpen) replica.queue('arrive', 'door', pose());
    else if (progress.keyHolder === member) replica.queue('unlock', 'door', pose());
  }

  function liftY(at) {
    const phase = ((at % level.lift.cycleMs) + level.lift.cycleMs) % level.lift.cycleMs;
    const amount = phase < 2000 ? 0 : phase < 5000 ? (phase - 2000) / 3000
      : phase < 7000 ? 1 : 1 - (phase - 7000) / 3000;
    return level.lift.bottom + (level.lift.top - level.lift.bottom) * amount;
  }

  function prepare(dt) {
    const identity = replica.state && replica.state.epoch + '/' + replica.state.level.id;
    if (identity && lastLevel !== identity) {
      level = replica.state.level; lastLevel = identity;
      lastRest = null;
      wasArrived = false;
      for (const name of Object.keys(peers)) { entities.delete('peer:' + name); delete peers[name]; }
      lift = { x: level.lift.x, y: liftY(replica.clock()), w: level.lift.w, h: level.lift.h };
      const saved = replica.state.poses[member];
      const spawn = saved && saved.y < level.height ? saved
        : replica.state.progress.bridgeOpen ? level.checkpoint : level.spawn;
      Object.assign(player, spawn, { vx: 0, vy: 0, state: 'idle', standingOn: null, _hidden: false });
      if (replica.state.progress.arrived.includes(member)) Object.assign(player, level.goal);
      if (!saved) player.x += 28 * (replica.state.members.indexOf(member) % 5);
    }
    if (!level) {
      terrain = [{ x: 0, y: 170, w: 960, h: 50 }];
      api._updateCamera(); return;
    }
    const progress = replica.state.progress;
    const nextY = liftY(replica.clock());
    // Carry only someone already standing on this lift. The platform's
    // absolute path is shared; a paused tab never accumulates simulation debt.
    if (Math.abs(player.y + 24 - lift.y) < 0.01 && player.vy >= 0
        && player.x + 20 > lift.x && player.x < lift.x + lift.w) player.y += nextY - lift.y;
    lift.y = nextY;
    terrain = [...level.platforms, lift];
    if (progress.bridgeOpen) terrain.push(level.bridge);
    if (progress.bridgeOpen || progress.soloAssist) terrain.push(level.step);
    const arrived = progress.arrived.includes(member);
    if (wasArrived && !arrived) Object.assign(player, level.spawn, { vx: 0, vy: 0, _hidden: false, state: 'idle' });
    wasArrived = arrived;
    const present = replica.state.online || [];
    for (const name of Object.keys(peers)) {
      if (!present.includes(name)) { entities.delete('peer:' + name); delete peers[name]; }
    }
    for (const name of present) {
      if (name === member) continue;
      const anchor = replica.remoteMotion.sample(name);
      if (!anchor) continue;
      if (!peers[name]) {
        const peer = board.createPeer(name, anchor); peer.engine = engine; peers[name] = peer;
        entities.set('peer:' + name, {
          zIndex: 10, render: ctx => peer.render(ctx), getLabelSpec: () => peer.getLabelSpec()
        });
      }
      const peer = peers[name];
      Object.assign(peer, { x: anchor.x, y: anchor.y, vx: anchor.vx, facingRight: anchor.vx >= 0 });
      peer.state = progress.arrived.includes(name) ? 'in-doorway' : 'idle';
      peer._hidden = progress.arrived.includes(name);
      peer.frameIndex = Math.abs(anchor.vx) > 1 ? 2 + Math.floor(replica.now() / 130) % 4 : 0;
      // BoardSprite.update would chase calendar destinations; presentation
      // here comes from sparse park anchors, using the same sprite renderer.
    }
    if (player.y > level.height + 30) {
      Object.assign(player, progress.bridgeOpen ? level.checkpoint : level.spawn,
        { vx: 0, vy: 0, state: 'idle', standingOn: null });
    }
    api._updateCamera();
  }

  function interact(dt) {
    if (disposed) return;
    const exit = level?.exit || { x: 43, y: 146 };
    returnWalk = near(exit) && input.left ? returnWalk + dt : 0;
    if (returnWalk >= 0.25) { onExit(); return; }
    if (!level) return;
    const progress = replica.state.progress;
    if (progress.arrived.includes(member)) {
      player._hidden = true;
      remember(level.index);
      const text = progress.complete ? 'Together! Press Up to choose another puzzle or replay.' : 'Waiting for your friends at the door. Up returns to the puzzle doors.';
      if (connected() && status.textContent !== text) status.textContent = text;
      return;
    }
    replica.motion(pose());
    // Intermediate anchors can be dropped, including the final motion packet.
    // A reliable resting anchor makes a stationary friend's head dependable.
    // Lift riders are continuously moving even though their local vy is zero.
    const onLift = Math.abs(player.y + 24 - lift.y) < 0.01
      && player.x + 20 > lift.x && player.x < lift.x + lift.w;
    if (!onLift && !player._carriedThisTick && player.vx === 0 && player.vy === 0) {
      const rest = player.x.toFixed(1) + ',' + player.y.toFixed(1);
      if (rest !== lastRest && replica.queue('settle', 'rest', pose()).status === 'queued') lastRest = rest;
    } else lastRest = null;
    for (const item of level.switches) {
      if (near(item) && !progress.switches.includes(item.id)) replica.queue('switch', item.id, pose());
    }
    if (near(level.key) && !progress.keyHolder && !progress.doorOpen) replica.queue('key', 'key', pose());
    if (near(level.goal) && progress.keyHolder === member && !progress.doorOpen && (!level.requiresSwitches || progress.bridgeOpen)) replica.queue('unlock', 'door', pose());
    if (connected()) {
      const text = replica.outbox.length ? 'Saving your progress…'
        : near(lobbyDoor) ? 'Up to choose a puzzle.'
        : level.index === 0 && player.x > 225 && player.x < 300 && !progress.bridgeOpen && !progress.soloAssist ? 'Jump onto a friend to reach the ledge.'
        : near(level.goal) ? (progress.doorOpen ? 'Up to enter the door.' : level.requiresSwitches && !progress.bridgeOpen ? 'Light the switches first.' : 'Bring the key to this door.')
        : level.requiresSwitches && !progress.bridgeOpen ? Math.min(progress.switches.length, progress.requiredSwitches) + '/' + progress.requiredSwitches + ' switches lit. Explore the ledges together.' : '';
      if (status.textContent !== text) status.textContent = text;
    }
  }

  function door(ctx, center, floor, open) {
    ctx.fillStyle = '#57756c'; ctx.beginPath(); ctx.roundRect(center - 22, floor - 53, 44, 53, [21, 21, 0, 0]); ctx.fill();
    ctx.fillStyle = open ? '#030606' : '#57756c';
    ctx.beginPath(); ctx.roundRect(center - 19, floor - 50, 38, 50, [18, 18, 0, 0]); ctx.fill();
    if (!open) { ctx.fillStyle = '#e2b640'; ctx.fillRect(center + 8, floor - 25, 3, 3); }
  }

  function scenery(ctx) {
    api._translateForCamera(ctx);
    ctx.fillStyle = '#57756c';
    for (const tile of terrain) ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    door(ctx, 43, 170, true);
    ctx.fillStyle = '#57756c'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Calendar', 43, 106);
    if (lobby) {
      ctx.font = '13px system-ui'; ctx.textAlign = 'center';
      for (const [index, item] of doors.entries()) {
        door(ctx, item.x + 10, 170, true);
        ctx.fillStyle = '#57756c';
        ctx.fillText((completed.includes(index) ? '\u2713 ' : '') + item.title, item.x + 10, 104);
        if (near(item)) ctx.fillText('Up to enter', item.x + 10, 85);
      }
    }
    if (level) {
      const progress = replica.state.progress;
      door(ctx, level.goal.x + 10, level.goal.y + 24, progress.doorOpen);
      door(ctx, lobbyDoor.x + 10, 170, true);
      ctx.fillStyle = '#57756c'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Levels', lobbyDoor.x + 10, 106);
      for (const sw of level.switches) {
        const lit = progress.switches.includes(sw.id);
        if (buttonImage.complete && buttonImage.naturalWidth) ctx.drawImage(buttonImage, sw.x, sw.y + 16, 22, 8);
        ctx.fillStyle = lit ? '#e2b640' : '#bc5151'; ctx.fillRect(sw.x, sw.y + 19, 22, 5);
      }
      if (!progress.doorOpen) {
        const holder = progress.keyHolder === member ? player : peers[progress.keyHolder];
        const point = holder ? { x: holder.x, y: holder.y - 16 } : !progress.keyHolder ? level.key : null;
        if (point && keyImage.complete && keyImage.naturalWidth) ctx.drawImage(keyImage, point.x, point.y, 18, 18);
      }
    }
    api._restoreFromCamera(ctx);
  }

  entities.set('prepare', { update: prepare });
  entities.set('scenery', { zIndex: 1, render: scenery });
  entities.set('player', {
    zIndex: 10,
    update(dt) {
      if (replica.state?.progress.arrived.includes(member)) {
        if (input.up && !player._upHandled) onLobby();
        player._upHandled = !!input.up;
      } else player.update(dt);
    },
    render: ctx => player.render(ctx)
  });
  entities.set('interact', { update: interact });
  engine.sceneEntities = entities;
  return {
    getWorld: () => ({ player, level, terrain, lift, peers, lobby, doors }),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (engine.sceneEntities === entities) engine.sceneEntities = null;
      Object.assign(api._camera, oldCamera);
      for (const key of Object.keys(input)) input[key] = false;
    }
  };
}
