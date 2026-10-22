// Desk-link step 3 (TI84_TRAINER_DESK_LINK_SPEC.md §3): today's lesson maps
// to specific trainer skills via the curated lesson map. Loaded once; any
// failure leaves it null and the unit deep-link below takes over.
var _ti84LessonMap = null;
try {
    fetch('data/ti84-lesson-map.json')
        .then(function (r) { return r.json(); })
        .then(function (m) { _ti84LessonMap = (m && m.lessons) || null; _renderTi84SkillBtn(); })
        .catch(function () { _ti84LessonMap = null; });
} catch (_) { /* no fetch (tests) — unit fallback */ }

function _ti84TodayTopic() {
    var topics=typeof groupTopics==='function'?groupTopics(_todayLessonInf):[_todayLessonInf&&_todayLessonInf.t];
    return topics.find(function(topic){return topic&&_ti84LessonMap&&_ti84LessonMap[topic];})||null;
}

// "Today's calculator skill" chip on the Do-Now card — present ONLY when
// today's lesson has a mapped skill (no fake calculator exercises). Idempotent:
// called after the map loads and on every renderDoNow pass.
function _renderTi84SkillBtn() {
    var body = document.querySelector('#donow-card .donow-body');
    if (!body) return;
    var existing = document.getElementById('ti84-skill-btn');
    var topic = _ti84TodayTopic();
    if (!topic) { if (existing) existing.remove(); return; }
    if (existing) return;
    var btn = document.createElement('button');
    btn.id = 'ti84-skill-btn';
    btn.type = 'button';
    btn.textContent = '🖩 Today’s calculator skill';
    btn.style.cssText = 'display:block;margin-top:6px;font-size:11px;padding:2px 8px;cursor:pointer';
    // SOLO_DOOR_SPEC §5: today's topic in the park's solo room (re-read at click time).
    btn.onclick = function () {
        var today = _ti84TodayTopic() || topic;
        _openParkSolo('&topic=' + today);
    };
    body.appendChild(btn);
}

// The park's solo calculator room deep-linked to a SPECIFIC topic (the resource panel's
// Calculator Skill row: any mapped lesson, not just today's). SOLO_DOOR_SPEC §5: park door only.
function _openTi84ForTopic(topic) {
    if (!topic) { _openParkSolo(''); return; }
    _openParkSolo('&topic=' + topic);
}

// APSTAT_PARK_TRAINER_ABSORB_SPEC §5 (2026-10-16): the relay's spaced-recall schedule. The
// resource panel's Calculator Skill row gets " · N skills due" from GET /park/calc/due on the
// curriculum render server (the park relay); the link opens the park's solo calculator room,
// which plays the most overdue skill first. Nothing here touches a grade.
var _calcDueCache = { at: 0, count: null };
function _calcDueUrl() {
    var base = (typeof window !== 'undefined' && window.RAILWAY_SERVER_URL)
        ? window.RAILWAY_SERVER_URL : 'https://curriculumrender-production.up.railway.app';
    var s = (window.rosterClient && window.rosterClient.current) ? window.rosterClient.current() : null;
    if (!s || !s.section || !s.username) return null;
    return String(base).replace(/\/+$/, '') + '/park/calc/due?section=' + encodeURIComponent(s.section)
        + '&username=' + encodeURIComponent(s.username);
}
function _renderCalcDue() {
    var slots = document.querySelectorAll('.desk-calc-due-slot');
    if (!slots.length) return;
    var paint = function (count) {
        slots.forEach(function (slot) {
            slot.textContent = '';
            if (!(count > 0)) return;
            var link = document.createElement('a');
            link.href = '#';
            link.textContent = ' · ' + count + (count === 1 ? ' skill due' : ' skills due');
            link.style.cssText = 'color:var(--accent-ink);text-decoration:underline;margin-left:4px';
            link.onclick = function (e) { e.preventDefault(); _openParkSolo(''); };
            slot.appendChild(link);
        });
    };
    if (Date.now() - _calcDueCache.at < 60000 && _calcDueCache.count !== null) { paint(_calcDueCache.count); return; }
    var url = _calcDueUrl();
    if (!url || typeof fetch !== 'function') return;
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
        var count = data && data.ok ? Number(data.count || 0) : 0;
        _calcDueCache = { at: Date.now(), count: count };
        paint(count);
    }).catch(function () { /* the row is fine without the count */ });
}
// Opens the park's solo calculator room on the calendar board: the hash is the deep link
// (#room=calc-solo[&skill=|&topic=]), which the room reads when it mounts (or re-mounts on
// hashchange when it is already open). link: '' (the due/rotation round), '&skill=<id>' or '&topic=<t>'.
function _openParkSolo(link) {
    try { window.location.hash = '#room=calc-solo' + (link || ''); } catch (_) {}
    if (typeof closeResourcePanel === 'function') { try { closeResourcePanel(); } catch (_) {} }
    var board = document.getElementById('classroom-board-mount');
    if (board && typeof board.scrollIntoView === 'function') { try { board.scrollIntoView({ block: 'center' }); } catch (_) {} }
    var handle = (typeof _classroomBoardHandle !== 'undefined') ? _classroomBoardHandle : null;
    if (handle && typeof handle.openCalculatorMission === 'function') { try { handle.openCalculatorMission(); } catch (_) {} }
}

// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §5: the Calculator Skills progress view. Every catalogue skill
// from GET /park/calc/progress on the park relay, grouped by CED unit, with a state chip and a
// Practice link into the park's solo room. Practice only: nothing here touches a grade.
var _calcProgressCache = { at: 0, data: null };
// The answer on screen right now (a loading answer is shown but never cached): the unit filter re-renders this.
var _calcProgressShown = null;
var _calcProgressUnit = 'all';
var CALC_PROGRESS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Same relay, same roster session as the due count; only the path differs.
function _calcProgressUrl() {
    var due = _calcDueUrl();
    if (!due) return null;
    return due.replace('/park/calc/due?', '/park/calc/progress?');
}

// '2026-10-24' → 'Oct 24' (read as text: no time-zone shift).
function _calcProgressDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return '';
    return CALC_PROGRESS_MONTHS[Number(parts[1]) - 1] + ' ' + Number(parts[2]);
}

// The skill has a recall record (a review was ever recorded).
function _calcProgressHasRecord(row) {
    return row.lastQuality != null || !!row.nextReview || row.mastered === true;
}

// The state chip, first match wins. LOCKED is checked before NEW: a locked row also has no
// clears and no record, so NEW would otherwise hide it.
function _calcProgressChip(row) {
    if (row.mastered) {
        var review = _calcProgressDate(row.nextReview);
        return { kind: 'mastered', text: 'MASTERED' + (review ? ' · review ' + review : '') };
    }
    if (row.due) {
        var days = Number(row.overdueDays) || 0;
        if (days <= 0) return { kind: 'due', text: 'DUE TODAY' };
        return { kind: 'due', text: 'DUE · ' + days + (days === 1 ? ' day overdue' : ' days overdue') };
    }
    if (row.clears > 0 || _calcProgressHasRecord(row)) {
        if (row.rung >= 2) return { kind: 'rung', text: 'ON YOUR OWN' };
        if (row.rung === 1) return { kind: 'rung', text: 'GOALS ONLY' };
        return { kind: 'rung', text: 'FULL HELP' };
    }
    if (!row.eligible) return { kind: 'locked', text: 'LOCKED' };
    return { kind: 'new', text: 'NEW' };
}

// The CED-2026 unit a row is grouped under: the Desk's own label first, the relay's as fallback.
function _calcProgressUnitOf(row) {
    var label = cedLabel(row.topic);
    return label.unit || label.bonusUnit || row.unit || null;
}

function _calcProgressSummary(rows) {
    var mastered = 0, due = 0, fresh = 0;
    rows.forEach(function (row) {
        if (row.mastered) mastered++;
        if (row.due) due++;
        if (_calcProgressChip(row).kind === 'new') fresh++;
    });
    return mastered + ' mastered · ' + due + ' due · ' + fresh + ' new';
}

function _calcProgressMessage(text) {
    document.getElementById('calc-progress-summary').textContent = '';
    document.getElementById('calc-progress-filter').innerHTML = '';
    var body = document.getElementById('calc-progress-body');
    body.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
}

function _calcProgressFilter(units) {
    var host = document.getElementById('calc-progress-filter');
    host.innerHTML = '';
    ['all'].concat(units).forEach(function (unit) {
        var selected = String(unit) === String(_calcProgressUnit);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 's7btn' + (selected ? ' s7btn-default' : '');
        btn.setAttribute('data-unit', String(unit));
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.textContent = unit === 'all' ? 'All' : 'Unit ' + unit;
        btn.style.cssText = 'margin:0 4px 4px 0;font-size:11px';
        btn.onclick = function () {
            _calcProgressUnit = unit;
            _renderCalcProgress(_calcProgressShown || _calcProgressCache.data);
        };
        host.appendChild(btn);
    });
}

function _calcProgressRow(row) {
    var line = document.createElement('div');
    line.className = 'calc-progress-row';
    line.setAttribute('data-skill', row.skillId);
    line.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:4px 0;padding-bottom:4px;border-bottom:1px dotted var(--black)';
    var title = document.createElement('b');
    title.textContent = row.title;
    var topic = document.createElement('span');
    topic.className = 'calc-progress-topic';
    topic.textContent = cedLabel(row.topic).text;
    topic.style.cssText = 'opacity:.8;flex:1 1 160px';
    var chipInfo = _calcProgressChip(row);
    var chip = document.createElement('span');
    chip.className = 'calc-progress-chip calc-progress-' + chipInfo.kind;
    chip.textContent = chipInfo.text;
    chip.style.cssText = 'font-size:10px;padding:0 5px;border:1px solid var(--black);white-space:nowrap';
    var practice = document.createElement('a');
    practice.href = '#';
    practice.className = 'calc-progress-practice';
    practice.textContent = 'Practice';
    practice.setAttribute('aria-label', 'Practice ' + row.title);
    practice.style.cssText = 'color:var(--accent-ink);text-decoration:underline';
    practice.onclick = function (e) {
        e.preventDefault();
        closeCalcProgress();
        _openParkSolo('&skill=' + row.skillId);
    };
    line.appendChild(title);
    line.appendChild(topic);
    line.appendChild(chip);
    line.appendChild(practice);
    return line;
}

function _renderCalcProgress(data) {
    _calcProgressShown = data;
    var rows = (data && Array.isArray(data.skills)) ? data.skills : [];
    if (!rows.length) { _calcProgressMessage('No calculator skills to show yet.'); return; }
    var units = [];
    rows.forEach(function (row) {
        var unit = _calcProgressUnitOf(row);
        if (unit != null && units.indexOf(unit) < 0) units.push(unit);
    });
    units.sort(function (a, b) { return a - b; });
    if (_calcProgressUnit !== 'all' && units.indexOf(_calcProgressUnit) < 0) _calcProgressUnit = 'all';
    document.getElementById('calc-progress-summary').textContent = _calcProgressSummary(rows);
    _calcProgressFilter(units);
    var body = document.getElementById('calc-progress-body');
    body.innerHTML = '';
    var shown = _calcProgressUnit === 'all' ? units.concat([null]) : [_calcProgressUnit];
    shown.forEach(function (unit) {
        var group = rows.filter(function (row) { return _calcProgressUnitOf(row) === unit; });
        if (!group.length) return;
        var heading = document.createElement('div');
        heading.className = 'chicago calc-progress-unit';
        heading.setAttribute('data-unit', String(unit));
        heading.textContent = unit == null ? 'Other' : 'Unit ' + unit + ' · ' + cedUnitLabel(unit);
        heading.style.cssText = 'margin:8px 0 2px;font-size:11px';
        body.appendChild(heading);
        group.forEach(function (row) { body.appendChild(_calcProgressRow(row)); });
    });
}

var CALC_PROGRESS_OFFLINE = 'Could not reach the park. Try again in a minute.';

// Opens the modal; fetches the relay at most once a minute (like _renderCalcDue).
function _openCalcProgress() {
    var overlay = document.getElementById('calc-progress-overlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    if (Date.now() - _calcProgressCache.at < 60000 && _calcProgressCache.data) {
        _renderCalcProgress(_calcProgressCache.data);
        return;
    }
    var url = _calcProgressUrl();
    if (!url) { _calcProgressMessage('Sign in to see your calculator skills.'); return; }
    if (typeof fetch !== 'function') { _calcProgressMessage(CALC_PROGRESS_OFFLINE); return; }
    _calcProgressMessage('Loading your calculator skills…');
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
        if (!data || !data.ok) { _calcProgressMessage(CALC_PROGRESS_OFFLINE); return; }
        // A cold relay answers before its store has loaded (data.loading): show what it has,
        // cache nothing, and ask again shortly while the modal is still open.
        if (!data.loading) _calcProgressCache = { at: Date.now(), data: data };
        _renderCalcProgress(data);
        if (data.loading) setTimeout(function () {
            if (overlay.style.display !== 'none') _openCalcProgress();
        }, 2500);
    }).catch(function () { _calcProgressMessage(CALC_PROGRESS_OFFLINE); });
}

function closeCalcProgress() {
    var overlay = document.getElementById('calc-progress-overlay');
    if (overlay) overlay.style.display = 'none';
}
