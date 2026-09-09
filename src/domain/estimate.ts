import type { ItemType } from './types';

export interface EstimateInput {
  title: string;
  type: ItemType;
  points: number;
  courseCode: string;
}

/**
 * Rule table for realistic out-of-class minutes. Tune here; every value is
 * still editable per item in the app.
 */
export function estimateMinutes({ title, type, points, courseCode }: EstimateInput): number {
  const t = title.toLowerCase();
  const chem = /^chm/i.test(courseCode); // ALEKS-based
  const esg = /^esg/i.test(courseCode);

  switch (type) {
    case 'exam':
      return Math.round(360 + points * 1.8);

    case 'quiz':
      if (/practice/.test(t)) return /final/.test(t) ? 120 : 90;
      if (/apa|office|topic \d+ quiz/.test(t)) return 60;
      return points >= 40 ? 180 : 60;

    case 'homework':
      if (/matlab|excel/.test(t)) return 180;
      if (/^topic \d+ review$/.test(t)) return 120;
      if (chem) return /activity/.test(t) ? 90 : 120;
      if (esg && /homework/.test(t)) return 180;
      return Math.min(240, 60 + Math.round(points * 1.5));

    case 'lab':
      return /practical/.test(t) ? 240 : 150;

    case 'paper':
      if (/formal lab report/.test(t)) return 480;
      if (/essay/.test(t)) return 360;
      if (/final draft/.test(t)) return 300;
      if (/first draft|self-review|peer/.test(t)) return 150;
      if (/presentation|powerpoint/.test(t)) return 180;
      if (/reflection/.test(t)) return points >= 100 ? 180 : 120;
      return Math.min(360, 120 + points);

    case 'project':
      return points >= 100 ? 360 : 120;

    case 'discussion':
      return 30;

    case 'participation':
      return 45;

    default:
      return Math.min(240, 60 + points);
  }
}
