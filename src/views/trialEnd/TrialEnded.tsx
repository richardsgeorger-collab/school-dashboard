import { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../auth/client';
import { useAccount } from '../../auth/AccountContext';
import { SegmentedControl } from '../../components/SegmentedControl';
import { trialState } from '../../config/flags';
import { CANCEL_LINE, PRICES, TAX_LINE } from '../../config/tiers';
import { dateOf, fmtDate } from '../../domain/dates';
import type { PlusCredit } from '../../referral/credit';
import { INVITE_RULE } from '../../referral/Invite';
import { useStore } from '../../storage/store';
import { Invite, PlanButton, PreviewMode, usePlusAfter, useTrialNumbers } from '../TrialStatus';
import { storyLines, type StoryLine } from './story';

/**
 * The end of the free week, as two pages (George, 2026-10-01). Page 1, "Here's what Halo+ did for you": a few lines
 * about real things in the student's week, revealed one at a time, then the 1 to 10 rating and Continue. Page 2, the
 * GCBC page: Plus is about a small drink at the Grand Canyon Beverage Company, Max about a large, except these help.
 * Page 1 always comes first and only goes forward; page 2 always has a plain Stay on Free. Seen once.
 */
export interface TrialEndPreview {
  /** Show it as a student on Plus from a friend's invite, instead of one going back to Free. */
  gift: boolean;
  onGift: (gift: boolean) => void;
  onClose: () => void;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = 650;
const FIRST_MS = 350;

/** A number that counts up from zero once its line has appeared. */
function useCountUp(n: number, delayMs: number): number {
  const [v, setV] = useState(() => (reduced() ? n : 0));
  useEffect(() => {
    if (reduced()) return setV(n);
    let raf = 0;
    const start = performance.now() + delayMs;
    const dur = Math.min(1100, 450 + n * 25);
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
  const v = useCountUp(line.n ?? 0, delay + 200);
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
          {line.examples.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * "How much did Halo+ help this week?" 1 to 10, once. 1 to 6 asks what would make it better (into Feedback); 7 to 10
 * says thanks and offers the friend invite. Skippable; inside the admin preview nothing is saved or sent.
 */
function TrialRating() {
  const { data, actions } = useStore();
  const preview = useContext(PreviewMode);
  const [skipped, setSkipped] = useState(false);
  const saved = preview ? (skipped ? { rating: null, at: '' } : null) : data.settings.trialRating;
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = (r: number | null) => (preview ? r === null && setSkipped(true) : actions.updateSettings({ trialRating: { rating: r, at: new Date().toISOString() } }));
  const send = async (r: number, comment?: string) => {
    const c = supabase();
    if (!c || preview) return;
    await c.rpc('rate_trial', { p_rating: r, p_comment: comment ?? null }).then(
      () => undefined,
      () => undefined,
    );
  };
  if (saved && saved.rating === null) return null;
  if (rating === null)
    return (
      <section className="trial-rating" aria-label="Rate your week">
        <p className="trial-rating-q">How much did Halo+ help this week?</p>
        <div className="trial-rating-scale" role="group" aria-label="1 is not at all, 10 is a lot">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              className="trial-rating-n"
              onClick={() => {
                setRating(v);
                save(v);
                void send(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="trial-rating-ends" aria-hidden>
          <span>Not at all</span>
          <span>A lot</span>
        </div>
        <button type="button" className="hero-inline trial-rating-skip" onClick={() => save(null)}>
          Skip
        </button>
      </section>
    );
  if (rating >= 7)
    return (
      <section className="trial-rating" aria-label="Thanks">
        <p className="trial-rating-q">{rating}/10. Thank you, that means a lot.</p>
        <div className="trial-rating-invite">
          <span>
            <b>Know someone who'd like it?</b> Invite a friend and you both get 30 days of Plus free.
          </span>
          <Invite label="Invite a friend" />
        </div>
      </section>
    );
  return (
    <section className="trial-rating" aria-label="What would make it better">
      {sent ? (
        <p className="trial-rating-q" role="status">
          Thanks. We read every one of these.
        </p>
      ) : (
        <>
          <label className="field">
            <span className="trial-rating-q">{rating}/10. What would make it better?</span>
            <textarea className="field-input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was missing, what was annoying, what you expected" />
          </label>
          <div className="settings-actions">
            <button
              type="button"
              className="btn small primary"
              disabled={busy || !text.trim()}
              onClick={() => {
                setBusy(true);
                void send(rating, text.trim()).then(() => {
                  setBusy(false);
                  setSent(true);
                });
              }}
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="btn small quiet" onClick={() => setSent(true)}>
              Skip
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** A GCBC-style paper cup with a lid, a sleeve and a straw: it fills, then a little steam rises. */
function DrinkCup({ size }: { size: 'small' | 'large' }) {
  const id = `cup-${size}`;
  return (
    <svg className="drink-cup" data-size={size} viewBox="0 0 120 170" width={size === 'large' ? 124 : 92} height={size === 'large' ? 176 : 130} aria-hidden fill="none">
      <defs>
        <clipPath id={id}>
          <path d="M22 44h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7L22 44Z" />
        </clipPath>
      </defs>
      <g className="cup-steam">
        <path d="M46 26c-5-6 5-10 0-18" />
        <path d="M60 24c-5-6 5-10 0-18" />
        <path d="M74 26c-5-6 5-10 0-18" />
      </g>
      <path className="cup-straw" d="M66 40 76 4" />
      <g clipPath={`url(#${id})`}>
        <rect className="cup-fill" x="18" y="44" width="84" height="122" />
        <path className="cup-wave" d="M18 60c10-5 20 5 30 0s20-5 30 0 20 5 30 0v10H18Z" />
      </g>
      <path className="cup-body" d="M22 44h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7L22 44Z" />
      <path className="cup-sleeve" d="M28 86h64l-3 34H31Z" />
      <text className="cup-word" x="60" y="108" textAnchor="middle">
        {size === 'small' ? 'S' : 'L'}
      </text>
      <rect className="cup-lid" x="16" y="34" width="88" height="12" rx="5" />
    </svg>
  );
}

export function TrialEnded({ preview }: { preview?: TrialEndPreview } = {}) {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [page, setPage] = useState<1 | 2>(1);
  // The preview's week: the admin's own last 7 days, so the numbers are real.
  const [week] = useState(() => ({ since: new Date(Date.now() - 7 * 86_400_000).toISOString(), until: new Date().toISOString() }));
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const livePlusAfter = usePlusAfter(profile?.trialEndsAt);
  const plusAfter: PlusCredit | null = preview ? (preview.gift ? { start: week.until, end: new Date(Date.parse(week.until) + 30 * 86_400_000).toISOString(), days: 30, running: true, after: 'trial', from: 'invited' } : null) : livePlusAfter;
  // Free after the week, or Plus from a friend's invite: either way the same two pages, once.
  const onPlusGift = preview ? preview.gift : tier === 'plus' && !!plusAfter;
  const ended = !!preview || (real && trialState(profile) === 'used' && (tier === 'free' || onPlusGift) && !data.settings.trialEndSeen);
  const since = preview ? week.since : profile?.trialStartedAt;
  const until = preview ? week.until : profile?.trialEndsAt;
  const n = useTrialNumbers(since, until);
  const lines = useMemo(
    () => (since && until && n ? storyLines({ items: data.items, courses: data.courses, since, until, now: new Date().toISOString(), tz, recap: { asked: n.answered, practice: n.practice, read: n.read } }) : null),
    [since, until, n, data.items, data.courses, tz],
  );
  useEffect(() => {
    document.querySelector('.trial-ended .onboard-inner')?.scrollTo?.({ top: 0 });
  }, [page]);
  if (!ended || !since || !until) return null;
  const done = preview ? preview.onClose : () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const after = lines ? FIRST_MS + lines.length * STEP_MS + 300 : 0;

  return (
    <PreviewMode.Provider value={!!preview}>
      <div className="onboard trial-ended" data-page={page} role="dialog" aria-modal="true" aria-label={page === 1 ? "Here's what Halo+ did for you" : 'Keep going'}>
        <div className="onboard-inner">
          {preview && (
            <div className="trial-preview-bar" role="status">
              <p>
                <b>Preview, admin only.</b> Your own last 7 days, real numbers. Nothing here saves, charges, shares or ends anything.
              </p>
              <div className="trial-preview-actions">
                <SegmentedControl
                  label="Show it as"
                  value={preview.gift ? 'gift' : 'free'}
                  options={[
                    { value: 'free', label: 'Back to Free' },
                    { value: 'gift', label: "Plus from a friend's invite" },
                  ]}
                  onChange={(v) => preview.onGift(v === 'gift')}
                />
                <SegmentedControl label="Page" value={String(page)} options={[{ value: '1', label: 'Page 1' }, { value: '2', label: 'Page 2' }]} onChange={(v) => setPage(v === '2' ? 2 : 1)} />
                <button type="button" className="btn small" onClick={preview.onClose}>
                  Close preview
                </button>
              </div>
            </div>
          )}

          {page === 1 ? (
            <section className="story" key="p1">
              <p className="eyebrow story-eyebrow">
                Your free week · {fmtDate(dateOf(since, tz))} to {fmtDate(dateOf(until, tz))}
              </p>
              <h1 className="story-title">Here's what Halo+ did for you.</h1>
              {lines === null ? (
                <p className="hint" aria-busy="true">
                  Looking back at your week…
                </p>
              ) : (
                <>
                  <ol className="story-lines">
                    {lines.map((l, i) => (
                      <Line key={l.key} line={l} i={i} />
                    ))}
                  </ol>
                  <div className="story-after" style={{ animationDelay: `${after}ms` }}>
                    <TrialRating />
                    <button type="button" className="btn primary story-continue" onClick={() => setPage(2)}>
                      Continue
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="gcbc-page" key="p2">
              <p className="eyebrow">{onPlusGift ? 'Your free week of Max ended' : 'Your free week ended'}</p>
              <h1 className="gcbc-title">
                You'd pay this for a GCBC drink.
                <span>This one actually helps.</span>
              </h1>
              <p className="gcbc-lede">{onPlusGift && plusAfter ? `A small iced something is gone in twenty minutes. Your friend's invite already covered the small one: Plus is free until ${fmtDate(dateOf(plusAfter.end, tz), 'long')}.` : 'A small iced something is gone in twenty minutes. Halo+ works all month.'}</p>

              <div className="gcbc-cups">
                <article className="gcbc-plan" data-tier="max">
                  <span className="plan-choice-tag">What you had this week</span>
                  <DrinkCup size="large" />
                  <p className="gcbc-cup-label">A large at GCBC</p>
                  <h2 className="gcbc-plan-name">
                    Max <span>${PRICES.max.month.toFixed(2)} a month</span>
                  </h2>
                  <p className="gcbc-plan-what">
                    <b>Everything from this week:</b> auto-sync every 3 hours, announcements read for you, and Study, Ask and Check.
                  </p>
                  <div className="gcbc-plan-cta">
                    <PlanButton tier="max" label="Keep Max" />
                  </div>
                </article>
                <article className="gcbc-plan" data-tier="plus">
                  <DrinkCup size="small" />
                  <p className="gcbc-cup-label">A small at GCBC</p>
                  <h2 className="gcbc-plan-name">
                    Plus <span>${PRICES.plus.month.toFixed(2)} a month</span>
                  </h2>
                  <p className="gcbc-plan-what">Halo syncs on its own every 3 hours, real grades, and every announcement read for you. No study tools.</p>
                  <div className="gcbc-plan-cta">{onPlusGift && plusAfter ? <p className="gcbc-covered">Free until {fmtDate(dateOf(plusAfter.end, tz), 'long')}, from your friend's invite.</p> : <PlanButton tier="plus" label="Choose Plus" primary={false} />}</div>
                </article>
              </div>
              <p className="gcbc-terms">
                {CANCEL_LINE} · {TAX_LINE}
              </p>

              <div className="gcbc-invite">
                <span>
                  <b>Not ready? Invite a friend, you both get 30 days of Plus free.</b> {INVITE_RULE}
                </span>
                <Invite label="Invite a friend" />
              </div>

              <div className="gcbc-free">
                <button type="button" className="gcbc-free-link" onClick={done}>
                  {onPlusGift ? 'Continue with Plus free' : 'Stay on Free'}
                </button>
                <p className="hint">{onPlusGift ? 'Study, Ask and Check lock; auto-sync and announcements keep going.' : 'Free keeps your classes from your syllabi and what you add yourself. Halo sync pauses; everything you have stays.'} Nothing charges unless you choose a plan.</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </PreviewMode.Provider>
  );
}
