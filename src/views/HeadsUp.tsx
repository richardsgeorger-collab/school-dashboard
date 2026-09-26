import { useState } from 'react';
import type { ReactNode } from 'react';

export interface HeadsUpLine {
  key: string;
  /** Red for late or broken, amber for due within a day and untouched; everything else is grey. */
  tone?: 'late' | 'soon' | null;
  text: ReactNode;
}

const SHOWN = 3;

/**
 * Every warning Now has, in one card: pileups, an unread requirement, something not submitted, a stale sync, work
 * waiting on someone. One line each, three shown, the rest behind "N more". This replaced six stacked coloured
 * banners, each shouting on its own.
 */
export function HeadsUp({ lines }: { lines: HeadsUpLine[] }) {
  const [all, setAll] = useState(false);
  if (lines.length === 0) return null;
  const shown = all ? lines : lines.slice(0, SHOWN);
  const rest = lines.length - shown.length;
  return (
    <section className="card headsup" aria-label="Heads up">
      <h3 className="section-title">Heads up</h3>
      <ul className="headsup-list">
        {shown.map((l) => (
          <li key={l.key} className="headsup-line" data-tone={l.tone ?? undefined}>
            <span className="headsup-dot" aria-hidden />
            <span className="headsup-text">{l.text}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" className="headsup-more" onClick={() => setAll(true)}>
          {rest} more
        </button>
      )}
    </section>
  );
}
