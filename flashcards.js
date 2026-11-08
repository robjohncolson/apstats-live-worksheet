// flashcards.js — the shared, PURE Blooket-flashcard engine. window.Flashcards.
//
// Extracted verbatim from the Desk's inline _bf*/_ft* functions so the mobile
// launcher can run flashcards NATIVELY (instead of deep-linking to the Desk) while
// keeping ONE canonical, grade-critical implementation. A parity test
// (tests/flashcards-engine.test.js) pins these against the Desk's inline copies so
// they can't drift. No DOM, no recording — the surface (Desk / mobile-home) owns the
// modal UI + the gradebook write; this owns the deck pipeline, scoring, and the
// grade-affecting item-id shape.
//
// Grade path: a finished deck records its score via
//   gradebookClient.record({ source:'worksheet',
//     itemId: Flashcards.blooketItemId(topic, perDay).itemId,   // BL-U{u}-L{key}-DESK_DONE | -DESK_DAY
//     unit, topic, response:{selfAttest:'blooket'}, score, attempt:1 })
// The roster server maps BL-U\d+-L[\d-]+-DESK_(DONE|DAY) → the Blooket grade (the best
// score, point for point), regardless of source. DESK_DAY = a run dealt from a per-day
// slice of a combined deck (FLASHCARD_DECK_SLICES_SPEC.md D3). A wrong item-id breaks
// combined lessons.

(function (root) {
  'use strict';

  var PASS_THRESHOLD = 0.80;     // quick-check pass + early-stop
  var FULLDECK_SECONDS = 40;     // full timed deck per-card countdown
  var QUICK_TARGET = 10;         // quick check trims to the top 10
  var DECK_CARDS = 30;           // one timed sitting deals at most this many cards (= Desk BLOOKET_DECK_CARDS)

  // ── Deck pipeline ────────────────────────────────────────────────────────────

  // CSV walker that handles quoted fields including embedded newlines + commas.
  function parseCsv(text) {
    var rows = [];
    var cur = '';
    var row = [];
    var inQuote = false;
    text = String(text == null ? '' : text);
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (inQuote && text[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        row.push(cur); cur = '';
      } else if ((c === '\n' || c === '\r') && !inQuote) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else { cur += c; }
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
  }

  // Blooket Import Template columns: 0=Q#, 1=Question, 2-5=Answers, 6=Time, 7=Correct#.
  // Skips non-numeric-col0 header rows. Card = { qnum, q, choices[], correctIdx }.
  function rowsToDeck(rows) {
    var deck = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i] || [];
      var qnum = parseInt((r[0] || '').trim(), 10);
      if (!isFinite(qnum)) continue;
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
      deck.push({ qnum: qnum, q: qText, choices: choices, correctIdx: correctIdx });
    }
    return deck;
  }

  // Top 10 by difficulty (hard > med > easy > untagged); <=10 → all; no tags → first-10.
  function selectTop10(allCards, tagsForFile) {
    if (!allCards || allCards.length === 0) return [];
    if (allCards.length <= QUICK_TARGET) return allCards.slice();
    if (!tagsForFile || Object.keys(tagsForFile).length === 0) {
      return allCards.slice(0, QUICK_TARGET);
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
    return hard.concat(med, easy, untagged).slice(0, QUICK_TARGET);
  }

  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function permSeed(email, roundId, qnum) {
    var text = String(email) + '|' + String(roundId) + '|' + String(qnum);
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
      hash = (((hash << 5) + hash) + text.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
  }

  function permutationFor(seed, n) {
    var permutation = [];
    for (var i = 0; i < n; i++) permutation.push(i);
    if (n <= 1) return permutation;
    var random = mulberry32(seed);
    for (var j = n - 1; j > 0; j--) {
      var swapIndex = Math.floor(random() * (j + 1));
      var value = permutation[j];
      permutation[j] = permutation[swapIndex];
      permutation[swapIndex] = value;
    }
    return permutation;
  }

  function isPermutationUnsafe(choices) {
    var list = choices || [];
    for (var i = 0; i < list.length; i++) {
      if (/\b(all|none) of (these|the above)\b/i.test(String(list[i]))) return true;
    }
    return false;
  }

  // A worksheet URL (u{u}_lesson{key}_live.html) → the deck CSV filename
  // (u{u}_l{key}_blooket.csv, with '-'→'_l' for combined lessons). null if no match.
  // (The Desk's _bfCsvPath resolves the worksheet via the registry first; the mobile
  // launcher already holds the worksheet URL, so this takes it directly.)
  function csvPathFromWorksheet(worksheetUrl) {
    var m = /u(\d+)_lesson([\d-]+)_live\.html/.exec(String(worksheetUrl || ''));
    if (!m) return null;
    return 'u' + m[1] + '_l' + m[2].replace(/-/g, '_l') + '_blooket.csv';
  }

  // ── Scoring ──────────────────────────────────────────────────────────────────

  // Quick check: pass at PASS_THRESHOLD, and it CAPS at 80% via the early-stop count
  // (once you've banked ceil(0.80*len) correct, the quiz ends — you can't bank more).
  function quickPassCount(deckLen) { return Math.ceil(PASS_THRESHOLD * deckLen); }
  function quickScorePct(correct, deckLen) {
    var pct = deckLen > 0 ? (correct / deckLen) : 0;
    return Math.round(pct * 1000) / 10;   // one-decimal percent, 0..100
  }
  function quickPassed(correct, deckLen) {
    return (deckLen > 0 ? (correct / deckLen) : 0) >= PASS_THRESHOLD;
  }

  // Full timed deck (up to 100%): a miss (wrong OR timeout) costs 1/3 credit and
  // re-queues the card; 3 misses → 0 and the card drops. Pure round logic.
  function createRound(deck) {
    var d = (deck || []).slice();
    return {
      deck: d,
      order: d.map(function (_, i) { return i; }),
      status: d.map(function () { return { misses: 0, resolved: false, earned: 0 }; }),
      log: [],
      total: d.length
    };
  }
  function currentIdx(round) { return (round && round.order.length) ? round.order[0] : -1; }
  function recordOutcome(round, outcome, latencyMs) {
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
      st.earned = Math.max(0, 1 - st.misses / 3);
      st.resolved = true;
    } else {
      st.misses += 1;
      if (st.misses >= 3) { st.earned = 0; st.resolved = true; }
      else round.order.push(i);
    }
    return round;
  }
  function roundScore(round) {
    if (!round || round.total <= 0) return 0;
    var sum = 0;
    for (var i = 0; i < round.status.length; i++) sum += round.status[i].earned;
    return (sum / round.total) * 100;
  }
  function fullScorePct(round) { return Math.round(roundScore(round) * 10) / 10; }

  // ── 30-card sittings, per-day slices, save & resume (FLASHCARD_DECK_SLICES_SPEC.md) ──
  // The same text as the Desk's _ftSliceRanges / _ftCardsInRanges / _ftDealDeck /
  // _ftResumeRemaining / _ftSavedRoundOk (only the name and the indent differ);
  // tests/flashcards-engine.test.js pins the two copies line for line.

  // The Q# ranges [[lo, hi], …] of one topic's slice of a combined deck, or null when the
  // deck is dealt whole. slices = the .slices object of data/blooket-deck-slices.json.
  // A combined cell "a+b" uses its first key.
  function sliceRanges(slices, csvName, topicId) {
    if (!slices || typeof slices !== 'object' || !csvName || topicId == null) return null;
    var byTopic = slices[csvName];
    if (!byTopic || typeof byTopic !== 'object') return null;
    var ranges = byTopic[String(topicId).split('+')[0]];
    if (!Array.isArray(ranges) || !ranges.length) return null;
    return ranges;
  }

  // The cards whose Q# falls inside any of the ranges. No ranges: every card. Ranges
  // that match no card: every card too (a bad range must never deal an empty deck).
  function cardsInRanges(cards, ranges) {
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
  function dealDeck(cards, max, shuffleFn) {
    return shuffleFn(cards.slice()).slice(0, max);
  }

  // Seconds left on a saved card whose clock started at cardStartMs: the clock keeps
  // running in wall time while the deck is closed. null = the run was saved between
  // cards, so the next card gets a full clock.
  function resumeRemaining(cardStartMs, nowMs, perCardSeconds) {
    if (typeof cardStartMs !== 'number' || !isFinite(cardStartMs)) return null;
    var elapsedSeconds = Math.floor((nowMs - cardStartMs) / 1000);
    if (elapsedSeconds < 0) return perCardSeconds;   // the device clock went backwards
    return Math.max(0, perCardSeconds - elapsedSeconds);
  }

  // A saved round comes back from localStorage: resume it only when its shape is intact.
  function savedRoundOk(round) {
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

  // ── The grade-affecting item-id (BL-U{u}-L{key}-DESK_DONE | -DESK_DAY) ─────────
  // The server maps this exact shape to the Blooket grade. Combined lessons keep the
  // full lesson segment (topic "4.1-2" → BL-U4-L1-2-DESK_DONE) so they don't collide
  // on the upsert key. perDay (the run was dealt from a per-day slice) gives -DESK_DAY,
  // otherwise -DESK_DONE (FLASHCARD_DECK_SLICES_SPEC.md D3). A pair cell "4.7+4.8" records
  // under its first key (BL-U4-L7-…), the lesson its deck was dealt for (sliceRanges).
  // Returns { unit, itemId }; a topic that does not parse gives
  // { unit: null, itemId: 'BL-U?-DESK_DONE' }.
  function blooketItemId(topicId, perDay) {
    var lessonKey = (topicId == null ? '' : String(topicId)).split('+')[0];
    var um = /^(\d+)\.([\d-]+)$/.exec(lessonKey);
    var unit = um ? 'U' + um[1] : null;
    var suffix = perDay ? '-DESK_DAY' : '-DESK_DONE';
    var itemId = 'BL-' + (unit || 'U?') + (um ? '-L' + um[2] : '') + suffix;
    return { unit: unit, itemId: itemId };
  }

  root.Flashcards = {
    PASS_THRESHOLD: PASS_THRESHOLD,
    FULLDECK_SECONDS: FULLDECK_SECONDS,
    QUICK_TARGET: QUICK_TARGET,
    DECK_CARDS: DECK_CARDS,
    parseCsv: parseCsv,
    rowsToDeck: rowsToDeck,
    selectTop10: selectTop10,
    shuffle: shuffle,
    mulberry32: mulberry32,
    permSeed: permSeed,
    permutationFor: permutationFor,
    isPermutationUnsafe: isPermutationUnsafe,
    csvPathFromWorksheet: csvPathFromWorksheet,
    quickPassCount: quickPassCount,
    quickScorePct: quickScorePct,
    quickPassed: quickPassed,
    createRound: createRound,
    currentIdx: currentIdx,
    recordOutcome: recordOutcome,
    roundScore: roundScore,
    fullScorePct: fullScorePct,
    sliceRanges: sliceRanges,
    cardsInRanges: cardsInRanges,
    dealDeck: dealDeck,
    resumeRemaining: resumeRemaining,
    savedRoundOk: savedRoundOk,
    blooketItemId: blooketItemId
  };
})(typeof window !== 'undefined' ? window : this);
