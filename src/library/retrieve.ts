import { guessCourse, parseDate } from '../capture/parse';
import { addDays, fmtDate, weekdayOf } from '../domain/dates';
import type { Course, DateStr } from '../domain/types';
import type { Deck, DeckPage } from './db';
import { terms } from './search';

export interface SlideRef {
  deck: Deck;
  n: number;
  text: string;
  score: number;
}

/** One line per deck so the coach knows what exists even when no slide matched. */
export function deckIndex(decks: Deck[], courses: Course[]): string {
  const code = new Map(courses.map((c) => [c.id, c.code]));
  return [...decks]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => `${code.get(d.courseId) ?? '?'} · "${d.title}" · ${fmtDate(d.date, 'short')}${d.tag ? ` · ${d.tag}` : ''} · ${d.pages} slide${d.pages === 1 ? '' : 's'}`)
    .join('\n');
}

const SLIDE_CHARS = 1500;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A lecture "from Tuesday" is the most recent Tuesday, today included. */
export function lastWeekday(question: string, today: DateStr): DateStr | null {
  const m = /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/i.exec(question);
  if (!m) return null;
  const idx = DAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3).toLowerCase()));
  return addDays(today, -((weekdayOf(today) - idx + 7) % 7));
}

/** The slides most likely to answer a question: word overlap, plus the class, date, and "slide N" the question names. */
export function pickSlides(question: string, decks: Deck[], pages: DeckPage[], courses: Course[], today: DateStr, opts: { max?: number; maxChars?: number } = {}): SlideRef[] {
  const max = opts.max ?? 8;
  const maxChars = opts.maxChars ?? 12_000;
  const q = terms(question);
  const byId = new Map(decks.map((d) => [d.id, d]));
  const course = guessCourse(question, courses);
  const date = lastWeekday(question, today) ?? parseDate(question, today).date;
  const slideNo = /\bslide\s+(\d{1,3})\b/i.exec(question);
  const ql = question.toLowerCase();
  const out: SlideRef[] = [];
  for (const p of pages) {
    const deck = byId.get(p.deckId);
    if (!deck) continue;
    if (course && deck.courseId !== course.id) continue;
    let score = 0;
    const text = p.text.toLowerCase();
    for (const w of q) if (text.includes(w)) score += 2;
    const title = deck.title.toLowerCase();
    for (const w of q) if (title.includes(w) || (deck.tag && deck.tag.toLowerCase().includes(w))) score += 1;
    if (slideNo && p.n === Number(slideNo[1])) score += 6;
    if (date && deck.date === date) score += 3;
    if (ql.includes(title) && title.length > 3) score += 3;
    if (score > 0) out.push({ deck, n: p.n, text: p.text, score });
  }
  // A named slide number is a request for that slide, not its neighbors.
  const only = slideNo && out.some((s) => s.n === Number(slideNo[1])) ? out.filter((s) => s.n === Number(slideNo[1])) : out;
  only.sort((a, b) => b.score - a.score || b.deck.date.localeCompare(a.deck.date) || a.n - b.n);
  const picked: SlideRef[] = [];
  let chars = 0;
  for (const s of only) {
    if (picked.length >= max) break;
    const text = s.text.length > SLIDE_CHARS ? `${s.text.slice(0, SLIDE_CHARS)}…` : s.text;
    if (chars + text.length > maxChars) continue;
    chars += text.length;
    picked.push({ ...s, text });
  }
  return picked;
}

/** The Materials block the coach reads: what is on file, then the slides picked for this question with citations. */
export function materialsContext(question: string, decks: Deck[], pages: DeckPage[], courses: Course[], today: DateStr): string {
  if (decks.length === 0) return '';
  const code = new Map(courses.map((c) => [c.id, c.code]));
  const picked = pickSlides(question, decks, pages, courses, today);
  const head = `Decks on file:\n${deckIndex(decks, courses)}`;
  if (picked.length === 0) return `${head}\n\nNo slide matched this question by its words.`;
  const body = picked.map((s) => `[${code.get(s.deck.courseId) ?? '?'} · ${s.deck.title} · slide ${s.n}]\n${s.text}`).join('\n\n');
  return `${head}\n\nSlides picked for this question (cite as deck title and slide number):\n${body}`;
}
