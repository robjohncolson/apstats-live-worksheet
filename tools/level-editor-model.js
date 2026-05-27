// level-editor-model.js
// Pure-JS state + schema + serialize for the v7-level-1 level editor.
//
// No DOM. No fetch. No timers. No external deps.
// Exposes a single export surface on window.LE.model.
//
// Companion files:
//   - tools/level-editor.html   (UI structure, loads this script first)
//   - tools/level-editor-render.js  (canvas rendering, owned by render agent)
//   - tools/level-editor-ui.js  (DOM glue, owned by UI agent)
//
// Spec: ../LEVEL_EDITOR_V1_BUILD.md
//
// Schema family is "v7-level-1". This module rejects anything else.

(function () {
  'use strict';

  // ---------- schema constants ----------

  var SCHEMA_VERSION = 'v7-level-1';

  // Default map for the main level (32 wide, 8 tall, 10 px per chip).
  var DEFAULT_MAP = { width: 32, height: 8, chipSize: 10 };

  // Default reflection room (always 16x8, chipSize varies in corpus
  // between 10 and 24; 10 is the modern default).
  var DEFAULT_REFLECTION_MAP = { width: 16, height: 8, chipSize: 10 };

  // Bounds (from BUILD doc -- metadata form constraints).
  var MAP_LIMITS = {
    width: { min: 8, max: 96 },
    height: { min: 4, max: 16 },
  };

  // Actor type table. Order here drives palette ordering for any
  // caller that iterates the keys (UI agent uses its own ordering).
  var ACTOR_REQUIRED_PROPS = {
    PlayerSpawn: ['x', 'y'],
    Text: ['x', 'y', 'text'],
    SipStation: ['x', 'y', 'id', 'drink'],
    TallyDisplay: ['x', 'y', 'binds'],
    TallyChute: ['x', 'y', 'id', 'label'],
    Tally: ['x', 'y', 'threshold'],
    Gate: ['x', 'y', 'id', 'label', 'predicate'],
    ContextSlot: ['x', 'y', 'id', 'label'],
    GoalPad: ['x', 'y', 'triggerMs'],
    QuestionDoor: ['x', 'y', 'id', 'text', 'correct'],
    Key: ['x', 'y', 'id'],
    Goal: ['x', 'y'],
    ReturnWarp: ['x', 'y'],
  };

  var ACTOR_OPTIONAL_PROPS = {
    PlayerSpawn: [],
    Text: [],
    SipStation: [],
    TallyDisplay: [],
    TallyChute: [],
    Tally: [],
    Gate: [],
    ContextSlot: [],
    GoalPad: [],
    QuestionDoor: ['reflection'],
    Key: [],
    Goal: [],
    ReturnWarp: [],
  };

  var ACTOR_FAMILY = {
    PlayerSpawn: 'universal',
    Text: 'universal',
    SipStation: 'mechanic',
    TallyDisplay: 'mechanic',
    TallyChute: 'mechanic',
    Tally: 'legacy',
    Gate: 'mechanic',
    ContextSlot: 'mechanic',
    GoalPad: 'mechanic',
    QuestionDoor: 'legacy',
    Key: 'legacy',
    Goal: 'legacy',
    ReturnWarp: 'reflection',
  };

  // Gate.predicate enum (only these three are accepted by the cr engine).
  var GATE_PREDICATES = [
    'always_false',
    'every_player_row_complete',
    'tally_nonzero',
  ];

  // completion.kind enum.
  var COMPLETION_KINDS = [
    'contextslots-lit-and-goalpad-presence',
    'lock-and-switch-state + goal-overlap',
  ];

  // Canonical actor key order. Anything outside this list is appended
  // alphabetically, after the canonical keys, to keep round-trips
  // deterministic when authors add forward-compat fields.
  var ACTOR_KEY_ORDER = [
    'type',
    'id',
    'x',
    'y',
    'text',
    'drink',
    'binds',
    'label',
    'threshold',
    'predicate',
    'triggerMs',
    'correct',
    'reflection',
  ];

  // Canonical top-level key order. Same forward-compat rule:
  // unknown keys are appended alphabetically.
  var TOP_LEVEL_KEY_ORDER = [
    'schema',
    'levelKey',
    'lessonKey',
    'title',
    'skill',
    'lo',
    'ek',
    'duration',
    'map',
    'actors',
    'reflection_room',
    'completion',
    'min_students',
  ];

  // Top-level scalar keys that get column-aligned values in the corpus
  // format. Only the scalar keys that appear BEFORE the first container
  // key (`map`) are aligned together. `min_students` (after `map`) gets
  // single-space-after-colon to match the corpus.
  var ALIGNED_TOP_KEYS = [
    'schema',
    'levelKey',
    'lessonKey',
    'title',
    'skill',
    'lo',
    'ek',
    'duration',
  ];

  // map.* sub-keys, also aligned.
  var ALIGNED_MAP_KEYS = ['width', 'height', 'chipSize'];

  // Column-alignment rule.
  //
  // The corpus uses per-region right-aligned key columns: every key in
  // a region is padded so the colon-plus-value is column-aligned with
  // the region's longest key. We compute the column dynamically per
  // group rather than hard-coding because empty / future-fields would
  // otherwise produce wider gaps than the corpus author intended.
  //
  // The padding rule is: take the longest "<indent>"<key>":" prefix in
  // the region, then place the value 1 space to its right. Other keys
  // pad with extra spaces to land at the same column.
  //
  // Note: the corpus itself has a 1-column discrepancy between the
  // top-level region (value at col 17) and the reflection_room region
  // (value at col 16) for purely historical reasons. We pick the
  // "longest prefix + 1 space" rule because it generalizes to any key
  // names a future schema might introduce. This means byte-for-byte
  // identity with the existing 80 files is NOT guaranteed, but the
  // output is valid, idempotent, and visually equivalent. See
  // LEVEL_EDITOR_V1_BUILD.md for the round-trip contract.
  function regionPaddingTarget(prefixes) {
    var maxLen = 0;
    for (var i = 0; i < prefixes.length; i++) {
      if (prefixes[i].length > maxLen) maxLen = prefixes[i].length;
    }
    return maxLen + 1; // +1 for the single space between ':' and value
  }

  // ---------- helpers ----------

  function deepClone(value) {
    // Plain JSON state is JSON-safe -- no Dates, no functions, no
    // circular refs. JSON parse/stringify is the simplest correct clone.
    return JSON.parse(JSON.stringify(value));
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function repeat(str, n) {
    if (n <= 0) return '';
    var out = '';
    for (var i = 0; i < n; i++) out += str;
    return out;
  }

  // ---------- state factory ----------

  function createState() {
    return {
      schema: SCHEMA_VERSION,
      levelKey: '',
      lessonKey: '',
      title: '',
      skill: '',
      lo: '',
      ek: [],
      duration: 180,
      map: { width: DEFAULT_MAP.width, height: DEFAULT_MAP.height, chipSize: DEFAULT_MAP.chipSize },
      actors: [],
      reflection_room: {
        map: { width: DEFAULT_REFLECTION_MAP.width, height: DEFAULT_REFLECTION_MAP.height, chipSize: DEFAULT_REFLECTION_MAP.chipSize },
        actors: [],
      },
      completion: {
        kind: COMPLETION_KINDS[0],
        rule: '',
      },
      min_students: 2,
    };
  }

  // ---------- accessors (copies) ----------

  function getState(state) {
    return deepClone(state);
  }

  function getActors(state, scope) {
    var actors = pickActorsArray(state, scope);
    return actors.slice();
  }

  function pickActorsArray(state, scope) {
    if (scope === 'main') return state.actors;
    if (scope === 'reflection') return state.reflection_room.actors;
    throw new Error('unknown scope: ' + scope);
  }

  function setActorsArray(state, scope, nextActors) {
    if (scope === 'main') {
      state.actors = nextActors;
      return;
    }
    if (scope === 'reflection') {
      state.reflection_room.actors = nextActors;
      return;
    }
    throw new Error('unknown scope: ' + scope);
  }

  // ---------- validation ----------

  function validateActor(actor) {
    var errors = [];
    if (!isPlainObject(actor)) {
      return { valid: false, errors: ['actor is not an object'] };
    }
    var type = actor.type;
    if (!isNonEmptyString(type)) {
      errors.push('missing type');
      return { valid: false, errors: errors };
    }
    var required = ACTOR_REQUIRED_PROPS[type];
    if (!required) {
      errors.push('unknown actor type: ' + type);
      return { valid: false, errors: errors };
    }
    for (var i = 0; i < required.length; i++) {
      var key = required[i];
      if (!(key in actor)) {
        errors.push('missing required prop: ' + key);
        continue;
      }
      var val = actor[key];
      if (key === 'x' || key === 'y' || key === 'threshold' || key === 'triggerMs') {
        if (!isFiniteNumber(val)) errors.push(key + ' must be a finite number');
      } else if (key === 'correct') {
        if (typeof val !== 'boolean') errors.push('correct must be a boolean');
      } else if (key === 'predicate') {
        if (GATE_PREDICATES.indexOf(val) === -1) {
          errors.push('predicate must be one of: ' + GATE_PREDICATES.join(', '));
        }
      } else {
        if (!isNonEmptyString(val)) errors.push(key + ' must be a non-empty string');
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validateState(state) {
    var errors = [];
    if (!isPlainObject(state)) {
      return { valid: false, errors: ['state is not an object'] };
    }
    if (state.schema !== SCHEMA_VERSION) {
      errors.push('schema must be "' + SCHEMA_VERSION + '"');
    }
    if (!isPlainObject(state.map)) {
      errors.push('map must be an object');
    } else {
      if (!isFiniteNumber(state.map.width)) errors.push('map.width must be a number');
      if (!isFiniteNumber(state.map.height)) errors.push('map.height must be a number');
      if (!isFiniteNumber(state.map.chipSize)) errors.push('map.chipSize must be a number');
    }
    if (!Array.isArray(state.actors)) {
      errors.push('actors must be an array');
    } else {
      for (var i = 0; i < state.actors.length; i++) {
        var actorResult = validateActor(state.actors[i]);
        if (!actorResult.valid) {
          errors.push('actors[' + i + ']: ' + actorResult.errors.join('; '));
        }
      }
    }
    if (!isPlainObject(state.reflection_room)) {
      errors.push('reflection_room must be an object');
    } else if (!Array.isArray(state.reflection_room.actors)) {
      errors.push('reflection_room.actors must be an array');
    }
    if (!isPlainObject(state.completion)) {
      errors.push('completion must be an object');
    } else if (COMPLETION_KINDS.indexOf(state.completion.kind) === -1) {
      errors.push('completion.kind must be one of: ' + COMPLETION_KINDS.join(', '));
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // ---------- actor mutations (pure: return NEW state) ----------

  function addActor(state, scope, actor) {
    var result = validateActor(actor);
    if (!result.valid) {
      throw new Error('addActor: ' + result.errors.join('; '));
    }
    var next = deepClone(state);
    var arr = pickActorsArray(next, scope).slice();
    arr.push(deepClone(actor));
    setActorsArray(next, scope, arr);
    return next;
  }

  function deleteActor(state, scope, index) {
    var arr = pickActorsArray(state, scope);
    if (index < 0 || index >= arr.length) {
      throw new Error('deleteActor: index out of range');
    }
    var next = deepClone(state);
    var nextArr = pickActorsArray(next, scope).slice();
    nextArr.splice(index, 1);
    setActorsArray(next, scope, nextArr);
    return next;
  }

  function moveActor(state, scope, index, newX, newY) {
    if (!isFiniteNumber(newX) || !isFiniteNumber(newY)) {
      throw new Error('moveActor: x and y must be finite numbers');
    }
    var arr = pickActorsArray(state, scope);
    if (index < 0 || index >= arr.length) {
      throw new Error('moveActor: index out of range');
    }
    var next = deepClone(state);
    var nextArr = pickActorsArray(next, scope).slice();
    var clone = deepClone(nextArr[index]);
    clone.x = Math.round(newX);
    clone.y = Math.round(newY);
    nextArr[index] = clone;
    setActorsArray(next, scope, nextArr);
    return next;
  }

  function updateActorProp(state, scope, index, propName, value) {
    if (!isNonEmptyString(propName)) {
      throw new Error('updateActorProp: propName must be a non-empty string');
    }
    var arr = pickActorsArray(state, scope);
    if (index < 0 || index >= arr.length) {
      throw new Error('updateActorProp: index out of range');
    }
    var next = deepClone(state);
    var nextArr = pickActorsArray(next, scope).slice();
    var clone = deepClone(nextArr[index]);
    clone[propName] = value;
    nextArr[index] = clone;
    setActorsArray(next, scope, nextArr);
    return next;
  }

  // ---------- metadata mutations ----------

  function updateMetadata(state, patch) {
    if (!isPlainObject(patch)) {
      throw new Error('updateMetadata: patch must be an object');
    }
    var next = deepClone(state);
    for (var key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        next[key] = deepClone(patch[key]);
      }
    }
    return next;
  }

  function resizeMap(state, scope, width, height) {
    if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
      throw new Error('resizeMap: width and height must be finite numbers');
    }
    var next = deepClone(state);
    var targetMap;
    if (scope === 'main') {
      targetMap = next.map;
    } else if (scope === 'reflection') {
      targetMap = next.reflection_room.map;
    } else {
      throw new Error('resizeMap: unknown scope: ' + scope);
    }
    var w = Math.max(MAP_LIMITS.width.min, Math.min(MAP_LIMITS.width.max, Math.round(width)));
    var h = Math.max(MAP_LIMITS.height.min, Math.min(MAP_LIMITS.height.max, Math.round(height)));
    targetMap.width = w;
    targetMap.height = h;
    var arr = pickActorsArray(next, scope);
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      if (a.x > w - 1) a.x = w - 1;
      if (a.y > h - 1) a.y = h - 1;
      if (a.x < 0) a.x = 0;
      if (a.y < 0) a.y = 0;
    }
    return next;
  }

  // ---------- undo / redo ----------

  function createHistory() {
    return { undo: [], redo: [], max: 50 };
  }

  function pushHistory(history, state) {
    if (!history || !Array.isArray(history.undo) || !Array.isArray(history.redo)) {
      throw new Error('pushHistory: invalid history');
    }
    history.undo.push(deepClone(state));
    if (history.undo.length > history.max) {
      // Drop the oldest snapshot to cap memory.
      history.undo.shift();
    }
    // A fresh action invalidates the redo stack.
    history.redo.length = 0;
  }

  function undo(history, currentState) {
    if (history.undo.length === 0) return [currentState, history];
    var prev = history.undo.pop();
    history.redo.push(deepClone(currentState));
    if (history.redo.length > history.max) history.redo.shift();
    return [prev, history];
  }

  function redo(history, currentState) {
    if (history.redo.length === 0) return [currentState, history];
    var nextState = history.redo.pop();
    history.undo.push(deepClone(currentState));
    if (history.undo.length > history.max) history.undo.shift();
    return [nextState, history];
  }

  // ---------- serialize / deserialize ----------

  // Quote a JSON string the same way JSON.stringify does (so we don't
  // hand-roll escapes incorrectly).
  function jsonString(value) {
    return JSON.stringify(String(value));
  }

  // Format a JSON value to its compact JSON form. Used for primitives
  // and the contents of an actor array on a single line.
  function jsonCompact(value) {
    return JSON.stringify(value);
  }

  // Serialize one actor as a single-line object: "{ "type": "X", "x": N, ... }".
  // Keys ordered by ACTOR_KEY_ORDER; unknown keys appended alphabetically.
  function serializeActorLine(actor) {
    var keys = orderedActorKeys(actor);
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      parts.push(jsonString(k) + ': ' + jsonCompact(actor[k]));
    }
    return '{ ' + parts.join(', ') + ' }';
  }

  function orderedActorKeys(actor) {
    // Same merge rule as orderedTopLevelKeys: canonical order for
    // known keys, unknown keys slotted after their nearest known
    // predecessor in the source's insertion order.
    return orderByCanonical(actor, ACTOR_KEY_ORDER);
  }

  // Generic canonical-then-insertion ordering. Shared by actor and
  // top-level key emission.
  function orderByCanonical(obj, canonicalOrder) {
    var insertionOrder = Object.keys(obj);
    var knownSet = Object.create(null);
    for (var i = 0; i < canonicalOrder.length; i++) {
      knownSet[canonicalOrder[i]] = true;
    }
    var result = [];
    for (var j = 0; j < canonicalOrder.length; j++) {
      var k = canonicalOrder[j];
      if (Object.prototype.hasOwnProperty.call(obj, k)) result.push(k);
    }
    for (var n = 0; n < insertionOrder.length; n++) {
      var key = insertionOrder[n];
      if (knownSet[key]) continue;
      if (result.indexOf(key) !== -1) continue;
      var anchor = null;
      for (var m = n - 1; m >= 0; m--) {
        var candidate = insertionOrder[m];
        if (knownSet[candidate] && result.indexOf(candidate) !== -1) {
          anchor = candidate;
          break;
        }
      }
      if (anchor === null) {
        result.unshift(key);
      } else {
        var anchorIdx = result.indexOf(anchor);
        result.splice(anchorIdx + 1, 0, key);
      }
    }
    return result;
  }

  // Top-level key emission order. We follow the canonical
  // TOP_LEVEL_KEY_ORDER for known keys. For unknown keys (forward-
  // compat fields like `stages` that some legacy files carry), we
  // preserve the position they had in the source object's insertion
  // order by slotting each unknown key right after its nearest known
  // predecessor.
  //
  // The result: idempotent round-trip on any input that has its known
  // keys in canonical order (which is true for the entire 80-file
  // corpus), and predictable placement for any new unknown key the
  // schema gains later.
  function orderedTopLevelKeys(state) {
    return orderByCanonical(state, TOP_LEVEL_KEY_ORDER);
  }

  // Build the "<indent>"<key>":" prefix used both for measuring column
  // widths and for emitting a line.
  function linePrefix(indent, key) {
    return repeat(' ', indent) + jsonString(key) + ':';
  }

  // Pad an aligned line to a target column. Falls back to a single
  // space if the prefix already exceeds the target (e.g. very long keys).
  function alignedLine(indent, key, valueStr, targetCol) {
    var prefix = linePrefix(indent, key);
    var padCount = targetCol - prefix.length;
    if (padCount < 1) padCount = 1;
    return prefix + repeat(' ', padCount) + valueStr;
  }

  function unalignedLine(indent, key, valueStr) {
    return linePrefix(indent, key) + ' ' + valueStr;
  }

  function serializeMapMultiline(mapObj, indent) {
    var presentKeys = [];
    for (var i = 0; i < ALIGNED_MAP_KEYS.length; i++) {
      var k = ALIGNED_MAP_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(mapObj, k)) presentKeys.push(k);
    }
    var prefixes = presentKeys.map(function (k) { return linePrefix(indent + 2, k); });
    var targetCol = regionPaddingTarget(prefixes);
    var lines = ['{'];
    for (var j = 0; j < presentKeys.length; j++) {
      var key = presentKeys[j];
      var valStr = jsonCompact(mapObj[key]);
      var line = alignedLine(indent + 2, key, valStr, targetCol);
      if (j < presentKeys.length - 1) line += ',';
      lines.push(line);
    }
    lines.push(repeat(' ', indent) + '}');
    return lines.join('\n');
  }

  // Inline (single-line) map for reflection_room.map: produces
  // `{ "width": 16, "height": 8, "chipSize": 10 }`. Matches the corpus
  // where the reflection_room's map is always rendered on one line.
  function serializeMapInline(mapObj) {
    var parts = [];
    for (var i = 0; i < ALIGNED_MAP_KEYS.length; i++) {
      var k = ALIGNED_MAP_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(mapObj, k)) {
        parts.push(jsonString(k) + ': ' + jsonCompact(mapObj[k]));
      }
    }
    return '{ ' + parts.join(', ') + ' }';
  }

  function serializeActorArray(actors, indent) {
    if (!actors || actors.length === 0) return '[]';
    var lines = ['['];
    for (var i = 0; i < actors.length; i++) {
      var line = repeat(' ', indent + 2) + serializeActorLine(actors[i]);
      if (i < actors.length - 1) line += ',';
      lines.push(line);
    }
    lines.push(repeat(' ', indent) + ']');
    return lines.join('\n');
  }

  function serializeReflectionRoom(rr, indent) {
    var alignedKeys = ['map', 'actors'];
    var presentKeys = orderByCanonical(rr, alignedKeys);

    var alignedPresentKeys = presentKeys.filter(function (k) { return alignedKeys.indexOf(k) !== -1; });
    var prefixes = alignedPresentKeys.map(function (k) { return linePrefix(indent + 2, k); });
    var targetCol = regionPaddingTarget(prefixes);

    var lines = ['{'];
    for (var j = 0; j < presentKeys.length; j++) {
      var key = presentKeys[j];
      var valStr;
      if (key === 'map') {
        valStr = serializeMapInline(rr.map);
      } else if (key === 'actors') {
        valStr = serializeActorArray(rr.actors, indent + 2);
      } else {
        valStr = jsonCompact(rr[key]);
      }
      var line;
      if (alignedKeys.indexOf(key) !== -1) {
        line = alignedLine(indent + 2, key, valStr, targetCol);
      } else {
        line = unalignedLine(indent + 2, key, valStr);
      }
      if (j < presentKeys.length - 1) line += ',';
      lines.push(line);
    }
    lines.push(repeat(' ', indent) + '}');
    return lines.join('\n');
  }

  function serializeCompletion(comp, indent) {
    var presentKeys = orderByCanonical(comp, ['kind', 'rule']);
    var lines = ['{'];
    for (var j = 0; j < presentKeys.length; j++) {
      var key = presentKeys[j];
      var line = unalignedLine(indent + 2, key, jsonCompact(comp[key]));
      if (j < presentKeys.length - 1) line += ',';
      lines.push(line);
    }
    lines.push(repeat(' ', indent) + '}');
    return lines.join('\n');
  }

  function serialize(state) {
    var stateClone = deepClone(state);
    var keys = orderedTopLevelKeys(stateClone);

    // Compute the aligned target column from the keys actually present
    // in the head scalar group.
    var alignedPresentKeys = keys.filter(function (k) { return ALIGNED_TOP_KEYS.indexOf(k) !== -1; });
    var prefixes = alignedPresentKeys.map(function (k) { return linePrefix(2, k); });
    var targetCol = regionPaddingTarget(prefixes);

    var lines = ['{'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var valStr;
      if (key === 'map') {
        valStr = serializeMapMultiline(stateClone.map, 2);
      } else if (key === 'actors') {
        valStr = serializeActorArray(stateClone.actors, 2);
      } else if (key === 'reflection_room') {
        valStr = serializeReflectionRoom(stateClone.reflection_room, 2);
      } else if (key === 'completion') {
        valStr = serializeCompletion(stateClone.completion, 2);
      } else {
        valStr = jsonCompact(stateClone[key]);
      }

      var line;
      if (ALIGNED_TOP_KEYS.indexOf(key) !== -1) {
        line = alignedLine(2, key, valStr, targetCol);
      } else {
        line = unalignedLine(2, key, valStr);
      }
      if (i < keys.length - 1) line += ',';
      lines.push(line);
    }
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  function deserialize(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error('deserialize: invalid JSON: ' + err.message);
    }
    if (!isPlainObject(parsed)) {
      throw new Error('deserialize: top-level value must be an object');
    }
    if (parsed.schema !== SCHEMA_VERSION) {
      throw new Error('deserialize: schema must be "' + SCHEMA_VERSION + '", got "' + parsed.schema + '"');
    }
    // Fill in any missing required structural fields with defaults so
    // the rest of the model can rely on them existing.
    if (!isPlainObject(parsed.map)) parsed.map = { width: DEFAULT_MAP.width, height: DEFAULT_MAP.height, chipSize: DEFAULT_MAP.chipSize };
    if (!Array.isArray(parsed.actors)) parsed.actors = [];
    if (!isPlainObject(parsed.reflection_room)) {
      parsed.reflection_room = {
        map: { width: DEFAULT_REFLECTION_MAP.width, height: DEFAULT_REFLECTION_MAP.height, chipSize: DEFAULT_REFLECTION_MAP.chipSize },
        actors: [],
      };
    } else {
      if (!isPlainObject(parsed.reflection_room.map)) {
        parsed.reflection_room.map = { width: DEFAULT_REFLECTION_MAP.width, height: DEFAULT_REFLECTION_MAP.height, chipSize: DEFAULT_REFLECTION_MAP.chipSize };
      }
      if (!Array.isArray(parsed.reflection_room.actors)) parsed.reflection_room.actors = [];
    }
    if (!isPlainObject(parsed.completion)) parsed.completion = { kind: COMPLETION_KINDS[0], rule: '' };
    if (!isFiniteNumber(parsed.min_students)) parsed.min_students = 2;
    return parsed;
  }

  // ---------- export ----------

  var LE = (typeof window !== 'undefined' ? window : globalThis).LE || {};
  LE.model = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_MAP: deepClone(DEFAULT_MAP),
    DEFAULT_REFLECTION_MAP: deepClone(DEFAULT_REFLECTION_MAP),
    MAP_LIMITS: deepClone(MAP_LIMITS),

    ACTOR_REQUIRED_PROPS: deepClone(ACTOR_REQUIRED_PROPS),
    ACTOR_OPTIONAL_PROPS: deepClone(ACTOR_OPTIONAL_PROPS),
    ACTOR_FAMILY: deepClone(ACTOR_FAMILY),
    GATE_PREDICATES: GATE_PREDICATES.slice(),
    COMPLETION_KINDS: COMPLETION_KINDS.slice(),

    createState: createState,
    getState: getState,
    getActors: getActors,

    addActor: addActor,
    deleteActor: deleteActor,
    moveActor: moveActor,
    updateActorProp: updateActorProp,

    updateMetadata: updateMetadata,
    resizeMap: resizeMap,

    serialize: serialize,
    deserialize: deserialize,

    createHistory: createHistory,
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,

    validateActor: validateActor,
    validateState: validateState,
  };

  if (typeof window !== 'undefined') {
    window.LE = LE;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.LE = LE;
  }

  // Node / CommonJS export for test runners (vitest under jsdom can
  // also reach window.LE, but exposing on module.exports is harmless
  // and keeps the API discoverable for tools that don't use a global).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LE.model;
  }
})();
