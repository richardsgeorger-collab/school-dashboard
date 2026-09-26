import { useMemo } from 'react';
import { useCourseColor } from '../components/CourseChip';
import type { AccentId } from '../config/accents';
import { dateOf, fmtDate, fmtMinutes } from '../domain/dates';
import { rankItems, statusLine } from '../domain/now';
import { cleanAll } from '../domain/reqClean';
import { TYPE_LABELS } from '../domain/types';
import { useStore } from '../storage/store';

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A small, still copy of Now, in a chosen accent, on the student's own next thing. The same classes Now uses, so
 * the preview is the product; data-accent on the box makes the tokens local to it.
 */
export function NowPreview({ accent }: { accent: AccentId }) {
  const { data, schedule, courseById, today } = useStore();
  const tz = data.settings.timezone;
  const now = new Date().toISOString();
  const hero = useMemo(() => rankItems(data.items.filter((i) => i.type !== 'participation'), schedule, now, tz)[0] ?? null, [data.items, schedule, tz, now.slice(0, 16)]);
  const course = hero ? courseById.get(hero.courseId) : undefined;
  const color = useCourseColor(course);
  const status = statusLine(cleanAll(data.items).items, today, now, tz);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
  const daypart = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const weekday = WEEKDAY_LONG[new Date(`${today}T12:00:00Z`).getUTCDay()];
  return (
    <div className="now-preview" data-accent={accent} aria-hidden>
      <div className="now">
        <header className="now-head">
          <div>
            <p className="eyebrow">
              {weekday} {daypart}
            </p>
            <h2 className="now-title">{hero ? status.text : 'Your day, from Halo.'}</h2>
          </div>
        </header>
        <section className="hero" data-state="work" style={{ '--course': color } as React.CSSProperties}>
          {hero ? (
            <>
              <div className="hero-top">
                <span className="hero-eyebrow">
                  <span className="chip" style={{ '--course': color } as React.CSSProperties}>
                    <span className="dot" />
                    {course?.code ?? 'No class'}
                  </span>
                  <span className="hero-kind">{TYPE_LABELS[hero.type]}</span>
                </span>
              </div>
              <h2 className="hero-title">{hero.label}</h2>
              <p className="hero-meta">
                {hero.points > 0 && <span className="pill">{hero.points} pts</span>}
                <span className="pill">~{fmtMinutes(hero.estimatedMinutes)}</span>
                <span className="pill">due {fmtDate(dateOf(hero.dueAt, tz), 'short')}</span>
              </p>
            </>
          ) : (
            <>
              <h2 className="hero-title">Your first assignment lands here.</h2>
              <p className="hero-why">Sync Halo and this card fills in.</p>
            </>
          )}
          <div className="hero-actions">
            <span className="btn primary">Start</span>
            <span className="btn quiet">Details</span>
          </div>
        </section>
      </div>
    </div>
  );
}
