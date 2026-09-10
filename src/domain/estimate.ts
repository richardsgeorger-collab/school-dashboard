import type { ItemType } from './types';

export interface EstimateInput {
  title: string;
  type: ItemType;
  points: number;
  courseCode: string;
}

/** Round to the nearest quarter hour so estimates read as guidance, not measurement. */
const q15 = (min: number) => Math.max(15, Math.round(min / 15) * 15);

/**
 * Rule table for realistic out-of-class minutes, recalibrated downward (Sep 2026) after the
 * first weeks ran high. Tune here; every value is still editable per item.
 */
export function estimateMinutes({ title, type, points, courseCode }: EstimateInput): number {
  const t = title.toLowerCase();
  const chem = /^chm/i.test(courseCode); // ALEKS-based
  const esg = /^esg/i.test(courseCode);

  switch (type) {
    case 'exam':
      return q15(240 + points * 1.2);

    case 'quiz':
      if (/practice/.test(t)) return /final/.test(t) ? 90 : 60;
      if (/apa|office|topic \d+ quiz/.test(t)) return 40;
      return points >= 40 ? 120 : 40;

    case 'homework':
      if (/matlab|excel/.test(t)) return 120;
      if (/^topic \d+ review$/.test(t)) return 75;
      if (chem) return /activity/.test(t) ? 60 : 90;
      if (esg && /homework/.test(t)) return 120;
      return Math.min(180, q15(45 + points * 1.2));

    case 'lab':
      return /practical/.test(t) ? 150 : 100;

    case 'paper':
      if (/formal lab report/.test(t)) return 360;
      if (/essay/.test(t)) return 270;
      if (/final draft/.test(t)) return 200;
      if (/first draft|self-review|peer/.test(t)) return 100;
      if (/presentation|powerpoint/.test(t)) return 120;
      if (/reflection/.test(t)) return points >= 100 ? 120 : 75;
      return Math.min(240, q15(90 + points * 0.8));

    case 'project':
      return points >= 100 ? 240 : 90;

    case 'discussion':
      return 25;

    case 'participation':
      return 20;

    default:
      return Math.min(180, q15(45 + points * 0.8));
  }
}
