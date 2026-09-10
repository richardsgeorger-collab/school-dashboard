import { courseColor } from '../data/courseDefaults';
import { dateOf } from '../domain/dates';
import type { ScheduledItem } from '../domain/schedule';
import type { Course, DateStr, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { useCourseColor } from './CourseChip';

export type ChipState = 'overdue' | 'today' | 'soon' | 'at_risk' | 'normal' | 'done';

/** One state per item, in priority order, so month/week/agenda all agree. */
export function chipState(item: Item, sched: ScheduledItem | undefined, today: DateStr, tz: string): ChipState {
  if (item.status === 'done') return 'done';
  if (sched?.risk === 'overdue') return 'overdue';
  if (dateOf(item.dueAt, tz) === today) return 'today';
  if (sched?.risk === 'at_risk') return 'at_risk';
  if (sched?.risk === 'due_soon') return 'soon';
  return 'normal';
}

export const STATE_LABEL: Record<ChipState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'Due soon',
  at_risk: 'At risk',
  normal: '',
  done: 'Done',
};

const GLYPH: Partial<Record<ChipState, string>> = { overdue: '!', at_risk: '▲', today: '●' };

export function useChipState(item: Item): ChipState {
  const { schedule, today, data } = useStore();
  return chipState(item, schedule.byItem[item.id], today, data.settings.timezone);
}

export const isBig = (item: Item) => item.type === 'exam' || item.points >= 100;

export function ItemChip({ item, onOpen, plain = false }: { item: Item; onOpen: (i: Item) => void; plain?: boolean }) {
  const { courseById } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const state = useChipState(item);
  const glyph = plain && state === 'today' ? undefined : GLYPH[state];
  return (
    <button
      type="button"
      className="chip-item"
      data-state={state}
      data-plain={plain}
      data-big={plain && isBig(item)}
      style={{ '--course': color } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={`${course?.code ?? ''} · ${item.title}${STATE_LABEL[state] ? ` · ${STATE_LABEL[state]}` : ''}`}
      aria-label={`${item.label}, ${course?.code ?? ''}${STATE_LABEL[state] ? `, ${STATE_LABEL[state]}` : ''}`}
    >
      {plain && <span className="chip-dot" aria-hidden />}
      {glyph && (
        <span className="glyph" aria-hidden>
          {glyph}
        </span>
      )}
      <span className="txt">{item.label}</span>
    </button>
  );
}

/** Stacked course-colored segments for a day's items, with a count. Reads at a glance when chips won't fit. */
export function DayBar({ items, courses, isDark, label }: { items: Item[]; courses: Course[]; isDark: boolean; label?: string }) {
  if (items.length === 0) return null;
  const byCourse = new Map<string, number>();
  for (const i of items) byCourse.set(i.courseId, (byCourse.get(i.courseId) ?? 0) + 1);
  const ordered = courses.filter((c) => byCourse.has(c.id));
  return (
    <span className="daybar" aria-hidden>
      <span className="daybar-track">
        {ordered.map((c) => (
          <span key={c.id} style={{ flex: byCourse.get(c.id), background: courseColor(c.color, isDark) }} />
        ))}
      </span>
      {label !== undefined && <span className="daybar-count">{label}</span>}
    </span>
  );
}
