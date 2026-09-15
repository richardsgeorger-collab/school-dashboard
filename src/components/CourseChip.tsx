import { courseColor } from '../data/courseDefaults';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

export function useCourseColor(course: Course | undefined): string {
  const { isDark } = useStore();
  return course ? courseColor(course.color, isDark) : 'var(--ink-3)';
}

export function CourseChip({ course, full = false, link = false }: { course: Course | undefined; full?: boolean; link?: boolean }) {
  const color = useCourseColor(course);
  const text = course ? (full ? `${course.code} ${course.name}` : course.code) : 'No class';
  if (link && course) {
    return (
      <a className="chip chip-link" href={`#/class?c=${course.id}`} style={{ '--course': color } as React.CSSProperties} title={`Everything about ${course.code}`}>
        <span className="dot" />
        {text}
      </a>
    );
  }
  return (
    <span className="chip" style={{ '--course': color } as React.CSSProperties}>
      <span className="dot" />
      {text}
    </span>
  );
}
