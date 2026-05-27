// level-editor-sim.js
// P3 -- single-player walk simulator for the v7-level-1 level editor.
//
// Pure-JS state + actor mechanics. No DOM. No fetch. No external deps.
// Exposes a single export surface on window.LE.sim.
//
// This is NOT the live cr engine -- it is a faithful MIRROR sufficient
// to let a level author walk-test their level before launching the
// cockpit. Multi-player teamwork is simulated as "always ready" (only
// 1 player walking).
//
// Mechanics mirrored (CONTINUATION_PROMPT.md s118 section, V7.7-V7.14):
//   - SipStation auto-choice on 2nd sip (the cup you END at = preference)
//   - Gate predicate eval (always_false, every_player_row_complete,
//     tally_nonzero) with X-only collision (push-out, full-height wall)
//   - ContextSlot one-way light on touch
//   - GoalPad presence timer (default 1500 ms) -> LEVEL_CLEARED
//     when all ContextSlots are lit (for completion.kind =
//     contextslots-lit-and-goalpad-presence)
//   - Legacy QuestionDoor/Key/Goal (V7.1-V7.5 voting)
//
// Phase transitions (single-player simplification):
//   IDLE -> SIPPING (or VOTING for legacy levels without SipStations)
//   SIPPING + sips complete + gates open -> remain SIPPING (mechanic
//     advancement is via walking through gates)
//   VOTING + correct QuestionDoor -> KEY_HUNT (if Key actor) or
//     GOAL_AVAILABLE (no Key)
//   VOTING + incorrect QuestionDoor -> REFLECTION (4 sec) -> VOTING
//   Any phase + GoalPad presence + all ContextSlots lit -> LEVEL_CLEARED
//   KEY_HUNT + Key touched -> GOAL_AVAILABLE
//   GOAL_AVAILABLE + Goal touched -> LEVEL_CLEARED

(function () {
  'use strict';

  window.LE = window.LE || {};

  // ---------------------------------------------------------------------------
  // Phase constants -- mirror the cr engine for HUD display + transitions.
  // ---------------------------------------------------------------------------

  var PHASES = [
    'IDLE',
    'SIPPING',
    'VOTING',
    'REFLECTION',
    'KEY_HUNT',
    'GOAL_AVAILABLE',
    'LEVEL_CLEARED',
  ];

  // Default GoalPad timer (ms) when actor doesn't specify triggerMs.
  var DEFAULT_GOALPAD_TRIGGER_MS = 1500;

  // Default REFLECTION dwell when QuestionDoor.correct=false (ms).
  var REFLECTION_DWELL_MS = 4000;

  // ---------------------------------------------------------------------------
  // Helpers.
  // ---------------------------------------------------------------------------

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Read state.actors as a safe array. Sim only walks the main scope --
  // reflection_room actors live in a separate sub-level the cr engine
  // routes to via ReturnWarp; the editor's sim mode does NOT enter it.
  function readActors(levelState) {
    if (!levelState || !Array.isArray(levelState.actors)) return [];
    return levelState.actors;
  }

  function readMap(levelState) {
    if (levelState && isPlainObject(levelState.map)) return levelState.map;
    return { width: 32, height: 8, chipSize: 10 };
  }

  function findFirstByType(levelState, type) {
    var actors = readActors(levelState);
    for (var i = 0; i < actors.length; i++) {
      if (actors[i] && actors[i].type === type) return actors[i];
    }
    return null;
  }

  function findAllByType(levelState, type) {
    var actors = readActors(levelState);
    var out = [];
    for (var i = 0; i < actors.length; i++) {
      if (actors[i] && actors[i].type === type) out.push(actors[i]);
    }
    return out;
  }

  function hasAnyOfType(levelState, type) {
    return findFirstByType(levelState, type) !== null;
  }

  // ---------------------------------------------------------------------------
  // Predicate functions.
  // ---------------------------------------------------------------------------

  // always_false -- never opens. The Zone 4 "wrong answer" door pattern.
  function predAlwaysFalse() {
    return false;
  }

  // every_player_row_complete -- opens when ALL players have sampledA +
  // sampledB + choice. Single-player sim: "all players" = just this one.
  // The player completes a row by sampling BOTH drinks AND recording a
  // choice (which auto-fires on the 2nd sip per V7.13 SipStation logic).
  function predEveryPlayerRowComplete(sim) {
    if (!sim || !sim.sips) return false;
    if (!sim.sips.sampledA) return false;
    if (!sim.sips.sampledB) return false;
    if (sim.sips.choice !== 'A' && sim.sips.choice !== 'B') return false;
    return true;
  }

  // tally_nonzero -- opens when any player has recorded a sip preference
  // (the class tally has at least one row). Single-player sim: fires when
  // sim.tallySips.A > 0 OR sim.tallySips.B > 0. Also opens unconditionally
  // when sim.fakeTally === true.
  function predTallyNonzero(sim) {
    if (sim && sim.fakeTally === true) return true;
    if (!sim || !sim.tallySips) return false;
    if ((sim.tallySips.A | 0) > 0) return true;
    if ((sim.tallySips.B | 0) > 0) return true;
    return false;
  }

  var PREDICATE_FNS = {
    always_false: predAlwaysFalse,
    every_player_row_complete: predEveryPlayerRowComplete,
    tally_nonzero: predTallyNonzero,
  };

  function evalPredicate(sim, predicate) {
    if (typeof predicate !== 'string') return false;
    var fn = PREDICATE_FNS[predicate];
    if (typeof fn !== 'function') return false;
    return fn(sim) === true;
  }

  // Returns true if the named gate is currently OPEN (passable).
  function isGateOpen(sim, gateActor) {
    if (!gateActor) return true;
    if (gateActor.type !== 'Gate') return true;
    return evalPredicate(sim, gateActor.predicate);
  }

  // ---------------------------------------------------------------------------
  // Sim state factory.
  // ---------------------------------------------------------------------------

  // levelState is the editor's current state (LE.model state shape).
  // The sim holds a REFERENCE to levelState (not a clone) -- the player
  // can walk freely; level edits during sim are disabled by the UI layer,
  // so the reference stays stable.
  function createSim(levelState) {
    if (!isPlainObject(levelState)) {
      throw new Error('createSim: levelState must be an object');
    }

    var spawn = findFirstByType(levelState, 'PlayerSpawn');
    var spawnX = (spawn && isFiniteNumber(spawn.x)) ? (spawn.x | 0) : 0;
    var spawnY = (spawn && isFiniteNumber(spawn.y)) ? (spawn.y | 0) : 0;

    // Start phase: SIPPING if any SipStations exist, otherwise VOTING
    // if any QuestionDoors exist, otherwise IDLE (level has no driving
    // mechanic to scaffold). This mirrors the cr engine's startup.
    var startPhase = 'IDLE';
    if (hasAnyOfType(levelState, 'SipStation')) {
      startPhase = 'SIPPING';
    } else if (hasAnyOfType(levelState, 'QuestionDoor')) {
      startPhase = 'VOTING';
    }

    return {
      phase: startPhase,
      player: { x: spawnX, y: spawnY },

      // Per-player sip state. sampledA/B latch on any sip of that drink.
      // choice latches on the 2nd sip when BOTH samples already done; the
      // recorded value is the type sipped on that 2nd-after-both touch.
      sips: { sampledA: false, sampledB: false, choice: null },

      // Class-tally counter. Single-player sim writes to A or B when the
      // local player records a choice. Used by tally_nonzero predicate.
      tallySips: { A: 0, B: 0 },

      // Set of ContextSlot ids that have been lit. One-way; never unlit.
      contextSlotsLit: new Set(),

      // Set of Gate ids that have been WALKED THROUGH (cr engine's
      // advance-on-walk-through hook for the tally_nonzero gate).
      gateOpenIds: new Set(),

      // Legacy KEY_HUNT/Goal state.
      keyCollected: false,
      goalReached: false,

      // GoalPad presence timer (ms). Accumulates while player is on the
      // pad; resets to 0 when player walks off. Hits triggerMs ->
      // LEVEL_CLEARED if all ContextSlots are lit (mechanic-first
      // completion.kind = contextslots-lit-and-goalpad-presence).
      goalPadTimerMs: 0,

      // REFLECTION dwell timer (ms). Counts DOWN from REFLECTION_DWELL_MS
      // when phase=REFLECTION; on reaching 0, phase reverts to VOTING.
      reflectionTimerMs: 0,

      // Fake-tally toggle. When true, predTallyNonzero returns true
      // unconditionally -- lets the author smoke a level past the Zone 4
      // advance gate without first walking SipStations.
      fakeTally: false,

      // Tracks which SipStation drinks have been touched THIS visit (so
      // walking back and forth doesn't repeatedly fire the choice latch).
      // Cleared when player walks off the chip. Internal bookkeeping only.
      _touchingSipStationIds: new Set(),

      // Tracks the last GoalPad chip the player was on -- used to detect
      // when the player walks off (reset goalPadTimerMs).
      _lastGoalPadChipKey: null,

      // Reference back to the level state. The sim mutates its OWN fields
      // only; levelState is read-only from the sim's perspective.
      levelState: levelState,
    };
  }

  // ---------------------------------------------------------------------------
  // Tick -- advance timers, evaluate gate predicates, update phase.
  // ---------------------------------------------------------------------------

  function tick(sim, dtMs) {
    if (!sim) return;
    if (sim.phase === 'LEVEL_CLEARED') return; // terminal
    if (!isFiniteNumber(dtMs) || dtMs <= 0) return;

    // REFLECTION dwell -- count down; on expiry, revert to VOTING.
    if (sim.phase === 'REFLECTION') {
      sim.reflectionTimerMs -= dtMs;
      if (sim.reflectionTimerMs <= 0) {
        sim.reflectionTimerMs = 0;
        sim.phase = 'VOTING';
      }
      return;
    }

    // GoalPad timer ticks ONLY while player is standing on a GoalPad chip.
    // We check overlap each tick so the timer keeps accumulating across
    // ticks even without movement.
    tickGoalPadPresence(sim, dtMs);

    // After GoalPad tick, the phase may have flipped to LEVEL_CLEARED.
    if (sim.phase === 'LEVEL_CLEARED') return;

    // Phase auto-advancement for mechanic-first levels:
    //   SIPPING -> (stays SIPPING; advancement is via walking through
    //              the advance gate, which transitions to GOAL_AVAILABLE)
    // No automatic phase flip required here -- per cr engine, the gate
    // walk-through is the trigger. Walking through the advance gate is
    // handled by isGateBlocking / movePlayer.
  }

  // Update goalPadTimerMs based on player overlap with any GoalPad chip.
  // If the player is on a GoalPad AND all ContextSlots in the level are
  // lit AND timer >= triggerMs -> phase becomes LEVEL_CLEARED. This is
  // the mechanic-first completion path.
  function tickGoalPadPresence(sim, dtMs) {
    if (!sim) return;

    var pads = findAllByType(sim.levelState, 'GoalPad');
    if (pads.length === 0) {
      sim.goalPadTimerMs = 0;
      sim._lastGoalPadChipKey = null;
      return;
    }

    var px = sim.player.x | 0;
    var py = sim.player.y | 0;

    var currentPad = null;
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if ((pad.x | 0) === px && (pad.y | 0) === py) {
        currentPad = pad;
        break;
      }
    }

    if (!currentPad) {
      // Walked off (or never on) -- reset timer.
      sim.goalPadTimerMs = 0;
      sim._lastGoalPadChipKey = null;
      return;
    }

    var chipKey = currentPad.x + ',' + currentPad.y;
    if (sim._lastGoalPadChipKey !== chipKey) {
      // Just walked onto this pad -- reset to 0 and start counting.
      sim.goalPadTimerMs = 0;
      sim._lastGoalPadChipKey = chipKey;
    }
    sim.goalPadTimerMs += dtMs;

    var trigger = (isFiniteNumber(currentPad.triggerMs) && currentPad.triggerMs > 0)
      ? currentPad.triggerMs
      : DEFAULT_GOALPAD_TRIGGER_MS;

    if (sim.goalPadTimerMs >= trigger) {
      // Only clear if mechanic-first completion conditions are met --
      // all ContextSlots in the level lit. Legacy levels without
      // ContextSlots also clear (the only gate is the timer itself).
      if (allContextSlotsLit(sim)) {
        sim.phase = 'LEVEL_CLEARED';
      }
    }
  }

  function allContextSlotsLit(sim) {
    if (!sim) return false;
    var slots = findAllByType(sim.levelState, 'ContextSlot');
    if (slots.length === 0) return true; // no slots = no gate
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (!slot || typeof slot.id !== 'string') continue;
      if (!sim.contextSlotsLit.has(slot.id)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Movement.
  // ---------------------------------------------------------------------------

  // movePlayer -- attempt to move the player by (dx, dy) chips. Clamped
  // to map bounds; respects Gate collision (closed gate blocks x-only).
  // On successful move, fires touch handlers for any actor at the new
  // chip (one chip per move, so at most one touch per call).
  function movePlayer(sim, dx, dy) {
    if (!sim) return;
    if (sim.phase === 'LEVEL_CLEARED') return;
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return;
    if (dx === 0 && dy === 0) return;

    var levelMap = readMap(sim.levelState);
    var mapW = (levelMap.width | 0) || 32;
    var mapH = (levelMap.height | 0) || 8;

    var fromX = sim.player.x | 0;
    var fromY = sim.player.y | 0;
    var toX = fromX + (dx | 0);
    var toY = fromY + (dy | 0);

    // Clamp to map bounds.
    if (toX < 0) toX = 0;
    if (toY < 0) toY = 0;
    if (toX > mapW - 1) toX = mapW - 1;
    if (toY > mapH - 1) toY = mapH - 1;

    // Gate collision (x-only push-out). If a closed gate sits between
    // fromX and toX, clamp toX to one chip before the gate.
    if (dx !== 0 && toX !== fromX) {
      var step = (toX > fromX) ? 1 : -1;
      var scanX = fromX + step;
      while ((step > 0 && scanX <= toX) || (step < 0 && scanX >= toX)) {
        if (isGateBlocking(sim, scanX, toY)) {
          // Block at the chip BEFORE the gate.
          toX = scanX - step;
          break;
        }
        scanX += step;
      }
    }

    if (toX === fromX && toY === fromY) return; // no progress

    sim.player.x = toX;
    sim.player.y = toY;

    // Fire touch handlers for any actor at the new chip. Process in
    // actor-array order (matches cr engine's collision pass).
    var actors = readActors(sim.levelState);
    var stillTouchingSipIds = new Set();
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a) continue;
      if ((a.x | 0) !== toX || (a.y | 0) !== toY) continue;

      switch (a.type) {
        case 'SipStation':
          _onTouchSipStation(sim, a);
          stillTouchingSipIds.add(a.id);
          break;
        case 'ContextSlot':
          _onTouchContextSlot(sim, a);
          break;
        case 'Key':
          _onTouchKey(sim, a);
          break;
        case 'Goal':
          _onTouchGoal(sim, a);
          break;
        case 'QuestionDoor':
          _onWalkThroughQuestionDoor(sim, a);
          break;
        case 'Gate':
          // If we landed ON a gate chip, the gate is open (we already
          // collision-tested). Record it as walked-through for the cr
          // engine's tally_nonzero advance hook.
          if (typeof a.id === 'string' && a.id.length > 0) {
            sim.gateOpenIds.add(a.id);
            // Walking through the advance gate (tally_nonzero) is the
            // mechanic-first phase advancement (SIPPING -> GOAL_AVAILABLE).
            if (a.predicate === 'tally_nonzero' && sim.phase !== 'LEVEL_CLEARED') {
              sim.phase = 'GOAL_AVAILABLE';
            }
          }
          break;
        // GoalPad is handled by the tick loop (presence timer), not on
        // touch -- the player can stand on it across multiple ticks.
        default:
          break;
      }
    }

    // Reset the SipStation touch tracker for any drink we walked AWAY
    // from. This lets a 2nd-sip-on-same-drink toggle behave correctly
    // (V7.13 records choice on the SECOND sip, which can be the same
    // cup the player started at).
    var ids = Array.from(sim._touchingSipStationIds);
    for (var j = 0; j < ids.length; j++) {
      if (!stillTouchingSipIds.has(ids[j])) {
        sim._touchingSipStationIds.delete(ids[j]);
      }
    }
  }

  // setFakeTally -- toggle the fake-tally override. Used by sim UI to
  // smoke past the advance gate without walking SipStations.
  function setFakeTally(sim, on) {
    if (!sim) return;
    sim.fakeTally = (on === true);
  }

  // ---------------------------------------------------------------------------
  // Gate collision.
  // ---------------------------------------------------------------------------

  // isGateBlocking -- returns true if a CLOSED Gate sits at the given
  // chip (X-only collision per V7.10.1 spec). Gates are full-height
  // walls; once the predicate is true, the gate is passable.
  function isGateBlocking(sim, atChipX, atChipY) {
    if (!sim) return false;
    var actors = readActors(sim.levelState);
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'Gate') continue;
      if ((a.x | 0) !== atChipX) continue;
      // X-only collision: a gate at x=40 blocks ANY y at x=40.
      // (The atChipY param is unused for the lookup but kept in the
      // signature so callers can extend to y-aware mechanics later.)
      if (!isGateOpen(sim, a)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Touch handlers.
  // ---------------------------------------------------------------------------

  // SipStation. V7.13 auto-choice:
  //   - 1st touch of a SipStation: latch sampledA or sampledB (by drink).
  //   - After BOTH samples done, the NEXT distinct touch latches choice
  //     to the drink type of that touch. The cup you END at = preference.
  //   - We dedupe re-touches of the SAME SipStation (the player stepping
  //     in place shouldn't keep re-recording).
  function _onTouchSipStation(sim, actor) {
    if (!sim || !actor) return;
    if (typeof actor.id !== 'string' || actor.id.length === 0) return;
    var drink = actor.drink;
    if (drink !== 'A' && drink !== 'B') return;

    var alreadyTouchingThis = sim._touchingSipStationIds.has(actor.id);
    sim._touchingSipStationIds.add(actor.id);
    if (alreadyTouchingThis) return; // dedupe re-touch

    var hadBoth = sim.sips.sampledA && sim.sips.sampledB;

    // Latch the sample for this drink.
    if (drink === 'A') sim.sips.sampledA = true;
    if (drink === 'B') sim.sips.sampledB = true;

    // Choice records on the 2nd sip AFTER both samples are done.
    // Two cases:
    //   1) We just completed both samples on this very touch -> the
    //      drink of this touch IS the second-sip, so record choice.
    //   2) Both were already sampled before this touch -> any new
    //      distinct touch records choice = current drink.
    if (hadBoth) {
      sim.sips.choice = drink;
      _bumpTally(sim, drink);
    } else if (sim.sips.sampledA && sim.sips.sampledB) {
      // Just hit "both sampled" on this touch.
      sim.sips.choice = drink;
      _bumpTally(sim, drink);
    }
  }

  // Bump the class-tally counter for the chosen drink. Single-player
  // sim: each choice latch counts as 1 row toward the tally_nonzero
  // predicate. We guard against double-counting by clearing the previous
  // choice's contribution before re-bumping (so flipping A->B doesn't
  // leave a phantom A row).
  function _bumpTally(sim, drink) {
    if (!sim) return;
    // Reset to zero-row state then add the new choice. This is the
    // simplest correct model for single-player auto-bump.
    sim.tallySips = { A: 0, B: 0 };
    if (drink === 'A') sim.tallySips.A = 1;
    else if (drink === 'B') sim.tallySips.B = 1;
  }

  // ContextSlot. One-way light on touch. State survives any sub-phase
  // changes (V7.14 contract).
  function _onTouchContextSlot(sim, actor) {
    if (!sim || !actor) return;
    if (typeof actor.id !== 'string' || actor.id.length === 0) return;
    sim.contextSlotsLit.add(actor.id);
  }

  // GoalPad -- handled by the tick loop, not on touch. This stub is
  // kept on the export surface for parity with the spec's contract.
  function _onTouchGoalPad(sim, actor, dtMs) {
    // The presence-timer logic is in tickGoalPadPresence(). This handler
    // intentionally no-ops -- callers should use tick() to advance the
    // timer rather than calling this directly. Kept for API stability.
    if (!sim || !actor) return;
    if (!isFiniteNumber(dtMs) || dtMs <= 0) return;
    // For tests that want a one-shot timer bump without driving tick(),
    // we delegate to tickGoalPadPresence with a synthetic state where
    // the player is at the pad's chip. (Caller must arrange the player
    // to actually be on the pad; we don't move them here.)
    tickGoalPadPresence(sim, dtMs);
  }

  // Legacy Key (V7.5). Touch -> collect. Goal becomes available.
  function _onTouchKey(sim, actor) {
    if (!sim || !actor) return;
    sim.keyCollected = true;
    // If we were in KEY_HUNT, advance to GOAL_AVAILABLE.
    if (sim.phase === 'KEY_HUNT') {
      sim.phase = 'GOAL_AVAILABLE';
    }
  }

  // Legacy Goal (V7.1). Touch -> LEVEL_CLEARED if Key requirement met.
  // If no Key actor exists in the level, the Goal is always reachable.
  function _onTouchGoal(sim, actor) {
    if (!sim || !actor) return;
    var hasKey = hasAnyOfType(sim.levelState, 'Key');
    if (hasKey && !sim.keyCollected) return; // gated
    sim.goalReached = true;
    sim.phase = 'LEVEL_CLEARED';
  }

  // Legacy QuestionDoor (V7.1). Walk-through -> vote.
  //   correct=true  -> phase advances to KEY_HUNT (if Key exists) or
  //                    GOAL_AVAILABLE (no Key).
  //   correct=false -> phase becomes REFLECTION for REFLECTION_DWELL_MS;
  //                    on dwell expiry the tick loop reverts to VOTING.
  function _onWalkThroughQuestionDoor(sim, actor) {
    if (!sim || !actor) return;
    if (sim.phase === 'LEVEL_CLEARED') return;
    if (actor.correct === true) {
      if (hasAnyOfType(sim.levelState, 'Key')) {
        sim.phase = 'KEY_HUNT';
      } else {
        sim.phase = 'GOAL_AVAILABLE';
      }
    } else {
      sim.phase = 'REFLECTION';
      sim.reflectionTimerMs = REFLECTION_DWELL_MS;
    }
  }

  // ---------------------------------------------------------------------------
  // Export.
  // ---------------------------------------------------------------------------

  window.LE.sim = {
    PHASES: PHASES.slice(),
    DEFAULT_GOALPAD_TRIGGER_MS: DEFAULT_GOALPAD_TRIGGER_MS,
    REFLECTION_DWELL_MS: REFLECTION_DWELL_MS,

    createSim: createSim,
    tick: tick,

    movePlayer: movePlayer,
    setFakeTally: setFakeTally,

    evalPredicate: evalPredicate,
    PREDICATE_FNS: PREDICATE_FNS,

    isGateBlocking: isGateBlocking,

    _onTouchSipStation: _onTouchSipStation,
    _onTouchContextSlot: _onTouchContextSlot,
    _onTouchGoalPad: _onTouchGoalPad,
    _onTouchKey: _onTouchKey,
    _onTouchGoal: _onTouchGoal,
    _onWalkThroughQuestionDoor: _onWalkThroughQuestionDoor,
  };
})();
