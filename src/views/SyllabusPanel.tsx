import { useCallback, useEffect, useRef, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course } from '../domain/types';
import { extractLines } from '../parser/pdfText';
import { tidySyllabusText } from '../syllabus/context';
import { syllabiDb, type SyllabusDoc } from '../syllabus/db';
import { useStore } from '../storage/store';

function fmtChars(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k characters` : `${n} characters`;
}

/** One syllabus per class, as text the coach can quote. Reference only; assignments come from the .ics export. */
export function SyllabusPanel() {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const [docs, setDocs] = useState<Record<string, SyllabusDoc>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async () => {
    try {
      const all = await syllabiDb.list();
      setDocs(Object.fromEntries(all.map((d) => [d.courseId, d])));
    } catch {
      setNote('Syllabus storage is unavailable in this browser.');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (course: Course, file: File) => {
    setBusy(course.id);
    setNote(null);
    try {
      const raw = /\.txt$/i.test(file.name) ? await file.text() : (await extractLines(await file.arrayBuffer())).join('\n');
      const text = tidySyllabusText(raw);
      if (text.length < 200) throw new Error('Very little text came out of that file. If the PDF is a scan, it has no text layer to read.');
      await syllabiDb.put({ courseId: course.id, name: file.name, text, chars: text.length, addedAt: new Date().toISOString() });
      await refresh();
      setNote(`${course.code}: ${file.name} saved, ${fmtChars(text.length)}. The coach can quote it now.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (course: Course) => {
    await syllabiDb.remove(course.id);
    await refresh();
  };

  return (
    <section className="card settings-card">
      <h2 className="section-title">Syllabi, for the coach</h2>
      <p className="hint">Drop each class&apos;s syllabus PDF so you can ask things like &ldquo;what&apos;s the late policy for chem&rdquo; and get the line quoted back. Reference only: assignments and dates come from the Halo export, never from here.</p>
      <ul className="course-list syllabus-list">
        {data.courses.map((c) => {
          const d = docs[c.id];
          return (
            <li key={c.id} className="syllabus-row">
              <CourseChip course={c} />
              <span className="hint syllabus-status">
                {busy === c.id ? 'Reading…' : d ? `${d.name} · ${fmtChars(d.chars)} · added ${fmtDate(dateOf(d.addedAt, tz), 'short')}` : 'no syllabus yet'}
              </span>
              <span className="syllabus-actions">
                <input
                  ref={(el) => {
                    inputs.current[c.id] = el;
                  }}
                  type="file"
                  accept="application/pdf,.pdf,.txt"
                  className="visually-hidden"
                  aria-label={`Syllabus file for ${c.code}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void add(c, f);
                    e.target.value = '';
                  }}
                />
                <button type="button" className="btn small" disabled={busy === c.id} onClick={() => inputs.current[c.id]?.click()}>
                  {d ? 'Replace' : 'Add PDF'}
                </button>
                {d && (
                  <button type="button" className="btn small" onClick={() => void remove(c)}>
                    Remove
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {note && (
        <p className="hint" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
    </section>
  );
}
