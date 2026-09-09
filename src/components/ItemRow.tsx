import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { dueLabel, hours } from '../ui/format';
import { CourseChip, useCourseColor } from './CourseChip';
import { IconCheck } from './Icons';
import { RiskBadge } from './RiskBadge';

export function ItemRow({ item, onOpen, showStart = false }: { item: Item; onOpen: (item: Item) => void; showStart?: boolean }) {
  const { courseById, schedule, today, data, actions } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const done = item.status === 'done';

  return (
    <li className="item-row" data-done={done} style={{ '--course': color } as React.CSSProperties}>
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen ${item.title}` : `Mark ${item.title} done`}
        onClick={() => actions.setStatus(item.id, done ? 'todo' : 'done')}
      >
        <span>{done && <IconCheck />}</span>
      </button>
      <button type="button" className="item-main" onClick={() => onOpen(item)}>
        <span className="item-title">{item.title}</span>
        <span className="item-meta">
          <CourseChip course={course} />
          <span>due {dueLabel(item, data.settings.timezone, today)}</span>
          <span>{hours(item.estimatedMinutes)}</span>
          {item.points > 0 && <span>{item.points} pts</span>}
          {item.flags.inClass && <span className="flag">in class</span>}
          {item.flags.group && <span className="flag">group</span>}
          {showStart && sched && !done && <span>start by {dueLabelDate(sched.startBy)}</span>}
        </span>
      </button>
      <span className="item-side">
        {done ? <span className="badge" data-risk="done">Done</span> : <RiskBadge risk={sched?.risk ?? null} />}
        {item.status === 'in_progress' && <span className="flag">in progress</span>}
      </span>
    </li>
  );
}

function dueLabelDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}
