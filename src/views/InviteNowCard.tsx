import { useAccount } from '../auth/AccountContext';
import { INVITE_RULE, InviteButton, progressLine, useInviteProgress } from '../referral/Invite';
import { useStore } from '../storage/store';

const DAY = 86_400_000;

/** From day 3 of using Halo+: one small card, dismissible, back at most once a week (George, 2026-09-29). */
export function InviteNowCard() {
  const { data, actions } = useStore();
  const { auth, profile } = useAccount();
  const progress = useInviteProgress();
  const started = profile?.trialStartedAt ?? data.settings.onboarding?.startedAt ?? null;
  const since = started ? Date.now() - new Date(started).getTime() : 0;
  const put = data.settings.inviteCardAt ? Date.now() - new Date(data.settings.inviteCardAt).getTime() : Infinity;
  if (!auth.session || !profile?.referralCode || profile.friendFrom || since < 3 * DAY || put < 7 * DAY || data.courses.length === 0) return null;
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
