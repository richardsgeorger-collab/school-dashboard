import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem } from '../halo/fixtures';
import type { Deck, DeckPage } from './db';
import { decksForItem, sameDayRecordings } from './links';
import { materialsContext, pickSlides } from './retrieve';
import { searchDocs, type SearchDoc } from './search';

const chm = mkCourse({ id: 'chm', code: 'CHM-113' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162' });
const deck = (o: Partial<Deck> & { id: string; title: string }): Deck => ({ courseId: 'chm', tag: '', date: '2026-09-15', fileName: 'x.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: 1, pages: 2, chars: 100, addedAt: 'x', recordingId: null, fileDeleted: false, ...o });
const decks = [deck({ id: 'd1', title: 'Stoichiometry', tag: 'Topic 3', date: '2026-09-15' }), deck({ id: 'd2', title: 'Gas Laws', tag: 'Topic 5', date: '2026-09-22' }), deck({ id: 'd3', title: 'Vectors', courseId: 'esg', date: '2026-09-15' })];
const pages: DeckPage[] = [
  { deckId: 'd1', n: 1, text: 'Stoichiometry: mole ratios from balanced equations' },
  { deckId: 'd1', n: 12, text: 'Limiting reagent example: 2 H2 + O2 → 2 H2O' },
  { deckId: 'd2', n: 1, text: 'Boyle and Charles laws' },
  { deckId: 'd3', n: 12, text: 'Vector addition, tip to tail' },
];

describe('search across sources', () => {
  const docs: SearchDoc[] = [
    ...pages.map((p) => ({ kind: 'slide' as const, courseId: decks.find((d) => d.id === p.deckId)!.courseId, refId: p.deckId, title: decks.find((d) => d.id === p.deckId)!.title, n: p.n, date: '2026-09-15', text: p.text })),
    { kind: 'transcript', courseId: 'chm', refId: 'r1', title: 'CHM-113 — Sep 15', n: null, date: '2026-09-15', text: 'today we cover stoichiometry and the limiting reagent' },
    { kind: 'syllabus', courseId: 'chm', refId: 'chm', title: 'Syllabus', n: null, date: null, text: 'Late work: 10% per day.' },
  ];
  it('ranks phrase and title hits first and gives a snippet with its source', () => {
    const hits = searchDocs('limiting reagent', docs);
    expect(hits.map((h) => `${h.doc.kind}:${h.doc.refId}:${h.doc.n ?? ''}`)).toEqual(['slide:d1:12', 'transcript:r1:']);
    expect(hits[0].snippet).toMatch(/Limiting reagent/);
    expect(searchDocs('late policy', docs)[0]?.doc.kind).toBe('syllabus');
    expect(searchDocs('', docs)).toEqual([]);
  });
});

describe('slides for the coach', () => {
  it('picks by words, honors a named class, a date, and "slide N"', () => {
    // A word in the deck title brings the whole deck along, best-matching slides first.
    expect(pickSlides('what did we cover on stoichiometry', decks, pages, [chm, esg], '2026-09-18').map((s) => `${s.deck.id}:${s.n}`)).toEqual(['d1:1', 'd1:12']);
    expect(pickSlides('explain slide 12 from tuesday chem', decks, pages, [chm, esg], '2026-09-18').map((s) => `${s.deck.id}:${s.n}`)).toEqual(['d1:12']);
    expect(pickSlides('explain slide 12', decks, pages, [chm, esg], '2026-09-18').map((s) => `${s.deck.id}:${s.n}`).sort()).toEqual(['d1:12', 'd3:12']);
    expect(pickSlides('anything about dinosaurs', decks, pages, [chm, esg], '2026-09-18')).toEqual([]);
  });
  it('writes a materials block with an index and citations', () => {
    const ctx = materialsContext('mole ratios', decks, pages, [chm, esg], '2026-09-18');
    expect(ctx).toContain('Decks on file:\nCHM-113 · "Gas Laws" · Sep 22 · Topic 5 · 2 slides');
    expect(ctx).toContain('[CHM-113 · Stoichiometry · slide 1]\nStoichiometry: mole ratios');
    expect(materialsContext('x', [], [], [chm], '2026-09-18')).toBe('');
    expect(materialsContext('dinosaurs', decks, pages, [chm], '2026-09-18')).toMatch(/No slide matched/);
  });
});

describe('linking decks to things', () => {
  it('finds a same-day recording of the same class', () => {
    const rec = (id: string, courseId: string, startedAt: string) => ({ id, courseId, title: id, startedAt, endedAt: null, status: 'done' as const, durationMs: 0, bytes: 0, mimeType: '', chunkCount: 0, segmentCount: 0, audioDeleted: false, notes: null, processedAt: null, review: {} });
    const recs = [rec('a', 'chm', '2026-09-15T14:00:00Z'), rec('b', 'chm', '2026-09-16T14:00:00Z'), rec('c', 'esg', '2026-09-15T15:00:00Z')];
    expect(sameDayRecordings(decks[0], recs, 'America/Phoenix').map((r) => r.id)).toEqual(['a']);
  });
  it('links a deck to an item only when the tag or a distinctive title word makes it obvious', () => {
    expect(decksForItem(mkItem({ id: 'i', courseId: 'chm', title: 'Topic 3 Quiz' }), decks).map((d) => d.id)).toEqual(['d1']);
    expect(decksForItem(mkItem({ id: 'i', courseId: 'chm', title: 'Homework 4', topic: 'Topic 5' }), decks).map((d) => d.id)).toEqual(['d2']);
    expect(decksForItem(mkItem({ id: 'i', courseId: 'chm', title: 'Stoichiometry Worksheet' }), decks).map((d) => d.id)).toEqual(['d1']);
    expect(decksForItem(mkItem({ id: 'i', courseId: 'chm', title: 'Exam 1' }), decks)).toEqual([]);
    expect(decksForItem(mkItem({ id: 'i', courseId: 'esg', title: 'Topic 3 Quiz' }), decks)).toEqual([]);
  });
});
