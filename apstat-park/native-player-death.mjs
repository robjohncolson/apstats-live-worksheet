const f = Math.fround;

// bb35190: publish to every registered component, including zero velocity.
function publishNativeDeathVelocity(actor, value) {
  actor.velocity = { x: f(value.x), y: f(value.y) };
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
}

// Controller kind1, bb70630/bb70690/bb70740. Enter hides the sprite and
// disables only the primary collision body; leave restores both bits.
export function createNativeHiddenController() {
  return {
    enter(actor) {
      publishNativeDeathVelocity(actor, { x: 0, y: 0 });
      actor.spriteFlags &= ~8;
      actor.bodies[0].body.flags &= ~1;
    },
    leave(actor) {
      actor.spriteFlags |= 8;
      actor.bodies[0].body.flags |= 1;
    },
    pre() {}, post() {}, receive() { return 0; },
  };
}

// Controller kind3, bb6ed30/bb6eda0. Ordinary damage enters this animation;
// the walking fall-boundary branch instead requests hidden controller kind1.
export function createNativeDeathController() {
  const state = { phase: 0, elapsed: 0 };
  return {
    state,
    pre(actor, dt) {
      const scene = actor.scene;
      if (actor.networkOwner && scene.networkMode === 1 && state.phase !== 0) {
        publishNativeDeathVelocity(actor, { x: 0, y: 0 });
        return;
      }
      if (state.phase === 0) {
        publishNativeDeathVelocity(actor, { x: 0, y: 0 });
        actor.bodies[0].body.flags &= ~1;
        actor.resetSpriteBounds(); // bb678f0 with zero offset
        actor.setAnimation(4);
        state.phase = 1;
        return;
      }
      if (state.phase === 1) {
        state.elapsed = f(state.elapsed + f(dt));
        if (state.elapsed < 1) return;
        state.phase = 2;
        publishNativeDeathVelocity(actor, { x: actor.velocity.x, y: -9 });
        return;
      }
      if (state.phase !== 2) return;
      publishNativeDeathVelocity(actor, { x: actor.velocity.x, y: f(actor.velocity.y + f(.65)) });
      if (!(actor.position.y > f(f(720 / scene.viewScale) * 4))) return;
      if (scene.stageRetryEligible) scene.flags |= 2;
      actor.fallState = 1;
    },
    post() {}, receive() { return 0; },
  };
}

// bb69be0. fallState names the native +414 pending controller kind, not an
// independent death status. Consume before the new controller's PRE. The
// factory is required because kinds2/4/5 have separate behavior and ownership.
export function applyNativePlayerControllerChange(actor, createController) {
  const kind = actor.fallState;
  if (!kind) return;
  actor.controller?.leave?.(actor);
  actor.controller?.dispose?.();
  actor.controller = null;
  actor.controller = createController(kind, actor);
  actor.controller?.enter?.(actor);
  actor.controllerKind = kind;
  actor.fallState = 0;
}
