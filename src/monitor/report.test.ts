import { describe, expect, it } from 'vitest';
import { allowed, browserOf, fingerprint, scrub } from './report';
import { isChunkError } from './install';
import { shortSync } from '../views/DiffReview';
import { mkCourse, mkData, mkItem } from '../halo/fixtures';

describe('error reports carry nothing personal', () => {
  it('scrubs emails, tokens, keys, long ids and query strings', () => {
    const s = scrub('Failed for jane.doe@my.gcu.edu with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF12345 key=sk_live_abcdefghijklmnop at https://x.com/a?token=secret123&b=2 id 3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c', 500)!;
    expect(s).not.toMatch(/jane|eyJ|sk_live|secret123|3f9a8b7c6d5e/);
    expect(s).toContain('[email]');
  });
  it('caps length', () => expect(scrub('x'.repeat(1000), 100)!.length).toBe(101));
});

describe('grouping', () => {
  it('the same problem is one issue across builds, line numbers and counts', () => {
    const a = fingerprint({ kind: 'crash', title: 'Screen crashed: Cannot read 3 of undefined', place: '/now', stack: 'TypeError\n    at Hero (https://haloplus.app/assets/Now-BkAzP5ef.js:12:345)' });
    const b = fingerprint({ kind: 'crash', title: 'Screen crashed: Cannot read 7 of undefined', place: '/now', stack: 'TypeError\n    at Hero (https://haloplus.app/assets/Now-Zq91xYw2.js:99:1)' });
    expect(a).toBe(b);
    expect(a).toMatch(/^crash-[a-f0-9]{8}$/);
    expect(fingerprint({ kind: 'crash', title: 'Screen crashed: Other', place: '/now' })).not.toBe(a);
  });
});

describe('one broken loop cannot flood the table', () => {
  it('15 per device in 10 minutes, and the same problem once in 5', () => {
    const now = 1_000_000_000;
    expect(allowed([], 'a', now)).toBe(true);
    expect(allowed([{ at: now - 60_000, fp: 'a' }], 'a', now)).toBe(false);
    expect(allowed([{ at: now - 6 * 60_000, fp: 'a' }], 'a', now)).toBe(true);
    expect(allowed(Array.from({ length: 15 }, (_, i) => ({ at: now - i * 1000, fp: `x${i}` })), 'b', now)).toBe(false);
  });
});

describe('context', () => {
  it('names the browser and device from the user agent', () => {
    expect(browserOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toEqual({ browser: 'Chrome 142 on macOS', device: 'desktop' });
    expect(browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toEqual({ browser: 'Safari 18 on iOS', device: 'phone' });
    expect(browserOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5).device).toBe('tablet');
  });
  it('knows a code file missing after a deploy', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://haloplus.app/assets/Calendar-x.js'))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('silent failures in a sync', () => {
  const chm = mkCourse({ id: 'c1', code: 'CHM-113', haloClassId: 'h1' });
  const eng = mkCourse({ id: 'c2', code: 'ENG-105', haloClassId: 'h2' });
  const items = [mkItem({ id: 'i1', courseId: 'c1', title: 'HW 1', source: 'halo', score: 18 }), mkItem({ id: 'i2', courseId: 'c2', title: 'DQ 1', source: 'halo' })];
  const data = { ...mkData([chm, eng], items), settings: { ...mkData([], []).settings, lastPull: { at: 'x', build: null, counts: { classes: 2 } } } };
  const cls = (id: string, assessments: unknown[]) => ({ id, courseCode: 'X', classCode: 'X', name: 'X', assessments, announcements: [] });
  it('fewer classes than the last sync, a class with no assignments, and no grades where there were some', () => {
    const payload = { kind: 'halo-export', version: 1, exportedAt: 'x', source: 'bookmarklet', classes: [cls('h1', [{ id: 'a', title: 'HW', score: null, status: null }])] } as never;
    const s = shortSync(payload, data);
    expect(s.fewer).toEqual({ before: 2, after: 1 });
    expect(s.noGrades).toBe(1);
    const empty = shortSync({ kind: 'halo-export', version: 1, exportedAt: 'x', classes: [cls('h1', [{ id: 'a', score: 18 }]), cls('h2', [])] } as never, data);
    expect(empty.fewer).toBeNull();
    expect(empty.emptyClasses).toBe(1);
    expect(empty.noGrades).toBe(0);
  });
});
