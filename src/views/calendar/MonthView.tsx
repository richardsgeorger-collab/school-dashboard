import { useMemo, useState } from 'react';
import { useCourseColor } from '../../components/CourseChip';
import { monthGrid } from '../../domain/calendar';
import { dateOf } from '../../domain/dates';
import type { Course, DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { DaySheet } from './DaySheet';
import { ItemChip } from './shared';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Dot({ course }: { course: Course | undefined }) {
  const color = useCourseColor(course);
  return <span className="month-dot" style={{ background: color }} />;
}

export function MonthView({ month, items, onOpen }: { month: string; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, today, courseById } = useStore();
  const tz = data.settings.timezone;
  const wide = useMediaQuery('(min-width: 640px)');
  const [sheet, setSheet] = useState<DateStr | null>(null);
  const cells = useMemo(() => monthGrid(month, data.settings.weekStartsOn), [month, data.settings.weekStartsOn]);
  const byDay = useMemo(() => {
    const m = new Map<DateStr, Item[]>();
    for (const i of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dateOf(i.dueAt, tz);
      m.set(d, [...(m.get(d) ?? []), i]);
    }
    return m;
  }, [items, tz]);
  const names = data.settings.weekStartsOn === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES;

  return (
    <>
      <div className="month-head" aria-hidden>
        {names.map((n) => (
          <span key={n}>{wide ? n : n.slice(0, 2)}</span>
        ))}
      </div>
      <div className="month-grid" role="grid">
        {cells.map((d) => {
          const dayItems = byDay.get(d) ?? [];
          const other = !d.startsWith(month);
          const openCount = dayItems.filter((i) => i.status !== 'done').length;
          return (
            <button
              type="button"
              key={d}
              className="month-cell"
              data-other={other}
              data-today={d === today}
              onClick={() => setSheet(d)}
              aria-label={`${d}, ${dayItems.length} items`}
            >
              <span className="month-daynum">{Number(d.slice(-2))}</span>
              {wide ? (
                <span className="month-chips">
                  {dayItems.slice(0, 3).map((i) => (
                    <ItemChip key={i.id} item={i} onOpen={onOpen} />
                  ))}
                  {dayItems.length > 3 && <span className="month-more">+{dayItems.length - 3} more</span>}
                </span>
              ) : (
                dayItems.length > 0 && (
                  <span className="month-dots">
                    {[...new Set(dayItems.map((i) => i.courseId))].slice(0, 4).map((cid) => (
                      <Dot key={cid} course={courseById.get(cid)} />
                    ))}
                    {openCount > 0 && <span className="month-count">{openCount}</span>}
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
      {sheet && <DaySheet date={sheet} items={items} onClose={() => setSheet(null)} onOpen={(i) => { setSheet(null); onOpen(i); }} />}
    </>
  );
}
