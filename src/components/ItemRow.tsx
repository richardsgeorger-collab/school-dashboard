import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { dueLabel, hours } from '../ui/format';
import { CourseChip, useCourseColor } from './CourseChip';
import { IconCheck } from './Icons';
import { useChipState } from './ItemChip';
import { RiskBadge } from './RiskBadge';

export function ItemRow({ item, onOpen, showStart = false, compact = false }: { item: Item; onOpen: (item: Item) => void; showStart?: boolean; compact?: boolean }) {
  const { courseById, schedule, today, data, actions } = useStore();
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const state = useChipState(item);
  const done = item.status === 'done';
  const showSubtitle = item.title !== item.label;

  return (
    <li className="item-row" data-done={done} data-state={state} data-compact={compact} style={{ '--course': color } as React.CSSProperties}>
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen ${item.label}` : `Mark ${item.label} done`}
        onClick={() => actions.setStatus(item.id, done ? 'todo' : 'done')}
      >
        <span>{done && <IconCheck />}</span>
      </button>
      <button type="button" className="item-main" onClick={() => onOpen(item)} title={item.title}>
        <span className="item-title">{item.label}</span>
        {showSubtitle && !compact && <span className="item-sub">{item.title}</span>}
        <span className="item-meta">
          <CourseChip course={course} />
          <span>due {dueLabel(item, data.settings.timezone, today)}</span>
          <span>{hours(item.estimatedMinutes)}</span>
          {item.points > 0 && <span>{item.points} pts</span>}
          {item.flags.inClass && <span className="flag">in class</span>}
          {item.flags.group && <span className="flag">group</span>}
          {showStart && sched && !done && <span>start by {shortDate(sched.startBy)}</span>}
        </span>
      </button>
      <span className="item-side">
        {done ? <span className="badge" data-risk="done">Done</span> : <RiskBadge risk={sched?.risk ?? null} />}
        {item.status === 'in_progress' && <span className="flag">in progress</span>}
      </span>
    </li>
  );
}

function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}
