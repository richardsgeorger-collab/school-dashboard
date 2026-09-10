import { useMemo, useState } from 'react';
import { ItemChip, chipState, isBig } from '../../components/ItemChip';
import { dayCapacity } from '../../domain/schedule';
import { monthGrid } from '../../domain/calendar';
import { dateOf } from '../../domain/dates';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { DaySheet } from './DaySheet';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS = 2;

/** 0–4: how loaded a day is, from open items due and planned study against capacity. */
function warmth(openCount: number, planned: number, capacity: number): number {
  const byCount = openCount >= 6 ? 4 : openCount >= 4 ? 3 : openCount >= 3 ? 2 : openCount >= 1 ? 1 : 0;
  const ratio = capacity ? planned / capacity : 0;
  // Planned study alone stays subtle (max 2); only what is actually due gets loud.
  const byLoad = ratio >= 0.75 ? 2 : ratio > 0 ? 1 : 0;
  return Math.max(byCount, byLoad);
}

export function MonthView({ month, items, onOpen }: { month: string; items: Item[]; onOpen: (i: Item) => void }) {
  const { data, today, schedule } = useStore();
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
          const states = open.map((i) => chipState(i, schedule.byItem[i.id], today, tz));
          const marker = states.includes('overdue') ? 'overdue' : null;
          const level = other ? 0 : warmth(open.length, schedule.loadByDay[d] ?? 0, dayCapacity(data.settings, d));
          const big = open.some(isBig);
          const shown = wide ? open.slice(0, MAX_CHIPS) : [];
          const rest = open.length - shown.length;
          return (
            <button
              type="button"
              key={d}
              className="month-cell"
              data-other={other}
              data-today={d === today}
              data-level={level}
              data-marker={marker ?? undefined}
              onClick={() => setSheet(d)}
              aria-label={`${d}, ${open.length} open items${big ? ', includes a big item' : ''}`}
            >
              <span className="month-cell-top">
                <span className="month-daynum">{Number(d.slice(-2))}</span>
                {open.length > 0 && (
                  <span className="month-count" data-bold={open.length >= 4} data-big={big}>
                    {open.length}
                  </span>
                )}
              </span>
              {wide ? (
                <span className="month-chips">
                  {shown.map((i) => (
                    <ItemChip key={i.id} item={i} onOpen={onOpen} plain />
                  ))}
                  {rest > 0 && <span className="month-more">+{rest}</span>}
                </span>
              ) : (
                big && <span className="month-big" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      {sheet && <DaySheet date={sheet} items={items} onClose={() => setSheet(null)} onOpen={(i) => { setSheet(null); onOpen(i); }} />}
    </>
  );
}
