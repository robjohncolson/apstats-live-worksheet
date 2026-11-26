// ── Teacher Tools launcher ──────────────────────────────────────────────────
// One window that consolidates the teacher tools (replaced the old flat menu).
// Each tile opens a tool. Roster Console + Dashboard are teacher-secret-gated at
// runtime (the secret lives only in that page's own sessionStorage — never baked
// in), so linking them from this role-gated menu adds no attack surface. The
// in-Desk Class Gradebook tile was dropped — it duplicated the Dashboard's class
// grid. Verify keeps BOTH paths: scan (openVerifyQR → teacher-verify) and paste
// (cr verify.html). Ordered enroll-first (the most common teacher task).
// One-click teacher backup straight from the Desk: pull the signed grade snapshot
// using the teacher's OWN session token (requireTeacher accepts a teacher-role
// Bearer — no x-teacher-secret typing), save grade-backup-<date>.json, and verify it.
// Full download/verify/restore UI lives on the Gradebook Dashboard. See
// GRADE_LEDGER_DURABILITY_SPEC.md.
async function _downloadGradeBackup() {
    if (!window.rosterClient || typeof window.rosterClient.token !== 'function') { alert('Sign in as a teacher first.'); return; }
    var token = window.rosterClient.token();
    var base = window.ROSTER_SERVICE_URL;
    if (!token || !base) { alert('No roster connection — sign in as a teacher first.'); return; }
    var snap;
    try {
        var res = await fetch(base + '/admin/snapshot', { headers: { Authorization: 'Bearer ' + token } });
        if (res.status !== 200) { alert('Backup failed (HTTP ' + res.status + '). Make sure you are signed in as a teacher.'); return; }
        snap = await res.json();
    } catch (e) { alert('Backup failed: ' + ((e && e.message) || e)); return; }
    var date = (snap && snap.asOfDateNY) || new Date().toISOString().slice(0, 10);
    try {
        var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'grade-backup-' + date + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { alert('Could not save the file: ' + ((e && e.message) || e)); return; }
    var note = 'Saved grade-backup-' + date + '.json';
    try {
        var v = await fetch(base + '/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(snap) });
        var vd = await v.json();
        if (vd && vd.ok && vd.report) {
            var t = vd.report.totals || {};
            note += '\n\n' + (vd.report.ok ? '✓ VERIFIED' : '✗ ' + (vd.report.breaks ? vd.report.breaks.length : '?') + ' break(s)') +
                ' — ' + (t.students || 0) + ' students, ' + (t.records || 0) + ' records, anchor ' + (vd.report.epochOk ? 'OK' : 'BROKEN');
        }
    } catch (_) { /* verify is best-effort */ }
    alert(note);
}

// The teacher workspace stays inside the Desk and shares its signed-in session.
var _teacherWorkspaceFocus = null;
function openTeacherTools(view) {
    if (typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()) return;
    var overlay = document.getElementById('app-teachertools-overlay');
    if (!overlay) return;
    _teacherWorkspaceFocus = document.activeElement;
    var host = document.getElementById('teachertools-content');
    _paintTeacherTools(host, view);
    overlay.style.display = 'block';
    var win = overlay.querySelector('.app-window');
    win.style.cssText = 'width:calc(100vw - 32px);max-width:1480px;height:calc(100vh - 72px);left:50%;top:50%;transform:translate(-50%,-50%)';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Teacher workspace');
    win.setAttribute('aria-modal', 'true');
    host.querySelector('iframe').focus();
    try { if (typeof bumpUsage === 'function') bumpUsage('teachertools'); } catch (_) {}
}
function destroyTeacherTools() {
    var overlay = document.getElementById('app-teachertools-overlay');
    if (overlay) overlay.style.display = 'none';
    // Stop dashboard polls and remove rendered passwords when the workspace closes.
    var host = document.getElementById('teachertools-content');
    if (host) host.textContent = '';
    if (_teacherWorkspaceFocus && _teacherWorkspaceFocus.isConnected) _teacherWorkspaceFocus.focus();
}
function _paintTeacherTools(host, view) {
    host.textContent = '';
    host.style.cssText = 'padding:0;display:block;overflow:hidden;height:calc(100% - 24px)';
    var frame = document.createElement('iframe');
    frame.title = 'Teacher workspace';
    // teacher-workspace.js selectView() owns the tab list and falls back to 'class' itself.
    frame.src = 'teacher-dashboard.html?workspace=1&view=' + encodeURIComponent(String(view || 'class'));
    frame.style.cssText = 'display:block;border:0;width:100%;height:100%;background:#e5e3d2';
    host.appendChild(frame);
}
window.addEventListener('message', function (event) {
    var frame = document.querySelector('#teachertools-content iframe');
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'teacher-workspace') return;
    if (event.data.action === 'close') { destroyTeacherTools(); return; }
    if (!_deskIsTeacher()) return;
    if (event.data.action === 'scan') { destroyTeacherTools(); openVerifyQR(); }
    if (event.data.action === 'checkin') { destroyTeacherTools(); openGradeCheckin(); }
});

// ═══ School bulletin (data/bulletin.json) ═══════════════════════════════════════
// Weekly school notices. Updating them is a data edit only — no Desk code change.
// The JSON is a PUBLIC file; the teacher gate below is a display filter, not secrecy.
var BULLETIN_LOOKAHEAD_DAYS = 21;
var BULLETIN_SOON_DAYS = 3;
var _bulletinItems = null;

function _bulletinISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _bulletinDaysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
}

// Pure: which items show today, in display order. Dated items first (soonest first),
// standing reminders last. Staff items only when isTeacher.
function _bulletinVisible(items, todayISO, isTeacher) {
  var visible = (items || []).filter(function (item) {
    if (!item || !item.id || !item.title) return false;
    if (item.audience === 'teacher' && !isTeacher) return false;
    var lastDay = item.until || item.date;
    if (!lastDay || todayISO > lastDay) return false;
    if (item.showFrom) return todayISO >= item.showFrom;
    if (!item.date) return true;
    return _bulletinDaysBetween(todayISO, item.date) <= BULLETIN_LOOKAHEAD_DAYS;
  });
  return visible.sort(function (a, b) {
    if (!a.date !== !b.date) return a.date ? -1 : 1;
    return String(a.date || '').localeCompare(String(b.date || '')) || a.id.localeCompare(b.id);
  });
}

function _bulletinWhenLabel(item, todayISO) {
  if (!item.date) return 'Reminder';
  var days = _bulletinDaysBetween(todayISO, item.date);
  if (days <= 0 && todayISO <= (item.until || item.date)) return 'Today';
  if (days === 1) return 'Tomorrow';
  var parts = item.date.split('-');
  var day = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()] + ' ' + (+parts[1]) + '/' + (+parts[2]);
}

// Renders the window body (whenever it is open or not — cheap) and the icon badge.
// The badge counts notices within BULLETIN_SOON_DAYS; the window lists everything
// current. Nothing auto-opens: the bulletin is its own app now (teacher 2026-09-22).
function _renderBulletin() {
  var list = document.getElementById('school-bulletin-list');
  var summary = document.getElementById('school-bulletin-summary');
  if (!list || !summary) return;
  var isTeacher = (typeof _deskIsTeacher === 'function') ? _deskIsTeacher() : false;
  var todayISO = _bulletinISO(_gradeCheckinToday());
  var items = _bulletinVisible(_bulletinItems, todayISO, isTeacher);
  list.textContent = '';
  var soonCount = 0;
  items.forEach(function (item) {
    var soon = !!item.date && _bulletinDaysBetween(todayISO, item.date) <= BULLETIN_SOON_DAYS;
    if (soon) soonCount++;
    var li = document.createElement('li');
    if (soon) li.className = 'sb-soon';
    var when = document.createElement('span');
    when.className = 'sb-when';
    when.textContent = _bulletinWhenLabel(item, todayISO);
    li.appendChild(when);
    if (item.audience === 'teacher') {
      var tag = document.createElement('span');
      tag.className = 'sb-staff';
      tag.textContent = 'staff';
      li.appendChild(tag);
    }
    li.appendChild(document.createTextNode(item.title));
    if (item.detail) {
      var detail = document.createElement('span');
      detail.className = 'sb-detail';
      detail.textContent = item.detail;
      li.appendChild(detail);
    }
    list.appendChild(li);
  });
  if (!items.length) {
    summary.textContent = _bulletinItems === null ? 'Loading school notices\u2026' : 'No school notices right now.';
  } else {
    summary.textContent = '\ud83d\udccc ' + items.length + (items.length === 1 ? ' notice' : ' notices') +
      (soonCount ? ' \u2014 ' + soonCount + ' in the next ' + BULLETIN_SOON_DAYS + ' days' : '');
  }
  _updateBulletinBadge(soonCount);
}

function _updateBulletinBadge(soonCount) {
  try {
    var icon = document.querySelector('.app-icon[data-app="bulletin"]');
    if (!icon) return;
    var img = icon.querySelector('.icon-img');
    var badge = img ? img.querySelector('.bulletin-soon-badge') : null;
    if (!soonCount) {
      if (badge) badge.remove();
      icon.removeAttribute('title');
      return;
    }
    if (!badge) { badge = document.createElement('span'); badge.className = 'bulletin-soon-badge'; img.appendChild(badge); }
    badge.textContent = String(soonCount);
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', soonCount + (soonCount === 1 ? ' school notice' : ' school notices') + ' in the next ' + BULLETIN_SOON_DAYS + ' days');
    icon.title = badge.getAttribute('aria-label') + ' \u2014 open the Bulletin';
  } catch (_) {}
}

function openBulletin() {
  try { if (typeof bumpUsage === 'function') bumpUsage('bulletin'); } catch (_) {}
  try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('wildEep', 0.5); } catch (_) {}
  var overlay = document.getElementById('app-bulletin-overlay');
  if (!overlay) return;
  var win = overlay.querySelector('.app-window');
  if (win) {
    win.style.left = '50%'; win.style.top = '50%';
    win.style.transform = 'translate(-50%, -50%)';
    win.classList.remove('maximized');
  }
  overlay.style.display = 'block';
  _renderBulletin();
  if (_bulletinItems === null) _loadBulletin();
}

function destroyBulletin() {
  try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3); } catch (_) {}
  var overlay = document.getElementById('app-bulletin-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _loadBulletin() {
  // A weekly edit must show up without a hard refresh: no-store here, and sw.js
  // passes this path straight to the network instead of its cache-first asset rule.
  fetch('data/bulletin.json', { cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (data) {
      _bulletinItems = (data && Array.isArray(data.items)) ? data.items : [];
      _renderBulletin();
    })
    .catch(function () { _bulletinItems = []; _renderBulletin(); });
}

// ── Grade Check-in (DESK_GRADE_CHECKIN_SPEC.md) ──────────────────────────────
// A teacher-only, browser-local monthly reminder to run the private grade-
// trajectory monitor that lives in the sibling Lesson_planning workspace. NO
// server, migration, grade/ledger/roster, or student-progress touch. Every open/
// mutate entry point self-gates on _deskIsTeacher(), which already reports false
// for students, signed-out visitors, view-as, and Preview-as-student — so those
// states can never see or activate the feature. Stored state is limited to the
// versioned key below: period keys, completion timestamps, and snooze dates. No
// private policy value, report data, student field, or absolute path is stored.
var _GRADE_CHECKIN_KEY = 'apstats_teacher_grade_checkin_v1';
var _GRADE_CHECKIN_CMD = 'node grade-monitor\\run.mjs';
var _GC_MS_DAY = 86400000;
var _GC_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

// "Today" at LOCAL midnight, honoring the Desk's apstats_desk_today_override so
// tests are deterministic. A YYYY-MM-DD override is parsed as a LOCAL date (never
// UTC-sliced), per the spec's "use local calendar dates" rule.
function _gradeCheckinToday() {
  var override = null;
  try { override = localStorage.getItem('apstats_desk_today_override'); } catch (_) {}
  if (override) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(override).trim());
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var p = new Date(override);
    if (!isNaN(p.getTime())) return new Date(p.getFullYear(), p.getMonth(), p.getDate());
  }
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function _gcMidnight(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function _gcISO(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
// Whole LOCAL days from a to b (b - a); positive = b is in the future.
function _gcDaysBetween(a, b) {
  return Math.round((_gcMidnight(b).getTime() - _gcMidnight(a).getTime()) / _GC_MS_DAY);
}
// A generated schedule row [y, monthIndex, day, cellB, cellE] is instructional
// when at least one period cell is a real lesson/review object (from d()), not a
// string sentinel (NC/OFF/EX/PO). generateSchedule already caps instructional
// rows before the exam, so the final monthly period naturally stops before it.
function _gcIsInstructional(row) {
  if (!row || row.length < 5) return false;
  return (row[3] && typeof row[3] === 'object') || (row[4] && typeof row[4] === 'object');
}

// Ordered check-in periods for the active school year. Preseason = the final
// eligible weekday before def.range.start; one monthly period per calendar month
// that has instructional days, due on that month's final instructional day.
// Reads globals (cYear / SCHEDULE_DEFS / S) by default; tests inject via opts.
function _gradeCheckinPeriods(opts) {
  opts = opts || {};
  var yearKey = opts.yearKey || (typeof cYear !== 'undefined' ? cYear : null);
  var def = opts.def || ((typeof SCHEDULE_DEFS !== 'undefined' && yearKey) ? SCHEDULE_DEFS[yearKey] : null);
  var sched = opts.S || (typeof S !== 'undefined' ? S : null);
  if (!yearKey || !def || !def.range || !def.range.start || !Array.isArray(sched) || !sched.length) return [];
  var periods = [];
  // Preseason: step back from range.start to the previous weekday (Mon–Fri).
  try {
    var start = new Date(def.range.start[0], def.range.start[1], def.range.start[2]);
    var pre = new Date(start.getTime() - _GC_MS_DAY);
    var guard = 0;
    while ((pre.getDay() === 0 || pre.getDay() === 6) && guard++ < 14) {
      pre = new Date(pre.getTime() - _GC_MS_DAY);
    }
    periods.push({ key: yearKey + ':preseason', kind: 'preseason', label: 'Preseason', due: _gcMidnight(pre), dueISO: _gcISO(pre) });
  } catch (_) {}
  // Monthly: final instructional day per (year, monthIndex).
  var lastByMonth = {};
  for (var i = 0; i < sched.length; i++) {
    var row = sched[i];
    if (!_gcIsInstructional(row)) continue;
    var mk = row[0] + '-' + row[1];
    var prev = lastByMonth[mk];
    if (!prev || row[2] > prev[2]) lastByMonth[mk] = row;
  }
  Object.keys(lastByMonth).forEach(function (mk) {
    var r = lastByMonth[mk];
    var due = new Date(r[0], r[1], r[2]);
    var mm = String(r[1] + 1).padStart(2, '0');
    periods.push({
      key: yearKey + ':' + r[0] + '-' + mm,
      kind: 'monthly',
      label: _GC_MONTHS[r[1]] + ' ' + r[0],
      due: _gcMidnight(due),
      dueISO: _gcISO(due),
    });
  });
  periods.sort(function (a, b) { return a.due.getTime() - b.due.getTime(); });
  return periods;
}

// Keep only STRING-valued entries of a plain object (never an array). Rejects
// completed[key]=true, arrays, and nested objects that would otherwise read as
// truthy and silently fabricate a "reviewed" state (spec §5: err toward showing
// a reminder, never inventing completion).
function _gcCleanMap(m, validVal) {
  var out = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  Object.keys(m).forEach(function (k) {
    var v = m[k];
    if (typeof v === 'string' && validVal(v)) out[k] = v;
  });
  return out;
}
// A completion timestamp must be a CANONICAL ISO datetime that round-trips
// exactly (rejects "banana", date-only strings, and trailing junk).
function _gcValidTimestamp(v) {
  try { return new Date(v).toISOString() === v; } catch (_) { return false; }
}
// A snooze date must be an EXACT YYYY-MM-DD that is also a real calendar date
// (rejects "2099-12-31junk" via the anchors and "2026-02-30" via round-trip).
function _gcValidDateOnly(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  var p = v.split('-');
  var dt = new Date(+p[0], +p[1] - 1, +p[2]);
  return dt.getFullYear() === +p[0] && dt.getMonth() === +p[1] - 1 && dt.getDate() === +p[2];
}
// Defensive load: malformed / unavailable storage returns the empty default,
// which errs toward SHOWING a due reminder rather than fabricating completion.
function _gradeCheckinLoad() {
  var base = { v: 1, completed: {}, snoozedUntil: {} };
  var raw = null;
  try { raw = localStorage.getItem(_GRADE_CHECKIN_KEY); } catch (_) { return base; }
  if (!raw) return base;
  try {
    var o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return base;
    base.completed = _gcCleanMap(o.completed, _gcValidTimestamp);        // canonical ISO datetime
    base.snoozedUntil = _gcCleanMap(o.snoozedUntil, _gcValidDateOnly);   // exact, real YYYY-MM-DD
  } catch (_) { return base; }
  return base;
}
function _gradeCheckinSave(state) {
  try {
    localStorage.setItem(_GRADE_CHECKIN_KEY, JSON.stringify({
      v: 1,
      completed: (state && state.completed) || {},
      snoozedUntil: (state && state.snoozedUntil) || {},
    }));
    return true;
  } catch (_) { return false; }
}

// The reminder state machine. Surfaces the OLDEST incomplete, not-currently-
// snoozed period whose window has opened (due within 7 days or overdue), plus how
// many are outstanding. Snoozed periods hide until their snooze date but are never
// marked complete; overdue periods persist until reviewed or snoozed.
function _gradeCheckinStatus(opts) {
  opts = opts || {};
  var today = opts.today || _gradeCheckinToday();
  var periods = opts.periods || _gradeCheckinPeriods(opts);
  var state = opts.state || _gradeCheckinLoad();
  var completed = state.completed || {};
  var snoozed = state.snoozedUntil || {};
  var out = {
    period: null, kind: null, state: 'none', label: null, dueISO: null,
    daysUntil: null, outstandingCount: 0, outstandingKeys: [], pendingKeys: [],
    last: null, next: null, ready: periods.length > 0,
  };
  if (!periods.length) return out;

  function isSnoozed(p) {
    var s = snoozed[p.key];
    if (!s) return false;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return false;
    var until = new Date(+m[1], +m[2] - 1, +m[3]);   // suppressed THROUGH this date
    return _gcMidnight(today).getTime() <= until.getTime();
  }

  var done = periods.filter(function (p) { return !!completed[p.key]; });
  if (done.length) {
    var lastP = done[done.length - 1];   // periods are due-sorted → latest-due completed
    out.last = { key: lastP.key, label: lastP.label, dueISO: lastP.dueISO };
  }

  var actionable = periods.filter(function (p) {
    if (completed[p.key]) return false;
    if (isSnoozed(p)) return false;
    return _gcDaysBetween(today, p.due) <= 7;   // due within a week, or overdue
  });
  out.outstandingCount = actionable.length;
  out.outstandingKeys = actionable.map(function (p) { return p.key; });
  // Every incomplete period whose window is open (due within 7 days or overdue),
  // INCLUDING ones already snoozed. This is what "Snooze" must re-quiet so a
  // second snooze extends ALL of them, not just the surfaced (oldest) period.
  out.pendingKeys = periods.filter(function (p) {
    return !completed[p.key] && _gcDaysBetween(today, p.due) <= 7;
  }).map(function (p) { return p.key; });

  var current = actionable.length ? actionable[0] : null;
  if (!current) {
    // A snoozed-but-incomplete period whose window is open keeps a first-class
    // 'snoozed' state: the banner/badge stay hidden (only due-soon/due/overdue are
    // "live"), but the overlay still shows it accurately and keeps Mark Reviewed /
    // Snooze reachable — otherwise it would falsely read "All reviewed".
    var snoozedOpen = periods.filter(function (p) {
      return !completed[p.key] && isSnoozed(p) && _gcDaysBetween(today, p.due) <= 7;
    });
    if (snoozedOpen.length) {
      var sp = snoozedOpen[0];
      out.period = sp.key; out.kind = sp.kind; out.label = sp.label; out.dueISO = sp.dueISO;
      out.daysUntil = _gcDaysBetween(today, sp.due); out.state = 'snoozed';
      var sidx = periods.indexOf(sp);
      for (var q = sidx + 1; q < periods.length; q++) {
        if (!completed[periods[q].key]) { out.next = { key: periods[q].key, label: periods[q].label, dueISO: periods[q].dueISO }; break; }
      }
      return out;
    }
    var upcoming = periods.filter(function (p) { return !completed[p.key] && _gcDaysBetween(today, p.due) > 7; });
    if (upcoming.length) {
      var u = upcoming[0];
      out.period = u.key; out.kind = u.kind; out.label = u.label; out.dueISO = u.dueISO;
      out.daysUntil = _gcDaysBetween(today, u.due); out.state = 'upcoming';
      out.next = { key: u.key, label: u.label, dueISO: u.dueISO };
    } else {
      out.state = 'reviewed';   // every period is complete (or snoozed away)
    }
    return out;
  }
  var du = _gcDaysBetween(today, current.due);
  out.period = current.key; out.kind = current.kind; out.label = current.label; out.dueISO = current.dueISO;
  out.daysUntil = du;
  out.state = du < 0 ? 'overdue' : du === 0 ? 'due' : 'due-soon';
  var idx = periods.indexOf(current);
  for (var k = idx + 1; k < periods.length; k++) {
    if (!completed[periods[k].key]) { out.next = { key: periods[k].key, label: periods[k].label, dueISO: periods[k].dueISO }; break; }
  }
  return out;
}

// Render (teacher) or clear (everyone else) the menu badge + roadmap banner. Safe
// to call before loadYear() populates S — then status.ready is false and both
// surfaces stay hidden until loadYear() re-invokes this.
function _renderGradeCheckinUI() {
  var banner = document.getElementById('grade-checkin-banner');
  var badge = document.getElementById('menu-gradecheckin-badge');
  var item = document.getElementById('menu-gradecheckin-item');
  var isT = (typeof _deskIsTeacher === 'function') ? _deskIsTeacher() : false;
  if (!isT) {
    // Invisible for students, signed-out, view-as, and Preview-as-student — even
    // though the Teacher menu container itself may stay open (preview keeps it so
    // the teacher can exit): hide the menu ITEM too, not just the banner/badge.
    if (banner) { banner.hidden = true; banner.removeAttribute('data-state'); }
    if (badge) badge.hidden = true;
    if (item) item.style.display = 'none';
    // Also close an already-open window if the role drops mid-session (cross-tab
    // sign-out / entering preview) — otherwise the teacher window stays on screen.
    var ov = document.getElementById('app-gradecheckin-overlay');
    if (ov) ov.style.display = 'none';
    return;
  }
  if (item) item.style.display = '';
  var st = null;
  try { st = _gradeCheckinStatus(); } catch (_) { st = null; }
  if (!st || !st.ready) {
    if (banner) { banner.hidden = true; banner.removeAttribute('data-state'); }
    if (badge) badge.hidden = true;
    return;
  }
  var live = (st.state === 'due-soon' || st.state === 'due' || st.state === 'overdue');
  if (badge) {
    if (live && st.outstandingCount > 0) { badge.textContent = String(st.outstandingCount); badge.hidden = false; }
    else badge.hidden = true;
  }
  if (banner) {
    if (!live) { banner.hidden = true; banner.removeAttribute('data-state'); }
    else {
      banner.setAttribute('data-state', st.state === 'overdue' ? 'overdue' : 'due');
      var lead = st.state === 'overdue' ? 'Grade check-in overdue'
               : st.state === 'due' ? 'Grade check-in due today'
               : 'Grade check-in due soon';
      var extra = st.outstandingCount > 1 ? ' (' + st.outstandingCount + ' outstanding)' : '';
      var lbl = document.getElementById('grade-checkin-banner-label');
      if (lbl) lbl.textContent = '📈 ' + lead + (st.label ? ' — ' + st.label : '') + extra;
      banner.hidden = false;
    }
  }
}

function openGradeCheckin() {
  if (typeof _deskIsTeacher === 'function' && !_deskIsTeacher()) return;
  var overlay = document.getElementById('app-gradecheckin-overlay');
  if (!overlay) return;
  var host = document.getElementById('gradecheckin-content');
  if (host) _paintGradeCheckin(host);
  var win = overlay.querySelector('.app-window');
  if (win) { win.style.left = '50%'; win.style.top = '50%'; win.style.transform = 'translate(-50%, -50%)'; win.classList.remove('maximized'); }
  overlay.style.display = 'block';
  // Deliberately no icon-usage tracking here: that writes ap-roadmap-icon-usage,
  // and this feature's storage boundary (spec §5) is the single
  // apstats_teacher_grade_checkin_v1 key.
  try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('wildEep', 0.5); } catch (_) {}
}
function closeGradeCheckin() {
  try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3); } catch (_) {}
  var overlay = document.getElementById('app-gradecheckin-overlay');
  if (overlay) overlay.style.display = 'none';
}
function _gcEsc(s) {
  return (typeof _deskEsc === 'function') ? _deskEsc(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
}
function _paintGradeCheckin(host) {
  host.innerHTML = '';
  var st = null;
  try { st = _gradeCheckinStatus(); } catch (_) { st = null; }
  var stateLabels = { 'upcoming': 'Upcoming', 'due-soon': 'Due soon', 'due': 'Due today', 'overdue': 'Overdue', 'snoozed': 'Snoozed', 'reviewed': 'All reviewed', 'none': '—' };

  var wrap = document.createElement('div');
  wrap.className = 'geneva';
  wrap.style.cssText = 'font-size:12px;line-height:1.5;max-width:420px';

  var head = document.createElement('div');
  head.className = 'chicago';
  head.style.cssText = 'font-size:14px;margin-bottom:8px';
  head.textContent = 'Monthly grade-trajectory check-in';
  wrap.appendChild(head);

  var status = document.createElement('div');
  status.style.cssText = 'margin-bottom:10px;padding:6px 8px;border:1px solid #000;background:#f4f4f4';
  var sTxt = (st && st.state) ? (stateLabels[st.state] || st.state) : '—';
  if (st && st.label && st.state !== 'reviewed') sTxt += ' · ' + st.label;
  if (st && st.dueISO && st.state !== 'reviewed') sTxt += ' · due ' + st.dueISO;
  status.textContent = sTxt;
  wrap.appendChild(status);

  var meta = document.createElement('div');
  meta.style.cssText = 'font-size:11px;color:#555;margin-bottom:10px';
  meta.innerHTML = 'Last completed: ' + _gcEsc(st && st.last ? st.last.label : '—')
    + '<br>Next scheduled: ' + _gcEsc(st && st.next ? (st.next.label + ' (' + st.next.dueISO + ')') : '—');
  wrap.appendChild(meta);

  var listHead = document.createElement('div');
  listHead.style.cssText = 'font-weight:bold;margin-bottom:4px';
  listHead.textContent = 'Each check-in:';
  wrap.appendChild(listHead);
  var ol = document.createElement('ol');
  ol.style.cssText = 'margin:0 0 12px 18px;padding:0;font-size:11px;line-height:1.5';
  ['Confirm the latest backup verifies.',
   'Run the grade-trajectory monitor from the Lesson_planning workspace.',
   'Compare observed participation / feeders against the simulation assumptions.',
   'Record "no change", or make a separately reviewed private-config change.'
  ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
  wrap.appendChild(ol);

  var cmdRow = document.createElement('div');
  cmdRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap';
  var code = document.createElement('code');
  code.style.cssText = 'background:#eee;border:1px solid #ccc;padding:2px 5px;font-size:11px';
  code.textContent = _GRADE_CHECKIN_CMD;
  var cmdNote = document.createElement('span');
  cmdNote.style.cssText = 'font-size:10px;color:#666';
  cmdNote.textContent = 'run from the Lesson_planning workspace';
  cmdRow.appendChild(code); cmdRow.appendChild(cmdNote);
  wrap.appendChild(cmdRow);

  var btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:4px';
  function mkBtn(label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 's7btn';
    b.style.cssText = 'font-size:11px;padding:3px 10px';
    b.textContent = label; b.onclick = fn; return b;
  }
  btns.appendChild(mkBtn('Copy Run Command', function () { _gradeCheckinCopyCommand(this); }));
  btns.appendChild(mkBtn('Download Backup', function () { try { if (typeof _downloadGradeBackup === 'function') _downloadGradeBackup(); } catch (_) {} }));
  if (st && (st.state === 'due-soon' || st.state === 'due' || st.state === 'overdue' || st.state === 'snoozed')) {
    btns.appendChild(mkBtn('Snooze 3 Days', function () { _gradeCheckinSnooze(); }));
    btns.appendChild(mkBtn('Mark Reviewed', function () { _gradeCheckinMarkReviewed(); }));
  }
  wrap.appendChild(btns);

  var note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:#888;margin-top:10px;border-top:1px solid #ccc;padding-top:6px';
  note.textContent = 'Reviewed status is saved in this browser only — another device may remind again. Download Backup makes a fresh manual backup; it does not update the nightly backup the monitor reads.';
  wrap.appendChild(note);

  host.appendChild(wrap);
}

function _gradeCheckinMarkReviewed() {
  if (typeof _deskIsTeacher === 'function' && !_deskIsTeacher()) return;
  var st = null;
  try { st = _gradeCheckinStatus(); } catch (_) { return; }
  if (!st || !st.period) return;
  var state = _gradeCheckinLoad();
  state.completed[st.period] = new Date().toISOString();
  if (state.snoozedUntil) delete state.snoozedUntil[st.period];   // completion clears any snooze
  _gradeCheckinSave(state);
  try { _renderGradeCheckinUI(); } catch (_) {}
  var host = document.getElementById('gradecheckin-content');
  if (host) _paintGradeCheckin(host);
}
function _gradeCheckinSnooze() {
  if (typeof _deskIsTeacher === 'function' && !_deskIsTeacher()) return;
  var st = null;
  try { st = _gradeCheckinStatus(); } catch (_) { return; }
  if (!st || !st.period) return;
  // Calendar-field arithmetic (not +72h of ms) so the +3 days is DST-safe: a
  // fixed-ms add lands one day short across the Nov fall-back (a 25-hour day).
  var t = _gradeCheckinToday();
  var until = _gcISO(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 3));
  // "Snooze 3 Days" quiets the banner, so snooze EVERY open incomplete period —
  // including ones already snoozed — so a re-snooze extends them all, not just the
  // surfaced one. (pendingKeys is snooze-independent; outstandingKeys is not.)
  var keys = (st.pendingKeys && st.pendingKeys.length) ? st.pendingKeys : [st.period];
  var state = _gradeCheckinLoad();
  keys.forEach(function (k) { if (k) state.snoozedUntil[k] = until; });
  _gradeCheckinSave(state);
  try { _renderGradeCheckinUI(); } catch (_) {}
  var host = document.getElementById('gradecheckin-content');
  if (host) _paintGradeCheckin(host);
}
function _gradeCheckinCopyCommand(btn) {
  if (typeof _deskIsTeacher === 'function' && !_deskIsTeacher()) return;   // §6: gate every entry point
  var cmd = _GRADE_CHECKIN_CMD;
  // Feedback = flash the button to "✓ Copied" (the Desk copy-button idiom); no
  // dependency on a toast helper. Only fires on a REAL copy, never on failure.
  function flash() {
    if (!btn) return;
    var prev = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(function () { try { btn.textContent = prev; } catch (_) {} }, 1500);
  }
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = cmd; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      if (ok) flash();
    } catch (_) {}
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // Tie feedback + fallback to the promise: a rejection (e.g. document not
      // focused) must NOT flash success and must still reach the fallback.
      navigator.clipboard.writeText(cmd).then(flash, fallback);
      return;
    }
  } catch (_) {}
  fallback();
}

// ── Roster token helper (used by Class Snapshot and Teacher Inbox) ──
function _reviewCfg() {
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    return { token: token, base: window.ROSTER_SERVICE_URL };
}

// ── TEACHER INBOX desktop icon (TEACHER_INBOX_ICON_SPEC.md, teacher 2026-09-25) ──
// Teacher-only. Polls the workspace's own inbox endpoint and counts messages newer
// than the workspace's unfiltered "Mark read" marker (localStorage
// tsc-inbox-seen-at:all, same origin) — the view the icon opens, so the badge and
// the workspace's "N new" agree. Read-only: the Desk never writes that marker and
// never marks anything read. Every function below is safe before sign-in and
// never throws.
var TEACHER_INBOX_POLL_MS = 60000;
var TEACHER_INBOX_SEEN_KEY = 'tsc-inbox-seen-at:all';
var _teacherInboxState = { newMessages: 0, unavailable: false, halted: null };
var _teacherInboxRequest = 0;

function _teacherInboxSeenAt() {
    try { return localStorage.getItem(TEACHER_INBOX_SEEN_KEY) || null; } catch (_) { return null; }
}

function _teacherInboxCountNew(messages, seenAt) {
    if (!Array.isArray(messages)) return 0;
    var n = 0;
    for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (!m || !m.createdAt) continue;
        if (!seenAt || String(m.createdAt) > seenAt) n++;
    }
    return n;
}

function _teacherInboxRefreshVisibility() {
    try {
        var icon = document.querySelector('.app-icon[data-app="teacherinbox"]');
        if (!icon) return;
        var show = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
        var was = icon.style.display !== 'none';
        icon.style.display = show ? '' : 'none';
        if (was !== show && typeof window._arrangeDesktopIcons === 'function') window._arrangeDesktopIcons();
        if (!show) {
            // View-as / preview / signed out: no stale count in the Teacher menu either.
            var badge = document.getElementById('menu-teacher-inbox-badge');
            if (badge) badge.hidden = true;
            return;
        }
        _teacherInboxState.halted = null;   // a sign-in or role refresh earns a fresh try
        _teacherInboxPaint();
    } catch (_) {}
}

function _teacherInboxTitle() {
    var st = _teacherInboxState;
    if (st.halted === 'signin') return 'Teacher Inbox — sign in as a teacher to see messages';
    if (st.halted === '503') return 'Teacher Inbox — student messages are not turned on';
    if (st.unavailable) return 'Teacher Inbox — inbox unavailable, open to retry';
    if (!st.newMessages) return 'Teacher Inbox — no new student messages';
    return st.newMessages + ' new student message' + (st.newMessages === 1 ? '' : 's') + ' — open Teacher Inbox';
}

function _teacherInboxPaint() {
    try {
        var count = _teacherInboxState.newMessages;
        var title = _teacherInboxTitle();
        var label = count > 99 ? '99+' : String(count);
        var icon = document.querySelector('.app-icon[data-app="teacherinbox"]');
        if (icon) {
            icon.title = title;
            var img = icon.querySelector('.icon-img');
            var badge = img ? img.querySelector('.teacher-inbox-badge') : null;
            if (!count) {
                if (badge) badge.remove();
            } else if (img) {
                if (!badge) { badge = document.createElement('span'); badge.className = 'teacher-inbox-badge'; img.appendChild(badge); }
                badge.textContent = label;
                badge.setAttribute('role', 'status');
                badge.setAttribute('aria-label', title);
            }
        }
        var menuBadge = document.getElementById('menu-teacher-inbox-badge');
        if (menuBadge) { menuBadge.textContent = label; menuBadge.hidden = !count; }
    } catch (_) {}
}

async function _teacherInboxFetch() {
    var cfg = (typeof _reviewCfg === 'function') ? _reviewCfg() : { token: null, base: null };
    if (!cfg.token || !cfg.base) return { error: 'signin' };
    // since= lets the server return only what is newer than the marker, so the count is
    // exact (not capped by limit) and stale message bodies never travel.
    var seenAt = _teacherInboxSeenAt();
    var url = cfg.base + '/teacher/nudge-inbox?limit=200' + (seenAt ? '&since=' + encodeURIComponent(seenAt) : '');
    try {
        var res = await fetch(url, { headers: { Authorization: 'Bearer ' + cfg.token } });
        if (res.status === 401) return { error: 'signin' };
        if (res.status === 503) return { error: '503' };
        if (res.status !== 200) return { error: 'http' + res.status };
        return await res.json();
    } catch (_) { return { error: 'network' }; }
}

async function _teacherInboxTick() {
    try {
        if (typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (_teacherInboxState.halted) return;   // 401/503: wait for a sign-in or an explicit open
        var request = ++_teacherInboxRequest;
        var data = await _teacherInboxFetch();
        if (request !== _teacherInboxRequest) return;   // a newer poll already landed
        if (!data || data.error) {
            // Keep the last known count; say why the inbox couldn't be read.
            _teacherInboxState.unavailable = true;
            if (data && (data.error === 'signin' || data.error === '503')) _teacherInboxState.halted = data.error;
            _teacherInboxPaint();
            return;
        }
        _teacherInboxState.unavailable = false;
        _teacherInboxState.newMessages = _teacherInboxCountNew(data.messages, _teacherInboxSeenAt());
        _teacherInboxPaint();
    } catch (_) {}
}

// "Mark read" in the workspace (same origin, incl. the in-Desk iframe) fires a storage
// event here: re-poll at once so the badge follows the new marker.
function _teacherInboxOnStorage(event) {
    try {
        if (!event || event.key !== TEACHER_INBOX_SEEN_KEY) return;
        _teacherInboxTick();
    } catch (_) {}
}

function openTeacherInbox() {
    try {
        if (typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()) return;
        if (typeof openTeacherTools !== 'function') return;
        openTeacherTools(_teacherInboxState.newMessages > 0 ? 'messages' : 'attention');
        _teacherInboxState.halted = null;   // an explicit open is the retry after 401/503
    } catch (_) {}
}

try {
    window.addEventListener('storage', _teacherInboxOnStorage);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) _teacherInboxTick(); });
    setInterval(_teacherInboxTick, TEACHER_INBOX_POLL_MS);
} catch (_) {}
