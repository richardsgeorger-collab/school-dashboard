import type { Course } from '../domain/types';
import type { Deck } from '../library/db';
import type { Recording } from '../record/db';

/**
 * One line on what Practice has to build from, before the student picks a test: which classes have slides or
 * lectures on file and which have nothing yet. Practice for a class with nothing on file can only plan.
 */
export function materialLine(courses: Course[], decks: Pick<Deck, 'courseId'>[], recordings: Pick<Recording, 'courseId'>[]): { text: string; empty: Course[] } {
  const have: string[] = [];
  const empty: Course[] = [];
  for (const c of courses) {
    const d = decks.filter((x) => x.courseId === c.id).length;
    const r = recordings.filter((x) => x.courseId === c.id).length;
    if (d + r === 0) empty.push(c);
    else have.push(`${c.code} (${[d ? `${d} deck${d === 1 ? '' : 's'}` : '', r ? `${r} lecture${r === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')})`);
  }
  if (courses.length === 0) return { text: '', empty };
  if (have.length === 0) return { text: 'Nothing on file yet: drop a class’s slides or a lecture into its library and Practice builds from them.', empty };
  const rest = empty.length ? ` Nothing yet for ${empty.map((c) => c.code).join(', ')}.` : '';
  return { text: `On file: ${have.join(' · ')}.${rest}`, empty };
}
