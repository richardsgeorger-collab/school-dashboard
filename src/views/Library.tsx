import { useCallback, useEffect, useMemo, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { guessCourse } from '../capture/parse';
import type { Course } from '../domain/types';
import { libraryDb } from '../library/db';
import { classifyFile, fileKey, ingestFile, LIBRARY_EVENT } from '../library/ingest';
import { recordingsDb } from '../record/db';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { Record } from './Record';
import { PasteTranscript } from './PasteTranscript';
import { SearchView } from './SearchView';
import { QuizLink } from './Quiz';
import { SlidesView } from './SlidesView';
import { SyllabusPanel } from './SyllabusPanel';

const COLLAPSE_OVER = 5;

function DropZone({ onFile, label, hint, busy }: { onFile: (f: File) => void; label: string; hint: string; busy: boolean }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className="sync-drop rec-import lib-drop"
      data-dragging={dragging}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        for (const f of Array.from(e.dataTransfer.files)) onFile(f);
      }}
    >
      <input type="file" multiple accept="audio/*,.m4a,.mp3,.wav,.pdf,.pptx,.txt,application/pdf" className="visually-hidden" aria-label={label} onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) onFile(f); e.target.value = ''; }} />
      <b>{busy ? 'Saving…' : label}</b>
      <span className="hint">{hint}</span>
    </label>
  );
}

/** Save files into a class and report each one in a line. Shared by the home drop zone and every class page. */
function useIngest() {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const run = useCallback(
    async (file: File, course: Course) => {
      setBusy(true);
      try {
        const r = await ingestFile(file, course, tz, today);
        setNotes((n) => [`${course.code}: ${r.title}. ${r.detail}${r.warnings.length ? ` ${r.warnings.join(' ')}` : ''}`, ...n].slice(0, 6));
      } catch (e) {
        setNotes((n) => [`${file.name}: ${e instanceof Error ? e.message : String(e)}`, ...n].slice(0, 6));
      } finally {
        setBusy(false);
        setTick((k) => k + 1);
      }
    },
    [tz, today],
  );
  return { run, busy, notes, tick };
}

/** The landing view: one row per class with counts, a drop zone that asks which class once, and a way to search everything. */
function LibraryHome() {
  const { data, actions, courseById } = useStore();
  const [counts, setCounts] = useState<Record<string, { recordings: number; decks: number }>>({});
  const [orphans, setOrphans] = useState(0);
  const { run, busy, notes, tick } = useIngest();
  const [ask, setAsk] = useState<{ file: File; courseId: string; key: string | null; remember: boolean } | null>(null);
  const [queue, setQueue] = useState<File[]>([]);

  const refresh = useCallback(async () => {
    const [recs, decks] = await Promise.all([recordingsDb.list().catch(() => []), libraryDb.listDecks().catch(() => [])]);
    const c: Record<string, { recordings: number; decks: number }> = {};
    let lost = 0;
    for (const r of recs) {
      if (!courseById.has(r.courseId)) lost++;
      else (c[r.courseId] ??= { recordings: 0, decks: 0 }).recordings++;
    }
    for (const d of decks) {
      if (!courseById.has(d.courseId)) lost++;
      else (c[d.courseId] ??= { recordings: 0, decks: 0 }).decks++;
    }
    setCounts(c);
    setOrphans(lost);
  }, [courseById]);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(LIBRARY_EVENT, onChange);
    return () => window.removeEventListener(LIBRARY_EVENT, onChange);
  }, [refresh, tick]);

  const handle = useCallback(
    (file: File) => {
      if (classifyFile(file.name, file.type) === 'unknown') {
        setQueue((q) => q);
        void run(file, data.courses[0]);
        return;
      }
      const key = fileKey(file.name);
      const remembered = key ? data.settings.materialsNameMap?.[key] : undefined;
      const course = remembered ? courseById.get(remembered) : undefined;
      if (course) {
        void run(file, course);
        return;
      }
      setQueue((q) => [...q, file]);
    },
    [run, data.courses, data.settings.materialsNameMap, courseById],
  );
  useEffect(() => {
    if (ask || queue.length === 0) return;
    const [file, ...rest] = queue;
    setQueue(rest);
    const key = fileKey(file.name);
    setAsk({ file, courseId: guessCourse(file.name, data.courses)?.id ?? data.courses[0]?.id ?? '', key, remember: !!key });
  }, [queue, ask, data.courses]);

  const confirmAsk = () => {
    if (!ask) return;
    const course = courseById.get(ask.courseId);
    if (course) {
      if (ask.remember && ask.key) actions.updateSettings({ materialsNameMap: { ...(data.settings.materialsNameMap ?? {}), [ask.key]: course.id } });
      void run(ask.file, course);
    }
    setAsk(null);
  };

  return (
    <>
      <div className="lib-head">
        <h1 className="page-title">
          Library <span className="light">by class</span>
        </h1>
        <a className="diff-toggle" href="#/library?search=all">
          Search all classes
        </a>
      </div>
      <ul className="course-list lib-rows">
        {data.courses.map((c) => {
          const n = counts[c.id] ?? { recordings: 0, decks: 0 };
          return (
            <li key={c.id}>
              <a className="course-row lib-row" href={`#/library?c=${c.id}`}>
                <CourseChip course={c} />
                <span className="course-row-name">{c.name}</span>
                <span className="hint mono">
                  {n.recordings} recording{n.recordings === 1 ? '' : 's'} · {n.decks} slide{n.decks === 1 ? '' : 's'}
                </span>
              </a>
            </li>
          );
        })}
        {orphans > 0 && (
          <li>
            <a className="course-row lib-row" href="#/library?c=none">
              <span className="chip">
                <span className="dot" />
                Unassigned
              </span>
              <span className="course-row-name">From classes that were removed</span>
              <span className="hint mono">{orphans} item{orphans === 1 ? '' : 's'}</span>
            </a>
          </li>
        )}
      </ul>
      <DropZone onFile={handle} busy={busy} label="Drop a recording, slides, or a syllabus here" hint="It asks which class once, then remembers files that start the same way. Or open a class and drop there." />
      {notes.length > 0 && (
        <ul className="diff-list lib-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {ask && (
        <Modal title="Which class?" onClose={() => setAsk(null)}>
          <div className="modal-body">
            <p className="hint mono">{ask.file.name}</p>
            <label className="field">
              <span>Class</span>
              <select value={ask.courseId} onChange={(e) => setAsk({ ...ask, courseId: e.target.value })} autoFocus>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
            </label>
            {ask.key && (
              <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input type="checkbox" checked={ask.remember} onChange={(e) => setAsk({ ...ask, remember: e.target.checked })} />
                Remember: files starting with &ldquo;{ask.key}&rdquo; go here
              </label>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAsk(null)}>
                Skip this file
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={confirmAsk}>
                Save here
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** One class: drop zone, search, and its recordings, slides, and syllabus, newest first. */
function ClassLibrary({ courseId }: { courseId: string }) {
  const { courseById } = useStore();
  const [paste, setPaste] = useState(false);
  const course = courseId === 'none' ? null : courseById.get(courseId);
  const { run, busy, notes, tick } = useIngest();
  const title = course ? course.name : courseId === 'none' ? 'Unassigned' : 'Unknown class';
  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/library">
            ← All classes
          </a>
          <h1 className="page-title lib-class-title">
            {course && <CourseChip course={course} link />} <span>{title}</span>
          </h1>
        </div>
        {course && (
          <span className="settings-actions">
            <button type="button" className="btn small primary" onClick={() => setPaste(true)}>
              Paste a lecture transcript
            </button>
            <QuizLink courseId={course.id} />
          </span>
        )}
      </div>
      {course && paste && <PasteTranscript course={course} onClose={() => { setPaste(false); }} />}
      {course && <DropZone onFile={(f) => void run(f, course)} busy={busy} label={`Drop into ${course.code}`} hint="Audio becomes a recording, a PDF or PPTX becomes slides, a file named syllabus becomes the syllabus. No questions asked." />}
      {courseId === 'none' && <p className="hint">These belong to classes that were removed. Use “Move to” on each one to file it, or delete it.</p>}
      {notes.length > 0 && (
        <ul className="diff-list lib-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {course && <SearchView defaultCourseId={course.id} />}
      <section className="lib-section" data-kind="recordings">
        <Record key={`r${tick}`} embedded courseId={courseId} collapseOver={COLLAPSE_OVER} />
      </section>
      <section className="lib-section" data-kind="slides">
        <SlidesView key={`s${tick}`} courseId={courseId} collapseOver={COLLAPSE_OVER} />
      </section>
      {course && (
        <section className="lib-section card" data-kind="syllabus">
          <h2 className="section-title">Syllabus</h2>
          <SyllabusPanel key={`y${tick}`} courseId={course.id} />
        </section>
      )}
    </>
  );
}

export function Library() {
  const { params } = useRoute();
  const c = params.get('c');
  const search = params.get('search');
  const q = params.get('q') ?? '';
  const body = useMemo(() => {
    if (search === 'all') {
      return (
        <>
          <div className="lib-head">
            <div>
              <a className="diff-toggle" href="#/library">
                ← All classes
              </a>
              <h1 className="page-title">
                Search <span className="light">all classes</span>
              </h1>
            </div>
          </div>
          <SearchView initialQuery={q} />
        </>
      );
    }
    if (c) return <ClassLibrary courseId={c} />;
    return <LibraryHome />;
  }, [c, search, q]);
  return body;
}
