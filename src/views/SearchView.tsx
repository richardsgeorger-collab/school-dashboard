import { useCallback, useEffect, useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { fmtDate } from '../domain/dates';
import { libraryDb, type Deck } from '../library/db';
import { searchDocs, type SearchDoc } from '../library/search';
import { recordingsDb } from '../record/db';
import { syllabiDb } from '../syllabus/db';
import { useStore } from '../storage/store';

const KIND = { slide: 'Slides', transcript: 'Recording', syllabus: 'Syllabus' } as const;

/** One box across slides, transcripts, and the syllabus for a class. */
export function SearchView() {
  const { data, courseById } = useStore();
  const [docs, setDocs] = useState<SearchDoc[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [dks, pages, recs, syl] = await Promise.all([libraryDb.listDecks(), libraryDb.allPages(), recordingsDb.list(), syllabiDb.list()]);
    const byDeck = new Map(dks.map((d) => [d.id, d]));
    const out: SearchDoc[] = [];
    for (const p of pages) {
      const d = byDeck.get(p.deckId);
      if (d && p.text.trim()) out.push({ kind: 'slide', courseId: d.courseId, refId: d.id, title: d.title, n: p.n, date: d.date, text: p.text });
    }
    for (const r of recs) {
      const segs = await recordingsDb.segments(r.id);
      const text = segs.map((s) => s.text).join(' ');
      if (text.trim()) out.push({ kind: 'transcript', courseId: r.courseId, refId: r.id, title: r.title, n: null, date: r.startedAt.slice(0, 10), text });
    }
    for (const s of syl) out.push({ kind: 'syllabus', courseId: s.courseId, refId: s.courseId, title: 'Syllabus', n: null, date: null, text: s.text });
    setDocs(out);
    setDecks(dks);
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const hits = useMemo(() => searchDocs(query, courseId ? docs.filter((d) => d.courseId === courseId) : docs), [query, docs, courseId]);
  const counts = useMemo(() => ({ slide: docs.filter((d) => d.kind === 'slide').length, transcript: docs.filter((d) => d.kind === 'transcript').length, syllabus: docs.filter((d) => d.kind === 'syllabus').length }), [docs]);

  return (
    <section className="card rec-panel search-panel">
      <div className="search-row">
        <input className="rec-search search-main" type="search" autoFocus placeholder="Search slides, transcripts, syllabi" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search everything" />
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Class">
          <option value="">All classes</option>
          {data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
      <p className="hint mono">
        {loaded ? `${counts.slide} slides · ${counts.transcript} transcripts · ${counts.syllabus} syllabi on file` : 'Loading…'}
        {query.trim() && ` · ${hits.length} hit${hits.length === 1 ? '' : 's'}`}
      </p>
      {query.trim() && hits.length === 0 && loaded && <p className="hint">Nothing matched. Try one word at a time.</p>}
      <ul className="search-hits">
        {hits.map((h, i) => (
          <li key={i} className="search-hit">
            <div className="search-hit-head">
              <span className={`rev-badge src-${h.doc.kind}`}>{KIND[h.doc.kind]}</span>
              <CourseChip course={courseById.get(h.doc.courseId)} />
              <span className="search-hit-title">
                {h.doc.title}
                {h.doc.n != null && ` · ${decks.find((d) => d.id === h.doc.refId)?.kind === 'pptx' ? 'slide' : 'page'} ${h.doc.n}`}
              </span>
              {h.doc.date && <span className="mono muted">{fmtDate(h.doc.date, 'short')}</span>}
              {h.doc.kind === 'slide' && (
                <a className="diff-toggle" href={`#/library?v=slides&deck=${h.doc.refId}`}>
                  open deck
                </a>
              )}
            </div>
            <p className="search-snippet">{h.snippet}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
