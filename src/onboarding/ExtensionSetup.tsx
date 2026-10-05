import { useEffect, useRef, useState } from 'react';
import { HaloDraw } from '../components/HaloDraw';
import { IconCheck } from '../components/Icons';
import { useExtension, installedVersion } from '../config/extension';
import { useCan } from '../config/useCan';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { useStore } from '../storage/store';
import type { ExtSetupKind } from './extSetup';
import { track } from './track';

const STEPS = 5;
const WAIT_MS = 60_000;

/**
 * Setting up the Chrome extension (George, 2026-10-04): why, install, pin it, log into Halo once, done. Shown once
 * after sign-up and once to everyone already here (desktop Chrome, Edge, Brave), in the onboarding's own look. Free
 * gets the why with a plain note that syncing is part of Plus. Safari and Firefox get one screen: it needs Chrome, and
 * the bookmark keeps working. The last step waits for the extension to say hello from this page, then asks it for the
 * first sync.
 */
export function ExtensionSetup({ kind, onClose }: { kind: ExtSetupKind; onClose: (how: 'done' | 'skipped') => void }) {
  const ext = useExtension();
  const syncs = useCan('haloAutoSync');
  const [i, setI] = useState(0);
  const b = ext.browser ?? 'Chrome';
  useEffect(() => track(`ext-setup-${kind}-${syncs ? i + 1 : 'free'}`, 'enter'), [kind, i, syncs]);
  const skip = () => onClose('skipped');
  const next = () => (i + 1 < STEPS ? setI(i + 1) : onClose('done'));

  if (kind === 'needs-chrome')
    return (
      <Shell label="Auto-sync needs Chrome" count={null} onSkip={null}>
        <section className="onboard-step ext-setup">
          <p className="eyebrow">Auto-sync</p>
          <h1 className="onboard-title">Auto-sync needs Chrome.</h1>
          <p className="onboard-text">The Halo+ extension that syncs Halo every 3 hours runs in Chrome, Edge or Brave on a computer. In this browser, the {BOOKMARK_NAME} bookmark keeps working: click it on Halo whenever you want fresh data.</p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={() => onClose('done')}>
              Got it
            </button>
          </div>
        </section>
      </Shell>
    );

  if (!syncs)
    return (
      <Shell label="Halo+ for Chrome" count={null} onSkip={skip}>
        <section className="onboard-step ext-setup">
          <p className="eyebrow">The Halo+ extension</p>
          <h1 className="onboard-title">Halo+ syncs on its own every 3 hours. No clicking.</h1>
          <p className="ext-note">Syncing Halo, on its own or by hand, is part of Plus. Free keeps your syllabus classes and what you add yourself.</p>
          <div className="onboard-actions">
            <a className="btn primary" href="#/you?s=plan&to=plus" onClick={() => onClose('skipped')}>
              See plans
            </a>
            <button type="button" className="btn" onClick={skip}>
              Skip for now
            </button>
          </div>
        </section>
      </Shell>
    );

  return (
    <Shell label="Set up auto-sync" count={i} onSkip={i === 4 ? null : skip}>
      {i === 0 && (
        <section className="onboard-step ext-setup">
          <HaloDraw size={64} />
          <p className="eyebrow">Auto-sync</p>
          <h1 className="onboard-title">Halo+ syncs on its own every 3 hours. No clicking.</h1>
          <p className="onboard-text">Add the Halo+ extension to {b} and your classes, due dates, grades and announcements stay current while {b} is open, even with Halo+ closed. About a minute to set up.</p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={next}>
              Set it up
            </button>
            <button type="button" className="btn" onClick={skip}>
              Skip for now
            </button>
          </div>
        </section>
      )}
      {i === 1 && (
        <section className="onboard-step ext-setup">
          <p className="eyebrow">Step 1 · Install</p>
          <h1 className="onboard-title">Add Halo+ to {b}.</h1>
          <InstallDemo browser={b} />
          <div className="onboard-actions">
            <a className="btn primary ext-big" href={ext.url ?? '#'} target="_blank" rel="noopener" onClick={() => track('ext-setup-store', 'complete')}>
              Add to {b}
            </a>
            <button type="button" className="btn" onClick={next}>
              I've added it
            </button>
          </div>
          <p className="hint">It opens the Chrome Web Store in a new tab. Press Add to {b}, then Add extension, and come back here. It never sees your GCU password.</p>
        </section>
      )}
      {i === 2 && (
        <section className="onboard-step ext-setup">
          <p className="eyebrow">Step 2 · Pin it</p>
          <h1 className="onboard-title">Pin it where you can see it.</h1>
          <PinDemo />
          <p className="onboard-text">Click the puzzle piece next to the address bar, then the pin beside Halo+. Its icon shows when it last synced, and its Sync now gets fresh data right away.</p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={next}>
              Next
            </button>
          </div>
        </section>
      )}
      {i === 3 && (
        <section className="onboard-step ext-setup">
          <p className="eyebrow">Step 3 · Halo</p>
          <h1 className="onboard-title">Log into Halo once.</h1>
          <p className="onboard-text">The extension syncs in a quiet background tab while you're logged in to Halo; nothing takes over your screen. If Halo logs you out, Halo+ says "Auto-sync paused: log in to Halo" until you do.</p>
          <div className="onboard-actions">
            <a className="btn" href="https://halo.gcu.edu/" target="_blank" rel="noopener">
              Open Halo ↗
            </a>
            <button type="button" className="btn primary" onClick={next}>
              I'm logged in
            </button>
          </div>
          <p className="hint">The {BOOKMARK_NAME} bookmark still works as a backup.</p>
        </section>
      )}
      {i === 4 && <Connect browser={b} onDone={() => onClose('done')} />}
    </Shell>
  );
}

function Shell({ label, count, onSkip, children }: { label: string; count: number | null; onSkip: (() => void) | null; children: React.ReactNode }) {
  return (
    <div className="onboard upgrade ext-setup-sheet" role="dialog" aria-modal="true" aria-label={label}>
      <div className="onboard-inner">
        <header className="onboard-head">
          {count !== null ? (
            <>
              <span className="onboard-count">
                {count + 1} of {STEPS}
              </span>
              <span className="onboard-progress" aria-hidden>
                {Array.from({ length: STEPS }, (_, k) => (
                  <i key={k} data-done={k < count} data-current={k === count} />
                ))}
              </span>
            </>
          ) : (
            <span />
          )}
          {onSkip && (
            <button type="button" className="diff-toggle" onClick={onSkip}>
              Skip for now
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * Step 4: waits for the extension to show up on this page (its Halo+ script writes its version here), then asks it
 * for the first sync. A sync that lands from it says so; nothing after a minute offers a reload and the help page.
 */
function Connect({ browser, onDone }: { browser: string; onDone: () => void }) {
  const { data } = useStore();
  const [version, setVersion] = useState<string | null>(installedVersion);
  const [late, setLate] = useState(false);
  const asked = useRef(false);
  const since = useRef(new Date().toISOString());
  const landed = data.settings.lastPull?.via === 'extension' && Date.parse(data.settings.lastPull?.at ?? '') > Date.parse(since.current) - 120_000;
  useEffect(() => {
    if (version) return;
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const v = installedVersion();
      if (v) setVersion(v);
      else if (Date.now() - t0 > WAIT_MS) setLate(true);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [version]);
  useEffect(() => {
    if (!version || asked.current) return;
    asked.current = true;
    track('ext-setup-connected', 'complete');
    // The first sync now, not in an hour (an extension from before 0.5.2 starts its own within a minute).
    window.postMessage({ kind: 'halo-ext-first-sync' }, location.origin);
  }, [version]);
  if (version)
    return (
      <section className="onboard-step ext-setup" aria-live="polite">
        <span className="ext-check" aria-hidden>
          <IconCheck />
        </span>
        <p className="eyebrow">Connected</p>
        <h1 className="onboard-title">{landed ? 'First sync done.' : 'First sync running.'}</h1>
        <p className="onboard-text">
          {landed ? 'Halo+ is up to date, and it syncs on its own every 3 hours from now on.' : `The Halo+ extension (${version}) is reading Halo in a background tab. It lands here on its own, then every 3 hours while ${browser} is open.`} Want fresh data right away? Press Sync now in the extension.
        </p>
        <div className="onboard-actions">
          <button type="button" className="btn primary" onClick={onDone}>
            Done
          </button>
        </div>
      </section>
    );
  return (
    <section className="onboard-step ext-setup" aria-live="polite">
      <p className="eyebrow">Step 4 · Connect</p>
      <h1 className="onboard-title">Looking for the extension…</h1>
      <p className="onboard-text">Once it's added, it says hello from this page in a few seconds and starts the first sync.</p>
      <span className="ext-wait" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {late && (
        <div className="ext-late" role="status">
          <p>
            <b>Not seeing it?</b> Reload this page; an extension added while a page is open only shows up after a reload.
          </p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              Reload this page
            </button>
            <a className="btn" href="#/you?s=halo" onClick={onDone}>
              Sync help
            </a>
            <button type="button" className="btn quiet" onClick={onDone}>
              Finish later
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The Web Store's "Add to Chrome", then Chrome's "Add extension": a short loop, still under reduced motion. */
function InstallDemo({ browser }: { browser: string }) {
  return (
    <div className="ext-demo ext-demo-install" aria-hidden>
      <div className="ext-win">
        <div className="ext-bar">
          <i />
          <i />
          <i />
          <span className="ext-url">chromewebstore.google.com</span>
        </div>
        <div className="ext-page">
          <span className="ext-app">
            <HaloDraw size={26} />
            <b>Halo+</b>
          </span>
          <span className="ext-store-btn">Add to {browser}</span>
        </div>
        <div className="ext-dialog">
          <b>Add "Halo+"?</b>
          <span className="ext-dialog-btns">
            <span className="ext-ghost">Cancel</span>
            <span className="ext-add">Add extension</span>
          </span>
        </div>
        <span className="ext-cursor" />
      </div>
    </div>
  );
}

/** The puzzle piece, then the pin beside Halo+, then its icon in the toolbar. */
function PinDemo() {
  return (
    <div className="ext-demo ext-demo-pin" aria-hidden>
      <div className="ext-win">
        <div className="ext-bar">
          <span className="ext-url ext-url-wide">halo.gcu.edu</span>
          <span className="ext-pinned">
            <HaloDraw size={16} />
          </span>
          <span className="ext-puzzle">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M9 4h3a2 2 0 1 1 4 0h2v5a2 2 0 1 1 0 4v5h-5a2 2 0 1 0-4 0H4v-5a2 2 0 1 0 0-4V4h5Z" />
            </svg>
          </span>
        </div>
        <div className="ext-menu">
          <span className="ext-menu-title">Extensions</span>
          <span className="ext-menu-row">
            <HaloDraw size={16} />
            <b>Halo+</b>
            <span className="ext-pin">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4 1-3Z" />
              </svg>
            </span>
          </span>
        </div>
        <span className="ext-cursor" />
      </div>
    </div>
  );
}
