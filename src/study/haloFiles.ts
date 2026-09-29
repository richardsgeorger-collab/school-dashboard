import type { StoredResource } from '../halo/announce';

const STUDY_FILE = /\.(pdf|pptx?|docx?)$/i;
const STUDY_WORDS = /slides?|lecture|notes|review|study guide|practice|powerpoint|chapter|topic/i;

/**
 * The files the professor posted in Halo that could be dropped into Practice: slide decks, notes, study guides.
 * The test's own unit first ("Topic 4"), then study-sounding titles. File names only; Halo+ never downloads them.
 */
export function studyFilesFor(resources: StoredResource[], courseId: string, unitHint = '', max = 4): string[] {
  const hint = (/topic\s*\d+|unit\s*\d+|week\s*\d+|chapter\s*\d+/i.exec(unitHint)?.[0] ?? '').toLowerCase().replace(/\s+/g, ' ');
  const scored: { name: string; score: number }[] = [];
  for (const r of resources.filter((x) => x.courseId === courseId)) {
    for (const f of r.files) {
      if (!STUDY_FILE.test(f.name)) continue;
      const where = `${r.unit ?? ''} ${r.title} ${f.name}`.toLowerCase().replace(/\s+/g, ' ');
      const score = (hint && where.includes(hint) ? 4 : 0) + (STUDY_WORDS.test(`${r.title} ${f.name}`) ? 2 : 0) + (r.instructorAdded ? 1 : 0);
      scored.push({ name: f.name, score });
    }
  }
  return [...new Set(scored.sort((a, b) => b.score - a.score).map((s) => s.name))].slice(0, max);
}
