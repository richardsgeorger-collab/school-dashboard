/**
 * Generate src/data/seed.json from syllabi/*.pdf (or *.txt line dumps).
 * Falls back to the parser fixtures when syllabi/ is empty so the app always has data.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COURSE_DEFAULTS, PALETTE } from '../src/data/courseDefaults';
import { parseGcuSyllabus } from '../src/parser/gcuSyllabus';
import { extractLines } from '../src/parser/pdfText';
import { toAppData } from '../src/parser/toAppData';
import type { Course, Item } from '../src/domain/types';

const TZ = 'America/Phoenix';
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
    const defaults = COURSE_DEFAULTS[parsed.code] ?? { color: PALETTE[paletteIdx++ % PALETTE.length] };
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
