/**
 * classroom-board.js
 *
 * Live Classroom board component (r3 -- sprite scene render layer).
 * PLAIN browser script -- no ES import/export.  Load via:
 *   <script src="canvas_engine.js"></script>
 *   <script src="sprite_sheet.js"></script>
 *   <script src="classroom-board.js"></script>
 *
 * Attaches window.ClassroomBoard with the frozen API:
 *
 *   ClassroomBoard.mount(container, opts) -> handle
 *   handle.destroy()
 *   handle.setNameMap(map)
 *   handle.armGate(theme)      -- v1b teacher method
 *   handle.greenLight(opts?)   -- v1c teacher method (opts: {startVideo?,videoRef?})
 *   handle.reset()             -- v1b teacher method
 *
 * opts (r3): { wsUrl, section, username, role, nameMap?, onStateChange?,
 *              hue?, onStartVideo? }
 *   hue: integer 0-359 or null.  Sent in classroom_join; used to tint this
 *   user's own avatar on the board.
 *   onStartVideo: optional function(videoRef).  Called once per inbound
 *   classroom_greenlight whose startVideo === true.  videoRef is the string
 *   the broadcast carried (or null).
 *
 * Internal state reduction is exposed as a pure function:
 *   ClassroomBoard._reduce(state, message) -> newState
 *
 * This function has NO side effects and requires NO canvas context.
 *
 * Rendering (r3): responsive animated sprite scene driven by CanvasEngine.
 * Students appear as tinted sprites (idle-blink / walk animations).
 * On present->checkedIn a student walks toward the gate door then is removed.
 * online:false members render dimmed (globalAlpha).
 * greenlight -> a brief scene-layer text overlay.
 *
 * WS protocol: sends classroom_join on open, classroom_heartbeat every 30s.
 * Reconnects on drop with exponential backoff (1s start, 30s cap).
 * Re-sends classroom_join on every (re)connect.
 *
 * ASCII-only.  LF line endings.
 */

(function (root) {
  'use strict';

  // --- WS timing knobs --------------------------------------------------

  var HEARTBEAT_MS    = 30000;   // 30 s
  var RECONNECT_BASE  = 1000;    // 1 s initial backoff
  var RECONNECT_CAP   = 30000;   // 30 s max backoff

  // --- greenlight render knob -------------------------------------------

  var GREENLIGHT_MS = 2000;      // banner lingers for 2 s

  // --- sprite layout knobs ----------------------------------------------

  var SPRITE_SCALE   = 0.25;     // peer scale (same as cr PeerSprite)
  var SPRITE_W       = 80;       // frame width px
  var SPRITE_H       = 96;       // frame height px
  var DOOR_W         = 60;       // gate door width (px, CSS space)
  var DOOR_H         = 80;       // gate door height (px, CSS space)

  // Board canvas height (px, CSS space). Width tracks the host container --
  // the scene is a horizontal row, so only the height is fixed.
  var BOARD_H        = 220;
  var DEFAULT_BOARD_W = 320;     // fallback when container.clientWidth is 0

  // Walk speed: pixels per second toward the door
  var WALK_SPEED     = 120;

  // --- animation frame indices (cr reference: player_sprite.js) ---------

  var IDLE_FRAMES = [0, 10];   // idle blink
  var WALK_FRAMES = [2, 3, 4, 5]; // walk cycle

  var IDLE_BLINK_SPEED  = 3.0;  // seconds between blinks
  var WALK_FRAME_SPEED  = 0.12; // seconds per walk frame

  // --- unique canvas id generator ---------------------------------------

  var _canvasSeq = 0;
  function nextCanvasId() {
    _canvasSeq += 1;
    return 'classroom-board-canvas-' + _canvasSeq;
  }

  // --- hashStringToHue --------------------------------------------------
  // Exact copy from curriculum_render/js/sprite_manager.js.
  // Maps any string to a hue in [0, 359].

  function hashStringToHue(input) {
    var hash = 0;
    for (var i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash = hash | 0;  // keep 32-bit signed
    }
    return Math.abs(hash) % 360;
  }

  // --- legacy helpers kept for _assignCells (exposed for tests) ---------

  var GRID_COLS = 40;
  var GRID_ROWS = 30;
  var GRID_SIZE = GRID_COLS * GRID_ROWS;

  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h >>> 0;
    }
    return h;
  }

  /**
   * assignCells -- kept for backward-compat (tests pin _assignCells).
   * Not used by the r3 render layer.
   */
  function assignCells(usernames) {
    var sorted   = usernames.slice().sort();
    var occupied = {};
    var result   = {};

    for (var hr = GRID_ROWS - 4; hr < GRID_ROWS; hr++) {
      for (var hc = GRID_COLS - 4; hc < GRID_COLS; hc++) {
        occupied[hr * GRID_COLS + hc] = true;
      }
    }

    for (var i = 0; i < sorted.length; i++) {
      var name  = sorted[i];
      var start = hashStr(name) % GRID_SIZE;
      var idx   = start;
      var probes = 0;
      while (occupied[idx] && probes < GRID_SIZE) {
        idx = (idx + 1) % GRID_SIZE;
        probes++;
      }
      occupied[idx] = true;
      result[name] = {
        col: idx % GRID_COLS,
        row: Math.floor(idx / GRID_COLS)
      };
    }

    return result;
  }

  // --- pure state reduction (B1 / B3) -----------------------------------

  /**
   * _reduce(state, message) -> state
   *
   * Pure function.  state is never mutated; a new object is returned.
   *
   * state shape:
   * {
   *   members:    { [username]: WireMember },
   *   gate:       { armed, theme, openedAt } | null,
   *   poll:       null,
   *   greenlight: boolean,
   * }
   *
   * WireMember (r3): { username, role, status, online, hue }
   *   status: "present" | "checkedIn"
   *   hue:    integer | null  (additive in r3; durable -- never cleared)
   */
  function _reduce(state, message) {
    if (!message || !message.type) { return state; }

    var members = state.members;
    var newMembers;

    switch (message.type) {

      case 'classroom_state':
        newMembers = {};
        var incoming = message.members || [];
        for (var i = 0; i < incoming.length; i++) {
          var m = incoming[i];
          newMembers[m.username] = {
            username: m.username,
            role:     m.role,
            status:   m.status || 'present',
            online:   m.online !== false,
            hue:      m.hue != null ? m.hue : null
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate  || null,
          poll:       message.poll  || null,
          greenlight: false
        };

      case 'classroom_member_update':
        var upd = message.member;
        if (!upd || !upd.username) { return state; }
        var prev = members[upd.username] || {};
        newMembers = {};
        for (var key in members) {
          newMembers[key] = members[key];
        }
        newMembers[upd.username] = {
          username: upd.username,
          role:     upd.role   !== undefined ? upd.role   : (prev.role   !== undefined ? prev.role   : 'student'),
          status:   upd.status !== undefined ? upd.status : (prev.status !== undefined ? prev.status : 'present'),
          online:   upd.online !== undefined ? (upd.online !== false) : (prev.online !== undefined ? prev.online : true),
          hue:      upd.hue != null ? upd.hue : (prev.hue != null ? prev.hue : null)
        };
        return {
          members:    newMembers,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight
        };

      case 'classroom_member_left':
        var gone = message.username;
        if (!gone || !members[gone]) { return state; }
        newMembers = {};
        for (var k in members) {
          if (k !== gone) { newMembers[k] = members[k]; }
        }
        return {
          members:    newMembers,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight
        };

      case 'classroom_gate':
        // Reset every member's status to "present"; hue is durable (not reset).
        newMembers = {};
        for (var gk in members) {
          var gm = members[gk];
          newMembers[gk] = {
            username: gm.username,
            role:     gm.role,
            status:   'present',
            online:   gm.online,
            hue:      gm.hue != null ? gm.hue : null
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate || null,
          poll:       state.poll,
          greenlight: false
        };

      case 'classroom_greenlight':
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: true
        };

      default:
        return state;
    }
  }

  // --- initial state factory --------------------------------------------

  function emptyState() {
    return { members: {}, gate: null, poll: null, greenlight: false };
  }

  // --- check-in button logic (B3) -- unchanged --------------------------

  function shouldShowCheckinButton(state, username, role) {
    if (role !== 'student')                   { return false; }
    if (!state.gate || !state.gate.armed)     { return false; }
    var me = state.members[username];
    if (!me || me.status !== 'present')       { return false; }
    return true;
  }

  // --- summary builder (B4) -- unchanged --------------------------------

  function buildSummary(state) {
    var arr = [];
    var members = state.members;
    for (var u in members) {
      var m = members[u];
      arr.push({
        username: m.username,
        role:     m.role,
        status:   m.status,
        online:   m.online
      });
    }
    return {
      gate:       state.gate,
      members:    arr,
      greenlight: state.greenlight
    };
  }

  // --- BoardSprite entity (r3) ------------------------------------------

  /**
   * A slim sprite entity for the classroom board.
   * Registered with CanvasEngine; updated every RAF tick.
   *
   * States:
   *   'idle'     -- blinks using IDLE_FRAMES
   *   'walking'  -- plays WALK_FRAMES toward targetX; removes itself on arrival
   *
   * labelText: the display name rendered by CanvasEngine's label pass.
   * online:    when false the sprite renders dimmed (globalAlpha 0.35).
   * hue:       hue-rotate degrees for SpriteSheet.drawFrame.
   * onDrained: callback fired when a walk completes (gate drain).
   */
  function BoardSprite(spriteSheet, opts) {
    this.spriteSheet  = spriteSheet;
    this.x            = opts.x;
    this.y            = opts.y;
    this.scale        = opts.scale    || SPRITE_SCALE;
    this.hue          = opts.hue      || 0;
    this.online       = opts.online   !== false;
    this.labelText    = opts.label    || '';
    this.onDrained    = opts.onDrained || null;

    this.state        = 'idle';
    this.targetX      = 0;
    this.walkDir      = 1;   // 1 = right, -1 = left

    // Idle-blink animation
    this.idleTimer        = 0;
    this.currentIdleFrame = 0;

    // Walk cycle animation
    this.walkTimer        = 0;
    this.currentWalkFrame = 0;

    this.frameIndex = IDLE_FRAMES[0];

    // Set by CanvasEngine when the entity is added.
    this.engine = null;
  }

  BoardSprite.prototype.walkTo = function (targetX) {
    this.state        = 'walking';
    this.targetX      = targetX;
    this.walkDir      = (targetX > this.x) ? 1 : -1;
    this.walkTimer    = 0;
    this.currentWalkFrame = 0;
    this.frameIndex   = WALK_FRAMES[0];
  };

  // Cancel an in-flight walk and return to the idle blink loop.
  BoardSprite.prototype.resetToIdle = function () {
    this.state            = 'idle';
    this.idleTimer        = 0;
    this.currentIdleFrame = 0;
    this.frameIndex       = IDLE_FRAMES[0];
  };

  BoardSprite.prototype.update = function (dt) {
    if (this.state === 'idle') {
      this._updateIdle(dt);
    } else if (this.state === 'walking') {
      this._updateWalk(dt);
    }
  };

  BoardSprite.prototype._updateIdle = function (dt) {
    this.idleTimer += dt;
    if (this.currentIdleFrame === 1) {
      // Currently blinking -- hold the blink frame for ~0.15s.
      if (this.idleTimer >= 0.15) {
        this.currentIdleFrame = 0;
        this.idleTimer = 0;
      }
    } else if (this.idleTimer >= IDLE_BLINK_SPEED) {
      // Time to blink.
      this.currentIdleFrame = 1;
      this.idleTimer = 0;
    }
    this.frameIndex = IDLE_FRAMES[this.currentIdleFrame];
  };

  BoardSprite.prototype._updateWalk = function (dt) {
    // Advance walk-cycle frame
    this.walkTimer += dt;
    if (this.walkTimer >= WALK_FRAME_SPEED) {
      this.walkTimer -= WALK_FRAME_SPEED;
      this.currentWalkFrame = (this.currentWalkFrame + 1) % WALK_FRAMES.length;
      this.frameIndex = WALK_FRAMES[this.currentWalkFrame];
    }

    // Move toward targetX
    var step = WALK_SPEED * dt;
    var remaining = Math.abs(this.targetX - this.x);
    if (step >= remaining) {
      this.x = this.targetX;
      // Arrived -- drain
      if (typeof this.onDrained === 'function') {
        this.onDrained();
      }
      this.state = 'arrived';
    } else {
      this.x += this.walkDir * step;
    }
  };

  BoardSprite.prototype.render = function (ctx) {
    var alpha = this.online ? 1.0 : 0.35;
    if (alpha !== 1.0) { ctx.save(); ctx.globalAlpha = alpha; }
    this.spriteSheet.drawFrame(ctx, this.frameIndex, this.x, this.y, this.scale, this.hue);
    if (alpha !== 1.0) { ctx.restore(); }
  };

  BoardSprite.prototype.getLabelSpec = function () {
    var sw = SPRITE_W * this.scale;
    var centerX = this.x + sw / 2;
    var topY    = this.y;
    return {
      text:  this.labelText,
      x:     centerX,
      y:     topY,
      isGold: false
    };
  };

  // --- GreenLightOverlay entity -----------------------------------------

  /**
   * A one-shot scene overlay entity that renders the "GO!" banner.
   * Fades out over GREENLIGHT_MS ms then removes itself.
   */
  function GreenLightOverlay(getElapsedFn) {
    this.getElapsed = getElapsedFn;
    this.engine = null;
  }

  GreenLightOverlay.prototype.update = function () {};  // no physics

  GreenLightOverlay.prototype.render = function (ctx) {
    var age = this.getElapsed();
    if (age > GREENLIGHT_MS) {
      // Let the engine hold it; the board's manager removes it.
      return;
    }
    var alpha = 1 - (age / GREENLIGHT_MS);
    var cw = this.engine ? (this.engine.canvas.width  / (root.devicePixelRatio || 1)) : 400;
    var ch = this.engine ? (this.engine.canvas.height / (root.devicePixelRatio || 1)) : 300;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#22AA22';
    ctx.fillRect(0, 0, cw, 24);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#FFFFFF';
    ctx.font        = 'bold 16px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GO!', cw / 2, 12);
    ctx.restore();
  };

  // --- GateDoor entity --------------------------------------------------

  /**
   * Draws the gate door on the right side of the scene.
   * Drawn whenever the gate is armed.
   */
  function GateDoor(getGroundY) {
    this.getGroundY = getGroundY;
    this.engine = null;
  }

  GateDoor.prototype.update = function () {};

  GateDoor.prototype.render = function (ctx) {
    var cw = this.engine ? (this.engine.canvas.width  / (root.devicePixelRatio || 1)) : 400;
    var gy = this.getGroundY();
    var x  = cw - DOOR_W - 10;
    var y  = gy - DOOR_H;
    var w  = DOOR_W;
    var h  = DOOR_H;

    // Door frame
    ctx.save();
    ctx.strokeStyle = '#8B5E1A';
    ctx.lineWidth   = 4;
    ctx.fillStyle   = '#3B2008';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Door knob
    ctx.fillStyle   = '#D4AF37';
    ctx.beginPath();
    ctx.arc(x + w - 10, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Arrow pointing right into door
    ctx.fillStyle   = '#FFD700';
    ctx.font        = 'bold 18px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('>', x + w / 2, y + h / 2);
    ctx.restore();
  };

  // --- scene layout helpers ---------------------------------------------

  /**
   * Compute evenly spaced x positions for count avatars within the scene.
   * Mirrors SpriteManager.computeSlots from cr (adapted).
   */
  function computeSlots(count, spriteWidth, viewportWidth) {
    if (count <= 0) { return []; }
    var leftMargin = viewportWidth * 0.10;
    var usable     = viewportWidth - (leftMargin * 2) - DOOR_W - 20;
    if (count === 1) {
      return [leftMargin + usable / 2 - spriteWidth / 2];
    }
    var gap = usable / (count - 1);
    var slots = [];
    for (var i = 0; i < count; i++) {
      slots.push(leftMargin + i * gap - spriteWidth / 2);
    }
    return slots;
  }

  // --- mount ------------------------------------------------------------

  /**
   * mount(container, opts) -> handle
   *
   * Creates a normally-sized responsive canvas inside `container`,
   * attaches a CanvasEngine RAF loop, and renders animated student sprites.
   *
   * r3 opts gains: { hue: integer|null }
   *
   * Preserved public API: { destroy, setNameMap, armGate, greenLight, reset }
   */
  function mount(container, opts) {
    if (!container || !opts) {
      throw new Error('ClassroomBoard.mount: container and opts are required');
    }

    var wsUrl         = opts.wsUrl;
    var section       = opts.section;
    var username      = opts.username;
    var role          = opts.role || 'student';
    var nameMap       = opts.nameMap || null;
    var onStateChange = opts.onStateChange || null;
    var mountHue      = (opts.hue != null) ? opts.hue : null;
    var onStartVideo  = (typeof opts.onStartVideo === 'function') ? opts.onStartVideo : null;

    // --- canvas setup ---------------------------------------------------

    var canvasId = nextCanvasId();
    var doc = (root.document || document);
    var canvas = doc.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.display = 'block';
    canvas.style.width   = '100%';
    container.appendChild(canvas);

    // --- check-in button (B3) ------------------------------------------

    var checkinBtn = doc.createElement('button');
    checkinBtn.textContent = 'Check in';
    checkinBtn.style.display = 'none';
    checkinBtn.setAttribute('data-classroom-checkin', '1');
    container.appendChild(checkinBtn);

    // --- CanvasEngine setup --------------------------------------------

    // CanvasEngine requires window.innerWidth, window.devicePixelRatio, etc.
    // In a normal browser these are always present.  In tests they are stubbed.
    var engine = null;
    var spriteSheet = null;
    var engineReady = false;

    // The lifted CanvasEngine.resize() sizes the canvas to the FULL viewport
    // (it was built for cr's full-screen sprite overlay). The classroom board
    // is an embedded panel, so sizing is re-pointed at the host container:
    // width tracks container.clientWidth, height is the fixed BOARD_H.
    function resizeBoardToContainer() {
      if (!engine || !engine.ctx) { return; }
      var dpr  = root.devicePixelRatio || 1;
      var cssW = container.clientWidth || DEFAULT_BOARD_W;
      var cssH = BOARD_H;
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.width  = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      engine.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (engine.entities) {
        engine.entities.forEach(function (e) { if (e.onResize) { e.onResize(); } });
      }
      repositionSprites();
    }

    try {
      engine = new root.CanvasEngine(canvasId);
      // CanvasEngine's constructor registered a full-viewport resize listener.
      // Drop it immediately and install our container-aware one (destroy()
      // removes this one again).
      root.removeEventListener('resize', engine.resize);
      engine.resize = resizeBoardToContainer;
      root.addEventListener('resize', resizeBoardToContainer);
      spriteSheet = new root.SpriteSheet(
        'sprite.png', SPRITE_W, SPRITE_H,
        { columns: 11, rows: 2, paddingX: 4, paddingY: 4 }
      );
      resizeBoardToContainer();
      engine.start();
      engineReady = true;
    } catch (e) {
      // Engine not available (e.g., CanvasEngine/SpriteSheet not loaded).
      // Board still works for WS + state reduction.
      engineReady = false;
    }

    // --- sprite entity registry ----------------------------------------

    // spriteEntities: username -> BoardSprite (only "present" students)
    var spriteEntities = {};

    // draining: set of usernames currently walking toward the door
    var draining = {};

    // Previous state snapshot -- used to detect present->checkedIn transitions
    var prevMembers = {};

    // Greenlight overlay timing
    var greenlightShownAt = 0;
    var greenlightTimer   = null;

    // --- layout helpers ------------------------------------------------

    function getSpriteWidth() {
      return SPRITE_W * SPRITE_SCALE;
    }

    function getSpriteY() {
      if (!engineReady) { return 200; }
      var gy = engine.groundY;
      return gy - SPRITE_H * SPRITE_SCALE;
    }

    function getDoorX() {
      if (!engineReady) { return 340; }
      var cw = engine.canvas.width / (root.devicePixelRatio || 1);
      return cw - DOOR_W - 10;
    }

    // Reposition all present sprites in a row.
    function repositionSprites() {
      if (!engineReady) { return; }
      var usernames = Object.keys(spriteEntities);
      if (usernames.length === 0) { return; }
      var sw  = getSpriteWidth();
      var cw  = engine.canvas.width / (root.devicePixelRatio || 1);
      var xs  = computeSlots(usernames.length, sw, cw);
      var sy  = getSpriteY();
      for (var i = 0; i < usernames.length; i++) {
        var sp = spriteEntities[usernames[i]];
        // Only reposition idle sprites; do not interrupt a walk.
        if (sp && sp.state === 'idle') {
          sp.x = xs[i];
          sp.y = sy;
        }
      }
    }

    // Resolve the display hue for a member.
    function resolveHue(member) {
      if (member.hue != null) { return member.hue; }
      return hashStringToHue(member.username);
    }

    // Create a sprite for a member and add it to the engine.
    function addSprite(member) {
      if (!engineReady || !spriteSheet) { return; }
      if (spriteEntities[member.username]) { return; }  // already present
      var label  = (nameMap && nameMap[member.username]) ? nameMap[member.username] : member.username;
      var sy     = getSpriteY();
      var hue    = resolveHue(member);
      var sp = new BoardSprite(spriteSheet, {
        x:      0,
        y:      sy,
        scale:  SPRITE_SCALE,
        hue:    hue,
        online: member.online !== false,
        label:  label,
        onDrained: (function (uname) {
          return function () {
            // Walk completed -- remove from engine and registry, reflow the row.
            engine.removeEntity('sprite_' + uname);
            delete spriteEntities[uname];
            delete draining[uname];
            repositionSprites();
          };
        })(member.username)
      });
      spriteEntities[member.username] = sp;
      engine.addEntity('sprite_' + member.username, sp);
      repositionSprites();
    }

    // Remove a sprite immediately (e.g. member left).
    function removeSprite(username) {
      if (!engineReady) { return; }
      if (!spriteEntities[username]) { return; }
      engine.removeEntity('sprite_' + username);
      delete spriteEntities[username];
      delete draining[username];
    }

    // Update an existing sprite's properties.
    function updateSprite(member) {
      var sp = spriteEntities[member.username];
      if (!sp) { return; }
      sp.online = member.online !== false;
      sp.hue    = resolveHue(member);
      var label = (nameMap && nameMap[member.username]) ? nameMap[member.username] : member.username;
      sp.labelText = label;
    }

    // Trigger the walk-to-door animation for a member.
    function startDrain(username) {
      if (!engineReady) { return; }
      if (draining[username]) { return; }  // already walking
      var sp = spriteEntities[username];
      if (!sp) { return; }
      draining[username] = true;
      var doorX = getDoorX();
      sp.walkTo(doorX);
    }

    // Gate door entity (shown when gate is armed)
    var gateDoor = null;

    function showGateDoor() {
      if (!engineReady) { return; }
      if (gateDoor) { return; }
      gateDoor = new GateDoor(function () { return engine.groundY; });
      engine.addEntity('gate_door', gateDoor);
    }

    function hideGateDoor() {
      if (!engineReady) { return; }
      if (!gateDoor) { return; }
      engine.removeEntity('gate_door');
      gateDoor = null;
    }

    // Greenlight overlay entity
    var greenlightOverlay = null;
    var greenlightStartMs = 0;

    function showGreenlight() {
      if (!engineReady) { return; }
      greenlightStartMs = Date.now();
      if (greenlightOverlay) { return; }
      greenlightOverlay = new GreenLightOverlay(function () {
        return Date.now() - greenlightStartMs;
      });
      engine.addEntity('greenlight_overlay', greenlightOverlay);

      // Remove after GREENLIGHT_MS + a small buffer.
      if (greenlightTimer) { clearTimeout(greenlightTimer); }
      greenlightTimer = setTimeout(function () {
        if (engineReady && greenlightOverlay) {
          engine.removeEntity('greenlight_overlay');
          greenlightOverlay = null;
        }
        greenlightTimer = null;
      }, GREENLIGHT_MS + 200);
    }

    // --- full scene sync from state ------------------------------------

    function syncScene(newState) {
      if (!engineReady) { return; }

      var members = newState.members;

      // Show/hide the gate door.
      if (newState.gate && newState.gate.armed) {
        showGateDoor();
      } else {
        hideGateDoor();
      }

      // Determine which students should be present (drawn).
      var presentStudents = {};
      for (var u in members) {
        var mb = members[u];
        if (mb.role === 'student' && mb.status !== 'checkedIn') {
          presentStudents[u] = mb;
        }
      }

      // Detect present->checkedIn transitions FIRST so we can mark them as
      // draining before the removal pass skips them.
      for (var tname in members) {
        var cur  = members[tname];
        var prev = prevMembers[tname];
        if (cur.role === 'student' &&
            cur.status === 'checkedIn' &&
            prev && prev.status === 'present' &&
            !draining[tname] &&
            spriteEntities[tname]) {
          startDrain(tname);
        }
      }

      // Cancel an in-flight drain for any student who is "present" again --
      // e.g. the gate was re-armed (classroom_gate resets every status to
      // present) while the avatar was still walking to the door. Without
      // this the sprite stays in its walk and onDrained() removes a present
      // student from the board (Codex r3 review, MAJOR).
      for (var cdname in draining) {
        if (presentStudents[cdname] && spriteEntities[cdname]) {
          delete draining[cdname];
          spriteEntities[cdname].resetToIdle();
        }
      }

      // Remove sprites for members no longer in presentStudents and not draining.
      for (var existing in spriteEntities) {
        if (!presentStudents[existing] && !draining[existing]) {
          removeSprite(existing);
        }
      }

      // Add or update sprites for present students.
      for (var pname in presentStudents) {
        if (spriteEntities[pname]) {
          updateSprite(presentStudents[pname]);
        } else {
          addSprite(presentStudents[pname]);
        }
      }

      // Reflow the row after any add / remove / drain-cancel this sync.
      repositionSprites();

      prevMembers = members;
    }

    // --- state --------------------------------------------------------

    var state          = emptyState();
    var destroyed      = false;
    var ws             = null;
    var heartbeatTimer = null;
    var reconnectTimer = null;
    var reconnectDelay = RECONNECT_BASE;

    function refreshButton() {
      if (!checkinBtn) { return; }
      checkinBtn.style.display = shouldShowCheckinButton(state, username, role)
        ? 'inline-block'
        : 'none';
    }

    function notifyStateChange() {
      if (typeof onStateChange === 'function') {
        onStateChange(buildSummary(state));
      }
    }

    function applyMessage(msg) {
      state = _reduce(state, msg);
      if (msg.type === 'classroom_greenlight') {
        showGreenlight();
      }
      if (msg.type === 'classroom_greenlight' && msg.startVideo === true && onStartVideo) {
        try { onStartVideo(msg.videoRef || null); } catch (_) {}
      }
      syncScene(state);
      refreshButton();
      notifyStateChange();
    }

    function safeSend(obj) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
      }
    }

    function sendJoin() {
      safeSend({
        type:     'classroom_join',
        section:  section,
        username: username,
        role:     role,
        hue:      mountHue
      });
    }

    function sendHeartbeat() {
      safeSend({ type: 'classroom_heartbeat' });
    }

    checkinBtn.onclick = function () {
      safeSend({ type: 'classroom_checkin' });
    };

    function connect() {
      if (destroyed) { return; }
      var WS = (root.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null));
      if (!WS) { return; }

      ws = new WS(wsUrl);

      ws.onopen = function () {
        reconnectDelay = RECONNECT_BASE;
        sendJoin();
        heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
      };

      ws.onmessage = function (event) {
        var msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg && msg.type && msg.type.indexOf('classroom_') === 0) {
          applyMessage(msg);
        }
      };

      ws.onerror = function () {};

      ws.onclose = function () {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (destroyed) { return; }
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_CAP);
          connect();
        }, reconnectDelay);
      };
    }

    // Initial scene sync (empty state) + connect.
    syncScene(state);
    connect();

    // --- public handle ------------------------------------------------

    var handle = {

      destroy: function () {
        destroyed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(reconnectTimer);
        clearTimeout(greenlightTimer);
        heartbeatTimer  = null;
        reconnectTimer  = null;
        greenlightTimer = null;
        if (ws) {
          ws.onclose = null;
          ws.close();
          ws = null;
        }
        if (engineReady) {
          engine.stop();
        }
        // Drop the resize listener installed in mount() -- harmless no-op if
        // engine setup failed before it was added (Codex r3 review, MAJOR).
        root.removeEventListener('resize', resizeBoardToContainer);
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        if (checkinBtn.parentNode) {
          checkinBtn.parentNode.removeChild(checkinBtn);
        }
      },

      setNameMap: function (map) {
        nameMap = map || null;
        // Update all existing sprite labels.
        for (var u in spriteEntities) {
          var sp = spriteEntities[u];
          sp.labelText = (nameMap && nameMap[u]) ? nameMap[u] : u;
        }
      },

      // --- v1b teacher methods (B4) ---

      armGate: function (theme) {
        safeSend({ type: 'classroom_arm_gate', theme: theme || '' });
      },

      greenLight: function (opts) {
        var o = opts || {};
        safeSend({
          type:       'classroom_go',
          startVideo: o.startVideo === true,
          videoRef:   (typeof o.videoRef === 'string') ? o.videoRef : null
        });
      },

      reset: function () {
        safeSend({ type: 'classroom_reset' });
      }
    };

    return handle;
  }

  // --- public API -------------------------------------------------------

  root.ClassroomBoard = {
    mount:            mount,
    _reduce:          _reduce,
    _assignCells:     assignCells,
    _hashStringToHue: hashStringToHue   // exposed for tests
  };

}(typeof window !== 'undefined' ? window : this));
