import { useEffect, useState } from 'react';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';
import { PLAN_EVENT } from './auto';
import { gatherClassContext } from './context';
import { diffPlan, type PlanDiff } from './diff';
import { browserCache, browserLoaders } from './loaders';
import { loadPlan, loadTerm, planState, type PlanState } from './run';

export interface PlanStatus {
  state: PlanState;
  /** Changes waiting for a review, once a plan exists. */
  pending: number;
  diff: PlanDiff | null;
  at: string | null;
}

/** One line's worth of where a class's AI plan stands, for the class page. Reads the cache; never calls the model. */
export function usePlanStatus(course: Course | null): PlanStatus | null {
  const { data, schedule, today } = useStore();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const items = course ? data.items.filter((i) => i.courseId === course.id) : [];
  const key = items.map((i) => `${i.id}|${i.updatedAt}`).join(',');
  useEffect(() => {
    if (!course) return;
    let live = true;
    const load = async () => {
      const [plan, term, ctx] = await Promise.all([loadPlan(browserCache, course.id).catch(() => null), loadTerm(browserCache).catch(() => null), gatherClassContext(course, data, today, (id) => schedule.byItem[id]?.startBy, browserLoaders).catch(() => null)]);
      if (!live) return;
      if (!plan || !ctx) {
        setStatus({ state: 'none', pending: 0, diff: null, at: null });
        return;
      }
      const diff = diffPlan(course, items, plan, term, (id) => schedule.byItem[id]?.startBy);
      setStatus({ state: planState(plan, ctx), pending: diff.total, diff, at: plan.at });
    };
    void load();
    const again = () => void load();
    window.addEventListener(PLAN_EVENT, again);
    return () => {
      live = false;
      window.removeEventListener(PLAN_EVENT, again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, key]);
  return status;
}
