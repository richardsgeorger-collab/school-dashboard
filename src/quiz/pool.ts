import { libraryDb } from '../library/db';
import { recordingsDb } from '../record/db';
import { syllabiDb } from '../syllabus/db';
import type { SourcePool } from './sources';

/** Everything on file for one class, loaded once: decks and their slides, recordings and their transcripts, the syllabus. */
export async function loadPool(courseId: string): Promise<SourcePool> {
  const [decks, pages, recordings, syllabus] = await Promise.all([libraryDb.listDecks(), libraryDb.allPages(), recordingsDb.list(), syllabiDb.get(courseId)]);
  const mine = recordings.filter((r) => r.courseId === courseId);
  const segmentsOf: SourcePool['segmentsOf'] = {};
  for (const r of mine) segmentsOf[r.id] = await recordingsDb.segments(r.id);
  return { decks, pages, recordings: mine, segmentsOf, syllabus };
}

export const EMPTY_POOL: SourcePool = { decks: [], pages: [], recordings: [], segmentsOf: {}, syllabus: null };
