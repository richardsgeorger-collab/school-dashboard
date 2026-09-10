import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { addDays, dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import { groupByDeadline, heroFraming, pressureLine, rankItems, termProgress, todayLine } from '../domain/now';
import type { DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useLinger } from '../ui/useLinger';
import { ChatCard } from '../chat/ChatCard';
import { ItemDetail } from './ItemDetail';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  if (!startBy || startBy >= d) return due;
  const k = diffDays(today, startBy);
  if (k <= 0 && d === today) return due;
  const sb = k <= 0 ? 'today' : k === 1 ? 'tomorrow' : fmtDate(startBy, 'long').split(',')[0];
  return `${due} · start by ${sb}`;
}

function Hero({ item, onOpen, onSkip }: { item: Item; onOpen: (i: Item) => void; onSkip: (i: Item) => void }) {
  const { courseById, schedule, data, today } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const framing = item.status === 'done' ? 'done' : heroFraming(item, schedule, today, new Date().toISOString());
  const eyebrow = { overdue: 'Overdue', now: 'Do this next', ahead: 'Get ahead on this', done: 'Done' }[framing];
  return (
    <section className="hero" data-state={framing} style={{ '--course': color } as React.CSSProperties} aria-label="Next up">
      <div className="hero-eyebrow">
        <span>{eyebrow}</span>
        <CourseChip course={course} />
      </div>
      <h1 className="hero-title">{item.label}</h1>
      {item.title !== item.label && <p className="hero-sub">{item.title}</p>}
      <p className="hero-meta mono">
        <span>{fmtMinutes(item.estimatedMinutes)}</span>
        {item.points > 0 && <span>{item.points} pts</span>}
        <span data-overdue={framing === 'overdue'}>{dueLine(item, data.settings.timezone, today, sched?.startBy)}</span>
        {item.status === 'in_progress' && <span className="flag">in progress</span>}
      </p>
      {framing !== 'done' && (
        <div className="hero-actions">
          <button type="button" className="btn primary hero-btn" onClick={() => onOpen(item)}>
            Open
          </button>
          <button type="button" className="btn hero-btn" onClick={() => onSkip(item)} title="Push this down until tomorrow">
            Not this one
          </button>
        </div>
      )}
    </section>
  );
}

function ThenRow({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { courseById, schedule, data, today } = useStore();
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
          {fmtMinutes(item.estimatedMinutes)} · {item.points} pts
        </span>
      </button>
      {open && (
        <div className="then-detail">
          <p className="hint">
            {item.title !== item.label ? `${item.title} · ` : ''}
            {course?.code} · {dueLine(item, data.settings.timezone, today, sched?.startBy)}
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
  const { data, schedule, today, term, actions } = useStore();
  const [open, setOpen] = useState<Item | null>(null);
  const now = new Date().toISOString();
  const minuteKey = now.slice(0, 16);
  const ranked = useMemo(() => rankItems(data.items, schedule, now, data.settings.timezone), [data.items, schedule, data.settings.timezone, minuteKey]);
  const top = useLinger(ranked.slice(0, 4), data.items);
  const hero = top[0];
  const groups = useMemo(() => groupByDeadline(top.slice(1, 4), schedule), [top, schedule]);
  const line = useMemo(() => pressureLine(data.items, schedule, data.settings, today, now), [data.items, schedule, data.settings, today, minuteKey]);
  const status = todayLine(data.items, schedule, today, now, data.settings.timezone);
  const progress = termProgress(data.items, term, today);
  const skip = (i: Item) => actions.upsertItem({ ...i, snoozedUntil: addDays(today, 1) });

  return (
    <div className="now">
      <p className="now-status">
        <span className="mono muted">{fmtDate(today, 'long')}</span>
        <span>{status}</span>
      </p>
      {hero ? <Hero item={hero} onOpen={setOpen} onSkip={skip} /> : <EmptyState>Nothing open. Import a syllabus from Settings, or enjoy the quiet.</EmptyState>}
      {groups.length > 0 && (
        <section className="then" aria-label="Then">
          <h2 className="section-title">then</h2>
          {groups.map((g) => (
            <div key={g.day} className="then-group">
              <h3 className="then-day mono">
                {dayHeading(today, g.day)} <span className="muted">· {g.items.length} thing{g.items.length === 1 ? '' : 's'}</span>
              </h3>
              <ul className="then-list">
                {g.items.map((i) => (
                  <ThenRow key={i.id} item={i} onOpen={setOpen} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {line && <p className="pressure">{line}</p>}
      <div className="term-progress" role="img" aria-label={`${progress.pct}% of the term's points banked, ${progress.elapsedPct}% of the term elapsed`}>
        <span className="term-progress-track">
          <span className="banked" style={{ width: `${progress.pct}%` }} />
          <span className="elapsed" style={{ left: `${progress.elapsedPct}%` }} />
        </span>
        <span className="mono muted">
          {progress.pct}% banked · {progress.elapsedPct}% of the term elapsed
        </span>
      </div>
      <ChatCard />
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
