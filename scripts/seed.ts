/**
 * Generate src/data/seed.json from syllabi/*.pdf (or *.txt line dumps).
 * Falls back to the parser fixtures when syllabi/ is empty so the app always has data.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from '../src/data/courseDefaults';
import { parseGcuSyllabus } from '../src/parser/gcuSyllabus';
import { extractLines } from '../src/parser/pdfText';
import { toAppData } from '../src/parser/toAppData';
import type { Course, Item } from '../src/domain/types';

const TZ = 'America/Phoenix';
/** The sample term's own timetable (the six syllabi in syllabi/ are one student's). Only the seed uses it. */
const SAMPLE_SETUP: Record<string, Partial<Course>> = {
  'CHM-113': { color: '#D95D39', online: false, meetings: [{ day: 3, start: '07:00', end: '08:15' }, { day: 5, start: '07:00', end: '08:15' }] },
  'CHM-113L': { color: '#2F6FDB', online: false, meetings: [{ day: 1, start: '18:00', end: '20:50' }] },
  'ENG-105': { color: '#1F9E89', online: false, meetings: [{ day: 3, start: '11:00', end: '12:45' }, { day: 5, start: '11:00', end: '12:45' }] },
  'ESG-162': { color: '#7A5AD0', online: false, meetings: [{ day: 2, start: '07:00', end: '08:15' }, { day: 4, start: '07:00', end: '08:15' }] },
  'ESG-162L': { color: '#C9459A', online: false, meetings: [{ day: 2, start: '12:30', end: '14:20' }] },
  'UNV-106': { color: '#B8860B', online: true, meetings: [] },
};
const SYLLABI = 'syllabi';
const FIXTURES = 'src/parser/fixtures';
const OUT = 'src/data/seed.json';

async function main() {
  let dir = SYLLABI;
  let files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(pdf|txt)$/i.test(f)).sort() : [];
  if (files.length === 0) {
    console.log(`No files in ${SYLLABI}/, using parser fixtures from ${FIXTURES}/`);
    dir = FIXTURES;
    files = readdirSync(dir).filter((f) => /\.txt$/i.test(f)).sort();
  }

  const now = new Date().toISOString();
  const courses: Course[] = [];
  const items: Item[] = [];
  let paletteIdx = 0;

  for (const f of files) {
    const path = join(dir, f);
    const lines = /\.pdf$/i.test(f)
      ? await extractLines(readFileSync(path))
      : readFileSync(path, 'utf8').split('\n');
    const parsed = parseGcuSyllabus(lines, { tz: TZ });
    const defaults = SAMPLE_SETUP[parsed.code] ?? { color: PALETTE[paletteIdx++ % PALETTE.length] };
    const { course, items: courseItems } = toAppData(parsed, { includeZeroPoint: false, tz: TZ, defaults, now });
    courses.push(course);
    items.push(...courseItems);
    const dues = courseItems.map((i) => i.dueAt).sort();
    const hours = courseItems.reduce((a, i) => a + i.estimatedMinutes, 0) / 60;
    console.log(
      `${parsed.code.padEnd(9)} ${String(courseItems.length).padStart(3)} items  ${dues[0]?.slice(0, 10)} → ${dues.at(-1)?.slice(0, 10)}  ~${hours.toFixed(0)}h  ${parsed.warnings.length ? 'WARN: ' + parsed.warnings.join('; ') : ''}`,
    );
  }

  writeFileSync(OUT, JSON.stringify({ generatedAt: now, courses, items }, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${courses.length} courses, ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
