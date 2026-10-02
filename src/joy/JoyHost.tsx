import { useEffect, useMemo, useRef, useState } from 'react';
import { HaloDraw } from '../components/HaloDraw';
import { maxOpen } from '../onboarding/maxState';
import { isOpen } from '../onboarding/state';
import { useAccount } from '../auth/AccountContext';
import { useStore } from '../storage/store';
import { classProgress, milestoneOf } from './joy';
import { streakMilestone } from './streak';

/**
 * Where the rewards show (2026-10-02). Small things are a toast under the top bar or a glow; the big ones (confetti)
 * are only for real submissions, clearing the day and finishing a class, and only while Celebrations is on (You →
 * Display). Reduced motion gets a soft fade instead of movement. No sounds; a light tap of haptics on phones that
 * have it. Other screens ask for a moment with joy(): one event, so every moment goes through the same rules.
 */
export interface JoyEvent {
  text: string;
  /** Confetti with it (a real submission, a clear day, a finished class). */
  big?: boolean;
  /** A card instead of a toast: the finished class. */
  card?: { title: string; body: string };
}

export function joy(e: JoyEvent): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<JoyEvent>('halo-joy', { detail: e }));
}

export const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not on this device */
  }
}

const GOLD = ['var(--accent)', 'var(--halo, #f2c14e)', '#f6d77a', '#e0a526', 'var(--accent-soft)'];

/** Gold confetti from the top, gone in about two seconds. Reduced motion: one soft gold glow that fades. */
export function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(seed * 997 + i * 31 + n * 7.7) * 10000;
          return x - Math.floor(x);
        };
        return { left: r(1) * 100, delay: r(2) * 0.35, dur: 1.3 + r(3) * 0.9, drift: (r(4) - 0.5) * 140, rot: r(5) * 720 - 360, size: 6 + r(6) * 7, color: GOLD[Math.floor(r(7) * GOLD.length)], round: r(8) > 0.6 };
      }),
    [seed],
  );
  if (reducedMotion()) return <div className="joy-glow" aria-hidden />;
  return (
    <div className="joy-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{ left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? '50%' : 2, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--drift': `${p.drift}px`, '--rot': `${p.rot}deg` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function JoyHost() {
  const { data, justDone, actions } = useStore();
  const celebrate = data.settings.celebrations !== false;
  const settled = useSettled();
  const firstRun = !settled || isOpen(data.settings.onboarding) || maxOpen(data.settings.maxOnboarding);
  const [queue, setQueue] = useState<(JoyEvent & { id: number })[]>([]);
  const [confetti, setConfetti] = useState<number | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const seq = useRef(0);
  const current = queue[0] ?? null;

  // Where the last tap was: a check-off bursts from the checkbox the student touched.
  useEffect(() => {
    const on = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, at: Date.now() };
    };
    window.addEventListener('pointerdown', on, true);
    return () => window.removeEventListener('pointerdown', on, true);
  }, []);
  // Anything asks for a moment.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<JoyEvent>).detail;
      // The id is taken now, not inside the state update: two moments queued in the same tick must not share one.
      seq.current += 1;
      const id = seq.current;
      setQueue((q) => [...q, { ...d, id }]);
    };
    window.addEventListener('halo-joy', on);
    return () => window.removeEventListener('halo-joy', on);
  }, []);
  // One at a time: a toast for three and a half seconds; a card until it is closed.
  useEffect(() => {
    if (!current) return;
    if (current.big && celebrate) setConfetti(current.id);
    haptic(current.big ? 20 : 10);
    if (current.card) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 3500);
    return () => clearTimeout(t);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (confetti === null) return;
    const t = setTimeout(() => setConfetti(null), 2600);
    return () => clearTimeout(t);
  }, [confetti]);

  // A check-off: a short gold halo burst where it was tapped (under a second).
  useEffect(() => {
    if (!justDone || !celebrate) return;
    haptic(12);
    const p = pointer.current;
    if (!p || Date.now() - p.at > 2500) return;
    setBurst({ x: p.x, y: p.y, key: Date.now() });
    const t = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(t);
  }, [justDone?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // What a sync found, once, on the next open (never over the first-run screens).
  const pending = data.settings.joy?.pending ?? null;
  useEffect(() => {
    if (!pending || firstRun) return;
    const n = pending.turnedIn ?? 0;
    if (n > 0) joy({ text: `Nice. ${n} ${n === 1 ? 'thing' : 'things'} turned in since last sync.`, big: true });
    for (const g of pending.gradeUps ?? []) joy({ text: `Your ${g.code} grade went up to ${g.percent}%.` });
    actions.updateSettings({ joy: { ...(data.settings.joy ?? {}), pending: null } });
  }, [pending?.at, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Class milestones: 25, 50 and 75 are a toast; 100 is the finished-class card with confetti. A class seen for the
  // first time is recorded quietly (a first sync is history); a class that went back down can be celebrated again.
  const progressKey = useMemo(() => data.courses.map((c) => `${c.id}:${classProgress(c.id, data.items)?.pct ?? 'x'}`).join('|'), [data.courses, data.items]);
  useEffect(() => {
    if (firstRun) return;
    const seen = { ...(data.settings.joy?.classSeen ?? {}) };
    let changed = false;
    for (const c of data.courses) {
      const p = classProgress(c.id, data.items);
      if (!p) continue;
      const m = milestoneOf(p.pct);
      const was = seen[c.id];
      if (was === undefined) {
        seen[c.id] = m;
        changed = true;
      } else if (m > was) {
        seen[c.id] = m;
        changed = true;
        if (m === 100) joy({ text: `You finished ${c.code}.`, big: true, card: { title: `You finished ${c.code}.`, body: `Every Halo assignment in ${c.name || c.code} is turned in or done: ${p.total} points of work.` } });
        else joy({ text: `${c.code} is ${m}% done.` });
      } else if (m < was) {
        seen[c.id] = m;
        changed = true;
      }
    }
    if (changed) actions.updateSettings({ joy: { ...(data.settings.joy ?? {}), classSeen: seen } });
  }, [progressKey, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Streak milestones: 3, 7, 14 and 30 days, a toast each, once (on any device). A broken streak can earn them again.
  const { progress } = useStore();
  useEffect(() => {
    if (firstRun) return;
    const m = streakMilestone(progress.dailyStreak);
    const seen = data.settings.joy?.streakSeen;
    if (seen === undefined) {
      actions.updateSettings({ joy: { ...(data.settings.joy ?? {}), streakSeen: m } });
      return;
    }
    if (m > seen) joy({ text: `${progress.dailyStreak}-day streak going.` });
    if (m !== seen) actions.updateSettings({ joy: { ...(data.settings.joy ?? {}), streakSeen: m } });
  }, [progress.dailyStreak, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setQueue((q) => q.slice(1));
  return (
    <>
      {burst && (
        <span className="joy-burst" style={{ left: burst.x, top: burst.y }} aria-hidden key={burst.key}>
          <i />
          <i />
        </span>
      )}
      {confetti !== null && celebrate && <Confetti seed={confetti} />}
      {current && !current.card && (
        <div className="joy-toast" role="status" aria-live="polite" key={current.id}>
          <span className="joy-toast-mark" aria-hidden>
            <HaloDraw size={18} />
          </span>
          {current.text}
        </div>
      )}
      {current?.card && (
        <div className="joy-card-wrap" role="dialog" aria-label={current.card.title} onClick={close}>
          <div className="joy-card" onClick={(e) => e.stopPropagation()}>
            <HaloDraw size={88} />
            <h2 className="joy-card-title">{current.card.title}</h2>
            <p className="joy-card-body">{current.card.body}</p>
            <button type="button" className="btn primary" autoFocus onClick={close}>
              Nice
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The account has finished loading on this device. Before that the planner is empty or half there, and anything
 * compared against it (a level, a streak, a class milestone) would look like a jump that never happened.
 */
export function useSettled(): boolean {
  const { sync } = useStore();
  const { auth } = useAccount();
  const signedIn = !!auth.session || !!auth.knownUserId;
  if (!signedIn) return !auth.loading;
  return sync.status === 'synced' || sync.status === 'error';
}
