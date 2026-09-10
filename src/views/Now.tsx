import { useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { IconCheck } from '../components/Icons';
import { dateOf, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import { pressureLine, rankItems, termProgress } from '../domain/now';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { relativeDay } from '../ui/format';
import { useLinger } from '../ui/useLinger';
import { ItemDetail } from './ItemDetail';

function dueLine(item: Item, tz: string, today: string, startBy: string | undefined): string {
  const d = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const due = `Due ${fmtDate(d, 'long')}${time !== '11:59 PM' ? ` ${time}` : ''}`;
  if (!startBy || item.status === 'in_progress') return due;
  const rel = relativeDay(today, startBy);
  return `${due} · start by ${rel === 'today' || rel === 'tomorrow' ? rel : fmtDate(startBy, 'long').split(',')[0]}`;
}

function Hero({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { courseById, schedule, data, today, actions, previewAward } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const [burst, setBurst] = useState<number | null>(null);
  const done = item.status === 'done';
  const overdue = sched?.risk === 'overdue';
  const finish = () => {
    setBurst(previewAward(item));
    actions.setStatus(item.id, 'done');
  };
  return (
    <section className="hero" data-state={done ? 'done' : overdue ? 'overdue' : item.status} style={{ '--course': color } as React.CSSProperties} aria-label="Next up">
      <div className="hero-eyebrow">
        <span>{done ? 'Done' : item.status === 'in_progress' ? 'In progress' : overdue ? 'Overdue' : 'Next up'}</span>
        <CourseChip course={course} />
      </div>
      <h1 className="hero-title">{item.label}</h1>
      {item.title !== item.label && <p className="hero-sub">{item.title}</p>}
      <p className="hero-meta mono">
        <span>{fmtMinutes(item.estimatedMinutes)}</span>
        {item.points > 0 && <span>{item.points} pts</span>}
        <span data-overdue={overdue}>{dueLine(item, data.settings.timezone, today, sched?.startBy)}</span>
      </p>
      <div className="hero-actions">
        {done ? (
          <span className="badge" data-risk="done">
            Done{burst !== null ? ` · +${burst}` : ''}
          </span>
        ) : item.status === 'in_progress' ? (
          <>
            <button type="button" className="btn primary hero-btn" onClick={finish}>
              <IconCheck /> Mark done
            </button>
            <button type="button" className="btn hero-btn" onClick={() => onOpen(item)}>
              Open
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn primary hero-btn" onClick={() => actions.setStatus(item.id, 'in_progress')}>
              Start
            </button>
            <button type="button" className="btn hero-btn" onClick={() => onOpen(item)}>
              Open
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ThenRow({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { courseById, schedule, data, today } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const [open, setOpen] = useState(false);
  const d = dateOf(item.dueAt, data.settings.timezone);
  return (
    <li className="then-row" data-open={open} style={{ '--course': color } as React.CSSProperties}>
      <button type="button" className="then-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="then-dot" aria-hidden />
        <span className="then-label">{item.label}</span>
        <span className="then-due mono">{relativeDay(today, d) === 'today' ? 'today' : fmtDate(d, 'short')}</span>
      </button>
      {open && (
        <div className="then-detail">
          {item.title !== item.label && <p className="hint">{item.title}</p>}
          <p className="hint mono">
            {fmtMinutes(item.estimatedMinutes)} · {item.points} pts · {dueLine(item, data.settings.timezone, today, sched?.startBy)}
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
  const { data, schedule, today } = useStore();
  const [open, setOpen] = useState<Item | null>(null);
  const now = new Date().toISOString();
  const ranked = useMemo(() => rankItems(data.items, schedule, now, data.settings.timezone), [data.items, schedule, data.settings.timezone, now.slice(0, 16)]);
  const top = useLinger(ranked.slice(0, 4), data.items);
  const hero = top[0];
  const then = top.slice(1, 4);
  const line = useMemo(() => pressureLine(data.items, schedule, data.settings, today, now), [data.items, schedule, data.settings, today, now.slice(0, 16)]);
  const progress = termProgress(data.items);

  return (
    <div className="now">
      <p className="now-date mono">{fmtDate(today, 'long')}</p>
      {hero ? <Hero item={hero} onOpen={setOpen} /> : <EmptyState>Nothing open. Import a syllabus from Settings, or enjoy the quiet.</EmptyState>}
      {then.length > 0 && (
        <section className="then" aria-label="Then">
          <h2 className="section-title">then</h2>
          <ul className="then-list">
            {then.map((i) => (
              <ThenRow key={i.id} item={i} onOpen={setOpen} />
            ))}
          </ul>
        </section>
      )}
      {line && <p className="pressure">{line}</p>}
      <div className="term-progress" role="img" aria-label={`${progress.pct}% of the term's points banked`}>
        <span className="term-progress-track">
          <span style={{ width: `${progress.pct}%` }} />
        </span>
        <span className="mono muted">{progress.pct}% of the term's points banked</span>
      </div>
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
