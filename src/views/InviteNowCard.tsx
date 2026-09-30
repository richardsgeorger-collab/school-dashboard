import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { IconGift } from '../components/Icons';
import { REFERRAL } from '../config/tiers';
import { INVITE_RULE, InviteButton, progressLine, shareInvite, useInviteProgress } from '../referral/Invite';
import { useStore } from '../storage/store';

const DAY = 86_400_000;

/** From day 3 of using Halo+: one small card, dismissible, back at most once a week (George, 2026-09-29). */
function useInviteCardShown(): boolean {
  const { data } = useStore();
  const { auth, profile } = useAccount();
  const started = profile?.trialStartedAt ?? data.settings.onboarding?.startedAt ?? null;
  const since = started ? Date.now() - new Date(started).getTime() : 0;
  const put = data.settings.inviteCardAt ? Date.now() - new Date(data.settings.inviteCardAt).getTime() : Infinity;
  return !!auth.session && !!profile?.referralCode && !profile.friendFrom && since >= 3 * DAY && put >= 7 * DAY && data.courses.length > 0;
}

export function InviteNowCard() {
  const { actions } = useStore();
  const progress = useInviteProgress();
  if (!useInviteCardShown()) return null;
  return (
    <section className="card invite-now" aria-label="Invite a friend">
      <button type="button" className="welcome-x" aria-label="Put this away for a week" onClick={() => actions.updateSettings({ inviteCardAt: new Date().toISOString() })}>
        ×
      </button>
      <p className="trial-lead">Know someone in your classes? You both get Plus free for 30 days.</p>
      <p className="hint">{INVITE_RULE}</p>
      <div className="settings-actions">
        <InviteButton label="Invite a friend" small />
      </div>
      {progressLine(progress) && <p className="invite-progress">{progressLine(progress)}</p>}
    </section>
  );
}

/**
 * The quiet reminder at the foot of Now (George, 2026-09-30): one muted line with a small gold icon, no card. One tap
 * opens the share sheet (a computer copies the message and link). Not in anyone's first day, not while the invite
 * card is up (never both), and put away for two weeks at a time.
 */
export function InviteLine() {
  const { data, actions } = useStore();
  const { auth, profile } = useAccount();
  const card = useInviteCardShown();
  const [said, setSaid] = useState<string | null>(null);
  const started = profile?.trialStartedAt ?? data.settings.onboarding?.startedAt ?? null;
  const since = started ? Date.now() - new Date(started).getTime() : 0;
  const put = data.settings.inviteLineAt ? Date.now() - new Date(data.settings.inviteLineAt).getTime() : Infinity;
  if (!auth.session || !profile?.referralCode || card || since < DAY || put < 14 * DAY) return null;
  const code = profile.referralCode;
  return (
    <p className="invite-line">
      <button
        type="button"
        className="invite-line-go"
        onClick={async () => {
          const r = await shareInvite(code);
          setSaid(r === 'copied' ? 'Copied. Paste it to a friend.' : r === 'shared' ? 'Sent.' : null);
        }}
      >
        <span className="invite-line-icon">
          <IconGift size={16} />
        </span>
        <span>{said ?? `Invite a friend, you both get ${REFERRAL.days} days of Plus free`}</span>
      </button>
      <button type="button" className="invite-line-x" aria-label="Hide for two weeks" onClick={() => actions.updateSettings({ inviteLineAt: new Date().toISOString() })}>
        ×
      </button>
    </p>
  );
}
