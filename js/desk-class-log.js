// Desk "Recording" fold (FABLE_SPRINT_2026_10_22B_SPEC.md track L).
//
// The Class Log phone records each B and E block and posts a lesson summary to
// the ALGEBRA 2 roster-server (one table for both courses, course='apstats' for
// us). This file mounts a teacher-only <details class="desk-classlog"> fold on the
// Desk's day panel and fills it through lib/class-log-summary.js.
//
// Sign-in: the a2 server gates GET /teacher/summaries on an a2 teacher token, so
// the first open shows a small "Class Log sign-in" form (a2 teacher username +
// password -> POST <a2>/roster/verify). A token whose account is role 'teacher' is
// kept in localStorage 'apstats_classlog_token'; a 401/403 on the summaries route
// clears it and shows the form again. The token is never logged or displayed.
//
// Students never see the fold: mount() returns null unless window._deskIsTeacher()
// is true (preview-as-student and view-as both make it false).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DeskClassLog = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var BASE = 'https://a2-live-worksheets-production.up.railway.app';
  var TOKEN_KEY = 'apstats_classlog_token';
  var COURSE = 'apstats';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function isTeacher(win) {
    try { return typeof win._deskIsTeacher === 'function' && win._deskIsTeacher() === true; }
    catch (_) { return false; }
  }

  function readToken(win) {
    try { return win.localStorage.getItem(TOKEN_KEY) || null; } catch (_) { return null; }
  }
  function writeToken(win, token) {
    try {
      if (token) win.localStorage.setItem(TOKEN_KEY, token);
      else win.localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  // The calendar hands the panel "Oct 19" (MN[month] + ' ' + day). Resolve it to
  // YYYY-MM-DD inside the school year (Aug-Jul) that contains `today`. Returns
  // null for anything else (the panel is sometimes opened with '').
  function isoFromDisplay(dateStr, today) {
    var m = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(String(dateStr || '').trim());
    if (!m) return null;
    var month = MONTHS.indexOf(m[1]);
    if (month < 0) return null;
    var now = today || new Date();
    var syStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    var year = month >= 7 ? syStart : syStart + 1;
    var day = Number(m[2]);
    if (day < 1 || day > 31) return null;
    return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  // a2 teacher sign-in. Resolves to the token (already stored); rejects with a
  // message safe to show on the panel.
  function signIn(win, username, password) {
    if (!isTeacher(win)) return Promise.reject(new Error('Teacher sign-in is required'));
    var user = String(username || '').trim();
    if (!user || !password) return Promise.reject(new Error('Username and password are required'));
    return win.fetch(BASE + '/roster/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: password })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; }); })
      .then(function (res) {
        var body = res.body || {};
        if (!body.ok || !body.token) throw new Error(body.error || ('Sign-in failed (HTTP ' + res.status + ')'));
        if (body.role !== 'teacher') throw new Error('That account is not a teacher on the Algebra 2 roster');
        if (!isTeacher(win)) throw new Error('Teacher sign-in is required');
        writeToken(win, body.token);
        return body.token;
      });
  }

  function clearFold(fold) {
    while (fold.lastChild && fold.lastChild !== fold.firstChild) fold.removeChild(fold.lastChild); // keep <summary>
  }

  // The sign-in form inside the fold. `note` is the one line above it; onDone runs
  // after a successful sign-in (the caller re-fills the fold).
  function renderSignIn(win, fold, note, onDone) {
    var doc = win.document;
    clearFold(fold);
    var p = doc.createElement('p'); p.className = 'a2-week-muted'; p.textContent = note; fold.appendChild(p);
    var form = doc.createElement('form'); form.className = 'desk-classlog-signin';
    var user = doc.createElement('input'); user.type = 'text'; user.name = 'username'; user.placeholder = 'Algebra 2 teacher username'; user.autocomplete = 'username';
    var pass = doc.createElement('input'); pass.type = 'password'; pass.name = 'password'; pass.placeholder = 'password'; pass.autocomplete = 'current-password';
    var btn = doc.createElement('button'); btn.type = 'submit'; btn.className = 's7btn'; btn.textContent = 'Sign in';
    var status = doc.createElement('span'); status.className = 'desk-classlog-status'; status.setAttribute('role', 'status');
    form.appendChild(user); form.appendChild(pass); form.appendChild(btn); form.appendChild(status);
    form.onsubmit = function (e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      btn.disabled = true; status.textContent = 'Signing in…';
      return signIn(win, user.value, pass.value)
        .then(function () { pass.value = ''; if (typeof onDone === 'function') onDone(); })
        .catch(function (error) { status.textContent = (error && error.message) || 'Sign-in failed'; })
        .then(function () { btn.disabled = false; });
    };
    fold.appendChild(form);
    return form;
  }

  // Fill (or re-fill) a mounted fold. Resolves when the fold is settled.
  function show(win, fold, isoDate, section) {
    var token = readToken(win);
    if (!token) {
      renderSignIn(win, fold, 'Class Log sign-in (Algebra 2 teacher account)', function () { show(win, fold, isoDate, section); });
      return Promise.resolve({ ok: false, status: 0 });
    }
    var lib = win.ClassLogSummary;
    return lib.fill(win, fold, isoDate, section, { base: BASE, token: token, course: COURSE })
      .then(function (result) {
        if (!result.ok && (result.status === 401 || result.status === 403)) {
          writeToken(win, null);
          renderSignIn(win, fold, 'Class Log sign-in expired — sign in again', function () { show(win, fold, isoDate, section); });
        }
        return result;
      });
  }

  // Append the fold to `host` for one section-day. Returns the <details>, or null
  // when there is nothing to show (not a teacher, no date, no section, lib missing).
  function mount(win, host, isoDate, section) {
    if (!host || !isoDate || !section) return null;
    if (!isTeacher(win) || !win.ClassLogSummary) return null;
    var doc = win.document;
    var fold = doc.createElement('details');
    fold.className = 'desk-classlog';
    fold.open = true;
    var summary = doc.createElement('summary');
    summary.textContent = 'Recording';
    fold.appendChild(summary);
    host.appendChild(fold);
    fold._pending = show(win, fold, isoDate, section);
    return fold;
  }

  return { BASE: BASE, TOKEN_KEY: TOKEN_KEY, COURSE: COURSE, isTeacher: isTeacher, readToken: readToken, writeToken: writeToken,
    isoFromDisplay: isoFromDisplay, signIn: signIn, renderSignIn: renderSignIn, show: show, mount: mount };
});
