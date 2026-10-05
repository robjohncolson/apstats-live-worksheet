import { createNativePitcher } from './native-pitcher.mjs';
import { createNativeBoundBall } from './native-bound-ball.mjs';
import { createNativeKeyBox } from './native-key-box.mjs';
import { laserTouchesRect } from './native-laser.mjs';
import { nativeMapFromRecovered, moveNativeBodyOnMap, finalizeNativeMapContacts } from './native-map-collision.mjs';

export function createBoundRewardBox(runtime, original, makeView, makeKey) {
  const spawn = { ...original, x: Math.fround(original.x + Math.fround((Number(original.raw[6]) || 0) * runtime.activePlayerCount)) };
  const view = makeView('native_bound_box', 48, 64);
  view.x = spawn.x; view.y = spawn.y;
  const box = { spawn, view, velocityY: 0,
    rect: { x: spawn.x - 22, y: spawn.y - 62, width: 44, height: 60 } };
  box.nativeState = createNativeKeyBox({ kind: 'BallBox', x: spawn.x, y: spawn.y,
    releaseKey: ({ x, y }) => {
      const key = makeKey({ actorName: 'Key', label: '', x, y, raw: [0, 0, 'Key', '', x, y] });
      runtime.keys.push(key); runtime.actorLayer.addChild(key.view);
    },
  });
  (runtime.nativeBoundBoxes ??= []).push(box);
  runtime.staticRects.push(box); runtime.actorLayer.addChild(view);
}

export function tickNativeBoundBalls(runtime, makeView, moveRect) {
  let nativeMap = null;
  if (runtime.tileMap && runtime.deadBallPitchers.some(pitcher => pitcher.spawn.actorName === 'BoundBallPitcher')) {
    nativeMap = runtime.nativeBoundMap ??= {};
    // Contact rows retain the map object. Refresh its data without replacing
    // that identity when an actor paints or removes chips.
    Object.assign(nativeMap, nativeMapFromRecovered(runtime.tileMap.map));
  }
  for (const box of runtime.nativeBoundBoxes ?? []) {
    box.nativeState.tick();
    const state = box.nativeState.state;
    if (!state.released && runtime.tileMap) {
      box.velocityY = Math.fround(box.velocityY + Math.fround(.65));
      const result = moveRect(runtime.tileMap, box.rect, { x: 0, y: box.velocityY });
      Object.assign(box.rect, result.rect);
      if (result.grounded) box.velocityY = 0;
      box.spawn.x = box.rect.x + 22; box.spawn.y = box.rect.y + 62;
      box.nativeState.setPosition(box.spawn.x, box.spawn.y);
      box.view.x = box.spawn.x; box.view.y = box.spawn.y;
    }
    box.view.alpha = state.alpha;
    if (state.removed) {
      box.view.visible = false;
      const index = runtime.staticRects.indexOf(box);
      if (index >= 0) runtime.staticRects.splice(index, 1);
    }
  }
  for (const pitcher of runtime.deadBallPitchers) {
    if (pitcher.spawn.actorName !== 'BoundBallPitcher') continue;
    if (!pitcher.nativeState) {
      pitcher.view.visible = false;
      pitcher.nativeState = createNativePitcher({ spawn: pitcher.spawn, partySize: runtime.activePlayerCount,
        createProjectile: params => {
          const ball = createNativeBoundBall({ ...params, partySize: runtime.activePlayerCount });
          ball.view = makeView('native_bound_ball', 24, 24, true);
          runtime.actorLayer.addChild(ball.view);
          syncBallView(ball);
          return ball;
        },
      });
    }
    const previous = pitcher.nativeState.state.child;
    pitcher.nativeState.tick();
    const ball = pitcher.nativeState.state.child;
    if (!ball) continue;
    const before = ball.state;
    if (ball === previous) ball.tick();
    let state = ball.state;
    if (!state.remaining && !state.removed && ball === previous && runtime.tileMap) {
      const body = ball.nativeMapBody ??= { flags: 1, type: 3,
        localBounds: { x: -12, y: -12, width: 24, height: 24 },
        onContactStay: (_other, normal) => ball.contact(normal) };
      body.position = { x: before.x, y: before.y };
      body.previousPosition = { ...body.position };
      moveNativeBodyOnMap(nativeMap, body,
        { x: Math.fround(state.x - before.x), y: Math.fround(state.y - before.y) });
      ball.resolvePosition(body.position.x, body.position.y);
      finalizeNativeMapContacts(body);
    }
    syncBallView(ball);
  }
}

export function contactNativeBoundBalls(runtime) {
  for (const pitcher of runtime.deadBallPitchers) {
    if (pitcher.spawn.actorName !== 'BoundBallPitcher') continue;
    const ball = pitcher.nativeState?.state.child;
    if (!ball || ball.removed || ball.state.remaining) continue;
    for (const box of runtime.nativeBoundBoxes ?? []) {
      if (box.nativeState.state.removed) continue;
      const sensor = { x: box.spawn.x - 4, y: box.spawn.y - 66, width: 8, height: 10 };
      if (laserTouchesRect(ball.state, sensor) && box.nativeState.ballContact(ball)) break;
      resolveBody(ball, box.rect, { category: 5, mass: 1, velocity: { x: 0, y: box.velocityY } });
    }
    if (!ball.state.remaining) {
      for (const player of runtime.players) {
        if (player.deathTimer > 0 || runtime.goalClearedPlayers.has(player)
          || runtime.collisionChangePlayersCollisionOff.has(player) || runtime.activelyGuardingPlayers.has(player)) continue;
        resolveBody(ball, player.rect, { category: 1, mass: 100,
          velocity: { x: player.velocity.x / 60, y: player.velocity.y / 60 } });
      }
    }
    syncBallView(ball);
  }
}

// Adapter to the preview's rectangle solver. Native global body ordering,
// support graph and moving-body displacement still require separate parity work.
function resolveBody(ball, rect, other) {
  const state = ball.state;
  if (state.remaining || !laserTouchesRect(state, rect)) return;
  const contacts = [
    { depth: state.x + 12 - rect.x, x: 1, y: 0 },
    { depth: rect.x + rect.width - state.x + 12, x: -1, y: 0 },
    { depth: state.y + 12 - rect.y, x: 0, y: 1 },
    { depth: rect.y + rect.height - state.y + 12, x: 0, y: -1 },
  ];
  const normal = contacts.reduce((best, contact) => contact.depth < best.depth ? contact : best);
  ball.resolvePosition(state.x - normal.x * normal.depth, state.y - normal.y * normal.depth);
  ball.contact(normal, other);
}

function syncBallView(ball) {
  const state = ball.state;
  ball.view.x = state.x; ball.view.y = state.y;
  ball.view.alpha = state.alpha; ball.view.scale.set(state.scale);
  if (state.removed) ball.view.removeFromParent();
}
