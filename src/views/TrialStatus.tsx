import { creditLine, plusCredit, type PlusCredit } from '../referral/credit';
import { InviteBlock, InviteButton, useMyGrants } from '../referral/Invite';
import { createContext, useContext, useEffect, useState } from 'react';
import { warmCheckout } from '../billing/client';
import { INTRO_FIRST_MONTH } from '../config/tiers';
import { DrinkCup } from './trialEnd/DrinkCup';
import { useAccount } from '../auth/AccountContext';
import { Modal } from '../components/Modal';
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

/**
 * Which plan a feature needs, shown in the trial's last two days so the student knows what will go away. Not all week:
 * three tags on the top bar from day one was noise (2026-10-02 clarity pass); the trial sheet always lists it.
 */
export function PlanBadge({ plan }: { plan: 'max' | 'plus' }) {
  const { state, real, cal } = useTrial();
  if (state !== 'active' || !real || !cal || cal.daysLeft > 2) return null;
  return (
    <span className="plan-badge" title={plan === 'max' ? 'Part of Max: goes away when the trial ends unless you keep Max' : 'Part of Plus: goes away when the trial ends unless you choose Plus or Max'}>
      {plan === 'max' ? 'Max' : 'Plus'}
    </span>
  );
}

const INCLUDED: { icon: () => React.ReactElement; text: string; plan: 'plus' | 'max' }[] = [
  { icon: IconSync, text: 'Pulls every class, assignment, and grade from Halo', plan: 'plus' },
  { icon: IconSync, text: 'Syncs Halo on its own every 3 hours (the Chrome extension)', plan: 'plus' },
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
export const PreviewMode = createContext(false);
const noop = () => undefined;

export function PlanButton({ tier, label, primary = true, offer }: { tier: 'plus' | 'max'; label: string; primary?: boolean; offer?: 'intro' }) {
  if (useContext(PreviewMode))
    return (
      <button type="button" className={primary ? 'btn small primary' : 'btn small'} onClick={noop} title="Preview: nothing is charged">
        {label}
      </button>
    );
  return <UpgradeButton tier={tier} label={label} primary={primary} cancelNote={false} offer={offer} />;
}

export function Invite({ label }: { label: string }) {
  if (useContext(PreviewMode))
    return (
      <button type="button" className="btn primary" onClick={noop} title="Preview: nothing is shared">
        {label}
      </button>
    );
  return <InviteButton label={label} />;
}

/** A paper cup, small or large: the GCBC line beside Plus and Max. */
export function Cup({ size }: { size: 'small' | 'large' }) {
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
export function PlanChoices({ onFree, freeLabel = 'Stay on Free', maxTag = 'What you have now', plusCovered, intro = false, cups = false }: { onFree?: () => void; freeLabel?: string; maxTag?: string; /** Plus is already paid for (a friend's invite): shown in place of the Plus button. */ plusCovered?: string; /** The intro offer: Max $2.99 for the first month, then $7.99 (2026-10-09). */ intro?: boolean; /** The animated GCBC cups as each plan's visual. */ cups?: boolean }) {
  // The checkout function and the session are woken as the choice appears, so the press itself is quick (2026-10-09).
  useEffect(() => {
    warmCheckout();
  }, []);
  return (
    <div className="plan-choices" data-cups={cups || undefined}>
      <div className="plan-choice" data-best="true" data-tier="max">
        {cups && <DrinkCup size={intro ? 'xsmall' : 'large'} deal={intro} />}
        <span className="plan-choice-name">
          <span className="plan-choice-tag">{maxTag}</span>
          {intro ? (
            <span className="intro-hero">
              <span className="intro-badge">First month</span>
              <span className="intro-price-row">
                <b className="intro-price">${INTRO_FIRST_MONTH.toFixed(2)}</b>
                <s className="intro-was" aria-label={`instead of $${PRICES.max.month.toFixed(2)}`}>${PRICES.max.month.toFixed(2)}</s>
                {cups && <span className="gcbc-line">Less than a small at GCBC.</span>}
              </span>
              <span className="intro-then">
                Max · then ${PRICES.max.month.toFixed(2)}/mo · {CANCEL_LINE.toLowerCase()}
              </span>
            </span>
          ) : (
            <b className="plan-price">Max · ${PRICES.max.month.toFixed(2)} a month</b>
          )}
          {cups && !intro && <span className="gcbc-line">About a large at GCBC, minus the regret.</span>}
          <small className="tax-note">{TAX_LINE}</small>
          <span>Everything you had this week: auto-sync, announcements read for you, and the study tools.{intro ? '' : ` ${CANCEL_LINE}.`}</span>
          <span className="plan-choice-more">Only $3 more than Plus for the study tools{intro ? ' (after the first month)' : ''}.</span>
          {!cups && (
            <span className="gcbc">
              <Cup size="large" />
              <span>About a large at GCBC, minus the regret.</span>
            </span>
          )}
        </span>
        <PlanButton tier="max" label="Keep Max" offer={intro ? 'intro' : undefined} />
      </div>
      <div className="plan-choice" data-tier="plus">
        {cups && <DrinkCup size="small" />}
        <span className="plan-choice-name">
          <b className="plan-price">Plus · ${PRICES.plus.month.toFixed(2)} a month</b>
          {cups && <span className="gcbc-line">About a small at GCBC. Except this one actually helps.</span>}
          <small className="tax-note">{TAX_LINE}</small>
          <span>Auto-sync every 3 hours, real grades, announcements read for you. No study tools. {CANCEL_LINE}.</span>
          {!cups && (
            <span className="gcbc">
              <Cup size="small" />
              <span>About a small at GCBC. Except this one actually helps.</span>
            </span>
          )}
        </span>
        {plusCovered ? <p className="gcbc-covered">{plusCovered}</p> : <PlanButton tier="plus" label="Choose Plus" primary={false} />}
      </div>
      {onFree && (
        <div className="plan-choice">
          <span className="plan-choice-name">
            <b>Free</b>
            <span>Classes from your syllabi and what you add yourself.</span>
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
