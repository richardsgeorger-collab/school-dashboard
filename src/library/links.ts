import { dateOf } from '../domain/dates';
import type { Item } from '../domain/types';
import type { Recording } from '../record/db';
import type { Deck } from './db';

/** Recordings of the same class on the deck's date, newest first. */
export function sameDayRecordings(deck: Pick<Deck, 'courseId' | 'date'>, recordings: Recording[], tz: string): Recording[] {
  return recordings.filter((r) => r.courseId === deck.courseId && dateOf(r.startedAt, tz) === deck.date).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const GENERIC = new Set(['lecture', 'slides', 'slide', 'chapter', 'topic', 'week', 'intro', 'introduction', 'review', 'notes', 'class', 'general', 'part', 'section', 'unit', 'module', 'overview', 'lesson']);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Decks that clearly cover an item: same class, and either the deck's tag equals the item's topic,
 * the item title carries the tag ("Topic 3" in "Topic 3 Quiz"), or a distinctive deck title word
 * (six letters or more, not a filler word) appears in the item title. Anything less is not shown.
 */
export function decksForItem(item: Item, decks: Deck[]): Deck[] {
  const title = ` ${norm(item.title)} `;
  const topic = item.topic ? norm(item.topic) : '';
  return decks.filter((d) => {
    if (d.courseId !== item.courseId) return false;
    const tag = norm(d.tag);
    if (tag && (tag === topic || title.includes(` ${tag} `))) return true;
    const words = norm(d.title)
      .split(' ')
      .filter((w) => w.length >= 6 && !GENERIC.has(w));
    return words.some((w) => title.includes(` ${w} `));
  });
}
