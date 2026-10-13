import { useEffect, useState } from 'react';
import { dateOf, diffDays } from '../domain/dates';
import type { Course, Item } from '../domain/types';

const TZ = 'America/Phoenix';
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Row {
  id: string;
  day: string;
  code: string;
  color: string;
  label: string;
  points: number;
}

/** The made-up student's next seven days, at most `max` rows, soonest first. */
export function exampleRows(items: Item[], courses: Course[], now: string, max = 6): Row[] {
  const today = dateOf(now, TZ);
  const byId = new Map(courses.map((c) => [c.id, c]));
  return items
    .filter((i) => i.status !== 'done' && i.type !== 'participation' && i.dueAt)
    .map((i) => ({ i, d: dateOf(i.dueAt, TZ) }))
    .filter(({ d }) => d >= today && diffDays(today, d) <= 6)
    .sort((a, b) => a.i.dueAt.localeCompare(b.i.dueAt))
    .slice(0, max)
    .map(({ i, d }) => {
      const c = byId.get(i.courseId);
      const n = diffDays(today, d);
      return { id: i.id, day: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()], code: c?.code ?? '', color: c?.color ?? 'var(--accent)', label: i.label || i.title, points: i.points };
    });
}

/**
 * What Halo+ will look like (George, 2026-10-13): a phone sign-up sees a week of the demo student, Maya Torres, before
 * their own classes are in, labeled as an example in words and on the box, never mistakable for their own. The demo
 * data loads on demand, so it costs nothing to anyone who never sees this.
 */
export function ExampleWeek() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    void import('../demo/student').then(({ demoStudent }) => {
      if (!live) return;
      const now = new Date().toISOString();
      const d = demoStudent(now).data;
      setRows(exampleRows(d.items, d.courses, now));
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <figure className="example-week" aria-label="An example week in Halo+, for a made-up student">
      <figcaption className="example-week-head">
        <span className="example-badge">Example</span>
        <span>A made-up student's week. Yours fills in from Halo.</span>
      </figcaption>
      <ul className="example-week-list">
        {(rows ?? []).map((r) => (
          <li key={r.id}>
            <span className="example-day">{r.day}</span>
            <span className="example-code" style={{ '--course': r.color } as React.CSSProperties}>
              {r.code}
            </span>
            <span className="example-label">{r.label}</span>
            {r.points > 0 && <span className="example-pts">{r.points} pts</span>}
          </li>
        ))}
        {rows === null && <li className="example-loading" aria-hidden />}
      </ul>
    </figure>
  );
}
