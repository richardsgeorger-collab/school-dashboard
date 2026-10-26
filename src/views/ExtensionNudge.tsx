import { useEffect } from 'react';
import { bump } from '../analytics/usage';
import { useAccount } from '../auth/AccountContext';
import { installedVersion, useExtension } from '../config/extension';
import { trialState } from '../config/flags';
import { extConnected } from '../onboarding/extSetup';
import { useNeverSynced } from '../onboarding/Setup';
import { useStore } from '../storage/store';
import { isTouchDevice } from '../ui/device';

/** At most this many showings, at least this many days apart (George, 2026-10-25: "once or twice", "not a popup"). */
export const NUDGE_MAX = 2;
export const NUDGE_GAP_DAYS = 2;

/** Whether today's Now gets the card: during the trial, on a computer that could have the extension, not yet installed. */
export function nudgeDue(shown: string[], today: string): boolean {
  if (shown.includes(today)) return true;
  if (shown.length >= NUDGE_MAX) return false;
  const last = shown[shown.length - 1];
  return !last || (Date.parse(today) - Date.parse(last)) / 86_400_000 >= NUDGE_GAP_DAYS;
}

/**
 * A card on Now, never a pop-up: students with the extension are the ones who stay (Admin, still opening a week later).
 * Twice at most, two days apart, during the trial only, on desktop Chrome, Edge or Brave without it.
 */
export function ExtensionNudge() {
  const { data, today, actions } = useStore();
  const { profile, planKnown } = useAccount();
  const ext = useExtension();
  const never = useNeverSynced();
  const shown = data.settings.extNudge?.shown ?? [];
  const closed = data.settings.extNudge?.closed ?? [];
  const onTrial = planKnown && trialState(profile) === 'active';
  const eligible = onTrial && !never && !!ext.url && !!ext.browser && !isTouchDevice() && !extConnected(data.settings, installedVersion());
  const show = eligible && nudgeDue(shown, today) && !closed.includes(today);
  useEffect(() => {
    if (!show || shown.includes(today)) return;
    actions.updateSettings({ extNudge: { shown: [...shown, today], closed } });
    bump('ext-nudge:shown');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, today]);
  if (!show) return null;
  const close = () => {
    bump('ext-nudge:close');
    actions.updateSettings({ extNudge: { shown, closed: [...closed, today] } });
  };
  return (
    <section className="card ext-nudge" aria-label="The Halo+ extension">
      <div>
        <p className="ext-nudge-title">Halo+ right on Halo</p>
        <p className="hint">The free {ext.browser} extension puts This week on Halo's home page and keeps your due dates current whenever you're on Halo. About a minute.</p>
      </div>
      <div className="ext-nudge-actions">
        <a className="btn small" href="#/now?ext=1" onClick={() => bump('ext-nudge:open')}>
          Add it to {ext.browser}
        </a>
        <button type="button" className="hero-inline" onClick={close}>
          Not now
        </button>
      </div>
    </section>
  );
}
