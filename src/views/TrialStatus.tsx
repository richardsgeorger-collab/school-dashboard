import { creditLine, plusCredit, type PlusCredit } from '../referral/credit';
import { InviteBlock, InviteButton, INVITE_RULE, progressLine, useInviteProgress, useMyGrants } from '../referral/Invite';
import { createContext, useContext, useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { Modal } from '../components/Modal';
import { SegmentedControl } from '../components/SegmentedControl';
import { IconAsk, IconColour, IconInbox, IconNow, IconStudy, IconSync } from '../components/Icons';
import { friendGift, trialState } from '../config/flags';
import { trialCalendar, trialChipShort, trialChipText, trialEndSentence } from '../config/trialCalendar';
import { CANCEL_LINE, PRICES, TAX_LINE, TRIAL, type Feature } from '../config/tiers';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { readLedger } from '../halo/announce';
import { supabase } from '../auth/client';
import { useStore } from '../storage/store';
import { UpgradeButton } from './PlanWall';

/** A real trial, not a friend's gift that happens to set the trial columns. */
function useTrial() {
  const { profile } = useAccount();
  const { data } = useStore();
  const state = trialState(profile);
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom && !friendGift(profile);
  const cal = real && profile?.trialEndsAt ? trialCalendar(profile.trialEndsAt, data.settings.timezone) : null;
  return { state, real, cal, profile };
}

/** Which plan a feature needs, shown only during the trial so the student always knows what will go away. */
export function PlanBadge({ plan }: { plan: 'max' | 'plus' }) {
  const { state, real } = useTrial();
  if (state !== 'active' || !real) return null;
  return (
    <span className="plan-badge" title={plan === 'max' ? 'Part of Max: goes away when the trial ends unless you keep Max' : 'Part of Plus: goes away when the trial ends unless you choose Plus or Max'}>
      {plan === 'max' ? 'Max' : 'Plus'}
    </span>
  );
}

const INCLUDED: { icon: () => React.ReactElement; text: string; plan: 'plus' | 'max' }[] = [
  { icon: IconSync, text: 'Pulls every class, assignment, and grade from Halo', plan: 'plus' },
  { icon: IconInbox, text: 'Reads your announcements so you never miss hidden work', plan: 'plus' },
  { icon: IconNow, text: 'Tells you what to do next', plan: 'plus' },
  { icon: IconStudy, text: 'Builds study plans and practice worksheets for your quizzes', plan: 'max' },
  { icon: IconAsk, text: 'Answers questions about your own classes', plan: 'max' },
  { icon: IconColour, text: 'Pick your own color', plan: 'max' },
];

/**
 * Admin preview of the end-of-trial screen (George, 2026-10-01): inside it no button charges, invites, saves a
 * rating or ends anything. Every live button on the screen reads this.
 */
const PreviewMode = createContext(false);
const noop = () => undefined;

function PlanButton({ tier, label, primary = true }: { tier: 'plus' | 'max'; label: string; primary?: boolean }) {
  if (useContext(PreviewMode))
    return (
      <button type="button" className={primary ? 'btn small primary' : 'btn small'} onClick={noop} title="Preview: nothing is charged">
        {label}
      </button>
    );
  return <UpgradeButton tier={tier} label={label} primary={primary} cancelNote={false} />;
}

function Invite({ label }: { label: string }) {
  if (useContext(PreviewMode))
    return (
      <button type="button" className="btn primary" onClick={noop} title="Preview: nothing is shared">
        {label}
      </button>
    );
  return <InviteButton label={label} />;
}

/** A paper cup, small or large: the GCBC line beside Plus and Max. */
function Cup({ size }: { size: 'small' | 'large' }) {
  const h = size === 'small' ? 16 : 22;
  return (
    <svg className="cup" data-size={size} viewBox="0 0 16 22" width={(h * 16) / 22} height={h} aria-hidden fill="none">
      <path d="M2 5h12l-1.6 15a1.2 1.2 0 0 1-1.2 1H4.8a1.2 1.2 0 0 1-1.2-1L2 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M1.2 5h13.6M5 5l.6-3.4h4.8L11 5M9.5 1.6 11 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The three ways on: Max, Plus, or Free. Monthly prices, cancel anytime and tax beside each. Max first, marked as what
 * the student has (or had) this week. The GCBC line (George, 2026-10-01): Plus costs about a small drink at the Grand
 * Canyon Beverage Company, Max about a large, except these help.
 */
export function PlanChoices({ onFree, freeLabel = 'Stay on Free', maxTag = 'What you have now' }: { onFree?: () => void; freeLabel?: string; maxTag?: string }) {
  return (
    <div className="plan-choices">
      <div className="plan-choice" data-best="true">
        <span className="plan-choice-name">
          <span className="plan-choice-tag">{maxTag}</span>
          <b>Max · ${PRICES.max.month.toFixed(2)} a month</b>
          <small className="tax-note">{TAX_LINE}</small>
          <span>Everything you had this week. {CANCEL_LINE}.</span>
          <span className="gcbc">
            <Cup size="large" />
            <span>About a large at GCBC, minus the regret.</span>
          </span>
        </span>
        <PlanButton tier="max" label="Keep Max" />
      </div>
      <div className="plan-choice">
        <span className="plan-choice-name">
          <b>Plus · ${PRICES.plus.month.toFixed(2)} a month</b>
          <small className="tax-note">{TAX_LINE}</small>
          <span>Halo sync, real grades, announcements read for you. No study tools. {CANCEL_LINE}.</span>
          <span className="gcbc">
            <Cup size="small" />
            <span>About a small at GCBC. Except this one actually helps.</span>
          </span>
        </span>
        <PlanButton tier="plus" label="Choose Plus" primary={false} />
      </div>
      {onFree && (
        <div className="plan-choice">
          <span className="plan-choice-name">
            <b>Free</b>
            <span>Classes from their syllabi and what you add yourself.</span>
          </span>
          <button type="button" className="btn small" onClick={onFree}>
            {freeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/** "Free trial · 5 days left" in the top bar. Tapping it says what is included, when it ends, and what then. */
export function TrialChip() {
  const { state, real, cal } = useTrial();
  const [open, setOpen] = useState(false);
  const { data } = useStore();
  const plusAfter = usePlusAfter(cal?.endsAt);
  if (state !== 'active' || !real || !cal) return null;
  const tz = data.settings.timezone;
  return (
    <>
      <button type="button" className="trial-chip" data-urgent={cal.daysLeft <= 2} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="chip-long">{trialChipText(cal.daysLeft)}</span>
        <span className="chip-short" aria-hidden>{trialChipShort(cal.daysLeft)}</span>
      </button>
      {open && (
        <Modal title="Your free trial" onClose={() => setOpen(false)}>
          <div className="modal-body trial-sheet">
            <p>
              <b>{cal.daysLeft <= 1 ? 'This is the last day.' : `${cal.daysLeft} days left.`}</b> It ends {fmtDate(dateOf(cal.endsAt, tz), 'long')} at {fmtTime(cal.endsAt, tz)}.
            </p>
            <h3>What's included</h3>
            <ul>
              {INCLUDED.map((l) => (
                <li key={l.text}>{l.text}</li>
              ))}
            </ul>
            <h3>After it ends</h3>
            {plusAfter && <p className="credit-line">{creditLine(plusAfter, tz)}</p>}
            <p className="hint">{plusAfter ? `From ${creditFrom(plusAfter)}: Halo sync and every announcement read for you, free until ${fmtDate(dateOf(plusAfter.end, tz), 'long')}. The study tools lock unless you keep Max. Nothing charges.` : trialEndSentence(cal, tz)}</p>
            <h3>Keep it</h3>
            <PlanChoices />
            <h3>Or invite a friend</h3>
            <InviteBlock />
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * The Plus credit from invites, as one stretch: every back-to-back 30 days (two friends are 60, not the first 30), when
 * it starts and why, and whose invite it is (referral/credit.ts). Null with none left.
 */
export function usePlusCredit(): PlusCredit | null {
  const { profile } = useAccount();
  const grants = useMyGrants();
  return plusCredit(grants, { trialEndsAt: profile?.trialEndsAt ?? null, rewardTier: profile?.rewardTier ?? null, rewardUntil: profile?.rewardUntil ?? null }, new Date().toISOString());
}

/** The Plus credit that follows the free week (or is running now), if there is one. */
export function usePlusAfter(endsAt: string | null | undefined) {
  const c = usePlusCredit();
  if (!endsAt || !c) return null;
  return c.running || Math.abs(Date.parse(c.start) - Date.parse(endsAt)) < 36 * 3_600_000 ? c : null;
}

/** "your friend's invite", "the friends you invited": said the right way round. */
const creditFrom = (c: PlusCredit) => (c.from === 'invited' ? "your friend's invite" : c.from === 'inviting' ? 'the friends you invited' : 'invites');

export interface TrialNumbers {
  classes: number;
  fromHalo: number;
  read: number;
  found: number;
  caught: number;
  practice: number;
  answered: number;
}

/**
 * What the trial did, in numbers. The server's count where it keeps one (AI answers, practice sets, announcements
 * read, from every device), this device's records as a floor, and the planner itself for classes, assignments and
 * due dates an announcement moved. Every number is a real count; a zero line is never shown.
 */
export function useTrialNumbers(since: string | null | undefined, until: string | null | undefined) {
  const { data } = useStore();
  const [n, setN] = useState<TrialNumbers | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = since ?? '';
      const u = until ?? '9999';
      const inWeek = (at: string | null | undefined) => !!at && at >= s && at <= u;
      const ledger = await readLedger.all().catch(() => new Map());
      let read = 0;
      let found = 0;
      for (const e of ledger.values()) if (inWeek(e.at)) {
        read += 1;
        found += e.count;
      }
      let answered = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) ?? '';
          if (k !== 'school-dashboard:chat' && !k.startsWith('school-dashboard:ask:')) continue;
          const turns = JSON.parse(localStorage.getItem(k) ?? '[]') as { role?: string; at?: string; failed?: boolean }[];
          answered += turns.filter((t) => t.role === 'assistant' && !t.failed && inWeek(t.at)).length;
        }
      } catch {
        /* storage unavailable */
      }
      let server = { asked: 0, practice: 0, read: 0, found: 0 };
      const c = supabase();
      if (c && since) {
        const { data: r } = await c.rpc('my_trial_recap', { p_since: since, p_until: until ?? new Date().toISOString() }).then((x) => x, () => ({ data: null }));
        if (r) server = { ...server, ...(r as typeof server) };
      }
      const fromAnnouncements = data.items.reduce((a, i) => a + (i.requirements ?? []).filter((q) => q.source?.kind === 'announcement' && inWeek(q.addedAt)).length, 0);
      if (live)
        setN({
          classes: data.courses.filter((x) => x.haloSlugId).length,
          fromHalo: data.items.filter((i) => i.source === 'halo').length,
          read: Math.max(read, server.read),
          found: Math.max(found, server.found, fromAnnouncements),
          caught: data.items.filter((i) => inWeek(i.dateChange?.at)).length,
          practice: server.practice,
          answered: Math.max(answered, server.asked),
        });
    })();
    return () => {
      live = false;
    };
  }, [since, until, data.items, data.courses]);
  return n;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The recap's lines, in order, only those with something behind them. */
export function recapLines(n: TrialNumbers | null): [number, string][] {
  if (!n) return [];
  const lines: [number, string][] = [
    [n.classes, plural(n.classes, 'class synced from Halo', 'classes synced from Halo')],
    [n.fromHalo, plural(n.fromHalo, 'assignment pulled in', 'assignments pulled in')],
    [n.read, plural(n.read, 'announcement read for you', 'announcements read for you')],
    [n.found, plural(n.found, 'requirement found in announcements', 'requirements found in announcements')],
    [n.caught, plural(n.caught, 'due date change caught', 'due date changes caught')],
    [n.practice, plural(n.practice, 'study plan or practice set built', 'study plans and practice sets built')],
    [n.answered, plural(n.answered, 'question answered', 'questions answered')],
  ];
  return lines.filter(([v]) => v > 0);
}

/**
 * "How much did Halo+ help this week?" 1 to 10, once, at the end of the free week (George, 2026-10-01). 1 to 6 asks
 * what would make it better (into Feedback); 7 to 10 says thanks and offers the friend invite. Skippable, and it sits
 * above the plans without ever standing in front of them.
 */
function TrialRating({ onHigh }: { onHigh: () => void }) {
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
    await c.rpc('rate_trial', { p_rating: r, p_comment: comment ?? null }).then(() => undefined, () => undefined);
  };
  useEffect(() => {
    if (rating !== null && rating >= 7) onHigh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating]);
  if (saved && saved.rating === null) return null; // skipped
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
        <button type="button" className="hero-inline" onClick={() => save(null)}>
          Skip
        </button>
      </section>
    );
  if (rating >= 7)
    return (
      <section className="trial-rating" aria-label="Thanks">
        <p className="trial-rating-q">
          {rating}/10. Thank you, that means a lot.
        </p>
        <div className="plan-choice plan-choice-invite">
          <span className="plan-choice-name">
            <b>Know someone who'd like it? Invite a friend and you both get 30 days of Plus free.</b>
            <span>{INVITE_RULE}</span>
          </span>
          <Invite label="Invite a friend" />
        </div>
      </section>
    );
  return (
    <section className="trial-rating" aria-label="What would make it better">
      {sent ? (
        <p className="trial-rating-q" role="status">
          Thanks. George reads every one of these.
        </p>
      ) : (
        <>
          <label className="field">
            <span className="trial-rating-q">{rating}/10. What would make it better?</span>
            <textarea className="field-input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything: what was missing, what was annoying, what you expected" />
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

/**
 * The first open after the trial ends: one screen that says it ended, what Max did in numbers, what changes, what
 * stays, and the three choices. Seen once; the frozen banner carries on from there as before.
 */
export interface TrialEndPreview {
  /** Show it as a student on Plus from a friend's invite, instead of one going back to Free. */
  gift: boolean;
  onGift: (gift: boolean) => void;
  onClose: () => void;
}

export function TrialEnded({ preview }: { preview?: TrialEndPreview } = {}) {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  // The preview's week: the admin's own last 7 days, so the numbers are real.
  const [week] = useState(() => ({ since: new Date(Date.now() - 7 * 86_400_000).toISOString(), until: new Date().toISOString() }));
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const livePlusAfter = usePlusAfter(profile?.trialEndsAt);
  const plusAfter: PlusCredit | null = preview ? (preview.gift ? { start: week.until, end: new Date(Date.parse(week.until) + 30 * 86_400_000).toISOString(), days: 30, running: true, after: 'trial', from: 'invited' } : null) : livePlusAfter;
  // Free after the week, or Plus from a friend's invite: either way one clear screen, once.
  const onPlusGift = preview ? preview.gift : tier === 'plus' && !!plusAfter;
  const ended = !!preview || (real && trialState(profile) === 'used' && (tier === 'free' || onPlusGift) && !data.settings.trialEndSeen);
  const endsAt = preview ? week.until : profile?.trialEndsAt;
  const n = useTrialNumbers(preview ? week.since : profile?.trialStartedAt, preview ? week.until : profile?.trialEndsAt);
  const invites = useInviteProgress();
  // A 7 to 10 shows the invite right under the rating, so the card further down would say it twice.
  const [inviteAbove, setInviteAbove] = useState(false);
  if (!ended || !endsAt) return null;
  const done = preview ? preview.onClose : () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const numbers = recapLines(n);
  return (
    <PreviewMode.Provider value={!!preview}>
    <div className="onboard trial-ended" role="dialog" aria-modal="true" aria-label={preview ? 'Preview: your free trial ended' : 'Your free trial ended'}>
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
        <section className="onboard-step">
          <p className="eyebrow">Ended {fmtDate(dateOf(endsAt, tz), 'long')}</p>
          <h1 className="onboard-title">{onPlusGift ? 'Your free week of Max ended. Plus from your friend is on.' : 'Your free trial ended.'}</h1>
          {onPlusGift && plusAfter && <p className="onboard-text">Plus is free until {fmtDate(dateOf(plusAfter.end, tz), 'long')}, from {creditFrom(plusAfter)}: Halo sync, real grades, and every announcement read for you. No card; after that you choose again.</p>}
          {numbers.length > 0 && (
            <>
              <p className="onboard-text">What it did for you this week:</p>
              <div className="ended-numbers">
                {numbers.map(([v, label]) => (
                  <p key={label} className="ended-number">
                    <b>{v}</b>
                    <span>{label}</span>
                  </p>
                ))}
              </div>
            </>
          )}
          <TrialRating onHigh={() => setInviteAbove(true)} />
          <h3 className="section-title">What changes now</h3>
          <ul className="ended-list">
            {onPlusGift ? (
              <li>Study, Ask and Check are locked. Halo sync and announcements keep going.</li>
            ) : (
              <>
                <li>Halo sync is paused. Due dates stay as they were at your last sync.</li>
                <li>New announcements aren't read for you.</li>
                <li>Study, Ask and Check are locked.</li>
              </>
            )}
          </ul>
          <h3 className="section-title">What you keep</h3>
          <ul className="ended-list">
            <li>All your classes, assignments, grades and announcements so far.</li>
            <li>Everything you added or checked off yourself.</li>
          </ul>
          <PlanChoices onFree={done} freeLabel="Stay on Free" maxTag="What you had this week" />
          {/* The fourth way on, as prominent as the plans (George, 2026-09-29): the most important invite spot. */}
          {!inviteAbove && (
          <div className="plan-choice plan-choice-invite">
            <span className="plan-choice-name">
              <b>Not ready to pay? Invite a friend and you both get Plus free for 30 days.</b>
              <span>{INVITE_RULE}</span>
              {progressLine(invites) && <span className="invite-progress">{progressLine(invites)}</span>}
            </span>
            <Invite label="Invite a friend" />
          </div>
          )}
          <p className="hint">Nothing charged, and nothing will unless you choose a plan.</p>
        </section>
      </div>
    </div>
    </PreviewMode.Provider>
  );
}

/** For a student who has not tried Max: the offer, one quiet line. Used on Now and You. */
export const TRIAL_WORDS = TRIAL.offer;
export type { Feature };

/**
 * The two reminders, in the app: two days before the trial ends, and on the last day. Each says what Max did, what
 * happens after, and the choices. On any other day of the trial the chip in the top bar is the reminder.
 */
export function TrialReminder() {
  const { state, real, cal, profile } = useTrial();
  const n = useTrialNumbers(profile?.trialStartedAt, null);
  const { data } = useStore();
  const plusAfter = usePlusAfter(cal?.endsAt);
  if (state !== 'active' || !real || !cal || cal.daysLeft > 2) return null;
  const last = cal.daysLeft === 1;
  const did = n ? [n.fromHalo ? `pulled ${n.fromHalo} assignments from Halo` : '', n.read ? `read ${n.read} announcement${n.read === 1 ? '' : 's'}` : '', n.found ? `found ${n.found} hidden requirement${n.found === 1 ? '' : 's'}` : '', n.answered ? `answered ${n.answered} question${n.answered === 1 ? '' : 's'}` : ''].filter(Boolean) : [];
  return (
    <section className="card trial-receipts" aria-label="Your free trial">
      <p className="eyebrow">{last ? 'Last day of your free trial' : 'Your free trial ends in 2 days'}</p>
      {did.length > 0 && <p className="trial-lead">This week Halo+ {did.join(', ')}.</p>}
      <p className="hint">
        {plusAfter
          ? `${last ? 'Tomorrow' : 'After that'} ${creditFrom(plusAfter)} ${plusAfter.from === 'invited' ? 'gives' : 'give'} you Plus, free until ${fmtDate(dateOf(plusAfter.end, data.settings.timezone), 'long')}: sync and announcements keep going; Study locks unless you keep Max. Nothing charges.`
          : `${last ? 'Tomorrow you go back to Free' : 'After that you go back to Free'}: Halo sync pauses, announcements aren't read, and Study locks. Everything you have stays. Nothing charges.`}
      </p>
      <InviteBlock headline="Not ready to pay? Invite a friend and you both get Plus free for 30 days." />
      <PlanChoices />
    </section>
  );
}
