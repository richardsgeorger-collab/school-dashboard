import { creditLine, plusCredit, type PlusCredit } from '../referral/credit';
import { InviteBlock, InviteButton, INVITE_RULE, progressLine, useInviteProgress, useMyGrants } from '../referral/Invite';
import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { Modal } from '../components/Modal';
import { IconAsk, IconColour, IconInbox, IconNow, IconStudy, IconSync } from '../components/Icons';
import { friendGift, trialState } from '../config/flags';
import { trialCalendar, trialChipShort, trialChipText, trialEndSentence } from '../config/trialCalendar';
import { CANCEL_LINE, PRICES, TAX_LINE, TRIAL, type Feature } from '../config/tiers';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { readLedger } from '../halo/announce';
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

/** The three ways on: Max, Plus, or Free. Monthly prices, cancel anytime beside each. */
export function PlanChoices({ onFree, freeLabel = 'Stay on Free' }: { onFree?: () => void; freeLabel?: string }) {
  return (
    <div className="plan-choices">
      <div className="plan-choice" data-best="true">
        <span className="plan-choice-name">
          <b>Max · ${PRICES.max.month.toFixed(2)} a month</b>
          <small className="tax-note">{TAX_LINE}</small>
          <span>Everything you had this week. {CANCEL_LINE}.</span>
        </span>
        <UpgradeButton tier="max" label="Keep Max" cancelNote={false} />
      </div>
      <div className="plan-choice">
        <span className="plan-choice-name">
          <b>Plus · ${PRICES.plus.month.toFixed(2)} a month</b>
          <small className="tax-note">{TAX_LINE}</small>
          <span>Halo sync, real grades, announcements read for you. No study tools. {CANCEL_LINE}.</span>
        </span>
        <UpgradeButton tier="plus" label="Choose Plus" primary={false} cancelNote={false} />
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

/** What the trial did, in numbers, from this device's own records. */
export function useTrialNumbers(since: string | null | undefined, until: string | null | undefined) {
  const { data } = useStore();
  const [n, setN] = useState<{ fromHalo: number; read: number; found: number; answered: number } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = since ?? '';
      const u = until ?? '9999';
      const ledger = await readLedger.all().catch(() => new Map());
      let read = 0;
      let found = 0;
      for (const e of ledger.values()) if (e.at >= s && e.at <= u) {
        read += 1;
        found += e.count;
      }
      let answered = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) ?? '';
          if (k !== 'school-dashboard:chat' && !k.startsWith('school-dashboard:ask:')) continue;
          const turns = JSON.parse(localStorage.getItem(k) ?? '[]') as { role?: string; at?: string; failed?: boolean }[];
          answered += turns.filter((t) => t.role === 'assistant' && !t.failed && t.at && t.at >= s && t.at <= u).length;
        }
      } catch {
        /* storage unavailable */
      }
      if (live) setN({ fromHalo: data.items.filter((i) => i.source === 'halo').length, read, found, answered });
    })();
    return () => {
      live = false;
    };
  }, [since, until, data.items]);
  return n;
}

/**
 * The first open after the trial ends: one screen that says it ended, what Max did in numbers, what changes, what
 * stays, and the three choices. Seen once; the frozen banner carries on from there as before.
 */
export function TrialEnded() {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const real = !!profile?.trialStartedAt && !!profile.trialEndsAt && !profile.friendFrom;
  const plusAfter = usePlusAfter(profile?.trialEndsAt);
  // Free after the week, or Plus from a friend's invite: either way one clear screen, once.
  const onPlusGift = tier === 'plus' && !!plusAfter;
  const ended = real && trialState(profile) === 'used' && (tier === 'free' || onPlusGift) && !data.settings.trialEndSeen;
  const n = useTrialNumbers(profile?.trialStartedAt, profile?.trialEndsAt);
  const invites = useInviteProgress();
  if (!ended || !profile?.trialEndsAt) return null;
  const done = () => actions.updateSettings({ trialEndSeen: new Date().toISOString() });
  const numbers = n ? [
    [n.fromHalo, 'assignments pulled from Halo'],
    [n.read, 'announcements read'],
    [n.found, 'hidden requirements found'],
    [n.answered, 'questions answered'],
  ].filter(([v]) => (v as number) > 0) : [];
  return (
    <div className="onboard trial-ended" role="dialog" aria-modal="true" aria-label="Your free trial ended">
      <div className="onboard-inner">
        <section className="onboard-step">
          <p className="eyebrow">Ended {fmtDate(dateOf(profile.trialEndsAt, tz), 'long')}</p>
          <h1 className="onboard-title">{onPlusGift ? 'Your free week of Max ended. Plus from your friend is on.' : 'Your free trial ended.'}</h1>
          {onPlusGift && plusAfter && <p className="onboard-text">Plus is free until {fmtDate(dateOf(plusAfter.end, tz), 'long')}, from {creditFrom(plusAfter)}: Halo sync, real grades, and every announcement read for you. No card; after that you choose again.</p>}
          {numbers.length > 0 && (
            <>
              <p className="onboard-text">What it did for you this week:</p>
              <div className="ended-numbers">
                {numbers.map(([v, label]) => (
                  <p key={label as string} className="ended-number">
                    <b>{v as number}</b>
                    <span>{label as string}</span>
                  </p>
                ))}
              </div>
            </>
          )}
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
          <PlanChoices onFree={done} freeLabel="Stay on Free" />
          {/* The fourth way on, as prominent as the plans (George, 2026-09-29): the most important invite spot. */}
          <div className="plan-choice plan-choice-invite">
            <span className="plan-choice-name">
              <b>Not ready to pay? Invite a friend and you both get Plus free for 30 days.</b>
              <span>{INVITE_RULE}</span>
              {progressLine(invites) && <span className="invite-progress">{progressLine(invites)}</span>}
            </span>
            <InviteButton label="Invite a friend" />
          </div>
          <p className="hint">Nothing charged, and nothing will unless you choose a plan.</p>
        </section>
      </div>
    </div>
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
