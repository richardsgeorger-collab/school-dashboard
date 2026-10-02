import { useEffect, useState } from 'react';
import { TIME_CHOICES } from '../domain/calibration';
import { awardValue } from '../domain/points';
import { classProgress, doneLine } from '../joy/joy';
import { useStore } from '../storage/store';

const ASK_MS = 15_000;

/**
 * After something is marked done: one tap for how long it took, or nothing, and one tap to take the Done back for a
 * mis-tap. Never in the way of the next thing.
 */
export function TimeAsk() {
  const { data, justDone, actions, courseById } = useStore();
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
    if (Number.isFinite(minutes) && minutes > 0) actions.logActual(item.id, minutes);
    actions.dismissTimeAsk();
  };
  // The reward first (2026-10-02): what it was worth and how much of the class is now done, from Halo's own points.
  const code = courseById.get(item.courseId)?.code ?? null;
  const line = doneLine(item.award ? awardValue(item.award) : item.points, code, classProgress(item.courseId, data.items)?.pct ?? null);
  return (
    <div className="time-ask" role="status" aria-live="polite">
      <span className="time-ask-reward">{line}</span>
      <span className="time-ask-q">
        How long did <b>{item.label}</b> take?
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
        <button
          type="button"
          className="diff-toggle time-ask-undo"
          onClick={() => {
            actions.setStatus(item.id, 'todo');
            actions.dismissTimeAsk();
          }}
        >
          undo
        </button>
      </span>
    </div>
  );
}
