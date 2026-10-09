import { useContext, useEffect, useMemo, useState } from 'react';
import { useAccount } from '../../auth/AccountContext';
import { SegmentedControl } from '../../components/SegmentedControl';
import { trialState } from '../../config/flags';
import { CANCEL_LINE, TAX_LINE } from '../../config/tiers';
import { dateOf, fmtDate } from '../../domain/dates';
import type { PlusCredit } from '../../referral/credit';
import { INVITE_RULE } from '../../referral/Invite';
import { useStore } from '../../storage/store';
import { Invite, PlanChoices, PreviewMode, usePlusAfter, useTrialNumbers } from '../TrialStatus';
import { storyLines, type StoryLine } from './story';

/**
 * The end of the free week, as one screen (George, 2026-10-09; the two pages and the 1-to-10 rating of 2026-10-01
 * felt like a survey and were closed). A short recap of real things from the student's week, three or four numbers,
 * and right under it the plan choice: Keep Max, Choose Plus, the GCBC line, prices; Stay on Free a small plain link.
 * A week with nothing in it shows what Halo+ does instead of zeros. Fits a laptop screen without scrolling. Seen once.
 */
export interface TrialEndPreview {
  /** Show it as a student on Plus from a friend's invite, instead of one going back to Free. */
  gift: boolean;
  onGift: (gift: boolean) => void;
  onClose: () => void;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = 320;
const FIRST_MS = 250;

/** What Halo+ does, for a week it had nothing to count. */
const WOULD_DO: StoryLine[] = [
  { key: 'would-deadlines', score: 0, before: 'Every deadline from Halo in one list, synced every 3 hours.', after: '' },
  { key: 'would-announcements', score: 0, before: 'Announcements read for you: the dates and asks pulled out, nothing missed.', after: '' },
  { key: 'would-grades', score: 0, before: 'Grades the day they land, with what each one does to your average.', after: '' },
];

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
          {line.examples.slice(0, 1).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Real numbers, or the "would do" lines when the week had none to show. */
export function recapLines(lines: StoryLine[] | null): { lines: StoryLine[]; real: boolean } | null {
  if (lines === null) return null;
  const real = lines.filter((l) => l.n === undefined || l.n > 0);
  const counted = real.some((l) => l.n !== undefined && l.n > 0);
  return counted ? { lines: real.slice(0, 4), real: true } : { lines: WOULD_DO, real: false };
}

export function TrialEnded({ preview }: { preview?: TrialEndPreview } = {}) {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const inPreview = useContext(PreviewMode) || !!preview;
  // The preview's week: the admin's own last 7 days, so the numbers are real.
  const [week] = useState(() => ({ since: new Date(Date.now() - 7 * 86_400_000).toISOString(), until: new Date().toISOString() }));
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const livePlusAfter = usePlusAfter(profile?.trialEndsAt);
  const plusAfter: PlusCredit | null = preview ? (preview.gift ? { start: week.until, end: new Date(Date.parse(week.until) + 30 * 86_400_000).toISOString(), days: 30, running: true, after: 'trial', from: 'invited' } : null) : livePlusAfter;
  // Free after the week, or Plus from a friend's invite: either way the same screen, once.
  const onPlusGift = preview ? preview.gift : tier === 'plus' && !!plusAfter;
  const ended = !!preview || (real && trialState(profile) === 'used' && (tier === 'free' || onPlusGift) && !data.settings.trialEndSeen);
  const since = preview ? week.since : profile?.trialStartedAt;
  const until = preview ? week.until : profile?.trialEndsAt;
  const n = useTrialNumbers(since, until);
  const lines = useMemo(
    () => (since && until && n ? storyLines({ items: data.items, courses: data.courses, since, until, now: new Date().toISOString(), tz, recap: { asked: n.answered, practice: n.practice, read: n.read } }) : null),
    [since, until, n, data.items, data.courses, tz],
  );
  const recap = recapLines(lines);
  if (!ended || !since || !until) return null;
  const done = preview ? preview.onClose : () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const after = recap ? FIRST_MS + recap.lines.length * STEP_MS + 150 : 0;

  return (
    <PreviewMode.Provider value={inPreview}>
      <div className="onboard trial-ended" data-one="true" role="dialog" aria-modal="true" aria-label="Here's what Halo+ did for you">
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
                <button type="button" className="btn small" onClick={preview.onClose}>
                  Close preview
                </button>
              </div>
            </div>
          )}

          <section className="story story-one" key="one">
            <p className="eyebrow story-eyebrow">
              {onPlusGift ? 'Your free week of Max' : 'Your free week'} · {fmtDate(dateOf(since, tz))} to {fmtDate(dateOf(until, tz))}
            </p>
            <h1 className="story-title">{recap && !recap.real ? "Here's what Halo+ does." : "Here's what Halo+ did for you."}</h1>
            {recap === null ? (
              <p className="hint" aria-busy="true">
                Looking back at your week…
              </p>
            ) : (
              <ol className="story-lines" data-real={recap.real}>
                {recap.lines.map((l, i) => (
                  <Line key={l.key} line={l} i={i} />
                ))}
              </ol>
            )}

            <div className="story-plans" style={{ animationDelay: `${after}ms` }}>
              <p className="story-plans-lede">{onPlusGift && plusAfter ? `Your friend's invite already covers Plus until ${fmtDate(dateOf(plusAfter.end, tz), 'long')}. Keep Max, or carry on with Plus free.` : 'Keep going, or carry on with Free. Nothing charges unless you choose a plan.'}</p>
              <PlanChoices maxTag="What you had this week" plusCovered={onPlusGift && plusAfter ? `Free until ${fmtDate(dateOf(plusAfter.end, tz), 'long')}, from your friend's invite.` : undefined} />
              <p className="gcbc-terms">
                {CANCEL_LINE} · {TAX_LINE}
              </p>
              <div className="gcbc-free">
                <button type="button" className="gcbc-free-link" onClick={done}>
                  {onPlusGift ? 'Continue with Plus free' : 'Stay on Free'}
                </button>
                <span className="gcbc-invite-line">
                  Or invite a friend: you both get 30 days of Plus free. {INVITE_RULE} <Invite label="Invite a friend" />
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PreviewMode.Provider>
  );
}
