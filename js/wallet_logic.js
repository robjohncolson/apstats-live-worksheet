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

    var api = {
        pointsFor: pointsFor,
        computePoints: computePoints,
        mergeReceipts: mergeReceipts
    };

    g.WalletLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
