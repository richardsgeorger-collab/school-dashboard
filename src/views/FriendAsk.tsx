import { useAccount } from '../auth/AccountContext';
import { friendGift } from '../config/flags';
import { useStore } from '../storage/store';

const DAY = 86_400_000;

/**
 * For a friend-link student, once, after their third day: one gentle question, straight to the feedback form. Either
 * button ends it for good.
 */
export function FriendAsk() {
  const { profile } = useAccount();
  const { data, actions } = useStore();
  const gift = friendGift(profile);
  const joined = profile?.friendJoinedAt ? Date.parse(profile.friendJoinedAt) : NaN;
  if (!gift || !Number.isFinite(joined) || Date.now() - joined < 3 * DAY || data.settings.friendAskedAt) return null;
  const done = () => actions.updateSettings({ friendAskedAt: new Date().toISOString() });
  return (
    <section className="card friend-ask" aria-label={`A question from ${gift.from}`}>
      <p className="trial-lead">What's confusing or broken?</p>
      <p className="hint">You've had Halo+ for a few days. {gift.from} reads every note, and one line helps.</p>
      <div className="settings-actions">
        <a className="btn small primary" href="#/you?s=feedback" onClick={done}>
          Tell {gift.from}
        </a>
        <button type="button" className="btn small" onClick={done}>
          Not now
        </button>
      </div>
    </section>
  );
}
