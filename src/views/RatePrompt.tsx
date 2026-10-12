import { useAccount } from '../auth/AccountContext';
import { EXTENSION_URL, installedVersion } from '../config/extension';
import { isDemo } from '../demo/demo';
import { useAccountChecked, useStore } from '../storage/store';

const DAY = 86_400_000;

/** Who sees it (pure, tested): a paying or trial account, a week in, three syncs in, the extension here, never answered. */
export function shouldAskForRating(f: { tier: string; createdAt: string | null; syncCount: number; answered: boolean; extension: boolean; demo: boolean; now: number }): boolean {
  if (f.demo || f.answered || !f.extension || f.tier === 'free') return false;
  if (!f.createdAt || f.now - Date.parse(f.createdAt) < 7 * DAY) return false;
  return f.syncCount >= 3;
}

/**
 * "Enjoying Halo+? A quick rating on the Chrome Web Store helps other GCU students find it." (George, 2026-10-12).
 * Once, for someone who has used Halo+ a week and synced three times; Rate opens the reviews page, Not now ends it.
 */
export function RatePrompt() {
  const { data, actions } = useStore();
  const { auth, tier } = useAccount();
  const checked = useAccountChecked();
  const show =
    checked &&
    shouldAskForRating({ tier, createdAt: auth.session?.user.created_at ?? null, syncCount: data.settings.syncCount ?? 0, answered: !!data.settings.ratePromptAt, extension: !!installedVersion(), demo: isDemo(), now: Date.now() });
  if (!show || !EXTENSION_URL) return null;
  const done = () => actions.updateSettings({ ratePromptAt: new Date().toISOString() });
  return (
    <section className="rate-prompt" aria-label="Rate Halo+">
      <p>
        <b>Enjoying Halo+?</b> A quick rating on the Chrome Web Store helps other GCU students find it.
      </p>
      <span className="rate-prompt-actions">
        <a
          className="btn small primary"
          href={`${EXTENSION_URL}/reviews`}
          target="_blank"
          rel="noreferrer"
          onClick={done}
        >
          Rate
        </a>
        <button type="button" className="btn small" onClick={done}>
          Not now
        </button>
      </span>
    </section>
  );
}
