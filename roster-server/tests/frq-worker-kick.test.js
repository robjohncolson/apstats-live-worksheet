// frq-worker-kick.test.js — the FRQ worker's idle poll is 60 s, and an accepted
// grade request is claimed as soon as it is ready via kick(). Timers are injected,
// so nothing here waits in real time.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrqWorker } from '../frq-worker.js';

const NOW = Date.parse('2030-01-01T00:00:00Z');

function fakeTimers() {
  const timeouts = [];
  const intervals = [];
  return {
    timeouts,
    intervals,
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timeouts.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    setInterval: (fn, ms) => { const t = { fn, ms }; intervals.push(t); return t; },
    clearInterval: () => {},
    // Fire every pending timeout (and any it schedules) once, in order.
    async flush() {
      for (let i = 0; i < timeouts.length; i++) {
        const t = timeouts[i];
        if (t.cleared || t.fired) continue;
        t.fired = true;
        t.fn();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

function worker({ timers, claim, mode = 'authoritative', extra = {} }) {
  const frqDb = {
    claimFrqTickets: claim || vi.fn(async () => ({ data: [] })),
    health: { degraded: false },
  };
  const w = createFrqWorker({
    frqDb,
    bundle: { items: {} },
    graderUrl: 'https://grader.example',
    graderSecret: 'secret',
    mode,
    config: { now: () => NOW, allowTimer: true, ...timers, ...extra },
    issueReceipt: () => null,
    log: { info() {}, warn() {} },
  });
  return { w, frqDb };
}

afterEach(() => { delete process.env.FRQ_GRADE_POLL_MS; });

describe('idle poll', () => {
  it('defaults to 60 s', () => {
    const timers = fakeTimers();
    const { w } = worker({ timers });
    expect(w.pollMs).toBe(60_000);
    expect(w.start()).toBe(true);
    expect(timers.intervals[0].ms).toBe(60_000);
  });

  it('FRQ_GRADE_POLL_MS still overrides it (bounded 1 s to 300 s)', () => {
    process.env.FRQ_GRADE_POLL_MS = '30000';
    expect(worker({ timers: fakeTimers() }).w.pollMs).toBe(30_000);
    process.env.FRQ_GRADE_POLL_MS = '500';
    expect(worker({ timers: fakeTimers() }).w.pollMs).toBe(1_000);
  });
});

describe('kick: a submit triggers a claim', () => {
  it('runs one claim tick after the given delay', async () => {
    const timers = fakeTimers();
    const { w, frqDb } = worker({ timers });
    expect(w.kick(2_250)).toBe(true);
    expect(timers.timeouts).toHaveLength(1);
    expect(timers.timeouts[0].ms).toBe(2_250);
    expect(frqDb.claimFrqTickets).not.toHaveBeenCalled();
    await timers.flush();
    expect(frqDb.claimFrqTickets).toHaveBeenCalledTimes(1);
    expect(w.counters.kicks).toBe(1);
  });

  it('coalesces a burst of submits into one claim', async () => {
    const timers = fakeTimers();
    const { w, frqDb } = worker({ timers });
    w.kick(2_250); w.kick(2_250); w.kick(2_250);
    expect(timers.timeouts).toHaveLength(1);
    await timers.flush();
    expect(frqDb.claimFrqTickets).toHaveBeenCalledTimes(1);
  });

  it('a later submit during a pending kick re-arms once for its own ready time', async () => {
    let clock = NOW;
    const timers = fakeTimers();
    const { w, frqDb } = worker({ timers, extra: { now: () => clock } });
    w.kick(2_000);                    // due NOW + 2 s
    clock += 1_000;
    w.kick(2_000);                    // due NOW + 3 s
    expect(timers.timeouts).toHaveLength(1);
    await timers.flush();             // fires at +2 s, re-arms for +3 s, which then fires
    expect(frqDb.claimFrqTickets).toHaveBeenCalledTimes(2);
    expect(w.counters.kicks).toBe(2);
  });

  it('does nothing when grading is off', () => {
    const timers = fakeTimers();
    const { w } = worker({ timers, mode: 'off' });
    expect(w.kick(2_250)).toBe(false);
    expect(timers.timeouts).toHaveLength(0);
  });

  it('stop() cancels a pending kick', () => {
    const timers = fakeTimers();
    const { w } = worker({ timers });
    w.start();
    w.kick(2_250);
    w.stop();
    expect(timers.timeouts[0].cleared).toBe(true);
  });
});

describe('a tick and a kick never overlap (no double claim)', () => {
  it('a kick that fires during a running tick waits, then runs exactly one more tick', async () => {
    const timers = fakeTimers();
    let concurrent = 0;
    let maxConcurrent = 0;
    let release;
    const claim = vi.fn(() => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise((resolve) => {
        release = () => { concurrent -= 1; resolve({ data: [] }); };
      });
    });
    const { w } = worker({ timers, claim });

    const pollTick = w.tick();          // the idle poll is mid-claim
    w.kick(0);
    await timers.flush();               // the kick fires while the poll tick runs
    expect(claim).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);

    release();
    await pollTick;                     // its finally schedules the deferred rerun
    await timers.flush();
    expect(claim).toHaveBeenCalledTimes(2);
    release();
    await new Promise((r) => setImmediate(r));
    expect(maxConcurrent).toBe(1);
    expect(w.counters.kickReruns).toBe(1);
  });
});
