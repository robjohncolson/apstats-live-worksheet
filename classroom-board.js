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

  var JUMP_V0       = -280;   // initial vertical velocity (negative = up)
  var GRAVITY       = 800;    // px/s^2 downward
  var PUSH_DELTA    = 0.6;    // legacy soft-push (kept for Phase-1 structure pin)
  var JUMP_FRAME    = 5;      // sprite frame for the airborne pose (cr-matching)
  // LIVE_CLASSROOM_SCALING knob 1 -- emit cadence scales to room size.
  // Each row is [memberCountUpperBound, intervalMs]; the LAST row's bound
  // is Infinity so any larger room maps to its interval. Tuning is
  // one-line: edit a row's intervalMs to widen/narrow the cadence.
  var POS_RATE_TABLE = [
    [8,        100],   // <= 8 members         -> 10 Hz   (was POS_RATE_MS)
    [20,       200],   //  9 - 20 members      ->  5 Hz
    [40,       300],   // 21 - 40 members      ->  3.33 Hz
    [Infinity, 500]    // > 40 members         ->  2 Hz
  ];

  // Look up the broadcast interval for a given room size. Linear scan --
  // POS_RATE_TABLE has 4 rows, branch-prediction-friendly. Falls through
  // to the last row's value (the Infinity bound guarantees a match).
  function _currentEmitRateMs(memberCount) {
    var n = (typeof memberCount === 'number' && memberCount > 0) ? memberCount : 1;
    for (var i = 0; i < POS_RATE_TABLE.length; i++) {
      if (n <= POS_RATE_TABLE[i][0]) { return POS_RATE_TABLE[i][1]; }
    }
    return POS_RATE_TABLE[POS_RATE_TABLE.length - 1][1];
  }
  var Y_CHASE_SPEED = 600;    // Phase 2.2: peer y interpolation speed (px/s)

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
          closedPoll: null,
          live:       !!message.live,
          doorways:   message.doorways || null,
          closedDoorways: null,
          activity:   message.activity || null
        };

      case 'classroom_live_state':
        // v3 P1+P2: room.live transitions. Carries section + live bool.
        // The state.live field is new (defaults to false in emptyState).
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       !!message.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
        };

      case 'classroom_greenlight':
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: true,
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: closedSnapshot,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
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
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       state.live,
          doorways:   state.doorways,
          closedDoorways: state.closedDoorways || null,
          activity:   state.activity || null
        };

      // --- v3 P4 doorways cases (vote-with-your-feet) -------------------

      case 'classroom_open_doorways':
        // v3 P4: a fresh data mode is opening. Mutually exclusive with
        // poll (server enforces); clear any closedPoll surface.
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       null,
          greenlight: state.greenlight,
          closedPoll: null,
          live:       state.live,
          doorways:   {
            id:       message.id,
            question: message.question || '',
            options:  Array.isArray(message.options) ? message.options.slice() : [],
            tally:    (Array.isArray(message.options) ? message.options : []).map(function(o) { return { doorId: o.doorId, count: 0 }; }),
            closed:   false
          },
          activity:   state.activity || null
        };

      case 'classroom_doorway_tally':
        // Update the tally on the active doorways state. If no doorways
        // open or id mismatch, no-op.
        if (!state.doorways || state.doorways.id !== message.id) { return state; }
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll,
          live:       state.live,
          doorways:   {
            id:       state.doorways.id,
            question: state.doorways.question,
            options:  state.doorways.options,
            tally:    Array.isArray(message.tally) ? message.tally.slice() : state.doorways.tally,
            closed:   state.doorways.closed
          },
          activity:   state.activity || null
        };

      case 'classroom_close_doorways':
        // The data mode is closing. Carry the final tally on a one-shot
        // closedDoorways snapshot (mirroring closedPoll); the active
        // doorways slot is cleared on the next state-driven path or a
        // fresh open.
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll,
          live:       state.live,
          doorways:   null,
          closedDoorways: {
            id:       message.id,
            question: message.question || '',
            options:  Array.isArray(message.options) ? message.options.slice() : [],
            tally:    Array.isArray(message.tally) ? message.tally.slice() : []
          },
          activity:   state.activity || null
        };

      // --- v4 activity cases (LIVE_CLASSROOM_V4_BUILD.md C3) ------------

      case 'classroom_activity_start':
        // Engine-driven start; replaces any existing activity slot.
        // V7 (LIVE_CLASSROOM_V7_BUILD.md C4): optional `level` block shipped
        // once on start (full LevelDef from JSON). Subsequent
        // classroom_activity_state ticks omit level for payload size; the
        // Object.assign in that case preserves the stashed value.
        return Object.assign({}, state, {
          activity: {
            type:       message.activity.type,
            startedAt:  message.activity.startedAt,
            durationMs: message.activity.durationMs,
            state:      message.activity.state,
            finished:   false,
            level:      message.activity.level || null
          }
        });

      case 'classroom_activity_state':
        // 5 Hz tick payload. Only mutates the plugin-managed inner state
        // and only while an activity is live + unfinished.
        // V7: level is preserved by Object.assign({}, state.activity, ...)
        // because it copies every own property from state.activity (the
        // `level` field stashed on start) before overlaying the new state.
        if (!state.activity || state.activity.finished) { return state; }
        return Object.assign({}, state, {
          activity: Object.assign({}, state.activity, {
            state: message.state
          })
        });

      case 'classroom_activity_success':
      case 'classroom_activity_timeout':
      case 'classroom_activity_cancel':
        // Terminal lifecycle messages. Mark the slot finished + label the
        // outcome; preserve the final plugin state so the render layer
        // can show the result panel.
        if (!state.activity) { return state; }
        return Object.assign({}, state, {
          activity: Object.assign({}, state.activity, {
            finished:   true,
            finalState: message.finalState || state.activity.state,
            outcome:    message.type === 'classroom_activity_success' ? 'success'
                      : message.type === 'classroom_activity_timeout' ? 'timeout'
                      : 'cancel'
          })
        });

      // NOTE: there is no 'classroom_reset' broadcast -- a teacher reset is
      // delivered to clients AS a classroom_state snapshot (handled above,
      // which clears closedPoll). See LIVE_CLASSROOM_SPEC S5.2/S5.3.

      default:
        return state;
    }
  }

  // --- initial state factory --------------------------------------------

  function emptyState() {
    return { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null, live: false, doorways: null, closedDoorways: null, activity: null };
  }

  // --- check-in button logic (B3) -- unchanged --------------------------

  function shouldShowCheckinButton(state, username, role) {
    if (role !== 'student')                   { return false; }
    if (!state.gate || !state.gate.armed)     { return false; }
    // v3 P4 Codex MAJOR 3 fold: doorways suspend the gate ritual --
    // hide the check-in button when a data mode is active.
    if (state.doorways)                       { return false; }
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
      greenlight: state.greenlight,
      live:       state.live,
      doorways:   state.doorways,
      closedDoorways: state.closedDoorways || null,
      activity:   state.activity || null
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
    // V7.3.6: avatars render ON TOP of doorways + coins + goal so the
    // doorway mouse-hole shape doesn't occlude the sprite walking past.
    // See canvas_engine.js render() for the sort.
    this.zIndex       = 10;

    this.state        = 'idle';
    this.targetX      = 0;
    this.walkDir      = 1;   // 1 = right, -1 = left
    this.facingRight  = true; // sheet bottom row = left-facing; +11 offset via _directedFrame
    this._yTarget     = null; // Phase 2.2: chased toward by _chaseY when set

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
    // Phase 2.2 -- chase _yTarget if set (peer y interpolation for jumps).
    // Set by applyPos for an inbound classroom_pos; chase smooths the 10 Hz
    // broadcast cadence into a continuous y motion. Idle when _yTarget is null.
    this._chaseY(dt);
    // s111 P4 UX rev4: peer-side doorway fade. When state is set to
    // 'in-doorway' (via applyPos), animate _peerAbsorbProgress 0->1
    // over 350 ms; on exit (state changes), reverse 1->0. The render
    // multiplies alpha by (1 - _peerAbsorbProgress).
    var pStep = dt * 1000 / 350;
    if (this.state === 'in-doorway') {
      this._peerAbsorbProgress = Math.min(1, (this._peerAbsorbProgress || 0) + pStep);
    } else if ((this._peerAbsorbProgress || 0) > 0) {
      this._peerAbsorbProgress = Math.max(0, this._peerAbsorbProgress - pStep);
    }
  };

  // Phase 2.2 -- step y toward _yTarget at Y_CHASE_SPEED. When the gap is
  // smaller than this tick's step (or negligible), snap and clear the target.
  // No-op when _yTarget is null (PlayerSprite never sets it; peers only).
  BoardSprite.prototype._chaseY = function (dt) {
    if (this._yTarget == null) { return; }
    var dy = this._yTarget - this.y;
    if (Math.abs(dy) < 0.5) {
      this.y        = this._yTarget;
      this._yTarget = null;
      return;
    }
    var step = Y_CHASE_SPEED * dt;
    if (Math.abs(dy) <= step) {
      this.y        = this._yTarget;
      this._yTarget = null;
    } else {
      this.y += (dy > 0 ? 1 : -1) * step;
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
    if (this._hidden) { return; }
    var alpha = this.online ? 1.0 : 0.35;
    // s111 P4 UX rev4: peer in 'in-doorway' state -> fade out via
    // _peerAbsorbProgress (animated in update()).
    if ((this._peerAbsorbProgress || 0) > 0) {
      alpha *= (1 - this._peerAbsorbProgress);
    }
    if (alpha <= 0) { return; }
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

    // Phase 2.3 -- platform velocity on jump. When the player jumps from a
    // moving peer, this carries the peer's vx (derived from the carry delta)
    // through the airborne arc; cleared on landing. 0 for jumps from the
    // ground or from a stationary carrier.
    this._jumpInheritedVx = 0;

    // Phase 2.4 -- "blocked" visual feedback. When a jump is refused because
    // someone is riding our head, this timer (ms) drives a brief y-jitter in
    // render() so the local player sees their press registered. Local-only;
    // the actual physics y never moves, so peers don't see the twitch.
    this._blockedTwitchMs = 0;

    // Phase 2 -- position broadcast hook + rate-limit clock.
    // onPos -- function({x, y, state, vx}); mount() wires it to safeSend.
    // _now  -- injectable clock for deterministic tests (default Date.now).
    this.onPos         = (typeof opts.onPos === 'function') ? opts.onPos : null;
    this._now          = (typeof opts.now === 'function') ? opts.now : function () { return Date.now(); };
    this._lastPosMs    = 0;
    this._restEmitted  = false;

    // LIVE_CLASSROOM_SCALING knob 1 -- room-size source. mount() supplies
    // a closure over state.members so the emit gate can read the live
    // count each tick. Default returns 1 -- a sprite with no roommates
    // is just the local player, so 10 Hz is the right back-compat rate
    // for tests / harness code that omits this opt.
    this._getMemberCount = (typeof opts.getMemberCount === 'function')
      ? opts.getMemberCount
      : function () { return 1; };
  }
  PlayerSprite.prototype = Object.create(BoardSprite.prototype);
  PlayerSprite.prototype.constructor = PlayerSprite;

  PlayerSprite.prototype.update = function (dt) {
    // Drain (walkTo target-based) overrides keyboard -- one way out the door.
    // s111 P4 UX: doorway walks are user-initiated optimistic drains.
    // Pressing Up DURING a doorway walk aborts it (the user changed
    // their mind). state -> idle so keyboard input works again. The
    // server-side vote stays cast; the user can walk to a different
    // doorway + Up to switch votes (server's castDoorwayVote handles
    // the decrement/increment). The gate drain (also 'walking' state)
    // is NOT cancelable -- it's server-driven, not optimistic.
    if (this.state === 'walking') {
      if (this._isDoorwayWalk && this.input.up && !this._upHandled) {
        this._upHandled       = true;
        this._isDoorwayWalk   = false;
        this.state            = 'idle';
        this.idleTimer        = 0;
        this.currentIdleFrame = 0;
        this.targetX          = null;
        return;
      }
      if (!this.input.up) { this._upHandled = false; }
      this._updateWalk(dt);
      return;
    }

    // s111 P4 UX rev4: in-place doorway absorption. _absorbProgress
    // (0..1) drives alpha fade in render. Press Up again to reverse.
    // - progress reaches 1: _hidden=true (local render skips).
    // - progress reaches 0 with dir<0: cancel complete, back to idle.
    // - _hidden CLEARED whenever progress < 1 (so a cancel from full
    //   absorb correctly fades the sprite back in).
    if (this.state === 'entering-doorway') {
      if (this.input.up && !this._upHandled) {
        this._upHandled = true;
        this._absorbDir = -this._absorbDir;
      } else if (!this.input.up) {
        this._upHandled = false;
      }
      var stepMs = (dt * 1000);
      this._absorbProgress += this._absorbDir * (stepMs / this._absorbDurationMs);
      if (this._absorbProgress < 0) { this._absorbProgress = 0; }
      if (this._absorbProgress > 1) { this._absorbProgress = 1; }
      // s111 hotfix: cancel from full absorb left _hidden=true forever.
      // Clear it whenever progress drops below 1.
      if (this._absorbProgress < 1) { this._hidden = false; }
      if (this._absorbProgress === 0 && this._absorbDir < 0) {
        // s111 P4 HOTFIX: cancel-complete transitions state to 'idle'
        // but the early return below skipped the emit path, so the
        // server kept us as 'in-doorway' and a later refresh would
        // restore us back into the hole. Clear _restEmitted so the
        // next idle tick fires a rest snapshot with state='idle'.
        this.state = 'idle';
        this._isDoorwayWalk = false;
        this._absorbDir = 1;
        this._restEmitted = false;
        // s111 P4 HOTFIX: retract the vote on cancel. handlePlayerUp
        // stashed a closure with the captured doorway id; calling it
        // sends classroom_doorway_retract so the count decrements
        // server-side. Without this, the avatar leaves the hole but
        // the vote stays attached to that door until the student
        // votes elsewhere -- incongruent UX.
        if (typeof this._cancelHandler === 'function') {
          try { this._cancelHandler(); } catch (_) {}
          this._cancelHandler = null;
        }
        return;
      }
      if (this._absorbProgress === 1) {
        this._hidden = true;
        return;
      }
      return;
    }

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

    // Jump edge-trigger: only when on a floor (ground OR a peer's head)
    // AND no peer is standing on top of us; no auto-repeat while Space
    // held. Jumping hops us OFF the carrier and inherits the carrier's
    // horizontal velocity (Phase 2.3) so a jump from a moving peer sails
    // with them, Mario-style. The someone-on-top check exists because a
    // peer standing on our head has no way to track our upward motion
    // (Mario platforms don't move up under you) -- without this they'd
    // fall through the moment we launch.
    if (this.input.jump && !this._jumpHandled) {
      this._jumpHandled = true;
      if (this.state !== 'jumping' && this._onFloor()) {
        if (this._someoneOnTop()) {
          // Refused: someone's riding us. Brief visual twitch so the user
          // sees their press registered even though we can't take off.
          this._blockedTwitchMs = 150;
        } else {
          this.vy    = JUMP_V0;
          this.state = 'jumping';
          // Capture the carrier's vx (from the carry delta) before we cut
          // the standingOn link. dt > 0 guard avoids /0 in degenerate ticks.
          if (this.standingOn && typeof this._standingOnLastX === 'number' && dt > 0) {
            this._jumpInheritedVx = (this.standingOn.x - this._standingOnLastX) / dt;
          } else {
            this._jumpInheritedVx = 0;
          }
          this.standingOn = null;
        }
      }
    } else if (!this.input.jump) {
      this._jumpHandled = false;
    }

    // Phase 2.4 -- tick down the "blocked" twitch timer. render() reads this
    // to apply a brief y-jitter offset; the timer reaches 0 and the sprite
    // settles back to its real y.
    if (this._blockedTwitchMs > 0) {
      this._blockedTwitchMs = Math.max(0, this._blockedTwitchMs - dt * 1000);
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
    // _carriedThisTick is read below by the emit gate -- when carry actually
    // moved us we must broadcast so observers see the carried motion. The
    // earlier `standingOn.state === 'walking'` heuristic missed the windows
    // where the carrier's BoardSprite was in 'arrived' state between
    // broadcasts (especially on slower clients where a single _updateWalk
    // tick reaches the target).
    this._carriedThisTick = false;
    if (this.standingOn && typeof this._standingOnLastX === 'number') {
      var carryDx = this.standingOn.x - this._standingOnLastX;
      if (carryDx !== 0) {
        this.x += carryDx;
        this._moved = true;
        this._carriedThisTick = true;
      }
    }

    // Player's own horizontal motion + inherited platform velocity (if any).
    // The inherited Vx is set on jump-from-a-moving-peer (Phase 2.3) and is
    // 0 in every other case; while airborne it adds to each tick's x step.
    this.x += this.vx * dt;
    if (this.state === 'jumping' && this._jumpInheritedVx) {
      this.x += this._jumpInheritedVx * dt;
    }

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
      // s111 P4 UX rev4: a peer in 'in-doorway' is non-physical.
      // Skip them for floor / head-platform candidates.
      if (p.state === 'in-doorway') { continue; }
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
        this.state            = 'idle';
        this.idleTimer        = 0;
        this.currentIdleFrame = 0;
        this._jumpInheritedVx = 0;     // Phase 2.3 -- arc ends, drop inheritance
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
        // s111 P4 UX rev4: a peer in 'in-doorway' is non-physical.
        // Skip the horizontal collision so the local player can walk
        // through where the absorbed peer was standing.
        if (pp.state === 'in-doorway') { continue; }
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
    // airborne OR carry actually moved us this tick OR the carrier's
    // BoardSprite is in 'walking' state); ONE final "rest" snapshot when
    // motion ends; then 0 Hz until the next input. The two carry signals
    // are belt-and-suspenders -- _carriedThisTick is the precise signal
    // (we just moved), beingCarried is the heuristic (the carrier is being
    // chased via walkTo). Without _carriedThisTick the passenger went
    // silent in the 'arrived' window between the carrier's broadcasts.
    if (this.onPos) {
      var beingCarried = (this.standingOn && this.standingOn.state === 'walking');
      var moving = (this.vx !== 0) || (this.state === 'jumping') ||
                   this.input.left  || this.input.right ||
                   this.input.jump  || this.input.up ||
                   !!beingCarried || this._carriedThisTick;
      var now = this._now();
      // s111 P4 UX rev4: translate local 'entering-doorway' state to
      // the wire-side 'in-doorway' so peers know to fade + skip the
      // collision check. Same string both before and after the absorb
      // animation completes; the local _absorbProgress / _hidden flags
      // stay LOCAL.
      var wireState = (this.state === 'entering-doorway') ? 'in-doorway' : this.state;
      if (moving) {
        // Clear the rest-emitted latch UNCONDITIONALLY on a moving tick so a
        // brief move that doesn't trip the cadence gate (more likely at the
        // scaled 200/300/500 ms intervals) still produces a final rest
        // snapshot on the next idle tick. Without this, a sub-gate burst
        // emits NOTHING -- peers miss the entire displacement.
        this._restEmitted = false;
        if (now - this._lastPosMs >= _currentEmitRateMs(this._getMemberCount())) {
          try { this.onPos({ x: this.x, y: this.y, state: wireState, vx: this.vx }); } catch (_) {}
          this._lastPosMs   = now;
        }
      } else if (!this._restEmitted) {
        try { this.onPos({ x: this.x, y: this.y, state: wireState, vx: 0 }); } catch (_) {}
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

  // True when a peer is standing on this player's head (their y matches our
  // head y within sprite tolerance AND they horizontally overlap us). Used
  // to gate jump: if someone's riding us, we can't launch -- they have no
  // way to follow our upward motion (one-way platforms don't go up under
  // you in Mario rules) and would fall through to ground level on every jump.
  // The tolerance is intentionally tight (~3 px) so a peer FLOATING BELOW
  // the head line doesn't count as riding -- only an actual head-stack does.
  // 3 px covers interpolation jitter (_chaseY toward the broadcast y) plus
  // the per-tick gravity bump on the rider.
  PlayerSprite.prototype._someoneOnTop = function () {
    var peersMap = this.peers();
    var headY = this.y - this._spriteHeight;
    for (var u in peersMap) {
      var p = peersMap[u];
      if (!p || p === this) { continue; }
      // s111 P4 UX rev4: an in-doorway peer is non-physical -- don't
      // block our jump just because they happen to be at our head y.
      if (p.state === 'in-doorway') { continue; }
      if (!this._horizontalOverlap(p)) { continue; }
      if (Math.abs(p.y - headY) < 3) { return true; }
    }
    return false;
  };

  // Phase 2.4 -- render override that applies the "blocked" jitter offset
  // when _blockedTwitchMs > 0. Damped sine: amplitude ~3 px, frequency ~30 Hz
  // over the 150 ms lifetime, fades to zero. Local-only -- the actual y
  // (and therefore the broadcast y) never moves, so peers don't see it.
  PlayerSprite.prototype.render = function (ctx) {
    // s111 P4 UX rev4: skip when fully absorbed into a doorway.
    if (this._hidden) { return; }
    var yOffset = 0;
    if (this._blockedTwitchMs > 0) {
      var phase = this._blockedTwitchMs / 1000 * 30; // ~30 Hz oscillation
      var decay = this._blockedTwitchMs / 150;       // 1.0 -> 0 over lifetime
      yOffset = Math.sin(phase * Math.PI * 2) * 3 * decay;
    }
    var alpha = this.online ? 1.0 : 0.35;
    // s111 P4 UX rev4: doorway absorption is fade-only (the prior
    // scale-down was indistinguishable in practice; just the alpha
    // fade reads as "entering the hole"). Multiply alpha by (1-p).
    if (typeof this._absorbProgress === 'number' && this._absorbProgress > 0) {
      alpha *= (1 - this._absorbProgress);
    }
    if (alpha <= 0) { return; }
    if (alpha !== 1.0) { ctx.save(); ctx.globalAlpha = alpha; }
    this.spriteSheet.drawFrame(ctx, this.frameIndex, this.x, this.y + yOffset, this.scale, this.hue);
    if (alpha !== 1.0) { ctx.restore(); }
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

  // --- Doorway entity (v3 P4) ------------------------------------------
  //
  // One labelled doorway. Multiple instances spread evenly across the
  // canvas when state.doorways is open. Each renders a vertical hole
  // identical visually to GateDoor; the label sits above and a count
  // sits below. Walking into the doorway's x range + pressing Up casts
  // a vote (the matched doorway's doorId is the choice).

  function Doorway(getGroundY, opts) {
    this.getGroundY = getGroundY;
    this.x          = opts.x;        // center x of the hole
    this.width      = opts.width || 28;
    this.label      = opts.label || '';
    this.doorId     = opts.doorId || '';
    this.count      = 0;             // updated from state.doorways.tally
    // V7.3.6 z-order: doorways are background -- avatars + coins paint
    // on top so the mouse-hole black doesn't occlude characters.
    this.zIndex     = 1;
  }
  Doorway.prototype.update = function () {};
  Doorway.prototype.render = function (ctx) {
    var groundY = this.getGroundY();
    var holeH   = 32;
    var holeW   = this.width;
    var halfW   = holeW / 2;
    // s111 P4 visual: tom-and-jerry mouse hole -- black rectangle
    // sitting on the ground with a black semicircular dome ON TOP
    // (a half-circle bulging UPWARD, away from the rectangle).
    //
    // Canvas convention: y-axis flipped. Angles measured CLOCKWISE
    // from +x. So 0=right, pi/2=DOWN, pi=left, 3pi/2=UP. Drawing arc
    // from pi to 0 with counterclockwise=FALSE goes pi -> 3pi/2 (up)
    // -> 0 -- the UPPER half-circle (the dome). counterclockwise=true
    // would go through pi/2 (down) -- inverted, eating INTO the rect.
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(this.x - halfW, groundY);
    ctx.lineTo(this.x - halfW, groundY - holeH);
    ctx.arc(this.x, groundY - holeH, halfW, Math.PI, 0, false);
    ctx.lineTo(this.x + halfW, groundY);
    ctx.closePath();
    ctx.fill();
    // Label above the dome.
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.label, this.x, groundY - holeH - halfW - 6);
    // Count below the baseline.
    ctx.font = '10px Arial';
    ctx.fillText(String(this.count), this.x, groundY + 14);
  };
  Doorway.prototype.containsX = function (x, halfPlayerW) {
    // Hit-test: is the player's center inside the doorway's hole?
    var slack = halfPlayerW || 8;
    return Math.abs(x - this.x) <= (this.width / 2 + slack);
  };

  // --- CoinSprite entity (V7.2 sprite-collide) --------------------------

  /**
   * Coin sprite rendered ON the avatar canvas (NOT the activity overlay)
   * so collision with avatars is native sprite-vs-sprite proximity, not
   * server-side abstract math. Pico-park feel: walk into the coin to
   * collect it. V7.3.1: cycles through a 3-frame spin animation
   * (bright / mid / dark) at COIN_FRAME_MS cadence; collected state
   * freezes on frame 0 + greys out.
   *
   * V7.4 blind-test: when `revealed` is false, the drink label renders
   * as '?' so the kids have to discover the identity by collecting.
   * Defaults to true so legacy (non-hidden) levels see no change.
   *
   * opts:
   *   x, y           -- canvas pixel coords (top-left of the sprite)
   *   size           -- render size in px (sprite is 32x32 source)
   *   coinId         -- stable id from the level state (e.g. 's1')
   *   drink          -- the drink label ('A'/'B') rendered above the coin
   *   collected      -- initial collected flag from server (true = grey)
   *   revealed       -- (V7.4) identity visible flag; default true. When
   *                     false, getLabelSpec returns '?' instead of drink.
   *   getLocalSprite -- () -> BoardSprite (the local player) for collision
   *   onCollect      -- (coinId) -> void; fired ONCE on first collision
   *   spawnReveal    -- (coinId, drink, x, y) -> void; (V7.4) fired ONCE
   *                     when the local player triggers a collect, so the
   *                     mount-scope wiring can spawn a RevealTextSprite.
   *   images         -- [Image, Image, Image] -- 3 spin frames in order
   */
  // V7.3.4: X+Y collision (was X-only). Without the Y check, walking
  // left-right past a coin counted as collecting it -- the "race to
  // mash arrow keys" anti-pattern (teacher feedback). Now players have
  // to JUMP up into a coin to grab it, so deciding WHICH coin matters.
  // X-tolerance stays generous so the moment of contact is forgiving;
  // Y-tolerance is sized to the natural jump arc.
  //
  // V7.3.5 tune: jump physics give peak height = JUMP_V0^2 / (2*GRAVITY)
  // = 280^2 / 1600 = 49 px above standing. Coin is positioned so peak
  // jump lands inside Y-tolerance and standing is well outside. See
  // _coinCanvasY below for the resulting math.
  var COIN_COLLISION_X_PX = 18;
  var COIN_COLLISION_Y_PX = 24;
  var COIN_DEFAULT_SIZE   = 24;   // render dim; source PNG is 32x32
  var COIN_FRAME_MS       = 280;  // V7.3.3: half the previous 140 -> ~3.5 Hz cycle, ~840 ms per full spin
  // V7.4 Codex MAJOR fold: if the optimistic local _sentCollect isn't
  // confirmed by the server within this window, the collect was rejected
  // (anti-cheat fail, race, stale position). syncLevelCoins clears the
  // flag so the coin reappears for the local player and a later
  // legitimate collect can still pop the reveal text.
  var COIN_SENT_TTL_MS    = 600;

  function CoinSprite(opts) {
    this.images         = Array.isArray(opts.images) ? opts.images : [];
    this.x              = opts.x;
    this.y              = opts.y;
    this.size           = opts.size || COIN_DEFAULT_SIZE;
    this.coinId         = opts.coinId;
    this.drink          = opts.drink || '';
    this.collected      = opts.collected === true;
    // V7.4 blind-test: default true so existing levels (no hidden field
    // on the server-side SipStation) keep identity visible from t=0.
    this._revealed      = opts.revealed !== false;
    this.getLocalSprite = (typeof opts.getLocalSprite === 'function') ? opts.getLocalSprite : function () { return null; };
    this.onCollect      = (typeof opts.onCollect === 'function') ? opts.onCollect : null;
    // V7.4: optional callback fired ONCE when the local player triggers
    // collect. syncLevelCoins wires it to spawn a RevealTextSprite at
    // the coin's position so the floating '+A' / '+B' appears for the
    // collecting client (peers spawn their own from the wire transition).
    this.spawnReveal    = (typeof opts.spawnReveal === 'function') ? opts.spawnReveal : null;
    this._bobT          = 0;
    this._frameMs       = 0;     // accumulator for spin frame advance
    this._frameIdx      = 0;
    this._sentCollect   = false;
    this._sentCollectAt = 0;     // V7.4: ms timestamp; gated by COIN_SENT_TTL_MS
    // V7.3.6 z-order: above doorways/default, below avatars.
    this.zIndex         = 5;
    this.engine         = null;
  }

  // V7.3.3 cross-screen disappearance contract:
  //
  //   1. Local player walks into coin -> CoinSprite.update sets
  //      _sentCollect=true and fires onCollect (sends
  //      classroom_activity_value {kind:'collect',coinId}). render
  //      starts returning early -> coin gone for the local player.
  //   2. Server (level-engine.applyInput) validates + sets the
  //      coin's `collected` flag, bumps the tally.
  //   3. Next classroom_activity_state tick (5 Hz) broadcasts the
  //      updated state.coins[] to every client in the section.
  //   4. Each client's _reduce updates state.activity.state, then
  //      syncLevelCoins (in mount()) does `existing.collected =
  //      c.collected === true` for every coin -- peer CoinSprite
  //      instances flip their `collected` to true.
  //   5. _isCollecting() returns true on peers -> render returns
  //      early there too -> coin gone on every screen.
  CoinSprite.prototype._isCollecting = function () {
    return this.collected || this._sentCollect;
  };

  CoinSprite.prototype.update = function (dt) {
    this._bobT += dt;
    var collecting = this._isCollecting();
    // Advance spin frame while NOT collecting. Collected coins are
    // hidden from render entirely, so the frame counter doesn't matter.
    if (!collecting) {
      this._frameMs += dt * 1000;
      while (this._frameMs >= COIN_FRAME_MS) {
        this._frameMs -= COIN_FRAME_MS;
        this._frameIdx = (this._frameIdx + 1) % Math.max(1, this.images.length);
      }
      var me = this.getLocalSprite();
      if (!me) return;
      // V7.3.4 X+Y collision: player must jump up to coin's vertical band.
      // Walking under the coin (player y is ~28 px below coin y when
      // standing) stays outside Y-tolerance and doesn't collide. Jumping
      // brings player y closer to coin y; collision fires mid-jump.
      var myCx   = me.x + (me._spriteSize   || 24) / 2;
      var myCy   = me.y + (me._spriteHeight || 24) / 2;
      var coinCx = this.x + this.size / 2;
      var coinCy = this.y + this.size / 2;
      if (Math.abs(myCx - coinCx) <= COIN_COLLISION_X_PX &&
          Math.abs(myCy - coinCy) <= COIN_COLLISION_Y_PX) {
        this._sentCollect   = true;   // optimistic; cleared by syncLevelCoins if server doesn't confirm within COIN_SENT_TTL_MS
        this._sentCollectAt = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
        if (this.onCollect) {
          try { this.onCollect(this.coinId); } catch (_) {}
        }
        // V7.4 blind-test: also fire the local reveal-text spawn so the
        // collecting client sees '+A' / '+B' float up immediately. Peers
        // get their own spawn when syncLevelCoins observes the wire
        // collected=false->true transition (see syncLevelCoins).
        if (this.spawnReveal) {
          try { this.spawnReveal(this.coinId, this.drink, this.x + this.size / 2, this.y + this.size / 2); } catch (_) {}
        }
      }
    }
  };

  CoinSprite.prototype.render = function (ctx) {
    // V7.3.3: collected / locally-collected coins disappear instantly.
    // No animation -- the absence IS the feedback.
    if (this._isCollecting()) return;
    var img = this.images[this._frameIdx] || this.images[0];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var bobOffset = Math.sin(this._bobT * 4) * 2;
    try {
      ctx.drawImage(img, this.x, this.y + bobOffset, this.size, this.size);
    } catch (_) {}
  };

  CoinSprite.prototype.getLabelSpec = function () {
    var cx   = this.x + this.size / 2;
    var topY = this.y - 4;
    // V7.4 blind-test: pre-reveal coins show '?' instead of the drink
    // identity. isGold stays true pre-reveal so the gold '?' reads as a
    // collectible target. Post-reveal the drink letter ('A' / 'B') paints
    // in the normal label color band (isGold == !collected as before).
    var text = (this._revealed === false) ? '?' : (this.drink || '');
    var isGold = (this._revealed === false) ? true : !this.collected;
    return { text: text, x: cx, y: topY, isGold: isGold };
  };

  // Module-scope coin frame loader. Loads all 3 spin frames once;
  // CoinSprite.render is a no-op until the frames are ready. Each
  // PNG is 32x32 RGBA (see coin_0.png / coin_1.png / coin_2.png --
  // bright / mid / dark frames of the source-atlas spin strip).
  var _coinFrames = null;
  function _ensureCoinFrames() {
    if (_coinFrames) return _coinFrames;
    if (typeof Image === 'undefined') return [];   // jsdom may stub Image; OK either way
    _coinFrames = [];
    for (var i = 0; i < 3; i++) {
      var im = new Image();
      im.src = 'coin_' + i + '.png';
      _coinFrames.push(im);
    }
    return _coinFrames;
  }

  // --- RevealTextSprite entity (V7.4 blind-test) ------------------------

  /**
   * Floating "+A" / "+B" text that pops on coin collect. Pure visual --
   * NO collision logic. Spawns at the coin's center, drifts up, and
   * fades out over durationMs (default 900 ms), then schedules its own
   * removal via engine.removeEntity. The caller is responsible for
   * generating a unique entity id (sprite is registered as
   * 'reveal_<id>' in syncLevelCoins).
   *
   * opts:
   *   x, y       -- canvas pixel coords (TEXT IS CENTERED at (x, y))
   *   text       -- the label (e.g. '+A' or '+B')
   *   color      -- CSS color string (gold for A, cyan for B)
   *   durationMs -- ms before auto-despawn (default 900)
   */
  var REVEAL_DEFAULT_MS    = 900;
  var REVEAL_RISE_PX       = 24;
  var REVEAL_COLOR_DEFAULT = '#FFD700';   // gold

  function RevealTextSprite(opts) {
    this.x          = opts.x;
    this.y          = opts.y;
    this.text       = opts.text || '';
    this.color      = opts.color || REVEAL_COLOR_DEFAULT;
    this.durationMs = (typeof opts.durationMs === 'number' && opts.durationMs > 0) ? opts.durationMs : REVEAL_DEFAULT_MS;
    this._elapsedMs = 0;
    this._id        = null;   // set by syncLevelCoins so update() can self-remove
    this._removed   = false;
    // zIndex = 20 -- paint above everything else (avatars/coins/goal).
    this.zIndex     = 20;
    this.engine     = null;
  }

  RevealTextSprite.prototype.update = function (dt) {
    if (this._removed) return;
    this._elapsedMs += dt * 1000;
    if (this._elapsedMs >= this.durationMs) {
      this._removed = true;
      if (this.engine && this._id) {
        try { this.engine.removeEntity('reveal_' + this._id); } catch (_) {}
      }
    }
  };

  RevealTextSprite.prototype.render = function (ctx) {
    if (this._removed) return;
    if (!ctx || typeof ctx.fillText !== 'function') return;
    var progress = Math.min(1, this._elapsedMs / this.durationMs);
    var dy       = progress * REVEAL_RISE_PX;
    var alpha    = 1 - progress;
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    var prevFont  = ctx.font;
    var prevAlign = ctx.textAlign;
    var prevFill  = ctx.fillStyle;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font        = 'bold 14px monospace';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = this.color;
    try {
      ctx.fillText(this.text, this.x, this.y - dy);
    } catch (_) {}
    ctx.globalAlpha = prevAlpha;
    ctx.font        = prevFont;
    ctx.textAlign   = prevAlign;
    ctx.fillStyle   = prevFill;
  };

  // The reveal text draws itself; the engine's label-pass should skip it.
  RevealTextSprite.prototype.getLabelSpec = function () { return null; };

  // V7.4: color pick for the floating "+<drink>" pop. Gold reads as
  // 'good' / canonical-A; cyan distinguishes B without screaming. Add
  // more letters here if a level ever introduces drink C/D/etc.
  function _revealColorForDrink(drink) {
    if (drink === 'A') return '#FFD700';   // gold
    if (drink === 'B') return '#55ccff';   // cyan
    return '#FFFFFF';                      // fallback: plain white
  }

  // --- TallyDisplay entity (V7.4 blind-test) ----------------------------

  /**
   * Live tally chip rendered on the avatar canvas. Shows the running
   * count of sips per drink letter (e.g. "Sips - A: 2  B: 1"). Spawns
   * when state.activity.level.actors contains a TallyDisplay actor
   * bound to tally.sips and an activity is live; despawns when the
   * level ends. The actor's chip-X position is rescaled into canvas
   * pixel space (same mapping as coins) and Y sits above the coin row.
   *
   * opts:
   *   x, y     -- canvas pixel coords (center-bottom of the chip)
   *   getTally -- () -> { A: number, B: number, ... }; null/missing OK
   */
  var TALLY_FONT   = '10px monospace';
  var TALLY_PAD_X  = 6;
  var TALLY_PAD_Y  = 3;
  var TALLY_ALPHA  = 0.85;
  var TALLY_BG     = '#222';
  var TALLY_FG     = '#FFFFFF';

  function TallyDisplay(opts) {
    this.x        = opts.x;
    this.y        = opts.y;
    this.getTally = (typeof opts.getTally === 'function') ? opts.getTally : function () { return null; };
    // zIndex = 5 -- same band as coins/goal; below avatars (z >= 10).
    this.zIndex   = 5;
    this.engine   = null;
  }

  TallyDisplay.prototype.update = function (/* dt */) { /* no-op */ };

  // Tally has no separate label; render draws the text inside its own
  // background rect so the engine's label pass should skip it.
  TallyDisplay.prototype.getLabelSpec = function () { return null; };

  // Build the display string: "Sips - A: N  B: N  ...". A and B are
  // always shown (canonical drinks) even if zero; any other non-zero
  // letters tag onto the end so future drinks render without a code
  // change.
  TallyDisplay.prototype._buildText = function () {
    var sips = this.getTally() || {};
    var parts = [];
    var aCount = (typeof sips.A === 'number') ? sips.A : 0;
    var bCount = (typeof sips.B === 'number') ? sips.B : 0;
    parts.push('A: ' + aCount);
    parts.push('B: ' + bCount);
    var keys = Object.keys(sips);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'A' || k === 'B') continue;
      var v = sips[k];
      if (typeof v === 'number' && v > 0) {
        parts.push(k + ': ' + v);
      }
    }
    return 'Sips - ' + parts.join('  ');
  };

  TallyDisplay.prototype.render = function (ctx) {
    if (!ctx || typeof ctx.fillText !== 'function') return;
    var text = this._buildText();

    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    var prevFont  = ctx.font;
    var prevAlign = ctx.textAlign;
    var prevFill  = ctx.fillStyle;

    ctx.font      = TALLY_FONT;
    ctx.textAlign = 'center';

    // Measure for the background rect. measureText can be missing in
    // some test stubs -- fall back to a rough estimate so we still draw.
    var textW = 0;
    if (typeof ctx.measureText === 'function') {
      try { textW = ctx.measureText(text).width || 0; } catch (_) { textW = text.length * 6; }
    } else {
      textW = text.length * 6;
    }
    var rectW = textW + TALLY_PAD_X * 2;
    var rectH = 14   + TALLY_PAD_Y * 2;
    var rectX = this.x - rectW / 2;
    var rectY = this.y - rectH;

    ctx.globalAlpha = TALLY_ALPHA;
    ctx.fillStyle   = TALLY_BG;
    if (typeof ctx.fillRect === 'function') {
      try { ctx.fillRect(rectX, rectY, rectW, rectH); } catch (_) {}
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle   = TALLY_FG;
    try { ctx.fillText(text, this.x, this.y - TALLY_PAD_Y - 2); } catch (_) {}

    ctx.globalAlpha = prevAlpha;
    ctx.font        = prevFont;
    ctx.textAlign   = prevAlign;
    ctx.fillStyle   = prevFill;
  };

  // --- GoalSprite entity (V7.2 sprite-collide) --------------------------

  /**
   * Goal sprite rendered ON the avatar canvas (mirrors CoinSprite). The
   * goal flag was a paint on the activity overlay in V7.1; V7.2 moves
   * it onto the sprite engine so completion is native collision (walk
   * into the door to clear the level). V7.3 swap: two-state door art
   * (canonical pico park asset) -- door_closed.png while !reached,
   * door_open.png once reached. Reads as 'walk through to exit'.
   *
   * V7.5 key-gate: the goal can also be "locked" -- a third render state
   * where the door is closed AND collision is a no-op. Set by the
   * server's goal.locked flag (true while key && !key.collected). Once
   * the key is collected, locked flips false; render returns to the
   * standard reached / not-reached two-state logic.
   *
   * opts:
   *   x, y           -- canvas pixel coords (top-left of the sprite)
   *   size           -- render size in px
   *   reached        -- initial reached flag from server
   *   locked         -- (V7.5) initial locked flag from server (default false)
   *   getLocalSprite -- () -> BoardSprite (the local player) for collision
   *   onReach        -- () -> void; fired ONCE on first collision
   *   imageClosed    -- Image() for the locked / not-yet-reached state
   *   imageOpen      -- Image() for the unlocked / reached state
   */
  var GOAL_COLLISION_PX = 20;
  var GOAL_DEFAULT_SIZE = 28;

  function GoalSprite(opts) {
    this.imageClosed    = opts.imageClosed || null;
    this.imageOpen      = opts.imageOpen   || null;
    this.x              = opts.x;
    this.y              = opts.y;
    this.size           = opts.size || GOAL_DEFAULT_SIZE;
    this.reached        = opts.reached === true;
    // V7.5 key-gate: locked stays false for legacy levels (no key actor on
    // the server side -> server emits locked=false on every state tick).
    this.locked         = opts.locked === true;
    this.getLocalSprite = (typeof opts.getLocalSprite === 'function') ? opts.getLocalSprite : function () { return null; };
    this.onReach        = (typeof opts.onReach === 'function') ? opts.onReach : null;
    this._bobT          = 0;
    this._sentReach     = false;
    // V7.3.6 z-order: same band as coins (above doorways, below avatars).
    this.zIndex         = 5;
    this.engine         = null;
  }

  GoalSprite.prototype.update = function (dt) {
    this._bobT += dt;
    // V7.5 key-gate: locked goal is a no-op for collision -- player walks
    // up to it but cannot fire reach-goal until the key is collected.
    if (this.locked) return;
    if (this.reached || this._sentReach) return;
    var me = this.getLocalSprite();
    if (!me) return;
    var myCx   = me.x + (me._spriteSize || 24) / 2;
    var goalCx = this.x + this.size / 2;
    if (Math.abs(myCx - goalCx) <= GOAL_COLLISION_PX) {
      this._sentReach = true;
      if (this.onReach) {
        try { this.onReach(); } catch (_) {}
      }
    }
  };

  GoalSprite.prototype.render = function (ctx) {
    // V7.5 three-state render:
    //   locked === true                  -> door_closed (key not yet collected)
    //   locked === false && !reached     -> door_open   (unlocked, walking toward it)
    //   reached === true                 -> door_open + pulse alpha (existing)
    var img;
    if (this.locked) {
      img = this.imageClosed;
    } else if (this.reached) {
      img = this.imageOpen;
    } else {
      img = this.imageOpen;
    }
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var bobOffset = this.reached ? 0 : Math.sin(this._bobT * 3) * 1.5;
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    if (this.reached) {
      // Brighten / pulse on reached so the moment of completion reads.
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this._bobT * 6);
    }
    try {
      ctx.drawImage(img, this.x, this.y + bobOffset, this.size, this.size);
    } catch (_) {}
    ctx.globalAlpha = prevAlpha;
  };

  GoalSprite.prototype.getLabelSpec = function () {
    var cx   = this.x + this.size / 2;
    var topY = this.y - 4;
    // V7.5: locked goal reads as 'LOCKED' so the player can see the door
    // is gated on the key (not just visually closed-and-broken).
    var text;
    if (this.reached) { text = 'CLEARED!'; }
    else if (this.locked) { text = 'LOCKED'; }
    else { text = 'GOAL'; }
    return { text: text, x: cx, y: topY, isGold: true };
  };

  var _doorClosedImage = null;
  function _ensureDoorClosedImage() {
    if (_doorClosedImage) return _doorClosedImage;
    if (typeof Image === 'undefined') return null;
    _doorClosedImage = new Image();
    _doorClosedImage.src = 'door_closed.png';
    return _doorClosedImage;
  }
  var _doorOpenImage = null;
  function _ensureDoorOpenImage() {
    if (_doorOpenImage) return _doorOpenImage;
    if (typeof Image === 'undefined') return null;
    _doorOpenImage = new Image();
    _doorOpenImage.src = 'door_open.png';
    return _doorOpenImage;
  }

  // --- KeySprite entity (V7.5 key-gate) ---------------------------------

  /**
   * Single shared key sprite rendered ON the avatar canvas (mirrors
   * CoinSprite's collision shape). Only one key per level -- spawned
   * when state.activity.state.phase === 'KEY_HUNT' AND state.key is
   * present AND !state.key.collected. The first player to JUMP into it
   * (X+Y collision, same tolerances as a coin) fires onCollect which
   * sends `classroom_activity_value { kind: 'collect-key' }` and sets
   * _sentCollect=true so render bails immediately (instant vanish).
   *
   * NO coinId on the wire payload -- key is the singleton.
   *
   * opts:
   *   x, y           -- canvas pixel coords (top-left of the sprite)
   *   size           -- render size in px (default 24, same as a coin)
   *   getLocalSprite -- () -> BoardSprite (the local player) for collision
   *   onCollect      -- () -> void; fired ONCE on first collision
   *   images         -- [Image, ...] -- first frame is rendered. If a
   *                     non-empty array is passed, additional frames are
   *                     not animated (the key art is static at V7.5);
   *                     accepting an array keeps the wiring symmetric
   *                     with CoinSprite for future spin support.
   */
  var KEY_COLLISION_X_PX = 18;   // same as coin
  var KEY_COLLISION_Y_PX = 24;   // same as coin
  var KEY_DEFAULT_SIZE   = 24;
  var KEY_SENT_TTL_MS    = 600;  // same TTL as coin; clears stale optimistic

  function KeySprite(opts) {
    this.images         = Array.isArray(opts.images) ? opts.images : [];
    this.x              = opts.x;
    this.y              = opts.y;
    this.size           = opts.size || KEY_DEFAULT_SIZE;
    this.collected      = opts.collected === true;
    this.getLocalSprite = (typeof opts.getLocalSprite === 'function') ? opts.getLocalSprite : function () { return null; };
    this.onCollect      = (typeof opts.onCollect === 'function') ? opts.onCollect : null;
    this._bobT          = 0;
    this._sentCollect   = false;
    this._sentCollectAt = 0;     // ms timestamp; gated by KEY_SENT_TTL_MS
    // zIndex 5 -- same band as coins/goal; below avatars.
    this.zIndex         = 5;
    this.engine         = null;
  }

  KeySprite.prototype._isCollecting = function () {
    return this.collected || this._sentCollect;
  };

  KeySprite.prototype.update = function (dt) {
    this._bobT += dt;
    if (this._isCollecting()) return;
    var me = this.getLocalSprite();
    if (!me) return;
    // X+Y collision (identical to CoinSprite). Player must JUMP up into
    // the key's vertical band; walking under it does not trigger.
    var myCx  = me.x + (me._spriteSize   || 24) / 2;
    var myCy  = me.y + (me._spriteHeight || 24) / 2;
    var keyCx = this.x + this.size / 2;
    var keyCy = this.y + this.size / 2;
    if (Math.abs(myCx - keyCx) <= KEY_COLLISION_X_PX &&
        Math.abs(myCy - keyCy) <= KEY_COLLISION_Y_PX) {
      this._sentCollect   = true;   // optimistic; vanish instantly
      this._sentCollectAt = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
      if (this.onCollect) {
        try { this.onCollect(); } catch (_) {}
      }
    }
  };

  KeySprite.prototype.render = function (ctx) {
    // Collected / locally-collected keys disappear instantly (same as a coin).
    if (this._isCollecting()) return;
    var img = this.images[0];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var bobOffset = Math.sin(this._bobT * 3) * 2;
    try {
      ctx.drawImage(img, this.x, this.y + bobOffset, this.size, this.size);
    } catch (_) {}
  };

  KeySprite.prototype.getLabelSpec = function () {
    // Hide the label once the key is collected (or pending collection),
    // so a transient 'KEY' floater doesn't outlive the sprite render.
    if (this._isCollecting()) return null;
    var cx   = this.x + this.size / 2;
    var topY = this.y - 4;
    return { text: 'KEY', x: cx, y: topY, isGold: true };
  };

  var _keyImage = null;
  function _ensureKeyImage() {
    if (_keyImage) return _keyImage;
    if (typeof Image === 'undefined') return null;
    _keyImage = new Image();
    _keyImage.src = 'key.png';
    return _keyImage;
  }

  // --- StageIndicator entity (V7.5 sequential-stages) -------------------

  /**
   * Tiny "Stage N / M" panel pinned top-right of the avatar canvas. Shows
   * during VOTING phase for any multi-stage level (stagesTotal > 1).
   * Hidden otherwise. The text is built from getter callbacks so the
   * sprite reads the latest state on every render tick (no need to
   * rebuild the entity when currentStage advances).
   *
   * opts:
   *   getCurrent   -- () -> number (1-based for display; computed from
   *                   currentStage + 1 by the caller).
   *   getTotal     -- () -> number (stagesTotal).
   *   getViewportW -- () -> number (canvas width in CSS pixels). Used to
   *                   compute the right-aligned x position on every render.
   */
  var STAGE_FONT     = '10px monospace';
  var STAGE_PAD_X    = 6;
  var STAGE_PAD_Y    = 3;
  var STAGE_ALPHA    = 0.85;
  var STAGE_BG       = '#222';
  var STAGE_FG       = '#FFD700';   // gold reads as 'progress meter'
  var STAGE_TOP_Y    = 12;          // px from the top of the canvas
  var STAGE_RIGHT_PX = 6;           // px gap from the right edge

  function StageIndicator(opts) {
    this.getCurrent   = (typeof opts.getCurrent === 'function') ? opts.getCurrent : function () { return 1; };
    this.getTotal     = (typeof opts.getTotal === 'function') ? opts.getTotal : function () { return 1; };
    this.getViewportW = (typeof opts.getViewportW === 'function') ? opts.getViewportW : function () { return 320; };
    // zIndex 5 -- same band as coins/goal/tally; above doorways, below avatars.
    this.zIndex       = 5;
    this.engine       = null;
  }

  StageIndicator.prototype.update = function (/* dt */) { /* no-op */ };

  // Indicator paints its own text+bg; engine's label pass should skip it.
  StageIndicator.prototype.getLabelSpec = function () { return null; };

  StageIndicator.prototype._buildText = function () {
    var n = this.getCurrent() || 1;
    var m = this.getTotal()   || 1;
    return n + ' / ' + m;
  };

  StageIndicator.prototype.render = function (ctx) {
    if (!ctx || typeof ctx.fillText !== 'function') return;
    var text = this._buildText();

    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    var prevFont  = ctx.font;
    var prevAlign = ctx.textAlign;
    var prevFill  = ctx.fillStyle;

    ctx.font      = STAGE_FONT;
    ctx.textAlign = 'left';

    var textW = 0;
    if (typeof ctx.measureText === 'function') {
      try { textW = ctx.measureText(text).width || 0; } catch (_) { textW = text.length * 6; }
    } else {
      textW = text.length * 6;
    }
    var rectW = textW + STAGE_PAD_X * 2;
    var rectH = 14    + STAGE_PAD_Y * 2;
    var vw    = this.getViewportW() || 320;
    var rectX = vw - rectW - STAGE_RIGHT_PX;
    var rectY = STAGE_TOP_Y;

    ctx.globalAlpha = STAGE_ALPHA;
    ctx.fillStyle   = STAGE_BG;
    if (typeof ctx.fillRect === 'function') {
      try { ctx.fillRect(rectX, rectY, rectW, rectH); } catch (_) {}
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle   = STAGE_FG;
    try { ctx.fillText(text, rectX + STAGE_PAD_X, rectY + STAGE_PAD_Y + 10); } catch (_) {}

    ctx.globalAlpha = prevAlpha;
    ctx.font        = prevFont;
    ctx.textAlign   = prevAlign;
    ctx.fillStyle   = prevFill;
  };

  // --- ResultPanel entity (V7.6 doorways-close in-canvas) ---------------

  /**
   * Monochrome in-canvas panel rendered above the avatar scene when the
   * server closes a doorways round. Shows the per-option dot plot tally
   * and (when the engine emits reflection.active===true for a wrong-door
   * win) the substituted reflection text below the chart.
   *
   * Replaces the legacy DOM histogram pulldown on the doorways-close path.
   * The v2.1 poll pulldown (showResultScreen / hideResultScreen) is
   * preserved for the closedPoll path -- ResultPanel is doorways-only.
   *
   * opts:
   *   getClosedDoorways -- () -> { question, options:[{label, doorId}],
   *                                 tally:[{doorId, count}] } | null
   *   getReflection     -- () -> { active, reflectionText, ... } | null
   *   getViewportW      -- () -> number (canvas width, CSS px)
   *
   * Styling is pure black on white. zIndex 15 -- above coins/goal/key/tally
   * (band 5) but below RevealTextSprite which paints on top of everything.
   */
  var RP_FONT_TITLE    = 'bold 11px monospace';
  var RP_FONT_LABEL    = '10px monospace';
  var RP_FONT_REFL     = '10px monospace';
  var RP_BG            = '#FFFFFF';
  var RP_FG            = '#000000';
  var RP_STROKE        = '#000000';
  var RP_DOT_R         = 3;       // radius -> ~6 px diameter
  var RP_DOT_GAP       = 1;
  var RP_DOT_COL_STACK = 15;      // wrap a stack into a new column after N
  var RP_PAD_X         = 10;
  var RP_PAD_Y         = 8;
  var RP_DEFAULT_W     = 280;
  var RP_TOP_Y         = 6;
  var RP_LABEL_GAP     = 4;
  var RP_TITLE_TEXT    = 'Class Vote';

  function ResultPanel(opts) {
    this.getClosedDoorways = (typeof opts.getClosedDoorways === 'function') ? opts.getClosedDoorways : function () { return null; };
    this.getReflection     = (typeof opts.getReflection === 'function')     ? opts.getReflection     : function () { return null; };
    this.getViewportW      = (typeof opts.getViewportW === 'function')      ? opts.getViewportW      : function () { return DEFAULT_BOARD_W; };
    // zIndex 15: above the band-5 cluster (coins/goal/key/tally/stage),
    // below RevealTextSprite (typically renders without a zIndex, so it
    // ends up on top via insertion order; ResultPanel never overlaps a
    // reveal anyway -- doors close after a vote, reveals fire from coins).
    this.zIndex = 15;
    this.engine = null;
  }

  ResultPanel.prototype.update = function (/* dt */) { /* no-op */ };

  // Panel paints its own title + labels + body; engine label pass skips it.
  ResultPanel.prototype.getLabelSpec = function () { return null; };

  ResultPanel.prototype._wrapText = function (ctx, text, maxWidth) {
    if (!text) { return []; }
    var words = String(text).split(/\s+/);
    var lines = [];
    var cur   = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) { continue; }
      var trial = cur ? (cur + ' ' + w) : w;
      var width = 0;
      if (typeof ctx.measureText === 'function') {
        try { width = ctx.measureText(trial).width || 0; } catch (_) { width = trial.length * 6; }
      } else {
        width = trial.length * 6;
      }
      if (width <= maxWidth || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) { lines.push(cur); }
    return lines;
  };

  ResultPanel.prototype.render = function (ctx) {
    if (!ctx || typeof ctx.fillText !== 'function') return;
    var doorways = this.getClosedDoorways();
    if (!doorways || !Array.isArray(doorways.options) || doorways.options.length === 0) return;

    var options = doorways.options;
    var tally   = Array.isArray(doorways.tally) ? doorways.tally : [];
    var reflection = this.getReflection();
    var reflActive = !!(reflection && reflection.active);
    var reflText   = reflActive ? String(reflection.reflectionText || '') : '';

    // Build counts-by-doorId for fast lookup.
    var countByDoor = {};
    for (var t = 0; t < tally.length; t++) {
      var row = tally[t];
      if (row && row.doorId != null) { countByDoor[row.doorId] = row.count || 0; }
    }

    // Layout: width = min(RP_DEFAULT_W, 70% of canvas), centered horizontally.
    var vw    = this.getViewportW() || DEFAULT_BOARD_W;
    var panelW = Math.min(RP_DEFAULT_W, Math.max(160, Math.floor(vw * 0.7)));
    var panelX = Math.floor((vw - panelW) / 2);
    var panelY = RP_TOP_Y;

    // Compute max stack height across options so columns share a baseline.
    var maxCount = 0;
    for (var i = 0; i < options.length; i++) {
      var c = countByDoor[options[i].doorId] || 0;
      if (c > maxCount) { maxCount = c; }
    }
    var stackRows  = Math.min(maxCount, RP_DOT_COL_STACK);
    var stackCols  = Math.ceil(Math.max(1, maxCount) / RP_DOT_COL_STACK);
    var dotPitch   = (RP_DOT_R * 2) + RP_DOT_GAP;
    var dotsH      = Math.max(dotPitch, stackRows * dotPitch);
    var labelH     = 12;

    // Reflection text wrap (only when active).
    var prevFont = ctx.font;
    ctx.font = RP_FONT_REFL;
    var reflLines = reflActive ? this._wrapText(ctx, reflText, panelW - RP_PAD_X * 2) : [];
    var reflH     = reflLines.length * 12;
    ctx.font = prevFont;

    var hrH       = 6;
    var titleH    = 14;
    var bodyH     = dotsH + RP_LABEL_GAP + labelH;
    var panelH    = RP_PAD_Y * 2 + titleH + hrH + bodyH + hrH + (reflActive ? (reflH + 4) : 0);

    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    var prevAlign = ctx.textAlign;
    var prevFill  = ctx.fillStyle;
    var prevStroke = ctx.strokeStyle;
    var prevLineW = ctx.lineWidth;

    // Background + border.
    ctx.globalAlpha = 1;
    ctx.fillStyle   = RP_BG;
    if (typeof ctx.fillRect === 'function') {
      try { ctx.fillRect(panelX, panelY, panelW, panelH); } catch (_) {}
    }
    ctx.strokeStyle = RP_STROKE;
    ctx.lineWidth   = 1;
    if (typeof ctx.strokeRect === 'function') {
      try { ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1); } catch (_) {}
    }

    // Title.
    ctx.fillStyle = RP_FG;
    ctx.font      = RP_FONT_TITLE;
    ctx.textAlign = 'center';
    try { ctx.fillText(RP_TITLE_TEXT, panelX + panelW / 2, panelY + RP_PAD_Y + 10); } catch (_) {}

    // Top horizontal rule.
    var hr1Y = panelY + RP_PAD_Y + titleH;
    if (typeof ctx.beginPath === 'function' && typeof ctx.moveTo === 'function') {
      try {
        ctx.beginPath();
        ctx.moveTo(panelX + RP_PAD_X, hr1Y);
        ctx.lineTo(panelX + panelW - RP_PAD_X, hr1Y);
        ctx.stroke();
      } catch (_) {}
    }

    // Dot columns + labels.
    var colCount = options.length;
    var colW     = (panelW - RP_PAD_X * 2) / colCount;
    var colsBaseY = hr1Y + hrH + dotsH;       // dots stack UP from this baseline
    var labelY    = colsBaseY + RP_LABEL_GAP + 10;

    ctx.font      = RP_FONT_LABEL;
    ctx.textAlign = 'center';
    for (var k = 0; k < colCount; k++) {
      var opt   = options[k];
      var label = (opt && opt.label != null) ? String(opt.label) : '';
      var count = countByDoor[opt && opt.doorId] || 0;
      var colCx = panelX + RP_PAD_X + colW * (k + 0.5);

      // Stack dots upward from baseline; wrap into extra columns at RP_DOT_COL_STACK.
      for (var d = 0; d < count; d++) {
        var stackIdx = Math.floor(d / RP_DOT_COL_STACK);
        var rowIdx   = d % RP_DOT_COL_STACK;
        var dotX     = colCx + (stackIdx - (stackCols - 1) / 2) * (RP_DOT_R * 2 + RP_DOT_GAP);
        var dotY     = colsBaseY - rowIdx * dotPitch - RP_DOT_R;
        if (typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function') {
          try {
            ctx.beginPath();
            ctx.fillStyle = RP_FG;
            ctx.arc(dotX, dotY, RP_DOT_R, 0, Math.PI * 2);
            ctx.fill();
          } catch (_) {}
        } else if (typeof ctx.fillRect === 'function') {
          try { ctx.fillRect(dotX - RP_DOT_R, dotY - RP_DOT_R, RP_DOT_R * 2, RP_DOT_R * 2); } catch (_) {}
        }
      }
      // Column label (door short label).
      ctx.fillStyle = RP_FG;
      try { ctx.fillText(label, colCx, labelY); } catch (_) {}
    }

    // Bottom horizontal rule.
    var hr2Y = labelY + 4;
    if (typeof ctx.beginPath === 'function' && typeof ctx.moveTo === 'function') {
      try {
        ctx.beginPath();
        ctx.moveTo(panelX + RP_PAD_X, hr2Y);
        ctx.lineTo(panelX + panelW - RP_PAD_X, hr2Y);
        ctx.stroke();
      } catch (_) {}
    }

    // Reflection text (only when active).
    if (reflActive && reflLines.length > 0) {
      ctx.font      = RP_FONT_REFL;
      ctx.textAlign = 'left';
      ctx.fillStyle = RP_FG;
      var ry = hr2Y + 12;
      for (var r = 0; r < reflLines.length; r++) {
        try { ctx.fillText(reflLines[r], panelX + RP_PAD_X, ry); } catch (_) {}
        ry += 12;
      }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.font        = prevFont;
    ctx.textAlign   = prevAlign;
    ctx.fillStyle   = prevFill;
    ctx.strokeStyle = prevStroke;
    ctx.lineWidth   = prevLineW;
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
      if (label.length > 12) { label = label.slice(0, 11) + '...'; }
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
    // P3 nudges (TEACHER_STUDENT_CONSOLE_SPEC.md section 6): caller-supplied raw-
    // message hook. Fires for every classroom_* message BEFORE _reduce runs.
    // Used by the Desk to surface 'classroom_teacher_nudge' as a toast, and
    // by the cockpit to surface 'classroom_student_nudge_reply' as a reply.
    var onClassroomMessage = (typeof opts.onClassroomMessage === 'function') ? opts.onClassroomMessage : null;
    // P4 Select Students (TEACHER_STUDENT_CONSOLE_SPEC.md section 11): caller-supplied
    // avatar-click callback + select-mode toggle. While selectModeActive is
    // true, peer position updates are gated (applyPos) so the teacher can
    // click reliably, AND canvas clicks fire onAvatarClick with the hit
    // sprite's username.
    var onAvatarClick = (typeof opts.onAvatarClick === 'function') ? opts.onAvatarClick : null;
    var selectModeActive = false;

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

    // P4+P9: canvas click -> avatar hit-test. Always fires onAvatarClick when
    // one is registered; the cockpit consumer decides routing (select-toggle
    // vs popup). selectMode flag is passed so the cockpit can branch.
    // Hit zone is generous (40x40) since rendered sprites are ~20x24 px.
    canvas.addEventListener('click', function (ev) {
      if (!onAvatarClick) return;
      var rect = canvas.getBoundingClientRect();
      // 2026-05-24 fix: sprite.x is in CSS-pixel space (engine.ctx applies a
      // setTransform(dpr,...) so drawFrame at sp.x lands at pixel sp.x*dpr).
      // ev.clientX is also in CSS space. The previous formula multiplied
      // cssX by canvas.width/clientWidth (= DPR), pushing the click coord
      // into pixel space and mismatching by a factor of DPR on HiDPI
      // displays. jsdom's DPR is always 1 so no test caught it.
      var cx = (ev.clientX != null) ? (ev.clientX - rect.left) : 0;
      var cy = (ev.clientY != null) ? (ev.clientY - rect.top)  : 0;
      var HIT = 20;
      var hit = null;
      for (var u in spriteEntities) {
        if (!Object.prototype.hasOwnProperty.call(spriteEntities, u)) continue;
        var sp = spriteEntities[u];
        if (!sp) continue;
        if (u === username) continue;   // never select self
        var dx = Math.abs(cx - sp.x);
        var dy = Math.abs(cy - sp.y);
        if (dx <= HIT && dy <= HIT) { hit = u; break; }
      }
      if (hit) {
        try { onAvatarClick({ username: hit, selectMode: selectModeActive }); } catch (_) {}
      }
    });

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

    // V7.5: histogram auto-dismiss timer. Each showResultScreen schedules
    // a 2 s setTimeout to call hideResultScreen; the timer is cleared if
    // hideResultScreen runs first (user-driven, close-button, refresh on
    // a new poll) so we never double-fire. Also cleared on destroy.
    var _resultDismissTimer = null;
    var _RESULT_AUTO_DISMISS_MS = 2000;

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
      // V7.5: arm the 2 s auto-dismiss timer. Cancels any previously
      // scheduled tick (back-to-back polls) before scheduling the new one.
      if (_resultDismissTimer != null) {
        try { clearTimeout(_resultDismissTimer); } catch (_) {}
        _resultDismissTimer = null;
      }
      try {
        _resultDismissTimer = setTimeout(function () {
          _resultDismissTimer = null;
          hideResultScreen();
        }, _RESULT_AUTO_DISMISS_MS);
      } catch (_) {}
    }

    function hideResultScreen() {
      resultScreen.style.transform = 'translateY(-100%)';
      _resultPolls = [];
      _resultIndex = 0;
      // V7.5: cancel any pending auto-dismiss tick (user-initiated close,
      // explicit hide, or new-poll refresh all flow through this path).
      if (_resultDismissTimer != null) {
        try { clearTimeout(_resultDismissTimer); } catch (_) {}
        _resultDismissTimer = null;
      }
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
      // v3 P4: doorways take priority over the gate (a doorways data
      // mode is mutually exclusive with the gate ritual on the server).
      if (state.doorways && doorwayEntities.length > 0) {
        var px = player.x + player._spriteSize / 2;
        for (var i = 0; i < doorwayEntities.length; i++) {
          var d = doorwayEntities[i];
          if (d.containsX(px, player._spriteSize / 2)) {
            safeSend({ type: 'classroom_doorway_vote', id: state.doorways.id, doorId: d.doorId });
            // s111 P4 UX rev3: scale-to-50% + fade-to-0 in place.
            // No y translation -- the sprite stays where they walked
            // to and visually shrinks + fades, suggesting they have
            // entered the doorway. Press Up again to reverse.
            player._absorbProgress = 0;
            player._absorbDir = 1;
            player._absorbDurationMs = 350;
            player.state = 'entering-doorway';
            player._isDoorwayWalk = true;
            // s111 P4 HOTFIX: closure that retracts THIS vote if the
            // student cancels out of the doorway. Captures the current
            // doorways id so the retract targets the right session
            // even if the teacher closes + reopens between cast and
            // cancel (then the server's id-match check rejects the
            // stale retract). PlayerSprite.update calls this on
            // cancel-complete and clears it.
            var capturedDoorwayId = state.doorways.id;
            player._cancelHandler = function() {
              safeSend({ type: 'classroom_doorway_retract', id: capturedDoorwayId });
            };
            // s111 P4 HOTFIX: force-broadcast state='in-doorway' RIGHT
            // NOW so the server records it before any rate-limit can
            // eat the next emit. Once state='entering-doorway' the
            // update() block returns early before the emit logic --
            // so without this immediate send, the wire might never
            // see 'in-doorway' and a refresh would restore the avatar
            // OUTSIDE the hole (incongruent with the vote tally).
            if (typeof player.onPos === 'function') {
              try {
                player.onPos({
                  x: player.x, y: player.y, state: 'in-doorway', vx: 0
                });
              } catch (_) {}
              if (typeof player._now === 'function') {
                player._lastPosMs = player._now();
              }
              player._restEmitted = true;
            }
            return;
          }
        }
      }
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

    // 2026-05-24 fix: clamp an incoming sprite x to the local canvas bounds.
    // The server persists member.pos.x from whichever client wrote it last;
    // a student who walked to x=919 on a wider canvas would push their
    // sprite off the right edge of a narrower cockpit canvas (and out of
    // hit-test range). Receivers should always clamp -- they own their own
    // viewport. NaN / non-finite x falls back to 0.
    function clampSpriteX(x, sp) {
      if (typeof x !== 'number' || !isFinite(x)) { return 0; }
      var cw = (engine && engine.canvas)
        ? (engine.canvas.width / (root.devicePixelRatio || 1))
        : DEFAULT_BOARD_W;
      var sw = (sp && sp._spriteSize) || getSpriteWidth();
      var maxX = Math.max(0, cw - sw);
      return Math.max(0, Math.min(maxX, x));
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
        // LIVE_CLASSROOM_SCALING knob 1 -- live room-size source.
        // Reads state.members through the mount-scope closure on each
        // tick; no protocol change, no caching (Object.keys is cheap at
        // class scale).
        baseOpts.getMemberCount = function () {
          return Object.keys(state.members).length;
        };
        // Phase 2 -- broadcast position to roommates.
        baseOpts.onPos = function (msg) {
          // 2026-05-24 V5 Codex BLOCKER fold: include canvasW so the
          // server can interpret x in the SENDER's coord space. The
          // colorbox-hue plugin (and any future position-driven plugin)
          // needs to know the client's actual canvas width to bin
          // positions into zones, since the responsive board may render
          // wider than DEFAULT_BOARD_W=320 on a wide Desk sidebar.
          var senderCw = (engine && engine.canvas)
            ? (engine.canvas.width / (root.devicePixelRatio || 1))
            : DEFAULT_BOARD_W;
          var payload = {
            type:    'classroom_pos',
            x:       msg.x,
            y:       msg.y,
            state:   msg.state,
            vx:      msg.vx,
            canvasW: senderCw
          };
          // v3 P3: prefer DC when open; fall back to WS.
          if (_peerDcOpen && _peerDataChannel) {
            try { _peerDataChannel.send(JSON.stringify(payload)); return; } catch (_) {}
          }
          safeSend(payload);
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
        // 2026-05-24 fix: server-persisted pos may have been written from a
        // wider canvas (other client, prior session). Clamp to local bounds
        // so the spawn lands on-screen + clickable.
        sp.x = clampSpriteX(member.pos.x, sp);
        sp.y = member.pos.y;
        sp._moved = true;
        // s111 P4 HOTFIX: restore in-doorway state on refresh. The
        // server records member.pos.state ('in-doorway' for absorbed
        // students); without restoring it, on every cockpit refresh
        // the peer BoardSprite would be created in default state and
        // students would appear to "come back out of the hole." For
        // the LOCAL student PlayerSprite (refresh of own browser),
        // restore the full absorb state so they stay invisible until
        // they press Up to cancel.
        if (member.pos.state === 'in-doorway') {
          if (sp instanceof PlayerSprite) {
            sp.state                = 'entering-doorway';
            sp._absorbProgress      = 1;
            sp._absorbDir           = 1;
            sp._absorbDurationMs    = 350;
            sp._isDoorwayWalk       = true;
            sp._hidden              = true;
          } else {
            sp.state                 = 'in-doorway';
            sp._peerAbsorbProgress   = 1;
          }
        }
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

    // --- v3 P4 doorway entities (vote-with-your-feet) ----------------

    var doorwayEntities = [];

    function showDoorways(options) {
      hideDoorways();
      if (!engineReady || !options || options.length === 0) { return; }
      var cw = engine.canvas.width / (root.devicePixelRatio || 1);
      var n  = options.length;
      // Even spread across the canvas, leaving a margin on each side.
      var margin = 40;
      var span   = cw - margin * 2;
      for (var i = 0; i < n; i++) {
        var xCenter = margin + (span * (i + 0.5) / n);
        var d = new Doorway(function () { return engine.groundY; }, {
          x: xCenter, width: 28, label: options[i].label, doorId: options[i].doorId
        });
        doorwayEntities.push(d);
        engine.addEntity('doorway_' + options[i].doorId, d);
      }
    }

    function hideDoorways() {
      if (!engineReady) { doorwayEntities = []; return; }
      for (var i = 0; i < doorwayEntities.length; i++) {
        var d = doorwayEntities[i];
        engine.removeEntity('doorway_' + d.doorId);
      }
      doorwayEntities = [];
    }

    function updateDoorwayCounts(tally) {
      if (!tally || !doorwayEntities.length) { return; }
      // Map by doorId.
      var byId = {};
      for (var i = 0; i < tally.length; i++) { byId[tally[i].doorId] = tally[i].count; }
      for (var j = 0; j < doorwayEntities.length; j++) {
        var d = doorwayEntities[j];
        if (typeof byId[d.doorId] === 'number') { d.count = byId[d.doorId]; }
      }
    }

    // --- V7.2 sprite-collide coin entities ----------------------------
    //
    // Coins are sprites on the avatar canvas (not paintings on the
    // activity overlay) so collision is native sprite-vs-sprite. The
    // local player's CoinSprite.update fires onCollect on contact, which
    // emits classroom_activity_value { kind: 'collect', coinId }; the
    // server's level-engine.applyInput validates + flips the coin's
    // collected flag + bumps the tally. Next tick broadcasts the new
    // state; syncLevelCoins re-applies the collected status here so all
    // clients see the coin go grey.

    var coinEntities = {};   // coinId -> CoinSprite

    function _coinCanvasX(coin, levelW, levelChipSize, canvasW, coinSize) {
      // Map chip-x (level coords, e.g. 4) to canvas pixels. Coins are
      // drawn with their TOP-LEFT at the returned x. The chip center
      // (coin.x * chipSize + chipSize/2) is rescaled to canvas X; we
      // then subtract half the rendered size so the sprite centers on
      // the chip center pixel.
      var levelCenterPx = (coin.x * levelChipSize) + (levelChipSize / 2);
      var canvasCenter  = (levelCenterPx / levelW) * canvasW;
      return canvasCenter - coinSize / 2;
    }

    function _coinCanvasY(coinSize) {
      // V7.3.5: position coins clearly above the avatar's head so a
      // jump is required to reach them, not just walking past. Math:
      //   groundY ~= 146, spriteHeight ~= 24, coinSize = 24
      //   standing player center y = groundY - spriteHeight/2 = 134
      //   peak jump player center y = standing - 49 px = 85
      // Coin center is positioned at y ~= 90:
      //   diff at standing = 44 px (outside COIN_COLLISION_Y_PX = 24)
      //   diff at peak     =  5 px (well inside tolerance)
      // The extra COIN_VERTICAL_PADDING (20, was 4) lifts the coin 16 px
      // further from the avatar's head than the s115 placement.
      var COIN_VERTICAL_PADDING = 20;
      var groundY = (engine && typeof engine.groundY === 'number') ? engine.groundY : (BOARD_H - 24);
      var spriteHeight = SPRITE_H * SPRITE_SCALE;
      return groundY - spriteHeight - coinSize - COIN_VERTICAL_PADDING;
    }

    // GoalSprite is a singleton per active level; mirrors the coin lifecycle
    // pattern. V7.5 key-gate widens the phase set so the door is visible
    // BEFORE the key is collected (phase === 'KEY_HUNT' while goal.locked
    // is true) -- otherwise the kids wouldn't know what they're hunting
    // the key for. Legacy levels (no key actor) never enter KEY_HUNT and
    // see no visible-window change.
    var goalEntity = null;

    function syncLevelGoal(state) {
      if (!engineReady) return;
      var act = state && state.activity;
      var isLevel = !!(act && act.type === 'level' && !act.finished);
      var goal    = (act && act.state && act.state.goal) ? act.state.goal : null;
      var phase   = (act && act.state && act.state.phase) || null;
      // V7.5: KEY_HUNT also shows the (locked) door so the locked-state
      // is a visible affordance, not an empty room. GOAL_AVAILABLE +
      // LEVEL_CLEARED keep their existing behaviour.
      var goalVisible = isLevel && goal &&
        (phase === 'GOAL_AVAILABLE' || phase === 'LEVEL_CLEARED' || phase === 'KEY_HUNT');

      if (!goalVisible) {
        if (goalEntity) {
          try { engine.removeEntity('level_goal'); } catch (_) {}
          goalEntity = null;
        }
        return;
      }

      var chipSize = (act.level && act.level.map && act.level.map.chipSize) || 10;
      var mapW     = (act.level && act.level.map && act.level.map.width) || 32;
      var levelW   = mapW * chipSize;
      var canvasW  = (engine && engine.canvas) ? (engine.canvas.width / (root.devicePixelRatio || 1)) : (container.clientWidth || DEFAULT_BOARD_W);
      var size     = GOAL_DEFAULT_SIZE;

      var levelCenterPx = (goal.x * chipSize) + (chipSize / 2);
      var canvasCenter  = (levelCenterPx / levelW) * canvasW;
      var gx = canvasCenter - size / 2;
      var groundY = (engine && typeof engine.groundY === 'number') ? engine.groundY : (BOARD_H - 24);
      var spriteHeight = SPRITE_H * SPRITE_SCALE;
      var gy = groundY - spriteHeight - size - 4;

      // V7.5: server-side `goal.locked` is true while the key is uncollected,
      // false otherwise. Always false for legacy no-key levels.
      var lockedNow = goal.locked === true;

      if (!goalEntity) {
        goalEntity = new GoalSprite({
          imageClosed: _ensureDoorClosedImage(),
          imageOpen:   _ensureDoorOpenImage(),
          x: gx, y: gy, size: size,
          reached: goal.reached === true,
          locked:  lockedNow,
          getLocalSprite: function () { return (username && spriteEntities[username]) || null; },
          onReach: function () {
            safeSend({ type: 'classroom_activity_value', payload: { kind: 'reach-goal' } });
          }
        });
        try { engine.addEntity('level_goal', goalEntity); } catch (_) {}
      } else {
        goalEntity.reached = goal.reached === true;
        goalEntity.locked  = lockedNow;
        goalEntity.x = gx;
        goalEntity.y = gy;
      }
    }

    // KeySprite is a singleton per active level; mirrors goalEntity /
    // syncLevelGoal. Spawned only while phase === 'KEY_HUNT' AND
    // state.key is present AND !state.key.collected. Despawned when
    // any of those conditions stop holding (server flips collected,
    // phase advances past KEY_HUNT, or the level ends).
    var keyEntity = null;

    function syncLevelKey(curr) {
      if (!engineReady) return;
      var act = curr && curr.activity;
      var isLevel = !!(act && act.type === 'level' && !act.finished);
      var key     = (act && act.state && act.state.key) ? act.state.key : null;
      var phase   = (act && act.state && act.state.phase) || null;
      var keyVisible = isLevel && key && phase === 'KEY_HUNT' && key.collected !== true;

      if (!keyVisible) {
        if (keyEntity) {
          try { engine.removeEntity('level_key'); } catch (_) {}
          keyEntity = null;
        }
        return;
      }

      var chipSize = (act.level && act.level.map && act.level.map.chipSize) || 10;
      var mapW     = (act.level && act.level.map && act.level.map.width) || 32;
      var levelW   = mapW * chipSize;
      var canvasW  = (engine && engine.canvas) ? (engine.canvas.width / (root.devicePixelRatio || 1)) : (container.clientWidth || DEFAULT_BOARD_W);
      var size     = KEY_DEFAULT_SIZE;

      // Rescale chip-coord to canvas pixels -- same mapping as coins.
      var levelCenterPx = (key.x * chipSize) + (chipSize / 2);
      var canvasCenter  = (levelCenterPx / levelW) * canvasW;
      var kx = canvasCenter - size / 2;
      // Y placement: lift the key into the jump arc, same shape as a coin.
      var COIN_VERTICAL_PADDING = 20;
      var groundY = (engine && typeof engine.groundY === 'number') ? engine.groundY : (BOARD_H - 24);
      var spriteHeight = SPRITE_H * SPRITE_SCALE;
      var ky = groundY - spriteHeight - size - COIN_VERTICAL_PADDING;

      if (!keyEntity) {
        keyEntity = new KeySprite({
          images: [ _ensureKeyImage() ],
          x: kx, y: ky, size: size,
          collected: key.collected === true,
          getLocalSprite: function () { return (username && spriteEntities[username]) || null; },
          onCollect: function () {
            safeSend({ type: 'classroom_activity_value', payload: { kind: 'collect-key' } });
          }
        });
        try { engine.addEntity('level_key', keyEntity); } catch (_) {}
      } else {
        keyEntity.collected = key.collected === true;
        keyEntity.x = kx;
        keyEntity.y = ky;
        // Clear stale optimistic _sentCollect (mirrors CoinSprite TTL).
        if (keyEntity._sentCollect && !keyEntity.collected) {
          var nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
          if (nowMs - (keyEntity._sentCollectAt || 0) > KEY_SENT_TTL_MS) {
            keyEntity._sentCollect   = false;
            keyEntity._sentCollectAt = 0;
          }
        }
      }
    }

    // StageIndicator -- singleton per active level. Spawn during VOTING
    // phase when stagesTotal > 1. Hidden otherwise (legacy single-stage
    // levels show nothing). Reads currentStage / stagesTotal from the
    // mount-scope state via closures so the panel updates on every tick
    // without needing a fresh entity per stage transition.
    var stageEntity = null;

    function syncStageIndicator(curr) {
      if (!engineReady) return;
      var act         = curr && curr.activity;
      var isLevel     = !!(act && act.type === 'level' && !act.finished);
      var phase       = (act && act.state && act.state.phase) || null;
      var stagesTotal = (act && act.state && typeof act.state.stagesTotal === 'number') ? act.state.stagesTotal : 1;
      // Only show during VOTING for multi-stage levels.
      var shouldShow = isLevel && phase === 'VOTING' && stagesTotal > 1;

      if (!shouldShow) {
        if (stageEntity) {
          try { engine.removeEntity('level_stage'); } catch (_) {}
          stageEntity = null;
        }
        return;
      }

      if (!stageEntity) {
        stageEntity = new StageIndicator({
          getCurrent: function () {
            var s = state && state.activity && state.activity.state;
            var i = (s && typeof s.currentStage === 'number') ? s.currentStage : 0;
            return i + 1;
          },
          getTotal: function () {
            var s = state && state.activity && state.activity.state;
            return (s && typeof s.stagesTotal === 'number') ? s.stagesTotal : 1;
          },
          getViewportW: function () {
            if (!engine || !engine.canvas) return DEFAULT_BOARD_W;
            return engine.canvas.width / (root.devicePixelRatio || 1);
          }
        });
        try { engine.addEntity('level_stage', stageEntity); } catch (_) {}
      }
    }

    // ResultPanel (V7.6) -- singleton in-canvas vote-result panel. Spawns
    // when state.closedDoorways flips from null to a fresh snapshot (the
    // server just closed a doorways round). Auto-dismisses after
    // RESULT_PANEL_DISMISS_FAST_MS (correct vote, no reflection) or
    // RESULT_PANEL_DISMISS_SLOW_MS (wrong vote, reflection text below the
    // dot plot needs reading time). Also clears on activity teardown so a
    // fast level restart doesn't strand a stale panel.
    var RESULT_PANEL_DISMISS_FAST_MS = 2000;
    var RESULT_PANEL_DISMISS_SLOW_MS = 8000;
    var resultPanelEntity     = null;
    var _resultPanelTimer     = null;
    var _resultPanelHasRefl   = false;   // upgrades a fast timer to slow when reflection flips active
    var _prevClosedDoorwaysId = null;    // detect a new doorways-close to (re)spawn

    function _despawnResultPanel() {
      if (_resultPanelTimer != null) {
        try { clearTimeout(_resultPanelTimer); } catch (_) {}
        _resultPanelTimer = null;
      }
      if (resultPanelEntity) {
        try { engine.removeEntity('result_panel'); } catch (_) {}
        resultPanelEntity = null;
      }
      _resultPanelHasRefl = false;
    }

    function _armResultPanelTimer(ms) {
      if (_resultPanelTimer != null) {
        try { clearTimeout(_resultPanelTimer); } catch (_) {}
        _resultPanelTimer = null;
      }
      try {
        _resultPanelTimer = setTimeout(function () {
          _resultPanelTimer = null;
          _despawnResultPanel();
        }, ms);
      } catch (_) {}
    }

    function syncResultPanel(curr) {
      if (!engineReady) return;

      var closed = (curr && curr.closedDoorways) ? curr.closedDoorways : null;
      var act    = curr && curr.activity;
      var refl   = (act && act.state && act.state.reflection) ? act.state.reflection : null;
      var reflActive = !!(refl && refl.active);

      // Activity teardown clears the panel (level finished or fast restart).
      var activityGone = !act || act.finished === true;
      if (activityGone && !closed) {
        _despawnResultPanel();
        _prevClosedDoorwaysId = null;
        return;
      }

      // Fresh closedDoorways id -> (re)spawn the panel.
      var freshClose = closed && closed.id !== _prevClosedDoorwaysId;
      if (freshClose) {
        _prevClosedDoorwaysId = closed.id;

        if (resultPanelEntity) {
          try { engine.removeEntity('result_panel'); } catch (_) {}
          resultPanelEntity = null;
        }
        resultPanelEntity = new ResultPanel({
          getClosedDoorways: function () { return state && state.closedDoorways; },
          getReflection:     function () {
            var a = state && state.activity;
            return (a && a.state && a.state.reflection) ? a.state.reflection : null;
          },
          getViewportW: function () {
            if (!engine || !engine.canvas) return DEFAULT_BOARD_W;
            return engine.canvas.width / (root.devicePixelRatio || 1);
          }
        });
        try { engine.addEntity('result_panel', resultPanelEntity); } catch (_) {}
        // Arm dismiss based on current reflection state; upgrade later if
        // reflection.active flips true after the spawn.
        _resultPanelHasRefl = reflActive;
        _armResultPanelTimer(reflActive ? RESULT_PANEL_DISMISS_SLOW_MS : RESULT_PANEL_DISMISS_FAST_MS);
        return;
      }

      // If the panel is up and reflection just flipped active, upgrade the
      // dismiss timer to the slow window so students can read the prompt.
      if (resultPanelEntity && reflActive && !_resultPanelHasRefl) {
        _resultPanelHasRefl = true;
        _armResultPanelTimer(RESULT_PANEL_DISMISS_SLOW_MS);
      }
    }

    // V7.4 blind-test: monotonic id source for RevealTextSprite entries.
    // Each spawned reveal-text gets its own entity id so multiple pops
    // (rapid local collect + parallel peer collect on the same coin's
    // sibling) don't collide. The entity self-removes after durationMs.
    var _revealIdCounter = 0;
    function _spawnRevealAt(drink, cx, cy) {
      if (!engineReady) return;
      _revealIdCounter += 1;
      var id   = _revealIdCounter;
      var text = '+' + (drink || '?');
      var color = _revealColorForDrink(drink);
      var sprite = new RevealTextSprite({ x: cx, y: cy, text: text, color: color });
      sprite._id = id;
      try { engine.addEntity('reveal_' + id, sprite); } catch (_) {}
    }

    function syncLevelCoins(state) {
      if (!engineReady) return;
      var act = state && state.activity;
      var isLevel = !!(act && act.type === 'level' && !act.finished);
      var coins   = (act && act.state && Array.isArray(act.state.coins)) ? act.state.coins : null;

      if (!isLevel || !coins) {
        // Despawn all coins (no level, or level ended).
        for (var k in coinEntities) {
          if (!Object.prototype.hasOwnProperty.call(coinEntities, k)) continue;
          try { engine.removeEntity('coin_' + k); } catch (_) {}
          delete coinEntities[k];
        }
        return;
      }

      var chipSize = (act.level && act.level.map && act.level.map.chipSize) || 10;
      var mapW     = (act.level && act.level.map && act.level.map.width) || 32;
      var levelW   = mapW * chipSize;
      var canvasW  = (engine && engine.canvas) ? (engine.canvas.width / (root.devicePixelRatio || 1)) : (container.clientWidth || DEFAULT_BOARD_W);

      var seenIds = {};
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (!c || !c.id) continue;
        seenIds[c.id] = true;
        var size = COIN_DEFAULT_SIZE;
        var cx   = _coinCanvasX(c, levelW, chipSize, canvasW, size);
        var cy   = _coinCanvasY(size);
        // V7.4: wire `revealed` from the server. Default true so legacy
        // (non-hidden) coins behave as before.
        var coinRevealed = c.revealed !== false;
        if (!coinEntities[c.id]) {
          var sprite = new CoinSprite({
            images: _ensureCoinFrames(),
            x: cx, y: cy, size: size, coinId: c.id, drink: c.drink,
            collected: c.collected === true,
            revealed:  coinRevealed,
            getLocalSprite: function () { return (username && spriteEntities[username]) || null; },
            onCollect: function (coinId) {
              safeSend({ type: 'classroom_activity_value', payload: { kind: 'collect', coinId: coinId } });
            },
            // V7.4 blind-test: local-collect path -- spawn the floating
            // "+A" / "+B" the moment the player touches the coin (before
            // the server round-trip), so the kid sees instant feedback.
            spawnReveal: function (coinId, drink, rcx, rcy) {
              _spawnRevealAt(drink, rcx, rcy);
            }
          });
          // Track collected status so we can detect peer-collect
          // transitions on subsequent ticks and spawn matching reveal text.
          sprite._wasCollected = c.collected === true;
          coinEntities[c.id] = sprite;
          try { engine.addEntity('coin_' + c.id, sprite); } catch (_) {}
        } else {
          // Server is source of truth; re-apply collected + revealed + position.
          var existing = coinEntities[c.id];
          var prevCollected = existing._wasCollected === true;
          existing.collected = c.collected === true;
          existing._revealed = coinRevealed;
          existing.x = cx;
          existing.y = cy;
          // V7.4 Codex MAJOR fold: clear stale optimistic _sentCollect.
          // If the local player set _sentCollect but the server hasn't
          // confirmed within COIN_SENT_TTL_MS, the collect was rejected
          // (anti-cheat fail, race, etc). Reset so:
          //   - coin reappears for the local player (_isCollecting flips)
          //   - a later legitimate server-side collect can still fire
          //     the peer-pop block below
          if (existing._sentCollect && !existing.collected) {
            var nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
            if (nowMs - (existing._sentCollectAt || 0) > COIN_SENT_TTL_MS) {
              existing._sentCollect   = false;
              existing._sentCollectAt = 0;
            }
          }
          // V7.4: peer-collect path -- if this coin just flipped to
          // collected from the server AND the local player didn't fire
          // the local spawn (i.e. _sentCollect is still false), pop a
          // floating reveal-text so peers see the same animation. The
          // _sentCollect guard prevents the local collector seeing two
          // identical pops (one from the local fire + one from the
          // server echo).
          if (!prevCollected && existing.collected && !existing._sentCollect) {
            var drinkRev = existing.drink || c.drink || '';
            _spawnRevealAt(drinkRev, existing.x + existing.size / 2, existing.y + existing.size / 2);
          }
          existing._wasCollected = existing.collected;
        }
      }
      // Despawn coins that vanished from state (shouldn't usually happen
      // mid-activity but covers level swap / reset).
      for (var id in coinEntities) {
        if (!Object.prototype.hasOwnProperty.call(coinEntities, id)) continue;
        if (!seenIds[id]) {
          try { engine.removeEntity('coin_' + id); } catch (_) {}
          delete coinEntities[id];
        }
      }
    }

    // V7.4 blind-test: TallyDisplay sprite -- single entity per active
    // level. Spawns when the level def includes a TallyDisplay actor
    // bound to tally.sips AND tally state exists; despawns on level end.
    // Mirrors goalEntity / syncLevelGoal pattern.
    var tallyEntity = null;

    // V7.4 Codex MAJOR fold: parameter renamed from `state` to `curr` so
    // the getTally closure created below reaches the MOUNT-SCOPE `state`
    // (reassigned every tick by applyMessage) instead of capturing the
    // function-parameter binding (frozen at construction time, never
    // updates as sips come in).
    function syncLevelTally(curr) {
      if (!engineReady) return;
      var act = curr && curr.activity;
      var isLevel = !!(act && act.type === 'level' && !act.finished);
      var sips    = (act && act.state && act.state.tally && act.state.tally.sips) ? act.state.tally.sips : null;
      var actors  = (act && act.level && Array.isArray(act.level.actors)) ? act.level.actors : null;

      // Find the level's TallyDisplay actor bound to tally.sips (if any).
      var tallyActor = null;
      if (actors) {
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i];
          if (a && a.type === 'TallyDisplay' && a.binds === 'tally.sips') {
            tallyActor = a;
            break;
          }
        }
      }

      var shouldShow = isLevel && tallyActor && sips;
      if (!shouldShow) {
        if (tallyEntity) {
          try { engine.removeEntity('level_tally'); } catch (_) {}
          tallyEntity = null;
        }
        return;
      }

      var chipSize = (act.level && act.level.map && act.level.map.chipSize) || 10;
      var mapW     = (act.level && act.level.map && act.level.map.width) || 32;
      var levelW   = mapW * chipSize;
      var canvasW  = (engine && engine.canvas) ? (engine.canvas.width / (root.devicePixelRatio || 1)) : (container.clientWidth || DEFAULT_BOARD_W);

      // X: rescale the actor's chip-X center into canvas pixels (same
      // mapping the coins use). Y: sit ABOVE the coin row by ~2.5 sprite
      // heights -- visually clear of the avatars + jump arc.
      var levelCenterPx = (tallyActor.x * chipSize) + (chipSize / 2);
      var tx = (levelCenterPx / levelW) * canvasW;
      var size = COIN_DEFAULT_SIZE;
      var groundY = (engine && typeof engine.groundY === 'number') ? engine.groundY : (BOARD_H - 24);
      var spriteHeight = SPRITE_H * SPRITE_SCALE;
      var ty = groundY - spriteHeight * 2.5 - size;

      if (!tallyEntity) {
        tallyEntity = new TallyDisplay({
          x: tx, y: ty,
          getTally: function () {
            var s = state && state.activity && state.activity.state && state.activity.state.tally;
            return (s && s.sips) ? s.sips : null;
          }
        });
        try { engine.addEntity('level_tally', tallyEntity); } catch (_) {}
      } else {
        tallyEntity.x = tx;
        tallyEntity.y = ty;
      }
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

    // v3 P3: WebRTC peer connection (student-as-guest). Receives an
    // rtc_offer from the cockpit when its section enters Live mode;
    // creates a PC, sets remote, sends rtc_answer. The DC is opened
    // by the cockpit; ondatachannel hooks it. Once open, classroom_pos
    // sends prefer DC; otherwise WS.
    var _peerConnection = null;
    var _peerDataChannel = null;
    var _peerDcOpen = false;
    var _peerTeacherUsername = null;
    // v3 P3 Codex MAJOR fold: trickle-ICE ordering. ICE candidates can
    // arrive BEFORE setRemoteDescription completes -- addIceCandidate
    // would then reject. Queue any pre-remote-set ICE here; drain after
    // setRemoteDescription's promise resolves.
    var _peerRemoteDescSet = false;
    var _peerPendingIce = [];

    function _handleP3Offer(fromUsername, sdp) {
      if (typeof RTCPeerConnection === 'undefined') { return; }
      if (_peerConnection) { _teardownPeer(); }
      _peerTeacherUsername = fromUsername;
      try {
        _peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      } catch (_) { _peerConnection = null; return; }
      _peerConnection.onicecandidate = function(ev) {
        if (ev.candidate && ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'rtc_ice', to: fromUsername, candidate: ev.candidate })); } catch (_) {}
        }
      };
      _peerConnection.ondatachannel = function(ev) {
        _peerDataChannel = ev.channel;
        _peerDataChannel.onopen = function() { _peerDcOpen = true; };
        _peerDataChannel.onclose = function() { _peerDcOpen = false; };
        _peerDataChannel.onmessage = function(mev) {
          var pos = null;
          try { pos = JSON.parse(mev.data); } catch (_) { return; }
          if (!pos || pos.type !== 'classroom_pos') return;
          // Route through the same applyPos path as the WS classroom_pos
          // handler. The `from` field identifies which peer this is.
          if (typeof applyPos === 'function') {
            applyPos({ username: pos.from, x: pos.x, y: pos.y, state: pos.state, vx: pos.vx });
          }
        };
      };
      _peerConnection.setRemoteDescription(sdp).then(function() {
        _peerRemoteDescSet = true;
        // Drain any ICE that arrived before the remote description settled.
        while (_peerPendingIce.length > 0) {
          var cand = _peerPendingIce.shift();
          try { _peerConnection.addIceCandidate(cand).catch(function() {}); } catch (_) {}
        }
        return _peerConnection.createAnswer();
      }).then(function(answer) {
        return _peerConnection.setLocalDescription(answer);
      }).then(function() {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'rtc_answer', to: fromUsername, sdp: _peerConnection.localDescription })); } catch (_) {}
        }
      }).catch(function() { _teardownPeer(); });
    }

    function _handleP3Ice(candidate) {
      if (!_peerConnection || !candidate) { return; }
      if (!_peerRemoteDescSet) {
        // Buffer until setRemoteDescription completes; otherwise
        // addIceCandidate rejects with an unhandled promise rejection.
        _peerPendingIce.push(candidate);
        return;
      }
      try { _peerConnection.addIceCandidate(candidate).catch(function() {}); } catch (_) {}
    }

    function _teardownPeer() {
      if (_peerDataChannel) { try { _peerDataChannel.close(); } catch (_) {} _peerDataChannel = null; }
      if (_peerConnection)  { try { _peerConnection.close(); }  catch (_) {} _peerConnection  = null; }
      _peerDcOpen = false;
      _peerTeacherUsername = null;
      _peerRemoteDescSet = false;
      _peerPendingIce = [];
    }

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
      var prevState = state;
      var newState  = _reduce(state, msg);
      state = newState;
      if (msg.type === 'classroom_greenlight') {
        showGreenlight();
      }
      if (msg.type === 'classroom_greenlight' && msg.startVideo === true && onStartVideo) {
        try { onStartVideo(msg.videoRef || null); } catch (_) {}
      }
      // v3 P4: doorways visibility + count refresh.
      if (newState.doorways && (!prevState.doorways || newState.doorways.id !== (prevState.doorways && prevState.doorways.id))) {
        showDoorways(newState.doorways.options);
        updateDoorwayCounts(newState.doorways.tally);
      } else if (newState.doorways) {
        updateDoorwayCounts(newState.doorways.tally);
      } else if (!newState.doorways && prevState.doorways) {
        hideDoorways();
        // s111 P4 UX: on close, respawn the local sprite. Reset all
        // doorway-walk + absorption state and put the sprite back on
        // the ground at its standing-y. Covers: a stale off-canvas X
        // from the legacy horizontal walk, the new vertical-absorb
        // _hidden flag, and any in-flight 'entering-doorway' state.
        if (engineReady && username && spriteEntities[username]) {
          var meSprite = spriteEntities[username];
          var cw = engine.canvas.width / (root.devicePixelRatio || 1);
          var maxX = cw - (meSprite._spriteSize || (SPRITE_W * (meSprite.scale || 1)));
          if (meSprite.x < 0 || meSprite.x > maxX) {
            meSprite.x = Math.max(0, Math.min(maxX, (cw - (meSprite._spriteSize || 0)) / 2));
          }
          if (meSprite.state === 'walking' || meSprite.state === 'arrived' || meSprite.state === 'entering-doorway') {
            meSprite.state = 'idle';
          }
          meSprite._hidden          = false;
          meSprite._absorbProgress  = 0;
          meSprite._absorbDir       = 1;
          meSprite._isDoorwayWalk   = false;
          // Restore y to the standing ground position.
          if (typeof meSprite.groundY === 'number') {
            meSprite.y = meSprite.groundY;
          }
        }
      }
      syncScene(state);
      refreshButton();
      refreshVoteButtons();
      refreshResultScreen();
      // V7.2: spawn/despawn/sync coin + goal sprites on the avatar canvas
      // based on the current activity state. Cheap when no activity is
      // running (early return on the !isLevel branch).
      // V7.4 blind-test: also spawn/despawn the TallyDisplay chip when
      // the level def includes a TallyDisplay actor.
      // V7.5 key-gate + sequential-stages: also spawn/despawn the shared
      // key (KEY_HUNT phase) and the stage indicator (multi-stage VOTING).
      syncLevelCoins(state);
      syncLevelGoal(state);
      syncLevelTally(state);
      syncLevelKey(state);
      syncStageIndicator(state);
      // V7.6: spawn/despawn the in-canvas ResultPanel (doorways close +
      // optional reflection text). Runs after the level-overlay sync so
      // the panel reads the freshest closedDoorways + reflection state.
      syncResultPanel(state);
      notifyStateChange();
    }

    // Phase 2 -- handle inbound peer positions. The peer's BoardSprite
    // chases the broadcast x via the existing walkTo target machinery
    // (at 10 Hz the per-broadcast delta is small and the WALK_SPEED chase
    // looks fluid); y is set directly so jumps register visually. Marks
    // the sprite _moved=true so repositionSprites stops yanking it back
    // to the auto-layout slot.
    function applyPos(msg) {
      // P4 Select Students: freeze peer movement so the teacher can click
      // sprites reliably while selecting. The local player isn't affected
      // (this handler explicitly ignores self below). Frozen positions
      // catch up when select mode exits (next applyPos call applies).
      if (selectModeActive) return;
      if (!msg || !msg.username) { return; }
      if (msg.username === username) { return; }    // ignore self echoes
      var peer = spriteEntities[msg.username];
      if (!peer) { return; }
      if (peer instanceof PlayerSprite) { return; } // never overwrite the local player
      peer._moved = true;
      // s111 P4 UX rev4: 'in-doorway' is a non-physical state. Snap
      // the peer's state field so render fades + the local player's
      // collision/floor checks skip them; DON'T trigger walkTo (the
      // peer is stationary while absorbed).
      if (msg.state === 'in-doorway') {
        peer.state = 'in-doorway';
        return;
      }
      // Peer just exited the doorway -- restore state from the wire.
      if (peer.state === 'in-doorway' && typeof msg.state === 'string') {
        peer.state = msg.state;
      }
      if (typeof msg.x === 'number') {
        // 2026-05-24 fix: clamp to local canvas bounds. A sender on a wider
        // canvas can broadcast an x past our right edge; we own our own
        // viewport so we clamp before walking.
        var clampedX = clampSpriteX(msg.x, peer);
        if (Math.abs(peer.x - clampedX) > 1) {
          peer.walkTo(clampedX);
        }
      }
      // Phase 2.2 -- y is chased smoothly (not snapped) so peer jumps look
      // like an arc, not a 10 Hz teleport. _chaseY runs on every tick.
      if (typeof msg.y === 'number') {
        peer._yTarget = msg.y;
      }
    }

    function safeSend(obj) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
      }
    }

    // v3 P3 Codex BLOCKER fold: queue signaling sent before the WS is
    // ready. enterLiveMode kicks off _initPeerFor immediately after
    // mountBoard, but the board's WS connection is still negotiating
    // (and classroom_join hasn't completed). Without queuing, the
    // rtc_offer is dropped silently + the cockpit's 3 s timeout fires +
    // the studentPeers entry is left as a dead stub. Queue + flush in
    // ws.onopen (after sendJoin) so signaling lands on the server with
    // the wsIndex entry already populated.
    var _pendingSignaling = [];
    function _flushPendingSignaling() {
      if (!ws || ws.readyState !== 1) { return; }
      while (_pendingSignaling.length > 0) {
        var payload = _pendingSignaling.shift();
        try { ws.send(JSON.stringify(payload)); } catch (_) {}
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
        // v3 P3: flush any signaling queued before the WS was ready.
        _flushPendingSignaling();
      };

      ws.onmessage = function (event) {
        var msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg && msg.type && msg.type.indexOf('classroom_') === 0) {
          // P3: fire raw-message hook BEFORE _reduce. Caller may inspect
          // the message and trigger side effects (toast, reply panel)
          // without polluting the reducer state shape.
          if (onClassroomMessage) {
            try { onClassroomMessage(msg); } catch (_) {}
          }
          applyMessage(msg);
          if (msg.type === 'classroom_live_state' && msg.live === false) {
            if (role !== 'teacher') { _teardownPeer(); }
            // Note: the existing _reduce dispatch above handles
            // classroom_live_state for state.live (preserved through
            // every case). This teardown is purely the WebRTC side.
          }
        } else if (msg && (msg.type === 'rtc_offer' || msg.type === 'rtc_answer' || msg.type === 'rtc_ice')) {
          if (role === 'teacher') {
            // Cockpit: delegate to the user's onSignaling callback.
            if (typeof opts.onSignaling === 'function') {
              try { opts.onSignaling(msg); } catch (_) {}
            }
          } else {
            // Student: handle locally as a guest peer.
            if (msg.type === 'rtc_offer' && msg.from && msg.sdp) {
              _handleP3Offer(msg.from, msg.sdp);
            } else if (msg.type === 'rtc_ice' && msg.candidate) {
              _handleP3Ice(msg.candidate);
            }
            // rtc_answer is teacher-bound; students drop it silently.
          }
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
        // V7.5: cancel histogram auto-dismiss if it's pending so the
        // destroy path doesn't strand a callback that would later try
        // to mutate a removed DOM element.
        if (_resultDismissTimer != null) {
          try { clearTimeout(_resultDismissTimer); } catch (_) {}
          _resultDismissTimer = null;
        }
        // V7.6: cancel the ResultPanel auto-dismiss timer so its callback
        // doesn't fire on a torn-down engine.
        if (_resultPanelTimer != null) {
          try { clearTimeout(_resultPanelTimer); } catch (_) {}
          _resultPanelTimer = null;
        }
        heartbeatTimer  = null;
        reconnectTimer  = null;
        greenlightTimer = null;
        // v3 P3: close any RTCPeerConnection + DataChannel before the WS.
        _teardownPeer();
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

      sendSignaling: function (payload) {
        // Pass-through send over the board's WS. Used by the cockpit
        // to route rtc_offer / rtc_ice to specific students. The board
        // has the right wsIndex entry (classroom_join'd as 'teacher'
        // for the active section) so the server's rtc_* relay can
        // find it. If the ws is NOT yet ready (cockpit just called
        // mountBoard + enterLiveMode kicked off peer init before the
        // connection settled), queue the payload and flush in ws.onopen.
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify(payload)); } catch (_) {}
        } else {
          _pendingSignaling.push(payload);
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

      // --- v3 P4 doorways teacher methods (vote-with-your-feet) ---

      openDoorways: function (id, question, options) {
        safeSend({ type: 'classroom_open_doorways', id: id, question: question, options: options });
      },
      closeDoorways: function (id) {
        safeSend({ type: 'classroom_close_doorways', id: id });
      },

      // --- v2.1 result screen methods ---

      showResultScreen: showResultScreen,
      hideResultScreen: hideResultScreen,

      // --- P3 nudges (TEACHER_STUDENT_CONSOLE_SPEC.md section 6) ---
      // Pass-through send over the board's WS. Used by both the cockpit
      // (classroom_teacher_nudge) and the student Desk (classroom_student_nudge_reply)
      // to ride the existing classroom connection without re-implementing
      // socket management. Codex BLOCKER fold: returns true if the send
      // actually went out, false if the WS wasn't ready (caller can decide
      // whether to mark delivery in the audit log).
      sendMessage: function (payload) {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
        }
        return false;
      },

      // Section is exposed so the cockpit's POST /teacher/nudge body can
      // include the active section without re-computing it.
      section: section,

      // --- P4 Select Students (TEACHER_STUDENT_CONSOLE_SPEC.md section 11) ---
      // Cockpit toggles select mode via this. ON freezes applyPos (peers
      // stop moving so the teacher can click reliably) + adds a CSS class
      // on the canvas for the desaturation effect. The visual selection
      // markers are rendered by the cockpit (DOM overlay), not the board.
      setSelectMode: function (on) {
        selectModeActive = !!on;
        if (canvas && canvas.classList) {
          if (selectModeActive) canvas.classList.add('classroom-select-mode');
          else canvas.classList.remove('classroom-select-mode');
        }
      },

      // --- v4 activity student-input channel ---
      // Student-side handle for the activity plugin. The Desk's arrow-key
      // binding (LIVE_CLASSROOM_V4_BUILD.md C5.2) calls this with
      // { delta: +1 | -1 } for bridge-mean; other plugins may use other
      // payload shapes. Returns false when the WS is not ready (caller
      // can decide whether to retry).
      sendActivityValue: function (payload) {
        if (!ws || ws.readyState !== 1) { return false; }
        try { ws.send(JSON.stringify({ type: 'classroom_activity_value', payload: payload })); }
        catch (_) { return false; }
        return true;
      },

      // P4: expose the canvas + per-sprite positions so the cockpit can
      // place absolutely-positioned selection markers over the canvas.
      getCanvas: function () { return canvas; },
      getSpritePosition: function (uname) {
        var sp = spriteEntities[uname];
        if (!sp) return null;
        return { x: sp.x, y: sp.y, canvasW: canvas.width, canvasH: canvas.height };
      }
    };

    return handle;
  }

  // --- public API -------------------------------------------------------

  root.ClassroomBoard = {
    mount:             mount,
    _reduce:           _reduce,
    _assignCells:      assignCells,
    _hashStringToHue:  hashStringToHue,  // exposed for tests
    _PlayerSprite:     PlayerSprite,     // Phase 1 -- exposed for unit tests
    _CoinSprite:       CoinSprite,       // V7.4 -- exposed for unit tests
    _RevealTextSprite: RevealTextSprite, // V7.4 -- exposed for unit tests
    _TallyDisplay:     TallyDisplay,     // V7.4 -- exposed for unit tests
    _GoalSprite:       GoalSprite,       // V7.5 -- exposed for unit tests
    _KeySprite:        KeySprite,        // V7.5 -- exposed for unit tests
    _StageIndicator:   StageIndicator,   // V7.5 -- exposed for unit tests
    _ResultPanel:      ResultPanel       // V7.6 -- exposed for unit tests
  };

}(typeof window !== 'undefined' ? window : this));
