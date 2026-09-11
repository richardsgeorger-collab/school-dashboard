// Cross-screen consistency audit, computed with the app's own domain code on the seed (or DATA=path.json).
// Each screen counts "things on a day" by its own rule; this prints where the rules disagree for the next two weeks.
import fs from 'node:fs';
import { derive } from '../src/domain/deadlines';
import { addDays, dateOf, todayStr } from '../src/domain/dates';
import { DERIVED_DEADLINES } from '../src/domain/flags';
import { openCountByDay, todayLine } from '../src/domain/now';
import { computeSchedule } from '../src/domain/schedule';
import { DEFAULT_SETTINGS, type Course, type DateStr, type Item } from '../src/domain/types';

const file = process.env.DATA ?? 'src/data/seed.json';
const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { items: Item[]; courses: Course[] };
const items = raw.items;
const courses = raw.courses;
const settings = DEFAULT_SETTINGS;
const tz = settings.timezone;
const today = process.env.TODAY ?? todayStr(tz);
const now = process.env.NOW ?? new Date().toISOString();
const term = { start: courses.map((c) => c.termStart).sort()[0], end: courses.map((c) => c.termEnd).sort().at(-1)! };
const derived = DERIVED_DEADLINES ? derive(items, courses, settings).deadlines : {};
const binding = items.map((i) => (derived[i.id] && dateOf(derived[i.id].deadlineAt, tz) >= today ? { ...i, deadlineAt: derived[i.id].deadlineAt } : i));
const schedule = computeSchedule(binding, settings, today, term, now);
const work = items.filter((i) => i.type !== 'participation');

const byDue = (pool: Item[]) => {
  const m: Record<DateStr, number> = {};
  for (const i of pool) {
    const d = dateOf(i.dueAt, tz);
    m[d] = (m[d] ?? 0) + 1;
  }
  return m;
};
const rules: Record<string, Record<DateStr, number>> = {
  'Now (open, no participation, by derived deadline day)': openCountByDay(work, schedule),
  'Week/Month (open, all types, by syllabus due day)': byDue(items.filter((i) => i.status !== 'done')),
  'Agenda (all incl. done, all types, by syllabus due day)': byDue(items),
  'DaySheet from Now (all incl. done, no participation, by due day)': byDue(work),
};
const names = Object.keys(rules);
const days = Array.from({ length: 14 }, (_, k) => addDays(today, k));
console.log(`today ${today} · ${items.length} items · ${work.length} non-participation · ${items.filter((i) => i.status === 'done').length} done\n`);
console.log('Now status line: ' + todayLine(work, schedule, today, now, tz) + '\n');
console.log(['day', ...names.map((_, i) => `rule${i + 1}`)].join('\t'));
let disagreements = 0;
for (const d of days) {
  const row = names.map((n) => rules[n][d] ?? 0);
  const differ = new Set(row).size > 1;
  if (differ) disagreements++;
  console.log([d, ...row].join('\t') + (differ ? '   <- differs' : ''));
}
console.log(`\n${disagreements} of ${days.length} days differ across rules.`);
names.forEach((n, i) => console.log(`  rule${i + 1} = ${n}`));

const shifted = work.filter((i) => i.status !== 'done' && schedule.byItem[i.id] && schedule.byItem[i.id].deadlineDay !== dateOf(i.dueAt, tz) && schedule.byItem[i.id].deadlineDay <= addDays(today, 13));
console.log(`\nItems whose derived deadline (what Now counts) is not their syllabus due day (what Calendar shows), next 14 days: ${shifted.length}`);
for (const i of shifted.slice(0, 8)) console.log(`  ${i.label}: Now says ${schedule.byItem[i.id].deadlineDay}, Calendar shows ${dateOf(i.dueAt, tz)}`);

const part = items.filter((i) => i.type === 'participation' && i.status !== 'done');
const partMin = part.reduce((n, i) => n + i.estimatedMinutes, 0);
console.log(`\nParticipation: ${part.length} open items, ${Math.round(partMin / 60)} h of planned study in Load/Week bars that Now does not count as work.`);
const riskAll = Object.values(schedule.byItem).filter((s) => s.risk && items.find((i) => i.id === s.itemId)?.status !== 'done');
const riskWork = riskAll.filter((s) => work.some((i) => i.id === s.itemId));
console.log(`Calendar focus strip risk pills (all types): ${riskAll.length}; without participation: ${riskWork.length}.`);
const doneSoon = items.filter((i) => i.status === 'done' && dateOf(i.dueAt, tz) >= today && dateOf(i.dueAt, tz) <= addDays(today, 13));
console.log(`Done items in the next 14 days that Agenda and DaySheet still count as "due": ${doneSoon.length}.`);
const courseStamp = courses.map((c) => c.updatedAt).sort().at(-1)!;
console.log(`Now footer "syllabi updated" reads course updatedAt: ${dateOf(courseStamp, tz)} (bumps on any course edit or Halo link, not only a syllabus import).`);
