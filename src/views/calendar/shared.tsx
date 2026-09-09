import { CourseChip, useCourseColor } from '../../components/CourseChip';
import { fmtClock, hhmmToMinutes } from '../../domain/dates';
import type { MeetingOn } from '../../domain/calendar';
import type { Item } from '../../domain/types';
import { useStore } from '../../storage/store';

export function MeetingRow({ m }: { m: MeetingOn }) {
  const color = useCourseColor(m.course);
  const s = hhmmToMinutes(m.meeting.start);
  const e = hhmmToMinutes(m.meeting.end);
  return (
    <div className="meeting-row" style={{ '--course': color } as React.CSSProperties}>
      <span className="mono muted">
        {fmtClock(Math.floor(s / 60), s % 60)}–{fmtClock(Math.floor(e / 60), e % 60)}
      </span>
      <CourseChip course={m.course} />
      <span className="muted">class</span>
    </div>
  );
}

export function ItemChip({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { courseById, schedule } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const risk = schedule.byItem[item.id]?.risk;
  return (
    <button
      type="button"
      className="month-chip"
      data-done={item.status === 'done'}
      data-risk={risk ?? undefined}
      style={{ '--course': color } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={`${course?.code ?? ''} ${item.title}`}
    >
      {item.title}
    </button>
  );
}

export function useFilteredItems(codes: Set<string> | null): Item[] {
  const { data, courseById } = useStore();
  if (!codes) return data.items;
  return data.items.filter((i) => codes.has(courseById.get(i.courseId)?.code ?? ''));
}
