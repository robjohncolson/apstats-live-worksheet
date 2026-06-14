(function (g) {
    var WALLET_POINTS = {
        curriculum_quiz: 10,
        pc: 10,
        frq: 5,
        blooket: 4,
        worksheet: 3,
        quiz_review: 2,
        quiz_exception: 2,
        trainer: 1
    };

    function pointsFor(src, itemId) {
        if (src === 'quiz_verdict' || src === 'quiz_answer') return 0;
        if (itemId && /^BL-.*-DESK_DONE$/i.test(itemId)) return 4;
        return (WALLET_POINTS[src] != null) ? WALLET_POINTS[src] : 1;
    }

    function computePoints(receipts) {
        var rows = Array.isArray(receipts) ? receipts : [];
        var seen = {};
        var total = 0;
        var today = 0;
        var midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        var midnightMs = midnight.getTime();

        for (var k = 0; k < rows.length; k++) {
            var r = rows[k] || {};
            var key = (r.src || '') + '|' + (r.i || '');
            if (seen[key]) continue;
            seen[key] = 1;

            var p = pointsFor(r.src, r.i);
            total += p;
            if (r.ts && r.ts >= midnightMs) today += p;
        }

        return { total: total, today: today };
    }

    function mergeReceipts(durable, local) {
        var byId = {};
        var idDeduped = [];
        var rows = []
            .concat(Array.isArray(durable) ? durable : [])
            .concat(Array.isArray(local) ? local : []);

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r || !r.compact) continue;
            var id = r.id || '';
            if (id) {
                if (byId[id]) continue;
                byId[id] = 1;
            }
            idDeduped.push(r);
        }

        var byCompact = {};
        var merged = [];
        for (var k = 0; k < idDeduped.length; k++) {
            var row = idDeduped[k];
            if (byCompact[row.compact]) continue;
            byCompact[row.compact] = 1;
            merged.push(row);
        }

        merged.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        return merged;
    }

    function _walletClamp(v, lo, hi) {
        if (v < lo) return lo;
        if (v > hi) return hi;
        return v;
    }

    function daysBetween(aISO, bISO) {
        return Math.max(0, Math.floor((Date.parse(bISO) - Date.parse(aISO)) / 86400000));
    }

    function walletReadiness(quarter) {
        var FLOOR = 0.40;
        if (!quarter || quarter.lessonsDue == null || quarter.lessonsDue <= 0) {
            return { state: 'nodue', r: null, hue: null };
        }

        var tracks = [];
        if (typeof quarter.pcAvg === 'number') tracks.push(quarter.pcAvg);
        if (typeof quarter.workAvg === 'number') tracks.push(quarter.workAvg);

        var e = tracks.length === 0 ? 0 : _walletClamp(Math.min.apply(null, tracks) / FLOOR, 0, 1);
        var eligible = e >= 1;
        var completion = _walletClamp(quarter.lessonsGraded / quarter.lessonsDue, 0, 1);
        var r = eligible ? (0.5 + 0.5 * completion) : (0.5 * e);
        var hue = 120 * r;

        return {
            state: eligible ? (completion >= 1 ? 'caughtup' : 'eligible') : 'behind',
            r: r,
            hue: hue,
            eligible: eligible,
            completion: completion,
            e: e
        };
    }

    function summerReadiness(schedule, todayISO, doneCount, lastCompletionISO, restDays) {
        var lessons = schedule && Array.isArray(schedule.lessons) ? schedule.lessons : [];
        var total = lessons.length;
        var actual = _walletClamp(doneCount, 0, total);
        var deadlineExpected = 0;

        for (var i = 0; i < lessons.length; i++) {
            if (lessons[i] && lessons[i].due <= todayISO) deadlineExpected++;
        }

        var behind = Math.max(0, deadlineExpected - actual);
        restDays = restDays == null ? ((schedule && schedule.restDays) || 2) : restDays;

        var r;
        if (actual >= total) {
            return {
                state: 'done',
                resting: false,
                r: 1,
                hue: 120,
                total: total,
                actual: actual,
                deadlineExpected: deadlineExpected,
                behind: 0
            };
        }

        if (actual < deadlineExpected) {
            var behindGrace = (schedule && schedule.behindGraceDays) || 1;
            var daysSinceLast = lastCompletionISO ? daysBetween(lastCompletionISO, todayISO) : 9999;
            if (daysSinceLast <= behindGrace) {
                return {
                    state: 'catchingup',
                    resting: true,
                    r: null,
                    hue: 210,
                    total: total,
                    actual: actual,
                    deadlineExpected: deadlineExpected,
                    behind: behind,
                    daysSinceLast: daysSinceLast
                };
            }
            r = deadlineExpected > 0 ? _walletClamp(actual / deadlineExpected, 0, 1) : 0;
            return {
                state: 'behind',
                resting: false,
                r: r,
                hue: 120 * r,
                total: total,
                actual: actual,
                deadlineExpected: deadlineExpected,
                behind: behind,
                daysSinceLast: daysSinceLast
            };
        }

        if (deadlineExpected === 0 && actual === 0 && !lastCompletionISO) {
            return {
                state: 'notdue',
                resting: false,
                r: null,
                hue: null,
                total: total,
                actual: actual,
                deadlineExpected: deadlineExpected,
                behind: 0
            };
        }

        var daysSinceLast = lastCompletionISO ? daysBetween(lastCompletionISO, todayISO) : 9999;
        if (daysSinceLast <= restDays) {
            return {
                state: 'resting',
                resting: true,
                r: 1,
                hue: 120,
                total: total,
                actual: actual,
                deadlineExpected: deadlineExpected,
                behind: 0,
                daysSinceLast: daysSinceLast,
                restDays: restDays
            };
        }

        r = _walletClamp(1 - 0.5 * ((daysSinceLast - restDays) / 4), 0.5, 1);
        return {
            state: 'ready',
            resting: false,
            r: r,
            hue: 120 * r,
            total: total,
            actual: actual,
            deadlineExpected: deadlineExpected,
            behind: 0,
            daysSinceLast: daysSinceLast,
            restDays: restDays
        };
    }

    function _receiptTs(r) {
        var n = Number(r && r.ts);
        return isFinite(n) ? n : 0;
    }

    function _pushReceiptGroup(map, order, key, label, icon, sortKey, receipt) {
        if (!map[key]) {
            map[key] = {
                key: key,
                label: label,
                icon: icon,
                count: 0,
                receipts: [],
                _sortKey: sortKey
            };
            order.push(key);
        }
        map[key].count++;
        map[key].receipts.push(receipt);
    }

    function _finishGroups(groups) {
        for (var i = 0; i < groups.length; i++) {
            groups[i].receipts.sort(function (a, b) { return _receiptTs(b) - _receiptTs(a); });
            delete groups[i]._sortKey;
        }
        return groups;
    }

    function _lessonGroupFor(receipt) {
        var id = String((receipt && receipt.i) || '');
        var m = /^WS-U(\d+)L(\d+)/i.exec(id)
            || /^BL-U(\d+)-L(\d+)/i.exec(id)
            || /^U(\d+)-L(\d+)/i.exec(id);
        if (m) {
            var unit = parseInt(m[1], 10);
            var lesson = parseInt(m[2], 10);
            return {
                key: 'U' + unit + '-L' + lesson,
                label: 'Unit ' + unit + ' · Lesson ' + unit + '.' + lesson,
                icon: '📘',
                sortKey: [unit, lesson, 0]
            };
        }

        m = /^U(\d+)-PC/i.exec(id);
        if (m) {
            var pcUnit = parseInt(m[1], 10);
            return {
                key: 'U' + pcUnit + '-PC',
                label: 'Unit ' + pcUnit + ' · Progress Check',
                icon: '📈',
                sortKey: [pcUnit, 9999, 1]
            };
        }

        return { key: 'other', label: 'Other', icon: '🧾', sortKey: [999999, 999999, 2] };
    }

    var TYPE_GROUPS = {
        worksheet: { key: 'worksheet', label: 'Worksheet questions', icon: '📝', order: 0 },
        curriculum_quiz: { key: 'curriculum_quiz', label: 'Quizzes', icon: '✓', order: 1 },
        frq: { key: 'frq', label: 'Reflections (FRQ)', icon: '✍', order: 2 },
        pc: { key: 'pc', label: 'Progress Checks', icon: '📈', order: 3 },
        blooket: { key: 'blooket', label: 'Blooket', icon: '🎮', order: 4 },
        quiz_verdict: { key: 'quiz_verdict', label: 'AI grade verdicts', icon: '🧾', order: 5 },
        quiz_review: { key: 'quiz_review', label: 'Appeals & reviews', icon: '✓', order: 6 },
        quiz_exception: { key: 'quiz_review', label: 'Appeals & reviews', icon: '✓', order: 6 },
        trainer: { key: 'trainer', label: 'Calculator trainer', icon: '🏋', order: 7 }
    };

    function _typeGroupFor(receipt) {
        var src = String((receipt && receipt.src) || '').toLowerCase();
        return TYPE_GROUPS[src] || { key: 'other', label: 'Other', icon: '🧾', order: 8 };
    }

    function _localDayKey(ts) {
        var d = new Date(ts);
        if (!isFinite(d.getTime())) return 'unknown';
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1);
        var day = String(d.getDate());
        if (m.length < 2) m = '0' + m;
        if (day.length < 2) day = '0' + day;
        return y + '-' + m + '-' + day;
    }

    function _dayLabel(key) {
        if (key === 'unknown') return 'Other';
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var yesterday = new Date(today.getTime() - 86400000);
        var d = new Date(key + 'T00:00:00');
        if (_localDayKey(today.getTime()) === key) return 'Today';
        if (_localDayKey(yesterday.getTime()) === key) return 'Yesterday';
        try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) {}
        return key;
    }

    function _worksheetSubgroupFor(receipt) {
        var lessonGroup = _lessonGroupFor(receipt);
        var m = /^U(\d+)-L(\d+)$/.exec(lessonGroup.key);
        if (m) {
            return {
                key: lessonGroup.key,
                label: 'Lesson ' + parseInt(m[1], 10) + '.' + parseInt(m[2], 10) + ' worksheet',
                sortKey: lessonGroup.sortKey
            };
        }
        return { key: 'other', label: 'Other', sortKey: [999999, 999999, 2] };
    }

    function _addWorksheetTypeSubgroups(groups) {
        for (var i = 0; i < groups.length; i++) {
            var group = groups[i];
            if (!group || group.key !== 'worksheet') continue;

            var map = {};
            var order = [];
            var receipts = Array.isArray(group.receipts) ? group.receipts : [];
            for (var k = 0; k < receipts.length; k++) {
                var sg = _worksheetSubgroupFor(receipts[k]);
                _pushReceiptGroup(map, order, sg.key, sg.label, '', sg.sortKey, receipts[k]);
            }

            var subgroups = order.map(function (key) { return map[key]; });
            subgroups.sort(function (a, b) {
                var ak = a._sortKey || [];
                var bk = b._sortKey || [];
                for (var j = 0; j < Math.max(ak.length, bk.length); j++) {
                    var av = ak[j] == null ? 0 : ak[j];
                    var bv = bk[j] == null ? 0 : bk[j];
                    if (av !== bv) return av - bv;
                }
                return 0;
            });
            group.subgroups = _finishGroups(subgroups);
        }
        return groups;
    }

    // ── Sessions: the primary lens. A session is a time-burst of work (a gap
    // longer than SESSION_GAP_MS starts a new one); within it, work is grouped
    // by lesson. This is how students remember their time ("that afternoon I did
    // Lesson 1.2"), so it is the default wallet view.
    var SESSION_GAP_MS = 25 * 60 * 1000;

    function _sessionTimeLabel(startTs, endTs) {
        function t(ms) { try { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }
        var day = _dayLabel(_localDayKey(startTs));
        return day + ' · ' + (startTs === endTs ? t(startTs) : t(startTs) + '–' + t(endTs));
    }

    function _sortBySortKey(groups) {
        groups.sort(function (a, b) {
            var ak = a._sortKey || [], bk = b._sortKey || [];
            for (var j = 0; j < Math.max(ak.length, bk.length); j++) {
                var av = ak[j] == null ? 0 : ak[j], bv = bk[j] == null ? 0 : bk[j];
                if (av !== bv) return av - bv;
            }
            return 0;
        });
        return groups;
    }

    function _sessionSubgroupsByLesson(receipts) {
        var map = {}, order = [];
        for (var k = 0; k < receipts.length; k++) {
            var lg = _lessonGroupFor(receipts[k]);
            _pushReceiptGroup(map, order, lg.key, lg.label, lg.icon, lg.sortKey, receipts[k]);
        }
        return _finishGroups(_sortBySortKey(order.map(function (key) { return map[key]; })));
    }

    function _sessionGroups(rows) {
        var sorted = rows.slice().sort(function (a, b) { return _receiptTs(a) - _receiptTs(b); });
        var sessions = [], cur = null, lastTs = null;
        for (var i = 0; i < sorted.length; i++) {
            var ts = _receiptTs(sorted[i]);
            if (cur === null || (lastTs !== null && (ts - lastTs) > SESSION_GAP_MS)) {
                cur = { start: ts, end: ts, receipts: [] };
                sessions.push(cur);
            }
            cur.receipts.push(sorted[i]);
            cur.end = ts;
            lastTs = ts;
        }
        sessions.reverse(); // newest session first
        return sessions.map(function (s) {
            return {
                key: 'sess-' + s.start,
                label: _sessionTimeLabel(s.start, s.end),
                icon: '🕐',
                count: s.receipts.length,
                receipts: s.receipts.slice().sort(function (a, b) { return _receiptTs(b) - _receiptTs(a); }),
                subgroups: _sessionSubgroupsByLesson(s.receipts)
            };
        });
    }

    function groupReceipts(receipts, dimension) {
        var rows = Array.isArray(receipts) ? receipts.slice() : [];
        if (dimension === 'session') return _sessionGroups(rows);
        var dim = (dimension === 'type' || dimension === 'day') ? dimension : 'lesson';
        var map = {};
        var order = [];

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i] || {};
            if (dim === 'type') {
                var tg = _typeGroupFor(r);
                _pushReceiptGroup(map, order, tg.key, tg.label, tg.icon, [tg.order], r);
            } else if (dim === 'day') {
                var ts = _receiptTs(r);
                var dayKey = ts ? _localDayKey(ts) : 'unknown';
                _pushReceiptGroup(map, order, dayKey, _dayLabel(dayKey), '📅', [-ts], r);
            } else {
                var lg = _lessonGroupFor(r);
                _pushReceiptGroup(map, order, lg.key, lg.label, lg.icon, lg.sortKey, r);
            }
        }

        var groups = order.map(function (key) { return map[key]; });
        groups.sort(function (a, b) {
            var ak = a._sortKey || [];
            var bk = b._sortKey || [];
            for (var i = 0; i < Math.max(ak.length, bk.length); i++) {
                var av = ak[i] == null ? 0 : ak[i];
                var bv = bk[i] == null ? 0 : bk[i];
                if (av !== bv) return av - bv;
            }
            return 0;
        });

        groups = _finishGroups(groups);
        if (dim === 'type') _addWorksheetTypeSubgroups(groups);
        return groups;
    }

    // ICON_MOTION -- which desktop app hosts a Do-Now next task, so the Desk can
    // breathe that icon ("open me next"). The work manifest only emits
    // activity in {worksheet, quiz} (+ progress checks), and ALL of them are
    // done inside the AP Stats Quiz app, so this returns 'quiz' today. This is
    // the single extensibility seam: add a case here if the manifest ever
    // introduces a calculator/equation activity and the matching tool icon
    // (ti84 / formulas) will light up as the next task automatically.
    function appForNextTask(nextTask) {
        if (!nextTask || typeof nextTask !== 'object') return null;
        var a = nextTask.activity;
        if (a === 'worksheet' || a === 'quiz' || a === 'pc' || a === 'progress_check') return 'quiz';
        return 'quiz'; // curriculum work lives in the Quiz app
    }

    var api = {
        pointsFor: pointsFor,
        computePoints: computePoints,
        mergeReceipts: mergeReceipts,
        walletReadiness: walletReadiness,
        daysBetween: daysBetween,
        summerReadiness: summerReadiness,
        groupReceipts: groupReceipts,
        appForNextTask: appForNextTask
    };

    g.WalletLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
