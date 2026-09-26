import { useEffect, useMemo, useState } from 'react';
import { ChatCard } from '../chat/ChatCard';
import { ItemRow } from '../components/ItemRow';
import { Modal } from '../components/Modal';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconCheck, IconNow } from '../components/Icons';
import { HeadsUp, type HeadsUpLine } from './HeadsUp';
import { HaloDraw } from '../components/HaloDraw';
import { PlanWall, useNeedsPlan } from './PlanWall';
import { useReadStatus } from '../halo/backgroundRead';
import { useReadNow } from './ReadStatus';
import { Ring } from '../components/Ring';
import { addDays, dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import { examMode, examPressure, type ExamPlan } from '../domain/exam';
import { staleness, stalenessLine } from '../halo/freshness';
import { blockedLine, blockPhrase } from '../domain/blocked';
import { conceptLine, conceptWarnings } from '../domain/concepts';
import { missedLine, missedRequirement } from '../domain/requirements';
import { cleanAll } from '../domain/reqClean';
import { isNoise } from '../domain/requirements';
import { paceLine, riskLine } from '../domain/pace';
import { pileupAhead } from '../domain/pileup';
import { submissionCheck } from '../domain/confirm';
import { okayPress } from './Okay';
import { sessionTopics, topicBlocks, type SessionTopic } from '../domain/examTopics';
import { libraryDb } from '../library/db';
import { recordingsDb } from '../record/db';
import { weakSpots } from '../domain/weak';
import { QuizLink } from './Quiz';
import { AWAY_DAYS, awayDays, readLastSeen, stampLastSeen, welcomeBack } from '../domain/away';
import { finished as sundayFinished, offered as sundayOffered, shouldOfferSunday, skipped as sundaySkipped } from '../domain/sunday';
import { SundayReview } from './SundayReview';
import { WelcomeBack } from './WelcomeBack';
import { isBlocked, nowMode, openCountByDay, pickReason, rankItems, statusLine, todayDone } from '../domain/now';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useLinger } from '../ui/useLinger';
import { DailyQuestion } from './DailyQuestion';
import { HeroCard } from './HeroCard';
import { ItemDetail } from './ItemDetail';
import { useAccount } from '../auth/AccountContext';
import { trialDaysLeft, trialState } from '../config/flags';
import { receiptsLine } from '../domain/receipts';
import { TrialReceipts, useReceipts } from './TrialOffer';
import { Locked } from '../config/Locked';
import { syncPress } from '../ui/presses';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const approx = (min: number) => `~${fmtMinutes(min)}`;
/** How long the Done animation runs before the item actually leaves. Matches --dur-3. */
const LEAVE_MS = 400;

function sourceTag(item: Item, course: Course | undefined): string {
  if (item.source === 'ics') return 'from ICS export';
  if (item.source === 'halo') return 'from Halo';
  return item.source === 'parsed' ? `from ${course?.code ?? 'the'} syllabus` : 'added by me';
}

/** "Picked because it's ~2h, due tomorrow, …" → "It's ~2h, due tomorrow, …" */
const whyLine = (reason: string) => {
  const s = reason.replace(/^Picked because /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** One line: the next class and whether anything needs doing before it. */
/** Exam mode hero: the exam, the days left, and how much study is left. Replaces the normal hero; nothing stacks. */
function ExamHero({ plan, onOpen, onDone, onLog }: { plan: ExamPlan; onOpen: (i: Item) => void; onDone: (i: Item) => void; onLog: (minutes: number) => void }) {
  const { data, courseById } = useStore();
  const [logging, setLogging] = useState(false);
  const tz = data.settings.timezone;
  const course = courseById.get(plan.exam.courseId);
  const countdown = plan.daysLeft === 0 ? 'Exam today' : plan.daysLeft === 1 ? 'Exam tomorrow' : `Exam in ${plan.daysLeft} days`;
  return (
    <section className="hero hero-exam" aria-label="Exam mode">
      <div className="hero-top">
        <span className="hero-eyebrow">
          <CourseChip course={course} />
          <span className="hero-kind">Exam</span>
        </span>
        <span className="hero-framing" data-framing="exam">
          {countdown}
        </span>
      </div>
      <h2 className="hero-title">{plan.exam.label}</h2>
      <p className="hero-why">
        Study is spread over the days left, inside your hours.
        {plan.suppressed.length > 0 ? ` ${plan.suppressed.length} smaller thing${plan.suppressed.length === 1 ? '' : 's'} due in the two weeks after can wait.` : ''}
      </p>
      <p className="hero-meta">
        <span className="pill">
          {fmtDate(plan.examDay, 'long')} {fmtTime(plan.exam.dueAt, tz)}
        </span>
        <span className="pill">{plan.exam.points} pts</span>
        <span className="pill">{plan.remainingMinutes > 0 ? `${fmtMinutes(plan.remainingMinutes)} of study left` : 'study logged'}</span>
      </p>
      <div className="hero-actions">
        <a className="btn primary" href={`#/study?c=${plan.exam.courseId}`}>
          Study kit
        </a>
        <a className="btn" href={`#/tutor?c=${plan.exam.courseId}&i=${plan.exam.id}`}>
          Tutor
        </a>
        <button type="button" className="btn quiet" onClick={() => onOpen(plan.exam)}>
          Open
        </button>
      </div>
      <div className="hero-more" style={{ marginTop: 12 }}>
        {plan.remainingMinutes > 0 && !logging && (
          <button type="button" className="btn small" onClick={() => setLogging(true)}>
            Log study time
          </button>
        )}
        {logging && (
          <div className="hero-chooser" role="group" aria-label="Log study time">
            <span className="hint">Studied</span>
            {[30, 60, 90, 120].map((m) => (
              <button
                key={m}
                type="button"
                className="btn small"
                onClick={() => {
                  onLog(m);
                  setLogging(false);
                }}
              >
                {fmtMinutes(m)}
              </button>
            ))}
            <button type="button" className="hero-skip" onClick={() => setLogging(false)}>
              never mind
            </button>
          </div>
        )}
        <button type="button" className="btn small" onClick={() => onDone(plan.exam)}>
          <IconCheck /> Done
        </button>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        <span className="muted">{sourceTag(plan.exam, course)}</span>
      </p>
    </section>
  );
}

function ExamSheet({ plan, onClose, onOpen }: { plan: ExamPlan; onClose: () => void; onOpen: (i: Item) => void }) {
  return (
    <Modal title="Due before the exam" onClose={onClose}>
      <div className="modal-body">
        <ul className="item-list">
          {plan.mustDoBefore.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} showStart />
          ))}
        </ul>
      </div>
    </Modal>
  );
}

/** Which slides each study session should open: weak ground first, then what the professor flagged, then the rest. */
function useExamTopics(plan: ExamPlan | null, stats: Record<string, import('../domain/types').QuizStat> | undefined, items: Item[]): SessionTopic[] {
  const [topics, setTopics] = useState<SessionTopic[]>([]);
  const key = plan ? `${plan.exam.id}:${plan.sessions.length}` : '';
  useEffect(() => {
    if (!plan) {
      setTopics([]);
      return;
    }
    let live = true;
    Promise.all([libraryDb.listDecks(), libraryDb.allPages(), recordingsDb.list().catch(() => [])])
      .then(([decks, pages, recordings]) => {
        if (!live) return;
        const flagged = recordings.filter((r) => r.courseId === plan.exam.courseId).flatMap((r) => r.notes?.knowledge?.examFlags.map((f) => f.point) ?? []);
        const weak = [...weakSpots(plan.exam.courseId, items).map((w) => w.item.title), ...flagged];
        setTopics(sessionTopics(plan.sessions.length, topicBlocks(plan.exam.courseId, decks, pages, stats, weak)));
      })
      .catch(() => live && setTopics([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return topics;
}

/** A quiet row for the things after the one thing. */
function ThenRow({ item, onOpen, marker }: { item: Item; onOpen: (i: Item) => void; marker?: string }) {
  const { courseById, data, today } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const tz = data.settings.timezone;
  const day = dateOf(item.dueAt, tz);
  const k = diffDays(today, day);
  const when = k < 0 ? `was due ${fmtDate(day, 'short')}` : k === 0 ? 'today' : k === 1 ? 'tomorrow' : fmtDate(day, 'short');
  return (
    <li>
      <button type="button" className="row" onClick={() => onOpen(item)} style={{ '--course': color } as React.CSSProperties}>
        <span className="dot" aria-hidden />
        <span className="row-body">
          <span className="row-title">
            {marker ? <span className="muted">{marker} </span> : null}
            {item.label}
          </span>
          <span className="row-meta">
            {course?.code} · {when} · {approx(item.estimatedMinutes)}
            {item.points > 0 ? ` · ${item.points} pts` : ''}
          </span>
        </span>
        {item.status === 'done' && <IconCheck />}
      </button>
    </li>
  );
}

/**
 * Now. One thing to do, and calm. A header that answers the day, the one thing, then the two or three after it,
 * then anything that needs a word, then the trust line. The three directions (?design=a|b|c) share every piece of
 * logic and differ only in how the day is laid out; see DESIGN.md for which shipped and why.
 */
export function Now() {
  const { data, schedule, derived, today, actions, progress, previewAward, calibrate } = useStore();
  const { tier, profile } = useAccount();
  const trialDays = trialDaysLeft(profile);
  const onTrial = trialState(profile) === 'active';
  const receipts = useReceipts();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<Item | null>(null);
  const [examSheet, setExamSheet] = useState(false);
  const [finished, setFinished] = useState<{ xp: number; label: string } | null>(null);
  const [showAnyway, setShowAnyway] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const now = new Date().toISOString();
  const minuteKey = now.slice(0, 16);

  // Participation is attendance, not work: it stays in the calendar and grades, never here.
  const work = useMemo(() => data.items.filter((i) => i.type !== 'participation'), [data.items]);
  const ranked = useMemo(() => rankItems(work, schedule, now, tz), [work, schedule, tz, minuteKey]);
  const top = useLinger(ranked.slice(0, 2), work);
  const hero = top[0];
  const counts = useMemo(() => openCountByDay(work, schedule, today), [work, schedule, today]);
  const mode = useMemo(() => nowMode(work, schedule, data.settings, today, now, finished !== null), [work, schedule, data.settings, today, minuteKey, finished]);
  // Pace, not hours: one line, in place of any pressure.
  const paceText = useMemo(() => {
    const pace = paceLine(data.courses, work, schedule, today);
    const risk = riskLine(work, schedule, today, tz);
    const pile = pileupAhead(work, schedule, today);
    const concept = conceptLine(conceptWarnings(data.courses, data.items, data.settings.topicLinks ?? [], data.settings.quizStats, today, tz));
    const overdue = work.filter((i) => i.status !== 'done' && !isBlocked(i, today) && new Date(i.dueAt).getTime() < Date.now()).length;
    if (overdue >= 3) return risk ?? concept;
    return [risk ?? concept ?? pile?.line ?? pace].filter(Boolean).join(' ') || null;
  }, [data.courses, work, schedule, today]);
  const heavy = useMemo(() => pileupAhead(work, schedule, today), [work, schedule, today]);
  const sub = useMemo(() => submissionCheck(work, today, tz), [work, today, tz]);
  const clean = useMemo(() => cleanAll(data.items).items, [data.items]);
  const stale = useMemo(() => stalenessLine(staleness(data.courses, data.settings, today), data.courses.length), [data.courses, data.settings, today]);
  const chase = useMemo(() => blockedLine(work, data.courses, schedule, today, tz), [work, data.courses, schedule, today, tz]);
  const waiting = useMemo(() => work.filter((i) => i.status !== 'done' && isBlocked(i, today)), [work, today]);
  // Back after days away: one card that says what changed, then the normal screen behind one button.
  const [lastSeen] = useState(() => readLastSeen());
  const [welcomed, setWelcomed] = useState(false);
  const showWelcome = !welcomed && lastSeen !== null && awayDays(lastSeen, today) >= AWAY_DAYS;
  useEffect(() => {
    if (!showWelcome) stampLastSeen(today);
  }, [showWelcome, today]);
  const back = useMemo(() => (showWelcome && lastSeen ? welcomeBack(work, schedule, lastSeen, today) : null), [showWelcome, lastSeen, work, schedule, today]);
  // Sunday review: offered once a Sunday, waved off twice means off.
  const [sunday, setSunday] = useState(false);
  useEffect(() => {
    if (shouldOfferSunday(data.settings.sundayReview, today)) {
      actions.updateSettings({ sundayReview: sundayOffered(data.settings.sundayReview, today) });
      setSunday(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  // One sentence, one colour: "You're on track." or "2 things need you." (domain/now.ts statusLine).
  const status = statusLine(clean, today, now, tz);
  // An exam within a week reshapes the screen: exam hero, study sessions, one pressure line.
  const exam = useMemo(() => examMode(work, schedule, data.settings, today, (i) => calibrate(i).minutes), [work, schedule, data.settings, today, calibrate]);
  const examTopics = useExamTopics(exam, data.settings.quizStats, data.items);
  const logStudy = (minutes: number) => {
    if (!exam) return;
    actions.upsertItem({ ...exam.exam, estimatedMinutes: Math.max(0, exam.exam.estimatedMinutes - minutes), estimateOverridden: true, status: 'in_progress' });
  };
  const nextDeadline = Object.keys(counts).filter((d) => d >= today).sort()[0];
  const why = hero ? whyLine(pickReason(hero, work, schedule, today, now, tz, derived)) : null;

  // The day: what is due today, how much of it is done, and the time of day.
  const dueToday = useMemo(() => clean.filter((i) => i.type !== 'participation' && !isNoise(i) && dateOf(i.dueAt, tz) === today), [clean, tz, today]);
  const doneToday = dueToday.filter((i) => i.status === 'done').length;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
  const daypart = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const weekday = WEEKDAY_LONG[new Date(`${today}T12:00:00Z`).getUTCDay()];
  // "Today's done" is earned (domain/now.ts todayDone): everything due today done and nothing overdue.
  const eveningWrap = (daypart === 'evening' || daypart === 'night') && todayDone(clean, today, now, tz);
  const then = useMemo(() => ranked.filter((i) => i.id !== hero?.id && i.status !== 'done' && !isBlocked(i, today)).slice(0, 3), [ranked, hero?.id, today]);

  // "Not today" records a day, not just a skip: the item is pushed down until then and planned to start then.
  const skip = (i: Item, day: DateStr) => actions.upsertItem({ ...i, snoozedUntil: day, startByOverride: day });
  // Done: the card leaves first, then the item does. The check is the reward; nothing else moves.
  const finish = (i: Item) => {
    setFinished({ xp: previewAward(i), label: i.label });
    setShowAnyway(false);
    setLeaving(i.id);
    setTimeout(() => {
      actions.setStatus(i.id, 'done');
      setLeaving(null);
    }, LEAVE_MS);
  };
  const unblock = (i: Item) => actions.upsertItem({ ...i, blocked: null });

  const showQueue = !back && !exam && (mode.mode === 'urgent' || mode.mode === 'fine' || (mode.mode === 'enough' && showAnyway));
  const quiet = !back && !exam && (mode.mode === 'fine' || mode.mode === 'enough' || mode.mode === 'empty');
  const eveningQuiet = data.settings.eveningQuiet && hour >= 21 && !work.some((i) => i.status !== 'done' && new Date(i.dueAt).getTime() < Date.now());

  // Every warning in one place, one line each. Order: what costs points first, then what is waiting or stale.
  const [coach, setCoach] = useState(false);
  const headsUp: HeadsUpLine[] = [];
  const reading = useReadStatus();
  const readNow = useReadNow();
  if (reading.running && reading.progress) headsUp.push({ key: 'reading', text: `Reading announcement ${reading.progress.done} of ${reading.progress.total}…` });
  else if (reading.waiting)
    headsUp.push({
      key: 'read-waiting',
      tone: 'soon',
      text: (
        <>
          {reading.waiting.count} announcements are waiting to be read.{' '}
          <button type="button" className="hero-inline" onClick={readNow}>
            Read them now
          </button>
        </>
      ),
    });
  else if (reading.outcome && (reading.outcome.failed > 0 || reading.outcome.noKey || reading.outcome.locked || reading.outcome.ledgerError))
    headsUp.push({
      key: 'read-failed',
      tone: reading.outcome.locked && !reading.outcome.noKey ? null : 'late',
      text: reading.outcome.ledgerError ? (
        'The record of what has been read could not be opened; nothing was read.'
      ) : reading.outcome.locked && !reading.outcome.noKey ? (
        <>
          {reading.outcome.todo} announcement{reading.outcome.todo === 1 ? ' is' : 's are'} waiting to be read; reading them is part of Pro. <a href="#/inbox">Inbox</a>
        </>
      ) : reading.outcome.noKey ? (
        `${reading.outcome.todo} announcement${reading.outcome.todo === 1 ? ' is' : 's are'} unread: this build has no AI connection.`
      ) : (
        `${reading.outcome.failed} announcement${reading.outcome.failed === 1 ? '' : 's'} could not be read; the next sync tries again.`
      ),
    });
  const missed = missedRequirement(clean, today, tz);
  if (sub.line) headsUp.push({ key: 'sub', tone: sub.level === 'alarm' ? 'late' : 'soon', text: sub.line });
  if (chase)
    headsUp.push({
      key: 'chase',
      tone: 'soon',
      text: (
        <>
          <button type="button" className="hero-inline" onClick={() => setOpen(chase.item)}>
            {chase.text}
          </button>{' '}
          <button type="button" className="hero-inline" onClick={() => unblock(chase.item)}>
            It's unblocked now
          </button>
        </>
      ),
    });
  if (missed)
    headsUp.push({
      key: 'missed',
      text: (
        <>
          {missedLine(missed, data.courses, today)}{' '}
          <button type="button" className="hero-inline" onClick={() => setOpen(missed.item)}>
            Open it
          </button>
        </>
      ),
    });
  if (heavy && !exam && !back) headsUp.push({ key: 'heavy', text: heavy.line });
  if (!back && !exam && paceText && paceText !== heavy?.line && !eveningQuiet) headsUp.push({ key: 'pace', text: paceText });
  if (waiting.length > 0 && !chase)
    headsUp.push({
      key: 'waiting',
      text: (
        <>
          {waiting.length === 1 ? `${waiting[0].label} is ${blockPhrase(waiting[0], tz)}; back ${fmtDate(waiting[0].blocked!.until, 'short')}.` : `${waiting.length} things are waiting on someone else; the first is back ${fmtDate([...waiting].sort((a, b) => a.blocked!.until.localeCompare(b.blocked!.until))[0].blocked!.until, 'short')}.`}{' '}
          <button type="button" className="hero-inline" onClick={() => setOpen(waiting[0])}>
            Open
          </button>
        </>
      ),
    });
  if (stale && data.courses.length > 0)
    headsUp.push({
      key: 'stale',
      text: (
        <>
          {stale}{' '}
          <button type="button" className="hero-inline" onClick={() => syncPress.current?.()}>
            Sync now
          </button>
        </>
      ),
    });
  // During the trial, one honest line on what Max did this week, from the student's own records.
  const maxLine = onTrial && receipts && receipts.announcementsRead + receipts.requirementsFound + receipts.lectureNotes + receipts.coachAnswers > 0 ? receiptsLine(receipts) : null;
  if (maxLine && !(trialDays !== null && trialDays <= 1)) headsUp.push({ key: 'max', text: `Max did this for you. ${maxLine.replace(/^Max this week: /, 'This week: ')}` });
  if (trialDays !== null && trialDays <= 3)
    headsUp.push({
      key: 'trial',
      text: (
        <>
          Your Max trial ends {trialDays === 0 ? 'today' : `in ${trialDays} day${trialDays === 1 ? '' : 's'}`}. <a href="#/you?s=plan">See plans</a>
        </>
      ),
    });

  // Keyed on the item: when one is done the next slides in as a new card.
  const heroCard = hero && <HeroCard key={hero.id} item={hero} optional={mode.mode !== 'urgent'} why={why} leaving={leaving === hero.id} onOpen={setOpen} onSkip={skip} onDone={finish} />;

  const calmEnough = (
    <section className="calm" data-tone="enough" aria-label="Done for today">
      <HaloDraw size={96} />
      <h2 className="calm-title">That's it for today.</h2>
      <p className="calm-text">
        {finished ? `${finished.label} done, +${finished.xp} XP. ` : ''}
        {progress.dailyStreak > 0 ? `${progress.dailyStreak}-day streak. ` : ''}
        {nextDeadline && nextDeadline > today ? `Nothing due until ${WEEKDAY_LONG[new Date(nextDeadline + 'T12:00:00Z').getUTCDay()]}.` : ''}
      </p>
      <button type="button" className="calm-more" onClick={() => setShowAnyway(true)}>
        Show what's next anyway
      </button>
    </section>
  );
  const calmFine = hero && (
    <section className="calm" data-tone="fine" aria-label="You're good">
      <Ring value={1} max={1} label="Nothing due soon" />
      <h2 className="calm-title">You're good.</h2>
      <p className="calm-text">
        Nothing due for {mode.mode === 'fine' ? mode.daysUntilNext : 0} days. Next worth starting: {hero.label}, {approx(hero.estimatedMinutes)}, due{' '}
        {WEEKDAY_LONG[new Date((schedule.byItem[hero.id]?.deadlineDay ?? dateOf(hero.dueAt, tz)) + 'T12:00:00Z').getUTCDay()]}.
      </p>
    </section>
  );

  const primary = back ? (
    <WelcomeBack summary={back} first={hero ?? null} onOpen={setOpen} onShowAll={() => setWelcomed(true)} />
  ) : exam ? (
    <>
      <ExamHero plan={exam} onOpen={setOpen} onDone={finish} onLog={logStudy} />
      <section className="then" aria-label="Study plan">
        <h3 className="section-title">Study plan</h3>
        {exam.sessions.length === 0 ? (
          <p className="hint">{exam.remainingMinutes > 0 ? 'No study hours left before the exam at your current capacity.' : 'All the planned study is logged. Review, then rest.'}</p>
        ) : (
          <ul className="exam-sessions">
            {exam.sessions.slice(0, 3).map((s, idx) => (
              <li key={s.day} className="exam-session" data-today={s.day === today}>
                <span>
                  {s.label}
                  {examTopics[idx] && (
                    <span className="exam-topic" data-weak={examTopics[idx].weak}>
                      {' '}
                      · {examTopics[idx].text} {examTopics[idx].topic && <QuizLink courseId={exam.exam.courseId} topic={examTopics[idx].topic} label="practice" />}
                    </span>
                  )}
                </span>
                {s.day === today && (
                  <button type="button" className="btn small" onClick={() => logStudy(s.minutes)}>
                    Log {fmtMinutes(s.minutes)}
                  </button>
                )}
              </li>
            ))}
            {exam.sessions.length > 3 && <li className="exam-session muted">+ {exam.sessions.length - 3} more session{exam.sessions.length - 3 === 1 ? '' : 's'}</li>}
          </ul>
        )}
        {examPressure(exam) && (
          <p className="pressure">
            {exam.mustDoBefore.length > 0 ? (
              <button type="button" className="hero-inline" onClick={() => setExamSheet(true)}>
                {examPressure(exam)}
              </button>
            ) : (
              examPressure(exam)
            )}
          </p>
        )}
      </section>
    </>
  ) : mode.mode === 'empty' ? (
    data.courses.length === 0 ? (
      <EmptyState art="halo">
        <p>
          <b>Your day, from Halo.</b>
        </p>
        <p>Sync once and this screen shows the one thing to do now, what is due today, and how the week looks.</p>
        <p className="empty-actions">
          <button type="button" className="btn primary" onClick={() => syncPress.current?.()}>
            Sync Halo
          </button>
          <a className="btn" href="#/you?s=classes">
            Add a class by hand
          </a>
        </p>
      </EmptyState>
    ) : (
      calmEnough
    )
  ) : mode.mode === 'enough' && !showAnyway ? (
    calmEnough
  ) : mode.mode === 'fine' ? (
    <>
      {calmFine}
      {showQueue && heroCard}
    </>
  ) : showQueue && hero ? (
    heroCard
  ) : null;

  const walled = useNeedsPlan();
  // Keyboard on Now: d done, n not today, s start, o open. Only when no field or sheet has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hero || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('.modal-backdrop')) return;
      const k = e.key.toLowerCase();
      if (k === 'd') finish(hero);
      else if (k === 'n') skip(hero, addDays(today, 1));
      else if (k === 's') actions.upsertItem({ ...hero, startedAt: hero.startedAt ?? new Date().toISOString(), status: hero.status === 'done' ? hero.status : 'in_progress' });
      else if (k === 'o') setOpen(hero);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id, today]);
  return (
    <div className="now">
      {walled && <PlanWall />}
      {trialDays !== null && trialDays <= 1 && <TrialReceipts />}
      <header className="now-head">
        <div>
          <p className="eyebrow">
            {weekday} {daypart}
          </p>
          <h1 className="now-title" data-tone={status.tone ?? undefined}>
            <button type="button" className="now-status-btn" onClick={() => okayPress.current?.()} title="Am I okay?">
              {eveningWrap ? "Today's done." : status.text}
            </button>
          </h1>
        </div>
        {dueToday.length > 0 && (
          <div className="now-ring">
            <Ring value={doneToday} max={dueToday.length} label={`${doneToday} of ${dueToday.length} due today done`} />
            <span className="now-ring-label">
              {doneToday}/{dueToday.length}
            </span>
          </div>
        )}
      </header>
      {primary}

      {then.length > 0 && !back && !exam && (mode.mode === 'urgent' || showAnyway) && (
        <section className="then" aria-label="Then">
          <h3 className="section-title">Then</h3>
          <ul className="item-list">
            {then.map((i) => (
              <ThenRow key={i.id} item={i} onOpen={setOpen} />
            ))}
          </ul>
        </section>
      )}

      {quiet && !eveningWrap && <DailyQuestion />}

      <aside className="now-side">
        <HeadsUp lines={headsUp} />
        {data.courses.length > 0 && (
          <button type="button" className="coach-ask" onClick={() => setCoach(true)} aria-haspopup="dialog">
            <IconNow />
            <span>Ask what to do next</span>
            <kbd>⏎</kbd>
          </button>
        )}
      </aside>
      {coach && (
        <Modal title="Coach" onClose={() => setCoach(false)} side>
          <Locked feature="aiChat" tier={tier} compact>
            <ChatCard />
          </Locked>
        </Modal>
      )}

      {sunday && (
        <SundayReview
          onOpen={(i) => {
            setSunday(false);
            setOpen(i);
          }}
          onClose={() => {
            actions.updateSettings({ sundayReview: sundaySkipped(data.settings.sundayReview, today) });
            setSunday(false);
          }}
          onDone={() => {
            actions.updateSettings({ sundayReview: sundayFinished(data.settings.sundayReview, today) });
            setSunday(false);
          }}
        />
      )}
      {examSheet && exam && <ExamSheet plan={exam} onClose={() => setExamSheet(false)} onOpen={(i) => { setExamSheet(false); setOpen(i); }} />}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
