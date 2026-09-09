import { useMemo } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { useCourseColor } from '../../components/CourseChip';
import { ItemRow } from '../../components/ItemRow';
import { meetingsOn, type MeetingOn } from '../../domain/calendar';
import { addDays, dateOf, fmtClock, fmtDate, fmtMinutes, hhmmToMinutes } from '../../domain/dates';
import { dayCapacity } from '../../domain/schedule';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { ItemChip, MeetingRow } from './shared';

const HOUR_START = 7;
const HOUR_END = 22;
const PX_PER_HOUR = 40;

function MeetingBlock({ m }: { m: MeetingOn }) {
  const color = useCourseColor(m.course);
  const s = hhmmToMinutes(m.meeting.start);
  const e = hhmmToMinutes(m.meeting.end);
  const top = ((s - HOUR_START * 60) / 60) * PX_PER_HOUR;
  const height = ((e - s) / 60) * PX_PER_HOUR;
  return (
    <div className="week-meeting" style={{ top, height, '--course': color } as React.CSSProperties} title={`${m.course.code} ${m.meeting.start}–${m.meeting.end}`}>
      <b>{m.course.code}</b>
      <span>{fmtClock(Math.floor(s / 60), s % 60)}</span>
    </div>
  );
}

export function WeekView({ start, items, onOpen }: { start: DateStr; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const wide = useMediaQuery('(min-width: 768px)');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    return m;
  }, [items, tz]);

  if (!wide) {
    return (
      <div className="week-stack">
        {days.map((d) => {
          const meetings = meetingsOn(data.courses, d);
          const due = byDay.get(d) ?? [];
          const planned = schedule.loadByDay[d] ?? 0;
          return (
            <section key={d} className="week-day" data-today={d === today}>
              <header className="week-day-head">
                <b>{d === today ? 'Today' : fmtDate(d, 'long')}</b>
                <span className="mono muted">
                  {fmtMinutes(planned)} / {fmtMinutes(dayCapacity(data.settings, d))}
                </span>
              </header>
              {meetings.map((m) => (
                <MeetingRow key={m.course.id + m.meeting.start} m={m} />
              ))}
              {due.length > 0 && (
                <ul className="item-list" style={{ marginTop: 6 }}>
                  {due.map((i) => (
                    <ItemRow key={i.id} item={i} onOpen={onOpen} />
                  ))}
                </ul>
              )}
              {meetings.length === 0 && due.length === 0 && <p className="hint">Free day.</p>}
            </section>
          );
        })}
      </div>
    );
  }

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  return (
    <div className="week-grid">
      <div className="week-corner" />
      {days.map((d) => (
        <div key={`h${d}`} className="week-col-head" data-today={d === today}>
          <span className="week-dayname">{fmtDate(d, 'long').split(',')[0]}</span>
          <b>{Number(d.slice(-2))}</b>
          <span className="week-planned mono">{schedule.loadByDay[d] ? `${fmtMinutes(schedule.loadByDay[d])} planned` : '—'}</span>
        </div>
      ))}
      <div className="week-corner" />
      {days.map((d) => {
        const due = byDay.get(d) ?? [];
        return (
          <div key={`d${d}`} className="week-due" data-today={d === today}>
            {due.map((i) => (
              <ItemChip key={i.id} item={i} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
      <div className="week-hours">
        {hours.map((h) => (
          <span key={h} style={{ height: PX_PER_HOUR }}>
            {fmtClock(h, 0).replace(':00', '')}
          </span>
        ))}
      </div>
      {days.map((d) => (
        <div key={`t${d}`} className="week-col" data-today={d === today} style={{ height: hours.length * PX_PER_HOUR }}>
          {hours.map((h) => (
            <span key={h} className="week-hourline" style={{ top: (h - HOUR_START) * PX_PER_HOUR }} />
          ))}
          {meetingsOn(data.courses, d).map((m) => (
            <MeetingBlock key={m.course.id + m.meeting.start} m={m} />
          ))}
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <EmptyState>No items match the filter.</EmptyState>
        </div>
      )}
    </div>
  );
}
