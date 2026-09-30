import { useEffect, useState } from 'react';
import { latestMeter, onMeter } from '../ai/gateway';
import type { Meter } from '../ai/meter';
import { askSuggestions } from '../ask/ask';
import { useAccount } from '../auth/AccountContext';
import { CourseChip } from '../components/CourseChip';
import { can, rank, trialState } from '../config/flags';
import { LIMITS, TIER_NAMES, TRIAL } from '../config/tiers';
import { dateOf, fmtDate } from '../domain/dates';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { materialLine } from '../study/material';
import { inDays, nextCheckable, upcomingTests } from '../study/upcoming';
import { libraryDb, type Deck } from '../library/db';
import { recordingsDb, type Recording } from '../record/db';
import { UpgradeButton } from './PlanWall';
import { TrialOffer } from './TrialOffer';

/**
 * Study: the one home for the three AI tools. The quizzes and exams ahead, each with Practice; one box to ask
 * anything; Check my work. A student on Free sees the same screen with their own tests named and one way in.
 */
export function Study() {
  const { data, today, courseById } = useStore();
  const { tier, profile, auth, planKnown } = useAccount();
  const tz = data.settings.timezone;
  const allowed = can('aiChat', tier) && can('flashcards', tier);
  const tests = upcomingTests(data.items, today, tz);
  const next = nextCheckable(data.items, today, tz);
  const [q, setQ] = useState('');
  const [m, setM] = useState<Meter | null>(latestMeter());
  useEffect(() => onMeter(setM), []);
  // What Practice has to build from, said before the student picks a test.
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([libraryDb.listDecks().catch(() => [] as Deck[]), recordingsDb.list().catch(() => [] as Recording[])]).then(([d, r]) => {
      if (!live) return;
      setDecks(d);
      setRecordings(r);
    });
    return () => {
      live = false;
    };
  }, []);
  const material = decks ? materialLine(data.courses, decks, recordings) : null;
  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    window.location.hash = `/ask?q=${encodeURIComponent(t)}`;
  };
  const suggestions = askSuggestions({ course: null, item: null }, data.items, today, tz);
  const cap = LIMITS.aiMessagesPerDay[tier];
  const meterLine = allowed && m ? `${m.messagesToday} of ${cap} questions today · $${m.monthCostUsd.toFixed(2)} of $${m.ceilingUsd.toFixed(2)} this month` : null;
  const trial = auth.configured && trialState(profile) === 'available' && rank(TRIAL.tier) >= rank('max');
  const lockHref = '#/you?s=plan&to=max&for=flashcards';
  const first = tests[0];

  return (
    <div className="study-home">
      <div className="lib-head">
        <div>
          <h1 className="page-title">Study</h1>
          <p className="hint study-lead">Practice for what is coming, ask anything about your classes, or check your work before you turn it in. All of it from your own slides, lectures, syllabi and announcements.</p>
        </div>
      </div>

      {!allowed && planKnown && (
        <section className="card study-lock" role="note" aria-label={`Included with ${TIER_NAMES.max}`}>
          <p className="study-lock-line">
            <b>Practice, Ask and Check are part of Max.</b>{' '}
            {first ? `Practice for ${first.label} would plan the ${Math.max(1, Math.round((new Date(`${dateOf(first.dueAt, tz)}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000))} days left, write a worksheet with answers and quiz you from your ${courseById.get(first.courseId)?.code ?? ''} material.` : 'Practice plans a quiz or exam, writes a worksheet with answers and quizzes you from your own class material.'}
          </p>
          <div className="locked-actions">
            <span className="locked-tier">{TIER_NAMES.max}</span>
            {trial ? (
              <span className="locked-trial">
                <TrialOffer variant="button" label={TRIAL.button} />
                <span className="hint">No card. Nothing charges.</span>
              </span>
            ) : (
              <span className="locked-trial">
                <UpgradeButton tier="max" />
                <a className="hero-inline" href={lockHref}>
                  See plans
                </a>
              </span>
            )}
          </div>
        </section>
      )}

      <section className="card study-block" aria-label="Practice">
        <div className="study-block-head">
          <h2 className="section-title">Practice</h2>
          <p className="hint">A study plan, a worksheet with answers, quiz me and flashcards, for the test you pick.</p>
        </div>
        {tests.length > 0 ? (
          <ul className="study-tests">
            {tests.map((t) => (
              <TestRow key={t.id} item={t} href={allowed ? `#/practice?i=${t.id}` : lockHref} />
            ))}
          </ul>
        ) : (
          <p className="hint">No quiz or exam on the calendar yet. Practice any class anyway.</p>
        )}
        <p className="study-chips">
          <span className="hint">Any class:</span>
          {data.courses.map((c) => (
            <a key={c.id} className="quiz-chip" href={allowed ? `#/practice?c=${c.id}` : lockHref}>
              {c.code}
            </a>
          ))}
        </p>
        {material && material.text && (
          <p className="hint study-material">
            {material.text}{' '}
            {material.empty.length > 0 && (
              <a className="diff-toggle" href={`#/library${material.empty.length === data.courses.length ? '' : `?c=${material.empty[0].id}`}`}>
                Add slides
              </a>
            )}
          </p>
        )}
      </section>

      <section className="card study-block" aria-label="Ask">
        <div className="study-block-head">
          <h2 className="section-title">Ask anything</h2>
          <p className="hint">What to do next, what a professor wants, how a topic works. Short answers, with what to do next.</p>
        </div>
        <form
          className="study-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (allowed) ask(q);
            else window.location.hash = lockHref.slice(1);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={suggestions[1]} aria-label="Ask anything" enterKeyHint="send" />
          <button type="submit" className="btn primary">
            Ask
          </button>
        </form>
        <div className="chat-suggest">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn small" onClick={() => (allowed ? ask(s) : (window.location.hash = lockHref.slice(1)))}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="card study-block" aria-label="Check">
        <div className="study-block-head">
          <h2 className="section-title">Check my work</h2>
          <p className="hint">Paste or drop a draft or a problem set. It is checked against the rubric, or against how the class teaches the method. Never a grade, never a rewrite.</p>
        </div>
        <div className="settings-actions">
          <a className="btn primary" href={allowed ? '#/check' : lockHref}>
            Check my work
          </a>
          {next && <span className="hint">{next.late ? 'Still open' : 'Next up'}: {next.item.label}, {next.late ? 'was due' : 'due'} {fmtDate(dateOf(next.item.dueAt, tz), 'long')}.</span>}
        </div>
      </section>

      {meterLine && <p className="hint ai-meter">{meterLine}</p>}
    </div>
  );
}

function TestRow({ item, href }: { item: Item; href: string }) {
  const { data, courseById, today } = useStore();
  const tz = data.settings.timezone;
  const day = dateOf(item.dueAt, tz);
  return (
    <li className="study-test">
      <div className="study-test-main">
        <span className="study-test-title">{item.label}</span>
        <span className="hint">
          <CourseChip course={courseById.get(item.courseId)} /> · {fmtDate(day, 'long')} · {inDays(item, today, tz)} · {item.points} pts
        </span>
      </div>
      <a className="btn small primary" href={href}>
        Practice
      </a>
    </li>
  );
}
