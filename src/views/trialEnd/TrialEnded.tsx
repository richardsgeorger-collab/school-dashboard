import { useContext, useEffect, useMemo, useState } from 'react';
import { warmCheckout } from '../../billing/client';
import { useAccount } from '../../auth/AccountContext';
import { trialState } from '../../config/flags';
import { CANCEL_LINE, PLAN_LINES, PRICES } from '../../config/tiers';
import { dateOf, fmtDate } from '../../domain/dates';
import { INVITE_RULE } from '../../referral/Invite';
import { useStore } from '../../storage/store';
import { Invite, PlanButton, PreviewMode, useTrialNumbers } from '../TrialStatus';
import { storyLines, type StoryLine } from './story';

/**
 * The end of the free trial, as one calm screen (George, 2026-10-09; reworked 2026-10-25; two cards 2026-10-29). Max is
 * the clear main choice: what it did for this student this week in real numbers (announcements caught, moved dates
 * found, on time), then "Keep Max · $0.99/mo", which opens Stripe's checkout at once (made ready while they read, Apple
 * Pay and Google Pay at the top of Stripe's page). Free is a real "Stay on Free" button beside it, quieter, with what
 * they keep. Honest: the price in the button, tax and cancel beside it, no countdown, no fake urgency. Seen once.
 */
export interface TrialEndPreview {
  onClose: () => void;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = 320;
const FIRST_MS = 250;

/** What Halo+ does, for a week it had nothing to count. */
const WOULD_DO: StoryLine[] = [
  { key: 'would-announcements', score: 0, before: 'Every announcement read for you: hidden due dates, moved dates and extra steps, nothing missed.', after: '' },
  { key: 'would-sync', score: 0, before: "Auto-sync every 3 hours, so Halo+ is current even when you're not on Halo.", after: '' },
  { key: 'would-remind', score: 0, before: 'Reminders, the Sunday preview and your deadlines in Google or Apple Calendar.', after: '' },
];

/** What Max caught this week that a student would have missed: things only in announcements, and moved dates. */
export function caughtCount(lines: StoryLine[] | null): number {
  if (!lines) return 0;
  const only = lines.find((l) => l.key === 'only' || l.key === 'found')?.n ?? 0;
  const moved = lines.filter((l) => l.key === 'moved').length;
  return only + moved;
}

/** Max first and clearly the main card; Free a real button, quieter (2026-10-29). */
function TrialEndChoices({ lines, onFree }: { lines: StoryLine[] | null; onFree: () => void }) {
  // The checkout function and the sign-in are woken as the choices appear (and the button makes the checkout ready).
  useEffect(() => {
    warmCheckout();
  }, []);
  return (
    <div className="trial-end-two">
      <div className="trial-end-max" data-tier="max">
        <span className="trial-end-tag">What you have now</span>
        <p className="trial-end-price">
          Max <span>· ${PRICES.max.month.toFixed(2)} a month</span>
        </p>
        {lines === null ? (
          <p className="hint" aria-busy="true">
            Looking back at your week…
          </p>
        ) : (
          <ol className="story-lines trial-end-week">
            {lines.map((l, i) => (
              <Line key={l.key} line={l} i={i} />
            ))}
          </ol>
        )}
        <PlanButton tier="max" label={`Keep Max · $${PRICES.max.month.toFixed(2)}/mo`} />
        <p className="hint trial-end-how">Opens Stripe's checkout at once, Apple Pay and Google Pay at the top, your email filled in.</p>
      </div>
      <div className="trial-end-free" data-tier="free">
        <p className="trial-end-price">
          Free <span>· $0</span>
        </p>
        <ul className="plan-lines">
          {PLAN_LINES.free.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <button type="button" className="btn trial-end-stay" onClick={onFree}>
          Stay on Free
        </button>
      </div>
    </div>
  );
}

/** A number that counts up from zero once its line has appeared. */
function useCountUp(n: number, delayMs: number): number {
  const [v, setV] = useState(() => (reduced() ? n : 0));
  useEffect(() => {
    if (reduced()) return setV(n);
    let raf = 0;
    const start = performance.now() + delayMs;
    const dur = Math.min(900, 400 + n * 20);
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / dur));
      setV(Math.round(n * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, delayMs]);
  return v;
}

function Line({ line, i }: { line: StoryLine; i: number }) {
  const delay = FIRST_MS + i * STEP_MS;
  const v = useCountUp(line.n ?? 0, delay + 150);
  return (
    <li className="story-line" style={{ animationDelay: `${delay}ms` }} data-key={line.key}>
      <p className="story-text">
        {line.before}
        {line.n !== undefined && (
          <b className="story-n" aria-label={String(line.n)}>
            {v}
          </b>
        )}
        {line.after}
      </p>
      {line.examples && line.examples.length > 0 && (
        <ul className="story-examples">
          {line.examples.slice(0, line.key === 'only' ? 2 : 1).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Real numbers (the three strongest), or the "would do" lines when the week had none to show. */
export function recapLines(lines: StoryLine[] | null): { lines: StoryLine[]; real: boolean } | null {
  if (lines === null) return null;
  const real = lines.filter((l) => l.n === undefined || l.n > 0);
  const counted = real.some((l) => l.n !== undefined && l.n > 0);
  return counted ? { lines: real.slice(0, 3), real: true } : { lines: WOULD_DO, real: false };
}

export function TrialEnded({ preview }: { preview?: TrialEndPreview } = {}) {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const inPreview = useContext(PreviewMode) || !!preview;
  // The preview's week: the admin's own last 7 days, so the numbers are real.
  const [week] = useState(() => ({ since: new Date(Date.now() - 7 * 86_400_000).toISOString(), until: new Date().toISOString() }));
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const ended = !!preview || (real && trialState(profile) === 'used' && tier === 'free' && !data.settings.trialEndSeen);
  const since = preview ? week.since : profile?.trialStartedAt;
  const until = preview ? week.until : profile?.trialEndsAt;
  const n = useTrialNumbers(since, until);
  const lines = useMemo(
    () => (since && until && n ? storyLines({ items: data.items, courses: data.courses, since, until, now: new Date().toISOString(), tz, recap: { asked: 0, practice: n.practice, read: n.read } }) : null),
    [since, until, n, data.items, data.courses, tz],
  );
  const recap = recapLines(lines);
  if (!ended || !since || !until) return null;
  const done = preview ? preview.onClose : () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const caught = caughtCount(lines);
  const title = caught > 0 ? `Max caught ${caught} ${caught === 1 ? 'thing' : 'things'} this week you'd have missed.` : 'Your free week is over. Everything you have stays.';

  return (
    <PreviewMode.Provider value={inPreview}>
      <div className="onboard trial-ended" data-one="true" role="dialog" aria-modal="true" aria-label="Your free week is over">
        <div className="onboard-inner">
          {preview && (
            <div className="trial-preview-bar" role="status">
              <p>
                <b>Preview, admin only.</b> Your own last 7 days, real numbers. Nothing here saves, charges, shares or ends anything.
              </p>
              <div className="trial-preview-actions">
                <button type="button" className="btn small" onClick={preview.onClose}>
                  Close preview
                </button>
              </div>
            </div>
          )}

          <section className="story story-one" key="one">
            <p className="eyebrow story-eyebrow">
              Your free week · {fmtDate(dateOf(since < until ? since : until, tz))} to {fmtDate(dateOf(until, tz))}
            </p>
            <h1 className="story-title">{title}</h1>
            <TrialEndChoices lines={recap ? recap.lines : null} onFree={done} />
            <p className="gcbc-terms">
              {CANCEL_LINE} · nothing charges unless you choose Max
            </p>
            <p className="gcbc-invite-line">
              <span>Or invite a friend: you both get 30 days of Max free. {INVITE_RULE}</span>
              <Invite label="Invite a friend" />
            </p>
          </section>
        </div>
      </div>
    </PreviewMode.Provider>
  );
}
