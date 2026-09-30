import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { REFERRAL } from '../config/tiers';

/**
 * Invite a friend, everywhere it belongs (George, 2026-09-29). One offer, one rule line, one share button, one
 * progress line, so every place says the same thing.
 */
export const INVITE_OFFER = `Invite a friend and you both get Plus free for ${REFERRAL.days} days.`;
/** The rules, in one line. */
export const INVITE_RULE = `Your ${REFERRAL.days} days start after any free week or paid plan you have, so none is wasted. Theirs start after their free week of Max.`;
// What the friend reads first. They get the free week of Max everyone gets, then the Plus days: never "just Plus".
export const INVITE_MESSAGE = `I've been using Halo+ for Halo, it reads your announcements and tells you what's due. With my link you get a free week of Max, then ${REFERRAL.days} days of Plus free (and I get ${REFERRAL.days} days too):`;

export function inviteLink(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/start?ref=${code}`;
}

/** The phone's own share sheet (Messages, Snapchat…) with the message ready; elsewhere, the message and link copied. */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteLink(code);
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  // The share sheet on phones and tablets (Messages, Snapchat…); a computer copies, which is what people do there.
  const touch = typeof window !== 'undefined' && (!!window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);
  if (touch && nav.share && (!nav.canShare || nav.canShare({ text: INVITE_MESSAGE, url }))) {
    try {
      await nav.share({ title: 'Halo+', text: INVITE_MESSAGE, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(`${INVITE_MESSAGE} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export interface InviteProgress {
  joined: number;
  days: number;
  /** Joins that paused a paying inviter's billing (30 days each) instead of adding Plus days. */
  paused?: number;
}

/** "2 friends joined. You've earned 60 days of Plus." */
export function useInviteProgress(): InviteProgress | null {
  const { auth } = useAccount();
  const [p, setP] = useState<InviteProgress | null>(null);
  useEffect(() => {
    const c = supabase();
    if (!c || !auth.session) return;
    void c.rpc('my_referrals').then(({ data }) => data && setP({ joined: Number((data as InviteProgress).joined) || 0, days: Number((data as InviteProgress).days) || 0, paused: Number((data as InviteProgress).paused) || 0 }));
  }, [auth.session]);
  return p;
}

export interface Grant {
  tier: string;
  starts: string;
  ends: string;
  source: string;
}

/** This account's own queued or running rewards (an invitee's month of Plus after the free week, for one). */
export function useMyGrants(): Grant[] {
  const { auth } = useAccount();
  const [g, setG] = useState<Grant[]>([]);
  useEffect(() => {
    const c = supabase();
    if (!c || !auth.session) return;
    void c.rpc('my_referrals').then(({ data }) => data && setG(((data as { grants?: Grant[] }).grants ?? []) as Grant[]));
  }, [auth.session]);
  return g;
}

/** "2 friends joined. You've earned 60 days of Plus." A paying inviter's joins move their next charge instead. */
export function progressLine(p: InviteProgress | null): string | null {
  if (!p || p.joined <= 0) return null;
  const who = `${p.joined} friend${p.joined === 1 ? '' : 's'} joined.`;
  const paused = Math.min(p.paused ?? 0, p.joined);
  const plusDays = 30 * (p.joined - paused);
  const parts = [plusDays > 0 ? `You've earned ${plusDays} days of Plus.` : '', paused > 0 ? `Your next charge moves ${30 * paused} days later.` : ''].filter(Boolean);
  return `${who} ${parts.join(' ')}`;
}

/** The share button with its result, used by every invite spot. */
export function InviteButton({ label = 'Invite a friend', primary = true, small = false }: { label?: string; primary?: boolean; small?: boolean }) {
  const { profile } = useAccount();
  const [said, setSaid] = useState<string | null>(null);
  if (!profile?.referralCode) return null;
  return (
    <>
      <button
        type="button"
        className={`btn${primary ? ' primary' : ''}${small ? ' small' : ''} invite-btn`}
        onClick={async () => {
          const r = await shareInvite(profile.referralCode!);
          setSaid(r === 'copied' ? 'Copied. Paste it to a friend.' : r === 'shared' ? 'Sent.' : null);
        }}
      >
        {label}
      </button>
      {said && (
        <span className="hint invite-said" role="status">
          {said}
        </span>
      )}
    </>
  );
}

/** The whole offer in one block: headline, the rule in one line, the button, and what it has earned so far. */
export function InviteBlock({ headline = INVITE_OFFER, className = '' }: { headline?: string; className?: string }) {
  const { profile, auth } = useAccount();
  const progress = useInviteProgress();
  if (!auth.session || !profile?.referralCode) return null;
  return (
    <div className={`invite-block ${className}`}>
      <p className="invite-headline">{headline}</p>
      <p className="hint invite-rule">{INVITE_RULE}</p>
      <div className="invite-actions">
        <InviteButton />
      </div>
      {progressLine(progress) && <p className="invite-progress">{progressLine(progress)}</p>}
    </div>
  );
}
