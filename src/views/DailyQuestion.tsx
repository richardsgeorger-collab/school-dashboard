import { useEffect, useState } from 'react';
import { dateOf } from '../domain/dates';
import type { Course } from '../domain/types';
import { aiDb } from '../ingest/db';
import { useStore } from '../storage/store';
import type { StudyKit } from '../study/kits';

/**
 * One flashcard from the student's own study kit, on a quiet day only, and only when it is switched on. Retrieval
 * beats rereading; the empty state is the one place a card is not clutter. Off by default.
 */
interface Pick {
  course: Course;
  topic: string;
  front: string;
  back: string;
  n: number;
  of: number;
}

const dayIndex = (today: string) => Math.floor(new Date(`${today}T12:00:00Z`).getTime() / 86_400_000);

export function DailyQuestion() {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const on = !!data.settings.dailyQuestion;
  const [pick, setPick] = useState<Pick | null>(null);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!on) return;
    let live = true;
    (async () => {
      // The class with the nearest open exam or quiz first, then the rest.
      const next = data.items
        .filter((i) => i.status !== 'done' && (i.type === 'exam' || i.type === 'quiz') && dateOf(i.dueAt, tz) >= today)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      const order = [...new Set([...(next ? [next.courseId] : []), ...data.courses.map((c) => c.id)])];
      const keys = await aiDb.keys('study:').catch(() => [] as string[]);
      for (const cid of order) {
        const course = data.courses.find((c) => c.id === cid);
        if (!course) continue;
        for (const key of keys.filter((k) => k.startsWith(`study:${cid}:cards:`))) {
          const kit = await aiDb.get<StudyKit>(key).catch(() => null);
          if (!kit || kit.cards.length === 0) continue;
          const n = dayIndex(today) % kit.cards.length;
          if (live) setPick({ course, topic: kit.topic, front: kit.cards[n].front, back: kit.cards[n].back, n: n + 1, of: kit.cards.length });
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [on, data.items, data.courses, today, tz]);
  if (!on || !pick) return null;
  return (
    <section className="card daily-q" aria-label="One question">
      <p className="hint mono">
        One from your {pick.course.code} cards{pick.topic ? ` · ${pick.topic}` : ''} · {pick.n} of {pick.of}
      </p>
      <button type="button" className="kit-card" data-flipped={flipped} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Back of card' : 'Front of card'}>
        <span className="kit-card-face">{flipped ? pick.back : pick.front}</span>
        <span className="kit-card-foot mono">{flipped ? 'back' : 'tap to turn over'}</span>
      </button>
    </section>
  );
}
