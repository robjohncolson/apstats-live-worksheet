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

    var api = {
        pointsFor: pointsFor,
        computePoints: computePoints,
        mergeReceipts: mergeReceipts,
        walletReadiness: walletReadiness,
        daysBetween: daysBetween,
        summerReadiness: summerReadiness
    };

    g.WalletLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
