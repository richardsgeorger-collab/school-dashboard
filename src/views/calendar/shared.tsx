import { CourseChip, useCourseColor } from '../../components/CourseChip';
import { fmtClock, hhmmToMinutes } from '../../domain/dates';
import type { MeetingOn } from '../../domain/calendar';
import type { Item } from '../../domain/types';
import { useStore } from '../../storage/store';

export { ItemChip } from '../../components/ItemChip';

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

export function useFilteredItems(codes: Set<string> | null): Item[] {
  const { data, courseById } = useStore();
  if (!codes) return data.items;
  return data.items.filter((i) => codes.has(courseById.get(i.courseId)?.code ?? ''));
}
