import { ItemRow } from '../components/ItemRow';
import type { WelcomeBack as Summary } from '../domain/away';
import type { Item } from '../domain/types';

/** After days away: what changed, what slipped, and the one thing to start with. Everything else waits behind one button. */
export function WelcomeBack({ summary, first, onOpen, onShowAll }: { summary: Summary; first: Item | null; onOpen: (item: Item) => void; onShowAll: () => void }) {
  const { days, missed, changed } = summary;
  const parts: string[] = [];
  if (missed.length) parts.push(`${missed.length} thing${missed.length === 1 ? '' : 's'} went past ${missed.length === 1 ? 'its' : 'their'} day`);
  if (changed.length) parts.push(`${changed.length} sync change${changed.length === 1 ? '' : 's'}`);
  return (
    <section className="calm welcome" data-tone="fine" aria-label="Welcome back">
      <h1 className="calm-title">Welcome back.</h1>
      <p className="calm-text">
        {days} days away. {parts.length ? `${parts.join(', ')}.` : 'Nothing slipped and nothing changed.'}
      </p>
      {missed.length > 0 && (
        <ul className="item-list welcome-list">
          {missed.slice(0, 4).map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} />
          ))}
          {missed.length > 4 && <li className="hint">+ {missed.length - 4} more</li>}
        </ul>
      )}
      {first && (
        <p className="welcome-first">
          First:{' '}
          <button type="button" className="welcome-link" onClick={() => onOpen(first)}>
            {first.label}
          </button>
        </p>
      )}
      <button type="button" className="calm-more" onClick={onShowAll}>
        show everything
      </button>
    </section>
  );
}
