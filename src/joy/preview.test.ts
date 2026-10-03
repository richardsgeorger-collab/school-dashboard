import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGES } from './badges';
import { HALO_CARD_LINE, MOMENTS, playAll, SAMPLE_WRAP_LINE, type PreviewSink } from './preview';
import type { JoyEvent } from './joy';

// Admin's Celebrations preview must show things and change nothing: no XP, streak, badge or "shown once" flag, no
// progress, no push (2026-10-02). Three ways of holding it to that: what the code can reach, what it does when every
// moment and Play all run with storage and the network wired to fail, and that it is the same code students see.
const read = (p: string) => readFileSync(p, 'utf8');
const BANNED = [/localStorage/, /sessionStorage/, /indexedDB/, /\bfetch\s*\(/, /supabase/i, /useStore/, /updateJoy/, /updateSettings/, /\bactions\b/, /notify-send/, /functions\.invoke/, /sendBeacon/, /XMLHttpRequest/, /pushManager/i, /\bapplyHaloSync\b/, /\bbump\b/, /analytics/];

describe('the Celebrations preview changes nothing', () => {
  it('has no way to reach the planner, the account, storage or the network', () => {
    for (const f of ['src/joy/preview.ts', 'src/views/AdminCelebrations.tsx']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const re of BANNED) expect(src, `${f} must not match ${re}`).not.toMatch(re);
    }
    // And what it imports is only pure builders and presentational pieces.
    const imports = [...read('src/joy/preview.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./badges', './extSnapshot', './joy', './wrap']);
    const views = [...read('src/views/AdminCelebrations.tsx').matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(views).toEqual(['../components/BrandMark', '../components/Ring', '../joy/JoyHost', '../joy/WrapCard', '../joy/preview', './Celebrate', 'react']);
    // The extension's celebration file touches nothing but the page it is on.
    const ext = read('extension/celebrate.js');
    for (const re of [/chrome\./, /localStorage/, /fetch\s*\(/, /sendMessage/]) expect(ext).not.toMatch(re);
  });

  describe('with storage and the network wired to fail', () => {
    const traps: string[] = [];
    beforeEach(() => {
      vi.useFakeTimers();
      traps.length = 0;
      const trap = (name: string) => () => {
        traps.push(name);
        throw new Error(`preview touched ${name}`);
      };
      const storage = { getItem: trap('storage read'), setItem: trap('storage write'), removeItem: trap('storage remove'), clear: trap('storage clear'), key: trap('storage'), length: 0 };
      vi.stubGlobal('localStorage', storage);
      vi.stubGlobal('sessionStorage', storage);
      vi.stubGlobal('fetch', trap('the network'));
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    const recorder = () => {
      const calls: { kind: string; arg?: unknown }[] = [];
      const sink: PreviewSink = {
        say: (e) => calls.push({ kind: 'say', arg: e }),
        burst: () => calls.push({ kind: 'burst' }),
        ring: () => calls.push({ kind: 'ring' }),
        level: (n, overlay, auto) => calls.push({ kind: 'level', arg: { n, overlay, auto } }),
        wrap: () => calls.push({ kind: 'wrap' }),
        haloCard: (t) => calls.push({ kind: 'haloCard', arg: t }),
        push: (title, body) => calls.push({ kind: 'push', arg: { title, body } }),
      };
      return { calls, sink };
    };

    it('plays every moment on its own, only showing things', () => {
      const { calls, sink } = recorder();
      for (const m of MOMENTS) expect(m.play(sink, { auto: false })).toBeGreaterThan(0);
      vi.runAllTimers();
      expect(calls.length).toBeGreaterThan(MOMENTS.length - 1);
      expect(traps).toEqual([]);
      // Everything it says is marked as a preview, so JoyHost shows it whatever the Celebrations switch says.
      for (const c of calls.filter((x) => x.kind === 'say')) expect((c.arg as JoyEvent).preview).toBe(true);
    });

    it('runs Play all end to end, with a pause between, and can be stopped', async () => {
      const { calls, sink } = recorder();
      const waits: number[] = [];
      await playAll(sink, () => false, async (ms) => void waits.push(ms));
      vi.runAllTimers();
      expect(waits.length).toBe(MOMENTS.filter((m) => !m.skipInAll).length);
      expect(waits.every((w) => w >= 700)).toBe(true);
      expect(traps).toEqual([]);
      // A card does not wait for a tap in Play all.
      expect(calls.filter((c) => c.kind === 'say' && (c.arg as JoyEvent).card).every((c) => (c.arg as JoyEvent).hold)).toBe(true);
      const again = recorder();
      let n = 0;
      await playAll(again.sink, () => n++ >= 2, async () => undefined);
      expect(again.calls.length).toBeLessThan(calls.length);
    });
  });

  it('shows what the spec lists, in the words students see', () => {
    const { calls, sink } = ((): { calls: { kind: string; arg?: unknown }[]; sink: PreviewSink } => {
      const calls: { kind: string; arg?: unknown }[] = [];
      return { calls, sink: { say: (e) => calls.push({ kind: 'say', arg: e }), burst: () => calls.push({ kind: 'burst' }), ring: () => undefined, level: () => undefined, wrap: () => undefined, haloCard: (t) => calls.push({ kind: 'haloCard', arg: t }), push: (t, b) => calls.push({ kind: 'push', arg: `${t}: ${b}` }) } };
    })();
    const said = (id: string) => {
      calls.length = 0;
      MOMENTS.find((m) => m.id === id)!.play(sink, { auto: false });
      return calls.map((c) => (c.kind === 'say' ? (c.arg as JoyEvent).text : String(c.arg ?? c.kind)));
    };
    expect(said('checkoff')).toEqual(['burst', '+50 pts done, 3 days early · CHM-113L is 34% complete']);
    expect(said('sync')).toEqual(['Nice. 3 things turned in since last sync.']);
    expect(said('class-25')).toEqual(['CHM-113L is 25% done.']);
    expect(said('class-75')).toEqual(['CHM-113L is 75% done.']);
    expect(said('class-100')).toEqual(['You finished CHM-113L.']);
    for (const d of [3, 7, 14, 30]) expect(said(`streak-${d}`)).toEqual([`${d}-day streak going.`]);
    expect(BADGES.map((b) => said(`badge-${b}`)[0])).toEqual(['Badge: Early bird.', 'Badge: No late work this week.', 'Badge: Survived a heavy week.', 'Badge: Clean sweep.']);
    expect(said('grade-up')).toEqual(['Your CHM-113 grade went up to 91%.', 'Grade up: Your CHM-113 grade went up to 91%.']);
    expect(said('graded')).toEqual(['Graded: 47/50 on Lab 3.']);
    expect(said('topic')).toEqual(['CHM-113 · Topic 4 cleared.']);
    expect(said('halo')).toEqual(['+50 pts · CHM-113L now 36% done']);
    expect(HALO_CARD_LINE).toBe('+50 pts · CHM-113L now 36% done');
    expect(SAMPLE_WRAP_LINE).toBe('Last week: 9 things turned in, 620 pts. Best week yet.');
    expect(MOMENTS.filter((m) => m.group === 'Level up').map((m) => m.label)).toEqual(['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'All 8 levels']);
  });

  it('is the same code students see, not a copy', () => {
    const host = read('src/joy/JoyHost.tsx');
    for (const b of ['syncMoment(', 'gradeUpMoment(', 'gradedMoment(', 'classMilestoneMoment(', 'topicMoment(', 'streakMoment(', 'badgeMoment(']) expect(host).toContain(b);
    expect(read('src/views/Now.tsx')).toContain('joy(CLEAR_MOMENT)');
    expect(read('src/notify/plan.ts')).toContain('gradeUpBody(fresh)');
    expect(read('src/views/Celebrate.tsx')).toContain('<LevelUp');
    expect(read('src/components/Nav.tsx')).toContain('<BrandMark');
    expect(read('src/joy/WrapCard.tsx')).toContain('<WrapCardView');
    expect(read('extension/content-halo.js')).toContain('globalThis.haloPlusCelebrate(');
    expect(JSON.parse(read('extension/manifest.json')).content_scripts[0].js).toEqual(['celebrate.js', 'content-halo.js']);
  });
});
