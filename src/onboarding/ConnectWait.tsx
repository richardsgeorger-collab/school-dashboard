import { useEffect, useRef, useState } from 'react';
import { installedVersion } from '../config/extension';
import { IconCheck } from '../components/Icons';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { askExtensionToReload, askExtensionToSync, syncPercent } from '../halo/extSync';
import { track } from './track';

const LATE_MS = 60_000;
const SLOW_MS = 180_000;

type Fail = { kind: string; why: string | null; retried?: boolean };

/**
 * After "Add to Chrome" (George, 2026-10-13): no more "now open Halo and log in". The page waits for the extension to
 * say hello (since 0.5.2 it adds itself to an open Halo+ tab the moment it is installed), asks it for the first sync,
 * and shows a live bar while the extension reads Halo in a quiet background tab. The classes landing hands over to the
 * payoff (Onboarding watches for them). Only when Halo turns out to be logged out does it ask for anything: log in,
 * and the sync runs again when the student comes back to this tab (and, from 0.7.5, by itself when Halo opens).
 */
export function ConnectWait({ browser, onBookmark, onPaste }: { browser: string; onBookmark: () => void; onPaste: () => void }) {
  const [version, setVersion] = useState<string | null>(installedVersion);
  const [late, setLate] = useState(false);
  const [run, setRun] = useState(0);
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState<string | null>(null);
  const [fail, setFail] = useState<Fail | null>(null);
  // Reload Halo instead of a plain Try again (George, 2026-10-21).
  const [reload, setReload] = useState(false);
  const found = useRef(false);
  const best = useRef(0);

  // 1. The extension, installed a moment ago in the store's tab.
  useEffect(() => {
    if (version) return;
    const start = Date.now();
    const iv = window.setInterval(() => {
      const v = installedVersion();
      if (v) setVersion(v);
      else if (Date.now() - start > LATE_MS) setLate(true);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [version]);

  // 2. The first sync, asked for once it is here (and again on Try again, or back from logging in to Halo).
  useEffect(() => {
    if (!version) return;
    if (!found.current) {
      found.current = true;
      track('connect:ext-found', 'complete');
    }
    setFail(null);
    setText(null);
    best.current = 0;
    setT0(Date.now());
    if (reload) {
      setReload(false);
      track('connect:reload', 'complete');
      return askExtensionToReload(() => track('connect:halo', 'complete'), { setup: true });
    }
    return askExtensionToSync(() => track('connect:halo', 'complete'), { setup: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, run]);

  // What the extension says on the way, and how it ended.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { kind?: string; text?: string; ok?: boolean; errorKind?: string | null; why?: string | null; retried?: boolean } | null;
      if (d?.kind === 'halo-ext-progress' && d.text) setText(d.text);
      if (d?.kind === 'halo-ext-sync-result' && d.ok === false) setFail({ kind: d.errorKind ?? 'error', why: d.why ?? null, retried: !!d.retried });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Back on this tab after logging in to Halo: try again by itself.
  useEffect(() => {
    if (!fail) return;
    const back = () => {
      if (document.visibilityState === 'visible') setRun((r) => r + 1);
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [fail]);

  useEffect(() => {
    if (!t0 || fail) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [t0, fail]);

  if (!version)
    return (
      <section className="onboard-step" aria-label="Waiting for the extension" aria-live="polite">
        <h1 className="onboard-title">Press Add to {browser}, then Add extension.</h1>
        <p className="onboard-text">This page moves on by itself as soon as it's added. Then Halo+ brings in your classes.</p>
        <span className="ext-wait" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {late && (
          <p className="hint">
            <b>Added it already?</b> Reload this page and it shows up.{' '}
            <button type="button" className="hero-inline" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        )}
        <p className="hint">
          <button type="button" className="hero-inline" onClick={onBookmark}>
            Use the {BOOKMARK_NAME} bookmark instead
          </button>
        </p>
      </section>
    );

  if (fail?.kind === 'logged-out')
    return (
      <section className="onboard-step" aria-label="Log in to Halo" aria-live="polite">
        <span className="ext-check" aria-hidden>
          <IconCheck />
        </span>
        <h1 className="onboard-title">Log in to Halo, then we'll sync automatically.</h1>
        <p className="onboard-text">The extension is ready, but Halo isn't logged in on this computer. Log in once, and your classes come in by themselves.</p>
        <a
          className="btn primary block onboard-big"
          href="https://halo.gcu.edu/"
          target="_blank"
          rel="noopener"
          onClick={() => track('connect:halo', 'complete')}
        >
          Log in to Halo ↗
        </a>
        <p className="hint">
          Logged in already?{' '}
          <button type="button" className="hero-inline" onClick={() => setRun((r) => r + 1)}>
            Try again
          </button>
        </p>
      </section>
    );

  if (fail)
    return (
      <section className="onboard-step" aria-label="The sync didn't finish" aria-live="polite">
        <h1 className="onboard-title">Sync didn't finish. Try reloading Halo.</h1>
        <p className="onboard-text">{fail.retried ? 'Halo+ already tried once more on its own. ' : ''}Reloading Halo fixes this most of the time.</p>
        <button
          type="button"
          className="btn primary block onboard-big"
          onClick={() => {
            setReload(true);
            setRun((r) => r + 1);
          }}
        >
          Reload Halo
        </button>
        <p className="hint">
          <button type="button" className="hero-inline" onClick={() => setRun((r) => r + 1)}>
            Try again
          </button>
          {' · '}
          <button type="button" className="hero-inline" onClick={onBookmark}>
            Use the {BOOKMARK_NAME} bookmark instead
          </button>
          {' · '}
          <button type="button" className="hero-inline" onClick={onPaste}>
            Paste a sync
          </button>
        </p>
      </section>
    );

  const elapsed = t0 ? now - t0 : 0;
  best.current = Math.max(best.current, syncPercent(elapsed, text));
  const pct = best.current;
  const label = text ? text.replace(/…$|\.\.\.$/, '') : elapsed < 3000 ? 'Opening Halo in the background' : 'Reading your classes from Halo';
  return (
    <section className="onboard-step connect-progress" aria-label="Bringing in your classes" aria-live="polite">
      <span className="ext-check" aria-hidden>
        <IconCheck />
      </span>
      <h1 className="onboard-title">Bringing in your classes…</h1>
      <div className="sync-bar" role="progressbar" aria-label="First sync" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="sync-bar-label">
        <span>{label}…</span>
        <span className="mono">{pct}%</span>
      </p>
      <p className="hint">Nothing to click. Halo+ reads Halo in a quiet background tab, usually in under a minute.</p>
      {elapsed > SLOW_MS && (
        <p className="hint" role="status">
          <b>Taking a while?</b>{' '}
          <button type="button" className="hero-inline" onClick={() => setRun((r) => r + 1)}>
            Try again
          </button>
          {' · '}
          <button type="button" className="hero-inline" onClick={onPaste}>
            Paste a sync
          </button>
        </p>
      )}
    </section>
  );
}
