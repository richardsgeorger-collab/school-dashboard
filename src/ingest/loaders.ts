import { libraryDb } from '../library/db';
import { recordingsDb } from '../record/db';
import { syllabiDb } from '../syllabus/db';
import { aiDb } from './db';
import type { ContextLoaders } from './context';
import type { Cache } from './run';

/** What the browser supplies to the passes: the library, the recordings, the syllabi, and the AI cache. */
export const browserLoaders: ContextLoaders = {
  decks: () => libraryDb.listDecks(),
  pages: (deckId) => libraryDb.pages(deckId),
  recordings: () => recordingsDb.list(),
  syllabus: (courseId) => syllabiDb.get(courseId),
};

export const browserCache: Cache = {
  get: (key) => aiDb.get(key),
  put: (key, value) => aiDb.put(key, value),
};
