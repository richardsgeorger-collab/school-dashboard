import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Scenario } from '../../domain/whatIfGrade';
import { useStore } from '../../storage/store';

/**
 * The live what-ifs, by class (2026-10-29): shared by the class page and the GPA sheet, never real data. In memory
 * for the visit; a class's scenario is kept across visits only when the student taps "Keep this what-if"
 * (settings.gradeWhatIfs), and then every change is kept too.
 */
let state: Record<string, Scenario> = {};
let seeded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
const read = () => state;
export function setScenario(courseId: string, s: Scenario) {
  const next = { ...state };
  if (Object.keys(s).length) next[courseId] = s;
  else delete next[courseId];
  state = next;
  emit();
}
/** Test hook. */
export const resetWhatIfs = () => {
  state = {};
  seeded = false;
  emit();
};

/** Every class's live what-if. */
export function useAllWhatIfs(): Record<string, Scenario> {
  const { data } = useStore();
  const saved = data.settings.gradeWhatIfs;
  useEffect(() => {
    if (seeded || !saved) return;
    seeded = true;
    state = { ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v.scores])), ...state };
    emit();
  }, [saved]);
  return useSyncExternalStore(subscribe, read, read);
}

/** One class's what-if: set an item's score (points), clear it, reset all, keep it. */
export function useClassWhatIf(courseId: string) {
  const all = useAllWhatIfs();
  const { data, actions } = useStore();
  const scenario = all[courseId] ?? {};
  const kept = !!data.settings.gradeWhatIfs?.[courseId];
  const persist = useCallback(
    (s: Scenario, keep: boolean) => {
      const cur = { ...(data.settings.gradeWhatIfs ?? {}) };
      if (keep && Object.keys(s).length) cur[courseId] = { scores: s, at: new Date().toISOString() };
      else delete cur[courseId];
      actions.updateSettings({ gradeWhatIfs: cur });
    },
    [actions, courseId, data.settings.gradeWhatIfs],
  );
  const put = (s: Scenario) => {
    setScenario(courseId, s);
    if (kept) persist(s, true);
  };
  return {
    scenario,
    kept,
    set: (itemId: string, pts: number | null) => {
      const s = { ...scenario };
      if (pts === null || !Number.isFinite(pts)) delete s[itemId];
      else s[itemId] = pts;
      put(s);
    },
    setMany: (s: Scenario) => put(s),
    reset: () => {
      setScenario(courseId, {});
      if (kept) persist({}, false);
    },
    keep: (on: boolean) => persist(scenario, on),
  };
}
