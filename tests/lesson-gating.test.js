// lesson-gating.test.js — a pure model of the Desk's STRICT lesson gate
// (ap_stats_roadmap_square_mode.html: _isLessonUnlocked / _isLessonComplete /
// _prevTopicInSequence / _prevSummerTopic), EXHAUSTIVELY model-checked as a
// transition system. A lesson opens iff its IMMEDIATE topic-predecessor (the
// deduped prior topic in the surface's ordered sequence) is complete.
//
// The historical bug (LESSON_GATE_BUILD §8): the gate keyed on the previous
// CALENDAR CELL, producing a PARITY LEAK (1.2/1.4/1.6 open, 1.3/1.5 locked). The
// invariant that rules this out: the set of completed lessons reachable under the
// gate is always a CONTIGUOUS PREFIX of the sequence — never gapped.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';

// ── Faithful model of the three pure gate functions ──────────────────────────

// _prevTopicInSequence / _prevSummerTopic: dedup consecutive repeats, return the
// immediate predecessor, or null for the first / unknown topic.
function prevInSequence(topic, seq) {
  const dedup = [];
  for (const t of seq) {
    if (t && /^\d+\.\d+/.test(t) && t !== dedup[dedup.length - 1]) dedup.push(t);
  }
  const i = dedup.indexOf(topic);
  return i > 0 ? dedup[i - 1] : null;
}

// _isLessonComplete: a combined "A+B" lesson is complete when its OWN combined
// key is done OR every individual part is (the cross-portion bridge). We model
// "done" as membership in a completed-set (abstracting worksheet/blooket detail).
function isComplete(topic, completed) {
  if (!topic) return true;
  if (String(topic).indexOf('+') >= 0) {
    const parts = String(topic).split('+').filter((p) => /^\d+\.\d+/.test(p));
    if (parts.length > 1 && parts.every((p) => isComplete(p, completed))) return true;
  }
  return completed.has(topic);
}

// _isLessonUnlocked: the STRICT gate.
function isUnlocked(topic, prevTopic, completed, opts = {}) {
  const { signedIn = true, isTeacher = false, override = false } = opts;
  if (!signedIn) return true;       // no identity → no gating
  if (isTeacher) return true;       // teachers see everything
  if (override) return true;        // teacher unlock-table override
  if (!prevTopic) return true;      // first lesson in the sequence
  return isComplete(prevTopic, completed);
}

// ── Transition system: complete(t) is allowed only if t is unlocked. Explore
// EVERY reachable completed-set from empty. (A student can only do an unlocked
// lesson, so this is the real reachable state space.) ────────────────────────
function reachableStates(seq) {
  const seen = new Map(); // key -> Set
  const order = [];
  function key(set) { return seq.filter((t) => set.has(t)).join(','); }
  function visit(set) {
    const k = key(set);
    if (seen.has(k)) return;
    seen.set(k, set);
    order.push(set);
    for (const t of seq) {
      if (set.has(t)) continue;
      const prev = prevInSequence(t, seq);
      if (isUnlocked(t, prev, set)) {
        const next = new Set(set); next.add(t);
        visit(next);
      }
    }
  }
  visit(new Set());
  return order;
}

const SEQ = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6'];

function isPrefix(set, seq) {
  let seenGap = false;
  for (const t of seq) {
    if (set.has(t)) { if (seenGap) return false; }  // a completed topic AFTER a gap
    else seenGap = true;
  }
  return true;
}

// ── INV-1: no parity leak — every reachable completion state is a prefix ──────
describe('lesson gate: reachable completion states are contiguous prefixes (no parity leak)', () => {
  it('the gate cannot produce a gapped completion set (1.x done, predecessor not)', () => {
    for (const set of reachableStates(SEQ)) {
      expect(isPrefix(set, SEQ)).toBe(true);
    }
  });

  it('the set of UNLOCKED lessons is always a prefix + at most the next one (no gapped unlock)', () => {
    for (const set of reachableStates(SEQ)) {
      const unlocked = SEQ.filter((t) => isUnlocked(t, prevInSequence(t, SEQ), set));
      // unlocked must be a contiguous prefix of SEQ
      const unlockedSet = new Set(unlocked);
      expect(isPrefix(unlockedSet, SEQ)).toBe(true);
    }
  });
});

// ── INV-2: no deadlock — every non-complete reachable state can advance ──────
describe('lesson gate: no deadlock (every non-final state can advance)', () => {
  it('from any reachable non-complete state at least one lesson is unlock+incomplete', () => {
    for (const set of reachableStates(SEQ)) {
      if (set.size === SEQ.length) continue; // final
      const canAdvance = SEQ.some((t) => !set.has(t) && isUnlocked(t, prevInSequence(t, SEQ), set));
      expect(canAdvance).toBe(true);
    }
  });

  it('the full sequence is reachable (no lesson is permanently locked)', () => {
    const states = reachableStates(SEQ);
    const full = states.some((s) => s.size === SEQ.length);
    expect(full).toBe(true);
  });
});

// ── INV-3: strict gate — a lesson opens iff its immediate predecessor is done ─
describe('lesson gate: strict single-step dependency', () => {
  it('seq[i] unlocks exactly when seq[i-1] is complete (not i-2, not parity)', () => {
    for (let i = 1; i < SEQ.length; i++) {
      const prev = prevInSequence(SEQ[i], SEQ);
      expect(prev).toBe(SEQ[i - 1]);                       // immediate predecessor
      const withoutPrev = new Set(SEQ.filter((t) => t !== SEQ[i - 1]));
      expect(isUnlocked(SEQ[i], prev, withoutPrev)).toBe(false); // locked w/o predecessor
      const withPrev = new Set([SEQ[i - 1]]);
      expect(isUnlocked(SEQ[i], prev, withPrev)).toBe(true);     // open with predecessor
    }
  });

  it('monotonic: completing more lessons never re-locks an unlocked lesson', () => {
    for (const set of reachableStates(SEQ)) {
      const unlockedBefore = SEQ.filter((t) => isUnlocked(t, prevInSequence(t, SEQ), set));
      for (const add of SEQ) {
        if (set.has(add)) continue;
        const bigger = new Set(set); bigger.add(add);
        for (const t of unlockedBefore) {
          expect(isUnlocked(t, prevInSequence(t, SEQ), bigger)).toBe(true);
        }
      }
    }
  });
});

// ── Combined-topic bridge (summer individual ⇄ fall combined) ────────────────
describe('lesson gate: cross-portion combined-topic bridge', () => {
  it('a fall "A+B" cell is complete iff its parts are (summer student satisfies fall)', () => {
    expect(isComplete('1.2+1.3', new Set(['1.2', '1.3']))).toBe(true);
    expect(isComplete('1.2+1.3', new Set(['1.2']))).toBe(false);
    expect(isComplete('1.2+1.3', new Set([]))).toBe(false);
    // a fall student's OWN combined mark also satisfies it
    expect(isComplete('1.2+1.3', new Set(['1.2+1.3']))).toBe(true);
  });

  it('gating a fall combined lesson on a summer predecessor works through the bridge', () => {
    // Fall sequence: 1.1, then combined 1.2+1.3, then 1.4+1.5.
    const fall = ['1.1', '1.2+1.3', '1.4+1.5'];
    const prev = prevInSequence('1.4+1.5', fall);
    expect(prev).toBe('1.2+1.3');
    // A summer student who did 1.2 and 1.3 individually unlocks 1.4+1.5.
    expect(isUnlocked('1.4+1.5', prev, new Set(['1.2', '1.3']))).toBe(true);
    // ...but not if only 1.2 is done.
    expect(isUnlocked('1.4+1.5', prev, new Set(['1.2']))).toBe(false);
  });
});

// ── Access modes (signed-out / teacher / override all open) ──────────────────
describe('lesson gate: access modes bypass the sequence', () => {
  it('signed-out, teacher, and table-override all open any lesson', () => {
    const locked = new Set([]); // nothing done
    const prev = prevInSequence('1.3', SEQ);
    expect(isUnlocked('1.3', prev, locked, { signedIn: false })).toBe(true);
    expect(isUnlocked('1.3', prev, locked, { isTeacher: true })).toBe(true);
    expect(isUnlocked('1.3', prev, locked, { override: true })).toBe(true);
    expect(isUnlocked('1.3', prev, locked)).toBe(false); // default: gated
  });
});
