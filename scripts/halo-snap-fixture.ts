// The snapshot Halo+ would hand the extension for the demo student (Maya Torres, made up), as of now: for the
// Halo+-on-Halo test (scripts/e2e-halo-presence.mjs), which shows it on stand-in Halo pages. Prints JSON:
// { snap, courses: [{ code, cc, slug, name, items: [{ id, haloId, title, unitId }] }] }.
//   npx tsx scripts/halo-snap-fixture.ts
import { dateOf } from '../src/domain/dates';
import { computeSchedule } from '../src/domain/schedule';
import { demoStudent } from '../src/demo/student';
import { classCodeOf, haloSnap } from '../src/halo/haloSnap';

const now = new Date().toISOString();
const d = demoStudent(now).data;
const schedule = computeSchedule(d.items, d.settings, dateOf(now, d.settings.timezone), { start: '2026-08-31', end: '2026-12-20' }, now);
const snap = haloSnap({ courses: d.courses, items: d.items, settings: d.settings, schedule, canSync: true, now });
const courses = d.courses.map((c) => ({
  id: c.id,
  code: c.code,
  cc: classCodeOf(c.haloSlugId),
  slug: c.haloSlugId,
  name: c.name,
  items: d.items.filter((i) => i.courseId === c.id && i.haloId).map((i) => ({ id: i.id, haloId: i.haloId, title: i.title, type: i.type })),
}));
process.stdout.write(JSON.stringify({ snap, courses }));
