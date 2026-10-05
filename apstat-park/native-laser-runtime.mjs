import { createNativePitcher } from './native-pitcher.mjs';
import { createNativeKeyBox } from './native-key-box.mjs';
import { createNativeLaser, laserTouchesRect } from './native-laser.mjs';

function sendCommand(runtime, target, command, payload) {
  for (const actor of [...runtime.deadBallPitchers, ...(runtime.nativeLaserBoxes ?? [])]) {
    if (actor.spawn.actorName !== target && actor.spawn.label !== target) continue;
    actor.nativeState?.receiveCommand(command, payload);
  }
}

export function createLaserRewardBox(runtime, spawn, makeView, makeKey) {
  const view = makeView('native_laser_box_0', 46, 62);
  view.x = spawn.x; view.y = spawn.y;
  const box = { spawn, view, rect: { x: spawn.x - 22, y: spawn.y - 62, width: 44, height: 60 } };
  box.nativeState = createNativeKeyBox({ kind: 'LaserKeyBox', x: spawn.x, y: spawn.y,
    target: spawn.raw[6], multiplier: spawn.raw[6 + Math.max(1, runtime.activePlayerCount - 1)] ?? 0,
    sendCommand: (...args) => sendCommand(runtime, ...args),
    releaseKey: ({ x, y }) => {
      const key = makeKey({ actorName: 'Key', label: '', x, y, raw: [0, 0, 'Key', '', x, y] });
      runtime.keys.push(key);
      runtime.actorLayer.addChild(key.view);
    },
  });
  (runtime.nativeLaserBoxes ??= []).push(box);
  runtime.staticRects.push(box);
  runtime.actorLayer.addChild(view);
  return box;
}

export function tickNativeLasers(runtime, makeView, changeFrame) {
  for (const box of runtime.nativeLaserBoxes ?? []) {
    box.nativeState.tick();
    const state = box.nativeState.state;
    box.view.alpha = state.alpha;
    changeFrame(box.view, `native_laser_box_${Math.min(2, state.hits)}`);
    if (!state.removed) continue;
    box.view.visible = false;
    const index = runtime.staticRects.indexOf(box);
    if (index >= 0) runtime.staticRects.splice(index, 1);
  }
  for (const pitcher of runtime.deadBallPitchers) {
    if (pitcher.spawn.actorName !== 'LaserBallPitcher') continue;
    if (!pitcher.nativeState) {
      pitcher.view.visible = false;
      pitcher.nativeState = createNativePitcher({ spawn: pitcher.spawn, partySize: runtime.activePlayerCount,
        sendCommand: (...args) => sendCommand(runtime, ...args),
        createProjectile: params => {
          const child = createNativeLaser({ ...params, sendCommand: (...args) => sendCommand(runtime, ...args) });
          child.view = makeView('native_laser_ball', 24, 24, true);
          child.view.x = params.x; child.view.y = params.y;
          runtime.actorLayer.addChild(child.view);
          return child;
        },
      });
    }
    // A child inserted this frame starts PRE on the following frame.
    const previous = pitcher.nativeState.state.child;
    pitcher.nativeState.tick();
    const child = pitcher.nativeState.state.child;
    if (!child) continue;
    if (child === previous) child.tick();
    const state = child.state;
    child.view.x = state.x; child.view.y = state.y;
    child.view.alpha = state.alpha;
    child.view.scale.set(state.scale);
    if (state.removed) child.view.removeFromParent();
  }
}

export function contactNativeLasers(runtime) {
  for (const pitcher of runtime.deadBallPitchers) {
    if (pitcher.spawn.actorName !== 'LaserBallPitcher') continue;
    const child = pitcher.nativeState?.state.child;
    if (!child || child.removed || child.state.remaining) continue;
    const state = child.state;
    const player = runtime.players.find(player => player.deathTimer <= 0
      && !runtime.goalClearedPlayers.has(player) && !runtime.activelyGuardingPlayers.has(player)
      && laserTouchesRect(state, player.rect));
    if (player) { child.contact(1); continue; }
    const box = runtime.nativeLaserBoxes?.find(box => !box.nativeState.state.removed && laserTouchesRect(state, box.rect));
    if (box) {
      box.nativeState.laserContact(1, 5);
      child.contact(5);
      continue;
    }
    const solid = runtime.staticRects.some(rect => laserTouchesRect(state, rect.rect));
    if (solid || touchesMap(runtime.tileMap, state)) child.contact(0);
  }
}

function touchesMap(map, ball) {
  if (!map) return false;
  const size = map.map.chipSize;
  for (let y = Math.floor((ball.y - ball.radius) / size); y <= Math.floor((ball.y + ball.radius) / size); y++) {
    for (let x = Math.floor((ball.x - ball.radius) / size); x <= Math.floor((ball.x + ball.radius) / size); x++) {
      if (map.isSolidTile(x, y) && laserTouchesRect(ball, { x: x * size, y: y * size, width: size, height: size })) return true;
    }
  }
  return false;
}
