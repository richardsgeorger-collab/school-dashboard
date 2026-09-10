import { useState } from 'react';
import { fmtDate } from '../domain/dates';
import type { Recap as RecapData } from '../domain/points';
import { useStore } from '../storage/store';
import { Modal } from './Modal';

function RecapBody({ r }: { r: RecapData }) {
  const { progress } = useStore();
  return (
    <div className="recap">
      <div className="recap-stats">
        <div>
          <b className="mono">{r.points}</b>
          <span>points earned</span>
        </div>
        <div>
          <b className="mono">{r.completed}</b>
          <span>finished{r.early ? `, ${r.early} early` : ''}</span>
        </div>
        <div>
          <b className="mono" data-bad={r.late > 0}>
            {r.late}
          </b>
          <span>late</span>
        </div>
        <div>
          <b className="mono" data-bad={r.missed.length > 0}>
            {r.missed.length}
          </b>
          <span>missed</span>
        </div>
      </div>
      <p className="recap-line">
        {r.clean ? 'Clean week: nothing late, nothing missed.' : 'Not a clean week.'}{' '}
        {progress.weeklyCleanStreak > 0 ? `${progress.weeklyCleanStreak} clean week${progress.weeklyCleanStreak === 1 ? '' : 's'} in a row.` : ''}{' '}
        {progress.dailyStreak > 0 ? `Daily streak is ${progress.dailyStreak}.` : 'No daily streak going.'}
      </p>
      {r.missed.length > 0 && (
        <div>
          <h3 className="section-title">What slipped</h3>
          <ul className="recap-missed">
            {r.missed.map((i) => (
              <li key={i.id}>
                <b>{i.label}</b> <span className="muted">{i.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RecapCard() {
  const { progress } = useStore();
  const r = progress.lastWeek;
  if (r.dueCount === 0 && r.completed === 0) return null;
  return (
    <section className="card recap-card" aria-label="Weekly recap">
      <h2 className="section-title">
        Last week <span className="count">{fmtDate(r.weekStart, 'short')} – {fmtDate(r.weekEnd, 'short')}</span>
      </h2>
      <RecapBody r={r} />
    </section>
  );
}

export function RecapButton() {
  const { progress } = useStore();
  const [open, setOpen] = useState(false);
  const r = progress.lastWeek;
  return (
    <>
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        Last week's recap
      </button>
      {open && (
        <Modal title={`Week of ${fmtDate(r.weekStart, 'short')}`} onClose={() => setOpen(false)}>
          <RecapBody r={r} />
        </Modal>
      )}
    </>
  );
}
