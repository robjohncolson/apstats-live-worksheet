// ── Blooket flashcard verification (2026-05-20) ───────────────────────────────
// Sources the same Blooket CSV that built the live Blooket game. This is the
// actual chain-of-custody check: self-attest and self-reported scores couldn't
// verify anything; flashcards we control end-to-end can.
//
// GRADE RULE (teacher 2026-10-12): the deck's best score IS the lesson's Blooket
// grade, point for point (_ftFinish → _blooketCommit records the exact %; the
// roster's blooketAvg is the mean of those). The 80% threshold below was the
// SUMMER unlock rule (lessons were gated then); today it only decides the
// lesson-complete tint (_isLessonComplete) and nothing a student reads may call
// 80% "done", "credit" or "a pass". Nothing is locked since 2026-09-10.
const BLOOKET_PASS_THRESHOLD = 0.80;
const BLOOKET_RETRY_COOLDOWN_MS = 0; // (changing this needs teacher sign-off — see FLASHCARD_V2_BUILD.md)

function _mayScore() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return false;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return false;
    return true;
}

var _fcFlags = { flags: {} };
var _fcFlagsPromise = null;

function _fcLoadFlags() {
    if (_fcFlagsPromise) return _fcFlagsPromise;
    if (typeof FlashcardFlags === 'undefined'
        || !FlashcardFlags
        || typeof FlashcardFlags.loadFlags !== 'function') {
        return null;
    }
    var build = (typeof APP_BUILD !== 'undefined' && APP_BUILD) ? APP_BUILD : Date.now();
    var fetchImpl = (typeof fetch === 'function') ? fetch : null;
    _fcFlagsPromise = FlashcardFlags.loadFlags(fetchImpl, build).then(function (loaded) {
        _fcFlags = loaded && loaded.flags ? loaded : { flags: {} };
        try {
            var names = Object.keys(_fcFlags.flags || {});
            var anyEnabled = false;
            for (var i = 0; i < names.length; i++) {
                if (_fcFlag(names[i])) {
                    anyEnabled = true;
                    break;
                }
            }
            // First-render race: the Do Now grades may already be painted with
            // empty flags. Refresh ONLY the due chip in place — never re-run
            // renderDoNowGrades (its fetch/classify path is incident-pinned).
            if (anyEnabled && _fcFlag('dueTodayDeck')
                && typeof _srsRenderDueChip === 'function'
                && typeof _srsDueSnapshot === 'function') {
                var dueHost = document.getElementById('donow-grades');
                if (dueHost && dueHost.style.display !== 'none') {
                    _srsRenderDueChip(dueHost, _srsDueSnapshot());
                }
            }
        } catch (_) { /* flag-driven cached repaint is best-effort */ }
        try { if (typeof _srsSyncPull === 'function') _srsSyncPull({ force: true }); } catch (_) {}
        return _fcFlags;
    }, function () {
        _fcFlags = { flags: {} };
        return _fcFlags;
    });
    return _fcFlagsPromise;
}

function _fcFlag(name) {
    if (typeof FlashcardFlags === 'undefined'
        || !FlashcardFlags
        || typeof FlashcardFlags.resolveFlag !== 'function') return false;
    var current = null;
    try {
        current = (typeof rosterClient !== 'undefined'
            && rosterClient
            && typeof rosterClient.current === 'function')
            ? rosterClient.current()
            : null;
    } catch (_) { current = null; }
    return FlashcardFlags.resolveFlag(_fcFlags, name, {
        search: (typeof location !== 'undefined' && location.search) ? location.search : '',
        username: current && current.username ? current.username : null,
        section: current && current.section ? current.section : null,
        storage: (typeof localStorage !== 'undefined') ? localStorage : null
    });
}

var _bfState = {
    topic: null,    // "1.2" etc.
    btn: null,      // the Done button (so we can mutate it on pass)
    deck: [],       // [{q, choices[], correctIdx}]
    idx: 0,         // current card index
    score: 0,       // right answers so far
    answered: false, // current card already answered?
    finishId: null, // pending early-pass finish beat
    advanceId: null, // pending correct-answer auto-advance
    finished: false, // once-per-round finish latch
    roundId: null,
    seq: 0,
    cardStart: 0,
    misses: [],
    perm: [],
    primedQnums: [],
    poolQnums: [],
    seenQnums: [],
    allCards: [],
    lastFinishAt: null
};

var _rvState = {
    topic: null,
    btn: null,
    csv: null,
    mixed: false,
    queue: [],
    idx: 0,
    ratings: 0,
    roundId: null,
    round: null,
    seq: 0,
    cardStart: 0,
    current: null,
    stage: null,
    store: null,
    folded: null,
    deckCardsByCsv: {}
};

// 2026-05-20: persist progress per (student, topic) so cancel/close
// doesn't reset. Resumes the same shuffled deck at the same card.
function _bfStorageKey() {
    try {
        var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
        if (!email) return null;
        return 'apstats_desk_bf_progress_' + email;
    } catch (_) { return null; }
}

function _bfSaveProgress() {
    // Codex BLOCKER fold P2: gating the Blooket progress write prevents the
    // teacher's localStorage from being polluted with student-attributed
    // progress while in view-as mode (the key includes the teacher's email,
    // not the student's, so it'd cross-contaminate the teacher's real tabs).
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    var key = _bfStorageKey();
    if (!key || !_bfState.topic || !Array.isArray(_bfState.deck) || _bfState.deck.length === 0) return;
    try {
        var saved = JSON.parse(localStorage.getItem(key) || '{}');
        saved[_bfState.topic] = {
            deck: _bfState.deck,
            idx: _bfState.idx,
            score: _bfState.score,
            answered: !!_bfState.answered,
            roundId: _bfState.roundId,
            seq: _bfState.seq,
            misses: Array.isArray(_bfState.misses) ? _bfState.misses : [],
            primedQnums: Array.isArray(_bfState.primedQnums) ? _bfState.primedQnums : [],
            poolQnums: Array.isArray(_bfState.poolQnums) ? _bfState.poolQnums : [],
            seenQnums: Array.isArray(_bfState.seenQnums) ? _bfState.seenQnums : [],
            ts: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(saved));
    } catch (_) {}
}

function _bfLoadProgress(topic) {
    var key = _bfStorageKey();
    if (!key) return null;
    try {
        var saved = JSON.parse(localStorage.getItem(key) || '{}');
        var entry = saved[topic];
        if (!entry || !Array.isArray(entry.deck) || entry.deck.length === 0) return null;
        // Defensive: if idx is beyond the deck, treat as no resume.
        if ((entry.idx || 0) >= entry.deck.length) return null;
        return entry;
    } catch (_) { return null; }
}

function _bfClearProgress(topic) {
    // Codex BLOCKER fold P2: gating the Blooket progress clear matches
    // _bfSaveProgress -- prevents touching the teacher's localStorage at all
    // while view-as is active.
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    var key = _bfStorageKey();
    if (!key) return;
    try {
        var saved = JSON.parse(localStorage.getItem(key) || '{}');
        if (topic) delete saved[topic]; else saved = {};
        localStorage.setItem(key, JSON.stringify(saved));
    } catch (_) {}
}

// Resolve the Blooket CSV path for a topic via the registry's worksheet URL.
// Topic 1.2 → registry.urls.worksheet = "...u1_lesson2_live.html" →
// "u1_l2_blooket.csv". Combined: topic 4.1 → ".../u4_lesson1-2_live.html" →
// "u4_l1_l2_blooket.csv".
function _bfCsvPath(topicId) {
    try {
        var reg = (typeof getRegistryEntry === 'function') ? getRegistryEntry(topicId) : null;
        if (!reg || !reg.urls || !reg.urls.worksheet) return null;
        var m = /u(\d+)_lesson([\d-]+)_live\.html/.exec(reg.urls.worksheet);
        if (!m) return null;
        var unit = m[1];
        var key = m[2].replace(/-/g, '_l');
        return 'u' + unit + '_l' + key + '_blooket.csv';
    } catch (_) { return null; }
}

function _bfWorksheetUrl(topicId) {
    try {
        var reg = (typeof getRegistryEntry === 'function') ? getRegistryEntry(topicId) : null;
        if (!reg || !reg.urls || !reg.urls.worksheet) return null;
        return reg.urls.worksheet;
    } catch (_) { return null; }
}

function _bfWorksheetFragmentUrl(topicId, stem) {
    var url = (typeof _bfWorksheetUrl === 'function') ? _bfWorksheetUrl(topicId) : null;
    if (!url) return null;
    var words = String(stem == null ? '' : stem).trim().split(/\s+/).slice(0, 6).join(' ');
    return url + '#:~:text=' + encodeURIComponent(words);
}

var _srsFoldCache = null;
var _srsReadinessCache = null;

function _srsFoldedState() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return null;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return null;
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardSrs.foldLog !== 'function'
        || typeof FlashcardSrs.dayIndex !== 'function'
        || typeof FlashcardStore === 'undefined'
        || !FlashcardStore
        || typeof FlashcardStore.createStore !== 'function') return null;
    if (typeof localStorage === 'undefined') return null;

    var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
    if (!email) return null;
    var todayDay = FlashcardSrs.dayIndex(Date.now());
    if (_srsFoldCache && _srsFoldCache.email === email) {
        return {
            email: _srsFoldCache.email,
            store: _srsFoldCache.store,
            state: _srsFoldCache.state,
            log: _srsFoldCache.log,
            folded: _srsFoldCache.folded,
            todayDay: todayDay
        };
    }

    try {
        var store = FlashcardStore.createStore({
            storage: localStorage,
            email: email,
            now: Date.now
        });
        if (!store || typeof store.load !== 'function' || typeof store.readSrsLog !== 'function') {
            return null;
        }
        var state = store.load();
        var log = store.readSrsLog();
        var folded = FlashcardSrs.foldLog(log, { state: state });
        folded.version = state.version;
        folded.tombstones = state.tombstones || {};
        folded.updatedAt = state.updatedAt || 0;
        if (state.extra) folded.extra = state.extra;
        _srsFoldCache = {
            email: email,
            store: store,
            state: state,
            log: log,
            folded: folded
        };
        return {
            email: _srsFoldCache.email,
            store: _srsFoldCache.store,
            state: _srsFoldCache.state,
            log: _srsFoldCache.log,
            folded: _srsFoldCache.folded,
            todayDay: todayDay
        };
    } catch (_) {
        return null;
    }
}

function _srsReadinessFor(csv) {
    if (typeof _fcFlag !== 'function' || !_fcFlag('readinessBadge')) return null;
    if (!csv) return null;
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardSrs.foldMastery !== 'function') return null;
    if (typeof window === 'undefined'
        || !window.BKT
        || typeof window.BKT.updateMastery !== 'function') return null;

    var foldedState = (typeof _srsFoldedState === 'function') ? _srsFoldedState() : null;
    if (!foldedState || !Array.isArray(foldedState.log)) return null;

    try {
        var mastery = null;
        if (typeof _srsReadinessCache !== 'undefined'
            && _srsReadinessCache
            && _srsReadinessCache.email === foldedState.email
            && _srsReadinessCache.log === foldedState.log) {
            mastery = _srsReadinessCache.mastery;
        } else {
            mastery = FlashcardSrs.foldMastery(foldedState.log, {
                bkt: window.BKT,
                todayDay: foldedState.todayDay
            });
            if (typeof _srsReadinessCache !== 'undefined') {
                _srsReadinessCache = {
                    email: foldedState.email,
                    log: foldedState.log,
                    mastery: mastery
                };
            }
        }

        if (!mastery || !mastery.byCsv) return null;
        return mastery.byCsv[csv] || null;
    } catch (_) {
        return null;
    }
}

function _srsCoreDeckPlans() {
    var plansByCsv = {};
    var lessons = (typeof REGISTRY !== 'undefined' && REGISTRY && REGISTRY.lessons)
        ? REGISTRY.lessons
        : {};
    var topicIds = Object.keys(lessons);
    for (var i = 0; i < topicIds.length; i++) {
        var topicId = topicIds[i];
        var registryEntry = lessons[topicId] || {};
        var ced = registryEntry.ced2026 || {};
        if (registryEntry.status === 'bonus'
            || registryEntry.status === 'optional'
            || registryEntry.bonus === true
            || registryEntry.optional === true
            || ced.status === 'bonus'
            || ced.status === 'optional') continue;

        var path = (typeof _bfCsvPath === 'function') ? _bfCsvPath(topicId) : null;
        var csv = (typeof _srsCsvFor === 'function') ? _srsCsvFor(topicId) : null;
        if (!csv && path) {
            var cleanPath = String(path).split(/[?#]/)[0].split('/');
            csv = cleanPath[cleanPath.length - 1];
        }
        if (!path || !csv || plansByCsv[csv]) continue;
        plansByCsv[csv] = {
            csv: csv,
            path: path,
            topic: topicId,
            label: cedLabel(topicId).text
        };
    }
    return plansByCsv;
}

function _srsDueSummary() {
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardSrs.summarize !== 'function'
        || typeof FlashcardSrs.dueCards !== 'function') return { due: 0 };
    var foldedState = (typeof _srsFoldedState === 'function') ? _srsFoldedState() : null;
    if (!foldedState) return { due: 0 };

    var todayDay = FlashcardSrs.dayIndex(Date.now());
    var plansByCsv = (typeof _srsCoreDeckPlans === 'function') ? _srsCoreDeckPlans() : {};
    var allCards = foldedState.folded && foldedState.folded.cards
        ? foldedState.folded.cards
        : {};
    var coreCards = {};
    var cardIds = Object.keys(allCards);
    for (var c = 0; c < cardIds.length; c++) {
        var cardId = String(cardIds[c]);
        var cardSplit = cardId.lastIndexOf('#');
        if (cardSplit <= 0) continue;
        if (!plansByCsv[cardId.slice(0, cardSplit)]) continue;
        coreCards[cardId] = allCards[cardId];
    }
    var coreState = { cards: coreCards };
    var summary = FlashcardSrs.summarize(coreState, todayDay);
    var dueIds = FlashcardSrs.dueCards(coreState, todayDay);
    var byCsv = {};
    for (var i = 0; i < dueIds.length; i++) {
        var id = String(dueIds[i]);
        var splitAt = id.lastIndexOf('#');
        if (splitAt <= 0) continue;
        var csv = id.slice(0, splitAt);
        byCsv[csv] = (byCsv[csv] || 0) + 1;
    }
    return {
        due: summary && typeof summary.due === 'number' ? summary.due : dueIds.length,
        byCsv: byCsv,
        todayDay: todayDay
    };
}

function _srsDueSnapshot() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return { due: 0 };
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return { due: 0 };
    var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
    if (!email) return { due: 0 };
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardSrs.dayIndex !== 'function') return { due: 0 };

    var todayDay = FlashcardSrs.dayIndex(Date.now());
    var snapshotKey = 'apstats_fc_due_snapshot_' + String(todayDay);
    try {
        if (typeof sessionStorage !== 'undefined') {
            var previousKey = sessionStorage.getItem('apstats_fc_due_snapshot');
            if (previousKey && previousKey !== snapshotKey) {
                sessionStorage.removeItem(previousKey);
            }
            sessionStorage.setItem('apstats_fc_due_snapshot', snapshotKey);
            var cached = JSON.parse(sessionStorage.getItem(snapshotKey) || 'null');
            if (cached
                && cached.email === email
                && cached.todayDay === todayDay
                && typeof cached.due === 'number') {
                return {
                    due: cached.due,
                    byCsv: cached.byCsv || {},
                    todayDay: todayDay
                };
            }
        }
    } catch (_) {}

    var summary = (typeof _srsDueSummary === 'function') ? _srsDueSummary() : { due: 0 };
    if (!summary || !summary.byCsv || typeof summary.todayDay !== 'number') return summary || { due: 0 };
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(snapshotKey, JSON.stringify({
                email: email,
                due: summary.due,
                byCsv: summary.byCsv,
                todayDay: todayDay
            }));
        }
    } catch (_) {}
    return summary;
}

// The due count used to be a "Review due (N)" chip in the Do Now grades row. It now lives on the
// Review desktop icon (badge + bob) so the Do Now carries only the work that is due. Every caller
// still passes the Do Now host; it is only used to clear any chip a stale build painted.
function _srsRenderDueChip(host, summary) {
    if (host) {
        var prior = host.querySelector('#fc-due-chip');
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);
    }
    _srsPaintReviewIcon(summary);
}
function _srsPaintReviewIcon(summary) {
    var icon = document.querySelector('.app-icon[data-app="review"]');
    if (!icon) return;
    var img = icon.querySelector('.icon-img');
    var badge = img ? img.querySelector('.review-due-badge') : null;
    var due = summary && summary.due > 0 ? summary.due : 0;
    if (!due) {
        if (badge) badge.remove();
        icon.classList.remove('review-has-due');
        icon.title = 'Spaced repetition practice only \u2014 never for a grade. Nothing due right now.';
        return;
    }
    if (!badge && img) { badge = document.createElement('span'); badge.className = 'review-due-badge'; img.appendChild(badge); }
    if (badge) {
        badge.textContent = String(due);
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', due + (due === 1 ? ' flashcard' : ' flashcards') + ' due for review');
    }
    icon.classList.add('review-has-due');
    icon.title = 'Spaced repetition practice only \u2014 never for a grade. ' + due + (due === 1 ? ' card' : ' cards') + ' due today.';
}
// Desktop icon entry: straight into the mixed due deck (it says "nothing due" when there is none).
function openReview() {
    try { if (typeof bumpUsage === 'function') bumpUsage('review'); } catch (_) {}
    if (typeof _rvStartMixed === 'function') _rvStartMixed();
}

function _srsAppendLog(entries) {
    try {
        if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
        if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
        var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
        if (!email || !Array.isArray(entries) || entries.length === 0) return;
        var key = 'apstats_srs_log_' + email;
        var saved = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(saved)) saved = [];
        saved = saved.concat(entries);
        if (saved.length > 2000) saved = saved.slice(saved.length - 2000);
        localStorage.setItem(key, JSON.stringify(saved));
        if (typeof _srsFoldCache !== 'undefined') _srsFoldCache = null;
        if (typeof _srsSyncViaTrainerState === 'function') _srsSyncViaTrainerState();
        if (typeof sessionStorage !== 'undefined') {
            var snapshotKey = sessionStorage.getItem('apstats_fc_due_snapshot');
            if (snapshotKey) sessionStorage.removeItem(snapshotKey);
            sessionStorage.removeItem('apstats_fc_due_snapshot');
        }
    } catch (_) {}
}

function _fcpExport() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) {
        if (typeof showDialog === 'function') {
            showDialog('&#128274;', 'Export is unavailable while viewing as another student.', 'OK');
        }
        return;
    }
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    if (typeof FlashcardStore === 'undefined'
        || !FlashcardStore
        || typeof FlashcardStore.createStore !== 'function'
        || typeof localStorage === 'undefined') return;

    var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
    if (!email) {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'Sign in before exporting flashcard progress.', 'OK');
        return;
    }

    try {
        var store = FlashcardStore.createStore({
            storage: localStorage,
            email: email,
            now: Date.now
        });
        if (!store
            || typeof store.load !== 'function'
            || typeof store.readSrsLog !== 'function'
            || typeof store.exportPassport !== 'function') return;
        var state = store.load();
        var log = store.readSrsLog();
        var passport = store.exportPassport(state, log);
        var blob = new Blob([JSON.stringify(passport, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        var objectUrl = URL.createObjectURL(blob);
        var date = new Date().toISOString().slice(0, 10);
        var safeEmail = String(email).replace(/[^a-z0-9@.+-]/gi, '_');
        link.href = objectUrl;
        link.download = 'apstats-flashcards-' + safeEmail + '-' + date + '.json';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 0);
    } catch (_) {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'Could not export flashcard progress.', 'OK');
    }
}

function _fcpImportFile(file) {
    if (!file) return Promise.resolve(false);
    if (typeof _viewAsContext === 'function' && _viewAsContext()) {
        if (typeof showDialog === 'function') {
            showDialog('&#128274;', 'Import is unavailable while viewing as another student.', 'OK');
        }
        return Promise.resolve(false);
    }
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return Promise.resolve(false);
    if (typeof FlashcardStore === 'undefined'
        || !FlashcardStore
        || typeof FlashcardStore.createStore !== 'function'
        || typeof localStorage === 'undefined') return Promise.resolve(false);

    var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
    if (!email) {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'Sign in before importing flashcard progress.', 'OK');
        return Promise.resolve(false);
    }

    var store;
    try {
        store = FlashcardStore.createStore({
            storage: localStorage,
            email: email,
            now: Date.now
        });
    } catch (_) {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'Could not open flashcard progress.', 'OK');
        return Promise.resolve(false);
    }
    if (!store
        || typeof store.previewImport !== 'function'
        || typeof store.importPassport !== 'function') return Promise.resolve(false);

    var readPromise;
    if (typeof file.text === 'function') {
        readPromise = file.text();
    } else if (typeof FileReader !== 'undefined') {
        readPromise = new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('read-failed')); };
            reader.readAsText(file);
        });
    } else {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'This browser cannot read the selected file.', 'OK');
        return Promise.resolve(false);
    }

    return Promise.resolve(readPromise).then(function (text) {
        var preview;
        try {
            preview = store.previewImport(text);
        } catch (_) {
            preview = null;
        }
        if (preview && preview.emailMatches === false) {
            if (typeof showDialog === 'function') {
                showDialog('&#128274;', 'This passport belongs to a different student. Import was refused.', 'OK');
            }
            return false;
        }
        if (!preview || preview.ok !== true) {
            if (typeof showDialog === 'function') {
                showDialog('&#9888;', 'That file is not a valid AP Statistics flashcard passport.', 'OK');
            }
            return false;
        }
        if (typeof showDialog !== 'function' || typeof document === 'undefined') return false;

        var counts = preview.counts || {};
        showDialog('&#128452;',
            'Import this flashcard progress?<br><br>'
            + '<b>' + Number(counts.cards || 0) + '</b> cards &middot; '
            + '<b>' + Number(counts.logEntries || 0) + '</b> practice records &middot; '
            + '<b>' + Number(counts.tombstones || 0) + '</b> removed cards',
            'Import');

        var overlay = document.getElementById('dialog-overlay');
        var buttons = overlay ? overlay.querySelector('.dialog-btns') : null;
        var importButton = document.getElementById('dialog-btn');
        if (!buttons || !importButton) return false;

        var originalImportHandler = importButton.onclick;
        var cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 's7btn';
        cancelButton.style.marginRight = '6px';
        cancelButton.textContent = 'Cancel';
        buttons.insertBefore(cancelButton, importButton);

        function cleanupConfirm() {
            importButton.onclick = originalImportHandler;
            if (cancelButton.parentNode) cancelButton.parentNode.removeChild(cancelButton);
            if (overlay) overlay.removeEventListener('click', dismissFromOverlay);
            document.removeEventListener('keydown', dismissFromEscape, true);
        }
        function dismissFromOverlay(event) {
            if (event.target !== overlay) return;
            cleanupConfirm();
        }
        function dismissFromEscape(event) {
            if (event.key !== 'Escape') return;
            cleanupConfirm();
        }
        cancelButton.onclick = function () {
            cleanupConfirm();
            if (typeof closeDialog === 'function') closeDialog();
        };
        importButton.onclick = function () {
            cleanupConfirm();
            if (typeof closeDialog === 'function') closeDialog();
            var imported;
            var currentEmail = null;
            try {
                currentEmail = (typeof getStudentEmail === 'function')
                    ? getStudentEmail()
                    : null;
            } catch (_) {
                currentEmail = null;
            }
            var viewAsActive = typeof _viewAsContext === 'function' && _viewAsContext();
            var readOnly = typeof window !== 'undefined' && window.__WS_READ_ONLY__;
            if (viewAsActive || readOnly || currentEmail !== email) {
                if (typeof showDialog === 'function') {
                    showDialog('&#128274;', 'Could not import flashcard progress.', 'OK');
                }
                return;
            }
            try {
                imported = store.importPassport(text);
            } catch (_) {
                imported = { ok: false };
            }
            if (!imported || imported.ok !== true) {
                if (typeof showDialog === 'function') {
                    showDialog('&#9888;', 'Could not import flashcard progress.', 'OK');
                }
                return;
            }

            if (typeof _srsFoldCache !== 'undefined') _srsFoldCache = null;
            if (typeof _srsReadinessCache !== 'undefined') _srsReadinessCache = null;
            try {
                if (typeof sessionStorage !== 'undefined') {
                    var snapshotKey = sessionStorage.getItem('apstats_fc_due_snapshot');
                    if (snapshotKey) sessionStorage.removeItem(snapshotKey);
                    sessionStorage.removeItem('apstats_fc_due_snapshot');
                }
            } catch (_) {}
            if (typeof _fcFlag === 'function'
                && _fcFlag('dueTodayDeck')
                && typeof _srsRenderDueChip === 'function'
                && typeof _srsDueSnapshot === 'function') {
                var dueHost = document.getElementById('donow-grades');
                if (dueHost) _srsRenderDueChip(dueHost, _srsDueSnapshot());
            }
            if (typeof showDialog === 'function') {
                showDialog('&#10003;', 'Flashcard progress imported.', 'OK');
            }
        };
        overlay.addEventListener('click', dismissFromOverlay);
        document.addEventListener('keydown', dismissFromEscape, true);
        return true;
    }, function () {
        if (typeof showDialog === 'function') showDialog('&#9888;', 'Could not read the selected file.', 'OK');
        return false;
    });
}

// Dormant until the teacher enables ap-stats-flashcards in
// TRAINER_DECK_ALLOWLIST on Railway. Local progress remains authoritative.
// ── Cross-device sync of the flashcard PRACTICE log (Supabase via roster-server's
// existing trainer_state row, deck 'ap-stats-flashcards'). Pure merge/wire logic
// lives in lib/flashcard-sync.js. Never grade evidence; never throws.
var _fcSyncClientInstance = null;

function _fcSyncClient() {
    if (_fcSyncClientInstance) return _fcSyncClientInstance;
    if (typeof FlashcardSync === 'undefined'
        || !FlashcardSync
        || typeof FlashcardSync.createSyncClient !== 'function') return null;
    if (typeof fetch !== 'function' || typeof localStorage === 'undefined') return null;
    _fcSyncClientInstance = FlashcardSync.createSyncClient({
        fetch: function (url, init) { return fetch(url, init); },
        baseUrl: function () { return window.ROSTER_SERVICE_URL || null; },
        token: function () {
            try {
                return (window.rosterClient && typeof window.rosterClient.token === 'function')
                    ? window.rosterClient.token() : null;
            } catch (_) { return null; }
        },
        email: function () {
            return (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
        },
        storage: localStorage,
        onLocalChanged: function () {
            // Another device's practice arrived: drop the fold caches + the
            // day snapshot, then refresh ONLY the additive chip (never re-run
            // renderDoNowGrades — its fetch/classify path is incident-pinned).
            try { _srsFoldCache = null; } catch (_) {}
            try { _srsReadinessCache = null; } catch (_) {}
            try {
                if (typeof sessionStorage !== 'undefined') {
                    var snapshotKey = sessionStorage.getItem('apstats_fc_due_snapshot');
                    if (snapshotKey) sessionStorage.removeItem(snapshotKey);
                }
            } catch (_) {}
            try {
                if (typeof _fcFlag === 'function' && _fcFlag('dueTodayDeck')
                    && typeof _srsRenderDueChip === 'function'
                    && typeof _srsDueSnapshot === 'function') {
                    var dueHost = document.getElementById('donow-grades');
                    if (dueHost && dueHost.style.display !== 'none') {
                        _srsRenderDueChip(dueHost, _srsDueSnapshot());
                    }
                }
            } catch (_) {}
        }
    });
    return _fcSyncClientInstance;
}

// Shared guard: flag on, real student session (not view-as / read-only).
function _fcSyncAllowed() {
    if (typeof _fcFlag !== 'function' || !_fcFlag('flashcardSync')) return false;
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return false;
    if (typeof window === 'undefined' || window.__WS_READ_ONLY__) return false;
    return true;
}

// Pull remote practice into local (boot, sign-in, before opening flashcards).
// Resolves the client's result; never rejects.
function _srsSyncPull(opts) {
    try {
        if (!_fcSyncAllowed()) return Promise.resolve({ ok: false, reason: 'not-allowed' });
        var client = _fcSyncClient();
        if (!client) return Promise.resolve({ ok: false, reason: 'no-client' });
        return client.pull(opts || {});
    } catch (_) { return Promise.resolve({ ok: false, reason: 'error' }); }
}

// Debounced push after any local log write. Name kept from P2-D11.
function _srsSyncViaTrainerState() {
    try {
        if (!_fcSyncAllowed()) return;
        var client = _fcSyncClient();
        if (!client) return;
        client.schedulePush();
    } catch (_) {}
}

// Page-hide flush so the last few cards are not lost when the tab closes.
function _srsSyncFlush() {
    try {
        if (!_fcSyncAllowed()) return;
        var client = _fcSyncClient();
        if (!client) return;
        client.flush();
    } catch (_) {}
}

function _srsRoundId(surface) {
    var randomPart = Math.floor(Math.random() * 1679616).toString(36);
    while (randomPart.length < 4) randomPart = '0' + randomPart;
    return surface + '-' + Date.now() + '-' + randomPart;
}

function _srsCsvFor(topic) {
    try {
        var path = (typeof _bfCsvPath === 'function') ? _bfCsvPath(topic) : null;
        if (!path) return null;
        var clean = String(path).split(/[?#]/)[0];
        var parts = clean.split('/');
        return parts[parts.length - 1] || null;
    } catch (_) { return null; }
}

function _srsStemHash(stem) {
    try {
        if (typeof FlashcardSrs !== 'undefined'
            && FlashcardSrs
            && typeof FlashcardSrs.stemHash === 'function') {
            return FlashcardSrs.stemHash(stem);
        }
        var normalized = String(stem == null ? '' : stem)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        var hash = 5381;
        for (var i = 0; i < normalized.length; i++) {
            hash = (((hash << 5) + hash) + normalized.charCodeAt(i)) >>> 0;
        }
        return ('00000000' + hash.toString(16)).slice(-8);
    } catch (_) { return '00001505'; }
}

// CSV walker that handles quoted fields including embedded newlines + commas.
function _bfParseCsv(text) {
    var rows = [];
    var cur = '';
    var row = [];
    var inQuote = false;
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (c === '"') {
            if (inQuote && text[i+1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            row.push(cur); cur = '';
        } else if ((c === '\n' || c === '\r') && !inQuote) {
            if (c === '\r' && text[i+1] === '\n') i++;
            row.push(cur); cur = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else { cur += c; }
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
}

// Convert CSV rows to deck cards. Blooket Import Template columns:
// 0=Question #, 1=Question Text, 2-5=Answers 1-4, 6=Time, 7=Correct #.
// Skips header rows (the first 3 rows are template metadata + column headers).
function _bfRowsToDeck(rows) {
    var deck = [];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        // Skip rows without a numeric Q# in column 0 — gets us past header rows.
        var qnum = parseInt((r[0] || '').trim(), 10);
        if (!Number.isFinite(qnum)) continue;
        var qText = (r[1] || '').trim();
        if (!qText) continue;
        var choices = [];
        for (var j = 2; j <= 5; j++) {
            var v = (r[j] || '').trim();
            if (v) choices.push(v);
        }
        if (choices.length < 2) continue;
        var correctIdx = parseInt((r[7] || '1').trim(), 10) - 1;
        if (correctIdx < 0 || correctIdx >= choices.length) correctIdx = 0;
        // qnum carried so _bfSelectTop10 can look up the difficulty tag.
        deck.push({ qnum: qnum, q: qText, choices: choices, correctIdx: correctIdx });
    }
    return deck;
}

// 2026-05-20: difficulty tags built by codex against the AP framework.
// Cached once per session. Empty object on any fetch / parse failure so
// the deck builder gracefully falls back to "first 10 cards" semantics.
var _bfDifficultyTags = null;
async function _bfLoadDifficultyTags() {
    if (_bfDifficultyTags !== null) return _bfDifficultyTags;
    try {
        var res = await fetch('data/blooket-difficulty.json', { cache: 'no-cache' });
        if (!res.ok) { _bfDifficultyTags = {}; return _bfDifficultyTags; }
        var data = await res.json();
        _bfDifficultyTags = (data && data.tags) || {};
    } catch (_) { _bfDifficultyTags = {}; }
    return _bfDifficultyTags;
}

// data/blooket-deck-slices.json (FLASHCARD_DECK_SLICES_SPEC.md §2): the per-day Q#
// ranges of the combined-worksheet decks. Returns its .slices, cached for the session once
// it has loaded. A failed fetch or parse returns {} for this open only (the deck is dealt
// whole, still capped at 30) and is NOT cached, so the next open tries again: a cached
// failure dealt every later deck whole, and a whole-deck run records DESK_DONE, which the
// server shares across a per-day worksheet group.
var _bfDeckSlices = null;
async function _bfLoadDeckSlices() {
    if (_bfDeckSlices !== null) return _bfDeckSlices;
    try {
        var res = await fetch('data/blooket-deck-slices.json', { cache: 'no-cache' });
        if (!res.ok) return {};
        var data = await res.json();
        _bfDeckSlices = (data && data.slices) || {};
        return _bfDeckSlices;
    } catch (_) {
        return {};
    }
}

// Select the top 10 cards from a parsed deck using the difficulty tags
// for that CSV. Order: hard, then med, then easy, then untagged.
// If the CSV has 10 or fewer cards, return them all unchanged.
// If no tags are available for the file, fall back to first-10 (preserves
// the pre-tagging UX for any lesson without coverage).
function _bfSelectTop10(allCards, csvFilename, tagsForFile) {
    var TARGET = 10;
    if (!allCards || allCards.length === 0) return [];
    if (allCards.length <= TARGET) return allCards.slice();
    if (!tagsForFile || Object.keys(tagsForFile).length === 0) {
        return allCards.slice(0, TARGET);
    }
    var hard = [], med = [], easy = [], untagged = [];
    for (var i = 0; i < allCards.length; i++) {
        var card = allCards[i];
        var tag = card && card.qnum != null ? tagsForFile[String(card.qnum)] : null;
        var diff = tag && tag.difficulty;
        if (diff === 'hard') hard.push(card);
        else if (diff === 'med') med.push(card);
        else if (diff === 'easy') easy.push(card);
        else untagged.push(card);
    }
    return hard.concat(med, easy, untagged).slice(0, TARGET);
}

// Full-pool twin of _bfSelectTop10's difficulty ordering. Keep the frozen
// selector above unchanged; retries need the ordered cards beyond its top 10.
function _bfOrderByDifficulty(allCards, tagsForFile) {
    if (!Array.isArray(allCards) || allCards.length === 0) return [];
    if (!tagsForFile || Object.keys(tagsForFile).length === 0) return allCards.slice();
    var hard = [];
    var med = [];
    var easy = [];
    var untagged = [];
    for (var i = 0; i < allCards.length; i++) {
        var card = allCards[i];
        var tag = card && card.qnum != null ? tagsForFile[String(card.qnum)] : null;
        var difficulty = tag && tag.difficulty;
        if (difficulty === 'hard') hard.push(card);
        else if (difficulty === 'med') med.push(card);
        else if (difficulty === 'easy') easy.push(card);
        else untagged.push(card);
    }
    return hard.concat(med, easy, untagged);
}

function _bfQnums(cards) {
    if (!Array.isArray(cards)) return [];
    var qnums = [];
    for (var i = 0; i < cards.length; i++) {
        if (!cards[i] || cards[i].qnum == null) continue;
        qnums.push(cards[i].qnum);
    }
    return qnums;
}

function _bfMergeSeenQnums(seenQnums, cards) {
    var merged = [];
    var included = {};
    var existing = Array.isArray(seenQnums) ? seenQnums : [];
    var i;
    for (i = 0; i < existing.length; i++) {
        var existingKey = String(existing[i]);
        if (included[existingKey]) continue;
        included[existingKey] = true;
        merged.push(existing[i]);
    }
    var deck = Array.isArray(cards) ? cards : [];
    for (i = 0; i < deck.length; i++) {
        if (!deck[i] || deck[i].qnum == null) continue;
        var deckKey = String(deck[i].qnum);
        if (included[deckKey]) continue;
        included[deckKey] = true;
        merged.push(deck[i].qnum);
    }
    return merged;
}

// Returns an unshuffled retry deck, or null when there are not enough unseen
// cards to refill to 10. The caller owns the exact legacy reshuffle fallback.
function _bfBuildRetryDeck(currentDeck, misses, poolQnums, seenQnums, allCards) {
    var TARGET = 10;
    if (!Array.isArray(currentDeck) || currentDeck.length === 0) return null;
    if (!Array.isArray(allCards) || allCards.length === 0) return null;
    if (!Array.isArray(poolQnums) || poolQnums.length === 0) return null;

    var cardsByQnum = {};
    var i;
    for (i = 0; i < allCards.length; i++) {
        var poolCard = allCards[i];
        if (!poolCard || poolCard.qnum == null) continue;
        cardsByQnum[String(poolCard.qnum)] = poolCard;
    }
    for (i = 0; i < currentDeck.length; i++) {
        var currentCard = currentDeck[i];
        if (!currentCard || currentCard.qnum == null) continue;
        cardsByQnum[String(currentCard.qnum)] = currentCard;
    }

    var retryDeck = [];
    var included = {};
    var missedCards = Array.isArray(misses) ? misses : [];
    for (i = 0; i < missedCards.length; i++) {
        var miss = missedCards[i];
        if (!miss || miss.qnum == null) continue;
        var missKey = String(miss.qnum);
        if (included[missKey] || !cardsByQnum[missKey]) continue;
        included[missKey] = true;
        retryDeck.push(cardsByQnum[missKey]);
    }
    if (retryDeck.length >= TARGET) return retryDeck.slice(0, TARGET);

    var seen = {};
    var previousSeen = Array.isArray(seenQnums) ? seenQnums : [];
    for (i = 0; i < previousSeen.length; i++) seen[String(previousSeen[i])] = true;
    for (i = 0; i < currentDeck.length; i++) {
        if (!currentDeck[i] || currentDeck[i].qnum == null) continue;
        seen[String(currentDeck[i].qnum)] = true;
    }

    for (i = 0; i < poolQnums.length; i++) {
        var qnumKey = String(poolQnums[i]);
        if (seen[qnumKey] || included[qnumKey] || !cardsByQnum[qnumKey]) continue;
        included[qnumKey] = true;
        retryDeck.push(cardsByQnum[qnumKey]);
        if (retryDeck.length === TARGET) return retryDeck;
    }
    return null;
}

async function _bfLoadAllCardsForRetry() {
    if (Array.isArray(_bfState.allCards) && _bfState.allCards.length) return true;
    var topicId = _bfState.topic;
    var csvPath = (typeof _bfCsvPath === 'function') ? _bfCsvPath(topicId) : null;
    if (!topicId || !csvPath) return false;
    try {
        var response = await fetch(csvPath);
        if (!response.ok) return false;
        var text = await response.text();
        var allCards = _bfRowsToDeck(_bfParseCsv(text));
        if (!allCards.length || _bfState.topic !== topicId) return false;
        _bfState.allCards = allCards.slice();
        if (!Array.isArray(_bfState.poolQnums) || !_bfState.poolQnums.length) {
            var tags = (typeof _bfLoadDifficultyTags === 'function')
                ? await _bfLoadDifficultyTags()
                : {};
            if (_bfState.topic !== topicId) return false;
            var filename = csvPath.split('/').pop();
            var tagsForFile = tags[filename] || tags[csvPath] || {};
            var ordered = (typeof _bfOrderByDifficulty === 'function')
                ? _bfOrderByDifficulty(allCards, tagsForFile)
                : allCards.slice();
            _bfState.poolQnums = (typeof _bfQnums === 'function')
                ? _bfQnums(ordered)
                : ordered.map(function (card) { return card.qnum; });
        }
        if (!Array.isArray(_bfState.seenQnums) || !_bfState.seenQnums.length) {
            _bfState.seenQnums = (typeof _bfMergeSeenQnums === 'function')
                ? _bfMergeSeenQnums([], _bfState.deck)
                : [];
        }
        return true;
    } catch (_) {
        return false;
    }
}

function _bfShuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function _bfMulberry32(seed) {
    var state = seed >>> 0;
    return function () {
        state = (state + 0x6D2B79F5) >>> 0;
        var t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _bfPermSeed(email, roundId, qnum) {
    var text = String(email) + '|' + String(roundId) + '|' + String(qnum);
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
        hash = (((hash << 5) + hash) + text.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
}

function _bfPermutationFor(seed, n) {
    var permutation = [];
    for (var i = 0; i < n; i++) permutation.push(i);
    if (n <= 1) return permutation;
    var random = _bfMulberry32(seed);
    for (var j = n - 1; j > 0; j--) {
        var swapIndex = Math.floor(random() * (j + 1));
        var value = permutation[j];
        permutation[j] = permutation[swapIndex];
        permutation[swapIndex] = value;
    }
    return permutation;
}

function _bfIsPermutationUnsafe(choices) {
    var list = choices || [];
    for (var i = 0; i < list.length; i++) {
        if (/\b(all|none) of (these|the above)\b/i.test(String(list[i]))) return true;
    }
    return false;
}

// 2026-05-20: modal-scoped keyboard nav. Attached on flashcard modal
// open, detached on close. a-d (or 1-4) → answer that choice
// immediately. Enter / Space → next card when one is queued.
function _bfKeydownHandler(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var ae = document.activeElement;
    if (ae) {
        var tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ae.isContentEditable) return;
    }
    var ov = document.getElementById('bf-overlay');
    if (!ov || ov.style.display === 'none') return;
    var key = (e.key || '').toLowerCase();
    // Already-answered branch: Enter / Space advance to the next card.
    if (_bfState.answered) {
        if (key === 'enter' || key === ' ') {
            var nextBtn = document.getElementById('bf-next');
            if (nextBtn && nextBtn.style.display !== 'none') {
                e.preventDefault();
                nextBtn.click();
                return;
            }
            if (key === 'enter' && nextBtn && nextBtn.style.display === 'none'
                && _bfState.advanceId !== null) {
                e.preventDefault();
                _bfNext();
            }
        }
        return;
    }
    // Unanswered branch: letter or number selects immediately.
    var idx = -1;
    if (key === 'a' || key === 'b' || key === 'c' || key === 'd') {
        idx = 'abcd'.indexOf(key);
    } else if (key === '1' || key === '2' || key === '3' || key === '4') {
        idx = parseInt(key, 10) - 1;
    }
    if (idx < 0) return;
    var card = _bfState.deck && _bfState.deck[_bfState.idx];
    if (!card || idx >= card.choices.length) return;
    var realIdx = (Array.isArray(_bfState.perm) && typeof _bfState.perm[idx] === 'number')
        ? _bfState.perm[idx]
        : idx;
    e.preventDefault();
    _bfAnswer(realIdx);
}

// Entry point (from studentMark): go straight into the full timed deck — it is the
// only graded flashcard mode (teacher, 2026-09-13: "should just be full deck timed").
// There is no mode picker any more. Practice-only review mode is reached from the
// Do Now "Review due (N)" chip (_rvStartMixed); the quick check engine
// (_bfStartQuick) is retained for flashcards.js parity tests but is unreachable.
async function openBlooketFlashcards(btn, topicId) {
    // Codex BLOCKER fold P2: opening the Blooket flashcard quiz in view-as
    // mode would let the teacher drive a quiz that writes back as themselves
    // -- block at the entry point.
    if (typeof _viewAsContext === 'function' && _viewAsContext()) {
      if (typeof _showViewAsToast === 'function') {
        _showViewAsToast('Read-only view: cannot open the flashcard quiz for this student.');
      }
      return;
    }
    try { if (typeof _srsSyncPull === 'function') _srsSyncPull(); } catch (_) {}
    _ftStart(btn, topicId);
}

// One sentence every student sees before the first card: the deck IS the Blooket credit.
// perDay: the deck is this day's slice of a combined worksheet's deck (spec D5).
function _bfCreditNote(topicId, perDay) {
    var note = 'This timed deck is your Blooket grade for this lesson. Your best score counts, point for point, up to 100% — there is no pass mark.';
    if (perDay) note += ' This deck covers ' + cedLabel(topicId).text + ' only — the other days of this worksheet have their own decks.';
    var best = (typeof _blooketScoreFor === 'function') ? _blooketScoreFor(topicId) : null;
    if (typeof best === 'number') note += ' Your best so far: ' + best + '%.';
    return note;
}

// Show/hide the quiz UI vs the mode picker (both share the bf-overlay modal).
function _bfHideQuizUI() {
    ['bf-progress', 'bf-question', 'bf-choices', 'bf-feedback', 'bf-timer'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    var r = document.getElementById('bf-result'); if (r) r.style.display = 'none';
    var n = document.getElementById('bf-next'); if (n) n.style.display = 'none';
}
function _bfShowQuizUI(timed) {
    var mp = document.getElementById('bf-modepick'); if (mp) mp.style.display = 'none';
    ['bf-progress', 'bf-question', 'bf-choices', 'bf-feedback'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.style.display = '';
    });
    var t = document.getElementById('bf-timer'); if (t) t.style.display = timed ? 'block' : 'none';
}

function _rvRestoreActions() {
    var actions = document.getElementById('bf-actions');
    if (!actions) return;
    while (actions.firstChild) actions.removeChild(actions.firstChild);
    var next = document.createElement('button');
    next.id = 'bf-next';
    next.className = 's7btn s7btn-default';
    next.style.display = 'none';
    next.textContent = 'Next';
    next.onclick = function () {
        if (typeof _bfNext === 'function') _bfNext();
    };
    var cancel = document.createElement('button');
    cancel.className = 's7btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = function () {
        if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
    };
    actions.appendChild(next);
    actions.appendChild(cancel);
}

async function _rvStart(btn, topicId) {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardStore === 'undefined'
        || !FlashcardStore) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'Review is unavailable right now.', 'OK');
        return;
    }
    var csvPath = (typeof _bfCsvPath === 'function') ? _bfCsvPath(topicId) : null;
    if (!csvPath) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'No flashcard deck available for this lesson yet.', 'OK');
        return;
    }
    var text;
    try {
        var response = await fetch(csvPath);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        text = await response.text();
    } catch (_) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'Could not load the flashcard deck. Try again.', 'OK');
        return;
    }
    var allCards = _bfRowsToDeck(_bfParseCsv(text));
    if (!allCards.length) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'The flashcard deck for this lesson is empty.', 'OK');
        return;
    }
    var foldedState = (typeof _srsFoldedState === 'function') ? _srsFoldedState() : null;
    if (!foldedState) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'Sign in to review your due cards.', 'OK');
        return;
    }
    var csv = (typeof _srsCsvFor === 'function') ? _srsCsvFor(topicId) : null;
    if (!csv) {
        var cleanPath = String(csvPath).split(/[?#]/)[0].split('/');
        csv = cleanPath[cleanPath.length - 1];
    }
    var now = Date.now();
    var store = foldedState.store;
    var log = foldedState.log;
    var folded = foldedState.folded;
    store.save(folded);

    var prefix = String(csv) + '#';
    var dueIds = FlashcardSrs.dueCards(folded, FlashcardSrs.dayIndex(now));
    var cardsByQnum = {};
    var i;
    for (i = 0; i < allCards.length; i++) {
        cardsByQnum[String(allCards[i].qnum)] = allCards[i];
    }
    var queue = [];
    for (i = 0; i < dueIds.length; i++) {
        if (String(dueIds[i]).indexOf(prefix) !== 0) continue;
        var dueCard = cardsByQnum[String(dueIds[i]).slice(prefix.length)];
        if (dueCard) queue.push(dueCard);
    }
    queue = queue.slice(0, 20);
    if (!queue.length) {
        var missed = {};
        for (i = 0; i < log.length; i++) {
            var entry = log[i];
            if (!entry || entry.csv !== csv || entry.correct !== false) continue;
            var missedKey = String(entry.qnum);
            if (missed[missedKey] || !cardsByQnum[missedKey]) continue;
            missed[missedKey] = true;
            queue.push(cardsByQnum[missedKey]);
        }
    }
    if (!queue.length) queue = allCards.slice();

    _rvState.topic = topicId;
    _rvState.btn = btn;
    _rvState.csv = csv;
    _rvState.mixed = false;
    _rvState.queue = queue.slice(0, 20);
    _rvState.idx = 0;
    _rvState.ratings = 0;
    _rvState.roundId = (typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null;
    _rvState.round = folded;
    _rvState.seq = 0;
    _rvState.cardStart = 0;
    _rvState.current = null;
    _rvState.stage = 'answer';
    _rvState.store = store;
    _rvState.folded = folded;
    _rvState.deckCardsByCsv = {};
    _rvState.deckCardsByCsv[csv] = allCards.slice();

    var header = document.getElementById('bf-header');
    if (header) {
        while (header.firstChild) header.removeChild(header.firstChild);
        var title = document.createElement('span');
        title.textContent = 'Review — ' + cedLabel(topicId).text + ' (practice, not graded)';
        var close = document.createElement('button');
        close.className = 's7btn';
        close.style.cssText = 'float:right;padding:0 5px;min-width:24px';
        close.setAttribute('aria-label', 'Close review');
        close.textContent = '✕';
        close.onclick = function () {
            if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
        };
        header.appendChild(title);
        header.appendChild(close);
    }
    _bfShowQuizUI(false);
    var result = document.getElementById('bf-result');
    if (result) result.style.display = 'none';
    var overlay = document.getElementById('bf-overlay');
    if (overlay) overlay.style.display = 'block';
    _rvRenderCard();
    document.addEventListener('keydown', _rvKeydownHandler);
}

async function _rvStartMixed() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    if (typeof FlashcardSrs === 'undefined'
        || !FlashcardSrs
        || typeof FlashcardSrs.dueCards !== 'function') return;

    var foldedState = (typeof _srsFoldedState === 'function') ? _srsFoldedState() : null;
    if (!foldedState) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'Sign in to review your due cards.', 'OK');
        return;
    }
    var plansByCsv = (typeof _srsCoreDeckPlans === 'function') ? _srsCoreDeckPlans() : {};
    var todayDay = FlashcardSrs.dayIndex(Date.now());
    var orderedDueIds = FlashcardSrs.dueCards(foldedState.folded, todayDay);
    var allowedDueIds = [];
    var i;
    for (i = 0; i < orderedDueIds.length; i++) {
        var orderedDueId = String(orderedDueIds[i]);
        var orderedSplit = orderedDueId.lastIndexOf('#');
        if (orderedSplit <= 0) continue;
        if (!plansByCsv[orderedDueId.slice(0, orderedSplit)]) continue;
        allowedDueIds.push(orderedDueId);
    }
    var dueIds = allowedDueIds.slice(0, 20);
    if (!dueIds.length) {
        if (typeof showDialog === 'function') showDialog('✓', 'No core flashcards are due today.', 'OK');
        return;
    }

    var neededCsvs = {};
    var dueParts = [];
    for (i = 0; i < dueIds.length; i++) {
        var dueId = String(dueIds[i]);
        var splitAt = dueId.lastIndexOf('#');
        if (splitAt <= 0) continue;
        var dueCsv = dueId.slice(0, splitAt);
        neededCsvs[dueCsv] = true;
        dueParts.push({ csv: dueCsv, qnum: dueId.slice(splitAt + 1) });
    }

    var plans = Object.keys(plansByCsv).filter(function (csv) {
        return neededCsvs[csv];
    }).map(function (csv) {
        return plansByCsv[csv];
    });
    var loaded;
    try {
        loaded = await Promise.all(plans.map(function (plan) {
            return fetch(plan.path).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            }).then(function (text) {
                return { plan: plan, text: text };
            });
        }));
    } catch (_) {
        if (typeof showDialog === 'function') showDialog('⚠️', 'Could not load the due flashcard decks. Try again.', 'OK');
        return;
    }

    var decksByCsv = {};
    for (i = 0; i < loaded.length; i++) {
        var loadedDeck = loaded[i];
        var cards = _bfRowsToDeck(_bfParseCsv(loadedDeck.text));
        var cardsByQnum = {};
        var deckCards = [];
        for (var j = 0; j < cards.length; j++) {
            var deckCard = {};
            for (var deckKey in cards[j]) deckCard[deckKey] = cards[j][deckKey];
            deckCard._rvTopic = loadedDeck.plan.topic;
            deckCard._rvCsv = loadedDeck.plan.csv;
            deckCard._rvLabel = loadedDeck.plan.label;
            cardsByQnum[String(deckCard.qnum)] = deckCard;
            deckCards.push(deckCard);
        }
        decksByCsv[loadedDeck.plan.csv] = {
            plan: loadedDeck.plan,
            cards: cardsByQnum,
            deckCards: deckCards
        };
    }

    var queue = [];
    for (i = 0; i < dueParts.length; i++) {
        var part = dueParts[i];
        var deck = decksByCsv[part.csv];
        var sourceCard = deck && deck.cards[part.qnum];
        if (!sourceCard) continue;
        var card = {};
        for (var key in sourceCard) card[key] = sourceCard[key];
        card._rvTopic = deck.plan.topic;
        card._rvCsv = deck.plan.csv;
        card._rvLabel = deck.plan.label;
        queue.push(card);
    }
    if (!queue.length) {
        if (typeof showDialog === 'function') showDialog('✓', 'No core flashcards are due today.', 'OK');
        return;
    }

    foldedState.store.save(foldedState.folded);
    _rvState.topic = null;
    _rvState.btn = null;
    _rvState.csv = null;
    _rvState.mixed = true;
    _rvState.queue = queue;
    _rvState.idx = 0;
    _rvState.ratings = 0;
    _rvState.roundId = (typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null;
    _rvState.round = foldedState.folded;
    _rvState.seq = 0;
    _rvState.cardStart = 0;
    _rvState.current = null;
    _rvState.stage = 'answer';
    _rvState.store = foldedState.store;
    _rvState.folded = foldedState.folded;
    _rvState.deckCardsByCsv = {};
    var loadedCsvs = Object.keys(decksByCsv);
    for (i = 0; i < loadedCsvs.length; i++) {
        _rvState.deckCardsByCsv[loadedCsvs[i]] = decksByCsv[loadedCsvs[i]].deckCards.slice();
    }

    var header = document.getElementById('bf-header');
    if (header) {
        while (header.firstChild) header.removeChild(header.firstChild);
        var title = document.createElement('span');
        title.textContent = 'Spaced repetition practice only \u2014 never for a grade';
        var close = document.createElement('button');
        close.className = 's7btn';
        close.style.cssText = 'float:right;padding:0 5px;min-width:24px';
        close.setAttribute('aria-label', 'Close review');
        close.textContent = '✕';
        close.onclick = function () {
            if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
        };
        header.appendChild(title);
        header.appendChild(close);
    }
    _bfShowQuizUI(false);
    var result = document.getElementById('bf-result');
    if (result) result.style.display = 'none';
    var overlay = document.getElementById('bf-overlay');
    if (overlay) overlay.style.display = 'block';
    _rvRenderCard();
    document.addEventListener('keydown', _rvKeydownHandler);
}

function _rvRenderCard() {
    if (!_rvState.queue.length) {
        _rvFinish();
        return;
    }
    var card = _rvState.queue.shift();
    delete card._rvCorrect;
    delete card._rvChosenIdx;
    _rvState.current = card;
    _rvState.idx = _rvState.ratings;
    _rvState.stage = 'answer';
    _rvState.cardStart = Date.now();

    var feedback = document.getElementById('bf-feedback');
    var question = document.getElementById('bf-question');
    var choices = document.getElementById('bf-choices');
    var progress = document.getElementById('bf-progress');
    var actions = document.getElementById('bf-actions');
    if (feedback) feedback.textContent = '';
    if (question) {
        question.textContent = '';
        if (_rvState.mixed && card._rvLabel) {
            var label = document.createElement('div');
            label.className = 'geneva';
            label.style.cssText = 'font-size:10px;color:#666;margin-bottom:5px';
            label.textContent = card._rvLabel;
            question.appendChild(label);
        }
        var stem = document.createElement('div');
        stem.textContent = card.q;
        question.appendChild(stem);
    }
    if (progress) {
        progress.textContent = 'Review ' + (_rvState.ratings + 1)
            + ' of up to 20 · ' + _rvState.queue.length + ' waiting'
            + ' · Keys: a-d or 1-4 to answer';
    }
    if (actions) while (actions.firstChild) actions.removeChild(actions.firstChild);
    if (!choices) return;
    while (choices.firstChild) choices.removeChild(choices.firstChild);
    for (var i = 0; i < card.choices.length; i++) {
        (function (choiceIdx) {
            var choice = document.createElement('button');
            choice.className = 'bf-choice';
            choice.textContent = String.fromCharCode(65 + choiceIdx) + '. ' + card.choices[choiceIdx];
            choice.onclick = function () { _rvAnswer(choiceIdx); };
            choices.appendChild(choice);
        })(i);
    }
    var unsure = document.createElement('button');
    unsure.className = 'bf-choice';
    unsure.textContent = "I'm not sure";
    unsure.onclick = function () { _rvAnswer(null); };
    choices.appendChild(unsure);
    try {
        var firstChoice = choices.querySelector('.bf-choice');
        if (firstChoice && typeof firstChoice.focus === 'function') firstChoice.focus();
    } catch (_) {}
}

function _rvAnswer(idx) {
    if (_rvState.stage !== 'answer' || !_rvState.current) return;
    var card = _rvState.current;
    var chosenIdx = (typeof idx === 'number') ? idx : -1;
    var isRight = chosenIdx === card.correctIdx;
    card._rvCorrect = isRight;
    card._rvChosenIdx = chosenIdx;
    _rvState.stage = 'rate';

    var choices = document.getElementById('bf-choices');
    var feedback = document.getElementById('bf-feedback');
    if (choices) {
        var choiceButtons = choices.querySelectorAll('button');
        for (var i = 0; i < choiceButtons.length; i++) {
            choiceButtons[i].disabled = true;
            if (i === card.correctIdx) choiceButtons[i].classList.add('bf-correct');
            else if (i === chosenIdx) choiceButtons[i].classList.add('bf-wrong');
        }
    }
    if (feedback) {
        feedback.textContent = isRight
            ? 'Right. How well did you know it?'
            : 'Correct answer: ' + String.fromCharCode(65 + card.correctIdx)
              + '. ' + card.choices[card.correctIdx];
    }

    var actions = document.getElementById('bf-actions');
    if (!actions) return;
    while (actions.firstChild) actions.removeChild(actions.firstChild);
    var grades = isRight ? ['good', 'easy'] : ['again', 'hard'];
    var labels = isRight ? ['Good', 'Easy'] : ['Again', 'Hard'];
    for (var j = 0; j < grades.length; j++) {
        (function (grade, label) {
            var rate = document.createElement('button');
            rate.className = 's7btn s7btn-default';
            rate.style.marginLeft = '6px';
            rate.textContent = label;
            rate.onclick = function () { _rvRate(grade); };
            actions.appendChild(rate);
        })(grades[j], labels[j]);
    }
}

function _rvRate(grade) {
    if (_rvState.stage !== 'rate' || !_rvState.current) return;
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    if (grade !== 'again' && grade !== 'hard' && grade !== 'good' && grade !== 'easy') return;
    _rvState.stage = 'saving';
    var card = _rvState.current;
    var now = Date.now();
    var logSeq = _rvState.seq++;
    var entryTopic = (_rvState.mixed && card._rvTopic) ? card._rvTopic : _rvState.topic;
    var entryCsv = (_rvState.mixed && card._rvCsv) ? card._rvCsv : _rvState.csv;
    var entry = {
        topic: entryTopic,
        qnum: card.qnum,
        correct: card._rvCorrect === true,
        latencyMs: (now - _rvState.cardStart) || 0,
        wasTimeout: false,
        missIndex: 0,
        ts: now,
        mode: 'review',
        csv: entryCsv,
        surface: 'desk',
        roundId: _rvState.roundId,
        seq: logSeq,
        nChoices: card.choices.length,
        chosenIdx: typeof card._rvChosenIdx === 'number' ? card._rvChosenIdx : -1,
        review: grade,
        stemHash: (typeof FlashcardSrs.stemHash === 'function') ? FlashcardSrs.stemHash(card.q) : null
    };
    if (typeof _srsAppendLog === 'function') _srsAppendLog([entry]);

    var cardId = FlashcardSrs.cardId(entryCsv, card.qnum);
    var scheduled = _rvState.folded.cards[cardId];
    if (!scheduled && typeof FlashcardSrs.newCard === 'function') {
        scheduled = FlashcardSrs.newCard(entry.stemHash);
    }
    var today = FlashcardSrs.dayIndex(now);
    _rvState.folded.cards[cardId] = FlashcardSrs.applyGrade(scheduled, grade, today, now);
    if (!Array.isArray(_rvState.folded.seen)) _rvState.folded.seen = [];
    _rvState.folded.seen.push(String(_rvState.roundId) + '#' + String(logSeq));
    _rvState.store.save(_rvState.folded);
    if (typeof _fcFlag === 'function'
        && _fcFlag('flashcardSync')
        && typeof _srsSyncViaTrainerState === 'function') {
        _srsSyncViaTrainerState();
    }

    _rvState.ratings += 1;
    _rvState.idx = _rvState.ratings;
    if (grade === 'again') {
        var queuedIds = {};
        for (var queueIdx = 0; queueIdx < _rvState.queue.length; queueIdx++) {
            var queuedCard = _rvState.queue[queueIdx];
            var queuedCsv = (_rvState.mixed && queuedCard._rvCsv) ? queuedCard._rvCsv : entryCsv;
            queuedIds[FlashcardSrs.cardId(queuedCsv, queuedCard.qnum)] = true;
        }
        var deckCards = _rvState.deckCardsByCsv && _rvState.deckCardsByCsv[entryCsv]
            ? _rvState.deckCardsByCsv[entryCsv]
            : [];
        for (var deckIdx = 0; deckIdx < deckCards.length && _rvState.queue.length < 3; deckIdx++) {
            var paddingCard = deckCards[deckIdx];
            var paddingId = FlashcardSrs.cardId(entryCsv, paddingCard.qnum);
            if (paddingId === cardId || queuedIds[paddingId]) continue;
            var paddingState = _rvState.folded.cards[paddingId];
            if (paddingState && paddingState.dueDay <= today) continue;
            _rvState.queue.push(paddingCard);
            queuedIds[paddingId] = true;
        }
        var insertAt = Math.min(3, _rvState.queue.length);
        _rvState.queue.splice(insertAt, 0, card);
    }
    _rvState.current = null;
    _rvState.stage = 'answer';
    if (_rvState.ratings >= 20 || !_rvState.queue.length) {
        _rvFinish();
        return;
    }
    _rvRenderCard();
}

function _rvFinish() {
    _rvState.stage = 'finished';
    _rvState.current = null;
    var question = document.getElementById('bf-question');
    var choices = document.getElementById('bf-choices');
    var progress = document.getElementById('bf-progress');
    var feedback = document.getElementById('bf-feedback');
    var actions = document.getElementById('bf-actions');
    if (question) question.textContent = '';
    if (choices) while (choices.firstChild) choices.removeChild(choices.firstChild);
    if (progress) progress.textContent = '';
    if (feedback) feedback.textContent = '';
    if (actions) while (actions.firstChild) actions.removeChild(actions.firstChild);

    var today = null;
    var nextDueDay = null;
    if (_rvState.folded
        && typeof FlashcardSrs !== 'undefined'
        && FlashcardSrs
        && typeof FlashcardSrs.dayIndex === 'function') {
        today = FlashcardSrs.dayIndex(Date.now());
        var targetCsvs = {};
        if (_rvState.mixed && _rvState.deckCardsByCsv) {
            var mixedCsvs = Object.keys(_rvState.deckCardsByCsv);
            for (var m = 0; m < mixedCsvs.length; m++) targetCsvs[mixedCsvs[m]] = true;
        } else if (_rvState.csv) {
            targetCsvs[String(_rvState.csv)] = true;
        }
        var scheduledCards = _rvState.folded.cards || {};
        var scheduledIds = Object.keys(scheduledCards);
        for (var i = 0; i < scheduledIds.length; i++) {
            var scheduledId = String(scheduledIds[i]);
            var splitAt = scheduledId.lastIndexOf('#');
            if (splitAt <= 0 || !targetCsvs[scheduledId.slice(0, splitAt)]) continue;
            var dueDay = Number(scheduledCards[scheduledId].dueDay);
            if (!isFinite(dueDay)) continue;
            if (nextDueDay === null || dueDay < nextDueDay) nextDueDay = dueDay;
        }
    }
    var nextDueText = 'today';
    if (today !== null && nextDueDay !== null && nextDueDay > today) {
        nextDueText = nextDueDay === today + 1
            ? 'tomorrow'
            : 'in ' + (nextDueDay - today) + ' days';
    }
    var result = document.getElementById('bf-result');
    if (!result) return;
    while (result.firstChild) result.removeChild(result.firstChild);
    var summary = document.createElement('div');
    summary.className = 'bf-result-pass';
    summary.textContent = _rvState.ratings + ' reviewed · next due ' + nextDueText;
    var close = document.createElement('button');
    close.className = 's7btn s7btn-default';
    close.style.marginTop = '8px';
    close.textContent = 'Close';
    close.onclick = function () {
        if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
    };
    result.appendChild(summary);
    result.appendChild(close);
    result.style.display = 'block';
}

function _rvKeydownHandler(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var active = document.activeElement;
    if (active) {
        var tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (active.isContentEditable) return;
    }
    var overlay = document.getElementById('bf-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    var key = (e.key || '').toLowerCase();
    if (key === 'escape') {
        e.preventDefault();
        if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
        return;
    }
    if (_rvState.stage === 'rate') {
        if (key !== '1' && key !== '2') return;
        var actions = document.getElementById('bf-actions');
        var rateButtons = actions ? actions.querySelectorAll('button') : [];
        var rateIdx = parseInt(key, 10) - 1;
        if (!rateButtons[rateIdx]) return;
        e.preventDefault();
        rateButtons[rateIdx].click();
        return;
    }
    if (_rvState.stage !== 'answer' || !_rvState.current) return;
    var idx = -1;
    if (key === 'a' || key === 'b' || key === 'c' || key === 'd') {
        idx = 'abcd'.indexOf(key);
    } else if (key === '1' || key === '2' || key === '3' || key === '4') {
        idx = parseInt(key, 10) - 1;
    }
    if (idx < 0 || idx >= _rvState.current.choices.length) return;
    e.preventDefault();
    _rvAnswer(idx);
}

// Quick check (top-10, untimed, early-stop 8/10, caps 80%). Unchanged behavior,
// extracted from the old openBlooketFlashcards so the picker can route to it.
async function _bfStartQuick(btn, topicId) {
    // 2026-05-20: try to resume saved progress first. If present, use the
    // saved deck (preserves the shuffle order so the student picks up at
    // the same card) and skip the CSV fetch entirely.
    var resumed = _bfLoadProgress(topicId);
    var isResume = false;
    var finishOnResume = false;
    if (resumed) {
        _bfState.topic = topicId;
        _bfState.btn = btn;
        _bfState.deck = resumed.deck;
        _bfState.idx = resumed.idx || 0;
        _bfState.score = resumed.score || 0;
        _bfState.answered = false;
        _bfState.finished = false;
        var canReuseRoundId = typeof resumed.roundId === 'string'
            && resumed.roundId.indexOf('desk-') === 0;
        _bfState.roundId = canReuseRoundId
            ? resumed.roundId
            : ((typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null);
        _bfState.seq = canReuseRoundId
            && typeof resumed.seq === 'number'
            && resumed.seq >= 0
            ? resumed.seq
            : 0;
        _bfState.cardStart = 0;
        _bfState.misses = Array.isArray(resumed.misses) ? resumed.misses.slice() : [];
        _bfState.primedQnums = Array.isArray(resumed.primedQnums)
            ? resumed.primedQnums.slice()
            : [];
        _bfState.poolQnums = Array.isArray(resumed.poolQnums) ? resumed.poolQnums.slice() : [];
        var resumedSeen = Array.isArray(resumed.seenQnums) ? resumed.seenQnums.slice() : [];
        _bfState.seenQnums = (typeof _bfMergeSeenQnums === 'function')
            ? _bfMergeSeenQnums(resumedSeen, resumed.deck)
            : resumedSeen;
        _bfState.allCards = [];
        _bfState.lastFinishAt = null;
        if (resumed.answered === true) {
            _bfState.idx = (resumed.idx || 0) + 1;
            _bfState.answered = false;
            var passCount = Math.ceil(BLOOKET_PASS_THRESHOLD * _bfState.deck.length);
            finishOnResume = _bfState.score >= passCount || _bfState.idx >= _bfState.deck.length;
        }
        if (!canReuseRoundId) _bfSaveProgress();
        isResume = true;
    } else {
        // Fresh load from CSV.
        var csvPath = _bfCsvPath(topicId);
        if (!csvPath) {
            showDialog('⚠️', 'No flashcard deck available for this lesson yet.', 'OK');
            return;
        }
        var text;
        try {
            var res = await fetch(csvPath);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            text = await res.text();
        } catch (e) {
            showDialog('⚠️', 'Could not load the flashcard deck. Try again.', 'OK');
            return;
        }
        var allCards = _bfRowsToDeck(_bfParseCsv(text));
        if (!allCards.length) {
            showDialog('⚠️', 'The flashcard deck for this lesson is empty.', 'OK');
            return;
        }
        // 2026-05-20: trim to top-10 by difficulty (hard > med > easy).
        // If no tags available for this CSV, falls back to first-10.
        var tags = await _bfLoadDifficultyTags();
        var fileTags = tags[csvPath.split('/').pop()] || tags[csvPath] || {};
        var deck = _bfSelectTop10(allCards, csvPath, fileTags);
        var orderedCards = (typeof _bfOrderByDifficulty === 'function')
            ? _bfOrderByDifficulty(allCards, fileTags)
            : allCards.slice();
        _bfState.topic = topicId;
        _bfState.btn = btn;
        _bfState.deck = _bfShuffle(deck);
        _bfState.idx = 0;
        _bfState.score = 0;
        _bfState.answered = false;
        _bfState.finished = false;
        _bfState.roundId = (typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null;
        _bfState.seq = 0;
        _bfState.cardStart = 0;
        _bfState.misses = [];
        _bfState.primedQnums = [];
        _bfState.poolQnums = (typeof _bfQnums === 'function')
            ? _bfQnums(orderedCards)
            : orderedCards.map(function (card) { return card.qnum; });
        _bfState.seenQnums = (typeof _bfMergeSeenQnums === 'function')
            ? _bfMergeSeenQnums([], deck)
            : deck.map(function (card) { return card.qnum; });
        _bfState.allCards = allCards.slice();
        _bfState.lastFinishAt = null;
        _bfSaveProgress();
    }
    var header = document.getElementById('bf-header');
    if (header) header.textContent = 'Quick check — ' + cedLabel(topicId).text + (isResume ? ' (resuming)' : '') + ' (pass ≥ 80%, caps at 80%)';
    _bfShowQuizUI(false);  // hide the picker, show the quiz, no timer
    document.getElementById('bf-result').style.display = 'none';
    if (finishOnResume) {
        _bfFinish();
    } else {
        _bfRenderCard();
    }
    document.getElementById('bf-overlay').style.display = 'block';
    // Attach modal-scoped keyboard nav. Detached in _bfCloseUI.
    document.addEventListener('keydown', _bfKeydownHandler);
}

function _bfRenderCard() {
    var feedback = document.getElementById('bf-feedback');
    var nextBtn = document.getElementById('bf-next');
    var q = document.getElementById('bf-question');
    var c = document.getElementById('bf-choices');
    var p = document.getElementById('bf-progress');
    if (feedback) feedback.textContent = '';
    if (nextBtn) nextBtn.style.display = 'none';
    _bfState.answered = false;
    if (_bfState.idx >= _bfState.deck.length) {
        _bfFinish();
        return;
    }
    var card = _bfState.deck[_bfState.idx];
    var identity = [];
    for (var identityIdx = 0; identityIdx < card.choices.length; identityIdx++) {
        identity.push(identityIdx);
    }
    var permutationEnabled = typeof _fcFlag === 'function' && _fcFlag('choicePermutation');
    var permutationUnsafe = typeof _bfIsPermutationUnsafe === 'function'
        && _bfIsPermutationUnsafe(card.choices);
    var perm = identity;
    if (permutationEnabled && !permutationUnsafe
        && typeof _bfPermutationFor === 'function'
        && typeof _bfPermSeed === 'function') {
        var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
        perm = _bfPermutationFor(
            _bfPermSeed(email, _bfState.roundId, card.qnum),
            card.choices.length
        );
    }
    _bfState.perm = perm;
    _bfState.cardStart = Date.now();
    if (p) p.textContent = 'Question ' + (_bfState.idx + 1) + ' of ' + _bfState.deck.length
                         + '  ·  Right so far: ' + _bfState.score
                         + '  ·  Keys: a-d or 1-4 to answer, Enter for next';
    if (q) q.textContent = card.q;
    if (c) {
        while (c.firstChild) c.removeChild(c.firstChild);
        for (var i = 0; i < perm.length; i++) {
            (function (displayIdx, realIdx) {
                var b = document.createElement('button');
                b.className = 'bf-choice';
                b.setAttribute('data-i', String(realIdx));
                b.textContent = String.fromCharCode(65 + displayIdx) + '. ' + card.choices[realIdx];
                b.onclick = function () { _bfAnswer(realIdx); };
                c.appendChild(b);
            })(i, perm[i]);
        }
    }
    try {
        var firstChoice = c && c.querySelector('.bf-choice');
        if (firstChoice && typeof firstChoice.focus === 'function') firstChoice.focus();
    } catch (_) {}
}

function _bfAnswer(idx) {
    if (_bfState.answered) return;
    _bfState.answered = true;
    var card = _bfState.deck[_bfState.idx];
    var isRight = idx === card.correctIdx;
    if (isRight) _bfState.score += 1;
    if (!isRight) {
        if (!Array.isArray(_bfState.misses)) _bfState.misses = [];
        _bfState.misses.push({
            qnum: card.qnum,
            q: card.q,
            correctAnswer: card.choices[card.correctIdx]
        });
    }
    var now = Date.now();
    var topic = _bfState.topic;
    if (typeof _srsAppendLog === 'function') {
        _srsAppendLog([{
            topic: topic,
            qnum: card.qnum,
            correct: isRight,
            latencyMs: (now - _bfState.cardStart) || 0,
            wasTimeout: false,
            missIndex: (_bfState.primedQnums && _bfState.primedQnums.indexOf(card.qnum) !== -1) ? 1 : 0,
            ts: now,
            mode: 'quick',
            csv: (typeof _srsCsvFor === 'function') ? _srsCsvFor(topic) : null,
            surface: 'desk',
            roundId: _bfState.roundId,
            seq: _bfState.seq++,
            nChoices: card.choices.length,
            chosenIdx: idx,
            stemHash: (typeof _srsStemHash === 'function') ? _srsStemHash(card.q) : null,
            displayedPerm: Array.isArray(_bfState.perm)
                ? _bfState.perm.slice()
                : card.choices.map(function (_, choiceIdx) { return choiceIdx; })
        }]);
    }
    _bfSaveProgress();
    var c = document.getElementById('bf-choices');
    var feedback = document.getElementById('bf-feedback');
    var nextBtn = document.getElementById('bf-next');
    if (c) {
        var btns = c.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var buttonIdx = parseInt(btns[i].getAttribute('data-i'), 10);
            btns[i].disabled = true;
            if (buttonIdx === card.correctIdx) btns[i].classList.add('bf-correct');
            else if (buttonIdx === idx) btns[i].classList.add('bf-wrong');
        }
    }
    if (feedback) {
        var correctDisplayIdx = card.correctIdx;
        if (Array.isArray(_bfState.perm)) {
            for (var displayIdx = 0; displayIdx < _bfState.perm.length; displayIdx++) {
                if (_bfState.perm[displayIdx] === card.correctIdx) {
                    correctDisplayIdx = displayIdx;
                    break;
                }
            }
        }
        feedback.textContent = isRight
            ? 'Right.'
            : 'Wrong. Correct answer: ' + String.fromCharCode(65 + correctDisplayIdx)
              + '. ' + card.choices[card.correctIdx];
    }
    // Early-stop: once enough cards are correct to PASS (>=80% of the deck —
    // 8 of 10), stop here. The remaining cards can't change the pass, so don't
    // make the student answer them; show the result + mark complete.
    var _passCount = Math.ceil(BLOOKET_PASS_THRESHOLD * _bfState.deck.length);
    if (_bfState.score >= _passCount) {
        if (feedback) feedback.textContent += '  ✓ That’s a pass!';
        if (nextBtn) nextBtn.style.display = 'none';
        _bfState.finishId = setTimeout(function () {
            _bfState.finishId = null;
            _bfFinish();
        }, 900);   // brief beat so the student sees the feedback
        return;
    }
    if (isRight) {
        if (nextBtn) nextBtn.style.display = 'none';
        _bfState.advanceId = setTimeout(function () {
            _bfState.advanceId = null;
            _bfNext();
        }, 700);
        return;
    }
    if (nextBtn) nextBtn.style.display = 'inline-block';
}

function _bfNext() {
    if (_bfState.advanceId !== null) clearTimeout(_bfState.advanceId);
    _bfState.advanceId = null;
    if (_bfState.finishId !== null) clearTimeout(_bfState.finishId);
    _bfState.finishId = null;
    _bfState.idx += 1;
    _bfState.answered = false;
    _bfSaveProgress();   // persist advance so close/cancel resumes here
    _bfRenderCard();
}

async function _bfFinish() {
    if (_bfState.finished) return;
    _bfState.finished = true;
    var canScore = (typeof _mayScore !== 'function') || _mayScore();
    var pct = _bfState.deck.length > 0 ? (_bfState.score / _bfState.deck.length) : 0;
    var passed = pct >= BLOOKET_PASS_THRESHOLD;
    if (!passed) _bfState.lastFinishAt = Date.now();
    var q = document.getElementById('bf-question');
    var c = document.getElementById('bf-choices');
    var p = document.getElementById('bf-progress');
    var feedback = document.getElementById('bf-feedback');
    var nextBtn = document.getElementById('bf-next');
    if (q) q.textContent = '';
    if (c) while (c.firstChild) c.removeChild(c.firstChild);
    if (p) p.textContent = '';
    if (feedback) feedback.textContent = '';
    if (nextBtn) nextBtn.style.display = 'none';
    var result = document.getElementById('bf-result');
    if (result) {
        while (result.firstChild) result.removeChild(result.firstChild);
        var pctRound = Math.round(pct * 1000) / 10;
        var line1 = document.createElement('div');
        line1.textContent = 'You scored ' + _bfState.score + ' of ' + _bfState.deck.length
                          + ' (' + pctRound.toFixed(1) + '%).';
        result.appendChild(line1);
        var line2 = document.createElement('div');
        line2.style.marginTop = '6px';
        line2.className = passed ? 'bf-result-pass' : 'bf-result-fail';
        line2.textContent = passed
            ? (canScore
                ? '✓ Passed. Marking Done...'
                : '✓ Passed (view-only — not recorded).')
            : '✗ Need ≥ 80% to mark Done. Try again.';
        result.appendChild(line2);
        var misses = Array.isArray(_bfState.misses) ? _bfState.misses : [];
        var worksheetUrl = (typeof _bfWorksheetUrl === 'function')
            ? _bfWorksheetUrl(_bfState.topic)
            : null;
        if (misses.length) {
            var recapHeading = document.createElement('div');
            recapHeading.style.cssText = 'margin:8px 0 4px';
            recapHeading.textContent = 'Review your misses:';
            result.appendChild(recapHeading);
            var recapList = document.createElement('ul');
            recapList.style.cssText = 'margin:0;padding-left:18px';
            misses.forEach(function (miss) {
                var item = document.createElement('li');
                item.style.marginBottom = '6px';
                var stem = document.createElement('div');
                stem.textContent = miss.q;
                var answer = document.createElement('div');
                answer.style.color = '#25663F';
                answer.textContent = 'Answer: ' + miss.correctAnswer;
                item.appendChild(stem);
                item.appendChild(answer);
                var fragmentUrl = worksheetUrl && typeof _bfWorksheetFragmentUrl === 'function'
                    ? _bfWorksheetFragmentUrl(_bfState.topic, miss.q)
                    : null;
                if (fragmentUrl) {
                    var reviewLink = document.createElement('a');
                    reviewLink.href = fragmentUrl;
                    reviewLink.target = '_blank';
                    reviewLink.rel = 'noopener';
                    reviewLink.style.cssText = 'display:inline-block;margin-top:2px;font-size:10px;color:var(--accent-ink)';
                    reviewLink.textContent = 'Review in the worksheet ↗';
                    item.appendChild(reviewLink);
                }
                recapList.appendChild(item);
            });
            result.appendChild(recapList);
        } else {
            var perfect = document.createElement('div');
            perfect.style.cssText = 'margin-top:8px;color:var(--ok)';
            perfect.textContent = 'Perfect — no misses!';
            result.appendChild(perfect);
        }
        var closeBtn = passed ? document.createElement('button') : null;
        if (closeBtn) {
            var closeHandled = false;
            closeBtn.className = 's7btn s7btn-default';
            closeBtn.style.marginTop = '8px';
            closeBtn.textContent = 'Close';
            closeBtn.onclick = function () {
                if (closeHandled) return;
                closeHandled = true;
                if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
            };
            result.appendChild(closeBtn);
        }
        if (!passed) {
            var retryCooldownMs = 0;
            if (typeof BLOOKET_RETRY_COOLDOWN_MS !== 'undefined'
                && BLOOKET_RETRY_COOLDOWN_MS > 0) {
                retryCooldownMs = BLOOKET_RETRY_COOLDOWN_MS;
            }
            var retryWaitMs = retryCooldownMs > 0
                ? Math.max(0, retryCooldownMs - (Date.now() - _bfState.lastFinishAt))
                : 0;
            if (retryWaitMs > 0) {
                var retryNote = document.createElement('div');
                retryNote.style.marginTop = '8px';
                retryNote.textContent = 'Try again in ' + Math.ceil(retryWaitMs / 1000) + 's';
                result.appendChild(retryNote);
            } else {
                var retry = document.createElement('button');
                retry.className = 's7btn s7btn-default';
                retry.style.marginTop = '8px';
                retry.textContent = 'Try again (new shuffle)';
                retry.onclick = async function () {
                    retry.disabled = true;
                    var retryTopic = _bfState.topic;
                    var retryRoundId = _bfState.roundId;
                    var redrawDeck = null;
                    var retainedMissQnums = [];
                    var redrawEnabled = typeof _fcFlag === 'function'
                        && _fcFlag('quickRetryRedraw');
                    if (redrawEnabled && typeof _bfLoadAllCardsForRetry === 'function') {
                        var allCardsReady = await _bfLoadAllCardsForRetry();
                        if (allCardsReady && typeof _bfBuildRetryDeck === 'function') {
                            redrawDeck = _bfBuildRetryDeck(
                                _bfState.deck,
                                _bfState.misses,
                                _bfState.poolQnums,
                                _bfState.seenQnums,
                                _bfState.allCards
                            );
                        }
                    }
                    if (redrawDeck) {
                        var missedQnums = {};
                        var retryMisses = Array.isArray(_bfState.misses) ? _bfState.misses : [];
                        for (var missIdx = 0; missIdx < retryMisses.length; missIdx++) {
                            var retryMiss = retryMisses[missIdx];
                            if (!retryMiss || retryMiss.qnum == null) continue;
                            missedQnums[String(retryMiss.qnum)] = true;
                        }
                        for (var redrawIdx = 0; redrawIdx < redrawDeck.length; redrawIdx++) {
                            var redrawCard = redrawDeck[redrawIdx];
                            if (!redrawCard || redrawCard.qnum == null) continue;
                            if (!missedQnums[String(redrawCard.qnum)]) continue;
                            retainedMissQnums.push(redrawCard.qnum);
                        }
                    }
                    if (_bfState.topic !== retryTopic || _bfState.roundId !== retryRoundId) return;
                    if (redrawDeck) {
                        _bfState.primedQnums = retainedMissQnums;
                        _bfState.deck = _bfShuffle(redrawDeck);
                        if (typeof _bfMergeSeenQnums === 'function') {
                            _bfState.seenQnums = _bfMergeSeenQnums(
                                _bfState.seenQnums,
                                redrawDeck
                            );
                        }
                    } else {
                        _bfState.primedQnums = [];
                        _bfState.deck = _bfShuffle(_bfState.deck);
                    }
                    _bfState.idx = 0;
                    _bfState.score = 0;
                    _bfState.answered = false;
                    _bfState.finished = false;
                    _bfState.roundId = (typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null;
                    _bfState.seq = 0;
                    _bfState.cardStart = 0;
                    _bfState.misses = [];
                    _bfState.lastFinishAt = null;
                    result.style.display = 'none';
                    _bfSaveProgress();   // new shuffle → save so close-mid-retry resumes here
                    _bfRenderCard();
                };
                result.appendChild(retry);
            }
        }
        result.style.display = 'block';
    }
    if (passed) {
        if (!canScore) return;
        var btn = _bfState.btn;
        var topicId = _bfState.topic;
        var score = Math.round(pct * 1000) / 10;
        // Deck is complete and passed — clear saved progress so a future
        // re-do (e.g. for practice) starts a fresh shuffle.
        _bfClearProgress(topicId);
        // Brief pause so the student sees the pass message before the modal closes.
        var finishingRound = _bfState.roundId;
        setTimeout(async function () {
            if (finishingRound === _bfState.roundId) {
                _bfCloseUI();   // don't re-save on close; we just cleared.
            }
            await _blooketCommit(btn, topicId, score);   // best-wins + grade refresh
        }, 1200);
    }
}

// Internal: close the modal + reset in-memory state. Does NOT save or
// clear localStorage. Used by both Cancel (which DOES want to save
// progress beforehand) and the pass path (which already cleared).
function _bfCloseUI() {
    var ov = document.getElementById('bf-overlay');
    if (ov) ov.style.display = 'none';
    if (_bfState.finishId !== null) clearTimeout(_bfState.finishId);
    _bfState.finishId = null;
    if (_bfState.advanceId !== null) clearTimeout(_bfState.advanceId);
    _bfState.advanceId = null;
    // Detach keyboard nav listeners (quick + timed) and stop any countdown.
    document.removeEventListener('keydown', _bfKeydownHandler);
    document.removeEventListener('keydown', _ftKeydownHandler);
    if (typeof _rvKeydownHandler === 'function') {
        document.removeEventListener('keydown', _rvKeydownHandler);
    }
    _ftClearTimer();
    try {
        var returnFocus = _bfState.btn;
        if (typeof _rvState !== 'undefined' && _rvState && _rvState.btn) {
            returnFocus = _rvState.btn;
        }
        if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    } catch (_) {}
    _bfState.topic = null;
    _bfState.btn = null;
    _bfState.deck = [];
    _bfState.idx = 0;
    _bfState.score = 0;
    _bfState.answered = false;
    _bfState.finished = false;
    _bfState.roundId = null;
    _bfState.seq = 0;
    _bfState.cardStart = 0;
    _bfState.misses = [];
    _bfState.perm = [];
    _bfState.primedQnums = [];
    _bfState.poolQnums = [];
    _bfState.seenQnums = [];
    _bfState.allCards = [];
    _bfState.lastFinishAt = null;
    _ftState.topic = null;
    _ftState.btn = null;
    _ftState.round = null;
    _ftState.answered = false;
    _ftState.roundId = null;
    _ftState.perm = [];
    _ftState.loading = null;   // cancels a start still loading: it must not open the deck after this close
    if (typeof _rvState !== 'undefined' && _rvState) {
        _rvState.topic = null;
        _rvState.btn = null;
        _rvState.csv = null;
        _rvState.mixed = false;
        _rvState.queue = [];
        _rvState.idx = 0;
        _rvState.ratings = 0;
        _rvState.roundId = null;
        _rvState.round = null;
        _rvState.seq = 0;
        _rvState.cardStart = 0;
        _rvState.current = null;
        _rvState.stage = null;
        _rvState.store = null;
        _rvState.folded = null;
        _rvState.deckCardsByCsv = {};
    }
    if (typeof _rvRestoreActions === 'function') _rvRestoreActions();
}

function closeBlooketFlashcards() {
    // Codex BLOCKER fold P2: if view-as somehow got the quiz open, close it
    // without persisting any progress (the open-gate above should prevent
    // this, but defense-in-depth).
    if (typeof _viewAsContext === 'function' && _viewAsContext()) {
      try { if (typeof _bfCloseUI === 'function') _bfCloseUI(); } catch (_) {}
      return;
    }
    // Cancel path: persist progress before tearing down so a re-open
    // resumes at the same card with the same shuffled deck and score.
    // Skip if the deck is fully traversed (already handled by _bfFinish).
    if (_bfState.topic && !_bfState.finished
        && _bfState.idx < (_bfState.deck && _bfState.deck.length || 0)) {
        _bfSaveProgress();
    }
    _bfCloseUI();
    // ANDROID: launched from mobile-home.html (?flashcards=) → return to the launcher on close.
    if (window._flashcardLauncherReturn) { try { location.href = 'mobile-home.html'; } catch (_) {} }
}

// ── ANDROID: mobile launcher deep-link into the flashcards ─────────────────────
// mobile-home.html opens this page with `?flashcards=<topic>` so the launcher can run
// the in-app Blooket flashcards — the Desk owns the deck / scoring / recording (source
// 'blooket' → grade + gossip), so the launcher reuses it rather than re-implementing it.
// An always-available "← Lessons" button returns even if the deck is missing/slow; once
// the roster session is ready we open the deck, and closing navigates back to the launcher.
(function _flashcardsFromLauncher() {
    var topic;
    try { topic = new URLSearchParams(location.search).get('flashcards'); } catch (_) { return; }
    if (!topic) return;
    function go() {
        window._flashcardLauncherReturn = true;
        try {
            var back = document.createElement('button');
            back.textContent = '← Lessons';
            back.style.cssText = 'position:fixed;top:8px;left:8px;z-index:100002;background:#0b5cad;color:#fff;border:0;border-radius:8px;padding:8px 12px;font:600 13px sans-serif;-webkit-tap-highlight-color:transparent';
            back.onclick = function () { try { location.href = 'mobile-home.html'; } catch (_) {} };
            (document.body || document.documentElement).appendChild(back);
        } catch (_) {}
        var tries = 0;
        var iv = setInterval(function () {
            tries += 1;
            var ready = (typeof openBlooketFlashcards === 'function')
                && window.rosterClient && rosterClient.current && rosterClient.current();
            if (ready) { clearInterval(iv); try { openBlooketFlashcards(null, topic); } catch (_) {} }
            else if (tries > 150) { clearInterval(iv); }   // ~30s; the ← Lessons button remains
        }, 200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
})();

// ── Full timed deck (FLASHCARD_TIMED_DECK_BUILD.md) ────────────────────────────
// A rigorous Blooket substitute: up to BLOOKET_DECK_CARDS cards, BLOOKET_FULLDECK_SECONDS
// each, no early-stop, up to 100%. A miss (wrong OR timeout) costs 1/3 credit and
// re-queues the card (no answer revealed); 3 misses = 0 and the card drops. The
// credit/queue logic is pure (_ft* fns) so it's unit-testable; the DOM/timer layer is thin.
// FLASHCARD_DECK_SLICES_SPEC.md: a sitting is a fresh sample of at most 30 cards from the
// topic's pool (its per-day slice of a combined deck, else the whole CSV), and a
// half-finished run is saved after every card and resumes when the deck is reopened.
const BLOOKET_FULLDECK_SECONDS = 40;
const BLOOKET_DECK_CARDS = 30;                                // = Flashcards.DECK_CARDS
const BLOOKET_RESUME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;   // a saved run expires after 14 days
const BLOOKET_START_STALE_MS = 15 * 1000;                     // a deck still loading after this no longer blocks a new start

var _ftState = {
    topic: null, btn: null, round: null,
    answered: false, timerId: null, advanceId: null, remaining: 0, cardStartMs: 0,
    roundId: null, perm: [],
    csv: null,        // the deck CSV this run was dealt from
    perDay: false,    // dealt from a per-day slice: records BL-…-DESK_DAY (spec D3)
    resumed: false,   // reopened from a saved run: resume note + Start over
    loading: null     // the token of the _ftStart call still loading its deck, else null
};

// ── Pure round logic (no DOM; unit-tested) ──
function _ftCreateRound(deck) {
    var d = (deck || []).slice();
    return {
        deck: d,
        order: d.map(function (_, i) { return i; }),               // queue of unresolved card indices
        status: d.map(function () { return { misses: 0, resolved: false, earned: 0 }; }),
        log: [],
        total: d.length
    };
}
function _ftCurrentIdx(round) {
    return (round && round.order.length) ? round.order[0] : -1;
}
// outcome ∈ 'correct' | 'wrong' | 'timeout'. Operates on the FRONT card.
function _ftRecordOutcome(round, outcome, latencyMs) {
    if (!round || !round.order.length) return round;
    var i = round.order.shift();
    var st = round.status[i];
    var card = round.deck[i];
    var correct = (outcome === 'correct');
    round.log.push({
        qnum: card.qnum, correct: correct,
        latencyMs: (typeof latencyMs === 'number' ? latencyMs : 0),
        wasTimeout: (outcome === 'timeout'), missIndex: st.misses
    });
    if (correct) {
        st.earned = Math.max(0, 1 - st.misses / 3);   // 1, 2/3, 1/3 by PRIOR misses
        st.resolved = true;
    } else {
        st.misses += 1;
        if (st.misses >= 3) { st.earned = 0; st.resolved = true; }   // struck out → removed
        else round.order.push(i);                                    // re-queue to the back
    }
    return round;
}
function _ftScore(round) {
    if (!round || round.total <= 0) return 0;
    var sum = 0;
    for (var i = 0; i < round.status.length; i++) sum += round.status[i].earned;
    return (sum / round.total) * 100;
}
function _ftMisses(round) {
    var out = [];
    if (!round) return out;
    for (var i = 0; i < round.status.length; i++) {
        if (round.status[i].misses > 0) {
            var card = round.deck[i];
            out.push({
                q: card.q,
                correctAnswer: card.choices[card.correctIdx],
                earned: round.status[i].earned,
                struck: round.status[i].misses >= 3
            });
        }
    }
    return out;
}
function _ftDone(round) {
    return !round || round.order.length === 0;
}

// ── Sittings, per-day slices, resume: pure helpers (FLASHCARD_DECK_SLICES_SPEC.md §3) ──
// The same text as flashcards.js sliceRanges / cardsInRanges / dealDeck / resumeRemaining
// / savedRoundOk (only the name and the indent differ); tests/flashcards-engine.test.js
// pins the two copies line for line.

// The Q# ranges [[lo, hi], …] of one topic's slice of a combined deck, or null when the
// deck is dealt whole. slices = the .slices object of data/blooket-deck-slices.json.
// A combined cell "a+b" uses its first key.
function _ftSliceRanges(slices, csvName, topicId) {
    if (!slices || typeof slices !== 'object' || !csvName || topicId == null) return null;
    var byTopic = slices[csvName];
    if (!byTopic || typeof byTopic !== 'object') return null;
    var ranges = byTopic[String(topicId).split('+')[0]];
    if (!Array.isArray(ranges) || !ranges.length) return null;
    return ranges;
}

// The cards whose Q# falls inside any of the ranges. No ranges: every card. Ranges
// that match no card: every card too (a bad range must never deal an empty deck).
function _ftCardsInRanges(cards, ranges) {
    if (!Array.isArray(cards)) return [];
    if (!Array.isArray(ranges) || !ranges.length) return cards;
    var picked = cards.filter(function (card) {
        if (!card || typeof card.qnum !== 'number') return false;
        return ranges.some(function (range) {
            return Array.isArray(range) && card.qnum >= range[0] && card.qnum <= range[1];
        });
    });
    if (!picked.length) return cards;
    return picked;
}

// One sitting: a fresh uniform sample of at most max cards (shuffle the pool, take max).
function _ftDealDeck(cards, max, shuffleFn) {
    return shuffleFn(cards.slice()).slice(0, max);
}

// Seconds left on a saved card whose clock started at cardStartMs: the clock keeps
// running in wall time while the deck is closed. null = the run was saved between
// cards, so the next card gets a full clock.
function _ftResumeRemaining(cardStartMs, nowMs, perCardSeconds) {
    if (typeof cardStartMs !== 'number' || !isFinite(cardStartMs)) return null;
    var elapsedSeconds = Math.floor((nowMs - cardStartMs) / 1000);
    if (elapsedSeconds < 0) return perCardSeconds;   // the device clock went backwards
    return Math.max(0, perCardSeconds - elapsedSeconds);
}

// A saved round comes back from localStorage: resume it only when its shape is intact.
function _ftSavedRoundOk(round) {
    if (!round || !Array.isArray(round.deck) || !round.deck.length) return false;
    if (!Array.isArray(round.order) || !Array.isArray(round.status) || !Array.isArray(round.log)) return false;
    if (round.total !== round.deck.length || round.status.length !== round.deck.length) return false;
    for (var i = 0; i < round.deck.length; i++) {
        var card = round.deck[i];
        var st = round.status[i];
        if (!card || typeof card.qnum !== 'number' || typeof card.q !== 'string') return false;
        if (!Array.isArray(card.choices) || card.choices.length < 2 || typeof card.correctIdx !== 'number') return false;
        if (!st || typeof st.misses !== 'number' || typeof st.earned !== 'number') return false;
    }
    for (var j = 0; j < round.order.length; j++) {
        var idx = round.order[j];
        if (typeof idx !== 'number' || Math.floor(idx) !== idx || idx < 0 || idx >= round.deck.length) return false;
    }
    return true;
}

// ── Timer ──
function _ftClearTimer() {
    if (_ftState.timerId) { clearInterval(_ftState.timerId); _ftState.timerId = null; }
    // Also cancel the pending 800ms auto-advance — otherwise closing the modal
    // mid-beat fires _ftRenderCard against a torn-down round (null-round crash).
    if (_ftState.advanceId) { clearTimeout(_ftState.advanceId); _ftState.advanceId = null; }
}
function _ftRenderTimer() {
    var t = document.getElementById('bf-timer');
    if (!t) return;
    t.style.display = 'block';
    var s = Math.max(0, _ftState.remaining);
    t.textContent = '⏱ ' + s + 's';
    t.style.color = s <= 10 ? '#B03A2E' : '#333';
}
// The clock of the card on screen is wall time: the card runs out at cardStartMs +
// BLOOKET_FULLDECK_SECONDS. A resumed card passes its saved cardStartMs, which is kept
// EXACTLY, so closing and reopening the deck any number of times never moves its deadline
// (D4). Its remainingSeconds is _ftResumeRemaining at reopening (0: it ran out while the
// deck was closed), the same number _ftSecondsLeft gives. A fresh card passes neither and
// starts a full clock now.
function _ftStartTimer(remainingSeconds, cardStartMs) {
    _ftClearTimer();
    var now = Date.now();
    var start = (typeof cardStartMs === 'number' && isFinite(cardStartMs)) ? cardStartMs : now;
    if (start > now) start = now;   // the device clock went backwards: a full clock, as _ftResumeRemaining gives
    _ftState.cardStartMs = start;
    _ftState.remaining = (typeof remainingSeconds === 'number') ? remainingSeconds : BLOOKET_FULLDECK_SECONDS;
    _ftRenderTimer();
    if (_ftState.remaining <= 0) { _ftHandle('timeout'); return; }   // it ran out while the deck was closed
    _ftState.timerId = setInterval(function () {
        // Read the seconds off the deadline every tick, never count them down: a late tick
        // (a throttled background tab) cannot stretch the card's clock.
        _ftState.remaining = _ftSecondsLeft();
        _ftRenderTimer();
        if (_ftState.remaining > 0) return;
        _ftClearTimer();
        _ftHandle('timeout');
    }, 1000);
}

// Whole seconds left on the card on screen, read off its wall-clock deadline
// (cardStartMs + BLOOKET_FULLDECK_SECONDS). 0 = it has run out.
function _ftSecondsLeft() {
    var msLeft = _ftState.cardStartMs + BLOOKET_FULLDECK_SECONDS * 1000 - Date.now();
    return Math.max(0, Math.ceil(msLeft / 1000));
}

// Capture both identity sources before work starts. Another app on this origin can
// change the roster session without changing the Desk's legacy marks key.
function _ftCaptureOwner() {
    var owner = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
    var roster = window.rosterClient;
    var session = roster && typeof roster.current === 'function' ? roster.current() : null;
    var studentId = roster && typeof roster.studentId === 'function' ? roster.studentId() : null;
    var username = session && session.username ? session.username : null;
    // Roster verification ignores case and may omit a canonical username.
    // Compare aliases without changing the existing local-storage keys.
    var ownerAlias = typeof owner === 'string' ? owner.trim().toLowerCase() : '';
    var rosterAlias = typeof username === 'string' ? username.trim().toLowerCase() : '';
    var consistent = !!ownerAlias && (!studentId || (rosterAlias &&
        (ownerAlias === rosterAlias || ownerAlias === rosterAlias + '@roster.local')));
    return Object.freeze({ owner: owner, studentId: studentId, username: username, consistent: !!consistent });
}

function _ftOwnerIsCurrent(identity) {
    if (!identity || !identity.consistent) return false;
    if (typeof _mayScore === 'function' && !_mayScore()) return false;
    var current = _ftCaptureOwner();
    if (!current.consistent || current.studentId !== identity.studentId) return false;
    // The UUID owns a roster student's work. Normalizing that student's legacy
    // key from username@roster.local to username does not transfer ownership.
    return identity.studentId ? true : current.owner === identity.owner;
}

// Keep finished scores until local saving and ledger handoff succeed. Each run has
// its own key, so another tab's result cannot overwrite its recovery record. This
// protects pre-save recovery; accepted offline rows still use the shared queue.
function _ftPendingKey(identity, topic, id) {
    if (!identity || !identity.consistent || !topic) return null;
    return 'apstats_desk_ft_pending_' + JSON.stringify([
        identity.studentId ? 'roster' : 'legacy', identity.studentId || identity.owner, topic
    ]) + ':' + (id == null ? '' : encodeURIComponent(String(id)));
}

function _ftSavePending(result) {
    var key = result && _ftPendingKey(result.identity, result.topic, result.id);
    if (!key) return false;
    try {
        var round = result.round;
        localStorage.setItem(key, JSON.stringify({
            v: 1, id: result.id, identity: result.identity, topic: result.topic,
            csv: result.csv, perDay: result.perDay, roundId: result.roundId,
            score: result.score, logged: !!result.logged, createdAt: result.createdAt,
            round: { deck: round.deck, order: round.order, status: round.status, log: round.log, total: round.total }
        }));
        return true;
    } catch (_) { return false; }
}

function _ftLoadPending(identity, topic) {
    if (!_ftOwnerIsCurrent(identity)) return null;
    var prefix = _ftPendingKey(identity, topic);
    if (!prefix) return null;
    try {
        var oldest = null;
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf(prefix) !== 0) continue;
            var result;
            try { result = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { continue; }
            if (!result || result.v !== 1 || !result.id || result.topic !== topic) continue;
            if (!_ftOwnerIsCurrent(result.identity) || _ftPendingKey(result.identity, topic, result.id) !== key) continue;
            if (!_ftSavedRoundOk(result.round) || !_ftDone(result.round)) continue;
            if (typeof result.score !== 'number' || !Number.isFinite(result.score) || result.score < 0 || result.score > 100) continue;
            if (!oldest || result.createdAt < oldest.createdAt) oldest = result;
        }
        if (oldest) Object.freeze(oldest.identity);
        return oldest;
    } catch (_) { return null; }
}

function _ftClearPending(result) {
    var key = result && _ftPendingKey(result.identity, result.topic, result.id);
    if (!key) return;
    try {
        var saved = JSON.parse(localStorage.getItem(key) || 'null');
        // A late completion may remove only its own result, never a newer run.
        if (saved && saved.id === result.id) localStorage.removeItem(key);
    } catch (_) {}
}

function _ftShowPending(result, btn) {
    _ftState.topic = result.topic;
    _ftState.btn = btn;
    _ftState.csv = result.csv;
    _ftState.perDay = !!result.perDay;
    _ftState.roundId = result.roundId;
    _ftState.round = result.round;
    _ftState.round.owner = result.identity;
    _ftState.round.finishedResult = result;
    _ftState.resumed = true;
    _bfShowQuizUI(true);
    document.getElementById('bf-overlay').style.display = 'block';
    var header = document.getElementById('bf-header');
    if (header) header.textContent = 'Finished deck — ' + cedLabel(result.topic).text;
    var note = document.getElementById('bf-note');
    if (note) { note.textContent = 'Your finished run is kept on this device. Save it without playing again.'; note.style.display = 'block'; }
    _ftFinish(true);
}

// ── Save & resume (FLASHCARD_DECK_SLICES_SPEC.md D4) ──
// A half-finished run survives closing the deck: it is saved after every card render and
// every outcome, per student and per topic, and only finishing or Start over clears it.
// Key 'apstats_desk_ft_resume_' + email → { [topic]: { v: 1, csv, perDay, roundId,
// round: { deck, order, status, log, total }, cardStartMs, savedAt } }. cardStartMs null
// means saved between cards. Runs older than BLOOKET_RESUME_MAX_AGE_MS are dropped.
// Per device only (the per-card SRS log still syncs at finish). The calls from
// _ftRenderCard, _ftHandle and _ftFinish are typeof-guarded: tests run those alone.
function _ftResumeKey(identity) {
    try {
        var email = identity ? identity.owner : ((typeof getStudentEmail === 'function') ? getStudentEmail() : null);
        if (!email) return null;
        return 'apstats_desk_ft_resume_' + email;
    } catch (_) { return null; }
}

function _ftResumeKeys(identity) {
    identity = identity || _ftCaptureOwner();
    var keys = [_ftResumeKey(identity)];
    if (identity.studentId && identity.username) {
        keys.push(_ftResumeKey({ owner: identity.username }));
        keys.push(_ftResumeKey({ owner: identity.username + '@roster.local' }));
    }
    return keys.filter(function (key, index) { return key && keys.indexOf(key) === index; });
}

// A saved run can resume for BLOOKET_RESUME_MAX_AGE_MS after its last save.
function _ftResumeFresh(entry, nowMs) {
    if (!entry || typeof entry.savedAt !== 'number') return false;
    return nowMs - entry.savedAt < BLOOKET_RESUME_MAX_AGE_MS;
}

function _ftSaveResume() {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    var round = _ftState.round;
    var identity = round && round.owner ? round.owner : _ftCaptureOwner();
    if (!_ftOwnerIsCurrent(identity)) return;
    var key = _ftResumeKey(_ftCaptureOwner());
    if (!key || !_ftState.topic || !_ftState.csv || !round) return;
    try {
        var all = JSON.parse(localStorage.getItem(key) || '{}');
        if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
        var now = Date.now();
        Object.keys(all).forEach(function (topic) {
            if (!_ftResumeFresh(all[topic], now)) delete all[topic];   // expired runs go
        });
        all[_ftState.topic] = {
            v: 1,
            identity: identity,
            csv: _ftState.csv,
            perDay: !!_ftState.perDay,
            roundId: _ftState.roundId,
            round: { deck: round.deck, order: round.order, status: round.status, log: round.log, total: round.total },
            cardStartMs: (typeof _ftState.cardStartMs === 'number') ? _ftState.cardStartMs : null,
            savedAt: now
        };
        localStorage.setItem(key, JSON.stringify(all));
    } catch (_) {}
}

// The saved run for this topic, or null when there is none, it expired, it was dealt from
// a different CSV than the topic now resolves to, or it is no longer intact.
function _ftLoadResume(topic, csv) {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return null;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return null;
    if (!topic) return null;
    var identity = _ftCaptureOwner();
    if (!_ftOwnerIsCurrent(identity)) return null;
    try {
        var keys = _ftResumeKeys(identity);
        var newest = null;
        for (var i = 0; i < keys.length; i++) {
            var all;
            try { all = JSON.parse(localStorage.getItem(keys[i]) || '{}'); } catch (_) { continue; }
            var entry = all ? all[topic] : null;
            if (!entry || entry.v !== 1) continue;
            if (entry.identity && !_ftOwnerIsCurrent(entry.identity)) continue;
            if (entry.csv !== csv || !_ftResumeFresh(entry, Date.now()) || !_ftSavedRoundOk(entry.round)) continue;
            if (!newest || entry.savedAt > newest.savedAt) newest = entry;
        }
        return newest;
    } catch (_) { return null; }
}

function _ftClearResume(topic, identity, expectedRoundId) {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    if (!topic) return;
    try {
        var keys = _ftResumeKeys(identity);
        for (var i = 0; i < keys.length; i++) {
            var all;
            try { all = JSON.parse(localStorage.getItem(keys[i]) || '{}'); } catch (_) { continue; }
            if (!all || typeof all !== 'object' || Array.isArray(all)) continue;
            // A finished run's late save may not erase a newer partial run.
            // Clear matching copies under both aliases so one cannot resurrect.
            if (typeof expectedRoundId !== 'undefined' &&
                (!expectedRoundId || !all[topic] || all[topic].roundId !== expectedRoundId)) continue;
            delete all[topic];
            localStorage.setItem(keys[i], JSON.stringify(all));
        }
    } catch (_) {}
}

// The line a resumed run shows under the credit note.
function _ftResumeLine(round) {
    var line = document.createElement('div');
    line.className = 'bf-resume-note';
    line.style.cssText = 'margin-top:6px;font-weight:bold';
    line.textContent = 'Picking up where you left off — ' + round.order.length + ' of ' + round.total + ' cards left.';
    return line;
}

// The Start over button, shown only while a resumed run is on screen (before Cancel).
function _ftShowStartOver(show) {
    var old = document.getElementById('bf-startover');
    if (old) old.remove();
    if (!show) return;
    var actions = document.getElementById('bf-actions');
    if (!actions) return;
    var button = document.createElement('button');
    button.id = 'bf-startover';
    button.className = 's7btn';
    button.textContent = 'Start over';
    button.title = 'Deal a fresh deck. Your best score is kept.';
    button.onclick = function () { _ftStartOver(); };
    actions.insertBefore(button, actions.firstChild);
}

// Start over: drop the saved run and deal a fresh deck. Best-wins keeps the grade, so
// starting over can never lower it.
function _ftStartOver() {
    var topic = _ftState.topic, btn = _ftState.btn;
    if (!topic) return;
    var identity = _ftState.round && _ftState.round.owner;
    _ftClearTimer();          // stop the old card's clock and any pending auto-advance
    _ftState.round = null;    // so nothing can save the old run again
    _ftClearResume(topic, identity);
    _ftStart(btn, topic);
}

// ── UI flow ──
async function _ftStart(btn, topicId) {
    // One start at a time. The deck window opens only once the CSV has loaded, so a double
    // click used to deal twice, and the second call found the first one's save and showed a
    // brand-new deck as "Picking up where you left off". While a start is loading, a second
    // one is ignored; closing the deck (_bfCloseUI) cancels it, so a cancelled open never
    // wedges the deck. A fresh open has no window to close yet, so a start still loading after
    // BLOOKET_START_STALE_MS (a stalled network) stops blocking: the next click takes over and
    // the stalled start is dropped when its fetch returns.
    if (_ftState.loading && Date.now() - _ftState.loading.at < BLOOKET_START_STALE_MS) return;
    var identity = _ftCaptureOwner();
    var readOnly = typeof _mayScore === 'function' && !_mayScore();
    if (!readOnly && !_ftOwnerIsCurrent(identity)) {
        showDialog('⚠️', 'Your sign-in changed in another app. Sign in again on the Desk before starting a deck.', 'OK');
        return;
    }
    var loading = { at: Date.now() };   // this call's token
    _ftState.loading = loading;
    // A pair cell "4.7+4.8" runs its first key's deck (the slice _ftSliceRanges deals), so the
    // header, the note, the saved run, the card log and the ledger row all name that lesson.
    topicId = String(topicId == null ? '' : topicId).split('+')[0];
    var pendingResult = readOnly ? null : _ftLoadPending(identity, topicId);
    if (pendingResult) {
        _ftState.loading = null;
        _ftShowPending(pendingResult, btn);
        return;
    }
    var csvPath = _bfCsvPath(topicId);
    if (!csvPath) {
        _ftState.loading = null;
        showDialog('⚠️', 'No flashcard deck available for this lesson yet.', 'OK');
        return;
    }
    var text;
    try {
        var res = await fetch(csvPath);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        text = await res.text();
    } catch (e) {
        if (_ftState.loading !== loading) return;   // closed while it loaded: nothing to report
        _ftState.loading = null;
        showDialog('⚠️', 'Could not load the flashcard deck. Try again.', 'OK');
        return;
    }
    if (_ftState.loading !== loading) return;   // closed while the deck loaded
    if (!readOnly && !_ftOwnerIsCurrent(identity)) { _ftState.loading = null; return; }
    var allCards = _bfRowsToDeck(_bfParseCsv(text));
    if (!allCards.length) {
        _ftState.loading = null;
        showDialog('⚠️', 'The flashcard deck for this lesson is empty.', 'OK');
        return;
    }
    var slices = await _bfLoadDeckSlices();
    if (_ftState.loading !== loading) return;   // closed while the slices loaded
    _ftState.loading = null;                    // the deck opens now
    if (!readOnly && !_ftOwnerIsCurrent(identity)) return;
    // The topic's card pool: its per-day slice of a combined deck, else the whole CSV (D2).
    var ranges = _ftSliceRanges(slices, csvPath, topicId);
    var pool = _ftCardsInRanges(allCards, ranges);
    var perDay = pool.length < allCards.length;   // a slice was dealt: the one fact the item id depends on (D3)
    var saved = _ftLoadResume(topicId, csvPath);
    _ftState.topic = topicId;
    _ftState.btn = btn;
    _ftState.csv = csvPath;
    _ftState.answered = false;
    if (saved) {
        // Resume (D4): the same dealt cards, queue, credits and roundId as when it was closed.
        _ftState.roundId = saved.roundId;
        _ftState.round = saved.round;
        _ftState.perDay = !!saved.perDay;
        _ftState.resumed = true;
    } else {
        _ftState.roundId = (typeof _srsRoundId === 'function') ? _srsRoundId('desk') : null;
        // At most BLOOKET_DECK_CARDS, a fresh sample every run (no top-10 trim).
        _ftState.round = _ftCreateRound(_ftDealDeck(pool, BLOOKET_DECK_CARDS, _bfShuffle));
        _ftState.perDay = perDay;
        _ftState.resumed = false;
    }
    _ftState.round.owner = identity;
    _ftState.round.readOnly = readOnly;
    var total = _ftState.round.total;
    var header = document.getElementById('bf-header');
    if (header) header.textContent = 'Timed deck — ' + cedLabel(topicId).text + ' · ' + total + (total === 1 ? ' card' : ' cards') + ' · ' + BLOOKET_FULLDECK_SECONDS + 's/card · up to 100%';
    var note = document.getElementById('bf-note');
    if (note) {
        note.textContent = _bfCreditNote(topicId, _ftState.perDay);
        if (_ftState.resumed) note.appendChild(_ftResumeLine(_ftState.round));
        note.style.display = 'block';
    }
    _ftShowStartOver(_ftState.resumed);
    _bfShowQuizUI(true);   // show the quiz + the timer
    document.getElementById('bf-overlay').style.display = 'block';   // the picker used to open the modal
    document.getElementById('bf-result').style.display = 'none';
    document.addEventListener('keydown', _ftKeydownHandler);
    if (!saved) { _ftRenderCard(); return; }
    // The card that was on screen comes back with its clock still running in wall time: its
    // saved start goes through unchanged, so reopening never moves its deadline.
    _ftRenderCard(_ftResumeRemaining(saved.cardStartMs, Date.now(), BLOOKET_FULLDECK_SECONDS), saved.cardStartMs);
}

// resumeRemaining + resumeCardStartMs: given only for the first card of a resumed run, the
// seconds its clock had left (_ftResumeRemaining) and the start its clock keeps. Every other
// card starts a full clock now.
function _ftRenderCard(resumeRemaining, resumeCardStartMs) {
    _ftClearTimer();
    var round = _ftState.round;
    if (_ftDone(round)) { _ftFinish(); return; }
    _ftState.answered = false;
    var idx = _ftCurrentIdx(round);
    var card = round.deck[idx];
    var identity = [];
    for (var identityIdx = 0; identityIdx < card.choices.length; identityIdx++) {
        identity.push(identityIdx);
    }
    var permutationEnabled = typeof _fcFlag === 'function' && _fcFlag('choicePermutation');
    var permutationUnsafe = typeof _bfIsPermutationUnsafe === 'function'
        && _bfIsPermutationUnsafe(card.choices);
    var perm = identity;
    if (permutationEnabled && !permutationUnsafe
        && typeof _bfPermutationFor === 'function'
        && typeof _bfPermSeed === 'function') {
        var email = (typeof getStudentEmail === 'function') ? getStudentEmail() : null;
        perm = _bfPermutationFor(
            _bfPermSeed(email, _ftState.roundId, card.qnum),
            card.choices.length
        );
    }
    _ftState.perm = perm;
    var q = document.getElementById('bf-question');
    var c = document.getElementById('bf-choices');
    var p = document.getElementById('bf-progress');
    var feedback = document.getElementById('bf-feedback');
    var nextBtn = document.getElementById('bf-next');
    if (nextBtn) nextBtn.style.display = 'none';   // timed mode auto-advances; no Next
    if (feedback) feedback.textContent = '';
    if (p) p.textContent = round.order.length + ' card' + (round.order.length === 1 ? '' : 's') + ' left'
                         + '  ·  Keys: a-d or 1-4';
    if (q) q.textContent = card.q;
    if (c) {
        while (c.firstChild) c.removeChild(c.firstChild);
        for (var i = 0; i < perm.length; i++) {
            (function (displayIdx, realIdx) {
                var b = document.createElement('button');
                b.className = 'bf-choice';
                b.setAttribute('data-i', String(realIdx));
                b.textContent = String.fromCharCode(65 + displayIdx) + '. ' + card.choices[realIdx];
                b.onclick = function () { _ftAnswer(realIdx); };
                c.appendChild(b);
            })(i, perm[i]);
        }
    }
    try {
        var firstChoice = c && c.querySelector('.bf-choice');
        if (firstChoice && typeof firstChoice.focus === 'function') firstChoice.focus();
    } catch (_) {}
    _ftStartTimer(resumeRemaining, resumeCardStartMs);
    // Save after every render: closing mid-card resumes this card, its clock still running (D4).
    if (typeof _ftSaveResume === 'function') _ftSaveResume();
}

function _ftAnswer(choiceIdx) {
    if (_ftState.answered) return;
    var round = _ftState.round;
    var idx = _ftCurrentIdx(round);
    if (idx < 0) return;
    // Past the card's deadline the answer is a timeout. Colour nothing: the card comes back
    // later and must not have given its answer away.
    if (_ftSecondsLeft() <= 0) { _ftHandle('timeout'); return; }
    var card = round.deck[idx];
    var c = document.getElementById('bf-choices');
    if (c) {
        var buttons = c.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var buttonIdx = parseInt(buttons[i].getAttribute('data-i'), 10);
            buttons[i].disabled = true;
            if (buttonIdx !== choiceIdx) continue;
            buttons[i].classList.add(choiceIdx === card.correctIdx ? 'bf-correct' : 'bf-wrong');
        }
    }
    _ftHandle(choiceIdx === card.correctIdx ? 'correct' : 'wrong', choiceIdx);
}

// Records the outcome WITHOUT revealing the correct answer (a revealed answer
// would make the re-queue trivial). Brief feedback, then auto-advance.
function _ftHandle(outcome, choiceIdx) {
    if (_ftState.answered) return;
    _ftState.answered = true;
    _ftClearTimer();
    // The clock is wall time: whatever lands after the card's deadline is a timeout, and a
    // card's time never runs past its full clock (a timeout found on reopening logs 40 s).
    if (_ftSecondsLeft() <= 0) outcome = 'timeout';
    var latency = Math.min(Date.now() - _ftState.cardStartMs, BLOOKET_FULLDECK_SECONDS * 1000);
    var round = _ftState.round;
    var c = document.getElementById('bf-choices');
    if (c) { var bs = c.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) bs[i].disabled = true; }
    var currentIdx = _ftCurrentIdx(round);
    var st = round.status[currentIdx];
    var card = round.deck[currentIdx];
    var willStrike = (outcome !== 'correct') && (st.misses + 1 >= 3);
    var feedback = document.getElementById('bf-feedback');
    if (feedback) {
        feedback.textContent = outcome === 'correct' ? '✓ Correct'
            : outcome === 'timeout' ? (willStrike ? '⏱ Too slow — out (0 for this card)' : '⏱ Too slow — it’ll come back')
            : (willStrike ? '✗ Out (0 for this card)' : '✗ Not quite — it’ll come back');
    }
    _ftRecordOutcome(round, outcome, latency);
    var last = round.log[round.log.length - 1];
    last.nChoices = card.choices.length;
    last.chosenIdx = (outcome === 'timeout') ? -1 : choiceIdx;
    last.stemHash = (typeof _srsStemHash === 'function') ? _srsStemHash(card.q) : null;
    last.displayedPerm = Array.isArray(_ftState.perm)
        ? _ftState.perm.slice()
        : card.choices.map(function (_, choiceIndex) { return choiceIndex; });
    // Save the outcome at once: closing inside the 800 ms auto-advance keeps it, and the
    // run resumes on the next card with a full clock (cardStartMs null = between cards, D4).
    _ftState.cardStartMs = null;
    if (typeof _ftSaveResume === 'function') _ftSaveResume();
    // Cancellable auto-advance: store the id so _ftClearTimer (close/teardown) can
    // cancel it — a stale fire would render against a null round.
    _ftState.advanceId = setTimeout(function () { _ftState.advanceId = null; _ftRenderCard(); }, 800);
}

function _ftKeydownHandler(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var ae = document.activeElement;
    if (ae) {
        var tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ae.isContentEditable) return;
    }
    var ov = document.getElementById('bf-overlay');
    if (!ov || ov.style.display === 'none') return;
    if (_ftState.answered) return;
    var key = (e.key || '').toLowerCase();
    var idx = -1;
    if (key >= 'a' && key <= 'd') idx = key.charCodeAt(0) - 97;
    else if (key >= '1' && key <= '4') idx = parseInt(key, 10) - 1;
    if (idx < 0) return;
    var round = _ftState.round;
    var cur = _ftCurrentIdx(round);
    if (cur < 0) return;
    if (idx >= round.deck[cur].choices.length) return;
    var realIdx = (Array.isArray(_ftState.perm) && typeof _ftState.perm[idx] === 'number')
        ? _ftState.perm[idx]
        : idx;
    e.preventDefault();
    _ftAnswer(realIdx);
}

async function _ftFinish(waitForRetry) {
    _ftClearTimer();
    document.removeEventListener('keydown', _ftKeydownHandler);
    var round = _ftState.round;
    if (!round) return;   // torn down mid auto-advance (modal closed) — nothing to commit
    var score = Math.round(_ftScore(round) * 10) / 10;
    var topic = _ftState.topic, btn = _ftState.btn;
    var perDay = !!_ftState.perDay;
    if (typeof _ftShowStartOver === 'function') _ftShowStartOver(false);
    _ftRenderRecap(round, score);      // "review your misses"
    if (round.readOnly || (typeof _mayScore === 'function' && !_mayScore())) { _ftRenderOutcome(topic, score, null); return; }
    var identity = round.owner || _ftCaptureOwner();
    var result = round.finishedResult;
    if (!result) {
        result = {
            v: 1, id: _ftState.roundId || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)),
            identity: identity, topic: topic, csv: _ftState.csv, perDay: perDay,
            roundId: _ftState.roundId, round: round, score: score, logged: false, createdAt: Date.now()
        };
        round.finishedResult = result;
    }
    identity = result.identity;
    if (!result.logged && _ftOwnerIsCurrent(identity)) {
        _ftLogToStore(topic, round.log);   // retrying never repeats the card log
        result.logged = true;
    }
    // Capture the finished result BEFORE the first await. Its key belongs to the
    // original student, so closing, reloading, or another student's deck cannot lose it.
    var keptOnDevice = _ftSavePending(result);
    if (keptOnDevice && typeof _ftClearResume === 'function') _ftClearResume(topic, identity, result.roundId);
    var saving = false;
    // Retry only this finished score. The card log, recap and timer run once;
    // closing or opening another round makes this continuation obsolete.
    async function saveFinishedRun() {
        if (saving || _ftState.round !== round) return;
        saving = true;
        if (!keptOnDevice) keptOnDevice = _ftSavePending(result);
        var outcome = null;
        try {
            if (!_ftOwnerIsCurrent(identity)) outcome = { saved: false, best: null, error: true, ownerChanged: true };
            else outcome = await _blooketCommit(btn, topic, score, perDay, identity);
        } catch (_) { outcome = { saved: false, best: null, error: true }; }
        saving = false;
        if (outcome && !outcome.error) {
            _ftClearPending(result);
            if (typeof _ftClearResume === 'function') _ftClearResume(topic, identity, result.roundId);
        } else if (outcome && !keptOnDevice) {
            outcome.keepOpen = true;
        }
        if (_ftState.round !== round) return;
        _ftRenderOutcome(topic, score, outcome, saveFinishedRun);
    }
    if (waitForRetry) {
        _ftRenderOutcome(topic, score, { saved: false, best: null, error: true, pending: true }, saveFinishedRun);
        return;
    }
    await saveFinishedRun();
}

// The last screen must SAY what happened to the grade and offer one obvious way
// out (teacher 2026-09-23: a lone "Cancel" after finishing a deck read as
// "did I just lose my work?"). outcome: null = not recorded (read-only view),
// { saved, best, error? } from _blooketCommit.
function _ftRenderOutcome(topic, score, outcome, retrySave) {
    var result = document.getElementById('bf-result');
    if (result) {
        var old = result.querySelector('.bf-outcome');
        if (old) old.remove();
        var line = document.createElement('div');
        line.className = 'bf-outcome';
        line.setAttribute('role', 'status');
        line.setAttribute('aria-live', 'polite');
        line.setAttribute('aria-atomic', 'true');
        line.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid #bbb;font-weight:bold';
        var label = (typeof cedLabel === 'function') ? cedLabel(topic).text : ('Topic ' + topic);
        if (!outcome) {
            line.textContent = 'Not recorded \u2014 this is a read-only view.';
            line.style.color = '#7a0010';
        } else if (outcome.error) {
            line.textContent = outcome.ownerChanged
                ? 'Your sign-in changed. Sign back in as the original account, then save this finished run.'
                : outcome.pending
                    ? 'Your finished run is kept on this device. Save it without playing again.'
                    : 'Could not save this run. Your earlier best is kept. Try saving again.';
            if (outcome.keepOpen) line.textContent += ' This device could not keep a recovery copy. Keep this screen open until the run is saved.';
            line.style.color = '#7a0010';
        } else if (outcome.savedForOriginalOwner) {
            line.textContent = 'This run was recorded for the original account before your sign-in changed.';
            line.style.color = '#25663F';
        } else if (outcome.saved) {
            line.textContent = '\u2713 Saved to your grade \u2014 ' + label + ' flashcards: ' + score.toFixed(1) + '%. Your ledger is up to date.';
            line.style.color = '#25663F';
        } else {
            var best = (typeof outcome.best === 'number') ? outcome.best.toFixed(1) + '%' : 'your earlier score';
            line.textContent = 'Recorded. Your best for ' + label + ' stays at ' + best + ' (this run: ' + score.toFixed(1) + '%).';
            line.style.color = '#25663F';
        }
        result.appendChild(line);
        result.style.display = 'block';
    }
    var actions = document.getElementById('bf-actions');
    if (!actions) return;
    while (actions.firstChild) actions.removeChild(actions.firstChild);
    var retry = null;
    if (outcome && outcome.error && typeof retrySave === 'function') {
        retry = document.createElement('button');
        retry.id = 'bf-retry-save';
        retry.className = 's7btn s7btn-default';
        retry.textContent = outcome.pending || outcome.ownerChanged ? 'Save your finished run' : 'Retry save';
        retry.onclick = function () {
            retry.disabled = true;
            retry.textContent = 'Saving…';
            retrySave();
        };
        actions.appendChild(retry);
    }
    var done = document.createElement('button');
    done.id = 'bf-done';
    done.className = 's7btn s7btn-default';
    done.textContent = 'Done';
    done.onclick = function () {
        if (typeof closeBlooketFlashcards === 'function') closeBlooketFlashcards();
    };
    actions.appendChild(done);
    try { (retry || done).focus(); } catch (_) {}
}

function _ftRenderRecap(round, score) {
    var q = document.getElementById('bf-question'); if (q) q.textContent = '';
    var c = document.getElementById('bf-choices'); if (c) while (c.firstChild) c.removeChild(c.firstChild);
    var p = document.getElementById('bf-progress'); if (p) p.textContent = '';
    var feedback = document.getElementById('bf-feedback'); if (feedback) feedback.textContent = '';
    var t = document.getElementById('bf-timer'); if (t) t.style.display = 'none';
    var nextBtn = document.getElementById('bf-next'); if (nextBtn) nextBtn.style.display = 'none';
    var result = document.getElementById('bf-result');
    if (!result) return;
    while (result.firstChild) result.removeChild(result.firstChild);
    var head = document.createElement('div');
    head.style.fontWeight = 'bold';
    head.textContent = 'You scored ' + score.toFixed(1) + '% on the full timed deck.';
    result.appendChild(head);
    var misses = _ftMisses(round);
    if (misses.length) {
        var sub = document.createElement('div'); sub.style.cssText = 'margin:6px 0 4px';
        sub.textContent = 'Review your misses:';
        result.appendChild(sub);
        var ul = document.createElement('ul'); ul.style.cssText = 'margin:0;padding-left:18px';
        misses.forEach(function (m) {
            var li = document.createElement('li'); li.style.marginBottom = '4px';
            var qd = document.createElement('div'); qd.textContent = m.q;
            var ad = document.createElement('div'); ad.style.color = '#25663F';
            ad.textContent = 'Answer: ' + m.correctAnswer + (m.struck ? '  (out — 0 credit)' : '');
            li.appendChild(qd); li.appendChild(ad); ul.appendChild(li);
        });
        result.appendChild(ul);
    } else {
        var perfect = document.createElement('div'); perfect.style.color = '#25663F';
        perfect.textContent = 'Perfect — no misses!';
        result.appendChild(perfect);
    }
    result.style.display = 'block';
}

// Per-card answer log → localStorage (the SRS / BKT foundation; v2 schedules
// cross-session, v3 models mastery). Bounded so it can't grow without limit.
function _ftLogToStore(topic, log) {
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;
    try {
        if (!Array.isArray(log) || !log.length) return;
        if (typeof _srsAppendLog !== 'function') return;
        var entries = [];
        var stamp = Date.now();
        var csv = (typeof _srsCsvFor === 'function') ? _srsCsvFor(topic) : null;
        var roundId = (typeof _ftState !== 'undefined' && _ftState) ? _ftState.roundId : null;
        for (var i = 0; i < log.length; i++) {
            entries.push({
                topic: topic, qnum: log[i].qnum, correct: log[i].correct,
                latencyMs: log[i].latencyMs, wasTimeout: log[i].wasTimeout,
                missIndex: log[i].missIndex, ts: stamp,
                mode: 'full', csv: csv, surface: 'desk', roundId: roundId, seq: i,
                nChoices: log[i].nChoices, chosenIdx: log[i].chosenIdx,
                stemHash: log[i].stemHash,
                displayedPerm: log[i].displayedPerm
            });
        }
        // _srsAppendLog owns the apstats_srs_log_ + getStudentEmail() write.
        _srsAppendLog(entries);
    } catch (_) {}
}

// Record a finished flashcard run with BEST-WINS semantics — re-practicing must never
// LOWER the grade. Every finished run sends its own ledger row: the server keeps each BL
// item's best, and the best shown on the tile can belong to another item (a DESK_DAY run's
// 100 on 4.7, then a whole-deck DESK_DONE run that also credits 4.8), so a lower run can
// only add credit. The floor (the displayed /grade blooket: game OR prior flashcard, + the
// local mark's best) decides only the local mark (never lowered) and the "new best" copy.
// Then refreshes /grade and re-renders the panel so the score chip updates immediately.
// perDay: the run was dealt from a per-day slice, so its row is BL-…-DESK_DAY (spec D3).
async function _blooketCommit(btn, topic, score, perDay, identity) {
    if (typeof _mayScore === 'function' && !_mayScore()) return;
    identity = identity || _ftCaptureOwner();
    function ownerIsCurrent() {
        return _ftOwnerIsCurrent(identity);
    }
    if (!ownerIsCurrent()) return { saved: false, best: null, error: true, ownerChanged: true };
    // Refresh /grade FIRST so the best-wins floor sees the latest CROSS-DEVICE
    // score: the local mark and the outcome copy must never claim less than the
    // best already recorded elsewhere.
    async function _refreshGrade() {
        try {
            if (typeof renderDoNowGrades === 'function'
                && window.rosterClient && typeof window.rosterClient.token === 'function') {
                var base = window.ROSTER_SERVICE_URL, tok = window.rosterClient.token();
                if (base && tok) await renderDoNowGrades(base, tok);
            }
        } catch (_) {}
    }
    await _refreshGrade();   // floor now reflects the latest cross-device best
    if (!ownerIsCurrent()) return { saved: false, best: null, error: true, ownerChanged: true };
    // Floor on the BEST already recorded: the displayed /grade blooket AND the local
    // mark's last-saved score (recordProgress writes mark.score synchronously, and we
    // only ever save a NEW best below, so that stored score IS the prior best).
    var floor = 0;
    try {
        var g = (typeof _blooketScoreFor === 'function') ? _blooketScoreFor(topic) : null;
        if (typeof g === 'number') floor = Math.max(floor, g);
        var marks = (typeof getStudentMarks === 'function') ? getStudentMarks() : {};
        var m = marks[topic + '|blooket'];
        if (m && typeof m.score === 'number') floor = Math.max(floor, m.score);
    } catch (_) {}
    var saved = score > floor;
    if (saved) {
        var locallySaved = await _studentMarkSave(btn, topic, 'blooket', score, perDay, identity);
        if (!ownerIsCurrent()) return { saved: false, best: null, error: true, ownerChanged: true };
        if (!locallySaved) return { saved: false, best: floor, error: true };
    } else if (typeof _deskDoneRow === 'function') {
        // Not a new best: the run still sends its own row (the server floors it per item),
        // and the local mark is left alone, so it keeps its best. typeof-guarded: tests run
        // _blooketCommit alone.
        _deskDoneRow(topic, 'blooket', score, perDay);
    }
    if (!ownerIsCurrent()) return { saved: false, best: null, error: true, ownerChanged: true };
    // Make the Desk agree with the ledger NOW: patch the /grade lessons cache with
    // the score we just recorded so the My Ledger "about to become a 0" card and
    // badge drop this deck immediately, instead of waiting for the next poll
    // (teacher 2026-09-23: the warning outliving the finished deck read as lost work).
    _blooketPatchGradeCache(topic, Math.max(score, floor));
    _walletRefreshZeroCard();
    // Conversion fix: refresh /grade again + re-render the panel so the chip
    // reflects the just-saved score now, not on the next manual open.
    await _refreshGrade();
    if (!ownerIsCurrent()) return { saved: saved, best: saved ? score : floor, savedForOriginalOwner: true };
    try {
        if (_lastResourcePanel && typeof showResourcePanel === 'function') {
            showResourcePanel(_lastResourcePanel.inf, _lastResourcePanel.dateStr);
        }
    } catch (_) {}
    return { saved: saved, best: saved ? score : floor };
}

// Optimistic: set lesson.blooket on the cached /grade lessons[] for this topic.
// The next /grade poll overwrites it with the server's value (best-wins, so the
// server never reports less than what we just saved).
function _blooketPatchGradeCache(topic, score) {
    try {
        if (!Array.isArray(_gradeLessonsCache)) return;
        for (var i = 0; i < _gradeLessonsCache.length; i++) {
            var L = _gradeLessonsCache[i];
            if (!L || L.lessonKey !== topic) continue;
            if (L.blooket == null || score > L.blooket) L.blooket = score;
        }
    } catch (_) {}
}

