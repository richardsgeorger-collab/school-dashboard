import { dateOf, diffDays, fmtDate } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import { splitSyllabus } from '../../syllabus/context';

/**
 * Which pieces of the student's own material belong in a prompt, chosen by what the assignment is about. The app has
 * the text of every announcement, transcript, slide and syllabus; a prompt that lists their names and asks the
 * student to read them out is a prompt that has thrown the material away.
 */

export interface Excerpt {
  kind: 'announcement' | 'transcript' | 'slides' | 'syllabus';
  /** "Quiz 1 details", "Lecture, Sep 16", "Topic 2 slides, slide 7". */
  label: string;
  /** Local date it was posted or recorded, when it has one. */
  date: string | null;
  text: string;
}

export interface Material {
  announcements: Excerpt[];
  transcripts: Excerpt[];
  slides: Excerpt[];
  syllabus: Excerpt[];
}

export const emptyMaterial = (): Material => ({ announcements: [], transcripts: [], slides: [], syllabus: [] });

const GENERIC = new Set(['quiz', 'topic', 'homework', 'assignment', 'week', 'participation', 'activity', 'the', 'and', 'for', 'with', 'your', 'first', 'draft', 'final', 'part', 'complete', 'submit', 'practice', 'unit', 'lab', 'discussion', 'question']);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));

/** Words that say what this assignment is about, beyond its type. */
export function termsFor(item: Pick<Item, 'title' | 'topic' | 'notes'>, extra = ''): string[] {
  const topic = (item.topic ?? '').replace(/^topic\s*\d+\s*[:\-]\s*/i, '');
  return [...new Set([...words(item.title), ...words(topic), ...words(extra)])];
}

/** Long words are matched on their first six letters, so "electronic" finds "electrons" and "chapters" finds "chapter". */
const stem = (w: string) => (w.includes(' ') || w.length < 7 ? w : w.slice(0, 6));
const hits = (text: string, terms: string[]) => {
  const t = text.toLowerCase();
  return terms.reduce((n, w) => n + (t.includes(stem(w)) ? 1 : 0), 0);
};

/** "Chapters 1 and 2" as the phrases a lecture would use: "chapter 1", "chapter 2". */
export function chapterPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(chapters?|ch\.?|sections?|modules?)\s+([\d.,\sand&-]+)/gi)) {
    const noun = m[1].toLowerCase().startsWith('ch') ? 'chapter' : m[1].toLowerCase().replace(/s$/, '');
    for (const n of m[2].match(/\d+(?:\.\d+)?/g) ?? []) out.push(`${noun} ${n}`);
  }
  return [...new Set(out)];
}

/**
 * The ways a professor refers to one assessment: "Quiz #1", "Quiz 1", "quiz one", "first quiz". An announcement that
 * names it is the strongest signal there is.
 */
export function namesFor(title: string): RegExp[] {
  const m = /\b(quiz|exam|test|dq|lab|paper|draft|essay|homework|project)\s*#?\s*(\d+(?:\.\d+)?)/i.exec(title);
  const out: RegExp[] = [new RegExp(title.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i')];
  if (m) {
    const kind = m[1];
    const n = m[2];
    const spelled = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][Number(n)] ?? '';
    const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth'][Number(n)] ?? '';
    out.push(new RegExp(`\\b${kind}\\s*#?\\s*${n.replace('.', '\\.')}\\b`, 'i'));
    if (spelled) out.push(new RegExp(`\\b${kind}\\s+${spelled}\\b`, 'i'));
    if (ordinal) out.push(new RegExp(`\\b${ordinal}\\s+${kind}\\b`, 'i'));
  }
  return out;
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`);

export interface Post {
  id: string;
  courseId: string;
  title: string;
  text: string;
  publishedAt: string | null;
}

/** Announcements about this assignment, the one that names it first. */
export function pickAnnouncements(item: Item, posts: Post[], tz: string, max = 3): Excerpt[] {
  const due = dateOf(item.dueAt, tz);
  const names = namesFor(item.title);
  const terms = termsFor(item);
  const scored = posts
    .filter((p) => p.courseId === item.courseId)
    .map((p) => {
      const body = `${p.title}\n${p.text}`;
      const named = names.some((re) => re.test(body));
      const posted = p.publishedAt ? dateOf(p.publishedAt, tz) : null;
      // Posted in the four weeks before it was due, and not after: that is when a professor talks about it.
      const timely = posted !== null && posted <= due && diffDays(posted, due) <= 28;
      const score = (named ? 10 : 0) + hits(body, terms) + (timely ? 1 : 0);
      return { p, score, named, posted };
    })
    .filter((x) => x.named || x.score >= 3)
    .sort((a, b) => b.score - a.score || String(b.p.publishedAt).localeCompare(String(a.p.publishedAt)))
    .slice(0, max);
  return scored.map(({ p, posted }) => ({ kind: 'announcement', label: p.title || 'Announcement', date: posted ? fmtDate(posted, 'short') : null, text: clip(p.text.trim(), 1600) }));
}

/** Plain facts about the sitting itself, straight from what the professor posted. */
export interface QuizFacts {
  questions: string | null;
  minutes: string | null;
  provided: string[];
  bring: string[];
  /** The sentences that say what it covers, verbatim. */
  scope: string[];
}

const sentences = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function quizFacts(texts: string[]): QuizFacts {
  const all = texts.join(' ');
  const q = /\b(\d{1,3})\s+(?:multiple[- ]choice\s+|short[- ]answer\s+|free[- ]response\s+)?(?:questions|problems|items)\b/i.exec(all);
  const m = /\b(\d{1,3})\s*[- ]?(?:minutes?|mins?)\b/i.exec(all) ?? /\b(\d(?:\.\d)?)\s*[- ]?hours?\b/i.exec(all);
  const ss = texts.flatMap(sentences);
  const provided = ss.filter((s) => /\b(provided|will be given|is allowed|are allowed|may use|you may bring)\b/i.test(s));
  const bring = ss.filter((s) => /\bbring\b/i.test(s));
  const scope = ss.filter((s) => /\b(chapters?|ch\.|sections?|modules?|material from|units?|topics?\s+\d)\b/i.test(s) && /\b(quiz|exam|test|covers?|covering|includes?|including|on)\b/i.test(s));
  return {
    questions: q ? q[0] : null,
    minutes: m ? m[0] : null,
    provided: [...new Set(provided)].slice(0, 3),
    bring: [...new Set(bring)].slice(0, 3),
    scope: [...new Set(scope)].slice(0, 3),
  };
}

export interface Lecture {
  courseId: string;
  title: string;
  startedAt: string;
  segments: { at: number; text: string }[];
}

const stamp = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Stretches of the student's own lectures about this, with the date and the minute mark, from lectures given before
 * it is due. A window around the best matches rather than whole transcripts, so a prompt stays pasteable.
 */
export function transcriptWindows(item: Item, lectures: Lecture[], terms: string[], tz: string, max = 4): Excerpt[] {
  const due = dateOf(item.dueAt, tz);
  const found: { score: number; ex: Excerpt }[] = [];
  for (const l of lectures) {
    if (l.courseId !== item.courseId || dateOf(l.startedAt, tz) > due || l.segments.length === 0) continue;
    const scored = l.segments.map((s, i) => ({ i, score: hits(s.text, terms) })).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    const used = new Set<number>();
    for (const { i, score } of scored.slice(0, 2)) {
      if (used.has(i)) continue;
      const from = Math.max(0, i - 1 >= 0 && hits(l.segments[i - 1].text, terms) > 0 ? i - 1 : i);
      const to = Math.min(l.segments.length, i + 4);
      for (let k = from; k < to; k++) used.add(k);
      const text = l.segments.slice(from, to).map((s) => s.text.trim()).join(' ');
      found.push({ score, ex: { kind: 'transcript', label: `${l.title}, at ${stamp(l.segments[from].at)}`, date: fmtDate(dateOf(l.startedAt, tz), 'short'), text: clip(text, 900) } });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, max).map((f) => f.ex);
}

export interface SlidePage {
  deckTitle: string;
  deckTag: string | null;
  courseId: string;
  n: number;
  text: string;
}

/** Slides that cover it, favouring the deck filed under its topic. */
export function slideExcerpts(item: Item, pages: SlidePage[], terms: string[], max = 5): Excerpt[] {
  const topicNo = /topic\s*(\d+)/i.exec(item.topic ?? '')?.[1] ?? null;
  return pages
    .filter((p) => p.courseId === item.courseId && p.text.trim().length > 40)
    .map((p) => {
      const onTopic = topicNo !== null && new RegExp(`\\b(topic|week|ch(?:apter)?)\\s*${topicNo}\\b`, 'i').test(`${p.deckTag ?? ''} ${p.deckTitle}`);
      return { p, score: hits(p.text, terms) + (onTopic ? 2 : 0) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ p }) => ({ kind: 'slides', label: `${p.deckTitle}, slide ${p.n}`, date: null, text: clip(p.text.replace(/\s+/g, ' ').trim(), 500) }));
}

/** The syllabus section for this assignment's topic, or the paragraph that names it. */
export function syllabusExcerpt(item: Item, text: string | null, course: Pick<Course, 'code'>): Excerpt[] {
  if (!text?.trim()) return [];
  const topicNo = /topic\s*(\d+)/i.exec(item.topic ?? '')?.[1] ?? null;
  const { topics } = splitSyllabus(text);
  const names = namesFor(item.title);
  // The paragraph that names the assignment beats the whole topic, which can run to pages.
  const para = text.split(/\n\s*\n/).find((p) => names.some((re) => re.test(p)));
  if (para) return [{ kind: 'syllabus', label: `${course.code} syllabus`, date: null, text: clip(para.trim(), 2400) }];
  const piece = topics.find((t) => topicNo !== null && new RegExp(`^Topic ${topicNo}\\b`).test(t.heading));
  return piece ? [{ kind: 'syllabus', label: `${course.code} syllabus, ${piece.heading}`, date: null, text: clip(piece.text.trim(), 2400) }] : [];
}
