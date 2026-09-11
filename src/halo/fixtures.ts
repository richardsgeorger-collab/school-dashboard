import type { AppData, Course, Item } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { HaloAssessment, HaloClass, HaloExport } from './types';

export const TZ = 'America/Phoenix';
export const NOW = '2026-09-11T16:00:00.000Z';

export function mkAssessment(o: Partial<HaloAssessment> & { id: string; title: string }): HaloAssessment {
  return {
    description: null,
    unit: 'Topic 1',
    unitSequence: 1,
    sequence: 1,
    startDate: '2026-09-07T07:00:00.000Z',
    dueDate: '2026-09-14T06:59:00.000Z',
    points: 10,
    type: 'ASSIGNMENT',
    tags: [],
    inPerson: false,
    isGroupEnabled: false,
    requiresLopesWrite: false,
    status: 'ACTIVE',
    submittedAt: null,
    score: null,
    ...o,
  };
}

export function mkClass(o: Partial<HaloClass> & { id: string; courseCode: string }): HaloClass {
  return {
    slugId: `slug-${o.id}`,
    classCode: `${o.courseCode}-O500`,
    name: `${o.courseCode} class`,
    startDate: '2026-09-08 07:00:00',
    endDate: '2026-12-21 06:59:00',
    stage: 'CURRENT',
    modality: 'ONGROUND',
    credits: 3,
    assessments: [],
    ...o,
  };
}

export function mkExport(classes: HaloClass[], exportedAt = NOW): HaloExport {
  return { kind: 'halo-export', version: 1, exportedAt, source: 'bookmarklet', classes };
}

export function mkCourse(o: Partial<Course> & { id: string; code: string }): Course {
  return {
    name: o.code,
    color: '#D95D39',
    credits: 3,
    instructors: [],
    meetings: [],
    online: false,
    termStart: '2026-09-08',
    termEnd: '2026-12-20',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...o,
  };
}

export function mkItem(o: Partial<Item> & { id: string; courseId: string; title: string }): Item {
  return {
    label: o.title,
    labelOverridden: false,
    type: 'homework',
    points: 10,
    opensAt: null,
    dueAt: '2026-09-13T23:59:00-07:00',
    estimatedMinutes: 60,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { inClass: false, group: false, lopesWrite: false, timed: false, practice: false },
    source: 'parsed',
    award: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...o,
  };
}

export function mkData(courses: Course[], items: Item[]): AppData {
  return { courses, items, settings: { ...DEFAULT_SETTINGS, timezone: TZ } };
}
