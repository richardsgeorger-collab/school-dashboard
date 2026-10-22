/**
 * Asks the Halo+ extension on this computer for a sync now. The page's Sync now (0.6.5+) is acknowledged with
 * halo-ext-sync-started; an older extension does not answer it, so after 1.5 s without that the first-sync message
 * (0.5.2+) goes instead. Returns a cleanup.
 */
export function askExtensionToSync(onStarted?: () => void, opts: { setup?: boolean } = {}): () => void {
  let acked = false;
  const onMsg = (e: MessageEvent) => {
    if (e.origin !== window.location.origin || (e.data as { kind?: string } | null)?.kind !== 'halo-ext-sync-started') return;
    acked = true;
    onStarted?.();
  };
  window.addEventListener('message', onMsg);
  window.postMessage({ kind: 'halo-ext-sync-now', setup: !!opts.setup }, window.location.origin);
  const t = window.setTimeout(() => {
    if (!acked) window.postMessage({ kind: 'halo-ext-first-sync' }, window.location.origin);
  }, 1500);
  return () => {
    window.clearTimeout(t);
    window.removeEventListener('message', onMsg);
  };
}

/**
 * "Reload Halo" (George, 2026-10-21): the extension (0.7.6+) reloads the student's Halo tabs and syncs again in a fresh
 * tab of its own. An older extension does not answer; then Halo opens in a new tab (a fresh page) and Sync now is asked
 * for, which an older extension runs in that tab.
 */
export function askExtensionToReload(onStarted?: () => void, opts: { setup?: boolean } = {}): () => void {
  let acked = false;
  const onMsg = (e: MessageEvent) => {
    if (e.origin !== window.location.origin || (e.data as { kind?: string } | null)?.kind !== 'halo-ext-sync-started') return;
    acked = true;
    onStarted?.();
  };
  window.addEventListener('message', onMsg);
  window.postMessage({ kind: 'halo-ext-reload-sync', setup: !!opts.setup }, window.location.origin);
  const t = window.setTimeout(() => {
    if (acked) return;
    window.open('https://halo.gcu.edu/', '_blank', 'noopener');
    window.setTimeout(() => window.postMessage({ kind: 'halo-ext-sync-now', setup: !!opts.setup }, window.location.origin), 4000);
  }, 1500);
  return () => {
    window.clearTimeout(t);
    window.removeEventListener('message', onMsg);
  };
}

/**
 * How far along a first sync is, 0 to 100, from what the extension last said (0.7.5 says each step: "Reading BIO-181
 * (2 of 6)…") and how long it has run. The time alone eases toward 90, so the bar always moves, even with an older
 * extension that says nothing; a step it reports can only push it further. Never 100: the payoff takes over then.
 */
export function syncPercent(elapsedMs: number, text: string | null): number {
  const byTime = 90 * (1 - Math.exp(-Math.max(0, elapsedMs) / 45_000));
  const t = text ?? '';
  const m = /\((\d+) of (\d+)\)/.exec(t);
  const k = m ? Math.min(1, Number(m[1]) / Math.max(1, Number(m[2]))) : 0;
  const byText = /rubric files/i.test(t)
    ? 85 + 5 * k
    : /rubrics/i.test(t)
      ? 75 + 10 * k
      : /^Reading .+\(\d+ of \d+\)/.test(t)
        ? 15 + 60 * k
        : /alerts, messages and classes/i.test(t)
          ? 15
          : /login/i.test(t)
            ? 8
            : /Finishing|^Read \d+|Sending|Saving/i.test(t)
              ? 93
              : 0;
  return Math.round(Math.min(97, Math.max(byTime, byText)));
}
