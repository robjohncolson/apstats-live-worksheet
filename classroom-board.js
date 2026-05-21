/**
 * classroom-board.js
 *
 * Live Classroom board component (v1b).  PLAIN browser script -- no ES
 * import/export.  Load via <script src="classroom-board.js">.
 *
 * Attaches window.ClassroomBoard with the frozen API from BUILD Sections 6 + 4:
 *
 *   ClassroomBoard.mount(container, opts) -> handle
 *   handle.destroy()
 *   handle.setNameMap(map)
 *   handle.armGate(theme)      -- v1b teacher method
 *   handle.greenLight()        -- v1b teacher method
 *   handle.reset()             -- v1b teacher method
 *
 * opts gains an optional onStateChange(summary) callback (v1b).
 *
 * Internal state reduction is exposed as a pure function:
 *   ClassroomBoard._reduce(state, message) -> newState
 *
 * This function has NO side effects and requires NO canvas context, so the
 * vitest/jsdom test suite can exercise it without a 2d canvas.
 *
 * Rendering: 320x240 backing-store canvas (TI-84 Plus CE resolution).
 * CSS-scaled to container width with image-rendering:pixelated.
 * Grid: 40 cols x 30 rows of 8x8 px cells.
 *
 * Drawing rules:
 *   - Only role:"student" members are drawn.
 *   - A student with status:"checkedIn" has drained (spec D4) and is NOT drawn.
 *   - online:false members render dimmed.
 *   - When gate.armed, a doorway/hole sprite is drawn on the board.
 *   - A brief green-light cue renders when state.greenlight is set.
 *
 * WS protocol: sends classroom_join on open, classroom_heartbeat every 30s.
 * Reconnects on drop with exponential backoff (starting at 1s, cap 30s).
 * Re-sends classroom_join on every (re)connect.
 *
 * ASCII-only.  LF line endings.
 */

(function (root) {
  'use strict';

  // --- canvas / rendering constants (mirrors screen-renderer.js palette) ---

  var CANVAS_W      = 320;
  var CANVAS_H      = 240;
  var GRID_COLS     = 40;
  var GRID_ROWS     = 30;
  var CELL_W        = 8;   // CANVAS_W / GRID_COLS
  var CELL_H        = 8;   // CANVAS_H / GRID_ROWS
  var GRID_SIZE     = GRID_COLS * GRID_ROWS;  // 1200 cells

  // TI-84 Plus CE LCD palette
  var COLOR_BG      = '#C6D8A0';   // calculator screen background (greenish)
  var COLOR_FG      = '#000000';   // foreground / text
  var COLOR_OFFLINE = '#7A9A60';   // dimmed (online:false)
  var COLOR_LABEL   = '#222222';
  var COLOR_BORDER  = '#4A5A30';

  // Gate / hole colors
  var COLOR_HOLE_BG  = '#222222';   // dark hole interior
  var COLOR_HOLE_FRM = '#888844';   // doorway frame

  // Green-light cue color (briefly shown after classroom_greenlight)
  var COLOR_GREEN   = '#22AA22';
  var GREENLIGHT_MS = 2000;         // fade out after 2 s

  // Avatar shape palette -- 8 distinct hues cycling deterministically
  var AVATAR_COLORS = [
    '#1a7abf', '#bf3a1a', '#1abf5a', '#9a1abf',
    '#bf9a1a', '#1abfbf', '#bf1a7a', '#5abf1a'
  ];

  // --- WS timing knobs --------------------------------------------------

  var HEARTBEAT_MS    = 30000;   // 30 s
  var RECONNECT_BASE  = 1000;    // 1 s initial backoff
  var RECONNECT_CAP   = 30000;   // 30 s max backoff

  // --- pure helpers -----------------------------------------------------

  /**
   * Simple deterministic hash of a string -> non-negative integer.
   * djb2 variant -- fast and good enough for cell placement.
   */
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h >>> 0;  // keep unsigned 32-bit
    }
    return h;
  }

  /**
   * Compute a collision-free cell assignment for a set of usernames.
   *
   * Algorithm:
   *   1. Sort the usernames deterministically (lexicographic).
   *   2. For each username in that order, compute its preferred cell index
   *      (hashStr % GRID_SIZE) then linear-probe forward until a free cell
   *      is found.
   *
   * This guarantees:
   *   - Every username lands in a unique cell.
   *   - The same set of usernames always produces the same layout.
   *   - Adding a new username only shifts usernames whose probe path
   *     collides with it (stable enough for live presence).
   *
   * Returns a plain object mapping username -> { col, row }.
   */
  function assignCells(usernames) {
    var sorted = usernames.slice().sort();
    var occupied = {};  // cellIndex -> true
    var result   = {};  // username -> { col, row }

    // Reserve the gate hole's 4x4 cell region (bottom-right) so a student
    // avatar is never placed under the doorway sprite -- the hole is drawn
    // on top of the avatar layer whenever the gate is armed.
    for (var hr = GRID_ROWS - 4; hr < GRID_ROWS; hr++) {
      for (var hc = GRID_COLS - 4; hc < GRID_COLS; hc++) {
        occupied[hr * GRID_COLS + hc] = true;
      }
    }

    for (var i = 0; i < sorted.length; i++) {
      var name  = sorted[i];
      var start = hashStr(name) % GRID_SIZE;
      var idx   = start;

      // Linear probe: step forward until a free cell is found.
      // Worst case is O(n) probes; with <100 students on 1200 cells this
      // is negligible.
      var probes = 0;
      while (occupied[idx] && probes < GRID_SIZE) {
        idx = (idx + 1) % GRID_SIZE;
        probes++;
      }

      occupied[idx] = true;
      result[name]  = {
        col: idx % GRID_COLS,
        row: Math.floor(idx / GRID_COLS)
      };
    }

    return result;
  }

  /**
   * Map a username to a deterministic avatar color.
   */
  function colorForUser(username) {
    return AVATAR_COLORS[hashStr(username) % AVATAR_COLORS.length];
  }

  // --- pure state reduction (B1 / B3) -----------------------------------

  /**
   * _reduce(state, message) -> state
   *
   * Pure function.  state is never mutated; a new object is returned.
   *
   * state shape:
   * {
   *   members:    { [username]: WireMember },  // indexed by username
   *   gate:       { armed, theme, openedAt } | null,
   *   poll:       null,                        // v2
   *   greenlight: boolean,                     // true after a GO; the renderer owns the brief banner
   * }
   *
   * WireMember: { username, role, status, online }
   *   status: "present" | "checkedIn"
   */
  function _reduce(state, message) {
    if (!message || !message.type) { return state; }

    var members = state.members;
    var newMembers;

    switch (message.type) {

      // ---- v1a handlers (extended for v1b) ----

      case 'classroom_state':
        // Full snapshot.  Replace all members.  Now carries real gate + status.
        newMembers = {};
        var incoming = message.members || [];
        for (var i = 0; i < incoming.length; i++) {
          var m = incoming[i];
          newMembers[m.username] = {
            username: m.username,
            role:     m.role,
            status:   m.status || 'present',
            online:   m.online !== false
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate  || null,
          poll:       message.poll  || null,
          greenlight: false
        };

      case 'classroom_member_update':
        // Upsert.  Now adopts the member's real status.
        var upd = message.member;
        if (!upd || !upd.username) { return state; }
        newMembers = {};
        for (var key in members) {
          newMembers[key] = members[key];
        }
        newMembers[upd.username] = {
          username: upd.username,
          role:     upd.role   !== undefined ? upd.role   : (members[upd.username] ? members[upd.username].role   : 'student'),
          status:   upd.status !== undefined ? upd.status : (members[upd.username] ? members[upd.username].status : 'present'),
          online:   upd.online !== undefined ? upd.online !== false : (members[upd.username] ? members[upd.username].online : true)
        };
        return {
          members:    newMembers,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight
        };

      case 'classroom_member_left':
        // Delete.
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

      // ---- v1b new handlers ----

      case 'classroom_gate':
        // Gate armed.  Reset every member's status to "present" (fresh ritual).
        newMembers = {};
        for (var gk in members) {
          var gm = members[gk];
          newMembers[gk] = {
            username: gm.username,
            role:     gm.role,
            status:   'present',
            online:   gm.online
          };
        }
        return {
          members:    newMembers,
          gate:       message.gate || null,
          poll:       state.poll,
          greenlight: false
        };

      case 'classroom_greenlight':
        // Green-light broadcast.  PURE: set a boolean.  The brief on-canvas
        // banner timing is owned by the renderer via a separate timestamp
        // (greenlightShownAt) tracked in mount() -- never Date.now() here.
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

  // --- rendering --------------------------------------------------------

  /**
   * Draw a 5x5 pixel "person" sprite in the avatar color.
   * origin (px, py) is the top-left of the 8x8 cell.
   * Draws inside a 6x7 area centered in the cell.
   */
  function drawAvatar(ctx, px, py, color, online) {
    ctx.fillStyle = online ? color : COLOR_OFFLINE;

    // head: 2x2 at (px+2, py)
    ctx.fillRect(px + 2, py,     4, 2);
    ctx.fillRect(px + 1, py + 1, 6, 2);

    // body: px+1 to px+6, rows 3-5
    ctx.fillRect(px + 1, py + 3, 6, 3);

    // legs: two 1px wide, row 6
    ctx.fillRect(px + 1, py + 6, 2, 2);
    ctx.fillRect(px + 5, py + 6, 2, 2);
  }

  /**
   * Draw a label in a small band ABOVE the avatar sprite.
   * (cx, cy) is the top-left pixel of the 8x8 cell.
   * The label is drawn at cy - 6 so it sits above the sprite without
   * overlapping it.  Allows up to 8 characters so real names are legible.
   */
  function drawLabel(ctx, text, cx, cy, online) {
    ctx.fillStyle = online ? COLOR_LABEL : COLOR_OFFLINE;
    ctx.font = '5px monospace';
    ctx.textBaseline = 'alphabetic';
    // Allow up to 8 chars -- fits ~32 px wide at 4px/char average.
    var label = text.length > 8 ? text.slice(0, 8) : text;
    // Draw 1px above the top of the cell so it never overlaps the sprite.
    ctx.fillText(label, cx, cy - 1);
  }

  /**
   * Draw the doorway/hole sprite at the bottom-right corner of the board.
   * The hole is a 4x4 cell region (32x32 px) so it is clearly visible.
   * Its look may vary slightly by theme string (just a label for now).
   */
  function drawHole(ctx, gate) {
    // Place the hole in the bottom-right 4x4 cells.
    var holeCol = GRID_COLS - 4;   // col 36, 4 cells wide
    var holeRow = GRID_ROWS - 4;   // row 26, 4 cells tall
    var hx = holeCol * CELL_W;     // px 288
    var hy = holeRow * CELL_H;     // px 208
    var hw = 4 * CELL_W;           // 32
    var hh = 4 * CELL_H;           // 32

    // Door frame
    ctx.strokeStyle = COLOR_HOLE_FRM;
    ctx.lineWidth   = 2;
    ctx.strokeRect(hx, hy, hw, hh);

    // Hole interior
    ctx.fillStyle = COLOR_HOLE_BG;
    ctx.fillRect(hx + 2, hy + 2, hw - 4, hh - 4);

    // Theme label at top of hole (up to 4 chars)
    if (gate && gate.theme) {
      var t = String(gate.theme).slice(0, 4);
      ctx.fillStyle = '#AABB44';
      ctx.font = '5px monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(t, hx + 3, hy + 9);
    }

    // Arrow pointing down into hole
    ctx.fillStyle = '#CCDD66';
    // Arrow shaft
    ctx.fillRect(hx + 14, hy + 10, 4, 10);
    // Arrow head
    ctx.fillRect(hx + 10, hy + 16, 12, 4);
    ctx.fillRect(hx + 12, hy + 20, 8,  4);
    ctx.fillRect(hx + 14, hy + 24, 4,  3);
  }

  /**
   * Draw a brief green-light banner across the top of the canvas.
   * shownAt is the wall-clock time (ms) the board last received a
   * classroom_greenlight; the banner fades out over GREENLIGHT_MS.  This is
   * render-layer only -- reading the clock here is fine; the reducer stays pure.
   */
  function drawGreenLight(ctx, shownAt) {
    if (!shownAt) { return; }
    var age = Date.now() - shownAt;
    if (age > GREENLIGHT_MS) { return; }

    // Alpha fades from 1.0 to 0 over GREENLIGHT_MS.
    var alpha = 1 - (age / GREENLIGHT_MS);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = COLOR_GREEN;
    ctx.fillRect(0, 0, CANVAS_W, 12);
    ctx.fillStyle     = '#FFFFFF';
    ctx.font          = '8px monospace';
    ctx.textBaseline  = 'alphabetic';
    ctx.fillText('GO!', CANVAS_W / 2 - 8, 10);
    ctx.restore();
  }

  /**
   * Render the full board state onto the backing canvas.
   *
   * Drawing rules:
   *   - Student members with status:"present" get an avatar.
   *   - Student members with status:"checkedIn" are NOT drawn (drained).
   *   - Teacher members are never drawn.
   *   - online:false members render dimmed.
   *   - When gate.armed, the doorway/hole sprite is overlaid.
   *   - greenlightShownAt (ms) drives the brief green-light banner.
   */
  function renderState(ctx, state, nameMap, greenlightShownAt) {
    // background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // outer border
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);

    // Collect present student-role members only (checkedIn students are hidden).
    var members = state.members;
    var studentNames = [];
    for (var username in members) {
      var mb = members[username];
      if (mb.role === 'student' && mb.status !== 'checkedIn') {
        studentNames.push(username);
      }
    }

    // Compute collision-free cell assignments for the visible students.
    var cellMap = assignCells(studentNames);

    for (var si = 0; si < studentNames.length; si++) {
      var uname  = studentNames[si];
      var member = members[uname];
      var cell   = cellMap[uname];
      var color  = colorForUser(uname);
      var px     = cell.col * CELL_W;
      var py     = cell.row * CELL_H;
      var online = member.online !== false;

      drawAvatar(ctx, px, py, color, online);

      // Label: use real name from nameMap when available, else username.
      var label = (nameMap && nameMap[uname]) ? nameMap[uname] : uname;
      drawLabel(ctx, label, px, py, online);
    }

    // Gate hole overlay (drawn on top of avatars so it is always visible).
    if (state.gate && state.gate.armed) {
      drawHole(ctx, state.gate);
    }

    // Green-light cue (topmost layer).
    drawGreenLight(ctx, greenlightShownAt);
  }

  // --- check-in button logic (B3) ---------------------------------------

  /**
   * Decide whether the local check-in button should be visible.
   *
   * Visible when ALL of:
   *   - gate is armed
   *   - the local user is a student
   *   - the local user's status is "present" (not yet checked in)
   *
   * Returns true/false.
   */
  function shouldShowCheckinButton(state, username, role) {
    if (role !== 'student')                   { return false; }
    if (!state.gate || !state.gate.armed)     { return false; }
    var me = state.members[username];
    if (!me || me.status !== 'present')       { return false; }
    return true;
  }

  /**
   * Build the summary object passed to onStateChange.
   *
   * summary = { gate, members: [{ username, role, status, online }], greenlight }
   */
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

  // --- mount ------------------------------------------------------------

  /**
   * mount(container, opts) -> handle
   *
   * Creates a canvas inside `container`, opens a WebSocket to opts.wsUrl,
   * and starts rendering live classroom presence.
   *
   * v1a opts: { wsUrl, section, username, role, nameMap? }
   * v1b opts adds: { onStateChange? }
   *
   * v1a handle: { destroy(), setNameMap(map) }
   * v1b handle adds: { armGate(theme), greenLight(), reset() }
   */
  function mount(container, opts) {
    if (!container || !opts) {
      throw new Error('ClassroomBoard.mount: container and opts are required');
    }

    var wsUrl          = opts.wsUrl;
    var section        = opts.section;
    var username       = opts.username;
    var role           = opts.role || 'student';
    var nameMap        = opts.nameMap || null;
    var onStateChange  = opts.onStateChange || null;

    // canvas setup
    var canvas = (root.document || document).createElement('canvas');
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.width           = '100%';
    canvas.style.imageRendering  = 'pixelated';
    canvas.style.display         = 'block';
    container.appendChild(canvas);

    // check-in button (v1b, B3) -- injected into the same container
    var checkinBtn = (root.document || document).createElement('button');
    checkinBtn.textContent = 'Check in';
    checkinBtn.style.display = 'none';
    checkinBtn.setAttribute('data-classroom-checkin', '1');
    container.appendChild(checkinBtn);

    var ctx = canvas.getContext('2d');

    // state
    var state          = emptyState();
    var destroyed      = false;
    var ws             = null;
    var heartbeatTimer = null;
    var reconnectTimer = null;
    var reconnectDelay = RECONNECT_BASE;

    // Green-light banner timing (render-layer only -- NOT in `state`, so the
    // _reduce reducer stays pure).  greenlightShownAt is the ms time of the
    // last classroom_greenlight; greenlightTimer animates the brief fade-out.
    var greenlightShownAt = 0;
    var greenlightTimer   = null;

    // Update the check-in button visibility.
    function refreshButton() {
      if (!checkinBtn) { return; }
      checkinBtn.style.display = shouldShowCheckinButton(state, username, role)
        ? 'inline-block'
        : 'none';
    }

    // draw on each state update
    function draw() {
      if (ctx) {
        renderState(ctx, state, nameMap, greenlightShownAt);
      }
      refreshButton();
    }

    // Repaint repeatedly for a short window so the green-light banner can
    // animate its fade-out and then clear itself.  Without this the banner
    // would linger frozen until the next unrelated WS message arrives.
    function scheduleGreenlightFade() {
      if (greenlightTimer) { clearInterval(greenlightTimer); }
      greenlightTimer = setInterval(function () {
        draw();
        if (Date.now() - greenlightShownAt > GREENLIGHT_MS) {
          clearInterval(greenlightTimer);
          greenlightTimer = null;
        }
      }, 120);
    }

    // notify the caller (v1b B4)
    function notifyStateChange() {
      if (typeof onStateChange === 'function') {
        onStateChange(buildSummary(state));
      }
    }

    // apply a message and redraw
    function applyMessage(msg) {
      state = _reduce(state, msg);
      // A greenlight is a brief render-layer cue: stamp the local clock and
      // kick the fade animation.  _reduce itself stays pure (no Date.now).
      if (msg.type === 'classroom_greenlight') {
        greenlightShownAt = Date.now();
        scheduleGreenlightFade();
      }
      draw();
      notifyStateChange();
    }

    // send helpers
    function safeSend(obj) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
      }
    }

    function sendJoin() {
      safeSend({ type: 'classroom_join', section: section, username: username, role: role });
    }

    function sendHeartbeat() {
      safeSend({ type: 'classroom_heartbeat' });
    }

    // Check-in button click handler (B3).
    checkinBtn.onclick = function () {
      safeSend({ type: 'classroom_checkin' });
    };

    // WebSocket lifecycle
    function connect() {
      if (destroyed) { return; }

      var WS = (root.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null));
      if (!WS) { return; }  // no WS in this environment (e.g. test without mock)

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

      ws.onerror = function () { /* close will follow; handled in onclose */ };

      ws.onclose = function () {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (destroyed) { return; }
        // exponential backoff reconnect
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_CAP);
          connect();
        }, reconnectDelay);
      };
    }

    // initial draw + connect
    draw();
    connect();

    // public handle (v1a + v1b methods)
    var handle = {

      // --- v1a methods ---

      destroy: function () {
        destroyed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(reconnectTimer);
        clearInterval(greenlightTimer);
        heartbeatTimer = null;
        reconnectTimer = null;
        greenlightTimer = null;
        if (ws) {
          ws.onclose = null;  // prevent reconnect loop
          ws.close();
          ws = null;
        }
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        if (checkinBtn.parentNode) {
          checkinBtn.parentNode.removeChild(checkinBtn);
        }
      },

      setNameMap: function (map) {
        nameMap = map || null;
        draw();
      },

      // --- v1b teacher methods (B4) ---

      armGate: function (theme) {
        safeSend({ type: 'classroom_arm_gate', theme: theme || '' });
      },

      greenLight: function () {
        safeSend({ type: 'classroom_go' });
      },

      reset: function () {
        safeSend({ type: 'classroom_reset' });
      }
    };

    return handle;
  }

  // --- public API -------------------------------------------------------

  root.ClassroomBoard = {
    mount:        mount,
    _reduce:      _reduce,       // exposed for testing (B3)
    _assignCells: assignCells    // exposed for collision-probing tests
  };

}(typeof window !== 'undefined' ? window : this));
