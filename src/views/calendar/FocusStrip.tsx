import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ItemRow } from '../../components/ItemRow';
import type { Item, Risk } from '../../domain/types';
import { useStore } from '../../storage/store';
import { useLinger } from '../../ui/useLinger';

const ORDER: NonNullable<Risk>[] = ['overdue', 'at_risk', 'start_today', 'due_soon'];
const PILL: Record<NonNullable<Risk>, string> = { overdue: 'overdue', at_risk: 'at risk', start_today: 'to start today', due_soon: 'due soon' };
const SHOW = 6;

/** The "what do I do" layer: risk counts and a single ordered list of what to act on. */
export function FocusStrip({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  const { schedule } = useStore();
  const [all, setAll] = useState(false);

  const { groups, list } = useMemo(() => {
    const groups: Record<NonNullable<Risk>, Item[]> = { overdue: [], at_risk: [], start_today: [], due_soon: [] };
    for (const i of items) {
      if (i.status === 'done') continue;
      const r = schedule.byItem[i.id]?.risk;
      if (r) groups[r].push(i);
    }
    const byDeadline = (a: Item, b: Item) => (schedule.byItem[a.id].deadlineDay + a.dueAt).localeCompare(schedule.byItem[b.id].deadlineDay + b.dueAt);
    const list = ORDER.flatMap((r) => groups[r].sort(byDeadline));
    return { groups, list };
  }, [items, schedule]);

  const shown = useLinger(all ? list : list.slice(0, SHOW), items);
  const visible = shown;

  return (
    <section className="focus" aria-label="Do next">
      <div className="status-strip" style={{ marginTop: 0 }}>
        {ORDER.filter((r) => groups[r].length > 0).map((r) => (
          <span key={r} className="status-pill" data-risk={r}>
            <b>{groups[r].length}</b> {PILL[r]}
          </span>
        ))}
        {list.length === 0 && <span className="status-pill">Nothing urgent</span>}
      </div>
      <div className="focus-head">
        <h2 className="section-title">
          Do next <span className="count">{list.length}</span>
        </h2>
        {list.length > SHOW && (
          <button type="button" className="btn small" onClick={() => setAll((a) => !a)}>
            {all ? 'Show fewer' : `Show all ${list.length}`}
          </button>
        )}
      </div>
      <ul className="item-list">
        {visible.length === 0 && <EmptyState>Nothing to start or chase today. Pick something ahead from the calendar, or rest.</EmptyState>}
        {visible.map((i) => (
          <ItemRow key={i.id} item={i} onOpen={onOpen} compact showStart />
        ))}
      </ul>
    </section>
  );
}
