import { useStore } from '../storage/store';

/** A small gold flame and the streak, in the top bar (2026-10-02). Nothing until there is a streak to show. */
export function StreakChip() {
  const { progress } = useStore();
  const n = progress.dailyStreak;
  if (n < 1) return null;
  return (
    <a href="#/you?s=progress" className="streak-chip" title={`${n}-day streak${progress.skipUsedThisWeek ? ' (skip day used this week)' : ''}`} aria-label={`${n}-day streak`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none">
        <path d="M8.2 1.5c.4 2.3-1 3.3-2.1 4.6C4.9 7.5 4.3 8.6 4.3 10a3.8 3.8 0 0 0 7.6.2c0-1.6-.8-2.6-1.4-3.4.1 1-.3 1.8-1 2.1.5-2.6-.2-5.4-1.3-7.4Z" fill="currentColor" />
      </svg>
      {n}
    </a>
  );
}
