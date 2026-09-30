import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { useMorningNote } from '../onboarding/ComeBack';
import { useStore } from '../storage/store';

/** A student who said "Not now" to the morning note is asked once more, a day later, here; then never again. */
export function NotifyReask() {
  const { data } = useStore();
  const { auth } = useAccount();
  const { turnOn, decline } = useMorningNote();
  const [why, setWhy] = useState<string | null>(null);
  const ask = data.settings.notifyAsk;
  const due = !!ask?.declinedAt && ask.asks < 2 && Date.now() - new Date(ask.declinedAt).getTime() >= 20 * 3_600_000;
  if (!auth.session || !due || data.settings.reminders?.pushEnabled) return null;
  return (
    <section className="card notify-reask" aria-label="A morning note">
      <p className="trial-lead">Want a morning note with what to do today?</p>
      <div className="settings-actions">
        <button type="button" className="btn small primary" onClick={async () => { const r = await turnOn(); if (!r.ok) setWhy(r.why ?? 'That did not work.'); }}>
          Yes, every morning
        </button>
        <button type="button" className="btn small" onClick={decline}>
          No thanks
        </button>
      </div>
      {why && <p className="hint" role="alert">{why}</p>}
    </section>
  );
}
