import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changesLine, changesSince } from '../domain/changes';
import { cookMeter } from '../domain/cook';
import { dateOf } from '../domain/dates';
import { rankItems, statusLine } from '../domain/now';
import { participationThisWeek, weekLine } from '../domain/participationWeek';
import { computeSchedule } from '../domain/schedule';
import { syncReminder } from '../halo/syncReminder';
import { demoStudent } from './student';

const NOW = '2026-10-13T16:30:00.000Z'; // a Tuesday morning in Phoenix
const TZ = 'America/Phoenix';
const s = demoStudent(NOW);
const today = dateOf(NOW, TZ);
const byCode = (code: string) => s.data.courses.find((c) => c.code === code)!;
const item = (title: string) => s.data.items.find((i) => i.title === title)!;

describe('the demo student', () => {
  it('is six classes of made-up people, a week into Topic 3, synced minutes ago', () => {
    expect(s.data.courses).toHaveLength(6);
    const names = s.data.courses.flatMap((c) => c.instructors.map((i) => i.name));
    for (const n of names) expect(n).toMatch(/^(Dr|Prof)\. /);
    expect(s.data.courses.every((c) => c.instructors.every((i) => i.email.endsWith('@example.edu')))).toBe(true);
    expect(s.data.settings.lastPull?.via).toBe('extension');
    expect(syncReminder({ lastAt: s.data.settings.lastPull!.at, now: Date.parse(NOW), allowed: true, extInstalled: true, autoPlan: true, paused: false })).toBeNull();
    expect(s.data.settings.onboarding?.doneAt).toBeTruthy();
    expect(s.data.settings.extSetup?.doneAt).toBeTruthy();
  });
  it("Now's hero is tonight's discussion, carrying the three parts its announcement asked for", () => {
    const schedule = computeSchedule(s.data.items, s.data.settings, today, { start: '2026-09-08', end: '2026-12-20' });
    const hero = rankItems(s.data.items.filter((i) => i.type !== 'participation'), schedule, NOW, TZ)[0];
    expect(hero.title).toBe('Topic 3 DQ 1: Memory');
    expect(hero.requirements?.map((r) => r.source.kind)).toEqual(['announcement', 'announcement', 'announcement']);
    expect(hero.requirements?.[0].text).toContain('250 words');
    expect(statusLine(s.data.items, today, NOW, TZ).text).toBe('1 thing needs you.');
  });
  it('a due date change found in an announcement, with the post it came from', () => {
    const q = item('Quiz 2: Derivatives');
    expect(q.dateChange?.source.kind).toBe('announcement');
    expect(dateOf(q.dateChange!.from, TZ) < dateOf(q.dueAt, TZ)).toBe(true);
    const post = s.announcements.find((a) => a.id === q.dateChange!.source.id);
    expect(post?.title).toBe('Quiz 2 moved to Thursday');
    expect(post?.readAt).toBeNull();
  });
  it('Calculus is in the red on the Cooked meter; the others are not', () => {
    const cook = (code: string) => cookMeter(s.data.items.filter((i) => i.courseId === byCode(code).id), today, TZ).level;
    expect(cook('MAT-250')).toBe('red');
    expect(['BIO-181', 'PSY-102', 'COM-100', 'UNV-103'].map(cook).every((l) => l !== 'red')).toBe(true);
  });
  it('a grade went up in the last sync, participation is open this week, and "since you last looked" has news', () => {
    expect(s.data.settings.joy?.pending?.gradeUps).toEqual([{ courseId: byCode('BIO-181').id, code: 'BIO-181', percent: 91, letter: 'A-' }]);
    expect(byCode('BIO-181').haloGrade?.letter).toBe('A-');
    expect(weekLine(participationThisWeek(s.data.items, s.data.courses, today, TZ, NOW))).toBe('Participation this week: 2 left');
    const changes = changesSince(s.snapshot, s.data.items, TZ, (d) => d);
    expect(changesLine(changes)).toBe('1 new assignment, 1 due date moved, 1 new grade');
  });
});

describe('demo mode never reaches the server', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('keeps its own cache keys and announcement database', () => {
    expect(src('src/storage/localRepo.ts')).toMatch(/DATA_KEY = isDemo\(\) \? DEMO_DATA_KEY/);
    expect(src('src/storage/localRepo.ts')).toMatch(/PENDING_KEY = isDemo\(\) \? DEMO_PENDING_KEY/);
    expect(src('src/halo/announce.ts')).toMatch(/DB_NAME = isDemo\(\) \? DEMO_DB_NAME/);
    expect(src('src/views/SinceLastLooked.tsx')).toContain("isDemo() ? 'demo'");
  });
  it('never connects the account mirror, the reader, the ledger, the planner, usage counts or the sync poll', () => {
    expect(src('src/auth/useAccountSync.ts')).toMatch(/if \(!client \|\| isDemo\(\)\)/);
    expect(src('src/halo/backgroundRead.ts')).toMatch(/if \(demo\) return;/);
    expect(src('src/halo/backgroundRead.ts')).toMatch(/can\('announcementAI', tier\) && !demo/);
    expect(src('src/notify/NotificationPlanner.tsx')).toMatch(/if \(demo \|\| !auth\.session/);
    expect(src('src/analytics/usage.ts')).toMatch(/if \(!c \|\| isDemo\(\)\) return;/);
    expect(src('src/App.tsx')).toMatch(/if \(!account\.session \|\| isDemo\(\)\) return;/);
  });
});
