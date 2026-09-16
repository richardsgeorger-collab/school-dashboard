import { useEffect, useMemo, useRef, useState } from 'react';
import { describeAiError, type Turn } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { weakConcepts } from '../domain/concepts';
import { EMPTY_POOL, loadPool } from '../quiz/pool';
import { gatherSources, type SourcePool } from '../quiz/sources';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { askTutor, BEHIND, citedSources, STUCK, tutorSituation } from '../tutor/tutor';

interface Msg extends Turn {
  at: string;
}

const slot = (courseId: string) => `school-dashboard:tutor:${courseId}`;
const loadHistory = (courseId: string): Msg[] => {
  try {
    const raw = sessionStorage.getItem(slot(courseId));
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
};

/**
 * A tutor that knows the class. Teaches from the student's own slides, transcripts, and syllabus, cites the slide or
 * the lecture moment, knows what is coming, and on problems gives the next step, not the answer. Its own surface.
 */
export function Tutor() {
  const { data, today } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const course = data.courses.find((c) => c.id === params.get('c')) ?? null;
  const item = data.items.find((i) => i.id === params.get('i')) ?? null;
  const hasKey = loadApiKey() !== '';
  const [topic, setTopic] = useState(params.get('t') ?? item?.topic ?? item?.title ?? '');
  const [pool, setPool] = useState<SourcePool | null>(null);
  const [history, setHistory] = useState<Msg[]>(() => (course ? loadHistory(course.id) : []));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!course) return;
    let live = true;
    setPool(null);
    loadPool(course.id)
      .then((p) => live && setPool(p))
      .catch(() => live && setPool(EMPTY_POOL));
    return () => {
      live = false;
    };
  }, [course?.id]);
  useEffect(() => {
    if (course) sessionStorage.setItem(slot(course.id), JSON.stringify(history.slice(-40)));
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [history, course]);

  const sources = useMemo(() => (course && pool ? gatherSources(course, topic, pool, tz) : []), [course, pool, topic, tz]);
  const weak = useMemo(() => (course ? weakConcepts(course.id, data.items, data.settings.quizStats).map((w) => w.topic) : []), [course, data.items, data.settings.quizStats]);
  const situation = useMemo(() => (course && pool ? tutorSituation(course, data.items, pool.recordings, weak, data.settings.topicLinks ?? [], data.courses, today, tz, topic, item) : null), [course, pool, data.items, weak, data.settings.topicLinks, data.courses, today, tz, topic, item]);

  const send = async (userText: string) => {
    if (!course || !situation || !userText.trim() || busy) return;
    const mine: Msg = { role: 'user', text: userText.trim(), at: new Date().toISOString() };
    const next = [...history, mine];
    setHistory(next);
    setText('');
    setBusy(true);
    setNote(null);
    try {
      const answer = await askTutor({ apiKey: loadApiKey(), sources, situation, history: history.map((h) => ({ role: h.role, text: h.text })), text: mine.text });
      setHistory([...next, { role: 'assistant', text: answer, at: new Date().toISOString() }]);
    } catch (e) {
      setNote(await describeAiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!course) {
    return (
      <>
        <h1 className="page-title">Tutor</h1>
        <p className="hint">Open a class page and press Tutor.</p>
      </>
    );
  }
  const counts = { slides: sources.filter((s) => s.kind === 'slide').length, lectures: sources.filter((s) => s.kind === 'recording').length, syllabus: sources.some((s) => s.kind === 'syllabus') };
  const sourceLine = !pool ? 'Reading your material…' : sources.length === 0 ? `Nothing on file covers “${topic || 'this'}” yet. Drop the deck or a recording into the class library and the tutor teaches from it.` : `Teaching from ${[counts.slides ? `${counts.slides} slide${counts.slides === 1 ? '' : 's'}` : null, counts.lectures ? `${counts.lectures} lecture stretch${counts.lectures === 1 ? '' : 'es'}` : null, counts.syllabus ? 'the syllabus' : null].filter(Boolean).join(', ')}.`;

  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href={`#/class?c=${course.id}`}>
            ← {course.code}
          </a>
          <h1 className="page-title lib-class-title">
            <CourseChip course={course} /> <span>Tutor</span>
          </h1>
          <p className="hint mono">{sourceLine}</p>
        </div>
      </div>

      <section className="card tutor">
        <div className="tutor-topic">
          <label className="field">
            <span>Topic</span>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="stoichiometry, derivatives, the op-ed thesis…" />
          </label>
          <div className="settings-actions">
            <button type="button" className="btn small primary" disabled={!hasKey || busy || !pool} onClick={() => void send(BEHIND(topic))}>
              Explain this like I’m behind
            </button>
            <button type="button" className="btn small" disabled={!hasKey || busy || !pool} onClick={() => setText(STUCK)}>
              I’m stuck on a problem
            </button>
          </div>
        </div>
        {!hasKey && <p className="hint">Connect the Anthropic key on Now to use the tutor.</p>}
        {situation && situation.upcoming.length > 0 && (
          <p className="hint mono">
            Coming up: {situation.upcoming.map((u) => `${u.label} in ${Math.max(0, Math.round((new Date(`${u.due}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000))} days`).join(' · ')}
            {situation.examFlags.length ? ` · the professor flagged ${situation.examFlags.length} thing${situation.examFlags.length === 1 ? '' : 's'} as exam material` : ''}
          </p>
        )}
        <ol className="tutor-thread" aria-live="polite">
          {history.map((m, i) => (
            <li key={i} className="tutor-msg" data-role={m.role}>
              <p className="tutor-text">{m.text}</p>
              {m.role === 'assistant' && citedSources(m.text, sources).length > 0 && (
                <p className="hint tutor-cites">
                  {citedSources(m.text, sources).map((s) => (
                    <a key={s.id} className="diff-toggle" href={s.href} style={{ marginRight: 10 }}>
                      [{s.id}] {s.label}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
          {busy && (
            <li className="tutor-msg" data-role="assistant">
              <p className="hint mono">Thinking…</p>
            </li>
          )}
          <div ref={endRef} />
        </ol>
        {note && (
          <p className="hint" style={{ color: 'var(--overdue)' }}>
            {note}
          </p>
        )}
        <form
          className="tutor-ask"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea className="halo-paste" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about the topic, or paste where you got stuck. You get the next step, not the answer." aria-label="Ask the tutor" disabled={!hasKey} />
          <div className="settings-actions">
            <button type="submit" className="btn primary" disabled={!hasKey || busy || !text.trim() || !pool}>
              {busy ? 'Thinking…' : 'Ask'}
            </button>
            {history.length > 0 && (
              <button type="button" className="btn small" onClick={() => setHistory([])}>
                Clear
              </button>
            )}
            <span className="hint">It teaches and checks your thinking. It won’t write what you submit.</span>
          </div>
        </form>
      </section>
    </>
  );
}
