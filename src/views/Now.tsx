import { ExamWeekCard } from '../winback/ExamWeekCard';
import { NotifyReask } from './NotifyReask';
import { InviteLine, InviteNowCard } from './InviteNowCard';
import { ParticipationWeek } from './ParticipationWeek';
import { isParticipation } from '../domain/participation';
import { afterDone, arrange, emptySkips, forDay, skip, unskip, type SkipState } from '../domain/skips';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconCheck, IconNow } from '../components/Icons';
import { HeadsUp, type HeadsUpLine } from './HeadsUp';
import { HaloDraw } from '../components/HaloDraw';
import { useReadStatus } from '../halo/backgroundRead';
import { readDoneLine } from '../halo/autoRead';
import { useReadNow } from './ReadStatus';
import { Ring } from '../components/Ring';
import { addDays, dateOf, diffDays, fmtDate, fmtMinutes } from '../domain/dates';
import { staleness, stalenessLine } from '../halo/freshness';
import { blockedLine, blockPhrase, makeBlock } from '../domain/blocked';
import { conceptLine, conceptWarnings } from '../domain/concepts';
import { missedLine, missedRequirement, missedShort } from '../domain/requirements';
import { cleanAll } from '../domain/reqClean';
import { isNoise } from '../domain/requirements';
import { isQuietPast } from '../domain/submission';
import { paceLine, riskLine } from '../domain/pace';
import { pileupAhead } from '../domain/pileup';
import { submissionCheck } from '../domain/confirm';
import { okayPress } from './Okay';
import { awayDays, readLastSeen, stampLastSeen } from '../domain/away';
import { finished as sundayFinished, offered as sundayOffered, shouldOfferSunday, skipped as sundaySkipped } from '../domain/sunday';
import { SundayReview } from './SundayReview';
import { isOpen } from '../onboarding/state';
import { maxOpen } from '../onboarding/maxState';
import { isBlocked, nowMode, openCountByDay, pickReason, rankItems, statusLine, todayDone } from '../domain/now';
import type { DateStr, Item } from '../domain/types';
import { useAccountChecked, useStore } from '../storage/store';
import { useLinger } from '../ui/useLinger';
import { DailyQuestion } from './DailyQuestion';
import { HeroCard, type NotNow } from './HeroCard';
import { HaloJump } from '../components/HaloJump';
import { ItemDetail } from './ItemDetail';
import { useAccount } from '../auth/AccountContext';
import { trialDaysLeft, trialState } from '../config/flags';
import { receiptsLine } from '../domain/receipts';
import { TRIAL } from '../config/tiers';
import { TrialOffer, useReceipts } from './TrialOffer';
import { TrialReminder } from './TrialStatus';
import { ConnectHaloCard, useNeverSynced } from '../onboarding/Setup';
import { joy, useSettled } from '../joy/JoyHost';
import { CLEAR_MOMENT } from '../joy/joy';
import { WrapCard } from '../joy/WrapCard';
import { syncPress } from '../ui/presses';
import { SyncedLine } from './SyncedLine';
import { RatePrompt } from './RatePrompt';
import { SinceLastLooked, useSinceLastLooked } from './SinceLastLooked';
import { WelcomeBackCard } from './WelcomeBackCard';
import { SyncReminder, useSyncReminder } from './SyncReminder';
import { CaughtCard } from './trialEnd/CaughtCard';
import { extSetupDue } from '../onboarding/extSetup';
import { isTouchDevice } from '../ui/device';
import { installedVersion, useExtension } from '../config/extension';
import { isIos, isStandalone } from '../notify/push';
import { planOf } from '../config/tiers';
import { AsOf } from './PlanWall';
import { FriendAsk } from './FriendAsk';

const HOME_NUDGE_KEY = 'school-dashboard:home-screen-nudge';
const readNudge = (): boolean => {
  try {
    return localStorage.getItem(HOME_NUDGE_KEY) === 'done';
  } catch {
    return true;
  }
};

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const approx = (min: number) => `~${fmtMinutes(min)}`;
/** How long the Done animation runs before the item actually leaves. Matches --dur-3. */
const LEAVE_MS = 400;
/** The card slides aside quicker for Not now than it leaves for Done. */
const SKIP_MS = 220;


/** "Picked because it's ~2h, due tomorrow, …" → "It's ~2h, due tomorrow, …" */
const whyLine = (reason: string) => {
  const s = reason.replace(/^Picked because /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** One line: the next class and whether anything needs doing before it. */

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
            {course?.code} · {when}
            <AsOf item={item} />
            {/* A test's "time" is study time, which is not Now's business (2026-10-24). */}
            {item.type !== 'exam' && item.type !== 'quiz' && <> · {approx(item.estimatedMinutes)}</>}
            {item.points > 0 ? ` · ${item.points} pts` : ''}
            {(item.requirements ?? []).some((r) => !r.done) ? ` · ${(item.requirements ?? []).filter((r) => !r.done).length} part${(item.requirements ?? []).filter((r) => !r.done).length === 1 ? '' : 's'} from announcements` : ''}
          </span>
        </span>
        {item.status === 'done' && <IconCheck />}
      </button>
      <HaloJump item={item} course={course} />
    </li>
  );
}

/**
 * Now. One thing to do, and calm. A header that answers the day, the one thing, then the two or three after it,
 * then anything that needs a word, then the trust line. The three directions (?design=a|b|c) share every piece of
 * logic and differ only in how the day is laid out; see DESIGN.md for which shipped and why.
 */
const SKIPS_KEY = 'school-dashboard:skips';

export function Now() {
  const { data, schedule, derived, today, actions, progress, previewAward, justDone } = useStore();
  const { profile, auth } = useAccount();
  const neverSynced = useNeverSynced();
  // One sync prompt at a time: while the reminder is up, the synced line (its Sync now, the paused note) waits.
  const reminding = !!useSyncReminder();
  const trialDays = trialDaysLeft(profile);
  const onTrial = trialState(profile) === 'active';
  const trialAvailable = auth.configured && trialState(profile) === 'available';
  const receipts = useReceipts();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<Item | null>(null);
  const [finished, setFinished] = useState<{ xp: number; label: string } | null>(null);
  const [showAnyway, setShowAnyway] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [sliding, setSliding] = useState(false);
  // A tab left open: the clock moves without a touch, so a thing that becomes due, late, or "today" shows as such.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date().toISOString();
  const minuteKey = now.slice(0, 16);

  // Participation is attendance, not work: it stays in the calendar, grades and its own line, never the hero or Then
  // (Halo's PARTICIPATION type, or "participation" in the title: CHM-113's daily ones are discussions in Halo).
  // Past work with no Halo submission (an in-class quiz, an ALEKS set: domain/submission.ts) leaves Now, Then and every
  // overdue count once its date passes (George, 2026-10-24); Calendar and the class page still show it.
  const work = useMemo(() => data.items.filter((i) => !isParticipation(i) && !isQuietPast(i, Date.parse(now))), [data.items, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Not now as a quick skip (domain/skips.ts): today's skips, on this device, reset with the day.
  const [skips, setSkipsState] = useState<SkipState>(() => {
    try {
      return forDay(JSON.parse(localStorage.getItem(SKIPS_KEY) ?? 'null') as SkipState | null, today);
    } catch {
      return emptySkips(today);
    }
  });
  const setSkips = (next: SkipState) => {
    setSkipsState(next);
    try {
      localStorage.setItem(SKIPS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: it still holds for this visit */
    }
  };
  const todaySkips = skips.day === today ? skips : emptySkips(today);
  const arranged = useMemo(() => arrange(rankItems(work, schedule, now, tz), todaySkips), [work, schedule, tz, minuteKey, todaySkips]);
  const ranked = useMemo(() => [...arranged.ahead, ...arranged.bench], [arranged]);
  const skippedRow = arranged.row;
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
  const clean = useMemo(() => cleanAll(data.items.filter((i) => !isQuietPast(i, Date.parse(now)))).items, [data.items, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const checked = useAccountChecked();
  const stale = useMemo(() => (checked ? stalenessLine(staleness(data.courses, data.settings, today), data.courses.length) : null), [checked, data.courses, data.settings, today]);
  const chase = useMemo(() => blockedLine(work, data.courses, schedule, today, tz), [work, data.courses, schedule, today, tz]);
  const waiting = useMemo(() => work.filter((i) => i.status !== 'done' && isBlocked(i, today)), [work, today]);
  // Back after days away: one card that says what changed, then the normal screen behind one button.
  // "Days away" is the account's, not this device's (George, 2026-10-12: a phone opened after ten days said "10 days away"
  // while the laptop was used daily): the later of this device's last open and the account's (any device), read once
  // the account's copy is here, and only then stamped as today.
  const [deviceSeen] = useState(() => readLastSeen());
  const accountSeen = useRef<DateStr | null | undefined>(undefined);
  if (checked && accountSeen.current === undefined) accountSeen.current = data.settings.lastSeenDay ?? null;
  const lastSeen = !checked ? null : [deviceSeen, accountSeen.current ?? null].filter((d): d is DateStr => !!d).sort().pop() ?? null;
  // A day or more away (George, 2026-10-22): a short card at the top of Now, once per return; Now stays right below it
  // (it replaced the screen that stood in front of Now after five days away). The return is read once, then today is
  // stamped as seen, so a reload the same day does not welcome anyone again.
  const awayRef = useRef<number | null>(null);
  if (checked && awayRef.current === null) awayRef.current = lastSeen ? awayDays(lastSeen, today) : 0;
  const [returnClosed, setReturnClosed] = useState(false);
  const showReturn = checked && (awayRef.current ?? 0) >= 1 && !returnClosed;
  useEffect(() => {
    if (!checked) return;
    stampLastSeen(today);
    if (data.settings.lastSeenDay !== today) actions.updateSettings({ lastSeenDay: today });
  }, [checked, today, data.settings.lastSeenDay, actions]);
  const sinceLooked = useSinceLastLooked();
  // Sunday review: offered once a Sunday, waved off twice means off. Never with nothing to review, and never
  // under the first-run screens: its backdrop sits above them and a new student on a Sunday could not tap Sign up.
  const [sunday, setSunday] = useState(false);
  // The extension setup is a first-run screen too (2026-10-04): the review waits for the next open rather than sit on it.
  const extInfo = useExtension();
  const extDue = !!extSetupDue({ settings: data.settings, browser: extInfo.browser, touch: isTouchDevice(), installed: installedVersion(), storeUrl: extInfo.url });
  const firstRun = isOpen(data.settings.onboarding) || maxOpen(data.settings.maxOnboarding) || extDue;
  useEffect(() => {
    if (work.length === 0 || firstRun) return;
    if (shouldOfferSunday(data.settings.sundayReview, today, work.length)) {
      actions.updateSettings({ sundayReview: sundayOffered(data.settings.sundayReview, today) });
      setSunday(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, work.length === 0, firstRun]);
  // One sentence, one colour: "You're on track." or "2 things need you." (domain/now.ts statusLine).
  const status = statusLine(clean, today, now, tz);
  // Now is only about what is due (George, 2026-10-24): no exam mode, no study plan. An exam is an item like any other,
  // in the hero when it is the next thing and in Then by its date; study plans live in the Study tab, opt-in.
  // A quiz or exam within five days gets Practice offered on Now, whatever the hero is.
  const nextDeadline = Object.keys(counts).filter((d) => d >= today).sort()[0];
  const why = hero ? whyLine(pickReason(hero, work, schedule, today, now, tz, derived)) : null;

  // The day: what is due today, how much of it is done, and the time of day.
  const dueToday = useMemo(() => clean.filter((i) => !isParticipation(i) && !isNoise(i) && dateOf(i.dueAt, tz) === today), [clean, tz, today]);
  const doneToday = dueToday.filter((i) => i.status === 'done').length;
  // "You're clear for today" (2026-10-02): everything due today done, celebrated once a day on any device.
  const settledJoy = useSettled();
  useEffect(() => {
    if (!settledJoy || dueToday.length === 0 || doneToday < dueToday.length || data.settings.joy?.clearDay === today) return;
    if (isOpen(data.settings.onboarding)) return;
    joy(CLEAR_MOMENT);
    actions.updateJoy({ clearDay: today });
  }, [settledJoy, doneToday, dueToday.length, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
  const daypart = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const weekday = WEEKDAY_LONG[new Date(`${today}T12:00:00Z`).getUTCDay()];
  // "Today's done" is earned (domain/now.ts todayDone): everything due today done and nothing overdue.
  const eveningWrap = (daypart === 'evening' || daypart === 'night') && todayDone(clean, today, now, tz);
  // Then, in date order (George, 2026-10-24: "UNV Video Reflection is due tomorrow and only shows in Heads up"):
  // everything due by tomorrow (up to eight), else the next three; anything benched by three skips today at the end,
  // without a word about it.
  const then = useMemo(() => {
    const live = (i: Item) => i.id !== hero?.id && i.status !== 'done' && !isBlocked(i, today);
    const ahead = arranged.ahead.filter(live);
    const soon = ahead.filter((i) => dateOf(i.dueAt, tz) <= addDays(today, 1)).slice(0, 8);
    const rest = ahead.filter((i) => !soon.includes(i)).slice(0, Math.max(0, 3 - soon.length));
    const byDate = (a: Item, b: Item) => Date.parse(a.dueAt) - Date.parse(b.dueAt);
    return [...[...soon, ...rest].sort(byDate), ...arranged.bench.filter(live).slice(0, 2)];
  }, [arranged, hero?.id, today, tz]);

  // Not now. "Not today" pushes it to tomorrow (and plans it to start then), "Can't start yet" blocks it until what it
  // waits on likely clears, "Show me something else" passes over it for today. The card slides away first, and
  // Undo puts the item back exactly as it was for a few seconds.
  const [skipped, setSkipped] = useState<{ before: Item; line: string; pass: boolean } | null>(null);
  const notNow = (i: Item, c: NotNow) => {
    setLeaving(i.id);
    setSliding(true);
    const course = data.courses.find((x) => x.id === i.courseId);
    setTimeout(() => {
      if (c.kind === 'today') {
        const tomorrow = addDays(today, 1);
        actions.upsertItem({ ...i, snoozedUntil: tomorrow, startByOverride: tomorrow });
        setSkipped({ before: i, line: `${i.label}: back tomorrow`, pass: false });
      } else if (c.kind === 'block') {
        const blocked = makeBlock(c.reason, i, course, today, tz);
        actions.upsertItem({ ...i, blocked, startedAt: null });
        setSkipped({ before: i, line: `${i.label}: back ${blocked.until === addDays(today, 1) ? 'tomorrow' : fmtDate(blocked.until, 'short')}`, pass: false });
      } else {
        setSkips(skip(todaySkips, i.id));
        setSkipped({ before: i, line: `Skipped ${i.label} for now`, pass: true });
      }
      setLeaving(null);
      setSliding(false);
    }, SKIP_MS);
  };
  const undoSkip = () => {
    if (!skipped) return;
    if (skipped.pass) setSkips(unskip(todaySkips, skipped.before.id));
    else actions.upsertItem(skipped.before);
    setSkipped(null);
  };
  useEffect(() => {
    if (!skipped) return;
    const t = setTimeout(() => setSkipped(null), 6000);
    return () => clearTimeout(t);
  }, [skipped]);
  // Done: the card leaves first, then the item does. The check is the reward; nothing else moves. A mis-tap (or a
  // stray d key) is one tap from undone for a few seconds: the item as it was is put back whole.
  const [justFinished, setJustFinished] = useState<Item | null>(null);
  const finish = (i: Item) => {
    setFinished({ xp: previewAward(i), label: i.label });
    setShowAnyway(false);
    setLeaving(i.id);
    setTimeout(() => {
      actions.setStatus(i.id, 'done');
      setLeaving(null);
      setJustFinished(i);
      // Something got finished: the skipped come back (the benched stay down unless they are urgent).
      setSkips(afterDone(todaySkips, work, Date.now()));
    }, LEAVE_MS);
  };
  const undoFinish = () => {
    if (!justFinished) return;
    actions.upsertItem(justFinished);
    setJustFinished(null);
    setFinished(null);
  };
  useEffect(() => {
    if (!justFinished) return;
    const t = setTimeout(() => setJustFinished(null), 7000);
    return () => clearTimeout(t);
  }, [justFinished]);
  // Undone somewhere else (the time question has its own undo): nothing left to take back here.
  useEffect(() => {
    if (justFinished && data.items.find((i) => i.id === justFinished.id)?.status !== 'done') setJustFinished(null);
  }, [justFinished, data.items]);
  const unblock = (i: Item) => actions.upsertItem({ ...i, blocked: null });

  const showQueue = (mode.mode === 'urgent' || mode.mode === 'fine' || (mode.mode === 'enough' && showAnyway));
  const quiet = (mode.mode === 'fine' || mode.mode === 'enough' || mode.mode === 'empty');
  const eveningQuiet = data.settings.eveningQuiet && hour >= 21 && !work.some((i) => i.status !== 'done' && new Date(i.dueAt).getTime() < Date.now());

  // Every warning in one place, one line each. Order: what costs points first, then what is waiting or stale.
  const headsUp: HeadsUpLine[] = [];
  const reading = useReadStatus();
  const readNow = useReadNow();
  // Subtle while it runs, gone when it ends (a failure is reported to Admin, not shown here as a stuck count).
  if (reading.running && reading.progress) headsUp.push({ key: 'reading', tone: 'quiet', text: reading.progress.total > 1 ? `Reading ${reading.progress.total} new announcements…` : 'Reading a new announcement…' });
  else if (reading.waiting)
    headsUp.push({
      key: 'read-waiting',
      tone: 'soon',
      text: `${reading.waiting.count} announcements are waiting to be read.`,
      action: (
        <button type="button" className="hero-inline" onClick={readNow}>
          Read them now
        </button>
      ),
    });
  // A read that failed is not the student's to fix: hidden here, reported to Admin › Errors (backgroundRead.ts).
  else if (reading.outcome && reading.outcome.locked && !reading.outcome.noKey && !reading.outcome.ledgerError && !(reading.outcome.failed > 0))
    headsUp.push({
      key: 'read-failed',
      tone: reading.outcome.locked && !reading.outcome.noKey ? null : 'late',
      text: reading.outcome.ledgerError
        ? 'The record of what has been read could not be opened; nothing was read.'
        : reading.outcome.locked && !reading.outcome.noKey
          ? `${reading.outcome.todo} announcement${reading.outcome.todo === 1 ? ' is' : 's are'} waiting to be read.`
          : reading.outcome.noKey
            ? `${reading.outcome.todo} announcement${reading.outcome.todo === 1 ? ' is' : 's are'} unread: this build has no AI connection.`
            : `${reading.outcome.failed} announcement${reading.outcome.failed === 1 ? '' : 's'} could not be read; the next sync tries again.`,
      action:
        reading.outcome.locked && !reading.outcome.noKey && !reading.outcome.ledgerError ? (
          trialAvailable ? (
            // The moment the product's promise is one tap away: the posts are on file, the reader is not on this plan.
            <TrialOffer variant="inline" label={`Try it free and it reads ${reading.outcome.todo === 1 ? 'it' : 'them'}`} />
          ) : (
            <>
              Reading them is part of {planOf('announcementAI')}. <a href="#/inbox">Inbox</a>
            </>
          )
        ) : undefined,
    });
  const missed = missedRequirement(clean, today, tz);
  if (sub.line) headsUp.push({ key: 'sub', tone: sub.level === 'alarm' ? 'late' : 'soon', text: sub.line });
  if (chase)
    headsUp.push({
      key: 'chase',
      tone: 'soon',
      text: chase.text,
      action: (
        <>
          <button type="button" className="hero-inline" onClick={() => setOpen(chase.item)}>
            Open
          </button>{' '}
          <button type="button" className="hero-inline" onClick={() => unblock(chase.item)}>
            It's unblocked now
          </button>
        </>
      ),
    });
  // The hero already shows its own requirements; the heads-up only points at ones on other assignments.
  if (missed && missed.item.id !== hero?.id)
    headsUp.push({
      key: 'missed',
      text: missedShort(missed, today),
      detail: missedLine(missed, data.courses, today),
      action: (
        <button type="button" className="hero-inline" onClick={() => setOpen(missed.item)}>
          Open it
        </button>
      ),
    });
  if (heavy) headsUp.push({ key: 'heavy', text: heavy.line });
  if (paceText && paceText !== heavy?.line && !eveningQuiet) headsUp.push({ key: 'pace', text: paceText });
  if (waiting.length > 0 && !chase)
    headsUp.push({
      key: 'waiting',
      text: waiting.length === 1 ? `${waiting[0].label} is ${blockPhrase(waiting[0], tz)}; back ${fmtDate(waiting[0].blocked!.until, 'short')}.` : `${waiting.length} things are waiting on someone else; the first is back ${fmtDate([...waiting].sort((a, b) => a.blocked!.until.localeCompare(b.blocked!.until))[0].blocked!.until, 'short')}.`,
      action: (
        <button type="button" className="hero-inline" onClick={() => setOpen(waiting[0])}>
          Open
        </button>
      ),
    });
  // After a run that changed something: what the reader just did, in one line, with the Inbox one tap away. The
  // trial's weekly receipt covers the same ground, so it is not repeated there.
  else if (reading.outcome && !onTrial && readDoneLine(reading.outcome))
    headsUp.push({
      key: 'read-done',
      text: readDoneLine(reading.outcome) ?? '',
      action: <a href="#/inbox">Inbox</a>,
    });
  // During the trial, one honest line on what Max did this week, from the student's own records.
  const maxLine = onTrial && receipts && receipts.announcementsRead + receipts.requirementsFound + receipts.lectureNotes + receipts.coachAnswers > 0 ? receiptsLine(receipts) : null;
  if (maxLine && !(trialDays !== null && trialDays <= 1)) headsUp.push({ key: 'max', text: `Max did this for you. ${maxLine.replace(/^Max this week: /, 'This week: ')}` });

  // iPhone in Safari, classes on file, not yet on the Home Screen: one line, once, because notifications and the
  // full-screen app both need it and nothing else in the app says so until the Notifications card.
  const [homeNudged, setHomeNudged] = useState(readNudge);
  const homeNudge = !homeNudged && data.courses.length > 0 && isIos() && !isStandalone();
  if (homeNudge)
    headsUp.push({
      key: 'home-screen',
      text: 'Add Halo+ to your Home Screen for notifications: Share, then Add to Home Screen.',
      action: (
          <button
            type="button"
            className="hero-inline"
            onClick={() => {
              try {
                localStorage.setItem(HOME_NUDGE_KEY, 'done');
              } catch {
                /* storage off: it shows again next time, which is fine */
              }
              setHomeNudged(true);
            }}
          >
            Got it
          </button>
      ),
    });

  // Keyed on the item: when one is done the next slides in as a new card.
  // Keyed apart from the item sheet: both used to carry the bare item id, and when the sheet opened for the hero
  // itself React saw two siblings with one key and left a second, third, fourth copy of the card behind.
  const heroCard = hero && <HeroCard key={`hero-${hero.id}`} item={hero} optional={mode.mode !== 'urgent'} why={why} leaving={leaving === hero.id ? (sliding ? 'slide' : true) : false} onOpen={setOpen} onNotNow={notNow} onDone={finish} />;

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

  const primary = mode.mode === 'empty' ? (
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

  // Keyboard on Now: d done, n not today, s start, o open. Only when no field or sheet has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hero || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // Anything on top of Now takes the keyboard: a sheet, onboarding, the Max welcome, the palette, a level-up.
      if (document.querySelector('.modal-backdrop, [role="dialog"], .onboard, .levelup, .palette')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && skipped) undoSkip();
      else if (k === 'z' && justFinished) undoFinish();
      else if (k === 'd') finish(hero);
      else if (k === 'n') notNow(hero, { kind: 'today' });
      else if (k === 's') actions.upsertItem({ ...hero, startedAt: hero.startedAt ?? new Date().toISOString(), status: hero.status === 'done' ? hero.status : 'in_progress' });
      else if (k === 'o') setOpen(hero);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id, today, justFinished, skipped]);
  // Before the first sync, with nothing added by hand: one Connect Halo card, not an app with nothing in it.
  if (neverSynced && data.items.length === 0)
    return (
      <div className="now now-unsynced">
        <ConnectHaloCard />
      </div>
    );
  return (
    <div className="now">
      <SyncReminder />
      <WrapCard />
      <TrialReminder />
      <CaughtCard />
      {trialAvailable && !headsUp.some((h) => h.key === 'read-failed') && data.courses.length > 0 && (
        <p className="hint trial-quiet">
          {TRIAL.offer} <TrialOffer variant="inline" label="Start my free trial" />
        </p>
      )}
      <FriendAsk />
      <header className="now-head">
        <div>
          <p className="eyebrow">
            {weekday} {daypart}
          </p>
          <h1 className="now-title" data-tone={status.tone ?? undefined}>
            <button type="button" className="now-status-btn" onClick={() => okayPress.current?.()} title="Am I okay?">
              {eveningWrap ? "Today's done." : data.courses.length === 0 ? 'Nothing here yet.' : status.text}
            </button>
          </h1>
        </div>
        {dueToday.length > 0 && (
          <div className="now-ring" data-clear={doneToday === dueToday.length || undefined}>
            <Ring value={doneToday} max={dueToday.length} label={`${doneToday} of ${dueToday.length} due today done`} />
            <span className="now-ring-label">
              {doneToday}/{dueToday.length} today
            </span>
          </div>
        )}
      </header>
      <SinceLastLooked onOpen={setOpen} hidden={showReturn} />
      {showReturn && <WelcomeBackCard changes={sinceLooked} first={hero ?? null} onOpen={setOpen} onClose={() => setReturnClosed(true)} />}
      {primary}
      {skippedRow.length > 0 && (
        <p className="skipped-row" role="status">
          <span className="skipped-row-label">Skipped</span>
          {skippedRow.map((i) => (
            <button key={i.id} type="button" className="skipped-chip" onClick={() => setSkips(unskip(todaySkips, i.id))} title="Back to the top">
              {i.label} ↩
            </button>
          ))}
        </p>
      )}

      {then.length > 0 && (mode.mode === 'urgent' || showAnyway) && (
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
        <RatePrompt />
        <ExamWeekCard />
        <NotifyReask />
        <InviteNowCard />
        {/* The trust line, always: when what is on screen last matched Halo, or that it is out of date, with the one button. */}
        {data.courses.length > 0 && <SyncedLine stale={reminding ? null : stale} />}
        <HeadsUp lines={headsUp} />
        {data.courses.length > 0 && (
          <a className="coach-ask" href="#/ask">
            <IconNow />
            <span>Ask anything about your classes</span>
          </a>
        )}
        <ParticipationWeek />
        <InviteLine />
      </aside>

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
      {/* The time question carries its own undo while it is up; this toast covers the case where it is not. */}
      {skipped && (
        <div className="done-toast" role="status">
          <span className="done-toast-text">{skipped.line}</span>
          <button type="button" className="done-toast-undo" onClick={undoSkip}>
            Undo
          </button>
        </div>
      )}
      {justFinished && !justDone && (
        <div className="done-toast" role="status">
          <span className="done-toast-text">Done: {justFinished.label}</span>
          <button type="button" className="done-toast-undo" onClick={undoFinish}>
            Undo
          </button>
        </div>
      )}
      {open && <ItemDetail key={`detail-${open.id}`} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
