import { useMemo, useState } from 'react';
import { ChatCard } from '../chat/ChatCard';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconCheck } from '../components/Icons';
import { addDays, dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import { nextClassPrep, nextMeeting } from '../domain/nextClass';
import { chunkSuggestion, groupByDeadline, heroFraming, nowMode, openCountByDay, pickReason, pressureLine, rankItems, startPhrase, termProgress, todayLine } from '../domain/now';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useLinger } from '../ui/useLinger';
import { DaySheet } from './calendar/DaySheet';
import { ItemDetail } from './ItemDetail';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const approx = (min: number) => `~${fmtMinutes(min)}`;

function dayHeading(today: DateStr, d: DateStr): string {
  const k = diffDays(today, d);
  if (k === 0) return 'Today';
  if (k === 1) return 'Tomorrow';
  if (k < 0) return `${fmtDate(d, 'long')} · past due`;
  return `${WEEKDAY_LONG[new Date(d + 'T12:00:00Z').getUTCDay()]} · ${fmtDate(d, 'short')}`;
}

function dueLine(item: Item, tz: string, today: DateStr, startBy: string | undefined): string {
  const d = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const due = `Due ${d === today ? 'today' : fmtDate(d, 'long')}${time !== '11:59 PM' ? ` ${time}` : ''}`;
  if (!startBy || startBy >= d || d === today) return due;
  return `${due} · ${startPhrase(startBy, today)}`;
}

function sourceTag(item: Item, course: Course | undefined): string {
  return item.source === 'parsed' ? `${course?.code ?? 'syllabus'} syllabus` : 'added by you';
}

function NextClassCard({ heroId, onOpen }: { heroId: string | undefined; onOpen: (i: Item) => void }) {
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
    <section className="nextclass" aria-label="Next class">
      <div className="nextclass-eyebrow mono">
        <span>Next class</span>
        <CourseChip course={course} />
        <span>{when}</span>
      </div>
      <p className="nextclass-text" data-quiet={!prep.item && !prep.nudge}>
        {prep.item ? (
          <button type="button" className="nextclass-link" onClick={() => onOpen(prep.item!)}>
            {prep.text}
          </button>
        ) : (
          prep.text
        )}
        {prep.inferred && (
          <span className="tag-inferred" title="Inferred by the app, not on the syllabus">
            inferred
          </span>
        )}
      </p>
    </section>
  );
}

function Hero({ item, optional, onOpen, onSkip, onDone }: { item: Item; optional: boolean; onOpen: (i: Item) => void; onSkip: (i: Item) => void; onDone: (i: Item) => void }) {
  const { courseById, schedule, data, today, derived, actions } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const now = new Date().toISOString();
  const done = item.status === 'done';
  const framing = done ? 'done' : optional ? 'ahead' : heroFraming(item, schedule, today, now);
  const eyebrow = { overdue: 'Overdue', now: 'Do this next', ahead: optional ? 'Get ahead · optional' : 'Get ahead on this', done: 'Done' }[framing];
  const reason = useMemo(
    () => pickReason(item, data.items.filter((i) => i.type !== 'participation'), schedule, today, now, data.settings.timezone, derived),
    [item, data.items, schedule, today, now.slice(0, 16), data.settings.timezone, derived],
  );
  const chunk = done ? null : chunkSuggestion(item, schedule, today);
  const inferredDeadline = !!derived[item.id];

  return (
    <section key={item.id} className="hero" data-state={framing} style={{ '--course': color } as React.CSSProperties} aria-label="Next up">
      <div className="hero-eyebrow">
        <span>{eyebrow}</span>
        <CourseChip course={course} />
      </div>
      <h1 className="hero-title">{item.label}</h1>
      {item.title !== item.label && <p className="hero-sub">{item.title}</p>}
      <p className="hero-meta mono">
        <span>{approx(item.estimatedMinutes)}</span>
        {item.points > 0 && <span>{item.points} pts</span>}
        <span data-overdue={framing === 'overdue'}>{dueLine(item, data.settings.timezone, today, sched?.startBy)}</span>
        {inferredDeadline && (
          <span className="tag-inferred" title={derived[item.id].reasons.join('; ')}>
            deadline inferred
          </span>
        )}
        {item.status === 'in_progress' && <span className="flag">in progress</span>}
      </p>
      {!done && <p className="hero-why">{reason}</p>}
      {chunk && (
        <p className="hero-chunk">
          <span>{chunk.text}</span>
          <button
            type="button"
            className="btn small"
            onClick={() => actions.upsertItem({ ...item, estimatedMinutes: Math.max(15, item.estimatedMinutes - chunk.chunk), estimateOverridden: true, status: 'in_progress' })}
          >
            Log {chunk.chunk} min
          </button>
        </p>
      )}
      {!done && (
        <div className="hero-actions">
          <button type="button" className="btn primary hero-btn" onClick={() => onDone(item)}>
            <IconCheck /> Done
          </button>
          <button type="button" className="btn hero-btn" onClick={() => onOpen(item)}>
            Open
          </button>
          <button type="button" className="btn hero-btn" onClick={() => onSkip(item)} title="Push this down until tomorrow">
            Not this one
          </button>
        </div>
      )}
      <p className="hero-source">
        <span className="tag-source">{sourceTag(item, course)}</span>
      </p>
    </section>
  );
}

function ThenRow({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { courseById, schedule, data, today, derived } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const [open, setOpen] = useState(false);
  return (
    <li className="then-row" data-open={open} style={{ '--course': color } as React.CSSProperties}>
      <button type="button" className="then-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="then-dot" aria-hidden />
        <span className="then-label">{item.label}</span>
        <span className="then-meta mono">
          {approx(item.estimatedMinutes)} · {item.points} pts
        </span>
      </button>
      {open && (
        <div className="then-detail">
          <p className="hint">
            {item.title !== item.label ? `${item.title} · ` : ''}
            {dueLine(item, data.settings.timezone, today, sched?.startBy)}
          </p>
          <p className="hint" style={{ display: 'flex', gap: 6 }}>
            <span className="tag-source">{sourceTag(item, course)}</span>
            {derived[item.id] && (
              <span className="tag-inferred" title={derived[item.id].reasons.join('; ')}>
                deadline inferred
              </span>
            )}
          </p>
          <button type="button" className="btn small" onClick={() => onOpen(item)}>
            Open
          </button>
        </div>
      )}
    </li>
  );
}

export function Now() {
  const { data, schedule, today, term, actions, progress, previewAward } = useStore();
  const tz = data.settings.timezone;
  const [open, setOpen] = useState<Item | null>(null);
  const [sheetDay, setSheetDay] = useState<DateStr | null>(null);
  const [finished, setFinished] = useState<{ xp: number; label: string } | null>(null);
  const [showAnyway, setShowAnyway] = useState(false);
  const now = new Date().toISOString();
  const minuteKey = now.slice(0, 16);

  // Participation is attendance, not work: it stays in the calendar and grades, never here.
  const work = useMemo(() => data.items.filter((i) => i.type !== 'participation'), [data.items]);
  const ranked = useMemo(() => rankItems(work, schedule, now, tz), [work, schedule, tz, minuteKey]);
  const top = useLinger(ranked.slice(0, 4), work);
  const hero = top[0];
  const groups = useMemo(() => groupByDeadline(top.slice(1, 4), schedule), [top, schedule]);
  const counts = useMemo(() => openCountByDay(work, schedule), [work, schedule]);
  const mode = useMemo(() => nowMode(work, schedule, data.settings, today, now, finished !== null), [work, schedule, data.settings, today, minuteKey, finished]);
  const line = useMemo(() => pressureLine(work, schedule, data.settings, today, now), [work, schedule, data.settings, today, minuteKey]);
  const status = todayLine(work, schedule, today, now, tz);
  const pace = termProgress(data.items, term, today);
  const updatedAt = data.courses.map((c) => c.updatedAt).sort().at(-1);
  const nextDeadline = Object.keys(counts).filter((d) => d >= today).sort()[0];

  const skip = (i: Item) => actions.upsertItem({ ...i, snoozedUntil: addDays(today, 1) });
  const finish = (i: Item) => {
    setFinished({ xp: previewAward(i), label: i.label });
    setShowAnyway(false);
    actions.setStatus(i.id, 'done');
  };
  const heroDay = hero ? (schedule.byItem[hero.id]?.deadlineDay ?? dateOf(hero.dueAt, tz)) : null;

  const showQueue = mode.mode === 'urgent' || mode.mode === 'fine' || (mode.mode === 'enough' && showAnyway);

  return (
    <div className="now">
      <p className="now-status">
        <span className="mono muted">{fmtDate(today, 'long')}</span>
        <span>{status}</span>
      </p>

      <NextClassCard heroId={hero?.id} onOpen={setOpen} />

      {mode.mode === 'empty' && <EmptyState>Nothing open. Import a syllabus from Settings, or enjoy the quiet.</EmptyState>}

      {mode.mode === 'enough' && !showAnyway && (
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

      {mode.mode === 'fine' && hero && (
        <section className="calm" data-tone="fine" aria-label="You're good">
          <h1 className="calm-title">You're good.</h1>
          <p className="calm-text">
            Nothing due for {mode.daysUntilNext} days. Next thing worth starting is {hero.label} — {approx(hero.estimatedMinutes)}, due{' '}
            {WEEKDAY_LONG[new Date((schedule.byItem[hero.id]?.deadlineDay ?? dateOf(hero.dueAt, tz)) + 'T12:00:00Z').getUTCDay()]}.
          </p>
        </section>
      )}

      {showQueue && hero && <Hero item={hero} optional={mode.mode !== 'urgent'} onOpen={setOpen} onSkip={skip} onDone={finish} />}

      {showQueue && groups.length > 0 && (
        <section className="then" aria-label="Then">
          <h2 className="section-title">then</h2>
          {groups.map((g) => {
            const total = counts[g.day] ?? g.items.length;
            const visible = g.items.length + (heroDay === g.day && hero?.status !== 'done' ? 1 : 0);
            return (
              <div key={g.day} className="then-group">
                <h3 className="then-day mono">
                  {dayHeading(today, g.day)} <span className="muted">· {total} thing{total === 1 ? '' : 's'}</span>
                  {total > visible && (
                    <button type="button" className="then-all" onClick={() => setSheetDay(g.day)}>
                      all
                    </button>
                  )}
                </h3>
                <ul className="then-list">
                  {g.items.map((i) => (
                    <ThenRow key={i.id} item={i} onOpen={setOpen} />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {line && mode.mode !== 'enough' && <p className="pressure">{line}</p>}

      <div className="term-progress" role="img" aria-label={`${pace.pct}% of the term's points banked, ${pace.elapsedPct}% of the term elapsed`}>
        <span className="term-progress-track">
          <span className="banked" style={{ width: `${pace.pct}%` }} />
          <span className="elapsed" style={{ left: `${pace.elapsedPct}%` }} />
        </span>
        <span className="mono muted">
          {pace.pct}% banked · {pace.elapsedPct}% of the term elapsed
          {updatedAt ? ` · syllabi updated ${fmtDate(updatedAt.slice(0, 10), 'short')}` : ''}
        </span>
      </div>

      <ChatCard />
      {sheetDay && <DaySheet date={sheetDay} items={work} onClose={() => setSheetDay(null)} onOpen={(i) => { setSheetDay(null); setOpen(i); }} />}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
