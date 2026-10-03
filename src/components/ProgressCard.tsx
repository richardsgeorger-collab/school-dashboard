import { BADGE_INFO, BADGES, CLEAN_SWEEP_DAYS, type BadgeId } from '../joy/badges';
import { useStore } from '../storage/store';
import { RecapButton } from './Recap';
import { Flame } from '../joy/StreakChip';
import { Ring } from './Ring';
import { useCountUp } from '../joy/useCountUp';

/** Each badge's mark, drawn in the accent: a sunrise, a shield, a peak, a sparkle. */
const GLYPH: Record<BadgeId, string> = {
  early_bird: 'M3 15h18M6 15a6 6 0 0 1 12 0M12 4v3M5.6 7.6l1.8 1.8M18.4 7.6l-1.8 1.8',
  no_late_week: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3ZM8.5 12l2.5 2.5L15.5 10',
  heavy_week: 'M3 19l6-10 4 6 2-3 6 7H3Z',
  clean_sweep: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16Z',
};

export function ProgressCard() {
  const { progress } = useStore();
  const span = progress.levelCeil - progress.levelFloor;
  const pct = span > 0 ? ((progress.xp - progress.levelFloor) / span) * 100 : 0;
  const xp = useCountUp(progress.xp);
  return (
    <section className="card progress-card" aria-label="Progress" title="Points: item value × 1.5 if done by start-by, × 1 by the due time, × 0.5 late, × your score once graded. Locked at first completion.">
      <div className="progress-head">
        <Ring value={Math.min(100, pct)} max={100} size={64} text={String(progress.level)} label={`Level ${progress.level}, ${Math.round(pct)}% to the next`} />
        <div className="progress-xp">
          <span className="section-title">Level {progress.level}</span>
          <span className="mono">
            {xp} XP <span className="muted">· {progress.levelCeil - progress.xp} to level {progress.level + 1}</span>
          </span>
        </div>
      </div>

      <dl className="streaks">
        <div>
          <dt>Daily streak</dt>
          <dd>
            <Flame size={16} /> {progress.dailyStreak} day{progress.dailyStreak === 1 ? '' : 's'}
            <small>{progress.skipUsedThisWeek ? 'Skip day used this week' : '1 skip day left this week'}</small>
          </dd>
        </div>
        <div>
          <dt>Clean weeks</dt>
          <dd>
            {progress.weeklyCleanStreak} in a row
            <small>{progress.currentWeekClean ? 'Clean so far this week' : 'Something slipped this week'}</small>
          </dd>
        </div>
      </dl>

      <div className="badges">
        {BADGES.map((id) => {
          const b = progress.badges[id];
          const info = BADGE_INFO[id];
          const earned = !!b.earnedAt;
          const status = earned ? (b.count > 1 && id !== 'clean_sweep' ? `Earned ${b.count}×` : 'Earned') : id === 'clean_sweep' ? `${Math.min(b.count, CLEAN_SWEEP_DAYS)} / ${CLEAN_SWEEP_DAYS} days` : 'Not yet';
          return (
            <div key={id} className="badge-tile" data-earned={earned} title={info.how}>
              <svg className="badge-glyph" viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
                <path d={GLYPH[id]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <b>{info.name}</b>
              <span className="hint" title={earned ? `First earned ${b.earnedAt!.slice(0, 10)}` : info.how}>
                {status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="modal-actions" style={{ marginTop: 12 }}>
        <RecapButton />
      </div>
    </section>
  );
}
