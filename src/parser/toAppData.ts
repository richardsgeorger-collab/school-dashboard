import { classifyItem } from '../domain/classify';
import { zonedParts } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { stableId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import type { Course, Item } from '../domain/types';
import type { ParsedSyllabus } from './gcuSyllabus';

export interface ToAppDataOptions {
  includeZeroPoint: boolean;
  tz: string;
  defaults?: Partial<Course>;
  existingCourseId?: string;
  now?: string;
}

export function toAppData(parsed: ParsedSyllabus, opts: ToAppDataOptions): { course: Course; items: Item[] } {
  const now = opts.now ?? new Date().toISOString();
  const courseId = opts.existingCourseId ?? stableId(`course|${parsed.code}|${parsed.termStart}`);

  const course: Course = {
    id: courseId,
    code: parsed.code,
    name: parsed.name,
    color: opts.defaults?.color ?? '#3b82c4',
    credits: parsed.credits,
    instructors: parsed.instructors,
    meetings: opts.defaults?.meetings ?? [],
    online: opts.defaults?.online ?? false,
    termStart: parsed.termStart,
    termEnd: parsed.termEnd,
    updatedAt: now,
  };

  const items: Item[] = [];
  for (const a of parsed.assessments) {
    if (!opts.includeZeroPoint && a.points <= 0) continue;
    const type = classifyItem(a.title, parsed.code);
    const due = zonedParts(a.dueAt, opts.tz);
    const dueBeforeEod = due.hh * 60 + due.mm < 23 * 60 + 59;
    items.push({
      id: stableId(`item|${parsed.code}|${a.title}|${a.dueAt}`),
      courseId,
      title: a.title,
      label: shortLabel({ title: a.title, courseCode: parsed.code, type }),
      labelOverridden: false,
      type,
      points: a.points,
      opensAt: a.opensAt,
      dueAt: a.dueAt,
      estimatedMinutes: estimateMinutes({ title: a.title, type, points: a.points, courseCode: parsed.code }),
      estimateOverridden: false,
      startByOverride: null,
      status: 'todo',
      completedAt: null,
      score: null,
      notes: a.description,
      topic: a.topic,
      flags: {
        inClass: !course.online && (a.traits.includes('Not Submitted in Halo') || dueBeforeEod),
        group: a.traits.includes('Group'),
        lopesWrite: a.traits.includes('Requires LopesWrite'),
        timed: a.traits.includes('Timed') || a.timeLimit !== null,
        practice: /practice/i.test(a.title),
      },
      source: 'parsed',
      award: null,
      updatedAt: now,
    });
  }
  return { course, items };
}
