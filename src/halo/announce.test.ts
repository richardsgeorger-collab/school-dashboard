import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from './fixtures';
import { announceFromTool, buildAnnouncePrompt, mergeAnnouncement, unreadLine, type StoredAnnouncement } from './announce';
import { pullsFrom, stalenessLine, staleness } from './freshness';
import type { HaloAnnouncement, HaloExport } from './types';
import { DEFAULT_SETTINGS } from '../domain/types';

const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I' });
const today = '2026-09-17';
const raw = (o: Partial<HaloAnnouncement> = {}): HaloAnnouncement => ({ id: 'p1', forumId: 'f1', title: 'Week 4 plan', content: '<p>Bring your <b>lab goggles</b> Thursday.</p>', publishedAt: '2026-09-16T15:00:00.000Z', modifiedAt: null, author: 'Pat Rivera', mustAcknowledge: false, acknowledged: false, resources: [], ...o });
const stored = (o: Partial<StoredAnnouncement> = {}): StoredAnnouncement => ({ ...raw(), courseId: 'eng', text: 'Bring your lab goggles Thursday.', pulledAt: '', readAt: null, processedAt: null, findings: null, review: {}, ...o });

describe('announcements as they arrive', () => {
  it('strips the markup, keeps what the student has already read, and treats an edit as new again', () => {
    const first = mergeAnnouncement(raw(), 'eng', null, 'now');
    expect(first.text).toBe('Bring your lab goggles Thursday.');
    expect(first.readAt).toBeNull();
    const read = { ...first, readAt: 'yesterday', processedAt: 'yesterday', findings: [] };
    // The same post again: still read.
    expect(mergeAnnouncement(raw(), 'eng', read, 'now').readAt).toBe('yesterday');
    // Edited: unread again, and the old reading is dropped rather than left stale.
    const edited = mergeAnnouncement(raw({ content: '<p>Goggles AND closed shoes.</p>' }), 'eng', read, 'now');
    expect(edited.readAt).toBeNull();
    expect(edited.findings).toBeNull();
    expect(edited.pulledAt).toBe(read.pulledAt);
  });
  it('says one quiet line for what is unread, naming the newest', () => {
    const list = [stored({ id: 'a', title: 'Week 4 plan' }), stored({ id: 'b', title: 'Office hours', courseId: 'chm', publishedAt: '2026-09-15T15:00:00.000Z' }), stored({ id: 'c', readAt: 'x' })];
    expect(unreadLine(list, [eng, chm], TZ)?.text).toBe('ENG-105 posted "Week 4 plan" on Sep 16, and 1 more announcement you have not read.');
    expect(unreadLine([stored({ readAt: 'x' })], [eng], TZ)).toBeNull();
    expect(unreadLine([], [eng], TZ)).toBeNull();
  });
});

describe('what an announcement changes', () => {
  const items = [mkItem({ id: 'lab2', courseId: 'eng', title: 'Lab 2 Report', label: 'Eng Lab 2', dueAt: '2026-09-25T23:59:00-07:00' })];
  it('carries the posting date and the planner list, and keeps only findings that quote the post', () => {
    const prompt = buildAnnouncePrompt(stored(), eng, items, TZ);
    expect(prompt.user).toContain('Posted: 2026-09-16 by Pat Rivera');
    expect(prompt.user).toContain('lab2 · Eng Lab 2');
    expect(prompt.system[0].text).toContain('If you cannot quote it, it is not a finding');
    const read = announceFromTool(
      {
        summary: 'Goggles Thursday, and the lab report moved.',
        findings: [
          { kind: 'date_change', title: 'Lab 2 Report', date: '2026-09-27', time: '23:59', points: 0, quote: 'the lab report is now due the 27th', confidence: 'high', item_id: 'lab2', note: 'It moved two days later.' },
          { kind: 'info', title: 'Bring goggles', date: '', time: '', points: 0, quote: 'Bring your lab goggles Thursday.', confidence: 'high', item_id: '', note: 'Pack them Wednesday night.' },
          { kind: 'new', title: 'No quote', date: '2026-09-30', time: '', points: 10, quote: '', confidence: 'low', item_id: '', note: 'dropped' },
        ],
      },
      stored(),
      items,
    );
    expect(read.findings.map((f) => [f.kind, f.title, f.date, f.itemId])).toEqual([
      ['date_change', 'Lab 2 Report', '2026-09-27', 'lab2'],
      ['info', 'Bring goggles', null, null],
    ]);
    expect(read.findings[0].courseId).toBe('eng');
    expect(read.summary).toBe('Goggles Thursday, and the lab report moved.');
    // An announcement that is only news produces nothing to approve.
    expect(announceFromTool({ summary: 'Welcome to week four.', findings: [] }, stored(), items).findings).toEqual([]);
  });
});

describe('never a clean state you cannot back up', () => {
  const payload = (o: Partial<HaloExport['classes'][number]>): HaloExport => ({ kind: 'halo-export', version: 1, exportedAt: 'now', source: 'bookmarklet', classes: [{ id: 'h1', slugId: 's', classCode: 'ENG-105-ONL4', courseCode: 'ENG-105', name: 'x', startDate: null, endDate: null, stage: null, modality: null, credits: null, assessments: [], ...o }] });
  const idOf = () => 'eng';
  it('stamps only what actually came back', () => {
    const now = '2026-09-17T12:00:00.000Z';
    // Announcements asked for and none there is still a pull; assessments absent is not.
    const p1 = pullsFrom(payload({ announcements: [] }), idOf, undefined, now);
    expect(p1.eng).toEqual({ assessments: null, grades: null, announcements: now, rubrics: null, feedback: null, resources: null });
    // The bookmark did not ask: the previous stamp stands rather than being refreshed.
    const p2 = pullsFrom(payload({ assessments: [{ id: 'a', title: 't', description: null, unit: null, unitSequence: null, sequence: null, startDate: null, dueDate: '2026-09-20', points: 10, type: 'ASSIGNMENT', tags: [], inPerson: false, isGroupEnabled: false, requiresLopesWrite: false, status: null, submittedAt: null, score: null }] }), idOf, p1, '2026-09-18T12:00:00.000Z');
    expect(p2.eng.announcements).toBe(now);
    expect(p2.eng.assessments).toBe('2026-09-18T12:00:00.000Z');
  });
  it('names what is stale and never lets an unsynced class look empty', () => {
    const settings = { ...DEFAULT_SETTINGS, timezone: TZ };
    expect(stalenessLine(staleness([eng, chm], settings, today), 2)).toBe('No class has been synced from Halo yet, so this is only what was imported.');
    const one = { ...settings, haloPulls: { eng: { assessments: '2026-09-17T19:00:00.000Z', grades: null, announcements: '2026-09-17T19:00:00.000Z', rubrics: null, feedback: null, resources: null } } };
    expect(stalenessLine(staleness([eng, chm], one, today), 2)).toBe('CHM-113 has never been synced from Halo, so nothing here is the whole picture for it.');
    const old = { ...settings, haloPulls: { eng: { assessments: '2026-09-10T19:00:00.000Z', grades: '2026-09-17T19:00:00.000Z', announcements: '2026-09-17T19:00:00.000Z', rubrics: null, feedback: null, resources: null } } };
    expect(stalenessLine(staleness([eng], old, today), 1)).toBe('Last Halo sync was 7 days ago. Sync now.');
    const fresh = { ...settings, haloPulls: { eng: { assessments: '2026-09-16T19:00:00.000Z', grades: '2026-09-16T19:00:00.000Z', announcements: '2026-09-16T19:00:00.000Z', rubrics: '2026-09-16T19:00:00.000Z', feedback: '2026-09-16T19:00:00.000Z', resources: '2026-09-16T19:00:00.000Z' } } };
    expect(stalenessLine(staleness([eng], fresh, today), 1)).toBeNull();
  });
});
