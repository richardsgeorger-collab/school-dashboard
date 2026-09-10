import { ItemRow } from '../../components/ItemRow';
import { Modal } from '../../components/Modal';
import { dateOf, fmtDate, fmtMinutes } from '../../domain/dates';
import { dayCapacity } from '../../domain/schedule';
import type { DateStr, Item } from '../../domain/types';
import { useStore } from '../../storage/store';
import { EmptyState } from '../../components/EmptyState';

export function DaySheet({ date, items, onClose, onOpen }: { date: DateStr; items: Item[]; onClose: () => void; onOpen: (i: Item) => void }) {
  const { data, schedule, today } = useStore();
  const tz = data.settings.timezone;
  const due = items.filter((i) => dateOf(i.dueAt, tz) === date).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const planned = schedule.loadByDay[date] ?? 0;
  const startingIds = Object.values(schedule.byItem).filter((s) => s.startBy === date).map((s) => s.itemId);
  const starting = items.filter((i) => startingIds.includes(i.id) && i.status !== 'done' && !due.includes(i));

  return (
    <Modal title={date === today ? `Today, ${fmtDate(date, 'short')}` : fmtDate(date, 'long')} onClose={onClose}>
      <div className="modal-body">
        <p className="hint mono">
          {fmtMinutes(planned)} planned of {fmtMinutes(dayCapacity(data.settings, date))} study time
        </p>
        <div>
          <h3 className="section-title">
            Due <span className="count">{due.length}</span>
          </h3>
          <ul className="item-list" style={{ marginTop: 6 }}>
            {due.length === 0 && <EmptyState>Nothing due.</EmptyState>}
            {due.map((i) => (
              <ItemRow key={i.id} item={i} onOpen={onOpen} />
            ))}
          </ul>
        </div>
        {starting.length > 0 && (
          <div>
            <h3 className="section-title">
              Start by this day <span className="count">{starting.length}</span>
            </h3>
            <ul className="item-list" style={{ marginTop: 6 }}>
              {starting.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
