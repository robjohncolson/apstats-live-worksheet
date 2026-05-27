// level-editor-ui.js
// DOM wiring + interaction handlers + render-loop orchestration for the
// v1 level editor. Reads from window.LE.model + window.LE.render.
//
// Scope:
//   - Bootstraps the editor (atlas, sprite regions, palette icons, first render)
//   - Wires palette buttons, grid canvas, props form, metadata form, tabs,
//     camera slider, bottom toolbar, file picker, toast, keyboard shortcuts
//   - Owns hover ghost, selection, drag, right-click menu
//   - Exposes window.LE.ui.init + window.LE.ui._test for jsdom drivers
//
// Pure browser JS. No imports. No external deps. ES2020+ syntax.

(function () {
  'use strict';

  window.LE = window.LE || {};

  // ---------------------------------------------------------------------------
  // Constants -- shared with render layer for consistency.
  // ---------------------------------------------------------------------------

  // The render layer publishes EDITOR_CHIP_PX + GRID_*_PAD; we read them at
  // boot rather than hard-coding so a render-layer tweak does not desync UI.
  var CHIP_PX = 30;
  var GRID_LEFT_PAD = 20;
  var GRID_TOP_PAD = 20;

  var CAMERA_WIDTH = 64;

  // Palette letter prefixes for auto-id generation. Each new actor of a
  // given type gets `<prefix><N>` where N = (count + 1).
  var ID_PREFIX = {
    SipStation: 's',
    Gate: 'g',
    TallyChute: 't',
    ContextSlot: 'c',
    QuestionDoor: 'q',
    Key: 'k',
  };

  // Reflection-tab palette filter -- only these actor types are placeable in
  // the reflection room sub-tab.
  var REFLECTION_ALLOWED = { Text: true, ReturnWarp: true };

  // Toast auto-hide delay (ms).
  var TOAST_HIDE_MS = 3000;

  // Launch-in-cockpit target URL. The levelKey is appended as the
  // ?devActivity= parameter at click time.
  var LAUNCH_BASE_URL = 'https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html';
  var LAUNCH_YEAR = 'SY26-27';

  // ---------------------------------------------------------------------------
  // Module state.
  // ---------------------------------------------------------------------------

  var state = null;          // current LE.model state
  var history = null;        // current LE.model history
  var activeTool = null;     // actor type string, or null = select mode
  var activeScope = 'main';  // 'main' | 'reflection'
  var selectedActor = null;  // { scope, index } | null
  var dragState = null;      // { startChipX, startChipY, lastChipX, lastChipY, baseX, baseY }
  var cameraStart = 0;       // chip-x of the camera window's left edge
  var hoverChip = null;      // { x, y } | null -- last mousemove chip
  var contextMenu = null;    // DOM node for the floating context menu, or null
  var renderRequested = false; // RAF dedupe flag
  var lastLintResult = [];   // Most recent LE.lint.runLint() output (for tests + dedupe)
  var stateMutatedSinceLastLint = false; // gate auto-lint so it doesn't fire per-frame

  // P3 -- sim mode state. Off by default; flipped by handleSimPlayToggle.
  // When simActive is true: actor placement is disabled, arrow keys move
  // the player avatar instead of nudging the selected actor, the warnings
  // panel is hidden, and the paint loop overlays the avatar + phase HUD.
  var simActive = false;
  var sim = null;
  var simRafId = null;
  var simLastTickMs = 0;

  // DOM references (populated by cacheDom on init).
  var dom = {};

  // ---------------------------------------------------------------------------
  // Entry point.
  // ---------------------------------------------------------------------------

  function init() {
    if (!window.LE || !window.LE.model || !window.LE.render) {
      console.error('LE.ui.init: missing LE.model or LE.render');
      return;
    }

    // Pull live constants from the render layer so we stay in sync.
    if (typeof LE.render.EDITOR_CHIP_PX === 'number') CHIP_PX = LE.render.EDITOR_CHIP_PX;
    if (typeof LE.render.GRID_LEFT_PAD === 'number') GRID_LEFT_PAD = LE.render.GRID_LEFT_PAD;
    if (typeof LE.render.GRID_TOP_PAD === 'number') GRID_TOP_PAD = LE.render.GRID_TOP_PAD;

    state = LE.model.createState();
    history = LE.model.createHistory();
    activeTool = null;
    activeScope = 'main';
    selectedActor = null;
    dragState = null;
    cameraStart = 0;
    hoverChip = null;

    cacheDom();
    if (!dom.canvas) {
      console.error('LE.ui.init: #le-grid canvas not found');
      return;
    }

    setupAtlas();
    wireMetadataForm();
    wirePaletteButtons();
    wireGridCanvas();
    wireTabs();
    wireCameraSlider();
    wireBottomToolbar();
    wireSimToolbar();
    wireKeyboard();
    wireWindowMouseup();

    syncMetadataFormFromState();
    syncCameraSliderFromState();
    closeContextMenu();
    showPropsEmpty();

    // First paint -- even before sprite regions load, we want a visible grid.
    render();
  }

  function cacheDom() {
    dom.atlas = document.getElementById('le-atlas');
    dom.canvas = document.getElementById('le-grid');
    dom.gridWrap = document.getElementById('le-grid-wrap');
    dom.cameraWrap = document.getElementById('le-camera-slider-wrap');
    dom.cameraSlider = document.getElementById('le-camera-slider');
    dom.metadata = document.getElementById('le-metadata');
    dom.tabMain = document.getElementById('le-tab-main');
    dom.tabReflection = document.getElementById('le-tab-reflection');
    dom.btnSave = document.getElementById('le-btn-save');
    dom.btnLoad = document.getElementById('le-btn-load');
    dom.btnUndo = document.getElementById('le-btn-undo');
    dom.btnRedo = document.getElementById('le-btn-redo');
    dom.btnCopy = document.getElementById('le-btn-copy-json');
    dom.btnLaunch = document.getElementById('le-btn-launch');
    dom.fileInput = document.getElementById('le-file-input');
    dom.toast = document.getElementById('le-toast');
    dom.warnings = document.getElementById('le-warnings');
    dom.warningsHeader = document.getElementById('le-warnings-header');
    dom.warningsList = document.getElementById('le-warnings-list');
    dom.propsEmpty = document.getElementById('le-props-empty');
    dom.propsForm = document.getElementById('le-props-form');
    dom.paletteEntries = document.querySelectorAll('.le-palette-entry');
    dom.paletteGroups = {
      mechanic: document.getElementById('le-palette-mechanic'),
      legacy: document.getElementById('le-palette-legacy'),
      universal: document.getElementById('le-palette-universal'),
    };
    dom.metaSchema = document.getElementById('le-meta-schema');
    dom.metaLevelKey = document.getElementById('le-meta-levelKey');
    dom.metaLessonKey = document.getElementById('le-meta-lessonKey');
    dom.metaTitle = document.getElementById('le-meta-title');
    dom.metaSkill = document.getElementById('le-meta-skill');
    dom.metaLo = document.getElementById('le-meta-lo');
    dom.metaEk = document.getElementById('le-meta-ek');
    dom.metaDuration = document.getElementById('le-meta-duration');
    dom.metaWidth = document.getElementById('le-meta-width');
    dom.metaHeight = document.getElementById('le-meta-height');
    dom.metaChipSize = document.getElementById('le-meta-chipSize');
    dom.metaMinStudents = document.getElementById('le-meta-min-students');
    dom.metaCompletionKind = document.getElementById('le-meta-completion-kind');
    dom.metaCompletionRule = document.getElementById('le-meta-completion-rule');
    // P3 sim toolbar. All four optional -- defensively handled if absent.
    dom.simToolbar = document.getElementById('le-sim-toolbar');
    dom.btnSimPlay = document.getElementById('le-btn-sim-play');
    dom.simPhase = document.getElementById('le-sim-phase');
    dom.simFakeTally = document.getElementById('le-sim-fake-tally');
    dom.simReset = document.getElementById('le-sim-reset');
  }

  // ---------------------------------------------------------------------------
  // Atlas + palette icons.
  // ---------------------------------------------------------------------------

  function setupAtlas() {
    if (dom.atlas) LE.render.setAtlas(dom.atlas);
    // If the atlas image was still decoding when setAtlas ran, the renderer
    // fires 'le-atlas-ready' on window when it finishes. Repaint palette +
    // grid on that signal so atlas-backed actors don't stay as red "?" boxes.
    window.addEventListener('le-atlas-ready', function () {
      populatePaletteIcons();
      render();
    });
    // Sprite regions are async (fetch). If it fails we still paint -- the
    // render layer falls back to red "?" boxes.
    var spritePromise = LE.render.loadSpriteRegions
      ? LE.render.loadSpriteRegions()
      : Promise.resolve({});
    spritePromise.then(function () {
      populatePaletteIcons();
      render();
    }).catch(function (err) {
      console.warn('LE.ui: sprite regions failed to load', err);
      populatePaletteIcons();
      render();
    });
  }

  function populatePaletteIcons() {
    if (!dom.paletteEntries) return;
    for (var i = 0; i < dom.paletteEntries.length; i++) {
      var entry = dom.paletteEntries[i];
      var type = entry.getAttribute('data-actor-type');
      var slot = entry.querySelector('.le-palette-entry-sprite');
      if (!type || !slot) continue;
      replaceSlotWithIcon(slot, type);
    }
  }

  function replaceSlotWithIcon(slot, type) {
    // Replace the empty sprite slot with a mini canvas that draws a sample
    // of the actor. 32x32 to match the CSS slot dimensions in the layout.
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.style.display = 'block';
    canvas.style.width = '32px';
    canvas.style.height = '32px';
    canvas.className = 'le-palette-entry-sprite';
    if (slot.parentNode) slot.parentNode.replaceChild(canvas, slot);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var sampleActor = buildSampleActor(type);
    try {
      LE.render.drawActor(ctx, sampleActor, 0, 0, { chipPx: 32, scale: 1 });
    } catch (err) {
      // Render failures shouldn't break the palette -- the entry stays clickable.
      console.warn('LE.ui: palette icon render failed for ' + type, err);
    }
  }

  function buildSampleActor(type) {
    // Sample data is for rendering only -- never enters state.
    var base = { type: type, x: 0, y: 0 };
    switch (type) {
      case 'SipStation': base.id = 's0'; base.drink = 'A'; break;
      case 'TallyChute': base.id = 't0'; base.label = 'A'; break;
      case 'TallyDisplay': base.binds = 'tally.sips'; break;
      case 'Tally': base.threshold = 3; break;
      case 'Gate': base.id = 'g0'; base.label = ''; base.predicate = 'always_false'; break;
      case 'ContextSlot': base.id = 'c0'; base.label = ''; break;
      case 'GoalPad': base.triggerMs = 1500; break;
      case 'QuestionDoor': base.id = 'q0'; base.text = ''; base.correct = false; break;
      case 'Key': base.id = 'k0'; break;
      case 'Text': base.text = 'T'; break;
      default: break;
    }
    return base;
  }

  // ---------------------------------------------------------------------------
  // Palette wiring.
  // ---------------------------------------------------------------------------

  function wirePaletteButtons() {
    if (!dom.paletteEntries) return;
    for (var i = 0; i < dom.paletteEntries.length; i++) {
      (function (entry) {
        entry.addEventListener('click', function () {
          var type = entry.getAttribute('data-actor-type');
          if (!type) return;
          handlePaletteClick(type);
        });
      })(dom.paletteEntries[i]);
    }
  }

  function handlePaletteClick(type) {
    if (simActive) {
      // Placement is disabled during sim playback. The palette buttons
      // stay clickable but no-op so the user gets predictable behavior.
      return;
    }
    if (activeScope === 'reflection' && !REFLECTION_ALLOWED[type]) {
      showToast('Reflection room only accepts Text or ReturnWarp', 'info');
      return;
    }
    if (activeTool === type) {
      // Toggle off when clicking the active entry again.
      activeTool = null;
    } else {
      activeTool = type;
    }
    syncPaletteActiveState();
    render();
  }

  function syncPaletteActiveState() {
    if (!dom.paletteEntries) return;
    for (var i = 0; i < dom.paletteEntries.length; i++) {
      var entry = dom.paletteEntries[i];
      var type = entry.getAttribute('data-actor-type');
      if (type === activeTool) {
        entry.classList.add('is-active');
      } else {
        entry.classList.remove('is-active');
      }
    }
  }

  function applyReflectionPaletteFilter() {
    if (!dom.paletteEntries) return;
    var isReflection = activeScope === 'reflection';
    for (var i = 0; i < dom.paletteEntries.length; i++) {
      var entry = dom.paletteEntries[i];
      var type = entry.getAttribute('data-actor-type');
      if (isReflection && !REFLECTION_ALLOWED[type]) {
        entry.style.display = 'none';
      } else {
        entry.style.display = '';
      }
    }
    // If the active tool is now hidden, clear it.
    if (isReflection && activeTool && !REFLECTION_ALLOWED[activeTool]) {
      activeTool = null;
      syncPaletteActiveState();
    }
  }

  // ---------------------------------------------------------------------------
  // Grid canvas wiring.
  // ---------------------------------------------------------------------------

  function wireGridCanvas() {
    if (!dom.canvas) return;
    dom.canvas.addEventListener('mousemove', handleCanvasMouseMove);
    dom.canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    dom.canvas.addEventListener('mousedown', handleCanvasMouseDown);
    dom.canvas.addEventListener('click', handleCanvasClick);
    dom.canvas.addEventListener('contextmenu', handleCanvasContextMenu);
  }

  // Bound on the window so a mouseup outside the canvas still commits a drag.
  function wireWindowMouseup() {
    window.addEventListener('mouseup', handleWindowMouseUp);
  }

  // Convert a MouseEvent on the canvas to chip coords. Returns null if the
  // resulting chip is outside the current map.
  function eventToChip(ev) {
    if (!dom.canvas) return null;
    var rect = dom.canvas.getBoundingClientRect();
    var px = ev.clientX - rect.left;
    var py = ev.clientY - rect.top;
    var chipX = Math.floor((px - GRID_LEFT_PAD) / CHIP_PX);
    var chipY = Math.floor((py - GRID_TOP_PAD) / CHIP_PX);
    var mapW = currentMap().width;
    var mapH = currentMap().height;
    if (chipX < 0 || chipY < 0 || chipX >= mapW || chipY >= mapH) return null;
    return { x: chipX, y: chipY };
  }

  function handleCanvasMouseMove(ev) {
    var chip = eventToChip(ev);
    hoverChip = chip;

    // If we are mid-drag, track the latest chip but do not commit yet.
    if (dragState && chip) {
      dragState.lastChipX = chip.x;
      dragState.lastChipY = chip.y;
      // Preview by moving the actor in a temporary clone -- we touch state
      // directly so the renderer sees the move; commit on mouseup pushes
      // history exactly once.
      if (selectedActor) {
        var arr = scopeActors(state, selectedActor.scope);
        var a = arr[selectedActor.index];
        if (a) {
          a.x = chip.x;
          a.y = chip.y;
        }
      }
    }
    render();
  }

  function handleCanvasMouseLeave() {
    hoverChip = null;
    render();
  }

  function handleCanvasMouseDown(ev) {
    if (ev.button !== 0) return; // only left button starts a drag
    if (simActive) return; // sim mode disables drag-to-move actors
    closeContextMenu();
    if (activeTool) return; // placing, not dragging

    var chip = eventToChip(ev);
    if (!chip) return;
    var hit = hitTestActorAt(activeScope, chip.x, chip.y);
    if (hit === -1) {
      // Click on empty -- selection clears on click handler too; nothing to drag.
      return;
    }
    // Select the actor (so the drag has a target) and prep drag state.
    selectActor(activeScope, hit);
    var actor = scopeActors(state, activeScope)[hit];
    dragState = {
      startChipX: chip.x,
      startChipY: chip.y,
      lastChipX: chip.x,
      lastChipY: chip.y,
      baseX: actor.x,
      baseY: actor.y,
    };
  }

  function handleCanvasClick(ev) {
    if (ev.button !== 0) return;
    if (simActive) return; // sim mode disables grid clicks (placement + selection)
    closeContextMenu();
    var chip = eventToChip(ev);
    if (!chip) return;

    // Active-tool path -- place a new actor and short-circuit.
    if (activeTool) {
      placeActorAt(activeTool, chip.x, chip.y);
      return;
    }

    // No active tool -- selection.
    var hit = hitTestActorAt(activeScope, chip.x, chip.y);
    if (hit === -1) {
      // Clicked empty chip -- clear selection.
      clearSelection();
      render();
      return;
    }
    selectActor(activeScope, hit);
    render();
  }

  function handleCanvasContextMenu(ev) {
    ev.preventDefault();
    if (simActive) return; // sim mode disables right-click context menu
    var chip = eventToChip(ev);
    if (!chip) return;
    var hit = hitTestActorAt(activeScope, chip.x, chip.y);
    if (hit === -1) return;
    selectActor(activeScope, hit);
    openContextMenu(ev.clientX, ev.clientY);
    render();
  }

  function handleWindowMouseUp(ev) {
    if (!dragState) return;
    // Commit the drag via the model. The preview during mousemove mutated
    // state in-place; we need a clean history snapshot of the PRE-drag state
    // plus a model-blessed apply of the new coords.
    var moveTo = { x: dragState.lastChipX, y: dragState.lastChipY };
    var base = { x: dragState.baseX, y: dragState.baseY };
    dragState = null;

    if (!selectedActor) {
      render();
      return;
    }
    // No-op drag: skip history entirely.
    if (moveTo.x === base.x && moveTo.y === base.y) {
      render();
      return;
    }

    // Restore the pre-drag position in state (the preview was a transient
    // peek), push history with the pre-drag snapshot, then apply via model.
    var arr = scopeActors(state, selectedActor.scope);
    var a = arr[selectedActor.index];
    if (a) {
      a.x = base.x;
      a.y = base.y;
    }
    pushHistorySnapshot();
    var nextState = LE.model.moveActor(state, selectedActor.scope, selectedActor.index, moveTo.x, moveTo.y);
    state = nextState;
    rebuildPropsForm();
    render();
  }

  // ---------------------------------------------------------------------------
  // Hit-test + selection.
  // ---------------------------------------------------------------------------

  function hitTestActorAt(scope, chipX, chipY) {
    var arr = scopeActors(state, scope);
    // Reverse iterate so the last-drawn (top) actor wins.
    for (var i = arr.length - 1; i >= 0; i--) {
      var a = arr[i];
      if (!a) continue;
      if ((a.x | 0) === chipX && (a.y | 0) === chipY) return i;
    }
    return -1;
  }

  function selectActor(scope, index) {
    selectedActor = { scope: scope, index: index };
    rebuildPropsForm();
  }

  function clearSelection() {
    selectedActor = null;
    showPropsEmpty();
  }

  // ---------------------------------------------------------------------------
  // Place / mutate actors.
  // ---------------------------------------------------------------------------

  function placeActorAt(type, chipX, chipY) {
    if (activeScope === 'reflection' && !REFLECTION_ALLOWED[type]) {
      showToast('Reflection room only accepts Text or ReturnWarp', 'info');
      return;
    }
    var actor = buildDefaultActor(type, chipX, chipY, activeScope);
    var validation = LE.model.validateActor(actor);
    if (!validation.valid) {
      showToast('Cannot place: ' + validation.errors.join('; '), 'error');
      return;
    }
    pushHistorySnapshot();
    state = LE.model.addActor(state, activeScope, actor);
    // Select the freshly placed actor (last in the array).
    var arr = scopeActors(state, activeScope);
    selectActor(activeScope, arr.length - 1);
    render();
  }

  function buildDefaultActor(type, x, y, scope) {
    var actor = { type: type, x: x, y: y };
    switch (type) {
      case 'PlayerSpawn':
        return actor;
      case 'Text':
        actor.text = 'Welcome';
        return actor;
      case 'SipStation':
        actor.id = autoId(type, scope);
        actor.drink = 'A';
        return actor;
      case 'TallyDisplay':
        actor.binds = 'tally.sips';
        return actor;
      case 'TallyChute':
        actor.id = autoId(type, scope);
        actor.label = 'A';
        return actor;
      case 'Tally':
        actor.threshold = 3;
        return actor;
      case 'Gate':
        actor.id = autoId(type, scope);
        actor.label = 'New gate';
        actor.predicate = 'always_false';
        return actor;
      case 'ContextSlot':
        actor.id = autoId(type, scope);
        actor.label = 'New context slot';
        return actor;
      case 'GoalPad':
        actor.triggerMs = 1500;
        return actor;
      case 'QuestionDoor':
        actor.id = autoId(type, scope);
        actor.text = 'New question';
        actor.correct = false;
        actor.reflection = '';
        return actor;
      case 'Key':
        actor.id = autoId(type, scope);
        return actor;
      case 'Goal':
        return actor;
      case 'ReturnWarp':
        return actor;
      default:
        return actor;
    }
  }

  function autoId(type, scope) {
    var prefix = ID_PREFIX[type] || type.charAt(0).toLowerCase();
    var arr = scopeActors(state, scope);
    var count = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].type === type) count++;
    }
    return prefix + (count + 1);
  }

  function deleteSelectedActor() {
    if (!selectedActor) return;
    pushHistorySnapshot();
    state = LE.model.deleteActor(state, selectedActor.scope, selectedActor.index);
    clearSelection();
    closeContextMenu();
    render();
  }

  function duplicateSelectedActor() {
    if (!selectedActor) return;
    var arr = scopeActors(state, selectedActor.scope);
    var orig = arr[selectedActor.index];
    if (!orig) return;
    var copy = JSON.parse(JSON.stringify(orig));
    // Shift by 1 chip so the duplicate is visible; clamp to map bounds.
    var mapW = scopeMap(state, selectedActor.scope).width;
    var mapH = scopeMap(state, selectedActor.scope).height;
    copy.x = Math.min(mapW - 1, (copy.x | 0) + 1);
    copy.y = Math.min(mapH - 1, (copy.y | 0) + 1);
    // Regenerate id when the type has an auto-id prefix.
    if (ID_PREFIX[copy.type]) {
      copy.id = autoId(copy.type, selectedActor.scope);
    }
    pushHistorySnapshot();
    state = LE.model.addActor(state, selectedActor.scope, copy);
    var newArr = scopeActors(state, selectedActor.scope);
    selectActor(selectedActor.scope, newArr.length - 1);
    closeContextMenu();
    render();
  }

  function editSelectedActorId() {
    if (!selectedActor) return;
    var arr = scopeActors(state, selectedActor.scope);
    var orig = arr[selectedActor.index];
    if (!orig || typeof orig.id === 'undefined') {
      showToast('This actor has no id field', 'info');
      closeContextMenu();
      return;
    }
    var next = window.prompt('Edit id:', String(orig.id));
    closeContextMenu();
    if (next === null) return;
    var trimmed = next.trim();
    if (trimmed.length === 0) {
      showToast('id cannot be empty', 'error');
      return;
    }
    pushHistorySnapshot();
    state = LE.model.updateActorProp(state, selectedActor.scope, selectedActor.index, 'id', trimmed);
    rebuildPropsForm();
    render();
  }

  function nudgeSelectedActor(dx, dy) {
    if (!selectedActor) return;
    var arr = scopeActors(state, selectedActor.scope);
    var a = arr[selectedActor.index];
    if (!a) return;
    var mapW = scopeMap(state, selectedActor.scope).width;
    var mapH = scopeMap(state, selectedActor.scope).height;
    var nx = Math.max(0, Math.min(mapW - 1, (a.x | 0) + dx));
    var ny = Math.max(0, Math.min(mapH - 1, (a.y | 0) + dy));
    if (nx === (a.x | 0) && ny === (a.y | 0)) return;
    pushHistorySnapshot();
    state = LE.model.moveActor(state, selectedActor.scope, selectedActor.index, nx, ny);
    rebuildPropsForm();
    render();
  }

  // ---------------------------------------------------------------------------
  // Props form.
  // ---------------------------------------------------------------------------

  function showPropsEmpty() {
    if (dom.propsEmpty) dom.propsEmpty.style.display = '';
    if (dom.propsForm) {
      dom.propsForm.classList.remove('is-active');
      dom.propsForm.innerHTML = '';
    }
  }

  function rebuildPropsForm() {
    if (!selectedActor) {
      showPropsEmpty();
      return;
    }
    var arr = scopeActors(state, selectedActor.scope);
    var actor = arr[selectedActor.index];
    if (!actor) {
      clearSelection();
      return;
    }
    if (dom.propsEmpty) dom.propsEmpty.style.display = 'none';
    if (!dom.propsForm) return;
    dom.propsForm.classList.add('is-active');
    dom.propsForm.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'le-props-header';
    header.textContent = actor.type;
    dom.propsForm.appendChild(header);

    var required = (LE.model.ACTOR_REQUIRED_PROPS[actor.type] || []).slice();
    var optional = (LE.model.ACTOR_OPTIONAL_PROPS[actor.type] || []).slice();

    for (var i = 0; i < required.length; i++) {
      dom.propsForm.appendChild(buildPropField(actor, required[i], true));
    }
    for (var j = 0; j < optional.length; j++) {
      // Skip optional keys that duplicate a required key (defensive).
      if (required.indexOf(optional[j]) !== -1) continue;
      dom.propsForm.appendChild(buildPropField(actor, optional[j], false));
    }
  }

  function buildPropField(actor, propName, required) {
    var field = document.createElement('div');
    field.className = 'le-props-field';
    field.setAttribute('data-prop', propName);

    var label = document.createElement('label');
    label.textContent = propName;
    if (required) {
      var req = document.createElement('span');
      req.className = 'le-required';
      req.textContent = '*';
      label.appendChild(req);
    }
    field.appendChild(label);

    var input = buildPropInput(actor, propName);
    field.appendChild(input);
    return field;
  }

  function buildPropInput(actor, propName) {
    var input;
    var value = actor[propName];

    if (propName === 'predicate') {
      input = document.createElement('select');
      var predicates = LE.model.GATE_PREDICATES || [];
      for (var i = 0; i < predicates.length; i++) {
        var opt = document.createElement('option');
        opt.value = predicates[i];
        opt.textContent = predicates[i];
        if (predicates[i] === value) opt.selected = true;
        input.appendChild(opt);
      }
      bindPropChange(input, actor, propName, 'string');
      return input;
    }

    if (propName === 'correct') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value === true;
      bindPropChange(input, actor, propName, 'boolean');
      return input;
    }

    if (propName === 'text' || propName === 'reflection') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.value = (typeof value === 'string') ? value : '';
      bindPropChange(input, actor, propName, 'string');
      return input;
    }

    if (propName === 'x' || propName === 'y' || propName === 'threshold' || propName === 'triggerMs') {
      input = document.createElement('input');
      input.type = 'number';
      input.step = (propName === 'triggerMs') ? '100' : '1';
      input.value = (typeof value === 'number') ? String(value) : '';
      bindPropChange(input, actor, propName, 'number');
      return input;
    }

    // Default text input (id, label, drink, binds, etc.).
    input = document.createElement('input');
    input.type = 'text';
    input.value = (typeof value === 'string') ? value : '';
    bindPropChange(input, actor, propName, 'string');
    return input;
  }

  function bindPropChange(input, actor, propName, kind) {
    var commit = function () {
      if (!selectedActor) return;
      var arr = scopeActors(state, selectedActor.scope);
      var current = arr[selectedActor.index];
      if (!current) return;

      var newValue;
      if (kind === 'boolean') {
        newValue = !!input.checked;
      } else if (kind === 'number') {
        var raw = input.value;
        if (raw === '') {
          // Empty number input -- keep the existing value to avoid silent NaN.
          input.value = (typeof current[propName] === 'number') ? String(current[propName]) : '';
          return;
        }
        var num = Number(raw);
        if (!isFinite(num)) {
          input.classList.add('is-invalid');
          showToast(propName + ' must be a number', 'error');
          return;
        }
        newValue = num;
      } else {
        newValue = String(input.value);
      }

      var prev = current[propName];
      if (prev === newValue) return; // no-op

      pushHistorySnapshot();
      state = LE.model.updateActorProp(state, selectedActor.scope, selectedActor.index, propName, newValue);
      input.classList.remove('is-invalid');
      render();
    };

    // Number + text + textarea commit on blur. Select + checkbox commit on
    // change (no blur for checkboxes; selects normally close on change).
    if (input.tagName === 'SELECT' || (input.tagName === 'INPUT' && input.type === 'checkbox')) {
      input.addEventListener('change', commit);
    } else {
      input.addEventListener('blur', commit);
    }
  }

  // ---------------------------------------------------------------------------
  // Metadata form.
  // ---------------------------------------------------------------------------

  function wireMetadataForm() {
    bindMetadataField(dom.metaLevelKey, 'levelKey', 'string');
    bindMetadataField(dom.metaLessonKey, 'lessonKey', 'string');
    bindMetadataField(dom.metaTitle, 'title', 'string');
    bindMetadataField(dom.metaSkill, 'skill', 'string');
    bindMetadataField(dom.metaLo, 'lo', 'string');
    bindMetadataField(dom.metaEk, 'ek', 'ekList');
    bindMetadataField(dom.metaDuration, 'duration', 'number');
    bindMetadataField(dom.metaWidth, 'width', 'resizeWidth');
    bindMetadataField(dom.metaHeight, 'height', 'resizeHeight');
    bindMetadataField(dom.metaMinStudents, 'min_students', 'number');
    bindMetadataField(dom.metaCompletionKind, 'completion.kind', 'completionKind');
    bindMetadataField(dom.metaCompletionRule, 'completion.rule', 'completionRule');
  }

  function bindMetadataField(input, key, kind) {
    if (!input) return;
    var commit = function () {
      handleMetadataCommit(input, key, kind);
    };
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', commit);
    } else {
      input.addEventListener('blur', commit);
    }
  }

  function handleMetadataCommit(input, key, kind) {
    var raw = input.value;

    if (kind === 'string') {
      var s = String(raw);
      if (state[key] === s) return;
      pushHistorySnapshot();
      var patch = {};
      patch[key] = s;
      state = LE.model.updateMetadata(state, patch);
      render();
      return;
    }

    if (kind === 'number') {
      var num = Number(raw);
      if (!isFinite(num)) {
        showToast(key + ' must be a number', 'error');
        input.value = (typeof state[key] === 'number') ? String(state[key]) : '';
        return;
      }
      if (state[key] === num) return;
      pushHistorySnapshot();
      var npatch = {};
      npatch[key] = num;
      state = LE.model.updateMetadata(state, npatch);
      render();
      return;
    }

    if (kind === 'ekList') {
      // Comma-separated string -> trimmed non-empty array.
      var parts = String(raw).split(',').map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
      var current = Array.isArray(state.ek) ? state.ek : [];
      if (arraysShallowEqual(parts, current)) return;
      pushHistorySnapshot();
      state = LE.model.updateMetadata(state, { ek: parts });
      render();
      return;
    }

    if (kind === 'resizeWidth' || kind === 'resizeHeight') {
      var n = Number(raw);
      if (!isFinite(n)) {
        showToast('width/height must be a number', 'error');
        input.value = String(state.map[kind === 'resizeWidth' ? 'width' : 'height']);
        return;
      }
      var currentMapState = state.map;
      var targetW = currentMapState.width;
      var targetH = currentMapState.height;
      if (kind === 'resizeWidth') targetW = n;
      else targetH = n;

      // Detect actors that will be clamped so we can warn.
      var atRiskCount = 0;
      var actorsRef = state.actors || [];
      for (var i = 0; i < actorsRef.length; i++) {
        var a = actorsRef[i];
        if (!a) continue;
        if ((a.x | 0) > targetW - 1 || (a.y | 0) > targetH - 1) atRiskCount++;
      }
      pushHistorySnapshot();
      state = LE.model.resizeMap(state, 'main', targetW, targetH);
      if (atRiskCount > 0) {
        showToast('Resized: ' + atRiskCount + ' actor(s) clamped into bounds', 'info');
      }
      syncMetadataFormFromState();
      syncCameraSliderFromState();
      render();
      return;
    }

    if (kind === 'completionKind') {
      var kinds = LE.model.COMPLETION_KINDS || [];
      var val = String(raw);
      if (kinds.indexOf(val) === -1) {
        showToast('Unknown completion.kind: ' + val, 'error');
        input.value = (state.completion && state.completion.kind) || kinds[0] || '';
        return;
      }
      if (state.completion && state.completion.kind === val) return;
      pushHistorySnapshot();
      var nextCompletion = Object.assign({}, state.completion || {}, { kind: val });
      state = LE.model.updateMetadata(state, { completion: nextCompletion });
      render();
      return;
    }

    if (kind === 'completionRule') {
      var rule = String(raw);
      if (state.completion && state.completion.rule === rule) return;
      pushHistorySnapshot();
      var nc = Object.assign({}, state.completion || {}, { rule: rule });
      state = LE.model.updateMetadata(state, { completion: nc });
      render();
      return;
    }
  }

  function syncMetadataFormFromState() {
    if (!state) return;
    if (dom.metaSchema) dom.metaSchema.value = state.schema || '';
    if (dom.metaLevelKey) dom.metaLevelKey.value = state.levelKey || '';
    if (dom.metaLessonKey) dom.metaLessonKey.value = state.lessonKey || '';
    if (dom.metaTitle) dom.metaTitle.value = state.title || '';
    if (dom.metaSkill) dom.metaSkill.value = state.skill || '';
    if (dom.metaLo) dom.metaLo.value = state.lo || '';
    if (dom.metaEk) dom.metaEk.value = Array.isArray(state.ek) ? state.ek.join(', ') : '';
    if (dom.metaDuration) dom.metaDuration.value = (typeof state.duration === 'number') ? String(state.duration) : '';
    if (dom.metaWidth && state.map) dom.metaWidth.value = String(state.map.width);
    if (dom.metaHeight && state.map) dom.metaHeight.value = String(state.map.height);
    if (dom.metaChipSize && state.map) dom.metaChipSize.value = String(state.map.chipSize);
    if (dom.metaMinStudents) dom.metaMinStudents.value = (typeof state.min_students === 'number') ? String(state.min_students) : '';
    if (dom.metaCompletionKind && state.completion) dom.metaCompletionKind.value = state.completion.kind || '';
    if (dom.metaCompletionRule && state.completion) dom.metaCompletionRule.value = state.completion.rule || '';
  }

  // ---------------------------------------------------------------------------
  // Tabs.
  // ---------------------------------------------------------------------------

  function wireTabs() {
    if (dom.tabMain) {
      dom.tabMain.addEventListener('click', function () { switchScope('main'); });
    }
    if (dom.tabReflection) {
      dom.tabReflection.addEventListener('click', function () { switchScope('reflection'); });
    }
  }

  function switchScope(scope) {
    if (scope !== 'main' && scope !== 'reflection') return;
    if (activeScope === scope) return;
    activeScope = scope;
    selectedActor = null;
    showPropsEmpty();
    applyReflectionPaletteFilter();
    syncTabActiveState();
    syncScopeChrome();
    syncCameraSliderFromState();
    render();
  }

  function syncTabActiveState() {
    if (dom.tabMain) {
      if (activeScope === 'main') dom.tabMain.classList.add('is-active');
      else dom.tabMain.classList.remove('is-active');
    }
    if (dom.tabReflection) {
      if (activeScope === 'reflection') dom.tabReflection.classList.add('is-active');
      else dom.tabReflection.classList.remove('is-active');
    }
  }

  function syncScopeChrome() {
    // Reflection room hides metadata + camera slider (per spec).
    var isReflection = activeScope === 'reflection';
    if (dom.metadata) dom.metadata.style.display = isReflection ? 'none' : '';
    if (dom.cameraWrap) dom.cameraWrap.style.display = isReflection ? 'none' : '';
  }

  // ---------------------------------------------------------------------------
  // Camera slider.
  // ---------------------------------------------------------------------------

  function wireCameraSlider() {
    if (!dom.cameraSlider) return;
    dom.cameraSlider.addEventListener('input', function () {
      var n = Number(dom.cameraSlider.value);
      if (!isFinite(n)) return;
      cameraStart = Math.max(0, Math.floor(n));
      render();
    });
  }

  function syncCameraSliderFromState() {
    if (!dom.cameraSlider) return;
    var mapW = state.map.width;
    var max = Math.max(0, mapW - CAMERA_WIDTH);
    dom.cameraSlider.min = '0';
    dom.cameraSlider.max = String(max);
    dom.cameraSlider.step = '1';
    if (cameraStart > max) cameraStart = max;
    dom.cameraSlider.value = String(cameraStart);
    // If the level fits inside the camera window, disable the slider.
    dom.cameraSlider.disabled = max === 0;
  }

  // ---------------------------------------------------------------------------
  // Bottom toolbar.
  // ---------------------------------------------------------------------------

  function wireBottomToolbar() {
    if (dom.btnSave) dom.btnSave.addEventListener('click', handleSave);
    if (dom.btnLoad) dom.btnLoad.addEventListener('click', handleLoadClick);
    if (dom.btnUndo) dom.btnUndo.addEventListener('click', handleUndo);
    if (dom.btnRedo) dom.btnRedo.addEventListener('click', handleRedo);
    if (dom.btnCopy) dom.btnCopy.addEventListener('click', handleCopyJson);
    if (dom.btnLaunch) dom.btnLaunch.addEventListener('click', handleLaunch);
    if (dom.fileInput) dom.fileInput.addEventListener('change', handleFileInputChange);
    if (dom.warningsHeader) dom.warningsHeader.addEventListener('click', toggleWarningsCollapse);
  }

  function handleSave() {
    var json;
    try {
      json = LE.model.serialize(state);
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      return;
    }
    var fileName = (state.levelKey && state.levelKey.length > 0) ? state.levelKey + '.json' : 'level.json';
    downloadFile(fileName, json, 'application/json');
    showToast('Saved ' + fileName, 'success');
  }

  function downloadFile(fileName, body, mimeType) {
    var blob;
    try {
      blob = new Blob([body], { type: mimeType || 'application/octet-stream' });
    } catch (err) {
      showToast('Save failed: blob unavailable', 'error');
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a tick so the browser has time to start the download.
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
    }, 0);
  }

  function handleLoadClick() {
    if (!dom.fileInput) return;
    dom.fileInput.value = ''; // allow selecting the same file twice
    dom.fileInput.click();
  }

  function handleFileInputChange(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result;
      try {
        var parsed = LE.model.deserialize(String(text));
        state = parsed;
        history = LE.model.createHistory();
        selectedActor = null;
        activeTool = null;
        cameraStart = 0;
        syncPaletteActiveState();
        syncMetadataFormFromState();
        syncCameraSliderFromState();
        showPropsEmpty();
        stateMutatedSinceLastLint = true;
        render();
        showToast('Loaded ' + file.name, 'success');
      } catch (err) {
        showToast('Load failed: ' + err.message, 'error');
      }
    };
    reader.onerror = function () {
      showToast('Load failed: could not read file', 'error');
    };
    reader.readAsText(file);
  }

  function handleCopyJson() {
    var json;
    try {
      json = LE.model.serialize(state);
    } catch (err) {
      showToast('Copy failed: ' + err.message, 'error');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        showToast('Copied', 'success');
      }, function (err) {
        showToast('Copy failed: ' + (err && err.message ? err.message : 'denied'), 'error');
      });
      return;
    }
    showToast('Clipboard API unavailable', 'error');
  }

  function handleLaunch() {
    // Step 1: levelKey must be set or we can't construct the dev URL.
    var levelKey = (state && typeof state.levelKey === 'string') ? state.levelKey.trim() : '';
    if (levelKey.length === 0) {
      showToast('Set levelKey in metadata before launching', 'error');
      return;
    }

    // Step 2: serialize state for the clipboard. Bail early on a model error.
    var json;
    try {
      json = LE.model.serialize(state);
    } catch (err) {
      showToast('Launch failed: ' + (err && err.message ? err.message : 'serialize error'), 'error');
      return;
    }

    // Step 3: open the cockpit URL in a new tab. Do this BEFORE the clipboard
    // promise resolves so we are still inside the user-gesture window (some
    // browsers block popups after an async hop).
    var url = LAUNCH_BASE_URL
      + '?year=' + encodeURIComponent(LAUNCH_YEAR)
      + '&dev=1'
      + '&devActivity=' + encodeURIComponent(levelKey);
    try {
      if (typeof window.open === 'function') window.open(url, '_blank');
    } catch (e) { /* popup-blocked or missing; toast still informs the user */ }

    // Step 4: copy JSON to clipboard and toast the next-step instructions.
    var toastMsg = 'JSON in clipboard. Drop into cr/railway-server/activities/'
      + levelKey + '.json, commit, push, then visit the cockpit URL (opening now).';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        showToast(toastMsg, 'success');
      }, function (err) {
        showToast('Clipboard write failed: ' + (err && err.message ? err.message : 'denied'), 'error');
      });
      return;
    }
    showToast('Clipboard API unavailable -- copy JSON manually then visit ' + url, 'error');
  }

  function toggleWarningsCollapse() {
    if (!dom.warnings) return;
    if (dom.warnings.classList.contains('is-collapsed')) {
      dom.warnings.classList.remove('is-collapsed');
    } else {
      dom.warnings.classList.add('is-collapsed');
    }
  }

  // ---------------------------------------------------------------------------
  // Warnings panel.
  // ---------------------------------------------------------------------------

  function runLintNow() {
    var issues = [];
    if (LE.lint && typeof LE.lint.runLint === 'function') {
      try {
        issues = LE.lint.runLint(state) || [];
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('LE.ui: lint pass threw', err);
        }
        issues = [];
      }
    }
    lastLintResult = Array.isArray(issues) ? issues : [];
    renderWarningsPanel(lastLintResult);
    return lastLintResult;
  }

  function renderWarningsPanel(issues) {
    if (!dom.warnings || !dom.warningsList) return;

    // Hide panel entirely when there are no issues.
    if (!issues || issues.length === 0) {
      dom.warnings.hidden = true;
      dom.warningsList.innerHTML = '';
      if (dom.warningsHeader) dom.warningsHeader.textContent = 'Warnings (0)';
      return;
    }

    dom.warnings.hidden = false;
    if (dom.warningsHeader) {
      dom.warningsHeader.textContent = 'Warnings (' + issues.length + ')';
    }

    // Rebuild the list. Each row is a small DOM tree with textContent for
    // user-controlled fields (XSS-safe).
    dom.warningsList.innerHTML = '';
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var row = document.createElement('div');
      row.className = 'le-warning le-warning-' + safeSeverityClass(issue.severity);
      if (issue.actorIndex !== null && typeof issue.actorIndex === 'number') {
        row.setAttribute('data-actor-index', String(issue.actorIndex));
      }
      row.setAttribute('data-scope', (issue.scope === 'reflection') ? 'reflection' : 'main');
      row.setAttribute('data-rule-id', String(issue.id || ''));

      var sev = document.createElement('span');
      sev.className = 'le-warning-severity';
      sev.textContent = '[' + String(issue.severity || '').toUpperCase() + ']';
      row.appendChild(sev);

      var msg = document.createElement('span');
      msg.className = 'le-warning-message';
      msg.textContent = ' ' + String(issue.message || '');
      row.appendChild(msg);

      row.addEventListener('click', buildWarningClickHandler(issue));
      dom.warningsList.appendChild(row);
    }
  }

  function safeSeverityClass(severity) {
    if (severity === 'error' || severity === 'warn' || severity === 'info') return severity;
    return 'info';
  }

  function buildWarningClickHandler(issue) {
    return function () {
      // Level-wide issues (no actorIndex) just no-op the click; the row is
      // still selectable to read the message.
      if (issue.actorIndex === null || typeof issue.actorIndex !== 'number') return;
      var targetScope = (issue.scope === 'reflection') ? 'reflection' : 'main';
      // Re-run lint NOW so the index we navigate to matches current state
      // (avoids stale-index races when mutations happened between paint and click).
      if (LE.lint) {
        stateMutatedSinceLastLint = true;
        runLintNow();
        stateMutatedSinceLastLint = false;
      }
      // Switch tabs if the warning lives in a different scope.
      if (targetScope !== activeScope) {
        switchScope(targetScope);
      }
      var arr = scopeActors(state, targetScope);
      if (issue.actorIndex < 0 || issue.actorIndex >= arr.length) return;
      selectActor(targetScope, issue.actorIndex);
      render();
    };
  }

  function handleUndo() {
    var result = LE.model.undo(history, state);
    state = result[0];
    history = result[1];
    selectedActor = null;
    showPropsEmpty();
    syncMetadataFormFromState();
    syncCameraSliderFromState();
    stateMutatedSinceLastLint = true;
    render();
  }

  function handleRedo() {
    var result = LE.model.redo(history, state);
    state = result[0];
    history = result[1];
    selectedActor = null;
    showPropsEmpty();
    syncMetadataFormFromState();
    syncCameraSliderFromState();
    stateMutatedSinceLastLint = true;
    render();
  }

  // ---------------------------------------------------------------------------
  // History.
  // ---------------------------------------------------------------------------

  function pushHistorySnapshot() {
    if (!history) history = LE.model.createHistory();
    LE.model.pushHistory(history, state);
    // Every mutation site calls this before swapping state -- this is the
    // single chokepoint for the auto-lint dirty flag.
    stateMutatedSinceLastLint = true;
  }

  // ---------------------------------------------------------------------------
  // Keyboard.
  // ---------------------------------------------------------------------------

  function wireKeyboard() {
    document.addEventListener('keydown', handleKeyDown);
  }

  function isEditableTarget(target) {
    if (!target) return false;
    var tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function handleKeyDown(ev) {
    // Ctrl shortcuts work even when an input has focus (so the user can
    // hit Ctrl+S from a metadata field). All other shortcuts are blocked
    // when an editable element is focused so typing isn't hijacked.
    var ctrl = ev.ctrlKey || ev.metaKey;
    var key = ev.key;

    if (ctrl && (key === 's' || key === 'S')) {
      ev.preventDefault();
      handleSave();
      return;
    }
    if (ctrl && (key === 'o' || key === 'O')) {
      ev.preventDefault();
      handleLoadClick();
      return;
    }
    if (ctrl && (key === 'z' || key === 'Z')) {
      ev.preventDefault();
      handleUndo();
      return;
    }
    if (ctrl && (key === 'y' || key === 'Y')) {
      ev.preventDefault();
      handleRedo();
      return;
    }

    if (isEditableTarget(ev.target)) return;

    // Sim mode reroutes a few keys (arrows = walk, Escape = stop sim,
    // Del/Backspace = no-op). All other keys fall through to editor.
    if (simActive) {
      if (key === 'Escape') {
        ev.preventDefault();
        simStop();
        return;
      }
      if (key === 'ArrowLeft') { ev.preventDefault(); simMovePlayer(-1, 0); return; }
      if (key === 'ArrowRight') { ev.preventDefault(); simMovePlayer(1, 0); return; }
      if (key === 'ArrowUp') { ev.preventDefault(); simMovePlayer(0, -1); return; }
      if (key === 'ArrowDown') { ev.preventDefault(); simMovePlayer(0, 1); return; }
      if (key === 'Delete' || key === 'Backspace') {
        ev.preventDefault();
        return; // explicit no-op during sim
      }
      // Number quickselect is also disabled during sim (no palette clicks).
      if (key >= '1' && key <= '9') return;
      // Other keys (e.g. arrow modifiers) fall through.
      return;
    }

    if (key === 'Escape') {
      activeTool = null;
      closeContextMenu();
      clearSelection();
      syncPaletteActiveState();
      render();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      if (selectedActor) {
        ev.preventDefault();
        deleteSelectedActor();
      }
      return;
    }

    if (key === 'ArrowLeft') { ev.preventDefault(); nudgeSelectedActor(-1, 0); return; }
    if (key === 'ArrowRight') { ev.preventDefault(); nudgeSelectedActor(1, 0); return; }
    if (key === 'ArrowUp') { ev.preventDefault(); nudgeSelectedActor(0, -1); return; }
    if (key === 'ArrowDown') { ev.preventDefault(); nudgeSelectedActor(0, 1); return; }

    // Number quickselect 1..9 -- maps to the visible palette entries.
    if (key >= '1' && key <= '9') {
      var idx = parseInt(key, 10) - 1;
      var visible = visiblePaletteEntries();
      if (idx < visible.length) {
        var type = visible[idx].getAttribute('data-actor-type');
        if (type) handlePaletteClick(type);
      }
      return;
    }
  }

  function visiblePaletteEntries() {
    var out = [];
    if (!dom.paletteEntries) return out;
    for (var i = 0; i < dom.paletteEntries.length; i++) {
      var entry = dom.paletteEntries[i];
      if (entry.style.display === 'none') continue;
      out.push(entry);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Context menu.
  // ---------------------------------------------------------------------------

  function openContextMenu(clientX, clientY) {
    closeContextMenu();
    var menu = document.createElement('div');
    menu.id = 'le-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';
    menu.style.background = '#ffffff';
    menu.style.border = '1px solid #1f2937';
    menu.style.padding = '4px 0';
    menu.style.boxShadow = '2px 2px 0 #999';
    menu.style.zIndex = '1000';
    menu.style.fontFamily = 'inherit';
    menu.style.fontSize = '12px';
    menu.style.minWidth = '120px';

    appendMenuItem(menu, 'Delete', deleteSelectedActor);
    appendMenuItem(menu, 'Duplicate', duplicateSelectedActor);
    appendMenuItem(menu, 'Edit ID', editSelectedActorId);

    document.body.appendChild(menu);
    contextMenu = menu;

    // Close on the next outside click.
    setTimeout(function () {
      document.addEventListener('mousedown', closeContextMenuOnOutsideClick, true);
    }, 0);
  }

  function appendMenuItem(menu, label, handler) {
    var item = document.createElement('div');
    item.textContent = label;
    item.style.padding = '4px 12px';
    item.style.cursor = 'pointer';
    item.addEventListener('mouseenter', function () { item.style.background = '#e0e7ff'; });
    item.addEventListener('mouseleave', function () { item.style.background = '#ffffff'; });
    item.addEventListener('click', function () {
      handler();
    });
    menu.appendChild(item);
  }

  function closeContextMenuOnOutsideClick(ev) {
    if (!contextMenu) return;
    if (contextMenu.contains(ev.target)) return;
    closeContextMenu();
  }

  function closeContextMenu() {
    if (!contextMenu) return;
    if (contextMenu.parentNode) contextMenu.parentNode.removeChild(contextMenu);
    contextMenu = null;
    document.removeEventListener('mousedown', closeContextMenuOnOutsideClick, true);
  }

  // ---------------------------------------------------------------------------
  // Toast.
  // ---------------------------------------------------------------------------

  var toastTimer = null;

  function showToast(msg, kind) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.remove('is-success', 'is-error', 'is-info');
    if (kind === 'success' || kind === 'error' || kind === 'info') {
      dom.toast.classList.add('is-' + kind);
    }
    dom.toast.hidden = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastTimer = setTimeout(function () {
      if (dom.toast) dom.toast.hidden = true;
      toastTimer = null;
    }, TOAST_HIDE_MS);
  }

  // ---------------------------------------------------------------------------
  // P3 -- Sim toolbar wiring + sim mode lifecycle.
  // ---------------------------------------------------------------------------

  function wireSimToolbar() {
    if (dom.btnSimPlay) {
      dom.btnSimPlay.addEventListener('click', handleSimPlayToggle);
    }
    if (dom.simFakeTally) {
      dom.simFakeTally.addEventListener('change', handleSimFakeTallyChange);
    }
    if (dom.simReset) {
      dom.simReset.addEventListener('click', handleSimReset);
    }
    // Initial phase HUD = IDLE until the user starts sim.
    if (dom.simPhase) dom.simPhase.textContent = 'IDLE';
  }

  function simAvailable() {
    return !!(window.LE && window.LE.sim && typeof window.LE.sim.createSim === 'function');
  }

  function handleSimPlayToggle() {
    if (simActive) {
      simStop();
    } else {
      simStart();
    }
  }

  function simStart() {
    if (simActive) return sim;
    if (!simAvailable()) {
      showToast('Sim engine not loaded', 'error');
      return null;
    }
    if (activeScope !== 'main') {
      // Force back to main scope -- the sim only walks state.actors.
      switchScope('main');
    }
    // Clear any active tool / selection so sim mode starts clean.
    activeTool = null;
    syncPaletteActiveState();
    selectedActor = null;
    showPropsEmpty();
    closeContextMenu();

    try {
      sim = LE.sim.createSim(state);
    } catch (err) {
      showToast('Sim start failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
      sim = null;
      return null;
    }
    simActive = true;
    simLastTickMs = nowMs();
    if (dom.btnSimPlay) {
      dom.btnSimPlay.textContent = 'Stop sim';
      dom.btnSimPlay.classList.add('is-sim-active');
    }
    if (dom.simFakeTally) {
      dom.simFakeTally.checked = sim.fakeTally === true;
    }
    // Hide warnings panel during sim -- the level is being PLAYED, not
    // edited, so author-time warnings are noise.
    if (dom.warnings) dom.warnings.hidden = true;
    syncSimPhase();
    startSimLoop();
    render();
    return sim;
  }

  function simStop() {
    if (!simActive) return;
    simActive = false;
    stopSimLoop();
    sim = null;
    if (dom.btnSimPlay) {
      dom.btnSimPlay.textContent = 'Sim';
      dom.btnSimPlay.classList.remove('is-sim-active');
    }
    if (dom.simPhase) dom.simPhase.textContent = 'IDLE';
    // Restore the warnings panel state by re-running lint.
    if (LE.lint) {
      stateMutatedSinceLastLint = true;
      runLintNow();
      stateMutatedSinceLastLint = false;
    }
    render();
  }

  function handleSimReset() {
    if (!simActive) {
      // Reset before-start: no-op (nothing to reset).
      return;
    }
    if (!simAvailable()) return;
    try {
      sim = LE.sim.createSim(state);
    } catch (err) {
      showToast('Sim reset failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
      return;
    }
    simLastTickMs = nowMs();
    if (dom.simFakeTally) dom.simFakeTally.checked = sim.fakeTally === true;
    syncSimPhase();
    render();
  }

  function handleSimFakeTallyChange(ev) {
    if (!simActive || !sim || !simAvailable()) return;
    var on = !!(ev && ev.target && ev.target.checked);
    LE.sim.setFakeTally(sim, on);
    render();
  }

  function syncSimPhase() {
    if (!dom.simPhase) return;
    var phase = (sim && typeof sim.phase === 'string') ? sim.phase : 'IDLE';
    dom.simPhase.textContent = phase;
  }

  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  function startSimLoop() {
    stopSimLoop();
    var raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : function (cb) { return setTimeout(function () { cb(nowMs()); }, 16); };
    // Sync-RAF detection. Some test shims call the callback before raf()
    // returns; without this guard, the loop would infinitely recurse.
    // We detect by setting a flag BEFORE raf() and clearing it AFTER --
    // if step runs while the flag is set, RAF is synchronous and we
    // bail (tests drive sim time via _test.simStep instead).
    var schedulingFlag = false;
    var step = function () {
      if (schedulingFlag) return; // synchronous RAF; bail to avoid recursion
      if (!simActive || !sim) return;
      var now = nowMs();
      var dt = now - simLastTickMs;
      simLastTickMs = now;
      // Cap dt to 100ms to avoid huge jumps from tab-switching pauses.
      if (dt > 100) dt = 100;
      if (dt > 0 && simAvailable()) {
        try {
          LE.sim.tick(sim, dt);
        } catch (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('LE.ui sim.tick threw', err);
          }
        }
      }
      syncSimPhase();
      paint();
      if (simActive) {
        schedulingFlag = true;
        simRafId = raf(step);
        schedulingFlag = false;
      }
    };
    schedulingFlag = true;
    simRafId = raf(step);
    schedulingFlag = false;
  }

  function stopSimLoop() {
    if (simRafId === null) return;
    if (typeof cancelAnimationFrame === 'function') {
      try { cancelAnimationFrame(simRafId); } catch (_) { /* noop */ }
    }
    simRafId = null;
  }

  // Sim-driven player movement. Called by arrow keys when sim is active.
  function simMovePlayer(dx, dy) {
    if (!simActive || !sim || !simAvailable()) return;
    LE.sim.movePlayer(sim, dx, dy);
    syncSimPhase();
    render();
  }

  // Manual sim step -- used by tests to advance timers without RAF.
  function simStep(dtMs) {
    if (!simActive || !sim || !simAvailable()) return;
    LE.sim.tick(sim, dtMs);
    syncSimPhase();
    render();
  }

  // ---------------------------------------------------------------------------
  // Render orchestration.
  // ---------------------------------------------------------------------------

  function render() {
    if (renderRequested) return;
    renderRequested = true;
    var raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : function (cb) { setTimeout(cb, 16); };
    raf(function () {
      renderRequested = false;
      paint();
    });
  }

  function paint() {
    if (!dom.canvas) return;
    var ctx = dom.canvas.getContext('2d');
    if (!ctx) return;

    var mapW = currentMap().width;
    var mapH = currentMap().height;
    var canvasW = (mapW * CHIP_PX) + (GRID_LEFT_PAD * 2);
    var canvasH = (mapH * CHIP_PX) + (GRID_TOP_PAD * 2);
    if (dom.canvas.width !== canvasW) dom.canvas.width = canvasW;
    if (dom.canvas.height !== canvasH) dom.canvas.height = canvasH;

    var renderOptions = {
      cameraStart: activeScope === 'main' ? cameraStart : null,
      cameraWidth: CAMERA_WIDTH,
      selectedActorIndex: (selectedActor && selectedActor.scope === activeScope)
        ? selectedActor.index
        : null,
    };
    try {
      LE.render.renderGrid(ctx, state, activeScope, renderOptions);
    } catch (err) {
      console.error('LE.ui: renderGrid failed', err);
    }

    // Hover ghost -- only when an active tool is selected AND mouse is on
    // a chip AND no actor is being dragged AND sim is not playing.
    if (!simActive && activeTool && hoverChip && !dragState) {
      drawHoverGhost(ctx, activeTool, hoverChip.x, hoverChip.y);
    }

    // P3 sim overlay -- player avatar, lit ContextSlots highlight, HUD.
    if (simActive && sim) {
      drawSimOverlay(ctx);
    }

    // Refresh the lint warnings panel ONLY when state actually mutated since
    // the last lint pass. Without this gate, paint() (which fires per-frame on
    // hover + drag) would re-lint + rebuild the warnings DOM ~60x/sec.
    // During sim, skip lint entirely (warnings panel is hidden anyway).
    if (!simActive && LE.lint && stateMutatedSinceLastLint) {
      runLintNow();
      stateMutatedSinceLastLint = false;
    }
  }

  // Sim overlay -- repaint lit ContextSlots with the lit visual, draw the
  // player avatar on top of everything, and stamp a phase HUD onto the
  // canvas (so the user sees the phase even if they minimize the toolbar).
  function drawSimOverlay(ctx) {
    if (!sim) return;
    var actors = scopeActors(state, 'main');

    // Repaint lit ContextSlots with the lit visual. We re-blit only the
    // lit ones; unlit slots keep the renderGrid default.
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'ContextSlot') continue;
      if (!a.id || !sim.contextSlotsLit.has(a.id)) continue;
      var litX = GRID_LEFT_PAD + (a.x | 0) * CHIP_PX;
      var litY = GRID_TOP_PAD + (a.y | 0) * CHIP_PX;
      try {
        LE.render.drawActor(ctx, a, litX, litY, { chipPx: CHIP_PX, scale: 1, lit: true });
      } catch (e) { /* noop */ }
    }

    // Player avatar -- draw at sim.player.{x,y}. Use the PlayerSpawn
    // sprite so the avatar matches the cr engine's visual.
    var px = GRID_LEFT_PAD + (sim.player.x | 0) * CHIP_PX;
    var py = GRID_TOP_PAD + (sim.player.y | 0) * CHIP_PX;
    try {
      if (typeof LE.render.drawAtlasPlayerSpawn === 'function') {
        LE.render.drawAtlasPlayerSpawn(ctx, px, py, { chipPx: CHIP_PX, scale: 1 });
      } else {
        LE.render.drawActor(ctx, { type: 'PlayerSpawn', x: sim.player.x | 0, y: sim.player.y | 0 }, px, py, { chipPx: CHIP_PX, scale: 1 });
      }
    } catch (e) { /* noop */ }

    // Soft halo around the player so it pops on busy levels.
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CHIP_PX - 2, CHIP_PX - 2);
    ctx.restore();

    // Phase HUD -- bottom-right corner of the canvas, fixed coords (not
    // chip-aligned) so it always reads regardless of map size.
    var hudText = 'PHASE: ' + (sim.phase || 'IDLE');
    if (sim.fakeTally === true) hudText += '  (fake tally)';
    drawPhaseHud(ctx, hudText);
  }

  function drawPhaseHud(ctx, text) {
    ctx.save();
    var padX = 8;
    var padY = 6;
    ctx.font = 'bold 14px system-ui, -apple-system, "Segoe UI", sans-serif';
    var metrics;
    try { metrics = ctx.measureText(text); }
    catch (e) { metrics = { width: text.length * 8 }; }
    var w = (metrics.width || 200) + padX * 2;
    var h = 14 + padY * 2;
    var x = 8;
    var y = 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + padX, y + padY);
    ctx.restore();
  }

  function drawHoverGhost(ctx, type, chipX, chipY) {
    var px = GRID_LEFT_PAD + chipX * CHIP_PX;
    var py = GRID_TOP_PAD + chipY * CHIP_PX;
    ctx.save();
    ctx.globalAlpha = 0.4;
    var sample = buildSampleActor(type);
    try {
      LE.render.drawActor(ctx, sample, px, py, { chipPx: CHIP_PX, scale: 1 });
    } catch (e) { /* noop */ }
    ctx.restore();
    // Highlight the target chip.
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CHIP_PX - 2, CHIP_PX - 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Helpers.
  // ---------------------------------------------------------------------------

  function scopeActors(s, scope) {
    if (scope === 'reflection') {
      if (s.reflection_room && Array.isArray(s.reflection_room.actors)) {
        return s.reflection_room.actors;
      }
      return [];
    }
    return Array.isArray(s.actors) ? s.actors : [];
  }

  function scopeMap(s, scope) {
    if (scope === 'reflection') {
      if (s.reflection_room && s.reflection_room.map) return s.reflection_room.map;
      return { width: 16, height: 8, chipSize: 10 };
    }
    return s.map || { width: 32, height: 8, chipSize: 10 };
  }

  function currentMap() {
    return scopeMap(state, activeScope);
  }

  function arraysShallowEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Export.
  // ---------------------------------------------------------------------------

  LE.ui = {
    init: init,
    getState: function () { return state; },
    _test: {
      // State accessors -- read-only views for tests.
      getState: function () { return state; },
      getHistory: function () { return history; },
      getActiveTool: function () { return activeTool; },
      getActiveScope: function () { return activeScope; },
      getSelectedActor: function () { return selectedActor; },
      getCameraStart: function () { return cameraStart; },
      getDragState: function () { return dragState; },
      getHoverChip: function () { return hoverChip; },
      getDom: function () { return dom; },

      // State mutators -- tests use these to drive the editor without
      // synthesizing real DOM events.
      setStateForTest: function (next) {
        state = next;
        history = LE.model.createHistory();
        selectedActor = null;
        syncMetadataFormFromState();
        syncCameraSliderFromState();
        stateMutatedSinceLastLint = true;
        render();
      },
      resetForTest: function () {
        state = LE.model.createState();
        history = LE.model.createHistory();
        activeTool = null;
        activeScope = 'main';
        selectedActor = null;
        dragState = null;
        cameraStart = 0;
        hoverChip = null;
        closeContextMenu();
        syncPaletteActiveState();
        syncTabActiveState();
        syncScopeChrome();
        syncMetadataFormFromState();
        syncCameraSliderFromState();
        showPropsEmpty();
        render();
      },

      // Interaction handlers -- callable directly from tests.
      handlePaletteClick: handlePaletteClick,
      placeActorAt: placeActorAt,
      selectActor: selectActor,
      clearSelection: clearSelection,
      deleteSelectedActor: deleteSelectedActor,
      duplicateSelectedActor: duplicateSelectedActor,
      nudgeSelectedActor: nudgeSelectedActor,
      hitTestActorAt: hitTestActorAt,
      switchScope: switchScope,

      // Toolbar handlers.
      handleSave: handleSave,
      handleLoadClick: handleLoadClick,
      handleCopyJson: handleCopyJson,
      handleLaunch: handleLaunch,
      handleUndo: handleUndo,
      handleRedo: handleRedo,

      // Warnings panel.
      runLintNow: runLintNow,
      getLastLintResult: function () { return lastLintResult.slice(); },
      toggleWarningsCollapse: toggleWarningsCollapse,

      // Form sync.
      syncMetadataFormFromState: syncMetadataFormFromState,
      syncCameraSliderFromState: syncCameraSliderFromState,
      rebuildPropsForm: rebuildPropsForm,
      showPropsEmpty: showPropsEmpty,

      // Camera + tool helpers.
      setCameraStart: function (n) {
        cameraStart = Math.max(0, Math.floor(Number(n) || 0));
        if (dom.cameraSlider) dom.cameraSlider.value = String(cameraStart);
        render();
      },
      setActiveTool: function (type) {
        activeTool = type;
        syncPaletteActiveState();
        render();
      },

      // Default actor + auto-id helpers (visible for unit testing).
      buildDefaultActor: buildDefaultActor,
      autoId: autoId,

      // Render hook -- some tests want to force a paint synchronously.
      renderNow: paint,

      // Toast helper for tests that want to verify error paths.
      showToast: showToast,

      // Push a snapshot from a test (rare; primarily for history edge cases).
      pushHistorySnapshot: pushHistorySnapshot,

      // P3 sim handles.
      simStart: simStart,
      simStop: simStop,
      simGetSim: function () { return sim; },
      simIsActive: function () { return simActive; },
      simStep: simStep,
      simMovePlayer: simMovePlayer,
      simReset: handleSimReset,
      simSetFakeTally: function (on) {
        if (!simActive || !sim || !simAvailable()) return;
        LE.sim.setFakeTally(sim, on === true);
        if (dom.simFakeTally) dom.simFakeTally.checked = sim.fakeTally === true;
        render();
      },
    },
  };

  // Auto-init when the DOM is ready. Tests can disable auto-init by setting
  // window.LE_DISABLE_AUTO_INIT = true before this script runs.
  if (typeof document !== 'undefined' && !window.LE_DISABLE_AUTO_INIT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // The script tag is at the end of <body>, so the DOM is already parsed
      // by the time we run. Init synchronously.
      init();
    }
  }
})();
