// ── Teacher -> Student Console: View-As (P2 of TEACHER_STUDENT_CONSOLE_SPEC.md) ──
// A teacher opens this Desk in a new tab via ?viewAsUserId=<sid> from the
// dashboard drawer; the Desk hydrates a per-tab sessionStorage object
// (apstats_view_as_context) and renders as that student, READ-ONLY. Every
// function below FAILS OPEN -- bad sessionStorage / missing helpers / fetch
// errors leave the Desk rendering normally for the signed-in user.

function _viewAsContext() {
  try {
    var raw = sessionStorage.getItem('apstats_view_as_context');
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.studentId !== 'string') return null;
    return parsed;
  } catch (_) { return null; }
}

function _maybeViewAsFetch(endpoint, headers) {
  var ctx = _viewAsContext();
  if (!ctx) return { endpoint: endpoint, headers: headers || {} };
  var sid = encodeURIComponent(ctx.studentId);
  var teacherToken = null;
  try {
    teacherToken = (window.rosterClient && window.rosterClient.token)
      ? window.rosterClient.token() : null;
  } catch (_) { teacherToken = null; }
  var newHeaders = {};
  if (headers) for (var k in headers) if (Object.prototype.hasOwnProperty.call(headers, k)) newHeaders[k] = headers[k];
  if (teacherToken) newHeaders['Authorization'] = 'Bearer ' + teacherToken;
  // Strip any student ?token= -- teacher token rides in the header.
  if (endpoint.indexOf('/grade') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/grade', headers: newHeaders };
  }
  if (endpoint.indexOf('/donow') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/donow', headers: newHeaders };
  }
  if (endpoint.indexOf('/poll-archive') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/poll-archive', headers: newHeaders };
  }
  return { endpoint: endpoint, headers: newHeaders };
}

function _renderViewAsBanner() {
  var ctx = _viewAsContext();
  var banner = document.getElementById('view-as-banner');
  if (!banner) return;
  if (!ctx) {
    banner.style.display = 'none';
    try { document.body.classList.remove('view-as-active'); } catch (_) {}
    return;
  }
  var nameEl = document.getElementById('view-as-banner-name');
  var metaEl = document.getElementById('view-as-banner-meta');
  if (nameEl) nameEl.textContent = ctx.realName || ctx.username || 'Student';
  if (metaEl) metaEl.textContent =
    (ctx.username ? '@' + ctx.username : '') +
    (ctx.section ? ' — ' + ctx.section : '');
  banner.style.display = 'flex';
  try { document.body.classList.add('view-as-active'); } catch (_) {}
}

function _exitViewAs() {
  try { sessionStorage.removeItem('apstats_view_as_context'); } catch (_) {}
  try {
    var url = new URL(window.location.href);
    url.searchParams.delete('viewAsUserId');
    window.location.href = url.toString();
  } catch (_) {
    try { window.location.reload(); } catch (_) {}
  }
}

function _applyViewAsReadOnly() {
  if (!_viewAsContext()) return;
  try {
    var els = document.querySelectorAll('input, textarea');
    for (var i = 0; i < els.length; i++) {
      els[i].setAttribute('disabled', 'true');
      els[i].style.opacity = '0.55';
      els[i].style.cursor = 'not-allowed';
    }
  } catch (_) {}
  // Hide sign-out + change-password menu items so the teacher cannot
  // accidentally sign the student account out OR change its password.
  try {
    var hideIds = ['menu-sign-out', 'menu-change-password'];
    for (var j = 0; j < hideIds.length; j++) {
      var n = document.getElementById(hideIds[j]);
      if (n) n.style.display = 'none';
    }
  } catch (_) {}
}

// Worksheet links opened from a view-as Desk must carry the impersonation so the
// worksheet renders the STUDENT's answers READ-ONLY (not the teacher's own). A
// single capturing listener rewrites every worksheet anchor's href just before
// navigation — render-site-agnostic, so any current or future link site is
// covered without touching each render path. No-ops outside view-as.
function _wireViewAsWorksheetLinks() {
  var ctx = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
  if (!ctx || !ctx.studentId) return;
  if (window.__viewAsLinksWired) return;
  window.__viewAsLinksWired = true;
  function _rewrite(e) {
    try {
      var t = e.target;
      var a = (t && t.closest) ? t.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      // Only the live worksheet family (u<unit>_lesson<range>_live.html). Leaves
      // edgar/mit and every non-worksheet link untouched.
      if (!/u\d+_lesson[\w.-]*_live\.html/i.test(href)) return;
      var u = new URL(a.href, window.location.href);
      if (!u.searchParams.get('viewAsUserId')) {
        u.searchParams.set('viewAsUserId', ctx.studentId);
        a.href = u.toString();
      }
    } catch (_) {}
  }
  // Capture phase so the href is mutated before the browser follows it. Covers
  // left-click and middle/ctrl-click (auxclick) "open in new tab".
  document.addEventListener('click', _rewrite, true);
  document.addEventListener('auxclick', _rewrite, true);
}

function _showViewAsToast(msg) {
  try {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--platinum);color:#78350f;padding:10px 16px;border:1px solid #fbbf24;border-radius:6px;z-index:9999;font:13px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.18);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (_) {} }, 3000);
  } catch (_) {}
}

// View-as bootstrap (IIFE). Detect ?viewAsUserId; verify teacher auth;
// hydrate viewAsContext into sessionStorage (per-tab) + reload so the
// rest of the page renders cleanly with the context set. Idempotent --
// a reload with the same sid is a no-op (sessionStorage already matches).
(async function _viewAsBootstrap() {
  var params;
  try { params = new URLSearchParams(window.location.search); }
  catch (_) { return; }
  var sid = params.get('viewAsUserId');
  if (!sid) return;
  var existing = null;
  try { existing = JSON.parse(sessionStorage.getItem('apstats_view_as_context') || 'null'); }
  catch (_) { existing = null; }
  if (existing && existing.studentId === sid) return;
  var me;
  try { me = (window.rosterClient && window.rosterClient.current) ? window.rosterClient.current() : null; }
  catch (_) { me = null; }
  if (!me || me.role !== 'teacher') return;
  var base = window.ROSTER_SERVICE_URL;
  if (!base) return;
  var token = null;
  try { token = (window.rosterClient.token) ? window.rosterClient.token() : null; }
  catch (_) { token = null; }
  if (!token) return;
  // Codex BLOCKER fold P2: set the pre-hydration class SYNCHRONOUSLY (before
  // any await) so CSS hides body until the reload lands. Without this the
  // teacher's own Do Now / calendar can flash on first paint. The class
  // gets cleared if the fetch fails so the page stays usable.
  try { document.documentElement.classList.add('view-as-loading'); } catch (_) {}
  var willReload = false;
  try {
    var res = await fetch(base + '/teacher/student/' + encodeURIComponent(sid) + '/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    var data = await res.json();
    if (!data || !data.ok) return;
    sessionStorage.setItem('apstats_view_as_context', JSON.stringify({
      studentId: data.studentId,
      username: data.username,
      realName: data.realName,
      section: data.section,
      readOnly: true,
      enteredAt: Date.now()
    }));
    willReload = true;
    window.location.reload();
  } catch (_) { /* failure -> Desk renders normally for the teacher */ }
  finally {
    // Any non-reload exit removes the class so body becomes visible. If
    // willReload is true, removal is harmless -- the page is about to
    // reload anyway.
    if (!willReload) {
      try { document.documentElement.classList.remove('view-as-loading'); } catch (_) {}
    }
  }
})();

// Wire view-as banner + read-only application. Banner render runs
// synchronously (banner div is parsed before this script); read-only scan
// runs in DOMContentLoaded to catch inputs in the rest of the body markup.
try { _renderViewAsBanner(); } catch (_) {}
try {
  document.addEventListener('DOMContentLoaded', function () {
    try { _renderViewAsBanner(); } catch (_) {}
    try { _applyViewAsReadOnly(); } catch (_) {}
    try { _wireViewAsWorksheetLinks(); } catch (_) {}
    try {
      var exitBtn = document.getElementById('view-as-exit');
      if (exitBtn) exitBtn.addEventListener('click', _exitViewAs);
    } catch (_) {}
  });
} catch (_) {}

// ── Teacher -> Student Console: nudge toast (P3 of TEACHER_STUDENT_CONSOLE_SPEC.md §6) ──
// Student-side receiver. A 'classroom_teacher_nudge' WS message arrives via
// the ClassroomBoard mount's onClassroomMessage callback; this code reveals
// the toast + plays a soft chime. Reply rides the same WS connection back
// to the teacher's cockpit AND posts to roster-server for the log row.

// -- P3+T2 (P6): stacked nudge toasts --
// Stack semantics: up to MAX_NUDGE_STACK toasts co-exist; oldest
// drops on overflow. Each toast has its own DOM node + own reply
// textarea + own close handler. Chime plays for every arrival.

var MAX_NUDGE_STACK = 4;
// Map keyed by nudgeId; each value:
//   { fromUsername: string, toastEl: HTMLElement, createdAt: number }
var _activeNudges = new Map();

// Soft chime helper: one short 880 Hz sine (MacSFX.recipes.nudgeChime) through the
// shared engine (lib/sfx.js). Silent when the engine or audio is unavailable.
function _playNudgeChime() {
  try {
    if (window.sfx) window.sfx.play('mac:nudgeChime');
  } catch (_) { /* audio disabled / context unavailable -> silent */ }
}

function _showNudgeToast(payload) {
  // payload: { nudgeId, text, fromUsername, ts }
  var container = document.getElementById('nudge-toast-stack');
  var tmpl = document.getElementById('nudge-toast-template');
  if (!container || !tmpl) return;

  var nudgeId = (payload && payload.nudgeId) || ('nudge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));

  // Idempotency: if the same nudgeId is already showing (server retry,
  // double-deliver), no-op. The server's recentNudges TTL prevents the
  // realistic case, but defense-in-depth.
  if (_activeNudges.has(nudgeId)) return;

  // Clone the template.
  var clone = tmpl.content.firstElementChild.cloneNode(true);
  clone.setAttribute('data-nudge-id', nudgeId);
  var fromEl = clone.querySelector('.nt-from-name');
  var textEl = clone.querySelector('.nt-text');
  var closeBtn = clone.querySelector('.nt-close');
  var sendBtn = clone.querySelector('.nt-send');
  if (fromEl) fromEl.textContent = (payload && payload.fromUsername) || 'Teacher';
  if (textEl) textEl.textContent = (payload && payload.text) || '';

  // Per-toast handlers -- close + send are closures over THIS nudgeId.
  if (closeBtn) closeBtn.addEventListener('click', function () { _hideNudgeToastById(nudgeId); });
  if (sendBtn) sendBtn.addEventListener('click', function () { _sendNudgeReplyForId(nudgeId); });

  // Register state BEFORE appending so an overflow-eviction does not race the new toast.
  _activeNudges.set(nudgeId, {
    fromUsername: (payload && payload.fromUsername) || '',
    toastEl: clone,
    createdAt: Date.now(),
  });

  container.appendChild(clone);

  // Overflow: drop the OLDEST until size <= MAX_NUDGE_STACK.
  while (_activeNudges.size > MAX_NUDGE_STACK) {
    var oldestId = null;
    var oldestTs = Infinity;
    _activeNudges.forEach(function (v, k) {
      if (v.createdAt < oldestTs) { oldestTs = v.createdAt; oldestId = k; }
    });
    if (oldestId == null) break;
    console.warn('[nudge-stack] dropping oldest nudge', oldestId, 'to make room');
    _hideNudgeToastById(oldestId);
  }

  _playNudgeChime();
}

function _hideNudgeToastById(nudgeId) {
  var entry = _activeNudges.get(nudgeId);
  if (!entry) return;
  try { entry.toastEl.parentNode && entry.toastEl.parentNode.removeChild(entry.toastEl); } catch (_) {}
  _activeNudges.delete(nudgeId);
}

async function _sendNudgeReplyForId(nudgeId) {
  var entry = _activeNudges.get(nudgeId);
  if (!entry) return;
  var replyEl = entry.toastEl.querySelector('.nt-reply textarea');
  var rawText = replyEl ? String(replyEl.value || '').trim() : '';
  if (!rawText) return;
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  var sendBtn = entry.toastEl.querySelector('.nt-send');
  if (sendBtn) sendBtn.disabled = true;

  // 1) Live delivery via the existing classroom WS.
  try {
    if (typeof _classroomBoardHandle !== 'undefined' && _classroomBoardHandle && typeof _classroomBoardHandle.sendMessage === 'function') {
      _classroomBoardHandle.sendMessage({
        type: 'classroom_student_nudge_reply',
        nudgeId: nudgeId,
        text: rawText,
      });
    }
  } catch (_) {}

  // 2) Log to roster-server.
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (base && token) {
      await fetch(base + '/student/nudge-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          parentNudgeId: nudgeId,
          recipientUsername: entry.fromUsername,
          text: rawText,
        }),
      });
    }
  } catch (_) {}
  _hideNudgeToastById(nudgeId);
}

// -- P13: student-initiated DM modal ----------------------------------------
// Composing a free-text DM to the teacher from the Desk. The teacher recipient
// is resolved server-side (single-teacher prod). Persists to nudges_log with
// direction='student' + parent_nudge_id=NULL.

var STUDENT_NUDGE_LAST_SEEN_KEY = 'apstats_nudge_last_seen';
// 2 min, visible tabs only: the badge is a backstop. Live nudges arrive instantly
// over the presence socket, and refocus/boot/DM-open/nudge_notify force a poll.
var STUDENT_NUDGE_POLL_MS = 120 * 1000;
var _studentNudgePollTimer = null;
var _studentNudgePollInFlight = false;
var _studentNudgeUnreadCount = 0;
var _studentNudgeLatestTeacherAt = '';
var _seenNudgeNotifyIds = {};
var _teacherNudgeTargetUsername = '';

function _studentNudgeSession() {
  try {
    return (window.rosterClient && typeof window.rosterClient.current === 'function')
      ? (window.rosterClient.current() || null)
      : null;
  } catch (_) {
    return null;
  }
}

function _studentNudgeToken() {
  try {
    return (window.rosterClient && typeof window.rosterClient.token === 'function')
      ? (window.rosterClient.token() || null)
      : null;
  } catch (_) {
    return null;
  }
}

// The stable Guest_ alias when browsing as a guest (no roster session). Guests have
// no token, so they read teacher messages by alias via the un-authed endpoint.
function _studentNudgeGuestAlias() {
  try {
    if (localStorage.getItem('apstats_guest_active') !== '1') return null;
    var a = (typeof window.getGuestIdentity === 'function') ? window.getGuestIdentity() : null;
    return (a && /^Guest_/i.test(a)) ? a : null;
  } catch (_) { return null; }
}

// A fetch() for THIS user's nudge thread, or null if neither a signed-in roster
// student nor an active guest. Roster -> token'd /student/nudge-history; guest ->
// the un-authed /student/nudge-history-guest (so guests can READ teacher messages).
function _studentNudgeFetch(limit) {
  var base = window.ROSTER_SERVICE_URL;
  if (!base) return null;
  var n = limit || 20;
  var token = _studentNudgeToken();
  if (token) return fetch(base + '/student/nudge-history?limit=' + n, { headers: { 'Authorization': 'Bearer ' + token } });
  var alias = _studentNudgeGuestAlias();
  if (alias) return fetch(base + '/student/nudge-history-guest?guestUsername=' + encodeURIComponent(alias) + '&limit=' + n);
  return null;
}

function _studentNudgeCleanUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function _studentNudgeSelfUsername() {
  var who = _studentNudgeSession();
  if (who && who.username) return _studentNudgeCleanUsername(who.username);
  try {
    if (typeof DogePresence !== 'undefined' && DogePresence.getUsername) {
      return _studentNudgeCleanUsername(DogePresence.getUsername());
    }
  } catch (_) {}
  return '';
}

function _studentNudgeCanPoll() {
  var who = _studentNudgeSession();
  if (who && who.role === 'teacher') return false;   // teachers have no student inbox
  if (!window.ROSTER_SERVICE_URL) return false;
  return !!(_studentNudgeToken() || _studentNudgeGuestAlias());   // roster student OR active guest
}

function _studentDmModalOpen() {
  var modal = document.getElementById('student-dm-modal');
  return !!(modal && modal.style.display && modal.style.display !== 'none');
}

function _studentNudgeRowMs(row) {
  var ms = Date.parse((row && row.created_at) || '');
  return Number.isFinite(ms) ? ms : 0;
}

function _studentNudgeLastSeenMs() {
  try {
    var ms = Date.parse(localStorage.getItem(STUDENT_NUDGE_LAST_SEEN_KEY) || '');
    return Number.isFinite(ms) ? ms : 0;
  } catch (_) {
    return 0;
  }
}

function _studentNudgeLatestTeacherCreatedAt(rows) {
  var latestMs = 0;
  var latestIso = '';
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    if (!row || row.direction !== 'teacher') return;
    var ms = _studentNudgeRowMs(row);
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = String(row.created_at || '');
    }
  });
  return latestIso;
}

function _studentNudgeUnreadFromRows(rows) {
  var lastSeenMs = _studentNudgeLastSeenMs();
  var count = 0;
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    if (row && row.direction === 'teacher' && _studentNudgeRowMs(row) > lastSeenMs) count++;
  });
  return count;
}

function _studentNudgeSetBadge(count) {
  _studentNudgeUnreadCount = Math.max(0, Number(count) || 0);
  var item = document.getElementById('menu-message-teacher');
  var badge = document.getElementById('menu-message-teacher-badge');
  if (item) item.classList.toggle('has-unread', _studentNudgeUnreadCount > 0);
  if (!badge) return;
  if (_studentNudgeUnreadCount > 0) {
    badge.hidden = false;
    badge.textContent = _studentNudgeUnreadCount > 9 ? '9+' : String(_studentNudgeUnreadCount);
    badge.setAttribute('aria-label', String(_studentNudgeUnreadCount) + ' unread teacher messages');
  } else {
    badge.hidden = true;
    badge.textContent = '0';
    badge.removeAttribute('aria-label');
  }
}

function _studentNudgeMarkSeen(iso) {
  var nextIso = iso || new Date().toISOString();
  var nextMs = Date.parse(nextIso);
  if (!Number.isFinite(nextMs)) {
    nextIso = new Date().toISOString();
    nextMs = Date.parse(nextIso);
  }
  try {
    var currentIso = localStorage.getItem(STUDENT_NUDGE_LAST_SEEN_KEY) || '';
    var currentMs = Date.parse(currentIso);
    if (Number.isFinite(currentMs) && currentMs > nextMs) nextIso = currentIso;
    localStorage.setItem(STUDENT_NUDGE_LAST_SEEN_KEY, nextIso);
  } catch (_) {}
  _studentNudgeSetBadge(0);
}

function _studentNudgeRememberRows(rows) {
  var latest = _studentNudgeLatestTeacherCreatedAt(rows);
  _studentNudgeLatestTeacherAt = latest || '';
  if (_studentDmModalOpen()) {
    _studentNudgeMarkSeen(latest || new Date().toISOString());
    return { latestTeacherAt: latest, unreadCount: 0 };
  }
  var unread = _studentNudgeUnreadFromRows(rows);
  _studentNudgeSetBadge(unread);
  return { latestTeacherAt: latest, unreadCount: unread };
}

async function _pollStudentNudgeHistory(force) {
  if (!force && _studentNudgePollInFlight) return null;
  if (!_studentNudgeCanPoll()) {
    _studentNudgeSetBadge(0);
    return null;
  }
  _studentNudgePollInFlight = true;
  try {
    var p = _studentNudgeFetch(20);
    if (!p) return null;
    var res = await p;
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j || !j.ok) return null;
    var rows = Array.isArray(j.rows) ? j.rows : [];
    var modalWasOpen = _studentDmModalOpen();
    var unreadBeforeRemember = _studentNudgeUnreadFromRows(rows);
    _studentNudgeRememberRows(rows);
    if (modalWasOpen && unreadBeforeRemember > 0) {
      _fetchStudentDmHistory();
    }
    return rows;
  } catch (_) {
    return null;
  } finally {
    _studentNudgePollInFlight = false;
  }
}

function _startStudentNudgePolling() {
  try { if (_studentNudgePollTimer) clearInterval(_studentNudgePollTimer); } catch (_) {}
  _pollStudentNudgeHistory(true);
  _studentNudgePollTimer = setInterval(function () {
    if (typeof document !== 'undefined' && document.hidden) return;   // refocus polls on return
    _pollStudentNudgeHistory(false);
  }, STUDENT_NUDGE_POLL_MS);
}

function _onNudgeNotify(msg) {
  try {
    if (!msg || msg.type !== 'nudge_notify') return;
    var self = _studentNudgeSelfUsername();
    if (!self) return;
    var targets = Array.isArray(msg.toUsernames) ? msg.toUsernames : [];
    var isForMe = targets.some(function (u) { return _studentNudgeCleanUsername(u) === self; });
    if (!isForMe) return;
    var ts = (typeof msg.timestamp === 'number' && isFinite(msg.timestamp)) ? msg.timestamp : Date.now();
    var key = msg.nudgeId
      ? String(msg.nudgeId).slice(0, 128)
      : (_studentNudgeCleanUsername(msg.fromUsername) + '|' + self + '|' + Math.floor(ts / 2000));
    if (_seenNudgeNotifyIds[key]) return;
    _seenNudgeNotifyIds[key] = 1;
    var seenIds = Object.keys(_seenNudgeNotifyIds);
    if (seenIds.length > 300) delete _seenNudgeNotifyIds[seenIds[0]];
    if (_studentDmModalOpen()) {
      _fetchStudentDmHistory();
      return;
    }
    _studentNudgeSetBadge(Math.max(1, _studentNudgeUnreadCount || 0));
    _pollStudentNudgeHistory(true);
  } catch (_) {}
}

function _openStudentDmModal() {
  var modal = document.getElementById('student-dm-modal');
  if (!modal) return;
  // Reset state on every open so stale status from a prior session is gone.
  var textEl = document.getElementById('sdm-text');
  if (textEl) textEl.value = '';
  var statusEl = document.getElementById('sdm-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('is-error', 'is-success');
  }
  var sendBtn = document.getElementById('sdm-send');
  if (sendBtn) sendBtn.disabled = false;
  modal.style.display = 'block';
  // Brief delay so the browser paints before we steal focus.
  setTimeout(function () {
    var ta = document.getElementById('sdm-text');
    if (ta) ta.focus();
  }, 30);
  if (typeof _studentNudgeMarkSeen === 'function') {
    _studentNudgeMarkSeen(_studentNudgeLatestTeacherAt || new Date().toISOString());
  }
  _fetchStudentDmHistory();
}

function _closeStudentDmModal() {
  var modal = document.getElementById('student-dm-modal');
  if (modal) modal.style.display = 'none';
}

// Codex P13 MAJOR fold: history-fetch race guard. _openStudentDmModal +
// _sendStudentDm both kick off _fetchStudentDmHistory; on a slow network an
// older fetch can resolve AFTER a newer one and overwrite fresh rows with
// stale data. Each call now captures the latest epoch; only the most recent
// fetch is permitted to render.
var _sdmHistoryEpoch = 0;

async function _fetchStudentDmHistory() {
  var listEl = document.getElementById('sdm-history-list');
  if (!listEl) return;
  var epoch = ++_sdmHistoryEpoch;
  listEl.innerHTML = '<li class="sdm-history-empty">Loading...</li>';
  try {
    var p = _studentNudgeFetch(20);
    if (!p) {
      if (epoch !== _sdmHistoryEpoch) return;
      listEl.innerHTML = '<li class="sdm-history-empty">Not signed in.</li>';
      return [];
    }
    var res = await p;
    if (epoch !== _sdmHistoryEpoch) return;  // newer fetch superseded us
    var j = await res.json().catch(function () { return {}; });
    if (epoch !== _sdmHistoryEpoch) return;
    if (!res.ok || !j || !j.ok) {
      listEl.innerHTML = '<li class="sdm-history-empty">No messages yet.</li>';
      return [];
    }
    var rows = Array.isArray(j.rows) ? j.rows : [];
    if (typeof _studentNudgeRememberRows === 'function') _studentNudgeRememberRows(rows);
    if (rows.length === 0) {
      listEl.innerHTML = '<li class="sdm-history-empty">No messages yet.</li>';
      return [];
    }
    listEl.innerHTML = '';
    rows.forEach(function (row) {
      listEl.appendChild(_buildSdmHistoryLi(row));
    });
    return rows;
  } catch (_) {
    if (epoch !== _sdmHistoryEpoch) return;
    var el = document.getElementById('sdm-history-list');
    if (el) el.innerHTML = '<li class="sdm-history-empty">Error loading history.</li>';
    return [];
  }
}

function _buildSdmHistoryLi(row) {
  var li = document.createElement('li');
  var arrow = document.createElement('span');
  // direction='teacher' = incoming (from teacher); direction='student' = outgoing (from me).
  arrow.className = 'sdm-history-arrow ' +
    (row.direction === 'teacher' ? 'sdm-from-teacher' : 'sdm-from-student');
  arrow.textContent = row.direction === 'teacher' ? '<<' : '>>';
  var block = document.createElement('div');
  var meta = document.createElement('div');
  meta.className = 'sdm-history-meta';
  var when = (row.created_at || '').slice(0, 16).replace('T', ' ');
  var who = (row.direction === 'teacher')
    ? (row.sender_username || 'teacher')
    : 'me';
  meta.textContent = when + ' \xB7 ' + who;
  var text = document.createElement('div');
  text.className = 'sdm-history-text';
  text.textContent = row.text || '';
  block.appendChild(meta);
  block.appendChild(text);
  li.appendChild(arrow);
  li.appendChild(block);
  return li;
}

async function _sendStudentDm() {
  var textEl = document.getElementById('sdm-text');
  var statusEl = document.getElementById('sdm-status');
  var btn = document.getElementById('sdm-send');
  var rawText = textEl ? String(textEl.value || '').trim() : '';
  if (statusEl) statusEl.classList.remove('is-error', 'is-success');
  if (!rawText) {
    if (statusEl) {
      statusEl.textContent = 'Type a message first.';
      statusEl.classList.add('is-error');
    }
    return;
  }
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Sending...';
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (!base || !token) {
      if (statusEl) {
        // A guest can READ teacher messages but can't reply (no identity to reply AS).
        statusEl.textContent = _studentNudgeGuestAlias()
          ? 'Sign in with your name to reply so your teacher knows who you are.'
          : 'Not signed in.';
        statusEl.classList.add('is-error');
      }
      if (btn) btn.disabled = false;
      return;
    }
    var res = await fetch(base + '/student/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: rawText }),
    });
    var j = await res.json().catch(function () { return {}; });
    if (res.status === 503) {
      if (statusEl) {
        statusEl.textContent = (j && j.error) || 'Server unavailable.';
        statusEl.classList.add('is-error');
      }
      if (btn) btn.disabled = false;
      return;
    }
    if (!res.ok || !j.ok) {
      if (statusEl) {
        statusEl.textContent = (j && j.error) || ('HTTP ' + res.status);
        statusEl.classList.add('is-error');
      }
      if (btn) btn.disabled = false;
      return;
    }
    if (statusEl) {
      statusEl.textContent = 'Sent.';
      statusEl.classList.add('is-success');
    }
    if (textEl) textEl.value = '';
    // Refresh history so the student sees their own message immediately.
    _fetchStudentDmHistory();
    if (btn) btn.disabled = false;
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Network error: ' + (err && err.message ? err.message : 'unknown');
      statusEl.classList.add('is-error');
    }
    if (btn) btn.disabled = false;
  }
}

function _teacherNudgeUsername(username) {
  return String(username || '').trim().toLowerCase().slice(0, 64);
}

function _teacherNudgeCurrentUsername() {
  var who = null;
  try {
    who = (window.rosterClient && typeof window.rosterClient.current === 'function')
      ? (window.rosterClient.current() || null)
      : null;
  } catch (_) {}
  return _teacherNudgeUsername((who && who.username) || '');
}

function _teacherNudgeStatus(text, cls) {
  var statusEl = document.getElementById('tnm-status');
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.classList.remove('is-error', 'is-success');
  if (cls) statusEl.classList.add(cls);
}

function _openTeacherNudgeModal(username) {
  if (!(typeof _deskIsTeacher === 'function' && _deskIsTeacher())) return;
  var target = _teacherNudgeUsername(username);
  if (!target) return;
  _teacherNudgeTargetUsername = target;
  var modal = document.getElementById('teacher-nudge-modal');
  if (!modal) return;
  var textEl = document.getElementById('tnm-text');
  if (textEl) textEl.value = '';
  var sendBtn = document.getElementById('tnm-send');
  if (sendBtn) sendBtn.disabled = false;
  var recipientEl = document.getElementById('tnm-recipient');
  if (recipientEl) {
    var label = target;
    try {
      if (typeof DeskRoster !== 'undefined' && DeskRoster.realName) {
        var real = DeskRoster.realName(target);
        if (real) label = real + ' (' + target + ')';
      }
    } catch (_) {}
    recipientEl.textContent = 'To: ' + label;
  }
  _teacherNudgeStatus('', '');
  modal.style.display = 'block';
  setTimeout(function () {
    var ta = document.getElementById('tnm-text');
    if (ta) ta.focus();
  }, 30);
}

function _closeTeacherNudgeModal() {
  var modal = document.getElementById('teacher-nudge-modal');
  if (modal) modal.style.display = 'none';
  _teacherNudgeTargetUsername = '';
}

function _teacherNudgeNotifyRecipients(recipients, nudgeId) {
  try {
    var ws = (typeof DogePresence !== 'undefined' && DogePresence.ws && DogePresence.ws.readyState === 1)
      ? DogePresence.ws
      : null;
    if (!ws && typeof DogePresence !== 'undefined' && typeof DogePresence.connect === 'function') {
      DogePresence.connect();
      ws = (DogePresence.ws && DogePresence.ws.readyState === 1) ? DogePresence.ws : null;
    }
    if (!ws) return false;
    var toUsernames = (Array.isArray(recipients) ? recipients : [])
      .map(_teacherNudgeUsername)
      .filter(Boolean);
    if (toUsernames.length === 0) return false;
    ws.send(JSON.stringify({
      type: 'nudge_notify',
      toUsernames: toUsernames,
      fromUsername: _teacherNudgeCurrentUsername(),
      nudgeId: String(nudgeId || '').slice(0, 128),
    }));
    return true;
  } catch (_) {
    return false;
  }
}

async function _sendTeacherNudgeFromDesk() {
  var textEl = document.getElementById('tnm-text');
  var sendBtn = document.getElementById('tnm-send');
  var text = textEl ? String(textEl.value || '').trim() : '';
  if (!text) {
    _teacherNudgeStatus('Type a message first.', 'is-error');
    return;
  }
  if (text.length > 280) text = text.slice(0, 280);
  var recipient = _teacherNudgeUsername(_teacherNudgeTargetUsername);
  if (!recipient) {
    _teacherNudgeStatus('Choose a student first.', 'is-error');
    return;
  }
  var who = null;
  try {
    who = (window.rosterClient && typeof window.rosterClient.current === 'function')
      ? (window.rosterClient.current() || null)
      : null;
  } catch (_) {}
  var token = _studentNudgeToken();
  var base = window.ROSTER_SERVICE_URL;
  if (!base || !token || !who || who.role !== 'teacher') {
    _teacherNudgeStatus('Teacher sign-in required.', 'is-error');
    return;
  }
  var nudgeId = 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  if (sendBtn) sendBtn.disabled = true;
  _teacherNudgeStatus('Sending...', '');
  try {
    var res = await fetch(base + '/teacher/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ nudgeId: nudgeId, recipientUsernames: [recipient], text: text }),
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j || !j.ok) {
      _teacherNudgeStatus((j && j.error) || ('HTTP ' + res.status), 'is-error');
      if (sendBtn) sendBtn.disabled = false;
      return;
    }
    _teacherNudgeNotifyRecipients([recipient], nudgeId);
    _teacherNudgeStatus('Sent.', 'is-success');
    if (textEl) textEl.value = '';
    setTimeout(_closeTeacherNudgeModal, 350);
  } catch (err) {
    _teacherNudgeStatus('Network error: ' + (err && err.message ? err.message : 'unknown'), 'is-error');
    if (sendBtn) sendBtn.disabled = false;
  }
}

// Wire on DOMContentLoaded. Runs inside try/catch so a missing element never
// throws and disrupts the rest of the DOMContentLoaded chain.
try {
  document.addEventListener('DOMContentLoaded', function () {
    var sendBtn = document.getElementById('sdm-send');
    if (sendBtn) sendBtn.addEventListener('click', _sendStudentDm);
    var cancelBtn = document.getElementById('sdm-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', _closeStudentDmModal);
    // Backdrop click closes.
    document.querySelectorAll('#student-dm-modal [data-sdm-close]')
      .forEach(function (el) { el.addEventListener('click', _closeStudentDmModal); });
    // ESC key closes. Capture phase + stopPropagation so it doesn't conflict
    // with other ESC handlers (P5 override-gate modal, P6 etc.) per the P5/P6 pattern.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = document.getElementById('student-dm-modal');
        if (m && m.style.display === 'block') {
          e.stopPropagation();
          _closeStudentDmModal();
        }
        var t = document.getElementById('teacher-nudge-modal');
        if (t && t.style.display === 'block') {
          e.stopPropagation();
          _closeTeacherNudgeModal();
        }
      }
    }, true);
    var tSend = document.getElementById('tnm-send');
    if (tSend) tSend.addEventListener('click', _sendTeacherNudgeFromDesk);
    var tCancel = document.getElementById('tnm-cancel');
    if (tCancel) tCancel.addEventListener('click', _closeTeacherNudgeModal);
    document.querySelectorAll('#teacher-nudge-modal [data-tnm-close]')
      .forEach(function (el) { el.addEventListener('click', _closeTeacherNudgeModal); });
    _startStudentNudgePolling();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) _pollStudentNudgeHistory(true);
    });
  });
} catch (_) {}

// arrives. Guides the summer self-pacer 1.1 -> onward; during the school year
// lessons open on their dates so the gate only blocks jumping ahead. Teachers
// and not-signed-in visitors bypass. Every function FAILS OPEN — a bug must
// never hard-lock the calendar.
function _deskIsTeacher() {
  // Preview-as-student (PREVIEW_AS_STUDENT_SPEC.md): a teacher can flip a
  // per-tab sessionStorage flag to view the Desk through the student gates.
  // While set, _deskIsTeacher() reports false so every gate (lesson unlock,
  // Do-Now focus, ...) treats the viewer as a student.
  try {
    if (sessionStorage.getItem('apstats_preview_as_student') === '1') return false;
    // P2 (TEACHER_STUDENT_CONSOLE_SPEC.md §7): a teacher in view-as mode is
    // treated as the student for every existing gate (lesson unlock, Do-Now
    // focus, gradebook teacher menu, ...). One sessionStorage write extends
    // every gate-site implicitly -- no per-site change needed.
    if (sessionStorage.getItem('apstats_view_as_context')) return false;
  } catch (_) {}
  try { return localStorage.getItem('apstats_user_role') === 'teacher'; }
  catch (_) { return false; }
}
// Preview-as-student toggle (PREVIEW_AS_STUDENT_SPEC.md). The Teacher-menu
// item flips the per-tab flag _deskIsTeacher() honours, then reloads so every
// gate re-evaluates on load. The flag survives the reload (sessionStorage)
// but auto-clears when the tab closes.
function _previewAsStudentActive() {
  try { return sessionStorage.getItem('apstats_preview_as_student') === '1'; }
  catch (_) { return false; }
}
function _togglePreviewAsStudent() {
  var wasActive = _previewAsStudentActive();
  try {
    if (wasActive) sessionStorage.removeItem('apstats_preview_as_student');
    else sessionStorage.setItem('apstats_preview_as_student', '1');
  } catch (_) { return; }   // flag write blocked -> nothing changed, nothing to undo
  try {
    location.reload();
  } catch (_) {
    // reload failed: roll the flag back so sessionStorage always matches what
    // the (un-reloaded) page is actually rendering -- no stale inconsistent state.
    try {
      if (wasActive) sessionStorage.setItem('apstats_preview_as_student', '1');
      else sessionStorage.removeItem('apstats_preview_as_student');
    } catch (_) {}
  }
}
// Reflect preview mode into the Teacher-menu label + the indicator badge.
// Called on load after the menu DOM exists.
function _renderPreviewAsStudentUI() {
  var active = _previewAsStudentActive();
  var item = document.getElementById('menu-preview-as-student');
  if (item) item.textContent = active
    ? '\u{1F441} Exit student preview'
    : '\u{1F441} Preview as student';
  var badge = document.getElementById('preview-as-student-badge');
  if (badge) badge.style.display = active ? 'flex' : 'none';
}
