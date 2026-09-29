import { useEffect, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { describeError } from '../chat/client';
import type { Course } from '../domain/types';
import { checkAnswer, type Verdict } from '../quiz/check';
import { generateSet, SET_SIZE, type QuizQuestion, type QuizSet } from '../quiz/generate';
import type { QuizSource } from '../quiz/sources';
import { practiceLine, type WeakTopic } from '../quiz/stats';
import { useStore } from '../storage/store';

type Answered = { given: string; verdict: Verdict; stuck: boolean };

export interface QuizRunnerProps {
  course: Course;
  topic: string;
  sources: QuizSource[];
  weak: WeakTopic[];
  /** The line under the button: "8 slides, 1 lecture stretch". */
  onTopic?: (topic: string) => void;
  /** Where "Ask about this" goes after a set. */
  askHref?: (topic: string) => string;
}

/** Five questions, one at a time, checked, misses remembered so the next set comes back to them. */
export function QuizRunner({ course, topic, sources, weak, askHref }: QuizRunnerProps) {
  const { data, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [set, setSet] = useState<QuizSet | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answered>>({});
  const [asked, setAsked] = useState<string[]>([]);
  const hasKey = useAiAllowed('flashcards');
  const line = practiceLine(data.settings.quizStats, course.id);

  // A new topic starts over.
  useEffect(() => {
    setSet(null);
  }, [topic, course.id]);

  const start = async () => {
    if (sources.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await generateSet({ course, topic, sources, weakTopics: weak.map((w) => w.topic), avoid: asked, apiKey: loadApiKey() });
      setSet(next);
      setIdx(0);
      setAnswers({});
      setAsked((a) => [...a, ...next.questions.map((q) => q.prompt)].slice(-30));
    } catch (e) {
      setError(`${await describeError(e)} Press the button to try again.`);
    } finally {
      setBusy(false);
    }
  };

  const decide = (q: QuizQuestion, given: string, verdict: Verdict, stuck = false) => {
    setAnswers((a) => ({ ...a, [q.id]: { given, verdict, stuck } }));
    if (verdict !== 'unsure') actions.recordQuizAnswer(course.id, q.topic, verdict === 'wrong' || stuck);
  };
  const settle = (q: QuizQuestion, verdict: 'right' | 'wrong') => {
    setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] ?? { given: '', stuck: false }), verdict } }));
    actions.recordQuizAnswer(course.id, q.topic, verdict === 'wrong');
  };

  const q = set?.questions[idx] ?? null;
  const done = set !== null && idx >= set.questions.length;
  const missed = set ? set.questions.filter((x) => answers[x.id] && (answers[x.id].verdict === 'wrong' || answers[x.id].stuck)) : [];
  const missedTopics = [...new Set(missed.map((m) => m.topic))];

  return (
    <>
      {!set && (
        <section className="card quiz-setup">
          <p className="hint">One question at a time from your own {course.code} material{topic ? ` on ${topic}` : ''}{weak.length ? `, coming back to ${weak.map((w) => w.topic).slice(0, 2).join(' and ')}` : ''}. Answer, see why, move on.</p>
          {line && <p className="hint mono">{line}</p>}
          <p className="hint mono quiz-sources">{sources.length === 0 ? `Nothing on file for ${course.code}${topic ? ` about “${topic}”` : ''}. Add slides, a recording, or the syllabus in the class library first.` : `${sources.length} source${sources.length === 1 ? '' : 's'}: ${counts(sources)}`}</p>
          {error && (
            <p className="hint" style={{ color: 'var(--overdue)' }}>
              {error}
            </p>
          )}
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={busy || !hasKey || sources.length === 0} onClick={() => void start()}>
              {busy ? `Writing ${SET_SIZE} questions from your ${course.code} material…` : `Quiz me · ${SET_SIZE} questions`}
            </button>
          </div>
        </section>
      )}

      {set && q && (
        <QuestionCard key={q.id} q={q} n={idx + 1} total={set.questions.length} source={set.sources.find((s) => s.id === q.sourceId) ?? null} answered={answers[q.id] ?? null} onAnswer={(given) => decide(q, given, checkAnswer(q, given))} onStuck={() => decide(q, '', 'wrong', true)} onSettle={(v) => settle(q, v)} onNext={() => setIdx((i) => i + 1)} />
      )}

      {set && done && (
        <section className="card quiz-done">
          <h2 className="section-title">{set.questions.length - missed.length} of {set.questions.length}</h2>
          <p className="hint">
            {missed.length === 0 ? 'Clean set. The next one reaches for harder ground.' : `Worth another look: ${missedTopics.join(', ')}. The next set comes back to it.`}
          </p>
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>
              {busy ? 'Writing questions…' : 'Another set'}
            </button>
            {askHref && (
              <a className="btn" href={askHref(missedTopics[0] ?? topic)}>
                {missedTopics[0] ? `Explain ${missedTopics[0]}` : 'Ask about this'}
              </a>
            )}
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

