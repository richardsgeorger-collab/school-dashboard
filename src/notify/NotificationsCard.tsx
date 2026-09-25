import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { SegmentedControl } from '../components/SegmentedControl';
import { Locked } from '../config/Locked';
import type { ReminderPrefs } from '../domain/types';
import { useStore } from '../storage/store';
import { DEFAULT_PREFS } from './plan';
import { disablePush, enablePush, isIos, isStandalone, pushEnabled, pushSupported, showTest } from './push';

interface BeforeInstall extends Event {
  prompt: () => Promise<void>;
}

const MORNING = [
  { value: '07:00', label: '7:00' },
  { value: '07:30', label: '7:30' },
  { value: '08:00', label: '8:00' },
  { value: 'off', label: 'No note' },
] as const;

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Push on or off, what to send, when to stay quiet, and how to put the app on the Home Screen. */
export function NotificationsCard() {
  const { data, actions } = useStore();
  const { auth, tier } = useAccount();
  const prefs = { ...DEFAULT_PREFS, ...(data.settings.reminders ?? {}) };
  const set = (patch: Partial<ReminderPrefs>) => actions.updateSettings({ reminders: { ...(data.settings.reminders ?? {}), ...patch } });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [install, setInstall] = useState<BeforeInstall | null>(null);
  useEffect(() => {
    void pushEnabled().then(setEnabled);
    const h = (e: Event) => {
      e.preventDefault();
      setInstall(e as BeforeInstall);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const turnOn = async () => {
    const r = await enablePush();
    if (!r.ok) return setNote(r.error);
    setEnabled(true);
    set({ pushEnabled: true });
    setNote('On. A sample note is on its way.');
    await showTest().catch(() => undefined);
  };
  const turnOff = async () => {
    await disablePush();
    setEnabled(false);
    set({ pushEnabled: false });
    setNote('Off.');
  };

  return (
    <>
      <Locked feature="reminders" tier={tier} compact>
        {!auth.configured ? (
          <p className="hint">Notifications need an account. This build has none.</p>
        ) : !auth.session ? (
          <p className="hint">Sign in above to turn notifications on.</p>
        ) : (
          <>
            <p className="hint">
              {enabled === null ? 'Checking…' : enabled ? 'Notifications are on for this device.' : pushSupported() ? 'Notifications are off on this device.' : isIos() && !isStandalone() ? 'On iPhone, add the app to your Home Screen first, then turn notifications on from there.' : 'This browser cannot receive notifications.'}
            </p>
            <div className="settings-actions">
              {enabled ? (
                <>
                  <button type="button" className="btn small" onClick={() => void turnOff()}>
                    Turn off
                  </button>
                  <button type="button" className="btn small" onClick={() => void showTest()}>
                    Send a sample
                  </button>
                </>
              ) : (
                <button type="button" className="btn small primary" onClick={() => void turnOn()}>
                  Turn on notifications
                </button>
              )}
            </div>
            {note && (
              <p className="hint" role="status">
                {note}
              </p>
            )}
          </>
        )}
        <Toggle checked={prefs.morning !== false} label="A morning note with the day" onChange={(v) => set({ morning: v })} />
        <div className="field">
          <span>When</span>
          <SegmentedControl label="Morning note time" value={(prefs.morningTime ?? '07:30') as (typeof MORNING)[number]['value']} options={[...MORNING]} onChange={(v) => set({ morningTime: v, morning: v !== 'off' })} />
        </div>
        <Toggle checked={prefs.heavyDay !== false} label="A heads-up the night before a heavy day" onChange={(v) => set({ heavyDay: v })} />
        <Toggle checked={prefs.notStarted !== false} label="A nudge when big work is still untouched two days out" onChange={(v) => set({ notStarted: v })} />
        <Toggle checked={prefs.resync !== false} label="A reminder when Halo has not been synced for three days" onChange={(v) => set({ resync: v })} />
        <div className="field-row">
          <label className="field">
            <span>Quiet from</span>
            <input type="time" value={prefs.quietFrom} onChange={(e) => set({ quietFrom: e.target.value })} />
          </label>
          <label className="field">
            <span>Quiet until</span>
            <input type="time" value={prefs.quietTo} onChange={(e) => set({ quietTo: e.target.value })} />
          </label>
        </div>
        <p className="hint">Nothing arrives during quiet hours; it waits until they end. Email is not wired yet; when it is, it will be a switch here.</p>
      </Locked>
      {!isStandalone() && (
        <div className="install-card">
          <p className="section-title">Put it on your Home Screen</p>
          {install ? (
            <button type="button" className="btn small primary" onClick={() => void install.prompt()}>
              Install the app
            </button>
          ) : isIos() ? (
            <p className="hint">In Safari: Share, then Add to Home Screen. It opens full screen and can send notifications.</p>
          ) : (
            <p className="hint">In Chrome: the menu, then Install app. It opens in its own window and can send notifications.</p>
          )}
        </div>
      )}
    </>
  );
}
