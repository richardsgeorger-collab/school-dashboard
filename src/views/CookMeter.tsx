import { useMemo, useState } from 'react';
import { cookMeter } from '../domain/cook';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

/** The bar's colour for how full it is: green when barely cooked, through yellow and orange, to red when fried. */
export function cookColor(fill: number): string {
  const f = Math.max(0, Math.min(1, fill));
  return `hsl(${Math.round(130 * (1 - f))} 72% 44%)`;
}

/**
 * The Cooked meter for one class: a thin bar that fills and shifts from green to red as the next two weeks get
 * heavier, "Cooked meter" in small text under it, and, on a tap, one line on why. A button, so on a class card it
 * sits outside the card's link.
 */
export function CookMeter({ course, size = 'card' }: { course: Course; size?: 'card' | 'page' }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const cook = useMemo(() => cookMeter(data.items.filter((i) => i.courseId === course.id), today, tz), [data.items, course.id, today, tz]);
  const [open, setOpen] = useState(false);
  const pct = Math.round(cook.fill * 100);
  return (
    <div className="cook" data-size={size}>
      <button type="button" className="cook-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Cooked meter, ${pct}% full. ${open ? '' : 'Tap for why.'}`}>
        <span className="cook-track" aria-hidden>
          <span className="cook-fill" style={{ width: `${pct}%`, background: cookColor(cook.fill) }} />
        </span>
        <span className="cook-label">Cooked meter{size === 'page' ? ' · the next two weeks' : ''}</span>
      </button>
      {open && (
        <p className="cook-why" role="status">
          {cook.why}
        </p>
      )}
    </div>
  );
}
