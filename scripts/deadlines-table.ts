// Print every real-deadline inference on the seed for review. npx tsx scripts/deadlines-table.ts
import { derive } from '../src/domain/deadlines';
import { fmtDate } from '../src/domain/dates';
import { DEFAULT_SETTINGS, type Course, type Item } from '../src/domain/types';
import seed from '../src/data/seed.json';

const items = seed.items as Item[];
const courses = seed.courses as Course[];
const code = new Map(courses.map((c) => [c.id, c.code]));
const all = derive(items, courses, DEFAULT_SETTINGS);
const r = all.deadlines;
const rows = items
  .filter((i) => r[i.id])
  .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || code.get(a.courseId)!.localeCompare(code.get(b.courseId)!));
const byReason: Record<string, number> = {};
for (const i of rows) for (const reason of r[i.id].reasons) byReason[reason.replace(/\d+ items/, 'N items').replace(/before .+$/, 'before <dependent>').replace(/the \w{3} lab/, 'the lab')] = (byReason[reason.replace(/\d+ items/, 'N items').replace(/before .+$/, 'before <dependent>').replace(/the \w{3} lab/, 'the lab')] ?? 0) + 1;
console.log(`${rows.length} of ${items.length} items moved; ${all.nudges.length} pre-lab nudges. Rule hits:`, byReason);
console.log('');
console.log('| # | Item | Class | Syllabus due | Real deadline | Days early | Why |');
console.log('|---|---|---|---|---|---|---|');
rows.forEach((i, k) => {
  const d = r[i.id];
  const days = Math.round((new Date(i.dueAt.slice(0, 10)).getTime() - new Date(d.deadlineAt.slice(0, 10)).getTime()) / 86400000);
  console.log(`| ${k + 1} | ${i.label} | ${code.get(i.courseId)} | ${fmtDate(i.dueAt.slice(0, 10), 'long')} | ${fmtDate(d.deadlineAt.slice(0, 10), 'long')} | ${days} | ${d.reasons.join('; ')} |`);
});

console.log('');
console.log('| Nudge | For | Day |');
console.log('|---|---|---|');
for (const nd of all.nudges) console.log(`| ${nd.label} | ${code.get(items.find((i) => i.id === nd.itemId)!.courseId)} | ${fmtDate(nd.day, 'long')} |`);
