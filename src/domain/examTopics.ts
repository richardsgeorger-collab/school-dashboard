import type { Deck, DeckPage } from '../library/db';
import type { QuizStat } from './types';
import { weakTopics } from '../quiz/stats';

export interface TopicBlock {
  topic: string;
  deck: Deck | null;
  from: number;
  to: number;
  /** Missed in practice or lost points on: study first. */
  weak: boolean;
}

export interface SessionTopic {
  /** "Stoichiometry, slides 12–28 plus practice" */
  text: string;
  topic: string;
  weak: boolean;
}

const chunk = 16;

/** The class's material cut into study-sized blocks: each deck by runs of slides, weak topics first. */
export function topicBlocks(courseId: string, decks: Deck[], pages: DeckPage[], stats: Record<string, QuizStat> | undefined, weakTitles: string[] = []): TopicBlock[] {
  const mine = decks.filter((d) => d.courseId === courseId).sort((a, b) => a.date.localeCompare(b.date));
  const weak = new Set([...weakTopics(stats, courseId, 6).map((w) => w.topic), ...weakTitles.map((t) => t.toLowerCase())]);
  const isWeak = (name: string) => [...weak].some((w) => w && (name.toLowerCase().includes(w) || w.includes(name.toLowerCase())));
  const out: TopicBlock[] = [];
  for (const d of mine) {
    const n = pages.filter((p) => p.deckId === d.id).length || d.pages;
    const name = d.tag || d.title;
    if (n <= chunk) out.push({ topic: name, deck: d, from: 1, to: n, weak: isWeak(name) });
    else for (let s = 1; s <= n; s += chunk) out.push({ topic: name, deck: d, from: s, to: Math.min(n, s + chunk - 1), weak: isWeak(name) });
  }
  for (const w of weak) if (!out.some((b) => b.topic.toLowerCase().includes(w))) out.push({ topic: w, deck: null, from: 0, to: 0, weak: true });
  return [...out.filter((b) => b.weak), ...out.filter((b) => !b.weak)];
}

/** One line per study session: a topic and the slides to open, weak ground first, practice on every one. */
export function sessionTopics(count: number, blocks: TopicBlock[]): SessionTopic[] {
  if (blocks.length === 0) return Array.from({ length: count }, () => ({ text: 'Review notes and practice', topic: '', weak: false }));
  const out: SessionTopic[] = [];
  for (let i = 0; i < count; i++) {
    const b = blocks[i % blocks.length];
    const slides = b.deck ? (b.from === 1 && b.to >= (b.deck.pages || b.to) ? `${b.deck.title}` : `${b.deck.title}, slides ${b.from}–${b.to}`) : 'where you lost points';
    out.push({ text: `${b.topic}: ${slides}, plus practice`, topic: b.topic, weak: b.weak });
  }
  return out;
}
