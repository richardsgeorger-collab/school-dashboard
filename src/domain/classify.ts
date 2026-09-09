import type { ItemType } from './types';

/**
 * Rule-based classification from the assessment title. First match wins.
 * Course code is only used to bias lab-course items.
 */
export function classifyItem(title: string, courseCode: string): ItemType {
  const t = title.toLowerCase();
  const labCourse = /l$/i.test(courseCode.trim());

  if (/\bdq\b/.test(t)) return 'discussion';
  if (/participation/.test(t)) return 'participation';
  if (/practice/.test(t)) return 'quiz';
  if (/practical/.test(t)) return 'lab';
  if (/\bexam\b/.test(t)) return 'exam';
  if (/quiz/.test(t)) return 'quiz';
  if (/\bclc\b|design report|\bdemo\b/.test(t)) return 'project';
  if (/lab report/.test(t)) return 'paper';
  if (/\blab\b/.test(t)) return 'lab';
  if (labCourse && /safety|equipment|experiment/.test(t)) return 'lab';
  if (/essay|report|draft|presentation|op-ed|review assignment|review of|reflection|analysis|self-review|peer|powerpoint|video/.test(t)) {
    return 'paper';
  }
  if (/homework|activity|\breview\b|matlab|excel|zybooks|aleks|assignment|academic plan|prerequisite|worksheet/.test(t)) {
    return 'homework';
  }
  return 'other';
}
