import { useEffect, useMemo, useState } from 'react';
import { ChatCard } from '../chat/ChatCard';
import { ItemRow } from '../components/ItemRow';
import { Modal } from '../components/Modal';
import { CourseChip } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconCheck } from '../components/Icons';
import { dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import { nextClassPrep, nextMeeting } from '../domain/nextClass';
import { examMode, examPressure, type ExamPlan } from '../domain/exam';
import { checkDue, verificationLine } from '../halo/verification';
import { checkHaloPress } from '../halo/checkState';
import { announceDb, unreadLine, type StoredAnnouncement } from '../halo/announce';
import { SYNC_EVENT } from '../ingest/auto';
import { staleness, stalenessLine } from '../halo/freshness';
import { blockedLine, blockPhrase } from '../domain/blocked';
import { conceptLine, conceptWarnings } from '../domain/concepts';
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
import { isBlocked, nowMode, openCountByDay, rankItems, termProgress, todayLine } from '../domain/now';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useLinger } from '../ui/useLinger';
import { DailyQuestion } from './DailyQuestion';
import { HeroCard } from './HeroCard';
import { ItemDetail } from './ItemDetail';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const approx = (min: number) => `~${fmtMinutes(min)}`;

function sourceTag(item: Item, course: Course | undefined): string {
  if (item.source === 'ics') return 'from ICS export';
  if (item.source === 'halo') return 'from Halo';
  return item.source === 'parsed' ? `from ${course?.code ?? 'the'} syllabus` : 'added by me';
}

/** One line: the next class and whether anything needs doing before it. Not a card; the hero is the card. */
function NextClassLine({ heroId, onOpen }: { heroId: string | undefined; onOpen: (i: Item) => void }) {
  const { data, schedule, nudges, today, courseById } = useStore();
  const tz = data.settings.timezone;
  const now = new Date().toISOString();
  const meeting = useMemo(() => nextMeeting(data.courses, now, tz), [data.courses, now.slice(0, 16), tz]);
  if (!meeting) return null;
  const prep = nextClassPrep(meeting, data.items, schedule, nudges, today, tz, heroId);
  const course = courseById.get(meeting.course.id);
  const k = diffDays(today, meeting.day);
  const when = `${k === 0 ? 'today' : k === 1 ? 'tomorrow' : fmtDate(meeting.day, 'long').split(',')[0]} ${fmtTime(meeting.startAt, tz)}`;
  return (
    <p className="nextclass-line mono" aria-label="Next class">
      <span className="muted">Next class</span>
      <CourseChip course={course} />
      <span>{when}</span>
      <span className="muted">·</span>
      {prep.item ? (
        <button type="button" className="nextclass-link" onClick={() => onOpen(prep.item!)}>
          {prep.text}
        </button>
      ) : (
        <span className="muted">{prep.text}</span>
      )}
    </p>
  );
}

/** Exam mode hero: the exam, the days left, and how much study is left. Replaces the normal hero; nothing stacks. */
function ExamHero({ plan, onOpen, onDone, onLog }: { plan: ExamPlan; onOpen: (i: Item) => void; onDone: (i: Item) => void; onLog: (minutes: number) => void }) {
  const { data, courseById } = useStore();
  const [logging, setLogging] = useState(false);
  const tz = data.settings.timezone;
  const course = courseById.get(plan.exam.courseId);
  const countdown = plan.daysLeft === 0 ? 'Exam today' : plan.daysLeft === 1 ? 'Exam tomorrow' : `Exam in ${plan.daysLeft} days`;
  return (
    <section className="hero hero-exam" aria-label="Exam mode">
      <div className="hero-eyebrow">
        <span className="hero-framing" data-framing="exam">
          {countdown}
        </span>
        <CourseChip course={course} />
      </div>
      <h1 className="hero-title">{plan.exam.label}</h1>
      <p className="hero-meta">
        <span>
          {fmtDate(plan.examDay, 'long')} {fmtTime(plan.exam.dueAt, tz)}
        </span>
        <span>{plan.exam.points} pts</span>
        <span>{plan.remainingMinutes > 0 ? `${fmtMinutes(plan.remainingMinutes)} of study left` : 'study logged'}</span>
      </p>
      <p className="hero-why">
        Exam mode. Study is spread over the days left, inside your hours.
        {plan.suppressed.length > 0 ? ` ${plan.suppressed.length} smaller thing${plan.suppressed.length === 1 ? '' : 's'} due in the two weeks after wait.` : ''}
      </p>
      <p className="hero-starter">
        <a className="btn small" href={`#/study?c=${plan.exam.courseId}`}>
          Study kit
        </a>
        <a className="btn small" href={`#/tutor?c=${plan.exam.courseId}&i=${plan.exam.id}`}>
          Tutor
        </a>
      </p>
      <div className="hero-actions">
        <button type="button" className="btn primary hero-btn" onClick={() => onDone(plan.exam)}>
          <IconCheck /> Done
        </button>
        <button type="button" className="btn hero-btn" onClick={() => onOpen(plan.exam)}>
          Open
        </button>
        {plan.remainingMinutes > 0 && !logging && (
          <button type="button" className="hero-skip" onClick={() => setLogging(true)}>
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
            <button type="button" className="hero-skip" style={{ flexBasis: 'auto', padding: 0 }} onClick={() => setLogging(false)}>
              never mind
            </button>
          </div>
        )}
      </div>
      <p className="hero-source">
        <span className="tag-source">{sourceTag(plan.exam, course)}</span>
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

/**
 * Now: one status line, one piece of work with everything needed to start it, one pace line, and the trust lines.
 * Never a list. What is next lives in the calendar; what is blocked waits off-screen until it plausibly clears.
 */
export function Now() {
  const { data, schedule, today, term, actions, progress, previewAward, calibrate } = useStore();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<Item | null>(null);
  const [examSheet, setExamSheet] = useState(false);
  const [finished, setFinished] = useState<{ xp: number; label: string } | null>(null);
  const [showAnyway, setShowAnyway] = useState(false);
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
    const risk = riskLine(work, schedule, today);
    const pile = pileupAhead(work, schedule, today);
    const concept = conceptLine(conceptWarnings(data.courses, data.items, data.settings.topicLinks ?? [], data.settings.quizStats, today, tz));
    // A big untouched item first; then a weak concept that material a few weeks out assumes; then the pileup; then pace.
    // With several things already past their date, a sentence about next month is noise and the status line has said
    // enough — but a concept the next quiz leans on is not noise, so it still gets through.
    const overdue = work.filter((i) => i.status !== 'done' && !isBlocked(i, today) && new Date(i.dueAt).getTime() < Date.now()).length;
    if (overdue >= 3) return risk ?? concept;
    return [risk ?? concept ?? pile?.line ?? pace].filter(Boolean).join(' ') || null;
  }, [data.courses, work, schedule, today]);
  const sub = useMemo(() => submissionCheck(work, today, tz), [work, today, tz]);
  // Announcements carry the week's real instructions at GCU, so an unread one gets one quiet line and nothing more.
  const [news, setNews] = useState<StoredAnnouncement[]>([]);
  const [newsTick, setNewsTick] = useState(0);
  useEffect(() => {
    // A sync writes announcements straight to their own store, which no React state watches: without this the line
    // would not appear until the next reload.
    const again = () => setNewsTick((n) => n + 1);
    window.addEventListener(SYNC_EVENT, again);
    return () => window.removeEventListener(SYNC_EVENT, again);
  }, []);
  useEffect(() => {
    let live = true;
    announceDb
      .list()
      .then((l) => live && setNews(l.filter((a) => data.courses.some((c) => c.id === a.courseId))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data.courses, today, newsTick]);
  const unread = useMemo(() => unreadLine(news, data.courses, tz), [news, data.courses, tz]);
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
  const status = todayLine(work, schedule, today, now, tz);
  // An exam within a week reshapes the screen: exam hero, study sessions, one pressure line.
  const exam = useMemo(() => examMode(work, schedule, data.settings, today, (i) => calibrate(i).minutes), [work, schedule, data.settings, today, calibrate]);
  const examTopics = useExamTopics(exam, data.settings.quizStats, data.items);
  const logStudy = (minutes: number) => {
    if (!exam) return;
    actions.upsertItem({ ...exam.exam, estimatedMinutes: Math.max(0, exam.exam.estimatedMinutes - minutes), estimateOverridden: true, status: 'in_progress' });
  };
  const pace = termProgress(data.items, term, today);
  const syncedAt = data.settings.syncedAt ?? null;
  const syncAge = syncedAt ? Math.floor((Date.now() - new Date(syncedAt).getTime()) / 86_400_000) : null;
  const nextDeadline = Object.keys(counts).filter((d) => d >= today).sort()[0];

  // "Not today" records a day, not just a skip: the item is pushed down until then and planned to start then.
  const skip = (i: Item, day: DateStr) => actions.upsertItem({ ...i, snoozedUntil: day, startByOverride: day });
  const finish = (i: Item) => {
    setFinished({ xp: previewAward(i), label: i.label });
    setShowAnyway(false);
    actions.setStatus(i.id, 'done');
  };
  const unblock = (i: Item) => actions.upsertItem({ ...i, blocked: null });

  const showQueue = !back && !exam && (mode.mode === 'urgent' || mode.mode === 'fine' || (mode.mode === 'enough' && showAnyway));
  const quiet = !back && !exam && (mode.mode === 'fine' || mode.mode === 'enough' || mode.mode === 'empty');

  return (
    <div className="now">
      <p className="now-status">
        <span className="mono muted">{fmtDate(today, 'long')}</span>
        <button type="button" className="now-status-btn" onClick={() => okayPress.current?.()} title="Am I okay?">
          {status}
        </button>
      </p>

      {chase && (
        <p className="now-chase">
          <button type="button" className="now-chase-text" onClick={() => setOpen(chase.item)}>
            {chase.text}
          </button>{' '}
          <button type="button" className="hero-inline" onClick={() => unblock(chase.item)}>
            it's unblocked now
          </button>
        </p>
      )}

      {back && <WelcomeBack summary={back} first={hero ?? null} onOpen={setOpen} onShowAll={() => setWelcomed(true)} />}

      {!back && <NextClassLine heroId={exam?.exam.id ?? hero?.id} onOpen={setOpen} />}

      {!back && exam && <ExamHero plan={exam} onOpen={setOpen} onDone={finish} onLog={logStudy} />}
      {!back && exam && (
        <section className="then" aria-label="Study plan">
          <h2 className="section-title">study plan</h2>
          {exam.sessions.length === 0 ? (
            <p className="hint">{exam.remainingMinutes > 0 ? 'No study hours left before the exam at your current capacity.' : 'All the planned study is logged. Review, then rest.'}</p>
          ) : (
            <ul className="then-list exam-sessions">
              {exam.sessions.slice(0, 3).map((s, idx) => (
                <li key={s.day} className="exam-session" data-today={s.day === today}>
                  <span className="mono">
                    {s.label}
                    {examTopics[idx] && (
                      <span className="exam-topic" data-weak={examTopics[idx].weak}>
                        {' '}
                        · {examTopics[idx].text}{' '}
                        {examTopics[idx].topic && <QuizLink courseId={exam.exam.courseId} topic={examTopics[idx].topic} label="practice" />}
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
        </section>
      )}
      {!back && exam && examPressure(exam) && (
        <p className="pressure">
          {exam.mustDoBefore.length > 0 ? (
            <button type="button" className="pressure-link" onClick={() => setExamSheet(true)}>
              {examPressure(exam)}
            </button>
          ) : (
            examPressure(exam)
          )}
        </p>
      )}

      {!back && !exam && mode.mode === 'empty' && <EmptyState>Nothing open. Import a syllabus from Settings, or enjoy the quiet.</EmptyState>}

      {!back && !exam && mode.mode === 'enough' && !showAnyway && (
        <section className="calm" data-tone="enough" aria-label="Done for today">
          <h1 className="calm-title">That's enough for today.</h1>
          <p className="calm-text">
            You're ahead. {finished ? `${finished.label} done, +${finished.xp} XP.` : ''}
            {progress.dailyStreak > 0 ? ` ${progress.dailyStreak}-day streak.` : ''}
            {nextDeadline && nextDeadline > today ? ` Nothing due until ${WEEKDAY_LONG[new Date(nextDeadline + 'T12:00:00Z').getUTCDay()]}.` : ''}
          </p>
          <button type="button" className="calm-more" onClick={() => setShowAnyway(true)}>
            show what's next anyway
          </button>
        </section>
      )}

      {!back && !exam && mode.mode === 'fine' && hero && (
        <section className="calm" data-tone="fine" aria-label="You're good">
          <h1 className="calm-title">You're good.</h1>
          <p className="calm-text">
            Nothing due for {mode.daysUntilNext} days. Next thing worth starting is {hero.label} — {approx(hero.estimatedMinutes)}, due{' '}
            {WEEKDAY_LONG[new Date((schedule.byItem[hero.id]?.deadlineDay ?? dateOf(hero.dueAt, tz)) + 'T12:00:00Z').getUTCDay()]}.
          </p>
        </section>
      )}

      {showQueue && hero && <HeroCard item={hero} optional={mode.mode !== 'urgent'} onOpen={setOpen} onSkip={skip} onDone={finish} />}

      {quiet && <DailyQuestion />}

      {!back && !exam && paceText && !(data.settings.eveningQuiet && Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date())) >= 21 && !work.some((i) => i.status !== 'done' && new Date(i.dueAt).getTime() < Date.now())) && <p className="pace mono">{paceText}</p>}

      <div className="term-progress" role="img" aria-label={`${pace.pct}% of the term's points banked, ${pace.elapsedPct}% of the term elapsed`}>
        <span className="term-progress-track">
          <span className="banked" style={{ width: `${pace.pct}%` }} />
          <span className="elapsed" style={{ left: `${pace.elapsedPct}%` }} />
        </span>
        <span className="mono muted">
          {pace.pct}% banked · {pace.elapsedPct}% of the term elapsed
          {syncedAt && syncAge !== null && syncAge > 10 ? ` · assignments last synced ${syncAge} days ago` : ''}
        </span>
      </div>

      {waiting.length > 0 && !chase && (
        <p className="now-waiting mono muted">
          {waiting.length === 1 ? `${waiting[0].label} is ${blockPhrase(waiting[0], tz)}; back ${fmtDate(waiting[0].blocked!.until, 'short')}.` : `${waiting.length} things are waiting on someone else; the first is back ${fmtDate([...waiting].sort((a, b) => a.blocked!.until.localeCompare(b.blocked!.until))[0].blocked!.until, 'short')}.`}{' '}
          <button type="button" className="hero-inline" onClick={() => setOpen(waiting[0])}>
            open
          </button>
        </p>
      )}

      {unread && (
        <p className="now-news mono">
          <a className="now-news-link" href={`#/news?a=${unread.first.id}`}>
            {unread.text}
          </a>
        </p>
      )}

      {(() => {
        const v = verificationLine(data.settings.haloChecks, data.courses, data.items, today, tz);
        const due = checkDue(data.settings.haloChecks, today, tz);
        if (stale) {
          return (
            <p className="verify mono" data-level="amber">
              {stale} <span className="muted">{v.text}</span>
            </p>
          );
        }
        if (sub.line && !due) {
          return (
            <p className="verify mono" data-level={sub.level === 'alarm' ? 'alarm' : sub.level}>
              {sub.line} <span className="muted">{v.text}</span>
            </p>
          );
        }
        return due ? (
          <p className="verify mono" data-level="amber">
            <button type="button" className="verify-nudge" onClick={() => checkHaloPress.current?.('all')}>
              Time to check Halo.
            </button>{' '}
            <span className="muted">{v.text}</span>
          </p>
        ) : (
          <p className="verify mono" data-level={v.level}>
            {v.text}
          </p>
        );
      })()}

      <ChatCard />
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
