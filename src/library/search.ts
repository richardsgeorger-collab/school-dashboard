import { snippets } from '../record/format';

export type SourceKind = 'slide' | 'transcript' | 'syllabus';

export interface SearchDoc {
  kind: SourceKind;
  courseId: string;
  /** Deck id, recording id, or course id for a syllabus. */
  refId: string;
  title: string;
  /** Slide number for slides. */
  n: number | null;
  date: string | null;
  text: string;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  snippet: string;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'is', 'are', 'was', 'what', 'did', 'we', 'do', 'does', 'how', 'from', 'about', 'with', 'that', 'this', 'it', 'be', 'at', 'by', 'me', 'my', 'i']);
export const terms = (s: string): string[] => [...new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)))];

/** Simple, predictable ranking: every query word found counts, the exact phrase counts more, a title hit counts extra. */
export function scoreDoc(query: string, doc: Pick<SearchDoc, 'title' | 'text'>): { score: number; term: string | null } {
  const q = terms(query);
  if (!q.length) return { score: 0, term: null };
  const text = doc.text.toLowerCase();
  const title = doc.title.toLowerCase();
  let score = 0;
  let first: string | null = null;
  for (const w of q) {
    const inText = text.includes(w);
    const inTitle = title.includes(w);
    if (inText || inTitle) {
      score += 2;
      if (inTitle) score += 2;
      if (!first) first = w;
    }
  }
  if (q.length > 1 && text.includes(query.toLowerCase().trim())) score += 3;
  return { score, term: first };
}

export function searchDocs(query: string, docs: SearchDoc[], limit = 25): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const { score, term } = scoreDoc(query, doc);
    if (score <= 0) continue;
    const snip = term ? snippets(doc.text, term, 70, 1)[0] : undefined;
    hits.push({ doc, score, snippet: snip ?? doc.text.slice(0, 140) });
  }
  return hits.sort((a, b) => b.score - a.score || (b.doc.date ?? '').localeCompare(a.doc.date ?? '')).slice(0, limit);
}
