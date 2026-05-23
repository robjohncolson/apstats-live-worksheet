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

  // --- engine globals bridge (r3 render-layer fix) ----------------------
  // canvas_engine.js / sprite_sheet.js are verbatim curriculum_render copies:
  // bare top-level `class` declarations. As classic <script>s, a top-level
  // class is a global LEXICAL binding -- NOT a window property. mount() reads
  // them as root.CanvasEngine / root.SpriteSheet (root === window), so without
  // this bridge the lookup is undefined, `new root.CanvasEngine(...)` throws,
  // engineReady stays false, and the board silently never renders. Copy the
  // lexical bindings onto root. typeof-guarded so a missing engine file cannot
  // throw at IIFE top (window.ClassroomBoard must still get defined); the
  // !root.X guard leaves a test-injected window stub unclobbered.
  if (typeof CanvasEngine !== 'undefined' && !root.CanvasEngine) {
    root.CanvasEngine = CanvasEngine;
  }
  if (typeof SpriteSheet !== 'undefined' && !root.SpriteSheet) {
    root.SpriteSheet = SpriteSheet;
  }

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

  // --- player controller knobs (Phase 1) --------------------------------
  // KEYBOARD_AVATAR_SPEC -- locked Phase 1 kinematics.

  var JUMP_V0    = -280;     // initial vertical velocity (negative = up)
  var GRAVITY    = 800;      // px/s^2 downward
  var PUSH_DELTA = 0.6;      // px lateral nudge per overlapping tick
  var JUMP_FRAME = 5;        // sprite frame for the airborne pose (cr-matching)
  var POS_RATE_MS = 100;     // Phase 2: 10 Hz position broadcast while moving

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
   *   poll:       { id, question, options, blind } | null,
   *   greenlight: boolean,
   *   closedPoll: { id, question, options, blind, tally } | null,
   * }
   *
   * WireMember (v2): { username, role, status, online, hue, vote }
   *   status: "present" | "checkedIn" | "voted"
   *   hue:    integer | null  (additive in r3; durable -- never cleared)
   *   vote:   integer | null  (option index; null if not voted or masked)
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
            hue:      m.hue  != null ? m.hue  : null,
            vote:     m.vote != null ? m.vote : null,
            pos:      m.pos  != null ? m.pos  : null   // Phase 2 -- last-known pos
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate  || null,
          poll:       message.poll  || null,
          greenlight: false,
          // A classroom_state snapshot is sent on JOIN or RESET
          // (LIVE_CLASSROOM_SPEC S5.3) -- there is no classroom_reset
          // broadcast. A fresh snapshot carries no closed-poll concept, so
          // clear it: this is what dismisses the result screen on a reset.
          closedPoll: null
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
          hue:      upd.hue  != null ? upd.hue  : (prev.hue  != null ? prev.hue  : null),
          vote:     upd.vote != null ? upd.vote : (prev.vote != null ? prev.vote : null),
          pos:      upd.pos  != null ? upd.pos  : (prev.pos  != null ? prev.pos  : null)
        };
        return {
          members:    newMembers,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll != null ? state.closedPoll : null
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
          greenlight: state.greenlight,
          closedPoll: state.closedPoll != null ? state.closedPoll : null
        };

      case 'classroom_gate':
        // Reset every member's status to "present"; hue and pos are durable
        // (not reset by armGate).
        newMembers = {};
        for (var gk in members) {
          var gm = members[gk];
          newMembers[gk] = {
            username: gm.username,
            role:     gm.role,
            status:   'present',
            online:   gm.online,
            hue:      gm.hue != null ? gm.hue : null,
            vote:     null,
            pos:      gm.pos != null ? gm.pos : null
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate || null,
          poll:       state.poll,
          greenlight: false,
          closedPoll: null
        };

      case 'classroom_greenlight':
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: true,
          closedPoll: state.closedPoll != null ? state.closedPoll : null
        };

      // --- v2 poll cases (pure) -----------------------------------------

      case 'classroom_poll':
        // Poll opened: store poll metadata, reset every member vote to null
        // AND status to 'present' (mirrors the server openPoll reset).
        // Without the status reset, a second poll opens with members still
        // showing status:'voted' and vote buttons hidden (Finding 3).
        // hue + pos are durable (carried across the reset).
        newMembers = {};
        for (var pk in members) {
          var pm = members[pk];
          newMembers[pk] = {
            username: pm.username,
            role:     pm.role,
            status:   'present',
            online:   pm.online,
            hue:      pm.hue,
            vote:     null,
            pos:      pm.pos != null ? pm.pos : null
          };
        }
        return {
          members:    newMembers,
          gate:       state.gate,
          poll: {
            id:       message.id,
            question: message.question,
            options:  message.options || [],
            blind:    message.blind === true
          },
          greenlight: state.greenlight,
          closedPoll: null
        };

      case 'classroom_poll_closed':
        // Poll closed: clear poll, preserve members as-is.
        // Capture the pre-close poll + the message tally into closedPoll so
        // the render layer can show the result screen.
        var closedSnapshot = null;
        if (state.poll) {
          closedSnapshot = {
            id:       state.poll.id,
            question: state.poll.question,
            options:  state.poll.options,
            blind:    state.poll.blind,
            tally:    message.tally || []
          };
        }
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       null,
          greenlight: state.greenlight,
          closedPoll: closedSnapshot
        };

      case 'classroom_poll_reveal':
        // Blind poll revealed: no state change needed beyond member votes
        // (which arrive in the member list if provided).
        // The reveal message carries members: [{username, vote}].
        if (!message.members || !message.members.length) {
          return state;
        }
        newMembers = {};
        for (var rk in members) {
          newMembers[rk] = members[rk];
        }
        var revealList = message.members;
        for (var ri = 0; ri < revealList.length; ri++) {
          var rv = revealList[ri];
          if (rv.username && newMembers[rv.username]) {
            var existing = newMembers[rv.username];
            newMembers[rv.username] = {
              username: existing.username,
              role:     existing.role,
              status:   existing.status,
              online:   existing.online,
              hue:      existing.hue,
              vote:     rv.vote != null ? rv.vote : existing.vote,
              pos:      existing.pos != null ? existing.pos : null
            };
          }
        }
        return {
          members:    newMembers,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll != null ? state.closedPoll : null
        };

      // NOTE: there is no 'classroom_reset' broadcast -- a teacher reset is
      // delivered to clients AS a classroom_state snapshot (handled above,
      // which clears closedPoll). See LIVE_CLASSROOM_SPEC S5.2/S5.3.

      default:
        return state;
    }
  }

  // --- initial state factory --------------------------------------------

  function emptyState() {
    return { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null };
  }

  // --- check-in button logic (B3) -- unchanged --------------------------

  function shouldShowCheckinButton(state, username, role) {
    if (role !== 'student')                   { return false; }
    if (!state.gate || !state.gate.armed)     { return false; }
    var me = state.members[username];
    if (!me || me.status !== 'present')       { return false; }
    return true;
  }

  // --- summary builder (B4) -- extended with poll + tally ---------------

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

    // Compute per-option tally from current member votes.
    var tally = null;
    if (state.poll && state.poll.options) {
      tally = [];
      for (var oi = 0; oi < state.poll.options.length; oi++) {
        tally.push(0);
      }
      for (var mu in members) {
        var mv = members[mu];
        if (mv.vote != null && mv.vote >= 0 && mv.vote < tally.length) {
          tally[mv.vote] += 1;
        }
      }
    }

    return {
      gate:       state.gate,
      poll:       state.poll  || null,
      tally:      tally,
      closedPoll: state.closedPoll || null,
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
    this.facingRight  = true; // sheet bottom row = left-facing; +11 offset via _directedFrame

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
    this.facingRight  = (this.walkDir > 0);   // peers walking left now face left
    this.walkTimer    = 0;
    this.currentWalkFrame = 0;
    this.frameIndex   = this._directedFrame(WALK_FRAMES[0]);
  };

  // Direction-aware frame select: sprite sheet has both directions baked
  // in (top row 0-10 right-facing, bottom row 11-21 left-facing, mirrored).
  // Add +11 to any base frame to flip. Per cr/player_sprite.js line 182.
  BoardSprite.prototype._directedFrame = function (baseFrame) {
    return this.facingRight ? baseFrame : baseFrame + 11;
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
    this.frameIndex = this._directedFrame(IDLE_FRAMES[this.currentIdleFrame]);
  };

  BoardSprite.prototype._updateWalk = function (dt) {
    // Advance walk-cycle frame
    this.walkTimer += dt;
    if (this.walkTimer >= WALK_FRAME_SPEED) {
      this.walkTimer -= WALK_FRAME_SPEED;
      this.currentWalkFrame = (this.currentWalkFrame + 1) % WALK_FRAMES.length;
      this.frameIndex = this._directedFrame(WALK_FRAMES[this.currentWalkFrame]);
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

  // --- PlayerSprite (Phase 1: local keyboard-controlled) -----------------
  //
  // Extends BoardSprite. Reads from a shared {left, right, jump, up} object
  // updated by mount()'s keyboard listener; applies vx + jump physics +
  // soft-push every tick. When state === 'walking' (drain animation set
  // by walkTo), the inherited _updateWalk path runs and keyboard input is
  // ignored -- one way out the door.
  //
  // Extra opts (in addition to BoardSprite's):
  //   input        -- shared {left, right, jump, up} booleans
  //   peers        -- () -> map<username, BoardSprite>
  //   onUpPressed  -- edge-triggered callback(player) when Up is pressed
  //   canvasW      -- () -> current viewport width in CSS px

  function PlayerSprite(spriteSheet, opts) {
    BoardSprite.call(this, spriteSheet, opts);
    this.input        = opts.input || { left: false, right: false, jump: false, up: false };
    this.peers        = (typeof opts.peers === 'function') ? opts.peers : function () { return {}; };
    this.onUpPressed  = (typeof opts.onUpPressed === 'function') ? opts.onUpPressed : null;
    this._canvasW     = (typeof opts.canvasW === 'function') ? opts.canvasW : function () { return DEFAULT_BOARD_W; };
    this.groundY      = opts.y;
    this.vx           = 0;
    this.vy           = 0;
    this._jumpHandled = false;
    this._upHandled   = false;
    this._moved       = false;
    this._spriteSize   = SPRITE_W * (opts.scale || SPRITE_SCALE);
    this._spriteHeight = SPRITE_H * (opts.scale || SPRITE_SCALE);

    // Phase 2.1 -- carry-while-standing. standingOn is the peer sprite we're
    // resting on top of (or null = ground / airborne). _standingOnLastX caches
    // that peer's x at the END of the prior tick so update() can apply the
    // peer's delta this tick (Mario-style platform carry).
    this.standingOn       = null;
    this._standingOnLastX = null;

    // Phase 2 -- position broadcast hook + rate-limit clock.
    // onPos -- function({x, y, state, vx}); mount() wires it to safeSend.
    // _now  -- injectable clock for deterministic tests (default Date.now).
    this.onPos         = (typeof opts.onPos === 'function') ? opts.onPos : null;
    this._now          = (typeof opts.now === 'function') ? opts.now : function () { return Date.now(); };
    this._lastPosMs    = 0;
    this._restEmitted  = false;
  }
  PlayerSprite.prototype = Object.create(BoardSprite.prototype);
  PlayerSprite.prototype.constructor = PlayerSprite;

  PlayerSprite.prototype.update = function (dt) {
    // Drain (walkTo target-based) overrides keyboard -- one way out the door.
    if (this.state === 'walking') { this._updateWalk(dt); return; }

    // Up edge-trigger: fire the action callback once per press, never on hold.
    if (this.input.up && !this._upHandled) {
      this._upHandled = true;
      if (this.onUpPressed) {
        try { this.onUpPressed(this); } catch (_) {}
      }
    } else if (!this.input.up) {
      this._upHandled = false;
    }

    // Horizontal velocity from L/R; flip facing for direction-aware frames.
    var vxNext = 0;
    if (this.input.left)  { vxNext -= WALK_SPEED; this.facingRight = false; }
    if (this.input.right) { vxNext += WALK_SPEED; this.facingRight = true;  }
    this.vx = vxNext;

    // Jump edge-trigger: only when on a floor (ground OR a peer's head);
    // no auto-repeat while Space held. Jumping hops us OFF the carrier.
    if (this.input.jump && !this._jumpHandled) {
      this._jumpHandled = true;
      if (this.state !== 'jumping' && this._onFloor()) {
        this.vy         = JUMP_V0;
        this.state      = 'jumping';
        this.standingOn = null;
      }
    } else if (!this.input.jump) {
      this._jumpHandled = false;
    }

    // Track active motion -- repositionSprites stops auto-laying the player
    // out once this flips (D2: stays where last walked).
    if (this.vx !== 0 || this.state === 'jumping') {
      this._moved = true;
    }

    // -- Carry-while-standing (Phase 2.1) -- ride the peer we're on top of.
    // The peer's x change since our last tick gets added to our x BEFORE we
    // apply our own input motion. Mario-style platform carry. carryDx is 0
    // when we're not on anyone or the cache hasn't been seeded yet.
    if (this.standingOn && typeof this._standingOnLastX === 'number') {
      var carryDx = this.standingOn.x - this._standingOnLastX;
      if (carryDx !== 0) {
        this.x += carryDx;
        this._moved = true;
      }
    }

    // Player's own horizontal motion.
    this.x += this.vx * dt;

    // Gravity + vertical integrate, always. The floor snap below puts us
    // back on whichever surface we crossed (re-lands each tick when at rest
    // -- cheap and self-correcting if a peer moves under us in Phase 2).
    this.vy += GRAVITY * dt;
    var prevY = this.y;
    this.y   += this.vy * dt;

    // Floor candidates: the ground (always blocks) + each peer's head as a
    // one-way platform. Land at the highest (smallest y) candidate the
    // player just crossed FROM ABOVE this tick (prevY <= floor && y >= floor).
    // Track which peer (if any) we landed on -- becomes the new standingOn.
    var peersMap    = this.peers();
    var bestFloor   = null;
    var landingPeer = null;
    if (prevY <= this.groundY && this.y >= this.groundY) {
      bestFloor = this.groundY;
    }
    for (var u in peersMap) {
      var p = peersMap[u];
      if (!p || p === this) { continue; }
      if (!this._horizontalOverlap(p)) { continue; }
      var landingY = p.y - this._spriteHeight;
      if (prevY <= landingY && this.y >= landingY) {
        if (bestFloor === null || landingY < bestFloor) {
          bestFloor   = landingY;
          landingPeer = p;
        }
      }
    }
    if (bestFloor !== null) {
      this.y  = bestFloor;
      this.vy = 0;
      if (this.state === 'jumping') {
        this.state           = 'idle';
        this.idleTimer       = 0;
        this.currentIdleFrame = 0;
      }
      this.standingOn = landingPeer;   // peer ref, or null (= on the ground)
    } else if (this.vy > 0 && this.state !== 'jumping') {
      // Falling without a floor (walked off a peer / off a ledge) -- mark
      // airborne so the frame select uses the jump pose AND drop the carry.
      this.state      = 'jumping';
      this.standingOn = null;
    }

    // -- Solid horizontal collision (Phase 2.1) -- a same-level peer in
    // the path stops motion: snap self to just-touching the peer's edge.
    // Skipped while airborne -- mid-jump you pass each other laterally.
    if (this.state !== 'jumping') {
      for (var u2 in peersMap) {
        var pp = peersMap[u2];
        if (!pp || pp === this) { continue; }
        if (!this._sameLevel(pp) || !this._horizontalOverlap(pp)) { continue; }
        if (this.vx > 0) {
          this.x = pp.x - this._spriteSize;
        } else if (this.vx < 0) {
          this.x = pp.x + this._spriteSize;
        } else {
          // Stationary but overlapping (peer walked into us). Push self
          // outward by the smaller distance.
          var dxC = this.x - pp.x;
          this.x = (dxC >= 0) ? (pp.x + this._spriteSize) : (pp.x - this._spriteSize);
        }
        this._moved = true;
      }
    }

    // Clamp x to viewport.
    var cw   = this._canvasW();
    var maxX = cw - this._spriteSize;
    if (this.x < 0)    { this.x = 0; }
    if (this.x > maxX) { this.x = maxX; }

    // Cache the carrier's x for next tick's carry math.
    this._standingOnLastX = this.standingOn ? this.standingOn.x : null;

    // Frame selection -- direction-aware via _directedFrame.
    if (this.state === 'jumping') {
      this.frameIndex = this._directedFrame(JUMP_FRAME);
    } else if (this.vx !== 0) {
      this.walkTimer += dt;
      if (this.walkTimer >= WALK_FRAME_SPEED) {
        this.walkTimer -= WALK_FRAME_SPEED;
        this.currentWalkFrame = (this.currentWalkFrame + 1) % WALK_FRAMES.length;
      }
      this.frameIndex = this._directedFrame(WALK_FRAMES[this.currentWalkFrame]);
    } else {
      // Inherited _updateIdle already routes through _directedFrame.
      this._updateIdle(dt);
    }

    // Phase 2 -- broadcast position. 10 Hz while moving (any input held OR
    // airborne OR being carried by a walking peer); ONE final "rest" snapshot
    // when motion ends; then 0 Hz until the next input. The carry-emit lets
    // a passenger's view stay in sync at the peer's broadcast cadence even
    // though the passenger's own input is released.
    if (this.onPos) {
      var beingCarried = (this.standingOn && this.standingOn.state === 'walking');
      var moving = (this.vx !== 0) || (this.state === 'jumping') ||
                   this.input.left  || this.input.right ||
                   this.input.jump  || this.input.up ||
                   !!beingCarried;
      var now = this._now();
      if (moving) {
        if (now - this._lastPosMs >= POS_RATE_MS) {
          try { this.onPos({ x: this.x, y: this.y, state: this.state, vx: this.vx }); } catch (_) {}
          this._lastPosMs   = now;
          this._restEmitted = false;
        }
      } else if (!this._restEmitted) {
        try { this.onPos({ x: this.x, y: this.y, state: this.state, vx: 0 }); } catch (_) {}
        this._lastPosMs   = now;
        this._restEmitted = true;
      }
    }
  };

  // Re-anchor groundY when the engine resizes (the platform under the
  // sprite shifts as the canvas height changes).
  PlayerSprite.prototype.onResize = function () {
    if (this.engine && typeof this.engine.groundY === 'number') {
      this.groundY = this.engine.groundY - SPRITE_H * this.scale;
      if (this.y > this.groundY && this.state !== 'jumping') {
        this.y = this.groundY;
      }
    }
  };

  // Collision helpers (Phase 1.5).
  PlayerSprite.prototype._horizontalOverlap = function (peer) {
    return Math.abs(this.x - peer.x) < this._spriteSize;
  };
  PlayerSprite.prototype._sameLevel = function (peer) {
    // "Same level" = at the same y to within half a sprite. Soft-push only
    // applies horizontally; when stacked, the y delta is a full sprite and
    // this returns false (no kicking off heads).
    return Math.abs(this.y - peer.y) < (this._spriteHeight / 2);
  };
  PlayerSprite.prototype._onFloor = function () {
    if (this.y >= this.groundY - 0.01) { return true; }
    var peersMap = this.peers();
    for (var u in peersMap) {
      var p = peersMap[u];
      if (!p || p === this) { continue; }
      if (!this._horizontalOverlap(p)) { continue; }
      var landingY = p.y - this._spriteHeight;
      if (Math.abs(this.y - landingY) < 1) { return true; }
    }
    return false;
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

  // --- PollColumnsOverlay entity (v2) -----------------------------------

  /**
   * Draws evenly spaced option label columns when a poll is open.
   * Each option label is shown at the top of its column zone.
   * The label is a thin strip -- full-width dividers would occlude sprites.
   */
  function PollColumnsOverlay(getPoll, getViewportW) {
    this.getPoll      = getPoll;
    this.getViewportW = getViewportW;
    this.engine       = null;
  }

  PollColumnsOverlay.prototype.update = function () {};

  PollColumnsOverlay.prototype.render = function (ctx) {
    var poll = this.getPoll();
    if (!poll || !poll.options || poll.options.length < 2) { return; }

    var options = poll.options;
    var count   = options.length;
    var vw      = this.getViewportW();
    var colW    = vw / count;

    ctx.save();
    for (var i = 0; i < count; i++) {
      var cx = i * colW;

      // Light alternating column shade so columns are visible but not harsh.
      ctx.globalAlpha = 0.08;
      ctx.fillStyle   = (i % 2 === 0) ? '#4488FF' : '#44AAFF';
      ctx.fillRect(cx, 0, colW, 40);

      // Column separator line.
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#AACCFF';
      ctx.lineWidth   = 1;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, 40);
        ctx.stroke();
      }

      // Option label text.
      ctx.globalAlpha  = 1.0;
      ctx.fillStyle    = '#FFFFFF';
      ctx.font         = 'bold 11px Arial';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      var label = options[i];
      if (label.length > 12) { label = label.slice(0, 11) + '…'; }
      ctx.fillText(label, cx + colW / 2, 20);
    }
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

    // Ensure the container clips the off-screen pull-down panel.
    if (container.style.position !== 'relative' &&
        container.style.position !== 'absolute' &&
        container.style.position !== 'fixed') {
      container.style.position = 'relative';
    }
    container.style.overflow = 'hidden';

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

    // --- poll vote buttons (v2) ----------------------------------------
    // One <button> per option, shown only when a poll is open and this
    // client is a student who has not yet voted.  Mirrors the check-in
    // button pattern.

    var pollVoteContainer = doc.createElement('div');
    pollVoteContainer.setAttribute('data-classroom-poll-votes', '1');
    pollVoteContainer.style.display = 'none';
    container.appendChild(pollVoteContainer);

    // --- result screen (v2.1) ------------------------------------------
    // A pull-down <div> that slides into view when a poll closes.
    // hidden: transform translateY(-100%)  shown: translateY(0)
    // Created here; shown/hidden via showResultScreen / hideResultScreen.

    var resultScreen = doc.createElement('div');
    resultScreen.setAttribute('data-classroom-result-screen', '1');
    resultScreen.style.position   = 'absolute';
    resultScreen.style.left       = '0';
    resultScreen.style.top        = '0';
    resultScreen.style.width      = '100%';
    resultScreen.style.background = '#1a1a2e';
    resultScreen.style.zIndex     = '10';
    resultScreen.style.transform  = 'translateY(-100%)';
    resultScreen.style.transition = 'transform 0.3s ease';
    resultScreen.style.padding    = '8px';
    resultScreen.style.boxSizing  = 'border-box';

    var resultCanvas = doc.createElement('canvas');
    resultCanvas.setAttribute('data-classroom-result-canvas', '1');
    resultCanvas.style.display = 'block';
    resultCanvas.style.width   = '100%';
    resultCanvas.width  = 320;
    resultCanvas.height = 160;
    resultScreen.appendChild(resultCanvas);

    var resultQuestion = doc.createElement('div');
    resultQuestion.setAttribute('data-classroom-result-question', '1');
    resultQuestion.style.color      = '#ffffff';
    resultQuestion.style.fontSize   = '12px';
    resultQuestion.style.marginTop  = '4px';
    resultQuestion.style.textAlign  = 'center';
    resultScreen.appendChild(resultQuestion);

    var resultStepper = doc.createElement('div');
    resultStepper.setAttribute('data-classroom-result-stepper', '1');
    resultStepper.style.display    = 'none';
    resultStepper.style.textAlign  = 'center';
    resultStepper.style.marginTop  = '4px';
    resultScreen.appendChild(resultStepper);

    var resultClose = doc.createElement('button');
    resultClose.setAttribute('data-classroom-result-close', '1');
    resultClose.textContent      = 'close';
    resultClose.style.display    = 'block';
    resultClose.style.margin     = '4px auto 0';
    resultClose.style.fontSize   = '11px';
    resultClose.style.cursor     = 'pointer';
    resultScreen.appendChild(resultClose);

    container.appendChild(resultScreen);

    // Internal stepper state for showResultScreen.
    var _resultPolls  = [];
    var _resultIndex  = 0;

    function _drawResultPoll(poll) {
      resultQuestion.textContent = poll.question || '';
      if (window.Ti84Plot && resultCanvas.getContext) {
        var ctx2d = resultCanvas.getContext('2d');
        if (ctx2d) {
          window.Ti84Plot.drawBarChart(ctx2d, {
            labels: poll.options || [],
            counts: poll.tally  || [],
            title:  poll.question || ''
          });
        }
      }
    }

    function _renderStepper() {
      var total = _resultPolls.length;
      if (total <= 1) {
        resultStepper.style.display = 'none';
        return;
      }
      resultStepper.style.display = 'block';
      // Clear and rebuild stepper controls.
      resultStepper.innerHTML = '';

      var prevBtn = doc.createElement('button');
      prevBtn.textContent = '<';
      prevBtn.setAttribute('data-classroom-result-prev', '1');
      prevBtn.disabled = (_resultIndex === 0);
      prevBtn.onclick  = function () {
        if (_resultIndex > 0) {
          _resultIndex -= 1;
          _drawResultPoll(_resultPolls[_resultIndex]);
          _renderStepper();
        }
      };
      resultStepper.appendChild(prevBtn);

      var label = doc.createElement('span');
      label.textContent = ' ' + (_resultIndex + 1) + '/' + total + ' ';
      label.style.color = '#ffffff';
      label.style.fontSize = '11px';
      resultStepper.appendChild(label);

      var nextBtn = doc.createElement('button');
      nextBtn.textContent = '>';
      nextBtn.setAttribute('data-classroom-result-next', '1');
      nextBtn.disabled = (_resultIndex === total - 1);
      nextBtn.onclick  = function () {
        if (_resultIndex < _resultPolls.length - 1) {
          _resultIndex += 1;
          _drawResultPoll(_resultPolls[_resultIndex]);
          _renderStepper();
        }
      };
      resultStepper.appendChild(nextBtn);
    }

    function showResultScreen(polls) {
      if (!polls || polls.length === 0) { return; }
      _resultPolls = polls;
      _resultIndex = polls.length - 1;
      _drawResultPoll(_resultPolls[_resultIndex]);
      _renderStepper();
      resultScreen.style.transform = 'translateY(0)';
    }

    function hideResultScreen() {
      resultScreen.style.transform = 'translateY(-100%)';
      _resultPolls = [];
      _resultIndex = 0;
    }

    resultClose.onclick = function () { hideResultScreen(); };

    // Snapshot of closedPoll from the previous applyMessage call so the
    // render layer can detect changes and avoid redundant show/hide calls.
    var _prevClosedPoll = null;

    function refreshResultScreen() {
      var cp = state.closedPoll;
      if (cp !== _prevClosedPoll) {
        _prevClosedPoll = cp;
        if (cp) {
          showResultScreen([cp]);
        } else {
          hideResultScreen();
        }
      }
    }

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

    // --- player controller (Phase 1) -----------------------------------
    // Shared input state object -- the keyboard listener writes into it
    // and the local PlayerSprite reads from it on every update tick.
    var playerInput = { left: false, right: false, jump: false, up: false };

    // Edge-trigger callback the PlayerSprite calls when Up is pressed.
    // Fires classroom_checkin when the player's foot is inside the gate
    // door x-range AND state.gate.armed; otherwise no-op (no door, no
    // check-in). The server's present->checkedIn transition then drives
    // the drain animation through syncScene as today -- one way out.
    function handlePlayerUp(player) {
      if (!state.gate || !state.gate.armed) { return; }
      if (!engineReady) { return; }
      var cw     = engine.canvas.width / (root.devicePixelRatio || 1);
      var doorXL = cw - DOOR_W - 10;
      var doorXR = cw - 10;
      var footX  = player.x + (SPRITE_W * (player.scale || SPRITE_SCALE)) / 2;
      if (footX >= doorXL && footX <= doorXR) {
        safeSend({ type: 'classroom_checkin' });
      }
    }

    // Keyboard listener -- document-level. Phase 1 captures arrows + Space
    // globally on the Desk. Acceptable because the calendar is compact
    // (2 weeks) so the page rarely needs keyboard scrolling. Gates input
    // when an <input>/<textarea> has focus or any modal overlay is open;
    // Space + Up also lock out while an open poll awaits this student's
    // vote (commit a choice before bouncing around).
    function _isInputFocused() {
      var ae = doc.activeElement;
      if (!ae) { return false; }
      var tag = (ae.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || ae.isContentEditable === true;
    }
    function _isModalOpen() {
      var ids = ['day-grade-overlay', 'donow-bump-overlay', 'signin-overlay', 'pwchange-overlay', 'resource-panel'];
      for (var i = 0; i < ids.length; i++) {
        var el = doc.getElementById(ids[i]);
        if (!el) { continue; }
        var disp = (el.style && el.style.display) || '';
        if (disp && disp !== 'none') { return true; }
      }
      return false;
    }
    function _keyToInputProp(e) {
      switch (e.key) {
        case 'ArrowLeft':  return 'left';
        case 'ArrowRight': return 'right';
        case 'ArrowUp':    return 'up';
        case ' ':
        case 'Spacebar':   return 'jump';
        default:           return null;
      }
    }
    function _keyHandler(e, pressed) {
      if (_isInputFocused() || _isModalOpen()) { return; }
      var prop = _keyToInputProp(e);
      if (!prop) { return; }
      if ((prop === 'jump' || prop === 'up') && state.poll &&
          state.members[username] && state.members[username].status !== 'voted') {
        return;
      }
      playerInput[prop] = pressed;
      if (e.preventDefault) { e.preventDefault(); }
    }
    var _kdHandler = function (e) { _keyHandler(e, true);  };
    var _kuHandler = function (e) { _keyHandler(e, false); };
    if (doc.addEventListener) {
      doc.addEventListener('keydown', _kdHandler);
      doc.addEventListener('keyup',   _kuHandler);
    }

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

    // Reposition all present sprites in a row (or poll columns when active).
    function repositionSprites() {
      if (!engineReady) { return; }
      var usernames = Object.keys(spriteEntities);
      if (usernames.length === 0) { return; }

      var sw  = getSpriteWidth();
      var cw  = engine.canvas.width / (root.devicePixelRatio || 1);
      var sy  = getSpriteY();

      if (state.poll && state.poll.options && state.poll.options.length > 0) {
        // Poll mode: voted students walk to their column; unvoted stay in idle row.
        var optCount = state.poll.options.length;
        var colW     = cw / optCount;

        // Compute the idle row x slots (all sprites regardless of vote status).
        var idleXs = computeSlots(usernames.length, sw, cw);

        for (var pi = 0; pi < usernames.length; pi++) {
          var puname = usernames[pi];
          var psp    = spriteEntities[puname];
          if (!psp) { continue; }

          var pmember = state.members[puname];
          if (pmember && pmember.status === 'voted' && pmember.vote != null) {
            // Walk toward the column center for their chosen option.
            var colCenter = pmember.vote * colW + colW / 2 - sw / 2;
            if (psp.state === 'idle' && Math.abs(psp.x - colCenter) > 2) {
              psp.walkTo(colCenter);
            }
          } else {
            // Unvoted: stay in idle row position. D2 -- skip any sprite
            // that has moved (PlayerSprite via keyboard, OR a peer who has
            // received a classroom_pos broadcast in Phase 2). _moved is
            // sticky once set.
            if (psp._moved) { continue; }
            if (psp.state === 'idle') {
              psp.x = idleXs[pi];
              psp.y = sy;
            }
          }
        }
      } else {
        // No poll: normal idle row.
        var xs = computeSlots(usernames.length, sw, cw);
        for (var i = 0; i < usernames.length; i++) {
          var sp = spriteEntities[usernames[i]];
          // D2 -- skip any sprite that has moved (PlayerSprite via keyboard
          // OR a peer who has received a Phase 2 classroom_pos broadcast).
          if (sp && sp._moved) { continue; }
          // Only reposition idle sprites; do not interrupt a walk.
          if (sp && sp.state === 'idle') {
            sp.x = xs[i];
            sp.y = sy;
          }
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
      // Phase 1 (D1): the local signed-in student gets a PlayerSprite
      // (keyboard-controlled). All other members -- peers + teacher
      // observers -- stay an auto-layout BoardSprite.
      var isLocal = (member.username === username && role === 'student');
      var baseOpts = {
        x:      0,
        y:      sy,
        scale:  SPRITE_SCALE,
        hue:    hue,
        online: member.online !== false,
        label:  label,
        onDrained: (function (uname) {
          return function () {
            // Drain animation completed (present -> checkedIn walk to door).
            // Guard: only an explicit drain (draining[uname] set by
            // startDrain) removes the sprite. A v2 poll-voted walkTo also
            // arrives here on arrival -- without this guard it would wipe
            // the voter's sprite at the column.
            if (!draining[uname]) { return; }
            engine.removeEntity('sprite_' + uname);
            delete spriteEntities[uname];
            delete draining[uname];
            repositionSprites();
          };
        })(member.username)
      };
      var sp;
      if (isLocal) {
        baseOpts.input       = playerInput;
        baseOpts.peers       = function () { return spriteEntities; };
        baseOpts.onUpPressed = handlePlayerUp;
        baseOpts.canvasW     = function () {
          return engine.canvas.width / (root.devicePixelRatio || 1);
        };
        // Phase 2 -- broadcast position to roommates.
        baseOpts.onPos = function (msg) {
          safeSend({
            type:  'classroom_pos',
            x:     msg.x,
            y:     msg.y,
            state: msg.state,
            vx:    msg.vx
          });
        };
        sp = new PlayerSprite(spriteSheet, baseOpts);
      } else {
        sp = new BoardSprite(spriteSheet, baseOpts);
      }
      spriteEntities[member.username] = sp;
      engine.addEntity('sprite_' + member.username, sp);
      // Phase 2 -- restore last-known position from the join snapshot
      // (a reconnecting local user OR a peer who was already broadcasting
      // when we joined). Without this they'd spawn at the auto-layout slot
      // and snap back into formation. _moved=true gates repositionSprites
      // off them; applyPos will overwrite both x/y on the next broadcast.
      if (member.pos && typeof member.pos.x === 'number' && typeof member.pos.y === 'number') {
        sp.x = member.pos.x;
        sp.y = member.pos.y;
        sp._moved = true;
      }
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

    // --- poll columns overlay (v2) -------------------------------------

    var pollColumnsOverlay = null;

    function showPollColumns() {
      if (!engineReady) { return; }
      if (pollColumnsOverlay) { return; }
      pollColumnsOverlay = new PollColumnsOverlay(
        function () { return state.poll; },
        function () {
          if (!engine || !engine.canvas) { return 400; }
          return engine.canvas.width / (root.devicePixelRatio || 1);
        }
      );
      engine.addEntity('poll_columns', pollColumnsOverlay);
    }

    function hidePollColumns() {
      if (!engineReady) { return; }
      if (!pollColumnsOverlay) { return; }
      engine.removeEntity('poll_columns');
      pollColumnsOverlay = null;
    }

    // --- poll vote button refresh (v2) ----------------------------------

    function refreshVoteButtons() {
      if (!pollVoteContainer) { return; }

      var shouldShow = (
        role === 'student' &&
        state.poll !== null &&
        state.members[username] &&
        state.members[username].status !== 'voted'
      );

      if (!shouldShow) {
        pollVoteContainer.style.display = 'none';
        // Clear existing buttons so they don't accumulate across polls.
        pollVoteContainer.innerHTML = '';
        return;
      }

      var options = state.poll.options || [];

      // Only rebuild the buttons when the option count changes (simple guard
      // against rebuilding on every heartbeat while a poll is open).
      var existingBtns = pollVoteContainer.querySelectorAll('[data-vote-index]');
      if (existingBtns.length !== options.length) {
        pollVoteContainer.innerHTML = '';
        for (var bi = 0; bi < options.length; bi++) {
          (function (choiceIndex) {
            var btn = doc.createElement('button');
            btn.textContent = options[choiceIndex];
            btn.setAttribute('data-vote-index', choiceIndex);
            btn.onclick = function () {
              // Optimistic local update (Finding 1): in a blind poll the
              // server echos the voter a classroom_member_update with vote:null
              // (blind secrecy).  Without a local update the voter's own
              // avatar never moves to its column until a reconnect.
              // Route a synthetic update through applyMessage/_reduce BEFORE
              // sending so the board renders immediately.  The vote field in
              // _reduce is durable -- a later vote:null echo preserves it.
              applyMessage({
                type:   'classroom_member_update',
                member: {
                  username: username,
                  status:   'voted',
                  vote:     choiceIndex
                }
              });
              safeSend({ type: 'classroom_vote', choice: choiceIndex });
            };
            pollVoteContainer.appendChild(btn);
          })(bi);
        }
      }

      pollVoteContainer.style.display = 'block';
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

      // Show/hide poll columns overlay.
      if (newState.poll) {
        showPollColumns();
      } else {
        hidePollColumns();
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
      // Phase 2 -- position broadcasts are transient: applied to the peer
      // sprite directly, NOT reduced into state (they fire at 10 Hz and
      // reducing would rebuild state.members 10x/s per peer for no win).
      if (msg && msg.type === 'classroom_pos') {
        applyPos(msg);
        return;
      }
      state = _reduce(state, msg);
      if (msg.type === 'classroom_greenlight') {
        showGreenlight();
      }
      if (msg.type === 'classroom_greenlight' && msg.startVideo === true && onStartVideo) {
        try { onStartVideo(msg.videoRef || null); } catch (_) {}
      }
      syncScene(state);
      refreshButton();
      refreshVoteButtons();
      refreshResultScreen();
      notifyStateChange();
    }

    // Phase 2 -- handle inbound peer positions. The peer's BoardSprite
    // chases the broadcast x via the existing walkTo target machinery
    // (at 10 Hz the per-broadcast delta is small and the WALK_SPEED chase
    // looks fluid); y is set directly so jumps register visually. Marks
    // the sprite _moved=true so repositionSprites stops yanking it back
    // to the auto-layout slot.
    function applyPos(msg) {
      if (!msg || !msg.username) { return; }
      if (msg.username === username) { return; }    // ignore self echoes
      var peer = spriteEntities[msg.username];
      if (!peer) { return; }
      if (peer instanceof PlayerSprite) { return; } // never overwrite the local player
      peer._moved = true;
      if (typeof msg.x === 'number' && Math.abs(peer.x - msg.x) > 1) {
        peer.walkTo(msg.x);
      }
      if (typeof msg.y === 'number') {
        peer.y = msg.y;
      }
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
        // Phase 1 -- detach the player keyboard listeners installed above.
        if (doc.removeEventListener) {
          doc.removeEventListener('keydown', _kdHandler);
          doc.removeEventListener('keyup',   _kuHandler);
        }
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        if (checkinBtn.parentNode) {
          checkinBtn.parentNode.removeChild(checkinBtn);
        }
        if (pollVoteContainer && pollVoteContainer.parentNode) {
          pollVoteContainer.parentNode.removeChild(pollVoteContainer);
        }
        if (resultScreen && resultScreen.parentNode) {
          resultScreen.parentNode.removeChild(resultScreen);
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
      },

      // --- v2 poll teacher methods ---

      openPoll: function (question, options, blind) {
        safeSend({
          type:     'classroom_open_poll',
          question: question  || '',
          options:  options   || [],
          blind:    blind === true
        });
      },

      closePoll: function () {
        safeSend({ type: 'classroom_close_poll' });
      },

      reveal: function () {
        safeSend({ type: 'classroom_reveal' });
      },

      // --- v2.1 result screen methods ---

      showResultScreen: showResultScreen,
      hideResultScreen: hideResultScreen
    };

    return handle;
  }

  // --- public API -------------------------------------------------------

  root.ClassroomBoard = {
    mount:            mount,
    _reduce:          _reduce,
    _assignCells:     assignCells,
    _hashStringToHue: hashStringToHue,  // exposed for tests
    _PlayerSprite:    PlayerSprite      // Phase 1 -- exposed for unit tests
  };

}(typeof window !== 'undefined' ? window : this));
