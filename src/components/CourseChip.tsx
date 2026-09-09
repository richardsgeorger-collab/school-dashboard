import { courseColor } from '../data/courseDefaults';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

export function useCourseColor(course: Course | undefined): string {
  const { isDark } = useStore();
  return course ? courseColor(course.color, isDark) : 'var(--ink-3)';
}

export function CourseChip({ course, full = false }: { course: Course | undefined; full?: boolean }) {
  const color = useCourseColor(course);
  return (
    <span className="chip" style={{ '--course': color } as React.CSSProperties}>
      <span className="dot" />
      {course ? (full ? `${course.code} ${course.name}` : course.code) : 'No class'}
    </span>
  );
}
