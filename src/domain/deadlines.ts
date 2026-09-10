import { addDays, dateOf, makeIso, weekdayOf } from './dates';
import type { Course, DateStr, Item, Settings } from './types';

export interface DerivedDeadline {
  deadlineAt: string;
  reasons: string[];
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BIG_POINTS = 100;
const BIG_MINUTES = 180;
const EARLY_DAYS = 2;
const CLUSTER = 4;
const MAX_CLUSTER_PASSES = 10;

const stem = (title: string) => title.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Rough start-by for a dependent: its deadline minus the scheduler's buffer and its working days. */
function approxStartBy(day: DateStr, minutes: number, weekdayMinutes: number): DateStr {
  const buffer = minutes <= 240 ? 1 : 2;
  const workDays = Math.max(1, Math.ceil(minutes / Math.max(60, weekdayMinutes)));
  return addDays(day, -(buffer + workDays));
}

/**
 * When work really has to happen, as opposed to when the syllabus says it is due.
 * Every rule only tightens. Returns entries only for items whose deadline moved.
 */
export function deriveDeadlines(items: Item[], courses: Course[], settings: Settings): Record<string, DerivedDeadline> {
  const tz = settings.timezone;
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const open = items.filter((i) => i.status !== 'done');
  const dueDay = new Map(open.map((i) => [i.id, dateOf(i.dueAt, tz)]));
  const day = new Map(dueDay);
  const reasons = new Map<string, string[]>(open.map((i) => [i.id, []]));

  // An item can't be "really due" before it opens (real windows only; same-day opens are ignored).
  const opensDay = new Map<string, DateStr | null>(
    open.map((i) => {
      const o = i.opensAt ? dateOf(i.opensAt, tz) : null;
      return [i.id, o && o < dueDay.get(i.id)! ? o : null];
    }),
  );

  const tighten = (id: string, target: DateStr, reason: string) => {
    if (!day.has(id) || target >= day.get(id)!) return;
    const floor = opensDay.get(id);
    let t = floor && target < floor ? floor : target;
    if (t >= day.get(id)!) return;
    const r = [reason];
    if (weekdayOf(t) === 0) {
      t = addDays(t, -1);
      r.push('Sunday due → Saturday');
    }
    day.set(id, t);
    reasons.get(id)!.push(...r);
  };

  // 1. Big items can't be done the night before.
  for (const i of open) {
    if (i.points >= BIG_POINTS || i.estimatedMinutes >= BIG_MINUTES) tighten(i.id, addDays(dueDay.get(i.id)!, -EARLY_DAYS), `big item, ${EARLY_DAYS} days early`);
  }

  // 2. Participation and discussion need a first post before the reply window closes.
  for (const i of open) {
    if (i.type === 'participation' || i.type === 'discussion') tighten(i.id, addDays(dueDay.get(i.id)!, -EARLY_DAYS), 'first touch: post, then reply');
  }

  // 3. Lab notebooks are prep for the lab meeting that precedes the due date.
  for (const i of open) {
    const c = courseById.get(i.courseId);
    if (!c || i.type !== 'lab' || !/L$/i.test(c.code) || c.meetings.length === 0) continue;
    const meetingDays = new Set(c.meetings.map((m) => m.day));
    for (let k = 0; k <= 7; k++) {
      const d = addDays(dueDay.get(i.id)!, -k);
      if (meetingDays.has(weekdayOf(d) as Course['meetings'][number]['day'])) {
        tighten(i.id, addDays(d, -1), `prep before the ${DAY_SHORT[weekdayOf(d)]} lab`);
        break;
      }
    }
  }

  // 4. Prerequisites inferred within a class.
  const pairs: { prereq: Item; dependent: Item }[] = [];
  const byCourse = new Map<string, Item[]>();
  for (const i of open) byCourse.set(i.courseId, [...(byCourse.get(i.courseId) ?? []), i]);
  for (const group of byCourse.values()) {
    for (const dep of group) {
      const s = stem(dep.title);
      const finalStem = /^final draft of (.+)$/.exec(s)?.[1];
      if (finalStem) {
        const first = group.find((x) => stem(x.title) === `first draft of ${finalStem}`);
        if (first) pairs.push({ prereq: first, dependent: dep });
      }
      const talkStem = /^(.+) presentation$/.exec(s)?.[1];
      if (talkStem) {
        const essay = group.find((x) => stem(x.title) === `${talkStem} essay`);
        if (essay) pairs.push({ prereq: essay, dependent: dep });
      }
      if (/^formal lab report$/.test(s)) {
        const labs = group.filter((x) => x.type === 'lab' && x.dueAt < dep.dueAt).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
        if (labs[0]) pairs.push({ prereq: labs[0], dependent: dep });
      }
    }
  }
  for (const { prereq, dependent } of pairs) {
    const need = approxStartBy(day.get(dependent.id)!, dependent.estimatedMinutes, settings.weekdayMinutes);
    if (day.get(prereq.id)! >= need) tighten(prereq.id, addDays(need, -1), `needed before ${dependent.label}`);
  }

  // 5. Sunday deadlines become Saturday.
  for (const i of open) {
    if (weekdayOf(day.get(i.id)!) === 0) tighten(i.id, addDays(day.get(i.id)!, -1), 'Sunday due → Saturday');
  }

  // 6. Clusters: pull the smallest items earlier until no day holds four or more.
  for (let pass = 0; pass < MAX_CLUSTER_PASSES; pass++) {
    const buckets = new Map<DateStr, Item[]>();
    for (const i of open) buckets.set(day.get(i.id)!, [...(buckets.get(day.get(i.id)!) ?? []), i]);
    let moved = false;
    for (const [d, group] of buckets) {
      if (group.length < CLUSTER) continue;
      const smallest = [...group].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.points - b.points)[0];
      tighten(smallest.id, addDays(d, -1), `${group.length} items that day, pulled earlier`);
      moved = true;
    }
    if (!moved) break;
  }

  const out: Record<string, DerivedDeadline> = {};
  for (const i of open) {
    const d = day.get(i.id)!;
    if (d !== dueDay.get(i.id)) out[i.id] = { deadlineAt: makeIso(d, '23:59', tz), reasons: reasons.get(i.id)! };
  }
  return out;
}
