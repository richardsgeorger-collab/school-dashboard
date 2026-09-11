import { useEffect, useState } from 'react';
import { TIME_CHOICES } from '../domain/calibration';
import { useStore } from '../storage/store';

const ASK_MS = 15_000;

/** After something is marked done: one tap for how long it took, or nothing. Never in the way of the next thing. */
export function TimeAsk() {
  const { data, justDone, actions } = useStore();
  const [other, setOther] = useState(false);
  const [val, setVal] = useState('');
  const at = justDone?.at ?? null;
  useEffect(() => {
    if (!at) return;
    setOther(false);
    setVal('');
    const t = setTimeout(() => actions.dismissTimeAsk(), ASK_MS);
    return () => clearTimeout(t);
  }, [at, actions]);
  const item = justDone ? data.items.find((i) => i.id === justDone.id) : null;
  if (!justDone || !item || item.status !== 'done') return null;
  const log = (minutes: number) => {
    if (Number.isFinite(minutes) && minutes > 0) actions.upsertItem({ ...item, actualMinutes: Math.round(minutes) });
    actions.dismissTimeAsk();
  };
  return (
    <div className="time-ask" role="status" aria-live="polite">
      <span className="time-ask-q">
        Done. How long did <b>{item.label}</b> take?
      </span>
      <span className="time-ask-btns">
        {TIME_CHOICES.map((c) => (
          <button key={c.minutes} type="button" className="btn small" onClick={() => log(c.minutes)}>
            {c.label}
          </button>
        ))}
        {other ? (
          <input
            className="time-ask-other"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="min"
            autoFocus
            value={val}
            aria-label="Minutes it took"
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && log(Number(val))}
            onBlur={() => val && log(Number(val))}
          />
        ) : (
          <button type="button" className="btn small" onClick={() => setOther(true)}>
            other
          </button>
        )}
        <button type="button" className="diff-toggle" onClick={() => actions.dismissTimeAsk()}>
          skip
        </button>
      </span>
    </div>
  );
}
