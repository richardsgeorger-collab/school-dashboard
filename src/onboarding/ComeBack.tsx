import { useState } from 'react';
import { enablePush, isIos, isStandalone } from '../notify/push';
import { morningBody } from '../notify/plan';
import { useStore } from '../storage/store';
import { isAndroid, isChromeIOS } from '../ui/device';

/**
 * Getting them to come back (George, 2026-09-29): right after the first sync, one question, "Want a morning note
 * with what to do today?", and on a phone, adding Halo+ to the Home Screen with a picture for their browser. An
 * iPhone or iPad can only get notifications from the Home Screen app, so there the Home Screen comes first.
 */
export const needsHomeScreenFirst = (): boolean => isIos() && !isStandalone();
export const isPhoneLike = (): boolean => typeof window !== 'undefined' && (isIos() || isAndroid() || !!window.matchMedia?.('(pointer: coarse)').matches);

export function useMorningNote() {
  const { data, actions } = useStore();
  const turnOn = async (): Promise<{ ok: boolean; why?: string }> => {
    const r = await enablePush();
    if (!r.ok) return { ok: false, why: r.error };
    actions.updateSettings({ reminders: { ...(data.settings.reminders ?? {}), pushEnabled: true, morning: true }, notifyAsk: { declinedAt: null, asks: (data.settings.notifyAsk?.asks ?? 0) + 1 } });
    return { ok: true };
  };
  const decline = () => actions.updateSettings({ notifyAsk: { declinedAt: new Date().toISOString(), asks: (data.settings.notifyAsk?.asks ?? 0) + 1 } });
  return { turnOn, decline };
}

export function NotifyAsk({ onNext }: { onNext: () => void }) {
  const { turnOn, decline } = useMorningNote();
  const { data, today } = useStore();
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const homeFirst = needsHomeScreenFirst();
  // The sample note is the student's own for today (sweep, 2026-09-30: a made-up "Chem Lab 3" read as their data).
  const sample = data.items.length === 0;
  const note = sample ? '2 due today. First: Chem Lab 3 (CHM-113, 50 pts).' : morningBody(data.items, data.courses, today, data.settings.timezone);
  return (
    <section className="onboard-step comeback" aria-label="A morning note">
      <div className="comeback-note" aria-hidden>
        <b>Halo+ · 7:30 AM{sample ? ' · example' : ''}</b>
        <span>{note}</span>
      </div>
      <h1 className="onboard-title">Want a morning note with what to do today?</h1>
      <p className="onboard-text">One short note each morning: what is due and what to start first. Change the time or turn it off any time in You.</p>
      {homeFirst ? (
        <>
          <p className="hint">On {navigator.userAgent.includes('iPad') || /Macintosh/.test(navigator.userAgent) ? 'an iPad' : 'an iPhone'}, notifications come from the Home Screen app, so that comes first. The next screen shows how; then turn the note on from there.</p>
          <button type="button" className="btn primary block onboard-big" onClick={onNext}>
            Show me how
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn primary block onboard-big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await turnOn();
            setBusy(false);
            if (r.ok) onNext();
            else setWhy(r.why ?? 'That did not work.');
          }}
        >
          {busy ? 'Turning it on…' : 'Yes, send me a morning note'}
        </button>
      )}
      {why && (
        <p className="hint" role="alert">
          {why}
        </p>
      )}
      <p className="hint">
        <button
          type="button"
          className="hero-inline"
          onClick={() => {
            decline();
            onNext();
          }}
        >
          Not now
        </button>
      </p>
    </section>
  );
}

type HomeBrowser = 'safari' | 'chrome-ios' | 'android';
const homeBrowser = (): HomeBrowser => (isChromeIOS() ? 'chrome-ios' : isIos() ? 'safari' : 'android');

/** The Home Screen steps, drawn, with the thing to tap circled like every other picture in setup. */
function HomePicture({ browser }: { browser: HomeBrowser }) {
  return (
    <figure className="tp" role="img" aria-label={browser === 'android' ? 'Chrome: the three dots, then Add to Home screen' : 'The Share button, then Add to Home Screen'}>
      <div className="tp-bar">
        <span className="tp-url">haloplus.app</span>
        <span className="tp-btn" data-hot="true" aria-hidden>
          {browser === 'android' ? '⋮' : '⬆︎'}
        </span>
      </div>
      <ul className="tp-sheet">
        {browser === 'android' ? (
          <>
            <li>New tab</li>
            <li>Bookmarks</li>
            <li data-hot="true">Add to Home screen</li>
          </>
        ) : (
          <>
            <li>Copy</li>
            <li>Add to Reading List</li>
            <li data-hot="true">Add to Home Screen</li>
          </>
        )}
      </ul>
    </figure>
  );
}

export function HomeScreenAsk({ onNext }: { onNext: () => void }) {
  const b = homeBrowser();
  return (
    <section className="onboard-step comeback" aria-label="Add Halo+ to your Home Screen">
      <h1 className="onboard-title">Add Halo+ to your Home Screen</h1>
      <ol className="phone-steps">
        {b === 'android' ? (
          <>
            <li>
              Tap <b>⋮</b> at the top right.
            </li>
            <li>
              Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Add</b>.
            </li>
          </>
        ) : (
          <>
            <li>
              Tap <b>Share</b> {b === 'chrome-ios' ? '(the square with an arrow, at the right of the address bar)' : '(the square with an arrow)'}.
            </li>
            <li>
              Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
          </>
        )}
      </ol>
      <HomePicture browser={b} />
      <p className="hint">{needsHomeScreenFirst() ? 'Then open Halo+ from your Home Screen and turn on the morning note in You, Notifications.' : 'It opens like an app, full screen, one tap from your Home Screen.'}</p>
      <button type="button" className="btn primary block onboard-big" onClick={onNext}>
        Done
      </button>
      <p className="hint">
        <button type="button" className="hero-inline" onClick={onNext}>
          Skip
        </button>
      </p>
    </section>
  );
}
