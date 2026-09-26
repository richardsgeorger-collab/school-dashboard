import { useEffect, useState } from 'react';
import { HaloDraw } from '../components/HaloDraw';
import { useStore } from '../storage/store';

const LEVEL_KEY = 'school-dashboard:seen-level';
const STREAK_KEY = 'school-dashboard:seen-streak';

const read = (k: string): number | null => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const write = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* storage can be off; the moment is still shown once */
  }
};

/**
 * The big moments, saved for when they happen: a level up (a full-screen halo drawing itself and the new number),
 * and a streak growing (a small toast with the flame). Each shows once, on the device where it happened.
 */
export function Celebrations() {
  const { progress } = useStore();
  const [level, setLevel] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    const seen = read(LEVEL_KEY);
    if (seen !== null && progress.level > seen) setLevel(progress.level);
    write(LEVEL_KEY, progress.level);
  }, [progress.level]);
  useEffect(() => {
    const seen = read(STREAK_KEY) ?? 0;
    if (progress.dailyStreak >= 2 && progress.dailyStreak > seen) setStreak(progress.dailyStreak);
    write(STREAK_KEY, progress.dailyStreak);
  }, [progress.dailyStreak]);
  useEffect(() => {
    if (streak === null) return;
    const t = setTimeout(() => setStreak(null), 3200);
    return () => clearTimeout(t);
  }, [streak]);
  return (
    <>
      {level !== null && (
        <div className="levelup" role="dialog" aria-label={`Level ${level}`} onClick={() => setLevel(null)}>
          <div className="levelup-card">
            <HaloDraw size={120} />
            <p className="eyebrow">Level up</p>
            <h2 className="levelup-title">Level {level}.</h2>
            <p className="hint">Tap anywhere to keep going.</p>
          </div>
        </div>
      )}
      {streak !== null && (
        <div className="streak-toast" role="status">
          <span className="streak-flame" aria-hidden>
            🔥
          </span>
          <span>{streak}-day streak</span>
        </div>
      )}
    </>
  );
}
