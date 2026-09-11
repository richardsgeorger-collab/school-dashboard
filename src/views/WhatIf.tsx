import { useMemo, useState } from 'react';
import { neededFor, projectWith, weights, type RestAssumption } from '../domain/whatif';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';

const TARGETS = [90, 80, 70];

/** Grade what-if for one class. Reads only; nothing here writes a score. */
export function WhatIf({ course }: { course: Course }) {
  const { data } = useStore();
  const ws = useMemo(() => weights(course.id, data.items), [course.id, data.items]);
  const open = ws.filter((w) => !w.graded);
  const [pickId, setPickId] = useState<string>('');
  const [score, setScore] = useState<string>('');
  const [target, setTarget] = useState<number>(90);
  const [needId, setNeedId] = useState<string>('');
  const [rest, setRest] = useState<RestAssumption>('average');
  const pick: Item | undefined = open.find((w) => w.item.id === (pickId || open[0]?.item.id))?.item;
  // Both questions start on the biggest open item: that is the one the answer depends on.
  const need: Item | undefined = open.find((w) => w.item.id === (needId || open[0]?.item.id))?.item;
  const proj = pick && score.trim() !== '' && Number.isFinite(Number(score)) ? projectWith(course.id, data.items, pick.id, Number(score)) : null;
  const needed = need ? neededFor(course.id, data.items, need.id, target, rest) : null;

  if (open.length === 0) return <p className="hint">Everything is graded. Nothing left to play with.</p>;
  return (
    <div className="whatif">
      <div className="whatif-block">
        <h3>What each open item is worth</h3>
        <ul className="whatif-weights">
          {open.slice(0, 8).map((w) => (
            <li key={w.item.id}>
              <span className="whatif-bar" style={{ width: `${Math.min(100, w.pct * 2)}%` }} aria-hidden />
              <span className="whatif-name">{w.item.label}</span>
              <span className="mono muted">
                {w.item.points} pts · {w.pct}% of the class
              </span>
            </li>
          ))}
          {open.length > 8 && <li className="hint">and {open.length - 8} smaller ones</li>}
        </ul>
      </div>

      <div className="whatif-block">
        <h3>If I score</h3>
        <div className="whatif-row">
          <input className="whatif-num" type="number" min={0} step={0.5} inputMode="decimal" value={score} placeholder="pts" aria-label="Hypothetical score" onChange={(e) => setScore(e.target.value)} />
          <span>/ {pick?.points ?? '—'} on</span>
          <select value={pick?.id ?? ''} onChange={(e) => setPickId(e.target.value)} aria-label="Item for the hypothetical score">
            {open.map((w) => (
              <option key={w.item.id} value={w.item.id}>
                {w.item.label}
              </option>
            ))}
          </select>
        </div>
        <p className="whatif-out mono" data-live={!!proj}>
          {proj ? `average ${proj.average ?? '—'}% · whole class ${proj.projected ?? '—'}% if the rest scores the same` : 'Type a score to see the class grade move.'}
        </p>
      </div>

      <div className="whatif-block">
        <h3>What do I need</h3>
        <div className="whatif-row">
          <span>To land</span>
          <span className="whatif-targets">
            {TARGETS.map((t) => (
              <button key={t} type="button" className="btn small" data-on={target === t} onClick={() => setTarget(t)}>
                {t}%
              </button>
            ))}
            <input className="whatif-num" type="number" min={0} max={100} value={target} aria-label="Target percent" onChange={(e) => setTarget(Number(e.target.value))} />
          </span>
          <span>on</span>
          <select value={need?.id ?? ''} onChange={(e) => setNeedId(e.target.value)} aria-label="Item to solve for">
            {open.map((w) => (
              <option key={w.item.id} value={w.item.id}>
                {w.item.label}
              </option>
            ))}
          </select>
          <select value={rest} onChange={(e) => setRest(e.target.value as RestAssumption)} aria-label="Assumption for the rest">
            <option value="average">rest at my average</option>
            <option value="perfect">rest perfect</option>
          </select>
        </div>
        <p className="whatif-out mono" data-live={!!needed}>
          {!needed
            ? 'Pick an open item.'
            : needed.alreadyThere
              ? `Already there: even a zero on ${need?.label} keeps ${target}%.`
              : !needed.reachable
                ? `Out of reach: a perfect ${need?.points} on ${need?.label} would not get to ${target}% with the rest at ${needed.restAt}%.`
                : `${needed.points} of ${need?.points} (${needed.pctOfItem}%) on ${need?.label}, with the rest at ${needed.restAt}%.`}
        </p>
      </div>
    </div>
  );
}
