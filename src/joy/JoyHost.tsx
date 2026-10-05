import { useEffect, useMemo, useRef, useState } from 'react';
import { HaloDraw } from '../components/HaloDraw';
import { maxOpen } from '../onboarding/maxState';
import { isOpen } from '../onboarding/state';
import { useAccount } from '../auth/AccountContext';
import { useStore } from '../storage/store';
import { weekStart as weekStartOf } from '../domain/dates';
import { badgeMoment } from './badges';
import { bestDay, bestDayMoment, termMilestone, termMoment, turnedInCount, weekCleared, weekMoment } from './joy';
import { classMilestoneMoment, classProgress, gradeUpMoment, gradedMoment, milestoneOf, streakMoment, syncMoment, topicMoment, topicsCleared, type JoyEvent } from './joy';
import { streakMilestone } from './streak';
import { BADGES, type BadgeId } from './badges';
import { JOY_SNAP_SLOT, joySnap } from './extSnapshot';

/**
 * Where the rewards show (2026-10-02). Small things are a toast under the top bar or a glow; the big ones (confetti)
 * are only for real submissions, clearing the day and finishing a class, and only while Celebrations is on (You →
 * Display). Reduced motion gets a soft fade instead of movement. No sounds; a light tap of haptics on phones that
 * have it. Other screens ask for a moment with joy(): one event, so every moment goes through the same rules.
 */
export type { JoyEvent };

export function joy(e: JoyEvent): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<JoyEvent>('halo-joy', { detail: e }));
}

/** Admin's Celebrations preview can ask for the reduced-motion versions on a device that has not asked for them. */
let previewReduced = false;
export const setPreviewReducedMotion = (on: boolean): void => {
  previewReduced = on;
};
export const reducedMotion = (): boolean => previewReduced || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** A check-off burst at a screen position (the real burst; the preview asks for it where its button is). */
export function burstAt(x: number, y: number): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('halo-joy-burst', { detail: { x, y } }));
}

export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not on this device */
  }
}

const MAX_WAITING = 4;
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
  const { data, justDone, actions, today } = useStore();
  const celebrate = data.settings.celebrations !== false;
  const settled = useSettled();
  const firstRun = !settled || isOpen(data.settings.onboarding) || maxOpen(data.settings.maxOnboarding);
  const [queue, setQueue] = useState<(JoyEvent & { id: number })[]>([]);
  const [confetti, setConfetti] = useState<{ id: number; forced: boolean } | null>(null);
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
      // Never a pile-up: four small moments waiting at most (one check-off can finish a class, a week and a best day at
      // once). The newest is kept, since it answers what was just done; the oldest waiting one is let go. Its "shown
      // once" mark is already kept, so it does not come back later. A card and the Admin preview never push one out.
      setQueue((q) => {
        if (d.card || d.preview || q.filter((x) => !x.card).length < MAX_WAITING) return [...q, { ...d, id }];
        const drop = q.findIndex((x, k) => k > 0 && !x.card && !x.preview);
        return drop < 0 ? [...q, { ...d, id }] : [...q.slice(0, drop), ...q.slice(drop + 1), { ...d, id }];
      });
    };
    window.addEventListener('halo-joy', on);
    return () => window.removeEventListener('halo-joy', on);
  }, []);
  // One at a time: a toast for three and a half seconds; a card until it is closed.
  useEffect(() => {
    if (!current) return;
    if (current.big && (celebrate || current.preview)) setConfetti({ id: current.id, forced: !!current.preview });
    haptic(current.big ? 20 : 10);
    if (current.card && !current.hold) return;
    // With more waiting, each says its piece a little quicker.
    const t = setTimeout(() => setQueue((q) => q.slice(1)), current.hold ?? (queue.length > 1 ? 2200 : 3500));
    return () => clearTimeout(t);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (confetti === null) return;
    const t = setTimeout(() => setConfetti(null), 2600);
    return () => clearTimeout(t);
  }, [confetti]);

  // The preview asks for the same burst at a position (Admin → Celebrations preview), whatever the switch says.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      setBurst({ x: d.x, y: d.y, key: Date.now() });
      setTimeout(() => setBurst(null), 900);
    };
    window.addEventListener('halo-joy-burst', on);
    return () => window.removeEventListener('halo-joy-burst', on);
  }, []);

  // A check-off: a short gold halo burst where it was tapped (under a second). An assignment (something with points,
  // not a participation check-in) also gets gold confetti from the top of the screen (George, 2026-10-04: "add confetti
  // whenever you submit an assignment… from the top of the screen"). Still off with Celebrations; a glow under reduced
  // motion; nothing is kept, so Undo has nothing to take back.
  useEffect(() => {
    if (!justDone || !celebrate) return;
    const done = data.items.find((i) => i.id === justDone.id);
    if (done && done.points > 0 && done.type !== 'participation') {
      seq.current += 1;
      setConfetti({ id: seq.current, forced: false });
    }
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
    if (n > 0) joy(syncMoment(n));
    for (const g of pending.gradeUps ?? []) joy(gradeUpMoment(g));
    // Work that came back graded well (90% or better), best first; three at most, then a count.
    const graded = [...(pending.graded ?? [])].sort((a, b) => b.score / b.points - a.score / a.points);
    for (const g of graded.slice(0, 3)) joy(gradedMoment(g));
    if (graded.length > 3) joy({ text: `${graded.length - 3} more graded at 90% or better.` });
    actions.updateJoy({ pending: null });
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
        joy(classMilestoneMoment(c.code, c.name, m as 25 | 50 | 75 | 100, p.total));
      } else if (m < was) {
        seen[c.id] = m;
        changed = true;
      }
    }
    if (changed) actions.updateJoy({ classSeen: seen });
  }, [progressKey, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // A Halo topic cleared: every assignment with points in it turned in or done. A toast each, once; first look is quiet;
  // one that is no longer clear (unchecked) can be cleared again.
  const topicsNow = useMemo(() => topicsCleared(data.items), [data.items]);
  const topicKey = topicsNow.map((t) => t.key).join(',');
  useEffect(() => {
    if (firstRun) return;
    const seen = data.settings.joy?.topicSeen;
    const keys = topicsNow.map((t) => t.key);
    if (seen === undefined) {
      actions.updateJoy({ topicSeen: keys });
      return;
    }
    const fresh = topicsNow.filter((t) => !seen.includes(t.key));
    for (const t of fresh.slice(0, 2)) {
      const code = data.courses.find((c) => c.id === t.courseId)?.code;
      joy(topicMoment(code, t.topic));
    }
    if (fresh.length > 0 || seen.some((k) => !keys.includes(k))) actions.updateJoy({ topicSeen: keys });
  }, [topicKey, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Things turned in this term: 10, 25, 50, 100, 150, 200, a toast each, once. First look is quiet; a count that went
  // back down (unchecked, or a sync that took one back) lowers the mark so it can be reached again.
  const termCount = useMemo(() => turnedInCount(data.items), [data.items]);
  useEffect(() => {
    if (firstRun) return;
    const m = termMilestone(termCount);
    const seen = data.settings.joy?.countSeen;
    if (seen === undefined) return void actions.updateJoy({ countSeen: m });
    if (m > seen) joy(termMoment(m));
    if (m !== seen) actions.updateJoy({ countSeen: m });
  }, [termCount, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Best day yet: more finished today than on any earlier day (three or more, after a week of history). Once a day:
  // the first time today beats the record; going higher later the same day stays quiet.
  const best = useMemo(() => bestDay(data.items, today, data.settings.timezone), [data.items, today, data.settings.timezone]);
  useEffect(() => {
    if (firstRun || !best.record) return;
    const seen = data.settings.joy?.bestDaySeen;
    if (seen?.day === today) return;
    joy(bestDayMoment(best.today));
    actions.updateJoy({ bestDaySeen: { day: today, n: best.today } });
  }, [best.today, best.record, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Week cleared: everything due this week done with a day or more to spare. Once a week; undone, it can come again.
  const ws = data.settings.weekStartsOn;
  const cleared = useMemo(() => weekCleared(data.items, today, data.settings.timezone, ws), [data.items, today, data.settings.timezone, ws]);
  useEffect(() => {
    if (firstRun) return;
    const seen = data.settings.joy?.weekSeen ?? null;
    if (cleared && seen !== cleared) {
      joy(weekMoment(ws));
      actions.updateJoy({ weekSeen: cleared });
    } else if (!cleared && seen && seen === weekStartOf(today, ws)) actions.updateJoy({ weekSeen: null });
  }, [cleared, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Streak milestones: 3, 7, 14 and 30 days, a toast each, once (on any device). A broken streak can earn them again.
  const { progress } = useStore();
  useEffect(() => {
    if (firstRun) return;
    const m = streakMilestone(progress.dailyStreak);
    const seen = data.settings.joy?.streakSeen;
    if (seen === undefined) {
      actions.updateJoy({ streakSeen: m });
      return;
    }
    if (m > seen) joy(streakMoment(progress.dailyStreak));
    if (m !== seen) actions.updateJoy({ streakSeen: m });
  }, [progress.dailyStreak, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // A badge earned: a toast, once. First look records what is already earned, quietly; one taken back can be earned again.
  const earnedKey = BADGES.filter((b) => progress.badges[b].earnedAt).join(',');
  useEffect(() => {
    if (firstRun) return;
    const earned = earnedKey ? (earnedKey.split(',') as BadgeId[]) : [];
    const seen = data.settings.joy?.badgesSeen;
    if (seen === undefined) {
      actions.updateJoy({ badgesSeen: earned });
      return;
    }
    for (const b of earned) if (!seen.includes(b)) joy(badgeMoment(b));
    if (earned.join(',') !== [...seen].sort((a, b) => BADGES.indexOf(a as BadgeId) - BADGES.indexOf(b as BadgeId)).join(',')) actions.updateJoy({ badgesSeen: earned });
  }, [earnedKey, firstRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // For the extension: what a submission on Halo is worth here, so Halo itself can say "+50 pts · CHM-113L now 36% done".
  const snap = useMemo(() => JSON.stringify(joySnap(data.courses, data.items, celebrate)), [data.courses, data.items, celebrate]);
  useEffect(() => {
    if (!settled) return;
    try {
      localStorage.setItem(JOY_SNAP_SLOT, snap);
    } catch {
      /* storage unavailable */
    }
  }, [snap, settled]);

  const close = () => setQueue((q) => q.slice(1));
  return (
    <>
      {burst && (
        <span className="joy-burst" style={{ left: burst.x, top: burst.y }} aria-hidden key={burst.key}>
          <i />
          <i />
        </span>
      )}
      {confetti !== null && (celebrate || confetti.forced) && <Confetti seed={confetti.id} />}
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
