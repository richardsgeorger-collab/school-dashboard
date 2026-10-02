import { addDays, weekdayOf } from '../domain/dates';
import { useCan } from '../config/useCan';
import { useStore } from '../storage/store';
import { HaloDraw } from '../components/HaloDraw';
import { weekWrap, wrapLine } from './wrap';

/**
 * Monday on Now (2026-10-02): last week in one line, "Last week: 9 things turned in, 620 pts. Best week yet.", until
 * it is waved off. Same plans as the Sunday push (the weekly recap); nothing on a week with nothing turned in.
 */
export function WrapCard() {
  const { data, today, actions } = useStore();
  const allowed = useCan('weeklyRecap');
  if (!allowed || weekdayOf(today) !== 1) return null;
  const sunday = addDays(today, -1);
  if (data.settings.joy?.wrapSeen === sunday) return null;
  const w = weekWrap(data.items, sunday, data.settings.timezone);
  const line = wrapLine(w, 'Last week');
  if (!line) return null;
  const done = () => actions.updateSettings({ joy: { ...(data.settings.joy ?? {}), wrapSeen: sunday } });
  return (
    <section className="card wrap-card" data-best={w.best || undefined} aria-label="Last week">
      <HaloDraw size={34} />
      <p className="wrap-line">{line}</p>
      <button type="button" className="btn small" onClick={done}>
        Nice
      </button>
    </section>
  );
}
