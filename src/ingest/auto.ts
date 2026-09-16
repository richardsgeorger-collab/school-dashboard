import { useEffect, useRef } from 'react';
import { loadApiKey } from '../chat/key';
import { LIBRARY_EVENT } from '../library/ingest';
import { useStore } from '../storage/store';
import { browserCache, browserLoaders } from './loaders';
import type { ClassPlan } from './plan';
import { loadPlan, runClassPass, runTermPass } from './run';

/** Fired by the store after a Halo or calendar sync lands, so the AI pass can re-read what changed. */
export const SYNC_EVENT = 'sync-applied';
export const PLAN_EVENT = 'plan-changed';

const SETTLE_MS = 2500;

/**
 * Re-runs the passes for classes that run on the AI version whenever a sync lands or a file is added, in the
 * background, without a word: the cache skips classes whose inputs did not change, and any changes wait as a
 * "to review" line on the class page. Nothing is written to the planner here.
 */
export function useAutoRerun(): void {
  const { data, schedule, today } = useStore();
  const latest = useRef({ data, schedule, today });
  latest.current = { data, schedule, today };
  const running = useRef(false);
  useEffect(() => {
    let timer: number | null = null;
    const run = async () => {
      if (running.current) return;
      const key = loadApiKey();
      const { data: d, schedule: s, today: t } = latest.current;
      const courses = d.courses.filter((c) => c.ingest === 'ai');
      if (!key || courses.length === 0) return;
      running.current = true;
      try {
        const deps = { apiKey: key, loaders: browserLoaders, cache: browserCache };
        const startByOf = (id: string) => s.byItem[id]?.startBy;
        let changed = false;
        const plans: Record<string, ClassPlan | null> = {};
        for (const c of d.courses) plans[c.id] = await loadPlan(browserCache, c.id).catch(() => null);
        for (const c of courses) {
          try {
            const r = await runClassPass(c, d, t, startByOf, deps);
            plans[c.id] = r.plan;
            if (!r.cached) changed = true;
          } catch {
            // A failed pass leaves the last plan in place; the class page still shows it.
          }
        }
        if (changed) {
          try {
            await runTermPass(d, plans, t, startByOf, deps);
          } catch {
            // Same.
          }
          window.dispatchEvent(new Event(PLAN_EVENT));
        }
      } finally {
        running.current = false;
      }
    };
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), SETTLE_MS);
    };
    window.addEventListener(SYNC_EVENT, schedule);
    window.addEventListener(LIBRARY_EVENT, schedule);
    return () => {
      window.removeEventListener(SYNC_EVENT, schedule);
      window.removeEventListener(LIBRARY_EVENT, schedule);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
