import { useCallback, useEffect, useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { InlineTitle } from '../components/InlineTitle';
import { MoveSelect } from '../components/MoveSelect';
import { LIBRARY_EVENT, moveMaterial, renameMaterial } from '../library/ingest';
import { dateOf, fmtDate } from '../domain/dates';
import { newId } from '../domain/ids';
import { libraryDb, type Deck, type DeckPage } from '../library/db';
import { extractDeck, isDeckFile, titleFromFileName } from '../library/extract';
import { sameDayRecordings } from '../library/links';
import { recordingsDb, type Recording } from '../record/db';
import { fmtBytes, wordCount } from '../record/format';
import { useRoute } from '../router';
import { useStore } from '../storage/store';

/** Lecture slides per class: drop a PDF or PPTX, keep the text for search and the coach, link it to the day's recording. */
export function SlidesView({ courseId: onlyCourse, collapseOver }: { courseId?: string; collapseOver?: number } = {}) {
  const { data, courseById, today } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const [decks, setDecks] = useState<Deck[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [courseId, setCourseId] = useState((onlyCourse && onlyCourse !== 'none' ? onlyCourse : null) ?? data.courses[0]?.id ?? '');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [date, setDate] = useState(today);
  const [linkId, setLinkId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openText, setOpenText] = useState<{ id: string; pages: DeckPage[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const highlight = params.get('deck');

  const refresh = useCallback(async () => {
    try {
      setDecks(await libraryDb.listDecks());
      setRecordings(await recordingsDb.list());
      setQuota(await recordingsDb.estimate());
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(LIBRARY_EVENT, onChange);
    return () => window.removeEventListener(LIBRARY_EVENT, onChange);
  }, [refresh]);
  useEffect(() => {
    if (highlight) document.getElementById(`deck-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight, decks]);

  const suggestions = useMemo(() => (pending ? sameDayRecordings({ courseId, date }, recordings, tz) : []), [pending, courseId, date, recordings, tz]);
  useEffect(() => {
    setLinkId(suggestions[0]?.id ?? '');
  }, [suggestions]);

  const choose = (f: File) => {
    if (!isDeckFile(f.name, f.type)) {
      setNote('Drop a .pdf or .pptx. For anything else, export it as PDF first.');
      return;
    }
    setNote(null);
    setPending(f);
    setTitle(titleFromFileName(f.name));
    setTag('');
    setDate(dateOf(new Date(f.lastModified || Date.now()).toISOString(), tz));
  };

  const save = async () => {
    if (!pending || !courseId) return;
    setBusy('new');
    setNote(null);
    try {
      const r = await extractDeck(pending);
      const chars = r.pages.reduce((n, p) => n + p.length, 0);
      if (chars < 40) throw new Error(`No readable text came out of ${pending.name}. ${r.kind === 'pptx' ? 'Export it as PDF from PowerPoint and drop that.' : 'A scanned PDF has no text layer.'}`);
      const id = newId();
      const deck: Deck = {
        id,
        courseId,
        title: title.trim() || titleFromFileName(pending.name),
        tag: tag.trim(),
        date,
        fileName: pending.name,
        kind: r.kind,
        mimeType: pending.type || (r.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
        bytes: pending.size,
        pages: r.pages.length,
        chars,
        addedAt: new Date().toISOString(),
        recordingId: linkId || null,
        fileDeleted: false,
      };
      await libraryDb.putFile(id, pending);
      await libraryDb.putPages(id, r.pages);
      await libraryDb.putDeck(deck);
      setPending(null);
      await refresh();
      setNote(`${deck.title}: ${r.pages.length} ${r.kind === 'pptx' ? 'slides' : 'pages'}, ${wordCount(r.pages.join(' ')).toLocaleString()} words kept for search and the coach.${r.warnings.length ? ` ${r.warnings.join(' ')}` : ''}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const openFile = async (d: Deck) => {
    const blob = await libraryDb.getFile(d.id);
    if (!blob) return setNote('The file was deleted; only its text is kept.');
    const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: d.mimeType }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const showText = async (d: Deck) => {
    if (openText?.id === d.id) return setOpenText(null);
    setOpenText({ id: d.id, pages: await libraryDb.pages(d.id) });
  };
  const relink = async (d: Deck, recordingId: string) => {
    await libraryDb.putDeck({ ...d, recordingId: recordingId || null });
    await refresh();
  };
  const retag = async (d: Deck, patch: Partial<Deck>) => {
    await libraryDb.putDeck({ ...d, ...patch });
    await refresh();
  };

  const scoped = onlyCourse === 'none' ? decks.filter((d) => !courseById.has(d.courseId)) : onlyCourse ? decks.filter((d) => d.courseId === onlyCourse) : decks;
  const byCourse = new Map<string, Deck[]>();
  for (const d of scoped) byCourse.set(d.courseId, [...(byCourse.get(d.courseId) ?? []), d]);
  const free = quota ? Math.max(0, quota.quota - quota.usage) : null;

  return (
    <div className="rec-grid" data-single={!!onlyCourse}>
      {!onlyCourse && (
      <section className="card rec-panel">
        <h2 className="section-title">Add slides</h2>
        <p className="hint">Drop the lecture deck as PDF or PowerPoint. The text is kept for search and for the coach, with slide numbers, so you can ask about slide 12 later.</p>
        {!pending ? (
          <label
            className="sync-drop rec-import"
            data-dragging={dragging}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) choose(f);
            }}
          >
            <input type="file" accept=".pdf,.pptx,application/pdf" className="visually-hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} aria-label="Slides file" />
            <b>Drop a .pdf or .pptx here</b>
            <span className="hint">or tap to choose the file</span>
          </label>
        ) : (
          <div className="rec-import-form">
            <p className="hint mono">
              {pending.name} · {fmtBytes(pending.size)}
            </p>
            <div className="field-row">
              <label className="field">
                <span>Class</span>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Topic or week (optional)</span>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Topic 3, Week 5, Stoichiometry" />
              </label>
              <label className="field">
                <span>Lecture date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            {suggestions.length > 0 && (
              <label className="field">
                <span>Recording from that day</span>
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                  <option value="">Not linked</option>
                  {suggestions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="settings-actions">
              <button type="button" className="btn primary" disabled={busy === 'new'} onClick={() => void save()}>
                {busy === 'new' ? 'Reading…' : 'Save slides'}
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {note && (
          <p className="hint" style={{ marginTop: 8 }}>
            {note}
          </p>
        )}
        <p className="hint">PowerPoint files are read directly; pictures, charts, and SmartArt carry no text. If a deck comes out thin, export it as PDF from PowerPoint and drop that instead.</p>
      </section>

      )}
      <section className="card rec-panel">
        <h2 className="section-title">Slides</h2>
        <p className="hint mono">
          {quota && free !== null ? `${fmtBytes(quota.usage)} used of ${fmtBytes(quota.quota)} this browser allows` : 'Storage quota unknown.'} · {decks.length} deck{decks.length === 1 ? '' : 's'}
        </p>
        {scoped.length === 0 && <p className="hint">No slides yet.</p>}
        {[...byCourse.entries()].map(([cid, all]) => {
          const collapsed = !!collapseOver && all.length > collapseOver && !expandedGroups[cid];
          const list = collapsed ? all.slice(0, collapseOver) : all;
          return (
          <div key={cid} className="rec-group">
            {!onlyCourse && (
              <h3>
                <CourseChip course={courseById.get(cid)} /> <span className="count">{all.length}</span>
              </h3>
            )}
            <ul className="rec-list">
              {list.map((d) => {
                const linked = d.recordingId ? recordings.find((r) => r.id === d.recordingId) : null;
                const dayRecs = sameDayRecordings(d, recordings, tz);
                return (
                  <li key={d.id} id={`deck-${d.id}`} className="rec-card deck-card" data-highlight={highlight === d.id}>
                    <InlineTitle value={d.title} onSave={(v) => void renameMaterial('deck', d.id, v).then(refresh)} />
                    <div className="hint mono">
                      {fmtDate(d.date, 'short')} · {d.pages} {d.kind === 'pptx' ? 'slides' : 'pages'} · {d.fileDeleted ? 'file deleted, text kept' : fmtBytes(d.bytes)}
                      {d.tag && ` · ${d.tag}`}
                      {linked && ` · with recording “${linked.title}”`}
                    </div>
                    <div className="rec-card-actions">
                      {!d.fileDeleted && (
                        <button type="button" className="btn small" onClick={() => void openFile(d)}>
                          Open
                        </button>
                      )}
                      <button type="button" className="btn small" onClick={() => void showText(d)}>
                        {openText?.id === d.id ? 'Hide text' : 'Text'}
                      </button>
                      {(dayRecs.length > 0 || linked) && (
                        <select className="deck-link" value={d.recordingId ?? ''} onChange={(e) => void relink(d, e.target.value)} aria-label={`Recording for ${d.title}`}>
                          <option value="">No recording linked</option>
                          {[...new Map([...(linked ? [linked] : []), ...dayRecs].map((r) => [r.id, r])).values()].map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <input className="deck-tag" value={d.tag} placeholder="topic or week" aria-label={`Topic for ${d.title}`} onChange={(e) => setDecks((ds) => ds.map((x) => (x.id === d.id ? { ...x, tag: e.target.value } : x)))} onBlur={(e) => void retag(d, { tag: e.target.value.trim() })} />
                      {!d.fileDeleted && (
                        <button type="button" className="btn small" onClick={() => void libraryDb.deleteFile(d.id).then(refresh)} title="Free the space; the text stays searchable">
                          Delete file
                        </button>
                      )}
                      {confirmDelete === d.id ? (
                        <button type="button" className="btn small danger" onClick={() => void libraryDb.removeDeck(d.id).then(refresh)}>
                          Confirm delete
                        </button>
                      ) : (
                        <button type="button" className="btn small" onClick={() => setConfirmDelete(d.id)}>
                          Delete
                        </button>
                      )}
                      <MoveSelect courseId={d.courseId} label={`Move ${d.title} to another class`} onMove={(cid2) => void moveMaterial('deck', d.id, cid2).then(refresh)} />
                    </div>
                    {openText?.id === d.id && (
                      <div className="rec-transcript deck-text">
                        {openText.pages.map((p) => (
                          <p key={p.n}>
                            <b className="mono">{d.kind === 'pptx' ? 'Slide' : 'Page'} {p.n}</b>
                            <br />
                            {p.text || <span className="muted">no readable text</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {collapsed && (
              <button type="button" className="diff-toggle" onClick={() => setExpandedGroups((g) => ({ ...g, [cid]: true }))}>
                Show all {all.length}
              </button>
            )}
          </div>
          );
        })}
      </section>
    </div>
  );
}
