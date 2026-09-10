import { BADGE_INFO, EARLY_BIRD_TARGET, type BadgeId } from '../domain/points';
import { useStore } from '../storage/store';
import { RecapButton } from './Recap';

const BADGES: BadgeId[] = ['early_bird', 'survived_week', 'clean_sweep'];

export function ProgressCard() {
  const { progress } = useStore();
  const span = progress.levelCeil - progress.levelFloor;
  const pct = span > 0 ? ((progress.xp - progress.levelFloor) / span) * 100 : 0;
  return (
    <section className="card progress-card" aria-label="Progress">
      <div className="progress-head">
        <div>
          <span className="section-title">Level</span>
          <div className="progress-level">{progress.level}</div>
        </div>
        <div className="progress-xp">
          <span className="mono">
            {progress.xp} XP <span className="muted">· {progress.levelCeil - progress.xp} to level {progress.level + 1}</span>
          </span>
          <span className="levelbar-track big" aria-hidden>
            <span className="levelbar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
        </div>
      </div>

      <dl className="streaks">
        <div>
          <dt>Daily streak</dt>
          <dd>
            <span aria-hidden>🔥</span> {progress.dailyStreak} day{progress.dailyStreak === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt>Clean weeks</dt>
          <dd>
            {progress.weeklyCleanStreak} in a row
            <small>{progress.currentWeekClean ? ' · this week clean so far' : ' · this week has a slip'}</small>
          </dd>
        </div>
      </dl>

      <div className="badges">
        {BADGES.map((id) => {
          const earned = progress.badges[id];
          const info = BADGE_INFO[id];
          const hint = id === 'early_bird' && !earned ? `${Math.min(progress.earlyCount, EARLY_BIRD_TARGET)} / ${EARLY_BIRD_TARGET}` : null;
          return (
            <div key={id} className="badge-tile" data-earned={!!earned} title={info.how}>
              <span className="badge-glyph" aria-hidden>
                {info.glyph}
              </span>
              <b>{info.name}</b>
              <span className="hint">{earned ? `Earned ${earned.slice(0, 10)}` : (hint ?? 'Locked')}</span>
            </div>
          );
        })}
      </div>

      <div className="modal-actions" style={{ marginTop: 12 }}>
        <RecapButton />
      </div>
      <p className="hint">
        Points: item value × 1.5 if done by start-by, × 1 by the due time, × 0.5 late, × your score once graded. Locked at first completion.
      </p>
    </section>
  );
}
