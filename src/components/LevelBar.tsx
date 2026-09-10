import { useStore } from '../storage/store';

/** Compact level + XP bar for the calendar header. */
export function LevelBar() {
  const { progress } = useStore();
  const span = progress.levelCeil - progress.levelFloor;
  const pct = span > 0 ? ((progress.xp - progress.levelFloor) / span) * 100 : 0;
  return (
    <a href="#/plan" className="levelbar" aria-label={`Level ${progress.level}, ${progress.xp} XP, ${progress.dailyStreak} day streak`}>
      <span className="levelbar-lv">Lv {progress.level}</span>
      <span className="levelbar-track" aria-hidden>
        <span className="levelbar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="levelbar-xp mono">
        {progress.xp} <span className="muted">/ {progress.levelCeil}</span>
      </span>
      {progress.dailyStreak > 0 && (
        <span className="levelbar-streak" title={`${progress.dailyStreak}-day streak`}>
          <span aria-hidden>🔥</span> {progress.dailyStreak}
        </span>
      )}
    </a>
  );
}
