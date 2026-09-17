import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { elapsedLine, elapsedMinutes, fitLine, HALO_HOME, haloLink, heroFacts } from './heroFacts';
import { computeSchedule } from './schedule';
import { DEFAULT_SETTINGS } from './types';

const at = (d: string, t = '23:59:00') => `${d}T${t}-07:00`;
const today = '2026-09-17';
const eng = mkCourse({ id: 'eng', code: 'ENG-105', meetings: [{ day: 4, start: '11:00', end: '12:15' }] }); // Thursday
const settings = { ...DEFAULT_SETTINGS, timezone: TZ, weekdayMinutes: 180, weekendMinutes: 300 };
const draft = mkItem({ id: 'draft', courseId: 'eng', title: 'First Draft of an Op-Ed', label: 'Eng Op-Ed Draft', type: 'paper', points: 100, dueAt: at('2026-09-21'), estimatedMinutes: 240, flags: { inClass: false, group: false, lopesWrite: true, timed: false, practice: false }, blocks: ['final'] });
const final = mkItem({ id: 'final', courseId: 'eng', title: 'Final Draft of an Op-Ed', label: 'Eng Op-Ed Final', type: 'paper', points: 200, dueAt: at('2026-11-01'), estimatedMinutes: 200, plan: { asks: '', startBy: null, minutes: null, milestones: [], prerequisites: [], flags: { lopesWrite: true, timed: false, group: false, inPerson: false }, topics: [], feeds: null, sources: [], citations: [], model: 'm', at: '', inputHash: 'h' } });
const post = mkItem({ id: 'post', courseId: 'eng', title: 'Topic 3 DQ 1', label: 'Eng DQ 3.1', type: 'discussion', points: 5, dueAt: at('2026-09-18'), estimatedMinutes: 25 });
const items = [draft, final, post];
const schedule = computeSchedule(items, settings, today, { start: '2026-08-31', end: '2026-12-13' }, at(today, '09:00:00'));

describe('facts, not urgency', () => {
  it('names worth, time, due day, what it unlocks or feeds, and LopesWrite, in that order', () => {
    expect(heroFacts(draft, items, 240, TZ, today).map((f) => f.text)).toEqual(['100 pts', '~4h', 'due Mon, Sep 21', 'unlocks Eng Op-Ed Final', 'goes through LopesWrite']);
    expect(heroFacts(draft, items, 240, TZ, today)[3].itemId).toBe('final');
    expect(heroFacts(post, items, 25, TZ, today).map((f) => f.text)).toEqual(['5 pts', '~25m', 'due tomorrow']);
    const late = { ...post, dueAt: at('2026-09-10') };
    expect(heroFacts(late, items, 25, TZ, today)[2].text).toBe('due was Sep 10');
    const withFeeds = { ...draft, blocks: [], plan: { ...final.plan!, feeds: 'final' } };
    expect(heroFacts(withFeeds, items, 240, TZ, today).map((f) => f.text)).toContain('feeds Eng Op-Ed Final');
  });
  it('says whether it fits before class today, else how much is free before it is due', () => {
    // 9:00 on a Thursday, ENG-105 at 11:00: two hours.
    const morning = at(today, '09:00:00');
    expect(fitLine(post, 25, schedule, [eng], today, morning, TZ)).toBe('Fits before ENG-105 at 11:00 AM.');
    expect(fitLine(draft, 240, schedule, [eng], today, morning, TZ)).toBe('2h until ENG-105: enough for the first step.');
    // After class: the free time across the days left.
    const evening = at(today, '19:00:00');
    expect(fitLine(post, 25, schedule, [eng], today, evening, TZ)).toBeNull();
    const line = fitLine(draft, 240, schedule, [eng], today, evening, TZ);
    expect(line).toMatch(/^4h of work, ~\d+(\.\d+)?h free across the 5 days before it's due\.$/);
  });
  it('reads the timer', () => {
    expect(elapsedLine(null, at(today, '10:00:00'))).toBeNull();
    expect(elapsedLine(at(today, '09:48:00'), at(today, '10:00:00'))).toBe('Started 12m ago');
    expect(elapsedLine(at(today, '10:00:00'), at(today, '10:00:20'))).toBe('Just started');
    expect(elapsedMinutes(at(today, '08:30:00'), at(today, '10:00:00'))).toBe(90);
  });
});

describe('the way in to Halo', () => {
  it('uses the export link when there is one, and Halo itself when there is not, never a guessed address', () => {
    expect(haloLink({ ...draft, url: 'https://halo.gcu.edu/courses/abc/assessments/1' }, 'ENG-105')).toEqual({ href: 'https://halo.gcu.edu/courses/abc/assessments/1', label: 'Open in Halo' });
    expect(haloLink(draft, 'ENG-105')).toEqual({ href: HALO_HOME, label: 'Open ENG-105 in Halo' });
    expect(haloLink(draft, undefined).label).toBe('Open Halo');
  });
});
