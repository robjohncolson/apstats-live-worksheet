// level-editor-lint.js
// Pedagogical lint rules for v7-level-1 level editor (P2).
//
// Pure functions. No DOM. No fetch. No timers. No external deps.
// Exports a single surface on window.LE.lint:
//
//   LE.lint.runLint(state)  -- returns array of issue objects
//   LE.lint.RULES           -- ordered list of { id, name, run(state) -> [issues] }
//
// Each issue:
//   {
//     id: string,                    -- rule id (kebab-case)
//     severity: 'error' | 'warn' | 'info',
//     message: string,               -- human-readable
//     actorIndex: number | null,     -- index in scope's actors[] (or null for level-wide)
//     scope: 'main' | 'reflection'
//   }
//
// Spec: ../LEVEL_EDITOR_V1_BUILD.md (P2 -- Lint rules section).
//
// Resolved ambiguities (documented inline):
//   1. duplicate-id: flags actors sharing BOTH type AND id (per spec
//      "any (type, id) collision"). Cross-type id reuse is allowed and
//      matches the auto-id prefix system (s1, g1, ...).
//   2. overlapping-actors: only flags when two NON-Text actors share a
//      chip. Text overlays on other actors are intentional (labels).
//   3. Cross-scope rules: actor-out-of-bounds, duplicate-id,
//      overlapping-actors, and unknown-actor-type run over BOTH the
//      main and reflection_room actor arrays. Other rules are
//      main-scope only (they reference completion/spawn semantics).

(function () {
  'use strict';

  window.LE = window.LE || {};

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function getMainActors(state) {
    if (!state || !Array.isArray(state.actors)) return [];
    return state.actors;
  }

  function getReflectionActors(state) {
    if (!state || !state.reflection_room || !Array.isArray(state.reflection_room.actors)) return [];
    return state.reflection_room.actors;
  }

  function getMainMap(state) {
    if (state && state.map && isPlainObject(state.map)) return state.map;
    return { width: 0, height: 0 };
  }

  function getReflectionMap(state) {
    if (state && state.reflection_room && isPlainObject(state.reflection_room.map)) {
      return state.reflection_room.map;
    }
    return { width: 0, height: 0 };
  }

  // Resolve the model's actor type table at runtime so we don't hard-code
  // a duplicate list here (would drift from model changes).
  function knownActorTypes() {
    if (window.LE && window.LE.model && isPlainObject(window.LE.model.ACTOR_REQUIRED_PROPS)) {
      return Object.keys(window.LE.model.ACTOR_REQUIRED_PROPS);
    }
    return [];
  }

  function makeIssue(id, severity, message, actorIndex, scope) {
    return {
      id: id,
      severity: severity,
      message: message,
      actorIndex: (typeof actorIndex === 'number') ? actorIndex : null,
      scope: scope,
    };
  }

  // ---------------------------------------------------------------------------
  // Individual rules
  // ---------------------------------------------------------------------------

  // missing-player-spawn -- error
  // Triggers when state.actors[] contains zero PlayerSpawn entries.
  function ruleMissingPlayerSpawn(state) {
    var actors = getMainActors(state);
    var count = 0;
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a && a.type === 'PlayerSpawn') count++;
    }
    if (count === 0) {
      return [makeIssue(
        'missing-player-spawn',
        'error',
        'Missing PlayerSpawn: level needs at least one PlayerSpawn actor',
        null,
        'main'
      )];
    }
    return [];
  }

  // multiple-player-spawns -- warn
  // Triggers when state.actors[] contains 2 or more PlayerSpawns.
  function ruleMultiplePlayerSpawns(state) {
    var actors = getMainActors(state);
    var indices = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a && a.type === 'PlayerSpawn') indices.push(i);
    }
    if (indices.length < 2) return [];
    var issues = [];
    for (var j = 0; j < indices.length; j++) {
      issues.push(makeIssue(
        'multiple-player-spawns',
        'warn',
        'Multiple PlayerSpawns (' + indices.length + '): only the first is used at runtime',
        indices[j],
        'main'
      ));
    }
    return issues;
  }

  // actor-out-of-bounds -- error
  // Triggers when any actor has x < 0, x >= map.width, y < 0, or y >= map.height.
  // Runs over both main and reflection scopes.
  function ruleActorOutOfBounds(state) {
    var issues = [];
    issues.push.apply(issues, scopeOutOfBounds(state, 'main'));
    issues.push.apply(issues, scopeOutOfBounds(state, 'reflection'));
    return issues;
  }

  function scopeOutOfBounds(state, scope) {
    var actors = (scope === 'main') ? getMainActors(state) : getReflectionActors(state);
    var mapObj = (scope === 'main') ? getMainMap(state) : getReflectionMap(state);
    var w = isFiniteNumber(mapObj.width) ? mapObj.width : 0;
    var h = isFiniteNumber(mapObj.height) ? mapObj.height : 0;
    var issues = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a) continue;
      var x = a.x;
      var y = a.y;
      var bad = false;
      if (!isFiniteNumber(x) || x < 0 || x >= w) bad = true;
      if (!isFiniteNumber(y) || y < 0 || y >= h) bad = true;
      if (bad) {
        var label = a.type || 'actor';
        issues.push(makeIssue(
          'actor-out-of-bounds',
          'error',
          label + ' at (' + x + ', ' + y + ') is outside map bounds ' + w + 'x' + h,
          i,
          scope
        ));
      }
    }
    return issues;
  }

  // duplicate-id -- error
  // Triggers when two actors share the SAME type AND SAME id.
  // Cross-type id reuse (e.g. Gate "g1" + SipStation "g1") is allowed.
  // Only actors with an `id` field are considered.
  function ruleDuplicateId(state) {
    var issues = [];
    issues.push.apply(issues, scopeDuplicateId(state, 'main'));
    issues.push.apply(issues, scopeDuplicateId(state, 'reflection'));
    return issues;
  }

  function scopeDuplicateId(state, scope) {
    var actors = (scope === 'main') ? getMainActors(state) : getReflectionActors(state);
    var seen = {}; // key = type + '|' + id  ->  first index
    var issues = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a) continue;
      if (typeof a.id === 'undefined' || a.id === null || a.id === '') continue;
      var key = String(a.type) + '|' + String(a.id);
      if (seen[key] === undefined) {
        seen[key] = i;
        continue;
      }
      issues.push(makeIssue(
        'duplicate-id',
        'error',
        'Duplicate id "' + a.id + '" on ' + a.type + ' (first at index ' + seen[key] + ')',
        i,
        scope
      ));
    }
    return issues;
  }

  // no-advance-path -- error
  // Triggers when actors[] has a Gate with predicate `always_false` but NO
  // Gate with predicate `tally_nonzero`. Indicates no way to progress past
  // a "wrong answer" gate.
  function ruleNoAdvancePath(state) {
    var actors = getMainActors(state);
    var hasAlwaysFalse = false;
    var hasTallyNonzero = false;
    var falseIndices = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'Gate') continue;
      if (a.predicate === 'always_false') {
        hasAlwaysFalse = true;
        falseIndices.push(i);
      } else if (a.predicate === 'tally_nonzero') {
        hasTallyNonzero = true;
      }
    }
    if (!hasAlwaysFalse || hasTallyNonzero) return [];
    var issues = [];
    for (var k = 0; k < falseIndices.length; k++) {
      issues.push(makeIssue(
        'no-advance-path',
        'error',
        'No advance path: Gate with always_false predicate has no companion tally_nonzero Gate',
        falseIndices[k],
        'main'
      ));
    }
    return issues;
  }

  // question-door-no-reflection -- warn
  // Triggers on QuestionDoor with `correct: false` and missing-or-empty
  // `reflection` text.
  function ruleQuestionDoorNoReflection(state) {
    var actors = getMainActors(state);
    var issues = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'QuestionDoor') continue;
      if (a.correct === true) continue;
      var hasReflection = isNonEmptyString(a.reflection);
      if (hasReflection) continue;
      issues.push(makeIssue(
        'question-door-no-reflection',
        'warn',
        'QuestionDoor "' + (a.id || '?') + '" is wrong (correct=false) but has no reflection text',
        i,
        'main'
      ));
    }
    return issues;
  }

  // orphan-tally-chute-label -- warn
  // Triggers on a TallyChute whose `label` does not match any SipStation
  // `drink` value in the same scope.
  function ruleOrphanTallyChuteLabel(state) {
    var actors = getMainActors(state);
    var drinks = {};
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'SipStation') continue;
      if (isNonEmptyString(a.drink)) drinks[a.drink] = true;
    }
    var issues = [];
    for (var j = 0; j < actors.length; j++) {
      var c = actors[j];
      if (!c || c.type !== 'TallyChute') continue;
      var label = c.label;
      if (!isNonEmptyString(label)) continue; // missing-label is a separate concern
      if (drinks[label]) continue;
      issues.push(makeIssue(
        'orphan-tally-chute-label',
        'warn',
        'TallyChute label "' + label + '" matches no SipStation drink',
        j,
        'main'
      ));
    }
    return issues;
  }

  // completion-kind-needs-goalpad -- error
  // Triggers when completion.kind is "contextslots-lit-and-goalpad-presence"
  // but actors[] has no GoalPad.
  function ruleCompletionKindNeedsGoalPad(state) {
    if (!state || !isPlainObject(state.completion)) return [];
    if (state.completion.kind !== 'contextslots-lit-and-goalpad-presence') return [];
    var actors = getMainActors(state);
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a && a.type === 'GoalPad') return [];
    }
    return [makeIssue(
      'completion-kind-needs-goalpad',
      'error',
      'completion.kind requires a GoalPad actor but none present',
      null,
      'main'
    )];
  }

  // completion-kind-needs-goal -- error
  // Triggers when completion.kind is "lock-and-switch-state + goal-overlap"
  // but actors[] has no Goal.
  function ruleCompletionKindNeedsGoal(state) {
    if (!state || !isPlainObject(state.completion)) return [];
    if (state.completion.kind !== 'lock-and-switch-state + goal-overlap') return [];
    var actors = getMainActors(state);
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a && a.type === 'Goal') return [];
    }
    return [makeIssue(
      'completion-kind-needs-goal',
      'error',
      'completion.kind requires a Goal actor but none present',
      null,
      'main'
    )];
  }

  // overlapping-actors -- warn
  // Triggers when two NON-Text actors share the exact same (x, y) chip.
  // Text overlays are exempt because labels are commonly stacked.
  function ruleOverlappingActors(state) {
    var issues = [];
    issues.push.apply(issues, scopeOverlapping(state, 'main'));
    issues.push.apply(issues, scopeOverlapping(state, 'reflection'));
    return issues;
  }

  function scopeOverlapping(state, scope) {
    var actors = (scope === 'main') ? getMainActors(state) : getReflectionActors(state);
    var byCell = {}; // key = "x,y" -> first index of a non-Text actor
    var issues = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a) continue;
      if (a.type === 'Text') continue;
      if (!isFiniteNumber(a.x) || !isFiniteNumber(a.y)) continue;
      var key = (a.x | 0) + ',' + (a.y | 0);
      if (byCell[key] === undefined) {
        byCell[key] = i;
        continue;
      }
      issues.push(makeIssue(
        'overlapping-actors',
        'warn',
        a.type + ' overlaps another actor at (' + a.x + ', ' + a.y + ')',
        i,
        scope
      ));
    }
    return issues;
  }

  // unknown-actor-type -- warn
  // Triggers on any actor whose `type` is not in the model's known table.
  // Catches forward-compat tags and corrupted loads.
  function ruleUnknownActorType(state) {
    var known = knownActorTypes();
    if (known.length === 0) return []; // model not loaded -> skip
    var knownSet = {};
    for (var k = 0; k < known.length; k++) knownSet[known[k]] = true;

    var issues = [];
    issues.push.apply(issues, scopeUnknownType(state, 'main', knownSet));
    issues.push.apply(issues, scopeUnknownType(state, 'reflection', knownSet));
    return issues;
  }

  function scopeUnknownType(state, scope, knownSet) {
    var actors = (scope === 'main') ? getMainActors(state) : getReflectionActors(state);
    var issues = [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a) continue;
      var t = a.type;
      if (knownSet[t]) continue;
      issues.push(makeIssue(
        'unknown-actor-type',
        'warn',
        'Unknown actor type "' + String(t) + '"',
        i,
        scope
      ));
    }
    return issues;
  }

  // ---------------------------------------------------------------------------
  // Rule registry
  // ---------------------------------------------------------------------------

  var RULES = [
    { id: 'missing-player-spawn',          name: 'Missing PlayerSpawn',            run: ruleMissingPlayerSpawn },
    { id: 'multiple-player-spawns',        name: 'Multiple PlayerSpawns',          run: ruleMultiplePlayerSpawns },
    { id: 'actor-out-of-bounds',           name: 'Actor out of bounds',            run: ruleActorOutOfBounds },
    { id: 'duplicate-id',                  name: 'Duplicate (type, id)',           run: ruleDuplicateId },
    { id: 'no-advance-path',               name: 'No advance path',                run: ruleNoAdvancePath },
    { id: 'question-door-no-reflection',   name: 'Wrong QuestionDoor missing reflection', run: ruleQuestionDoorNoReflection },
    { id: 'orphan-tally-chute-label',      name: 'Orphan TallyChute label',        run: ruleOrphanTallyChuteLabel },
    { id: 'completion-kind-needs-goalpad', name: 'completion.kind needs GoalPad',  run: ruleCompletionKindNeedsGoalPad },
    { id: 'completion-kind-needs-goal',    name: 'completion.kind needs Goal',     run: ruleCompletionKindNeedsGoal },
    { id: 'overlapping-actors',            name: 'Overlapping actors',             run: ruleOverlappingActors },
    { id: 'unknown-actor-type',            name: 'Unknown actor type',             run: ruleUnknownActorType },
  ];

  // ---------------------------------------------------------------------------
  // Driver
  // ---------------------------------------------------------------------------

  function runLint(state) {
    if (!isPlainObject(state)) return [];
    var all = [];
    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      var issues;
      try {
        issues = rule.run(state);
      } catch (err) {
        // A rule throwing should never poison the whole pass.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('LE.lint: rule "' + rule.id + '" threw', err);
        }
        issues = [];
      }
      if (Array.isArray(issues)) {
        for (var j = 0; j < issues.length; j++) all.push(issues[j]);
      }
    }
    return all;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.LE.lint = {
    runLint: runLint,
    RULES: RULES,
  };
})();
