import { addDays, dateOf, diffDays, eachDay, fmtDate, fmtMinutes, zonedParts } from './dates';
import { dayCapacity, type Schedule } from './schedule';
import type { DateStr, Item, Settings } from './types';

/** Exam mode switches on this many days before an exam and off the day after it. */
export const EXAM_WINDOW_DAYS = 7;

export interface StudySession {
  day: DateStr;
  minutes: number;
  /** "Today · 1h 30m", "Sat · 2h" */
  label: string;
}

export interface ExamPlan {
  exam: Item;
  examDay: DateStr;
  daysLeft: number;
  /** Study the exam still needs, in minutes. */
  remainingMinutes: number;
  sessions: StudySession[];
  /** Minutes that do not fit before the exam at the current capacity. Zero when the plan fits. */
  shortfall: number;
  /** Open work (not participation) due before the exam. It still has to happen. */
  mustDoBefore: Item[];
  /** Open items due in the two weeks after the exam, pushed out of view until it is over. */
  suppressed: Item[];
}

function dayLabel(day: DateStr, today: DateStr): string {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return fmtDate(day, 'long').split(',')[0];
}

const round15 = (n: number) => Math.round(n / 15) * 15;

/**
 * When an exam is within a week, the Now screen reshapes around it: the exam is the hero, its study is
 * spread across the remaining days inside the student's capacity, and small items wait unless they are due first.
 */
export function examMode(
  items: Item[],
  schedule: Schedule,
  settings: Settings,
  today: DateStr,
  minutesFor: (i: Item) => number = (i) => i.estimatedMinutes,
): ExamPlan | null {
  const tz = settings.timezone;
  const horizon = addDays(today, EXAM_WINDOW_DAYS);
  const exam = items
    .filter((i) => i.type === 'exam' && i.status !== 'done' && dateOf(i.dueAt, tz) >= today && dateOf(i.dueAt, tz) <= horizon)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (!exam) return null;
  const examDay = dateOf(exam.dueAt, tz);
  const daysLeft = diffDays(today, examDay);
  const open = items.filter((i) => i.id !== exam.id && i.status !== 'done' && i.type !== 'participation');
  const mustDoBefore = open.filter((i) => i.dueAt < exam.dueAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const afterWindow = addDays(examDay, 14);
  const suppressed = open.filter((i) => i.dueAt >= exam.dueAt && dateOf(i.dueAt, tz) <= afterWindow);

  // Study days: today through the day before the exam. The exam day counts only when the exam is in the evening.
  const evening = zonedParts(exam.dueAt, tz).hh >= 17;
  const lastDay = evening ? examDay : addDays(examDay, -1);
  const days = lastDay >= today ? eachDay(today, lastDay) : [];
  const committed = (day: DateStr) => mustDoBefore.reduce((n, i) => n + (schedule.byItem[i.id]?.plannedByDay[day] ?? 0), 0);
  const free = days.map((d) => ({ day: d, free: Math.max(0, (d === examDay ? Math.round(dayCapacity(settings, d) / 2) : dayCapacity(settings, d)) - committed(d)) }));

  const remainingMinutes = Math.max(0, minutesFor(exam));
  const sessions: StudySession[] = [];
  let left = remainingMinutes;
  const withRoom = free.filter((f) => f.free >= 15).length;
  for (let k = 0; k < free.length && left > 0; k++) {
    const f = free[k];
    if (f.free < 15) continue;
    const daysRemaining = free.slice(k).filter((x) => x.free >= 15).length || 1;
    const share = Math.min(f.free, round15(Math.ceil(left / daysRemaining)) || 15, left);
    const minutes = Math.max(15, Math.min(f.free, share));
    sessions.push({ day: f.day, minutes, label: `${dayLabel(f.day, today)} · ${fmtMinutes(minutes)}` });
    left -= minutes;
  }
  void withRoom;
  return { exam, examDay, daysLeft, remainingMinutes, sessions, shortfall: Math.max(0, left), mustDoBefore, suppressed };
}

/** One calm sentence for the pressure slot in exam mode, or null. */
export function examPressure(plan: ExamPlan): string | null {
  if (plan.shortfall > 0) return `${fmtMinutes(plan.shortfall)} of study will not fit before the exam at your current hours. Start today, or add study time in Settings.`;
  if (plan.mustDoBefore.length > 0) {
    const n = plan.mustDoBefore.length;
    return `${n} other thing${n === 1 ? ' is' : 's are'} due before the exam and still fit around it.`;
  }
  if (plan.suppressed.length > 0) return `${plan.suppressed.length} other thing${plan.suppressed.length === 1 ? '' : 's'} due in the two weeks after wait until the exam is over.`;
  return null;
}
