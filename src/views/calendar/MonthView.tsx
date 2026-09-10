import { useMemo, useState } from 'react';
import { DayBar, ItemChip, chipState } from '../../components/ItemChip';
import { monthGrid } from '../../domain/calendar';
import { dateOf } from '../../domain/dates';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { DaySheet } from './DaySheet';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS = 5;
const HEAVY_COUNT = 4;

export function MonthView({ month, items, onOpen }: { month: string; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, today, schedule, isDark } = useStore();
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
      <div className="month-grid" role="grid" data-wide={wide}>
        {cells.map((d) => {
          const dayItems = byDay.get(d) ?? [];
          const open = dayItems.filter((i) => i.status !== 'done');
          const other = !d.startsWith(month);
          const states = dayItems.map((i) => chipState(i, schedule.byItem[i.id], today, tz));
          const marker = states.includes('overdue') ? 'overdue' : null;
          const heavy = open.length >= HEAVY_COUNT;
          const shown = wide ? dayItems.slice(0, MAX_CHIPS) : [];
          const rest = wide ? dayItems.slice(MAX_CHIPS) : dayItems;
          return (
            <button
              type="button"
              key={d}
              className="month-cell"
              data-other={other}
              data-today={d === today}
              data-heavy={heavy && !other}
              data-marker={marker ?? undefined}
              onClick={() => setSheet(d)}
              aria-label={`${d}, ${dayItems.length} items${heavy ? ', heavy day' : ''}`}
            >
              <span className="month-cell-top">
                <span className="month-daynum">{Number(d.slice(-2))}</span>
                {open.length > 0 && (
                  <span className="month-count" data-bold={open.length >= 4}>
                    {open.length}
                  </span>
                )}
              </span>
              {wide ? (
                <span className="month-chips">
                  {shown.map((i) => (
                    <ItemChip key={i.id} item={i} onOpen={onOpen} />
                  ))}
                  {rest.length > 0 && <DayBar items={rest} courses={data.courses} isDark={isDark} label={`+${rest.length}`} />}
                </span>
              ) : (
                <DayBar items={rest} courses={data.courses} isDark={isDark} />
              )}
            </button>
          );
        })}
      </div>
      {sheet && <DaySheet date={sheet} items={items} onClose={() => setSheet(null)} onOpen={(i) => { setSheet(null); onOpen(i); }} />}
    </>
  );
}
