import { useMemo } from 'react';
import { CourseChip, useCourseColor } from '../../components/CourseChip';
import { fmtDate } from '../../domain/dates';
import { termShape, type ClassStake, type TermWeek } from '../../domain/termShape';
import type { Item } from '../../domain/types';
import { useStore } from '../../storage/store';

function Stake({ s }: { s: ClassStake }) {
  const color = useCourseColor(s.course);
  const pct = (n: number) => (s.total ? (n / s.total) * 100 : 0);
  return (
    <li className="stake" style={{ '--course': color } as React.CSSProperties}>
      <span className="stake-name">
        <CourseChip course={s.course} link />
      </span>
      <span className="stake-bar" role="img" aria-label={`${s.banked} banked, ${s.lost} lost, ${s.atStake} still at stake of ${s.total}`}>
        <span className="banked" style={{ width: `${pct(s.banked)}%` }} />
        <span className="lost" style={{ width: `${pct(s.lost)}%` }} />
      </span>
      <span className="stake-num mono">
        {s.banked}
        {s.lost ? <span className="muted">+{s.lost} lost</span> : null} · {s.atStake} at stake
      </span>
    </li>
  );
}

/** The term as a shape: week heights, where the big things sit, the midpoint, what is banked per class. Not a calendar. */
export function TermView({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  const { data, term, today } = useStore();
  const tz = data.settings.timezone;
  const shape = useMemo(() => termShape(items, data.courses, term, today, tz, data.settings.weekStartsOn), [items, data.courses, term, today, tz, data.settings.weekStartsOn]);
  const brutal = shape.weeks.filter((w) => w.brutal);
  const bigs = shape.weeks.flatMap((w) => w.big.map((i) => ({ i, w })));
  return (
    <div className="term">
      <p className="hint">
        {Math.round(shape.elapsed * 100)}% of the term gone{today < shape.midpoint ? `, midpoint ${fmtDate(shape.midpoint, 'short')}` : ', past the midpoint'}.{' '}
        {brutal.length ? `Heaviest: week${brutal.length === 1 ? '' : 's'} ${brutal.map((w) => w.index).join(', ')}.` : 'No week stands out yet.'}
      </p>
      {(data.settings.termPlan?.weeks ?? []).some((w) => w.start >= today && (w.load === 'brutal' || w.load === 'heavy') && w.why) && (
        <p className="hint">
          <span className="ai-from">AI</span>{' '}
          {(data.settings.termPlan?.weeks ?? [])
            .filter((w) => w.start >= today && (w.load === 'brutal' || w.load === 'heavy') && w.why)
            .slice(0, 4)
            .map((w) => `${fmtDate(w.start, 'short')}: ${w.why}${w.load === 'brutal' ? ' (brutal)' : ''}`)
            .join(' · ')}
        </p>
      )}
      <ol className="term-weeks" aria-label="Points due by week">
        {shape.weeks.map((w: TermWeek) => (
          <li key={w.start} className="term-week" data-current={w.current} data-brutal={w.brutal} data-past={w.end < today} title={`Week ${w.index}, ${fmtDate(w.start, 'short')}: ${w.points} pts, ${w.items} items`}>
            <span className="term-bar" style={{ height: `${Math.max(3, (w.points / shape.maxPoints) * 100)}%` }} />
            <span className="term-marks">
              {w.big.slice(0, 3).map((i) => (
                <button key={i.id} type="button" className={`term-mark ${i.type === 'exam' ? 'exam' : 'big'}`} title={`${i.label} · ${i.points} pts`} onClick={() => onOpen(i)} aria-label={i.label} />
              ))}
            </span>
            <span className="term-num mono">{w.index}</span>
          </li>
        ))}
      </ol>
      <p className="term-legend hint mono">
        <span className="term-mark exam" /> exam <span className="term-mark big" /> 100+ pts · bar height = points due that week
      </p>
      {bigs.length > 0 && (
        <ul className="term-bigs">
          {bigs.map(({ i, w }) => (
            <li key={i.id}>
              <button type="button" className="diff-toggle" onClick={() => onOpen(i)}>
                {i.label}
              </button>{' '}
              <span className="muted mono">
                wk {w.index} · {fmtDate(w.start, 'short')} · {i.points} pts{i.status === 'done' ? ' · done' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="section-title">banked · still at stake</h3>
      <ul className="stakes">
        {shape.stakes.map((s) => (
          <Stake key={s.course.id} s={s} />
        ))}
      </ul>
    </div>
  );
}
