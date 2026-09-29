import { useMemo, useState } from 'react';
import { cookMeter } from '../domain/cook';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * The Cook meter for one class: a small bar, the level beside it, and, on a tap, one line on why. Gold for Chillin,
 * Warm and Cooking; red only at Cooked. A button, so on a class card it sits outside the card's link.
 */
export function CookMeter({ course, size = 'card' }: { course: Course; size?: 'card' | 'page' }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const cook = useMemo(() => cookMeter(data.items.filter((i) => i.courseId === course.id), today, tz), [data.items, course.id, today, tz]);
  const [open, setOpen] = useState(false);
  return (
    <div className="cook" data-size={size} data-level={cook.level}>
      <button type="button" className="cook-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Cook meter: ${cook.level}. ${open ? '' : 'Tap for why.'}`}>
        <span className="cook-label">{cook.level}</span>
        <span className="cook-track" aria-hidden>
          <span className="cook-fill" style={{ width: `${Math.round(cook.fill * 100)}%` }} />
        </span>
      </button>
      {open && (
        <p className="cook-why" role="status">
          {cook.why}
        </p>
      )}
    </div>
  );
}
