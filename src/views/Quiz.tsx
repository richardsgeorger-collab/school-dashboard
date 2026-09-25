import { useEffect, useMemo, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { describeError } from '../chat/client';
import { libraryDb } from '../library/db';
import { checkAnswer, type Verdict } from '../quiz/check';
import { generateSet, SET_SIZE, type QuizQuestion, type QuizSet } from '../quiz/generate';
import { gatherSources, type QuizSource, type SourcePool } from '../quiz/sources';
import { practiceLine, weakTopics } from '../quiz/stats';
import { recordingsDb } from '../record/db';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { syllabiDb } from '../syllabus/db';

async function loadPool(courseId: string): Promise<SourcePool> {
  const [decks, pages, recordings, syllabus] = await Promise.all([libraryDb.listDecks(), libraryDb.allPages(), recordingsDb.list(), syllabiDb.get(courseId)]);
  const mine = recordings.filter((r) => r.courseId === courseId).slice(0, 10);
  const segmentsOf: SourcePool['segmentsOf'] = {};
  for (const r of mine) segmentsOf[r.id] = await recordingsDb.segments(r.id);
  return { decks, pages, recordings: mine, segmentsOf, syllabus };
}

type Answered = { given: string; verdict: Verdict; stuck: boolean };

export function Quiz() {
  const { data, actions } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const [courseId, setCourseId] = useState(() => params.get('c') ?? data.courses[0]?.id ?? '');
  const [topic, setTopic] = useState(() => params.get('t') ?? '');
  const course = data.courses.find((c) => c.id === courseId) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [set, setSet] = useState<QuizSet | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answered>>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [pool, setPool] = useState<SourcePool | null>(null);
  const hasKey = useAiAllowed('flashcards');
  const wantCourse = params.get('c');
  const wantTopic = params.get('t') ?? '';

  // A new link (from the Library or Grades) starts over even when this screen is already up.
  useEffect(() => {
    if (wantCourse) setCourseId(wantCourse);
    setTopic(wantTopic);
    setSet(null);
  }, [wantCourse, wantTopic]);

  useEffect(() => {
    if (!courseId) return;
    let live = true;
    setPool(null);
    loadPool(courseId).then((p) => live && setPool(p)).catch(() => live && setPool({ decks: [], pages: [], recordings: [], segmentsOf: {}, syllabus: null }));
    return () => {
      live = false;
    };
  }, [courseId]);

  const sources = useMemo(() => (course && pool ? gatherSources(course, topic, pool, tz) : []), [course, pool, topic, tz]);
  const weak = course ? weakTopics(data.settings.quizStats, course.id) : [];
  const line = course ? practiceLine(data.settings.quizStats, course.id) : null;

  const start = async () => {
    if (!course || sources.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await generateSet({ course, topic, sources, weakTopics: weak.map((w) => w.topic), avoid: asked, apiKey: loadApiKey() });
      setSet(next);
      setIdx(0);
      setAnswers({});
      setAsked((a) => [...a, ...next.questions.map((q) => q.prompt)].slice(-30));
    } catch (e) {
      setError(await describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = (q: QuizQuestion, given: string, verdict: Verdict, stuck = false) => {
    setAnswers((a) => ({ ...a, [q.id]: { given, verdict, stuck } }));
    if (verdict !== 'unsure' && course) actions.recordQuizAnswer(course.id, q.topic, verdict === 'wrong' || stuck);
  };
  const settle = (q: QuizQuestion, verdict: 'right' | 'wrong') => {
    setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] ?? { given: '', stuck: false }), verdict } }));
    if (course) actions.recordQuizAnswer(course.id, q.topic, verdict === 'wrong');
  };

  const q = set?.questions[idx] ?? null;
  const done = set !== null && idx >= set.questions.length;
  const missed = set ? set.questions.filter((x) => answers[x.id] && (answers[x.id].verdict === 'wrong' || answers[x.id].stuck)) : [];

  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href={course ? `#/library?c=${course.id}` : '#/library'}>
            ← {course ? course.code : 'Library'}
          </a>
          <h1 className="page-title">
            Practice <span className="light">from your own material</span>
          </h1>
        </div>
      </div>

      {!set && (
        <section className="card quiz-setup">
          <div className="quiz-chips" role="group" aria-label="Class">
            {data.courses.map((c) => (
              <button key={c.id} type="button" className={`quiz-chip${c.id === courseId ? ' on' : ''}`} onClick={() => setCourseId(c.id)}>
                {c.code}
              </button>
            ))}
          </div>
          <label className="quiz-field">
            <span>Topic, or leave it blank for the latest material</span>
            <input value={topic} placeholder="limiting reagent, thesis statements, unit vectors…" onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void start()} />
          </label>
          {weak.length > 0 && (
            <p className="hint">
              Worth another pass: {weak.map((w) => w.topic).join(', ')}.{' '}
              <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => setTopic(weak[0].topic)}>
                Quiz that
              </button>
            </p>
          )}
          {line && <p className="hint mono">{line}</p>}
          <p className="hint mono quiz-sources">
            {pool === null ? 'Reading your material…' : sources.length === 0 ? `Nothing on file for ${course?.code ?? 'this class'}${topic ? ` about “${topic}”` : ''}. Add slides, a recording, or the syllabus in the Library first.` : `${sources.length} source${sources.length === 1 ? '' : 's'}: ${counts(sources)}`}
          </p>
          {!hasKey && <p className="hint">Practice is part of Max.</p>}
          {error && (
            <p className="hint" style={{ color: 'var(--overdue)' }}>
              {error}
            </p>
          )}
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={busy || !hasKey || sources.length === 0} onClick={() => void start()}>
              {busy ? 'Writing questions…' : `Quiz me · ${SET_SIZE} questions`}
            </button>
          </div>
        </section>
      )}

      {set && q && course && (
        <QuestionCard key={q.id} q={q} n={idx + 1} total={set.questions.length} source={set.sources.find((s) => s.id === q.sourceId) ?? null} answered={answers[q.id] ?? null} onAnswer={(given) => decide(q, given, checkAnswer(q, given))} onStuck={() => decide(q, '', 'wrong', true)} onSettle={(v) => settle(q, v)} onNext={() => setIdx((i) => i + 1)} />
      )}

      {set && done && (
        <section className="card quiz-done">
          <h2 className="section-title">{set.questions.length - missed.length} of {set.questions.length}</h2>
          <p className="hint">
            {missed.length === 0 ? 'Clean set. Next time will reach for harder ground.' : `Worth another look: ${[...new Set(missed.map((m) => m.topic))].join(', ')}. The next set comes back to it.`}
          </p>
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>
              {busy ? 'Writing questions…' : 'Another set'}
            </button>
            <button type="button" className="btn" onClick={() => setSet(null)}>
              Change topic
            </button>
            <a className="btn" href={`#/library?c=${course?.id ?? ''}`}>
              Done
            </a>
          </div>
        </section>
      )}
    </>
  );
}

function counts(sources: QuizSource[]): string {
  const n = (k: QuizSource['kind']) => sources.filter((s) => s.kind === k).length;
  return [n('slide') ? `${n('slide')} slide${n('slide') === 1 ? '' : 's'}` : '', n('recording') ? `${n('recording')} lecture stretch${n('recording') === 1 ? '' : 'es'}` : '', n('syllabus') ? 'syllabus' : ''].filter(Boolean).join(', ');
}

function QuestionCard({ q, n, total, source, answered, onAnswer, onStuck, onSettle, onNext }: { q: QuizQuestion; n: number; total: number; source: QuizSource | null; answered: Answered | null; onAnswer: (given: string) => void; onStuck: () => void; onSettle: (v: 'right' | 'wrong') => void; onNext: () => void }) {
  const [given, setGiven] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const verdict = answered?.verdict ?? null;
  const settled = verdict === 'right' || verdict === 'wrong';
  return (
    <section className="card quiz-q" data-kind={q.kind} data-verdict={verdict ?? 'open'}>
      <p className="hint mono quiz-meta">
        {n} of {total} · {q.topic}
        {source && (
          <>
            {' '}
            · from{' '}
            <a className="diff-toggle" href={source.href}>
              {source.label}
            </a>
          </>
        )}
      </p>
      <p className="quiz-prompt">{q.prompt}</p>

      {!answered && q.kind === 'multiple_choice' && (
        <div className="quiz-choices">
          {q.choices.map((c, i) => (
            <button key={i} type="button" className="btn quiz-choice" onClick={() => onAnswer(String(i))}>
              <span className="mono">{'ABCD'[i]}</span> {c}
            </button>
          ))}
        </div>
      )}
      {!answered && q.kind !== 'multiple_choice' && (
        <form
          className="quiz-answer"
          onSubmit={(e) => {
            e.preventDefault();
            if (given.trim()) onAnswer(given);
          }}
        >
          <input value={given} placeholder={q.kind === 'worked' ? 'Your answer with units' : 'Your answer'} onChange={(e) => setGiven(e.target.value)} autoFocus autoComplete="off" aria-label="Your answer" />
          <button type="submit" className="btn primary" disabled={!given.trim()}>
            Check
          </button>
          <button type="button" className="btn" onClick={onStuck}>
            I&apos;m stuck
          </button>
        </form>
      )}

      {answered && (
        <div className="quiz-result">
          <p className="quiz-verdict">
            {answered.stuck ? 'No problem. Here is how it goes.' : verdict === 'right' ? 'Right.' : verdict === 'wrong' ? 'Not quite.' : 'Close. You decide:'}
            {verdict === 'unsure' && (
              <span className="quiz-settle">
                <button type="button" className="btn small" onClick={() => onSettle('right')}>
                  I had it
                </button>
                <button type="button" className="btn small" onClick={() => onSettle('wrong')}>
                  Missed it
                </button>
              </span>
            )}
          </p>
          {answered.given && !answered.stuck && (
            <p className="hint mono">
              You said: {q.kind === 'multiple_choice' ? `${'ABCD'[Number(answered.given)]}. ${q.choices[Number(answered.given)]}` : answered.given}
            </p>
          )}
          <p className="quiz-answer-line">
            <b>Answer:</b> {q.kind === 'multiple_choice' ? `${'ABCD'[Number(q.answer)]}. ${q.choices[Number(q.answer)]}` : q.answer}
          </p>
          {q.explanation && <p className="hint quiz-why">{q.explanation}</p>}
          {q.kind === 'worked' && q.steps.length > 0 && (
            <>
              {!showSteps ? (
                <button type="button" className="diff-toggle" onClick={() => setShowSteps(true)}>
                  Show the solution path
                </button>
              ) : (
                <ol className="quiz-steps">
                  {q.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
            </>
          )}
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={!settled && !answered.stuck} onClick={onNext}>
              {n === total ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function QuizLink({ courseId, topic, label = 'Quiz me' }: { courseId: string; topic?: string; label?: string }) {
  const qs = new URLSearchParams({ c: courseId, ...(topic ? { t: topic } : {}) }).toString();
  return (
    <a className="btn small" href={`#/quiz?${qs}`}>
      {label}
    </a>
  );
}
