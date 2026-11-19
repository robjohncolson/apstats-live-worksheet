// @vitest-environment node
// Pure tests of the promise ledger (scripts/lib/promise-ledger.mjs). Invented text only.
import { describe, expect, it } from 'vitest';
import {
  dropBefore, emptyLedger, mergeSummaries, openFor, setState, splitByAge,
} from '../scripts/lib/promise-ledger.mjs';

const OPTIONS = { course: 'apstats', sections: ['B', 'E'] };

function summary(date, promises, section = 'B') {
  return { date, section, course: 'apstats', promises };
}

function merged(summaries, ledger = emptyLedger()) {
  return mergeSummaries(ledger, summaries, OPTIONS);
}

describe('promise ledger', () => {
  it('carries a promise forward across later summaries that do not repeat it', () => {
    const ledger = merged([
      summary('2026-11-02', ['Bring the spare calculators']),
      summary('2026-11-03', []),
      summary('2026-11-04', ['Post the review key']),
    ]);
    const open = openFor(ledger, 'B');
    expect(open.map(p => p.text)).toEqual(['Bring the spare calculators', 'Post the review key']);
    expect(open[0].state).toBe('open');
  });

  it('merges the same promise said again on a later date into one entry', () => {
    const ledger = merged([
      summary('2026-11-02', ['Bring the spare calculators']),
      summary('2026-11-05', ['bring the spare calculators.']),
    ]);
    expect(ledger.promises).toHaveLength(1);
    expect(ledger.promises[0].dates).toEqual(['2026-11-02', '2026-11-05']);
  });

  it('is idempotent: closing one and merging again keeps it closed with the same count', () => {
    const summaries = [summary('2026-11-02', ['Bring the spare calculators']), summary('2026-11-03', ['Post the review key'])];
    const ledger = merged(summaries);
    const id = ledger.promises[0].id;
    setState(ledger, id, 'kept', '2026-11-10');

    merged(summaries, ledger);
    expect(ledger.promises).toHaveLength(2);
    expect(ledger.promises.find(p => p.id === id).state).toBe('kept');
    expect(openFor(ledger, 'B')).toHaveLength(1);
  });

  it('a repeat after the promise was kept makes a new entry', () => {
    const ledger = merged([summary('2026-11-02', ['Bring the spare calculators'])]);
    setState(ledger, ledger.promises[0].id, 'kept', '2026-11-04');

    merged([summary('2026-11-09', ['Bring the spare calculators'])], ledger);
    expect(ledger.promises).toHaveLength(2);
    expect(ledger.promises[1].state).toBe('open');
    expect(ledger.promises[1].firstDate).toBe('2026-11-09');
  });

  it('flags upstreamMissing when a re-pulled summary changed the wording, and adds the new text', () => {
    const ledger = merged([summary('2026-11-02', ['Bring the spare calculators'])]);
    merged([summary('2026-11-02', ['Bring two spare calculators'])], ledger);

    const oldEntry = ledger.promises.find(p => p.text === 'Bring the spare calculators');
    const newEntry = ledger.promises.find(p => p.text === 'Bring two spare calculators');
    expect(oldEntry.upstreamMissing).toBe(true);
    expect(newEntry.upstreamMissing).toBe(false);
    expect(oldEntry.state).toBe('open');
  });

  it('dropBefore drops only open promises first said before the date, optionally one section', () => {
    const ledger = merged([
      summary('2026-11-02', ['Bring the spare calculators']),
      summary('2026-11-02', ['Post the review key'], 'E'),
      summary('2026-11-09', ['Return the quiz folders']),
    ]);
    expect(dropBefore(ledger, '2026-11-05', '2026-11-10', 'B')).toBe(1);
    expect(openFor(ledger, 'B').map(p => p.text)).toEqual(['Return the quiz folders']);
    expect(openFor(ledger, 'E')).toHaveLength(1);
    expect(dropBefore(ledger, '2026-11-05', '2026-11-10')).toBe(1);
    expect(openFor(ledger, 'E')).toHaveLength(0);
  });

  it('setState throws on an unknown id and on an unknown state', () => {
    const ledger = merged([summary('2026-11-02', ['Bring the spare calculators'])]);
    expect(() => setState(ledger, 'nope', 'kept', '2026-11-03')).toThrow(/no promise with id/);
    expect(() => setState(ledger, ledger.promises[0].id, 'maybe', '2026-11-03')).toThrow(/state must be/);
  });

  it('counts a promise as recent by the latest date it was said, not the first', () => {
    const ledger = merged([
      summary('2026-10-29', ['Bring the spare calculators']), // 20 days before the check date
      summary('2026-11-16', ['bring the spare calculators.']), // repeated 2 days before it
      summary('2026-10-29', ['Post the review key']), // said once, long ago
    ]);
    expect(ledger.promises.find(p => p.text === 'Bring the spare calculators').dates).toEqual(['2026-10-29', '2026-11-16']);
    const { recent, older } = splitByAge(openFor(ledger, 'B'), '2026-11-18');
    expect(recent.map(p => p.text)).toEqual(['Bring the spare calculators']);
    expect(older.map(p => p.text)).toEqual(['Post the review key']);
  });

  it('ignores "None" placeholders', () => {
    const ledger = merged([summary('2026-11-02', ['None', 'None.', 'No promises made', 'N/A', ''])]);
    expect(ledger.promises).toHaveLength(0);
  });
});
