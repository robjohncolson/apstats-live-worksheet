/**
 * classroom-board.js
 *
 * Live Classroom board component (v1a).  PLAIN browser script -- no ES
 * import/export.  Load via <script src="classroom-board.js">.
 *
 * Attaches window.ClassroomBoard with the frozen API from BUILD Section 6:
 *
 *   ClassroomBoard.mount(container, opts) -> handle
 *   handle.destroy()
 *   handle.setNameMap(map)
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
 * Only role:"student" members are drawn.  online:false members are dimmed.
 * Placement is deterministic via a hash of username with linear-probe
 * collision resolution so every member gets a unique cell.
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

  // --- pure state reduction (B3) ----------------------------------------

  /**
   * _reduce(state, message) -> state
   *
   * Pure function.  state is never mutated; a new object is returned.
   *
   * state shape:
   * {
   *   members: { [username]: WireMember },   // indexed by username
   *   gate:    null,                          // v1b
   *   poll:    null,                          // v2
   * }
   *
   * WireMember: { username, role, status, online }
   */
  function _reduce(state, message) {
    if (!message || !message.type) { return state; }

    var members = state.members;
    var newMembers;

    switch (message.type) {

      case 'classroom_state':
        // Full snapshot.  Replace all members.
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
          members: newMembers,
          gate:    message.gate    || null,
          poll:    message.poll    || null
        };

      case 'classroom_member_update':
        // Upsert.
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
          members: newMembers,
          gate:    state.gate,
          poll:    state.poll
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
          members: newMembers,
          gate:    state.gate,
          poll:    state.poll
        };

      default:
        return state;
    }
  }

  // --- initial state factory --------------------------------------------

  function emptyState() {
    return { members: {}, gate: null, poll: null };
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
   * Render the full board state onto the backing canvas.
   */
  function renderState(ctx, state, nameMap) {
    // background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // outer border
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);

    // Collect student-role members only.
    var members = state.members;
    var studentNames = [];
    for (var username in members) {
      if (members[username].role === 'student') {
        studentNames.push(username);
      }
    }

    // Compute collision-free cell assignments for ALL current students.
    // assignCells sorts internally, so the layout is stable regardless
    // of iteration order.
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
  }

  // --- mount ------------------------------------------------------------

  /**
   * mount(container, opts) -> handle
   *
   * Creates a canvas inside `container`, opens a WebSocket to opts.wsUrl,
   * and starts rendering live classroom presence.
   *
   * opts: { wsUrl, section, username, role, nameMap? }
   * handle: { destroy(), setNameMap(map) }
   */
  function mount(container, opts) {
    if (!container || !opts) {
      throw new Error('ClassroomBoard.mount: container and opts are required');
    }

    var wsUrl    = opts.wsUrl;
    var section  = opts.section;
    var username = opts.username;
    var role     = opts.role || 'student';
    var nameMap  = opts.nameMap || null;

    // canvas setup
    var canvas = (root.document || document).createElement('canvas');
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.width           = '100%';
    canvas.style.imageRendering  = 'pixelated';
    canvas.style.display         = 'block';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');

    // state
    var state          = emptyState();
    var destroyed      = false;
    var ws             = null;
    var heartbeatTimer = null;
    var reconnectTimer = null;
    var reconnectDelay = RECONNECT_BASE;

    // draw on each state update
    function draw() {
      if (!ctx) { return; }
      renderState(ctx, state, nameMap);
    }

    // apply a message and redraw
    function applyMessage(msg) {
      state = _reduce(state, msg);
      draw();
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

    // public handle
    var handle = {
      destroy: function () {
        destroyed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(reconnectTimer);
        heartbeatTimer = null;
        reconnectTimer = null;
        if (ws) {
          ws.onclose = null;  // prevent reconnect loop
          ws.close();
          ws = null;
        }
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
      },
      setNameMap: function (map) {
        nameMap = map || null;
        draw();
      }
    };

    return handle;
  }

  // --- public API -------------------------------------------------------

  root.ClassroomBoard = {
    mount:      mount,
    _reduce:    _reduce,    // exposed for testing (B3)
    _assignCells: assignCells  // exposed for collision-probing tests
  };

}(typeof window !== 'undefined' ? window : this));
