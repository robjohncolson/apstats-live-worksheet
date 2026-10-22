// Recording fold: what the Class Log phone summarised for one section-day.
//
// COPIED 2026-10-22 from school/algebra2-live-worksheet/lib/class-log-summary.js
// (the a2 Desk's "Recording" fold, school/class-log/POLISH4_SPEC.md WP-F F3) for
// the AP Stats Desk (FABLE_SPRINT_2026_10_22B_SPEC.md track L). Differences from
// the a2 original, so the two copies can be diffed:
//   - course-aware: pick()/fill() take `source.course` ('apstats' here, the a2
//     copy hard-codes 'algebra2'); the request also sends `course=` so a server
//     that filters by course returns less, and the client filters regardless;
//   - the token and base URL come from a `source` object the caller supplies
//     ({ base, token, course } -- js/desk-class-log.js: the a2 roster-server and
//     the Class Log sign-in token), not from window.rosterClient;
//   - a non-OK response rejects with an Error carrying `.status`, and fill()
//     resolves to { ok, status } so the caller can clear a rejected token.
//
// Shows Landed · Student questions · Promises · Next prep, then "model · recorded
// HH:MM" (New York time the summary reached the server). Data:
// GET <base>/teacher/summaries?course=&from=<date>&to=<date>, fetched once per
// base+date and kept in memory (a failed fetch is not kept, so the next panel open
// tries again). No row for the section: "No recording summary". Fetch failure or no
// token: "Recording summary unavailable"; nothing else on the panel changes.
// view() is pure and exported (module.exports in tests, window.ClassLogSummary in
// the browser); fill() is the only DOM code and runs when the Desk calls it.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClassLogSummary = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var LISTS = [['landed', 'Landed'], ['studentQuestions', 'Student questions'], ['promises', 'Promises'], ['nextPrep', 'Next prep']];
  var NONE = 'No recording summary', UNAVAILABLE = 'Recording summary unavailable';
  var DEFAULT_COURSE = 'apstats';

  // ISO timestamp -> 'HH:MM' on the New York wall clock, or null.
  function clock(iso) {
    var stamp = Date.parse(iso || '');
    if (!Number.isFinite(stamp)) return null;
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(stamp)).forEach(function (p) { parts[p.type] = p.value; });
    return parts.hour + ':' + parts.minute;
  }

  // The row for one section from a GET /teacher/summaries body, one course only.
  function pick(body, date, section, course) {
    var want = course || DEFAULT_COURSE;
    var rows = (body && body.summaries) || [];
    return rows.filter(function (r) { return r && r.date === date && r.section === section && r.course === want; })[0] || null;
  }

  // Row -> {message} or {lists: [{label, items}], footer}. Empty lists are left out.
  function view(row) {
    if (!row) return { message: NONE };
    var lists = [];
    LISTS.forEach(function (pair) {
      var items = (Array.isArray(row[pair[0]]) ? row[pair[0]] : []).filter(function (s) { return typeof s === 'string' && s.trim(); });
      if (items.length) lists.push({ label: pair[1], items: items });
    });
    var at = clock(row.recordedAt);
    var footer = [row.model, at ? 'recorded ' + at : null].filter(Boolean).join(' · ');
    return { lists: lists, footer: footer };
  }

  function render(doc, host, v) {
    while (host.lastChild && host.lastChild !== host.firstChild) host.removeChild(host.lastChild); // keep <summary>
    var line = function (text, cls) {
      var p = doc.createElement('p'); p.className = cls; p.textContent = text; host.appendChild(p);
    };
    if (v.message) { line(v.message, 'a2-week-muted'); return; }
    v.lists.forEach(function (list) {
      line(list.label, 'a2-rec-label');
      var ul = doc.createElement('ul'); ul.className = 'a2-rec-list';
      list.items.forEach(function (item) { var li = doc.createElement('li'); li.textContent = item; ul.appendChild(li); });
      host.appendChild(ul);
    });
    if (!v.lists.length) line('The summary has no items.', 'a2-week-muted');
    if (v.footer) line(v.footer, 'a2-week-muted');
  }

  function failure(message, status) {
    var error = new Error(message);
    error.status = status;
    return error;
  }

  // source: { base, token, course }. Rejects with .status 0 when either is missing.
  var cache = {};
  function load(win, date, source) {
    var base = source && source.base, token = source && source.token;
    var course = (source && source.course) || DEFAULT_COURSE;
    var key = base + '|' + course + '|' + date;
    if (cache[key]) return cache[key];
    if (!token || !base) return Promise.reject(failure('no teacher token', 0));
    var url = base + '/teacher/summaries?course=' + encodeURIComponent(course) + '&from=' + date + '&to=' + date;
    var pending = win.fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw failure('HTTP ' + r.status, r.status); return r.json(); })
      .then(function (body) {
        // A malformed envelope is a failure: it must not be cached as an empty day.
        if (!body || !Array.isArray(body.summaries)) throw failure('bad body', 0);
        return body;
      });
    cache[key] = pending;
    pending.catch(function () { if (cache[key] === pending) delete cache[key]; });
    return pending;
  }

  // Fill a <details> fold (its first child is the <summary>) for one section-day.
  // Resolves to { ok: true } or { ok: false, status } (status 401/403 = the token was refused).
  function fill(win, fold, date, section, source) {
    var doc = win.document;
    render(doc, fold, { message: 'Loading…' });
    return load(win, date, source)
      .then(function (body) {
        render(doc, fold, view(pick(body, date, section, source && source.course)));
        return { ok: true };
      })
      .catch(function (error) {
        render(doc, fold, { message: UNAVAILABLE });
        return { ok: false, status: (error && error.status) || 0 };
      });
  }

  return { LISTS: LISTS, NONE: NONE, UNAVAILABLE: UNAVAILABLE, DEFAULT_COURSE: DEFAULT_COURSE,
    clock: clock, pick: pick, view: view, render: render, load: load, fill: fill,
    _reset: function () { cache = {}; } };
});
