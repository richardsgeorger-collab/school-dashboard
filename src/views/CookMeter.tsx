import { useMemo, useState } from 'react';
import { cookMeter, type CookLevel } from '../domain/cook';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

/** Green, yellow or red: a clear three-step read, by hours of work owed this week (domain/cook.ts). */
const COLOR: Record<CookLevel, string> = { green: 'hsl(130 60% 42%)', yellow: 'hsl(44 92% 48%)', red: 'hsl(4 74% 50%)' };
export const cookColor = (level: CookLevel): string => COLOR[level];

/**
 * The Cooked meter for one class: a thin bar, green, yellow or red by the hours of unfinished work due in the next 7
 * days, "Cooked meter" in small text under it, and the reason ("4 items, ~5h this week, 1 overdue") on hover and on a
 * tap. A button, so on a class card it sits outside the card's link.
 */
export function CookMeter({ course, size = 'card' }: { course: Course; size?: 'card' | 'page' }) {
  const { data, today, calibrate } = useStore();
  const tz = data.settings.timezone;
  // Recomputed from the planner on every change: a check-off, an undo or a sync moves it at once.
  const cook = useMemo(() => cookMeter(data.items.filter((i) => i.courseId === course.id), today, tz, (i) => calibrate(i).minutes), [data.items, course.id, today, tz, calibrate]);
  const [open, setOpen] = useState(false);
  const pct = Math.round(cook.fill * 100);
  return (
    <div className="cook" data-size={size}>
      <button type="button" className="cook-btn" data-level={cook.level} title={cook.why} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Cooked meter, ${cook.level}: ${cook.why}`}>
        <span className="cook-track" aria-hidden>
          <span className="cook-fill" style={{ width: `${pct}%`, background: cookColor(cook.level) }} />
        </span>
        <span className="cook-label">Cooked meter{size === 'page' ? ' · the next 7 days' : ''}</span>
      </button>
      {open && (
        <p className="cook-why" role="status">
          {cook.why}
        </p>
      )}
    </div>
  );
}
