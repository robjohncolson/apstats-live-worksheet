// Every AP Classroom video in the Desk's lesson data needs a Drive fallback:
// students without a College Board sign-in only see the altUrl. A null altUrl
// went unnoticed for topic 4.6 video 3 until 11fb4de2; this test fails the next time.
import { describe, it, expect } from 'vitest';
import { deskSource } from './helpers/desk-source.js';

const VIDEO_ENTRY = /\{\s*url:\s*"(https:\/\/apclassroom\.collegeboard\.org\/d\/[^"]*)"([^}]*)\}/g;
const ALT_URL = /altUrl:\s*"([^"]*)"/;

function videoEntries() {
  const entries = [];
  for (const m of deskSource().matchAll(VIDEO_ENTRY)) {
    const alt = ALT_URL.exec(m[2]);
    entries.push({ url: m[1], altUrl: alt ? alt[1] : null });
  }
  return entries;
}

describe('Desk AP Classroom videos have a fallback altUrl', () => {
  const entries = videoEntries();

  it('finds the video entries', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it('every entry has a non-empty altUrl string', () => {
    const missing = entries.filter((e) => !e.altUrl || !e.altUrl.trim()).map((e) => e.url);
    expect(missing).toEqual([]);
  });
});
