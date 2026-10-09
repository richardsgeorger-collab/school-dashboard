import { useAccount } from '../../auth/AccountContext';
import { dateOf, fmtDate } from '../../domain/dates';
import { useStore } from '../../storage/store';
import { announcementCatches } from './story';

/**
 * Days 2 to 5 of the free week (George, 2026-10-09: 13 of 23 trials went quiet by day 2): what Halo+ caught, real
 * things only, with up to three of them, once, dismissable. No countdown, no guilt; the date the week ends is a fact.
 */
export function CaughtCard() {
  const { profile, tier } = useAccount();
  const { data, actions } = useStore();
  const start = profile?.trialStartedAt;
  const end = profile?.trialEndsAt;
  if (!start || !end || tier !== 'max' || data.settings.caughtCardSeen) return null;
  const now = Date.now();
  const t0 = Date.parse(start);
  if (now < t0 + 2 * 86_400_000 || now > Date.parse(end)) return null;
  const caught = announcementCatches(data.items, data.courses, start, new Date(now).toISOString());
  if (caught.n === 0) return null;
  return (
    <section className="caught-card" aria-label="What Halo+ caught">
      <p className="caught-title">
        Halo+ caught <b>{caught.n}</b> {caught.n === 1 ? 'thing your professors only put in an announcement' : 'things your professors only put in announcements'}.
      </p>
      <ul className="caught-list">
        {caught.examples.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="caught-foot">
        <span>That's Max reading the announcements for you. Your free week ends {fmtDate(dateOf(end, data.settings.timezone))}.</span>
        <button type="button" className="hero-inline" onClick={() => actions.updateSettings({ caughtCardSeen: new Date().toISOString() })}>
          Got it
        </button>
      </p>
    </section>
  );
}
