import { useContext, useEffect, useMemo, useState } from 'react';
import { warmCheckout } from '../../billing/client';
import { useAccount } from '../../auth/AccountContext';
import { trialState } from '../../config/flags';
import { CANCEL_LINE, PLAN_LINES, PRICES } from '../../config/tiers';
import { dateOf, fmtDate } from '../../domain/dates';
import { INVITE_RULE } from '../../referral/Invite';
import { useStore } from '../../storage/store';
import { Invite, PlanButton, PreviewMode, useTrialNumbers } from '../TrialStatus';
import type { StoryLine } from './story';
import { maxWeek, type Caught, type MaxWeek } from './maxWeek';

/**
 * The end of the free trial, as one calm screen (George, 2026-10-09; reworked 2026-10-25; two cards 2026-10-29). Max is
 * the clear main choice: what Max did for this student this week, only real numbers from their own week and only
 * things that are Max (maxWeek.ts): what it caught that was only in announcements (the three strongest, the rest
 * behind "+N more"), announcements read, moved dates, extra steps, syncs on its own while they were away, reminders
 * and the Sunday preview; any line that would be zero is left out. One honest line on what stops on Free, then "Keep
 * Max · $0.99/mo", which opens Stripe's checkout at once (made ready while they read), with the Apple Pay, Google Pay
 * and card marks under it. Free is a real "Stay on Free" button beside it, quieter, with what they keep. No
 * countdown, no fake urgency, no made-up numbers. Seen once.
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

const KIND: Record<Caught['kind'], string> = { only: 'Only in an announcement', step: 'Extra step', moved: 'Due date moved', new: 'Only announced' };
const SHOWN = 3;

/** What Max caught: the three strongest, the rest behind "+N more" (George, 2026-10-29). */
function CaughtList({ caught }: { caught: Caught[] }) {
  const [open, setOpen] = useState(false);
  const more = caught.length - SHOWN;
  return (
    <div className="trial-end-caught">
      <ul>
        {(open ? caught : caught.slice(0, SHOWN)).map((c) => (
          <li key={c.key} data-kind={c.kind}>
            <p className="tec-what">
              {c.code && <b>{c.code}</b>}
              {c.code && ' '}
              {c.what}
            </p>
            <p className="tec-how">
              {KIND[c.kind]}
              {c.on ? ` · ${c.on}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className="tec-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : `+${more} more`}
        </button>
      )}
    </div>
  );
}

/**
 * The ways to pay on Stripe's page, under the button (George, 2026-10-29): Apple's and Google's own acceptance marks,
 * unaltered (public/pay/, from developer.apple.com/apple-pay/marketing and Google Pay's brand guidelines), all the
 * same height, each with its clear space (a quarter of the mark's height for Apple, half the G's height for Google),
 * none sharing a border; and a plain card, no card brand's artwork.
 */
function PayMarks() {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="trial-end-pay" role="img" aria-label="Pay with Apple Pay, Google Pay or a card">
      <img src={`${base}pay/apple-pay-mark.svg`} alt="" height={26} width={41} />
      {/* Google's file has its clear space inside it (the pill is 400 of 742 units tall): drawn so the pill itself is 26 px like the others. */}
      <img className="trial-end-gpay" src={`${base}pay/google-pay-mark.svg`} alt="" height={48} width={71} />
      <span className="trial-end-card" aria-hidden>
        <svg viewBox="0 0 24 16" width="22" height="15">
          <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 5h22" stroke="currentColor" strokeWidth="2.4" />
          <path d="M4 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Card
      </span>
    </div>
  );
}

/** Max first and clearly the main card; Free a real button, quieter (2026-10-29). */
function TrialEndChoices({ week, onFree }: { week: MaxWeek | null; onFree: () => void }) {
  // The checkout function and the sign-in are woken as the choices appear (and the button makes the checkout ready).
  useEffect(() => {
    warmCheckout();
  }, []);
  const lines: StoryLine[] | null = week ? (week.any ? week.lines.map((l) => ({ key: l.key, score: 0, before: l.before, n: l.n, after: l.after })) : WOULD_DO) : null;
  return (
    <div className="trial-end-two">
      <div className="trial-end-max" data-tier="max">
        <span className="trial-end-tag">What you have now</span>
        <p className="trial-end-price">
          Max <span>· ${PRICES.max.month.toFixed(2)} a month</span>
        </p>
        {week && week.caught.length > 0 && <CaughtList caught={week.caught} />}
        {lines === null ? (
          <p className="hint" aria-busy="true">
            Looking back at your week…
          </p>
        ) : (
          lines.length > 0 && (
            <ol className="story-lines trial-end-week">
              {lines.map((l, i) => (
                <Line key={l.key} line={l} i={i} />
              ))}
            </ol>
          )
        )}
        <p className="trial-end-stops">On Free, announcements stop being read and Halo only syncs when you're on it.</p>
        <PlanButton tier="max" label={`Keep Max · $${PRICES.max.month.toFixed(2)}/mo`} />
        <PayMarks />
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

export function TrialEnded({ preview }: { preview?: TrialEndPreview } = {}) {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const inPreview = useContext(PreviewMode) || !!preview;
  // The preview's week: the admin's own last 7 days, so the numbers are real.
  const [last7] = useState(() => ({ since: new Date(Date.now() - 7 * 86_400_000).toISOString(), until: new Date().toISOString() }));
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const ended = !!preview || (real && trialState(profile) === 'used' && tier === 'free' && !data.settings.trialEndSeen);
  const since = preview ? last7.since : profile?.trialStartedAt;
  const until = preview ? last7.until : profile?.trialEndsAt;
  const n = useTrialNumbers(since, until);
  const week = useMemo(
    () => (since && until && n ? maxWeek({ items: data.items, courses: data.courses, since, until, tz, counts: { read: n.read, autoSyncs: n.autoSyncs, reminders: n.reminders, sundays: n.sundays, practice: n.practice } }) : null),
    [since, until, n, data.items, data.courses, tz],
  );
  if (!ended || !since || !until) return null;
  const done = preview ? preview.onClose : () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const title = week ? week.headline : 'Your free week is over. Everything you have stays.';

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
            <TrialEndChoices week={week} onFree={done} />
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
