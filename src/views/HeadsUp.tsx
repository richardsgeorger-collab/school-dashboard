import { useState } from 'react';
import type { ReactNode } from 'react';

export interface HeadsUpLine {
  key: string;
  /** Red for late or broken, amber for due within a day and untouched; everything else is grey. */
  tone?: 'late' | 'soon' | null;
  text: ReactNode;
}

const SHOWN = 3;
const WORDS = 15;
const URL_RE = /https?:\/\/[^\s)]+/g;

/**
 * A heads-up line is one line: about fifteen words, and never a raw address. A string with a URL is cut at the
 * link, which becomes "Open"; a long string is cut at the word limit with an ellipsis. Composed lines (with their
 * own buttons) are already short by construction.
 */
export function headsUpText(text: string, max = WORDS): { text: string; href: string | null } {
  const href = text.match(URL_RE)?.[0] ?? null;
  const words = text.replace(URL_RE, '').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim().split(' ').filter(Boolean);
  const cut = words.length > max ? `${words.slice(0, max).join(' ').replace(/[,;:.]$/, '')}…` : words.join(' ');
  return { text: cut, href };
}

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
        {shown.map((l) => {
          const t = typeof l.text === 'string' ? headsUpText(l.text) : null;
          return (
            <li key={l.key} className="headsup-line" data-tone={l.tone ?? undefined}>
              <span className="headsup-dot" aria-hidden />
              <span className="headsup-text">
                {t ? t.text : l.text}
                {t?.href && (
                  <>
                    {' '}
                    <a className="hero-inline" href={t.href} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <button type="button" className="headsup-more" onClick={() => setAll(true)}>
          {rest} more
        </button>
      )}
    </section>
  );
}
