import type { QuizQuestion } from './generate';

export type Verdict = 'right' | 'wrong' | 'unsure';

const num = (s: string): number | null => {
  const m = /-?\d[\d,]*(?:\.\d+)?(?:\s*[×x]\s*10\s*\^?\s*(-?\d+))?(?:e(-?\d+))?/i.exec(s.replace(/\s+/g, ' '));
  if (!m) return null;
  const base = Number(m[0].replace(/,/g, '').split(/[×xe]/i)[0]);
  const exp = m[1] ?? m[2];
  const v = exp ? base * 10 ** Number(exp) : base;
  return Number.isFinite(v) ? v : null;
};

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'its', 'has', 'have', 'from', 'into', 'than', 'then']);

/**
 * Right, wrong, or unsure. Numbers compare within 2 percent (or 1 in the last given digit);
 * multiple choice compares the index; words compare by overlap. Unsure hands the call to the student.
 */
export function checkAnswer(q: QuizQuestion, given: string): Verdict {
  const g = given.trim();
  if (!g) return 'wrong';
  if (q.kind === 'multiple_choice') return g === q.answer ? 'right' : 'wrong';
  const want = num(q.answer);
  const got = num(g);
  if (want != null) {
    if (got == null) return 'wrong';
    if (want === 0) return Math.abs(got) < 1e-9 ? 'right' : 'wrong';
    const rel = Math.abs(got - want) / Math.abs(want);
    return rel <= 0.02 ? 'right' : rel <= 0.1 ? 'unsure' : 'wrong';
  }
  const a = new Set(words(q.answer));
  if (a.size === 0) return 'unsure';
  const b = new Set(words(g));
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  const share = hit / a.size;
  if (share >= 0.6) return 'right';
  if (share > 0 || b.size === 0) return 'unsure';
  return 'wrong';
}
