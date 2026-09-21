import { isBlocked } from '../domain/blocked';
import { movedRecently } from '../domain/requirements';
import { dateOf, fmtDate } from '../domain/dates';
import { useEffect, useState } from 'react';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';
import { dueLabel, hours } from '../ui/format';
import { CourseChip, useCourseColor } from './CourseChip';
import { IconCheck } from './Icons';
import { useChipState } from './ItemChip';
import { RiskBadge } from './RiskBadge';
import { haloSaysNotIn } from '../domain/confirm';

export function ItemRow({ item, onOpen, showStart = false, compact = false }: { item: Item; onOpen: (item: Item) => void; showStart?: boolean; compact?: boolean }) {
  const { courseById, schedule, today, data, actions, previewAward } = useStore();
  const [burst, setBurst] = useState<{ value: number; key: number } | null>(null);
  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(null), 1100);
    return () => clearTimeout(id);
  }, [burst]);
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const sched = schedule.byItem[item.id];
  const state = useChipState(item);
  const done = item.status === 'done';
  const showSubtitle = item.title !== item.label;

  return (
    <li className="item-row" data-done={done} data-state={state} data-type={item.type} data-compact={compact} data-flash={!!burst} style={{ '--course': color } as React.CSSProperties}>
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen ${item.label}` : `Mark ${item.label} done`}
        onClick={() => {
          if (!done) setBurst({ value: previewAward(item), key: Date.now() });
          actions.setStatus(item.id, done ? 'todo' : 'done');
        }}
      >
        <span className={burst ? 'pop' : undefined}>{done && <IconCheck />}</span>
        {burst && (
          <span key={burst.key} className="xp-float" aria-live="polite">
            +{burst.value}
          </span>
        )}
      </button>
      <button type="button" className="item-main" onClick={() => onOpen(item)} title={item.title}>
        <span className="item-title">{item.label}</span>
        {!done && item.steps && item.steps.length > 0 && item.steps.some((s) => s.done) && (
          <span className="item-steps-bar" aria-label={`${item.steps.filter((s) => s.done).length} of ${item.steps.length} steps`}>
            <span style={{ width: `${(item.steps.filter((s) => s.done).length / item.steps.length) * 100}%` }} />
          </span>
        )}
        {showSubtitle && !compact && <span className="item-sub">{item.title}</span>}
        <span className="item-meta">
          <CourseChip course={course} />
          <span>
            due {dueLabel(item, data.settings.timezone, today)}
            {/* An announcement moved this. The date it moved from stays visible for a few days so the move is seen. */}
            {movedRecently(item, today, data.settings.timezone) && <s className="item-was"> was {fmtDate(dateOf(item.dateChange!.from, data.settings.timezone), 'short')}</s>}
          </span>
          {item.origin?.kind === 'announcement' && <span className="flag flag-origin" title={item.origin.quote ?? undefined}>from an announcement</span>}
          <span>{hours(item.estimatedMinutes)}</span>
          {item.points > 0 && <span>{item.points} pts</span>}
          {isBlocked(item, today) && <span className="flag flag-wait">waiting</span>}
          {item.flags.inClass && <span className="flag">in class</span>}
          {item.flags.group && <span className="flag">group</span>}
          {(item.blocks?.length ?? 0) > 0 && <span className="flag">unlocks {item.blocks!.length}</span>}
          {item.haloLate && <span className="flag flag-late">Halo says late</span>}
          {done && haloSaysNotIn(item) && item.halo && item.halo.checkedAt > item.dueAt && <span className="flag flag-late">Halo says not submitted</span>}
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
