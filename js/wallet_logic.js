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
        worksheet: { key: 'worksheet', label: 'Worksheets', icon: '📝', order: 0 },
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

    function groupReceipts(receipts, dimension) {
        var rows = Array.isArray(receipts) ? receipts.slice() : [];
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

        return _finishGroups(groups);
    }

    var api = {
        pointsFor: pointsFor,
        computePoints: computePoints,
        mergeReceipts: mergeReceipts,
        walletReadiness: walletReadiness,
        daysBetween: daysBetween,
        summerReadiness: summerReadiness,
        groupReceipts: groupReceipts
    };

    g.WalletLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
