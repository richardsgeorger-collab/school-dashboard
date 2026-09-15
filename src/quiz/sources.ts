import { dateOf, fmtDate } from '../domain/dates';
import type { Course, DateStr } from '../domain/types';
import type { Deck, DeckPage } from '../library/db';
import { terms } from '../library/search';
import type { Recording, Segment } from '../record/db';
import type { SyllabusDoc } from '../syllabus/db';

/** One piece of the student's own material, labeled so a question can point back at it. */
export interface QuizSource {
  id: string;
  kind: 'slide' | 'recording' | 'syllabus';
  /** What the citation reads as: "Stoichiometry.pptx, slide 4" or "Lecture Sep 10, 12:30". */
  label: string;
  /** Where a tap goes. */
  href: string;
  text: string;
}

export interface SourcePool {
  decks: Deck[];
  pages: DeckPage[];
  recordings: Recording[];
  segmentsOf: Record<string, Segment[]>;
  syllabus: SyllabusDoc | null;
}

const MAX_CHARS = 24_000;
const SLIDE_CHARS = 1200;
const TRANSCRIPT_WINDOW = 900;
const SYLLABUS_CHARS = 2500;

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const overlap = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  let n = 0;
  for (const w of words) if (t.includes(w)) n++;
  return n;
};

/**
 * The material a practice set is built from: the slides, transcript stretches, and syllabus lines that
 * fit the topic, newest first when no topic is given. Everything comes from this browser; nothing else.
 */
export function gatherSources(course: Course, topic: string, pool: SourcePool, tz: string): QuizSource[] {
  const words = terms(topic);
  const out: QuizSource[] = [];
  let chars = 0;
  const push = (s: QuizSource) => {
    if (chars + s.text.length > MAX_CHARS) return false;
    chars += s.text.length;
    out.push(s);
    return true;
  };

  // Slides: score by topic words in the slide, its deck title, or its tag. No topic → newest decks first.
  const decks = pool.decks.filter((d) => d.courseId === course.id).sort((a, b) => b.date.localeCompare(a.date));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const slides = pool.pages
    .filter((p) => deckById.has(p.deckId) && p.text.trim().length >= 40)
    .map((p) => {
      const deck = deckById.get(p.deckId)!;
      const score = words.length ? overlap(p.text, words) * 2 + overlap(`${deck.title} ${deck.tag}`, words) : 0;
      return { p, deck, score };
    })
    .filter((s) => (words.length ? s.score > 0 : true))
    .sort((a, b) => b.score - a.score || b.deck.date.localeCompare(a.deck.date) || a.p.n - b.p.n);
  let n = 0;
  for (const s of slides) {
    if (n >= 14) break;
    const text = s.p.text.length > SLIDE_CHARS ? `${s.p.text.slice(0, SLIDE_CHARS)}…` : s.p.text;
    if (push({ id: `S${out.length + 1}`, kind: 'slide', label: `${s.deck.title}, slide ${s.p.n}`, href: `#/library?v=slides&deck=${s.deck.id}`, text })) n++;
  }

  // Transcripts: a window around each hit, or the opening of the latest recording when there is no topic.
  const recs = pool.recordings.filter((r) => r.courseId === course.id && r.status !== 'recording').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  let hits = 0;
  for (const r of recs) {
    if (hits >= 6) break;
    const segs = pool.segmentsOf[r.id] ?? [];
    if (segs.length === 0) continue;
    const day = fmtDate(dateOf(r.startedAt, tz), 'short');
    if (words.length === 0) {
      const text = segs
        .map((s) => s.text)
        .join(' ')
        .slice(0, TRANSCRIPT_WINDOW * 2);
      if (text.trim().length >= 80 && push({ id: `S${out.length + 1}`, kind: 'recording', label: `${r.title} (${day}), ${mmss(segs[0].at)}`, href: `#/library?c=${course.id}`, text })) hits++;
      if (hits >= 2) break;
      continue;
    }
    for (let i = 0; i < segs.length && hits < 6; i++) {
      if (overlap(segs[i].text, words) === 0) continue;
      let text = '';
      let j = i;
      while (j < segs.length && text.length < TRANSCRIPT_WINDOW) text += `${segs[j++].text} `;
      if (text.trim().length < 80) continue;
      if (push({ id: `S${out.length + 1}`, kind: 'recording', label: `${r.title} (${day}), ${mmss(segs[i].at)}`, href: `#/library?c=${course.id}`, text: text.trim() })) hits++;
      i = j;
    }
  }

  // Syllabus: the paragraphs that mention the topic, or the first stretch when there is none.
  if (pool.syllabus && pool.syllabus.courseId === course.id) {
    const paras = pool.syllabus.text.split(/\n{2,}|\r?\n(?=[A-Z])/).map((p) => p.trim()).filter((p) => p.length >= 40);
    const picked = words.length ? paras.filter((p) => overlap(p, words) > 0) : paras;
    const text = picked.join('\n').slice(0, SYLLABUS_CHARS);
    if (text.length >= 40) push({ id: `S${out.length + 1}`, kind: 'syllabus', label: `${course.code} syllabus`, href: `#/library?c=${course.id}`, text });
  }
  return out;
}

/** The lines that go to the model: one block per source, its id first. */
export function sourcesBlock(sources: QuizSource[]): string {
  return sources.map((s) => `[${s.id}] ${s.kind} · ${s.label}\n${s.text}`).join('\n\n');
}

export const todayFor = (tz: string): DateStr => dateOf(new Date().toISOString(), tz);
