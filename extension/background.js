// The service worker. Every three hours while Chrome is open (auto-sync is Plus and Max since 2026-10-04: Plus, Max,
// a trial or a friend link; Free has no Halo sync), or at once from the popup's
// Sync now, it runs the same sync the bookmark runs on a Halo page (the student's own Halo tab if one is open,
// otherwise one it opens quietly in the background and closes after) and carries the export to Halo+.
//
// It never interrupts (George, 2026-09-30): a scheduled sync opens no window, focuses nothing and shows no review
// sheet (the app applies it quietly with an Undo note). Logged out of Halo is not an error to nag about: the popup
// says so, and the next scheduled run tries again.
//
// Every sync goes to the account first (the pending slot the iPad bookmark uses), so it lands with no Halo+ tab open;
// an open tab is told to take it now, and a closed Halo+ takes it when it next opens. Only when the account cannot be
// reached does the export wait here instead, and "Last synced" is written only for a sync that landed (2026-09-30:
// a 6:08 AM sync read Halo, found no Halo+ tab, was lost, and the popup still said "Last synced 6:08 AM").
import { DASH_ORIGIN, DASH_URL, DROP_URL, PERIOD_MINUTES, REPORT_URL } from './config.js';
// Halo+ on Halo (0.8.0): the same rules the Halo pages use, for the toolbar badge.
import './halo-model.js';

// Scheduled syncs run on Plus and Max; Sync now runs on any plan (the app and the server apply the same rule).
const AUTO = ['plus', 'max'];
const HALO = 'https://halo.gcu.edu/';
const ALARM = 'auto-sync';
// A real account takes minutes to read: the worker waits as long as the sync keeps reporting progress, and gives up
// after two minutes of silence or fifteen in all (2026-09-30: a fixed 90 seconds cut real syncs off).
const SILENT_MS = 90_000;
const MAX_MS = 15 * 60_000;
/** Any one browser call (open a tab, ask a tab) that has not answered in this long never will: a sleeping tab (0.7.6). */
const TAB_MS = 15_000;
const state = { pending: null, fail: null, running: false, lastProgressAt: 0, runId: 0, askedFrom: null };
/** A sync with no word from Halo for this long has stopped, whatever storage still says (0.6.6). */
const STUCK_MS = 120_000;
void chrome.storage.local.get(['running', 'progressAt', 'runningSince', 'runKey', 'runningSetup', 'runningAuto', 'resumedRun']).then(async ({ running, progressAt, runningSince, runKey, runningSetup, runningAuto, resumedRun }) => {
  if (!running || state.running) return;
  const quiet = Date.now() - Date.parse(progressAt || runningSince || 0);
  if (quiet <= STUCK_MS) return;
  await chrome.storage.local.set({ running: false, progress: null, lastError: 'The last sync stopped partway (Chrome restarted the extension). Press Sync now to try again.', lastErrorKind: 'interrupted', lastErrorAt: new Date().toISOString() });
  // Seen and counted now (0.7.6): a run cut off with the worker used to leave no trace at all.
  if (runKey) void logRun({ run: runKey, phase: 'end', outcome: 'failed', cause: 'interrupted', auto: !!runningAuto, setup: !!runningSetup });
  void reportError({ title: 'Extension sync interrupted (the browser stopped the extension mid-sync)', message: `Quiet for ${Math.round(quiet / 1000)} s`, place: runningAuto ? 'scheduled sync' : 'sync now', details: { kind: 'interrupted', auto: !!runningAuto, setup: !!runningSetup } });
  // A first sync during setup that was cut off starts again by itself, once.
  if (runningSetup && runKey && resumedRun !== runKey && Date.now() - Date.parse(runningSince || 0) < 15 * 60_000) {
    await chrome.storage.local.set({ resumedRun: runKey });
    void runSync({ auto: false, quiet: true, setup: true });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Rejects when a browser call has not answered in time: a sleeping or frozen tab never answers at all (0.7.6). */
const within = (p, ms, label) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${label} did not answer`)), ms))]);

// ---- error monitoring (2026-09-30) ----------------------------------------------------------------------------------
// Crashes and syncs that fail or never land go to Halo+'s error log (the app's Admin page), without anything personal:
// the extension's version, the plan, a random id for this browser, and the reason in plain words. At most 10 in 10
// minutes, and the same problem once in 5.
const VERSION = chrome.runtime.getManifest().version;
/** This browser's random id, made once (two reports at the same moment used to make two ids, 2026-10-21). */
const deviceIdP = chrome.storage.local.get('deviceId').then(async ({ deviceId }) => {
  if (deviceId) return deviceId;
  const id = `ext-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ deviceId: id });
  return id;
});
function browserName() {
  const ua = navigator.userAgent;
  return `${/Edg\//.test(ua) ? 'Edge' : 'Chrome'} ${(ua.match(/(?:Edg|Chrome)\/(\d+)/) || [])[1] || ''} on ${/Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown'}`;
}
/**
 * How one sync run went (0.7.6), for Admin's sync success rate: when it started, how it ended and why, whether reloading
 * Halo rescued it. Filed under the account of this browser's sync key. Nothing about the student's classes.
 */
async function logRun(r) {
  try {
    const { syncKey } = await chrome.storage.local.get('syncKey');
    await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'sync-run', ext_version: VERSION, browser: browserName(), device_id: await deviceIdP, key: syncKey || null, ...r }) });
  } catch {
    /* never fails a sync */
  }
}
async function reportError(r) {
  try {
    const s = await chrome.storage.local.get(['errorLog', 'tier']);
    const now = Date.now();
    const log = (s.errorLog || []).filter((x) => now - x.at < 600_000);
    const key = `${r.title}|${r.place || ''}`;
    if (log.length >= 10 || log.some((x) => x.key === key && now - x.at < 300_000)) return;
    const deviceId = await deviceIdP;
    await chrome.storage.local.set({ errorLog: [...log, { at: now, key }].slice(-20) });
    const browser = browserName();
    await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'extension', ext_version: VERSION, browser, device: 'desktop', plan: s.tier || null, device_id: deviceId, ...r }) });
  } catch {
    /* the reporter never reports itself */
  }
}
self.addEventListener('error', (e) => void reportError({ title: `Extension worker crashed: ${String(e.message || 'error').slice(0, 100)}`, message: e.message, stack: e.error && e.error.stack, place: 'worker' }));
self.addEventListener('unhandledrejection', (e) => {
  const m = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  void reportError({ title: `Extension worker crashed: ${m.slice(0, 100)}`, message: m, stack: e.reason && e.reason.stack, place: 'worker' });
});
/** "0.9.3" is older than "0.10.0": each part as a number. */
const olderThan = (a, b) => {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let k = 0; k < Math.max(x.length, y.length); k++) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) < (y[k] || 0);
  return false;
};
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

// ---- the schedule ---------------------------------------------------------------------------------------------------
async function ensureSchedule({ wake = false } = {}) {
  const { lastSyncAt, tier } = await get(['lastSyncAt', 'tier']);
  // Not on Max: no schedule at all (a plan that moved down from Max loses its alarm here).
  if (!AUTO.includes(tier)) {
    await chrome.alarms.clear(ALARM);
    return;
  }
  const alarm = await chrome.alarms.get(ALARM);
  // Every time the worker wakes (0.5.1): a schedule that is there and sane is left alone; one Chrome dropped (alarms are
  // not guaranteed to survive a restart) is made again. Never pushed later just because the worker woke up.
  if (wake && alarm && alarm.periodInMinutes === PERIOD_MINUTES && alarm.scheduledTime - Date.now() <= PERIOD_MINUTES * 60_000) return;
  const due = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > PERIOD_MINUTES * 60_000;
  // Overdue (Chrome was closed past the time): one run shortly after start, then every three hours from there.
  if (due) await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MINUTES });
  else if (!alarm || wake) await chrome.alarms.create(ALARM, { when: new Date(lastSyncAt).getTime() + PERIOD_MINUTES * 60_000, periodInMinutes: PERIOD_MINUTES });
}
void ensureSchedule({ wake: true });
chrome.runtime.onInstalled.addListener(async (d) => {
  // Before 0.3.0 a sync was stamped "Last synced" whether or not it reached Halo+; that time cannot be trusted.
  // Versions compare as numbers: as text, "0.10.0" sorts before "0.3.0" (0.10.0 would have wiped this on every update).
  if (d.reason === 'update' && d.previousVersion && olderThan(d.previousVersion, '0.3.0')) await chrome.storage.local.remove(['lastSyncAt', 'lastError', 'lastErrorKind', 'lastErrorAt']);
  await ensureSchedule();
  // Tabs already open get this extension's scripts now (0.5.2), not after a reload: an open Halo+ tab learns the plan
  // and the account at once (the setup screen sees the extension in seconds), and an open Halo tab can carry a sync.
  await addToOpenTabs();
  // A new install comes from the store's tab: the student is taken back to Halo+, where the first sync shows (0.7.6).
  if (d.reason === 'install') {
    await sleep(800);
    await focusDash();
  }
});
// A sync that was due while no browser window was open (Windows keeps the browser running in the background) runs when
// one opens (0.7.6).
chrome.windows.onCreated.addListener(async (w) => {
  if (w.type !== 'normal') return;
  const { syncWhenWindow, tier } = await get(['syncWhenWindow', 'tier']);
  if (!syncWhenWindow) return;
  await set({ syncWhenWindow: false });
  await sleep(5000);
  if (!state.running && AUTO.includes(tier)) void runSync({ auto: true });
});

async function addToOpenTabs() {
  const dash = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }).catch(() => []);
  // Each with a time limit (0.7.6): a sleeping tab never answers, and the install must not wait on it.
  for (const t of dash) await within(chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content-dash.js'] }), 5000, 'A Halo+ tab').catch(() => undefined);
  const halo = await chrome.tabs.query({ url: `${HALO}*` }).catch(() => []);
  for (const t of halo) if (!t.discarded) await within(chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['halo-model.js', 'celebrate.js', 'content-halo.js', 'halo-ui.js'] }), 5000, 'A Halo tab').catch(() => undefined);
}
chrome.runtime.onStartup.addListener(() => void ensureSchedule());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { tier, lastSyncAt } = await get(['tier', 'lastSyncAt']);
  if (!AUTO.includes(tier)) return void chrome.alarms.clear(ALARM);
  // A Sync now a moment ago already did it.
  if (lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < 30 * 60_000) return;
  await runSync({ auto: true });
});

// ---- messages -------------------------------------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.kind === 'tier') {
    void set({ tier: msg.tier }).then(ensureSchedule);
    reply({ ok: true });
  } else if (msg.kind === 'key') {
    // The signed-in account's sync key, from an open Halo+ tab: it can drop a sync into that account and nothing else.
    // A key for a different account than the kept export was read for drops that export (0.6.2): one student's Halo
    // never lands in another account.
    void (async () => {
      const { syncKey: before, waitingKey } = await get(['syncKey', 'waitingKey']);
      const next = msg.key || null;
      if (next && (waitingKey || before) && next !== (waitingKey || before)) await chrome.storage.local.remove(['waiting', 'waitingKey']);
      await set({ syncKey: next });
      if (next && next !== before) void fetchDone(true);
      if (next) await sendWaiting();
    })();
    reply({ ok: true });
  } else if (msg.kind === 'synced-elsewhere') {
    // Halo+ applied a sync that did not come through this extension's run (the bookmark, a kept one): the popup's
    // "Last synced" moves and any stale "Syncing" or problem goes (0.6.6).
    void (async () => {
      const { lastSyncAt } = await get('lastSyncAt');
      if (msg.at && (!lastSyncAt || msg.at > lastSyncAt)) await markLanded(msg.at, msg.via || 'tab');
      if (!state.running) await set({ running: false, progress: null });
      await chrome.action.setBadgeText({ text: '' });
    })();
    reply({ ok: true });
  } else if (msg.kind === 'landed') {
    // An open Halo+ tab took a kept export by hand.
    void markLanded(msg.exportedAt, 'tab');
    reply({ ok: true });
  } else if (msg.kind === 'halo-progress') {
    state.lastProgressAt = Date.now();
    void set({ progress: msg.text, progressAt: new Date().toISOString() });
    // Halo+ shows the first sync's progress live (0.7.5): every open Halo+ tab hears each step.
    void progressToTabs(msg.text);
    reply({ ok: true });
  } else if (msg.kind === 'halo-failed') {
    if (state.fail) state.fail(msg.text);
    reply({ ok: true });
  } else if (msg.kind === 'halo-export') {
    if (state.pending) state.pending(msg.payload);
    // The worker was restarted while Halo was being read (Chrome stops idle workers, reloading the extension does too):
    // the export still goes through, and this path now clears "Syncing" when it ends, as runSync does (0.6.6). Before,
    // nothing did: the popup said "Syncing…" for hours with its Sync now disabled (George, 2026-10-11).
    else
      void (async () => {
        await set({ running: true, progress: 'Saving to your Halo+ account…', progressAt: new Date().toISOString() });
        try {
          await finish(msg.payload, true);
        } finally {
          if (!state.running) await set({ running: false, progress: null });
        }
      })();
    reply({ ok: true });
  } else if (msg.kind === 'take-waiting') {
    // A Halo+ tab just opened: an export kept here goes to the account (the tab takes it from there), or, when the
    // account still cannot be reached, straight to the tab.
    void (async () => {
      const { waiting, waitingKey } = await get(['waiting', 'waitingKey']);
      if (msg.key && waiting && waitingKey && waitingKey !== msg.key) {
        // Read for another account on this computer: it is not this account's to take (0.6.2).
        await chrome.storage.local.remove(['waiting', 'waitingKey']);
        await set({ syncKey: msg.key });
        return reply({});
      }
      if (msg.key) await set({ syncKey: msg.key });
      if (!waiting) return reply({});
      await chrome.storage.local.remove('waiting');
      // Older than half a day: the next sync is fresher than this one, so it is dropped rather than applied late.
      if (Date.now() - new Date(waiting.exportedAt).getTime() > 12 * 3_600_000) return reply({});
      const saved = await toAccount(waiting);
      if (saved.ok) {
        await markLanded(waiting.exportedAt, 'account');
        return reply({ pending: true });
      }
      reply({ payload: waiting });
    })();
    return true;
  } else if (msg.kind === 'halo-snap') {
    // From Halo+: what to show on Halo's own pages (0.8.0), kept here for the Halo script and the toolbar badge.
    let snap = null;
    try {
      snap = msg.snap ? JSON.parse(msg.snap) : null;
    } catch {
      /* not ours */
    }
    void set({ haloSnap: snap && snap.v === 1 ? snap : null }).then(updateBadge);
    reply({ ok: true });
  } else if (msg.kind === 'week-mark') {
    // "This week": a check-off (0.10.0). Counted here at once; it goes to the account when its Undo has passed.
    void weekMark(msg.id);
    reply({ ok: true });
  } else if (msg.kind === 'week-undo') {
    void weekUndo(msg.id);
    reply({ ok: true });
  } else if (msg.kind === 'halo-ui') {
    // What happened to Halo+ on a Halo page (shown, closed, clicked), counted for Admin (0.8.0).
    void countHaloUi(msg.event);
    reply({ ok: true });
  } else if (msg.kind === 'joy') {
    // From Halo+: points and class codes per Halo assignment, and the Celebrations switch. Read by the Halo script.
    let snap = null;
    try {
      snap = msg.snap ? JSON.parse(msg.snap) : null;
    } catch {
      /* not ours */
    }
    void set({ joySnap: snap && snap.v === 1 ? snap : null });
    reply({ ok: true });
  } else if (msg.kind === 'submitted') {
    // Halo just confirmed a submission in the student's tab: sync now so Halo+ shows it, quietly (it is Sync now for
    // the plan rules, so it is taken on Plus too, but it focuses nothing and opens nothing: the student is on Halo).
    // Halo saves the submission before it says so; a few seconds' wait lets the gateway catch up.
    if (!state.running) setTimeout(() => !state.running && void runSync({ auto: false, quiet: true }), 4000);
    reply({ ok: true });
  } else if (msg.kind === 'halo-here') {
    // A Halo page opened. Auto-sync paused on a logged-out Halo picks up now instead of waiting up to three hours.
    void set({ haloHereAt: new Date().toISOString() });
    void fetchDone();
    void (async () => {
      const { tier, autoPaused, lastAttemptAt, lastErrorKind, lastErrorAt, setup } = await get(['tier', 'autoPaused', 'lastAttemptAt', 'lastErrorKind', 'lastErrorAt', 'setup']);
      // A sync asked for in the last 15 minutes that found Halo logged out (the first sync during setup, 0.7.5): the
      // student has just logged in, so it runs now, without another press.
      // A paused auto-sync is not "just asked": it resumes as the scheduled sync it is (0.8.1), unless setup is waiting on
      // this login.
      const inSetup = !!setup && setup.phase === 'login';
      const resumesAuto = AUTO.includes(tier) && !!autoPaused && !inSetup;
      const justAsked = !resumesAuto && lastErrorKind === 'logged-out' && lastErrorAt && Date.now() - new Date(lastErrorAt).getTime() < 15 * 60_000;
      if (justAsked && !state.running) {
        // Not twice in 20 seconds (Halo's sign-in page and the page after it both say hello).
        if (lastAttemptAt && Date.now() - new Date(lastAttemptAt).getTime() < 20_000) return;
        await sleep(3000);
        if (!state.running) await runSync({ auto: false, quiet: true, setup: inSetup });
        return;
      }
      if (!AUTO.includes(tier) || !autoPaused || state.running) return;
      if (lastAttemptAt && Date.now() - new Date(lastAttemptAt).getTime() < 2 * 60_000) return;
      await sleep(3000);
      if (!state.running) await runSync({ auto: true });
    })();
    reply({ ok: true });
  } else if (msg.kind === 'status') {
    // Halo+ asks whether auto-sync is paused, to say so on Now.
    void get(['autoPaused']).then(({ autoPaused }) => reply({ autoPaused: autoPaused || null }));
    return true;
  } else if (msg.kind === 'first-sync') {
    // The extension setup in Halo+ just saw this extension: the first sync now, quietly (Halo+ is already in front).
    if (sender.tab) state.askedFrom = sender.tab.id;
    void get(['tier']).then(({ tier }) => {
      if (!state.running && ['plus', 'pro', 'max'].includes(tier)) void runSync({ auto: false, quiet: true, setup: true });
    });
    reply({ ok: true });
  } else if (msg.kind === 'reload-sync') {
    // Halo+'s "Reload Halo" (0.7.6): the student's Halo tabs are reloaded, and a sync starts in a fresh tab of its own.
    if (sender.tab) state.askedFrom = sender.tab.id;
    void (async () => {
      const tabs = await chrome.tabs.query({ url: `${HALO}*` }).catch(() => []);
      for (const t of tabs) await chrome.tabs.reload(t.id).catch(() => undefined);
      if (state.running && Date.now() - state.lastProgressAt > 20_000) state.running = false;
      if (!state.running) void runSync({ auto: false, quiet: true, setup: !!msg.setup });
    })();
    reply({ started: true });
  } else if (msg.kind === 'focus-dash') {
    // The popup's "Back to Halo+".
    void focusDash().then(() => setupState(null));
    reply({ ok: true });
  } else if (msg.kind === 'kit-files') {
    // Halo+ asks for the bytes of an assignment's files (0.6.0, the help kit): minted in the student's Halo tab the
    // way the sync reads Halo, fetched here. The file host is an optional permission: the first time, Chrome asks.
    void kitFiles(msg, sender.tab ? sender.tab.id : null).then(reply);
    return true;
  } else if (msg.kind === 'kit-allowed') {
    // The allow page: the student answered Chrome's prompt; every open Halo+ tab hears, and the kit goes on by itself.
    // Focus goes back to the Halo+ tab the kit was asked from, with its sheet still open (George, 2026-10-09).
    void (async () => {
      const { kitDashTab } = await get('kitDashTab');
      const tabs = await chrome.tabs.query({ url: [`${DASH_ORIGIN}/*`] });
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { kind: 'kit-permission', granted: !!msg.granted }).catch(() => undefined);
      const back = tabs.find((t) => t.id === kitDashTab) ?? tabs[0];
      if (back) {
        await chrome.tabs.update(back.id, { active: true }).catch(() => undefined);
        await chrome.windows.update(back.windowId, { focused: true }).catch(() => undefined);
      }
      if (sender.tab && sender.tab.id !== undefined) chrome.tabs.remove(sender.tab.id).catch(() => undefined);
    })();
    reply({ ok: true });
  } else if (msg.kind === 'page-sync') {
    // Halo+'s Sync now (0.6.5): runs at once, or joins the sync already running; either way the tab hears how it ended.
    // A run that has said nothing for two minutes is not joined but replaced (0.7.6): a reload of Halo+ used to join a
    // stuck first sync and wait with it.
    if (sender.tab) state.askedFrom = sender.tab.id;
    if (state.running && Date.now() - state.lastProgressAt > STUCK_MS) state.running = false;
    const busy = state.running;
    if (!busy) void runSync({ auto: false, quiet: true, setup: !!msg.setup });
    reply({ started: !busy, busy });
  } else if (msg.kind === 'sync-now') {
    // The popup's button: runs at once on any plan (the app explains a plan without sync). The popup follows along
    // through storage, so the reply does not wait for the sync. Try again on a sync that went quiet starts over (0.6.6).
    if (msg.force && state.running && Date.now() - state.lastProgressAt > STUCK_MS) state.running = false;
    if (!state.running) void runSync({ auto: false });
    reply({ ok: true });
  }
});

// ---- one sync -------------------------------------------------------------------------------------------------------
const waitForLoad = (tabId, ms = 30_000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => done(tabId, { status: 'complete' }), ms);
    const done = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(t);
      chrome.tabs.onUpdated.removeListener(done);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(done);
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && done(tabId, { status: 'complete' })).catch(() => done(tabId, { status: 'complete' }));
  });

const isHalo = (url) => typeof url === 'string' && url.startsWith(HALO);

/** Plain words for what went wrong, and what to do. `quiet` failures (logged out) never raise a badge. */
function explain(raw) {
  const s = String(raw || '');
  if (/No Halo session|log ?in|sign ?in|logged out/i.test(s)) return { kind: 'logged-out', text: "You're logged out of Halo. Log in at halo.gcu.edu and Halo+ will sync on its next run, or press Sync now.", quiet: true };
  if (/returned no classes/i.test(s)) return { kind: 'no-classes', text: 'Halo showed no classes. Open one of your classes in Halo once, then press Sync now.', quiet: false };
  if (/Failed to fetch|NetworkError|network/i.test(s)) return { kind: 'offline', text: "Halo couldn't be reached. Check your internet connection; Halo+ tries again on its next run.", quiet: true };
  if (/stopped answering|did not answer|No tab with id|Frame with ID|error page|Cannot access contents|another page/i.test(s)) return { kind: 'stalled', text: "Sync didn't finish. Try reloading Halo.", quiet: false };
  if (/Halo\+ tab|dashboard/i.test(s)) return { kind: 'delivery', text: s, quiet: false };
  return { kind: 'other', text: `Halo sync failed: ${s.replace(/^Halo sync failed:\s*/i, '')}`, quiet: false };
}


/** Failures that reloading Halo usually fixes (George, 2026-10-21): the tab went quiet, closed, or showed another page. */
const retryable = (raw) => /stopped answering|did not answer|No tab with id|Frame with ID|error page|Cannot access contents|cannot be scripted|No frame|tab was closed|another page|Failed to fetch|NetworkError/i.test(String(raw || ''));

/** One word for Admin's success rate. */
function causeOf(raw, kind) {
  const s = String(raw || '');
  if (/did not answer/i.test(s)) return 'tab-asleep';
  if (kind && kind !== 'other') return kind;
  if (/No tab with id|Frame with ID .*removed|tab was closed/i.test(s)) return 'tab-closed';
  if (/Cannot access contents|error page|another page|cannot be scripted/i.test(s)) return 'not-halo-page';
  if (/No current window/i.test(s)) return 'no-window';
  return 'other';
}

/**
 * The student's own Halo tab, only when it is the tab in front of a focused window and answers within 3 seconds
 * (0.7.6). A Halo tab left in the background is not used: Edge puts it to sleep, Chrome's energy saver freezes it, it
 * may be on another page or from before an update, and a sync sent into it waited forever (a Windows student's first
 * sync, 2026-10-21).
 */
async function studentTab() {
  const tabs = await within(chrome.tabs.query({ url: `${HALO}*`, active: true }), TAB_MS, 'The tab list').catch(() => []);
  for (const t of tabs) {
    if (t.discarded || t.status !== 'complete' || !isHalo(t.url) || /^https:\/\/halo\.gcu\.edu\/(login|auth)/.test(t.url)) continue;
    const win = await chrome.windows.get(t.windowId).catch(() => null);
    if (!win || !win.focused) continue;
    const ok = await within(chrome.tabs.sendMessage(t.id, { kind: 'ping' }), 3000, 'The Halo tab').then((r) => !!(r && r.ok)).catch(() => false);
    if (ok) return t;
  }
  return null;
}

/** A Halo tab of its own, quietly in the background: never active, never a new window, muted, closed when done. */
async function quietTab() {
  const tab = await within(chrome.tabs.create({ url: HALO, active: false, index: 9999 }), TAB_MS, 'Opening Halo');
  await chrome.tabs.update(tab.id, { muted: true }).catch(() => undefined);
  await waitForLoad(tab.id);
  await sleep(1200);
  return within(chrome.tabs.get(tab.id), TAB_MS, 'The Halo tab');
}

/** One reading of Halo: { payload, tab } or { error, retry, tab }. A tab it opened is closed whatever happens. */
async function readHalo({ fresh }) {
  let tab = null;
  let own = false;
  try {
    if (!fresh) tab = await studentTab();
    if (!tab) {
      own = true;
      tab = await quietTab();
    }
    const url = tab.url ?? tab.pendingUrl ?? '';
    // Halo sent its own fresh tab to the sign-in page: logged out. The student's tab on another page: try a fresh one.
    if (!isHalo(url) || /^https:\/\/halo\.gcu\.edu\/(login|auth)/.test(url)) return own ? { error: 'logged out', tab: 'own' } : { error: 'The Halo tab is on another page', retry: true, tab: 'student' };
    await within(ensureRelay(tab.id), 10_000, 'The Halo page');
    const payload = await new Promise((resolve) => {
      let tick = Date.now();
      const started = Date.now();
      state.lastProgressAt = Date.now();
      const watch = setInterval(() => {
        const now = Date.now();
        // The computer slept (a lid closed mid-sync, 0.7.6): time asleep is not Halo's silence.
        if (now - tick > 30_000) state.lastProgressAt += now - tick;
        tick = now;
        if (now - state.lastProgressAt > SILENT_MS || now - started > MAX_MS) {
          clearInterval(watch);
          resolve({ error: 'Halo stopped answering' });
        }
      }, 5000);
      state.pending = (p) => {
        clearInterval(watch);
        resolve(p);
      };
      state.fail = (why) => {
        clearInterval(watch);
        resolve({ error: why });
      };
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sync-inject.js'], world: 'MAIN' }).catch((e) => {
        clearInterval(watch);
        resolve({ error: e && e.message ? e.message : String(e) });
      });
    });
    if (payload && !payload.error) return { payload, tab: own ? 'own' : 'student' };
    const why = (payload && payload.error) || 'Halo stopped answering';
    return { error: why, retry: retryable(why), tab: own ? 'own' : 'student' };
  } catch (e) {
    const why = e && e.message ? e.message : String(e);
    return { error: why, retry: retryable(why), tab: own ? 'own' : 'student' };
  } finally {
    state.pending = null;
    state.fail = null;
    if (own && tab) chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

/**
 * What the account says is done (0.9.1, George 2026-10-24: items checked off in Halo+ still showed overdue here). Halo's
 * own ids of work done or graded in Halo+ on any device, from the server with this computer's key; asked when a Halo
 * page opens, after a sync, when Halo+ hands over the key, and every 10 minutes, never more than once in 3.
 */
async function fetchDone(force = false) {
  try {
    const { syncKey, haloDone } = await get(['syncKey', 'haloDone']);
    if (!syncKey) return;
    await sendMarks();
    if (!force && haloDone && haloDone.at && Date.now() - Date.parse(haloDone.at) < 3 * 60_000) return;
    const r = await fetch(DROP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: syncKey, done: true }) });
    if (!r.ok) return;
    const j = await r.json().catch(() => null);
    if (j && j.ok && Array.isArray(j.done)) {
      await set({ haloDone: { v: 1, at: new Date().toISOString(), done: j.done.slice(0, 6000) } });
      // This computer's own check-offs the account now has (or that are days old) are done with.
      const { haloMarks } = await get(['haloMarks']);
      const marks = { ...(haloMarks || {}) };
      let changed = false;
      for (const [id, m] of Object.entries(marks))
        if ((m.state === 'sent' && j.done.includes(id)) || Date.now() - Date.parse(m.at) > 3 * 86_400_000) {
          delete marks[id];
          changed = true;
        }
      if (changed) await set({ haloMarks: marks });
    }
  } catch {
    /* offline: the last list stands */
  }
}

// ---- "This week" check-offs (0.10.0) --------------------------------------------------------------------------------
// A check-off in "This week" on Halo's Student Home is this computer's mark at once (haloMarks, which the pill, the
// panel, the badge and the popup count as done) and goes to the account (sync-drop, mark) once its Undo has passed, so
// an undone check-off never reaches Halo+. One not sent yet (offline, the worker stopped) goes with the next done list.
const MARK_WAIT_MS = 5500;
const markTimers = new Map();
async function weekMark(id) {
  if (typeof id !== 'string' || !id) return;
  const { haloMarks } = await get(['haloMarks']);
  await set({ haloMarks: { ...(haloMarks || {}), [id]: { at: new Date().toISOString(), state: 'pending' } } });
  clearTimeout(markTimers.get(id));
  markTimers.set(
    id,
    setTimeout(() => {
      markTimers.delete(id);
      void sendMarks();
    }, MARK_WAIT_MS),
  );
}
async function weekUndo(id) {
  if (typeof id !== 'string' || !id) return;
  clearTimeout(markTimers.get(id));
  markTimers.delete(id);
  const { haloMarks, syncKey } = await get(['haloMarks', 'syncKey']);
  const m = (haloMarks || {})[id];
  if (!m) return;
  const marks = { ...haloMarks };
  delete marks[id];
  await set({ haloMarks: marks });
  // Already in the account: put it back as it was there.
  if (m.state === 'sent' && syncKey) {
    await fetch(DROP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: syncKey, mark: { id, done: false, prev: m.prev || null } }) }).catch(() => undefined);
    await fetchDone(true);
  }
}
let sendingMarks = false;
async function sendMarks() {
  if (sendingMarks) return;
  sendingMarks = true;
  try {
    const { haloMarks, syncKey } = await get(['haloMarks', 'syncKey']);
    if (!syncKey || !haloMarks) return;
    let sent = false;
    for (const [id, m] of Object.entries(haloMarks)) {
      if (m.state !== 'pending' || markTimers.has(id) || Date.now() - Date.parse(m.at) < MARK_WAIT_MS - 500) continue;
      const r = await fetch(DROP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: syncKey, mark: { id, done: true } }) }).catch(() => null);
      if (!r) continue;
      const j = await r.json().catch(() => null);
      const { haloMarks: now } = await get(['haloMarks']);
      const marks = { ...(now || {}) };
      if (!marks[id]) continue;
      // Not in Halo+ (deleted there): this computer's mark goes too.
      if (r.status === 404 || r.status === 401) delete marks[id];
      else if (j && j.ok) marks[id] = { ...marks[id], state: 'sent', prev: j.prev || null };
      else continue;
      await set({ haloMarks: marks });
      sent = true;
    }
    if (sent) setTimeout(() => void fetchDone(true), 300);
  } finally {
    sendingMarks = false;
  }
}

/**
 * The toolbar badge (George, 2026-10-22): how many things are due today, gold; red when something is overdue or due
 * within 3 hours; nothing when nothing is due. Setup's own marks and a failed Sync now's "!" come first. Free has no
 * sync to keep it true, so no badge there.
 */
async function updateBadge() {
  try {
    const s = await get(['haloSnap', 'haloLive', 'haloDone', 'haloMarks', 'setup', 'tier', 'lastError', 'lastErrorAt', 'lastSyncAt', 'lastErrorKind']);
    if (s.setup && Date.now() - Date.parse(s.setup.at || 0) < 15 * 60_000) return;
    const failedNow = s.lastError && s.lastErrorAt && (!s.lastSyncAt || s.lastErrorAt > s.lastSyncAt) && !['logged-out', 'offline', 'no-key'].includes(s.lastErrorKind);
    if (failedNow) return;
    const M = globalThis.HaloPlusModel;
    const view = M.merge(s.haloSnap, s.haloLive, M.doneFrom(s.haloDone, s.haloMarks));
    const b = view && view.plan !== 'free' && AUTO.includes(s.tier) ? M.badge(view, Date.now()) : null;
    await chrome.action.setBadgeText({ text: b ? b.text : '' });
    if (b) await chrome.action.setBadgeBackgroundColor({ color: b.red ? '#e5484d' : '#f2b84b' });
    if (b && chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: b.red ? '#ffffff' : '#141414' }).catch(() => undefined);
    await set({ badgeShown: b ? b.text : null });
  } catch {
    /* the badge never breaks anything */
  }
}
void updateBadge();
// Whatever changed what it says (Halo+'s snapshot, a sync's reading, the plan, setup) updates it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['haloSnap', 'haloLive', 'haloDone', 'haloMarks', 'tier', 'setup'].some((k) => k in changes)) void updateBadge();
});
chrome.alarms.create('halo-badge', { periodInMinutes: 10 }).catch?.(() => undefined);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'halo-badge') {
    void updateBadge();
    void fetchDone();
  }
});

/** One Halo+-on-Halo moment, counted for Admin through the report function (the account comes from the sync key). */
const HALO_UI = ['card-shown', 'card-closed', 'card-click', 'pill-click', 'pill-hover', 'class-click', 'box-click', 'box-shown', 'badge-click', 'next-shown', 'sync-click', 'week-shown', 'week-open', 'week-close', 'week-row', 'week-plus', 'week-check', 'week-undo', 'week-more'];
async function countHaloUi(event) {
  if (!HALO_UI.includes(event)) return;
  try {
    const { syncKey, haloUiCount } = await get(['syncKey', 'haloUiCount']);
    const day = new Date().toISOString().slice(0, 10);
    const c = haloUiCount && haloUiCount.day === day ? haloUiCount : { day, n: 0 };
    if (c.n >= 60 || !syncKey) return;
    await set({ haloUiCount: { day, n: c.n + 1 } });
    await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'halo-ui', event, key: syncKey, ext_version: VERSION }) });
  } catch {
    /* counting never breaks anything */
  }
}

/**
 * Setup's own little story on the toolbar (George, 2026-10-21): the popup says "Syncing your classes…", then "Done!
 * Back to Halo+" with a button; the icon carries a mark meanwhile. The first sync on this computer counts as setup.
 */
async function setupState(phase) {
  await set({ setup: phase ? { phase, at: new Date().toISOString() } : null });
  if (phase === 'syncing') {
    await chrome.action.setBadgeBackgroundColor({ color: '#f2b84b' }).catch(() => undefined);
    await chrome.action.setBadgeText({ text: '…' }).catch(() => undefined);
  } else if (phase === 'done') {
    await chrome.action.setBadgeBackgroundColor({ color: '#2e8b57' }).catch(() => undefined);
    await chrome.action.setBadgeText({ text: '✓' }).catch(() => undefined);
  }
  if (phase === 'syncing' || phase === 'done') await showPopup();
}

/** Opens the toolbar popup where the browser allows it (Chrome 127+, Edge); never an error. */
async function showPopup() {
  try {
    if (chrome.action.openPopup) await chrome.action.openPopup();
  } catch {
    /* no focused window, or this browser does not allow it */
  }
}

/** Halo+ to the front (George, 2026-10-21): the tab that asked for the sync, or any Halo+ tab, or a new one. */
async function focusDash() {
  const tabs = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }).catch(() => []);
  let t = tabs.find((x) => x.id === state.askedFrom) ?? tabs[0] ?? null;
  if (t) {
    await chrome.tabs.update(t.id, { active: true }).catch(() => undefined);
    await chrome.windows.update(t.windowId, { focused: true }).catch(() => undefined);
    return t;
  }
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => []);
  if (!wins.length) return null;
  t = await chrome.tabs.create({ url: `${DASH_ORIGIN}/#/now`, active: true }).catch(() => null);
  return t;
}

/**
 * Gentle on Halo (0.9.0, 2026-10-23): a page the student just opened on Halo makes its own requests (and so do other
 * extensions' cards on it). A scheduled or quiet sync waits until that page has had 12 seconds to itself, 20 at most.
 * A Sync now the student pressed never waits.
 */
async function letHaloSettle() {
  const { haloHereAt } = await get(['haloHereAt']);
  const since = haloHereAt ? Date.now() - Date.parse(haloHereAt) : Infinity;
  if (since < 12_000) await sleep(Math.min(20_000, 12_000 - since));
}

async function runSync({ auto, quiet = false, setup = false }) {
  if (state.running) return;
  state.running = true;
  if (auto || quiet) await letHaloSettle().catch(() => undefined);
  // Each run clears only its own state: a Try again that starts a second run while the first is still uploading must not
  // have the first run's cleanup end the second (review, 2026-10-12).
  const myRun = ++state.runId;
  const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const t0 = Date.now();
  // Kept alive from the first moment (0.7.6): an extension call every few seconds keeps Chrome and Edge from stopping
  // the worker in the middle of a sync, which left a first sync silent for half an hour.
  const alive = setInterval(() => void chrome.runtime.getPlatformInfo(), 5000);
  // Setup's first sync, asked for by Halo+'s Connect Halo (or resumed): only then does Halo+ come to the front after.
  const first = setup;
  await set({ running: true, runningSince: new Date().toISOString(), runningAuto: auto, runningSetup: first, runKey: run, progress: 'Opening Halo…', progressAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString() });
  void logRun({ run, phase: 'start', auto, setup: first });
  const end = { outcome: 'failed', cause: 'other', retried: false, tab: null };
  try {
    // No browser window at all (Windows keeps Chrome and Edge running in the background): nothing to read Halo in.
    // Not a failure: it runs when a window opens.
    const wins = await within(chrome.windows.getAll({ windowTypes: ['normal'] }), TAB_MS, 'The window list').catch(() => []);
    if (!wins.length) {
      await set({ syncWhenWindow: true });
      Object.assign(end, { outcome: 'skipped', cause: 'no-window' });
      return;
    }
    if (first && !auto) await setupState('syncing');
    let r = await readHalo({ fresh: false });
    // Reloading Halo fixes most failures (George, 2026-10-21): once, on its own, before anything is said.
    if (!r.payload && r.retry) {
      await set({ progress: 'Reloading Halo and trying again…', progressAt: new Date().toISOString() });
      void progressToTabs('Reloading Halo and trying again…');
      r = { ...(await readHalo({ fresh: true })), retried: true };
    }
    end.retried = !!r.retried;
    end.tab = r.tab ?? null;
    if (!r.payload) {
      const e = explain(r.error);
      end.cause = causeOf(r.error, e.kind);
      await failed(e, auto, { first, retried: end.retried });
      return;
    }
    const done = await finish(r.payload, auto, quiet, first);
    end.outcome = done.landed ? 'landed' : done.kind === 'foreign' || done.kind === 'plan' ? 'failed' : 'kept';
    end.cause = done.landed ? null : done.kind || 'not-landed';
  } catch (e) {
    // Anything unexpected still ends the run in words, so no page waits forever.
    const why = e && e.message ? e.message : String(e);
    end.cause = causeOf(why);
    await failed(explain(why), auto, { first }).catch(() => undefined);
  } finally {
    clearInterval(alive);
    if (state.runId === myRun) {
      state.pending = null;
      state.fail = null;
      state.running = false;
      await set({ running: false, progress: null });
    }
    void logRun({ run, phase: 'end', auto, setup: first, seconds: (Date.now() - t0) / 1000, ...end });
  }
}

// ---- the help kit's files (0.6.0) -----------------------------------------------------------------------------------
const FILE_HOST = 'https://gce-lms-resource-prod.s3.us-west-2.amazonaws.com/*';
const FILE_MAX = 25 * 1024 * 1024;

/** Runs inside the Halo page (MAIN world): a download link per resource id, with the session that page holds. */
function mintDownloadUrls(ids) {
  return (async () => {
    const out = [];
    try {
      const nd = JSON.parse((document.getElementById('__NEXT_DATA__') || {}).textContent || 'null');
      const orch = (nd && nd.runtimeConfig && nd.runtimeConfig.orchestrationApiEndpoint) || '';
      if (!orch) return { error: 'No orchestrationApiEndpoint on the page' };
      const s = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
      if (!s || !s.authToken) return { error: 'No Halo session' };
      for (const id of ids) {
        try {
          const r = await fetch(orch + 'downloadUrl/' + id, { headers: { Authorization: 'Bearer ' + s.authToken, ContextToken: 'Bearer ' + s.contextToken } });
          const j = await r.json();
          const url = (j && (j.downloadUrl || (j.result && j.result.downloadUrl))) || '';
          out.push({ id, url, error: url ? null : 'Halo gave no download link' });
        } catch (e) {
          out.push({ id, url: '', error: String((e && e.message) || e) });
        }
      }
      return { urls: out };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  })();
}

const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Runs inside the Halo page (MAIN world): fetches a download link from there, for a host the worker could not reach. */
function fetchInHaloTab(url) {
  return (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) return { ok: false, error: 'answered ' + r.status };
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 25 * 1024 * 1024) return { ok: false, error: 'over 25 MB' };
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { ok: true, type: r.headers.get('content-type'), base64: btoa(s) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  })();
}

const hostOf = (url) => { try { return new URL(url).host; } catch { return '?'; } };

async function kitFiles(msg, dashTabId) {
  const requestId = msg.requestId;
  // Each file: its resource id and, in reserve, other ids that hold the same file (an announcement's copy).
  const files = Array.isArray(msg.files) ? msg.files.filter((f) => f && f.resourceId).slice(0, 20).map((f) => ({ resourceId: String(f.resourceId), name: String(f.name || 'file'), alts: Array.isArray(f.alts) ? f.alts.filter(Boolean).map(String).slice(0, 3) : [] })) : [];
  const granted = await chrome.permissions.contains({ origins: [FILE_HOST] }).catch(() => false);
  if (!granted) {
    await set({ kitDashTab: dashTabId });
    await chrome.tabs.create({ url: chrome.runtime.getURL('allow.html'), active: true }).catch(() => undefined);
    return { requestId, status: 'need-permission' };
  }
  if (state.running) return { requestId, status: 'busy' };
  const say = (note) => { if (dashTabId !== null) chrome.tabs.sendMessage(dashTabId, { kind: 'kit-progress', requestId, note }).catch(() => undefined); };
  let haloTab = null;
  let opened = false;
  try {
    haloTab = (await chrome.tabs.query({ url: `${HALO}*` })).find((t) => !t.discarded) ?? null;
    if (!haloTab) {
      haloTab = await chrome.tabs.create({ url: HALO, active: false, index: 9999 });
      opened = true;
      await chrome.tabs.update(haloTab.id, { muted: true }).catch(() => undefined);
      await waitForLoad(haloTab.id);
      await sleep(1500);
      haloTab = await chrome.tabs.get(haloTab.id);
    }
    if (!isHalo(haloTab.url ?? haloTab.pendingUrl)) return { requestId, status: 'error', error: "You're logged out of Halo. Log in at halo.gcu.edu and try again." };
    const ids = [...new Set(files.flatMap((f) => [f.resourceId, ...f.alts]))];
    say(`Asking Halo for ${ids.length} download link${ids.length === 1 ? '' : 's'}…`);
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: haloTab.id }, world: 'MAIN', func: mintDownloadUrls, args: [ids] });
    if (!result || result.error) return { requestId, status: 'error', error: (result && result.error) || 'Halo did not answer' };
    // One file: the worker fetches the link; if its host is one the worker may not reach, the Halo tab tries; then the next copy.
    const grab = async (url) => {
      let first;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`answered ${res.status}`);
        const buf = await res.arrayBuffer();
        if (buf.byteLength > FILE_MAX) throw new Error('over 25 MB');
        return { ok: true, type: res.headers.get('content-type'), base64: toBase64(buf) };
      } catch (e) {
        first = String((e && e.message) || e);
      }
      const [{ result: inTab }] = await chrome.scripting.executeScript({ target: { tabId: haloTab.id }, world: 'MAIN', func: fetchInHaloTab, args: [url] }).catch(() => [{ result: null }]);
      if (inTab && inTab.ok) return inTab;
      return { ok: false, error: `${hostOf(url)}: ${first}${inTab && inTab.error ? `; from the Halo tab: ${inTab.error}` : ''}` };
    };
    const out = [];
    let n = 0;
    for (const f of files) {
      n += 1;
      say(`Grabbing ${n} of ${files.length} from Halo: ${f.name}`);
      const reasons = [];
      let got = null;
      for (const id of [f.resourceId, ...f.alts]) {
        const minted = result.urls.find((u) => u.id === id);
        if (!minted || !minted.url) { reasons.push((minted && minted.error) || 'no link'); continue; }
        const r = await grab(minted.url);
        if (r.ok) { got = r; break; }
        reasons.push(r.error);
      }
      if (got) out.push({ resourceId: f.resourceId, name: f.name, ok: true, type: got.type, base64: got.base64 });
      else out.push({ resourceId: f.resourceId, name: f.name, ok: false, error: reasons.join(' | ') || 'not fetched' });
    }
    return { requestId, status: 'done', files: out };
  } catch (e) {
    return { requestId, status: 'error', error: String((e && e.message) || e) };
  } finally {
    // Only the quiet Halo tab this worker opened, and only if it is still a Halo tab; the Halo+ tab stays where it is.
    if (opened && haloTab) {
      const t = await chrome.tabs.get(haloTab.id).catch(() => null);
      if (t && isHalo(t.url ?? t.pendingUrl)) chrome.tabs.remove(haloTab.id).catch(() => undefined);
    }
    if (dashTabId !== null) {
      const d = await chrome.tabs.get(dashTabId).catch(() => null);
      if (d && !d.active) chrome.tabs.update(dashTabId, { active: true }).catch(() => undefined);
    }
  }
}

/** Makes sure the Halo tab can carry a sync back: content-halo.js answers a ping, or is added now. */
async function ensureRelay(tabId) {
  const there = await chrome.tabs.sendMessage(tabId, { kind: 'ping' }).then((r) => !!(r && r.ok)).catch(() => false);
  if (there) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['halo-model.js', 'celebrate.js', 'content-halo.js', 'halo-ui.js'] }).catch(() => undefined);
}

/** Auto-sync paused (logged out of Halo) or running again: kept, and told to every open Halo+ tab. */
async function setPaused(why) {
  const { autoPaused } = await get('autoPaused');
  const next = why ? { why, at: (autoPaused && autoPaused.why === why && autoPaused.at) || new Date().toISOString() } : null;
  await set({ autoPaused: next });
  const tabs = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { kind: 'ext-status', autoPaused: next }).catch(() => undefined);
}

async function failed(e, auto, { first = false, retried = false } = {}) {
  await set({ lastError: e.text, lastErrorKind: e.kind, lastErrorAt: new Date().toISOString() });
  void tellTabs({ ok: false, kind: e.kind, why: e.text, auto, retried });
  // Setup's popup says what is next: log in to Halo (it syncs by itself after), or that it did not finish.
  if (first && !auto) await setupState(e.kind === 'logged-out' ? 'login' : 'failed');
  // Logged out of Halo on a scheduled run (Halo's sign-in times out): auto-sync is paused until Halo is open again.
  // Not silent any more (2026-10-02): Halo+ says so on Now, and Admin → Errors hears of it once per stretch.
  if (e.kind === 'logged-out' && auto) {
    const { autoPaused } = await get('autoPaused');
    await setPaused('logged-out');
    if (!autoPaused) void reportError({ title: 'Extension auto-sync paused: logged out of Halo', message: 'A scheduled sync found Halo logged out. Auto-sync waits until Halo is open and logged in again.', place: 'scheduled sync', details: { kind: 'logged-out', auto: true } });
  }
  // Logged out and offline are the student's state, not a fault.
  if (!e.quiet) void reportError({ title: `Extension sync failed: ${{ stalled: 'Halo stopped answering', 'no-classes': 'Halo showed no classes', delivery: 'Halo+ did not take it', other: 'Halo returned an error' }[e.kind] || e.kind}`, message: e.text, place: auto ? 'scheduled sync' : 'sync now', details: { kind: e.kind, auto, retried } });
  // Nothing to nag about when logged out or offline; a Sync now that failed shows a mark until the popup is opened.
  if (!auto && !e.quiet) {
    await chrome.action.setBadgeText({ text: '!' });
    await set({ badgeShown: null });
  }
}

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const countsOf = (payload) => ({ classes: payload.classes.length, assignments: payload.classes.reduce((n, c) => n + (c.assessments || []).length, 0) });

/**
 * Into the account's pending slot on the server, gzipped (a real account's export is several megabytes of JSON; it was
 * refused at 8 MB plain). { ok } or { ok: false, why } in words. Every attempt is recorded in lastDrop, so a sync that
 * went to an open tab instead says why the account did not take it.
 */
async function toAccount(payload) {
  const { syncKey } = await get('syncKey');
  if (!syncKey) return { ok: false, kind: 'no-key' };
  const raw = JSON.stringify({ key: syncKey, payload, via: 'extension' });
  const note = { at: new Date().toISOString(), bytes: raw.length };
  try {
    const body = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    note.sent = body.byteLength;
    const post = () => fetch(DROP_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-halo-encoding': 'gzip' }, body });
    // A big account takes the server several seconds to store; one failure there is tried once more.
    let r = await post();
    if (r.status >= 500) r = await post();
    const j = await r.json().catch(() => null);
    note.status = r.status;
    if (r.ok && j && j.ok) {
      await set({ lastDrop: { ...note, ok: true } });
      return { ok: true };
    }
    const why = (j && j.why) || `Halo+ answered ${r.status}`;
    await set({ lastDrop: { ...note, ok: false, why } });
    // A Halo that belongs to another Halo+ account (409): nothing to retry. With a move offer waiting (0.6.4), Halo+ asks.
    if (j && j.foreign) return { ok: false, kind: 'foreign', why, offer: !!j.offer };
    // A key the account no longer has (401, 0.7.6): it is dropped, and the export waits for Halo+ to hand over the new
    // one. It was sent again every three hours and refused every time (58 times from one Windows laptop in October).
    if (r.status === 401) {
      await chrome.storage.local.remove('syncKey');
      return { ok: false, kind: 'no-key' };
    }
    // A plan without auto-sync (403): the schedule stops here instead of trying every hour (0.7.6).
    if (r.status === 403 && j && j.plan) {
      await set({ tier: 'free' });
      await chrome.alarms.clear(ALARM);
      return { ok: false, kind: 'plan', why };
    }
    void reportError({ title: `Extension could not deliver to the pending slot (${r.status})`, message: why, place: 'sync-drop', status: r.status, details: { mb: Math.round(note.bytes / 100_000) / 10, sentMb: Math.round((note.sent || 0) / 100_000) / 10 } });
    return { ok: false, kind: 'refused', why };
  } catch (e) {
    await set({ lastDrop: { ...note, ok: false, why: e && e.message ? e.message : String(e) } });
    return { ok: false, kind: 'offline' };
  }
}

/** A sync reached the account (or an open Halo+ tab): now, and only now, it is "Last synced". */
async function markLanded(readAt, how) {
  await set({ lastSyncAt: readAt, lastLanded: how, lastError: null, lastErrorKind: null });
  void fetchDone(true);
  void tellTabs({ ok: true, at: readAt, how });
  // Only a sync read after the pause began says Halo is logged in again (0.9.0): Halo+ applying an older one kept from
  // before (read while Halo was still logged in) must not end it.
  const { autoPaused } = await get('autoPaused');
  if (autoPaused && (!autoPaused.at || !readAt || readAt > autoPaused.at)) await setPaused(null);
  const { tier } = await get('tier');
  if (AUTO.includes(tier)) await chrome.alarms.create(ALARM, { when: Date.now() + PERIOD_MINUTES * 60_000, periodInMinutes: PERIOD_MINUTES });
  const { setup } = await get('setup');
  if (!setup || setup.phase !== 'done') {
    await chrome.action.setBadgeText({ text: '' });
    void updateBadge();
  }
}

/**
 * How a sync ended, told to every open Halo+ tab (0.6.5): the banner's Sync now shows it instead of "Syncing…" forever.
 * { ok: true, at } when it reached the account; { ok: false, kind, why } when it did not, in the words the popup uses.
 */
async function tellTabs(result) {
  const tabs = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` });
  const { kind: errorKind = null, ...rest } = result;
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { ...rest, kind: 'sync-result', errorKind }).catch(() => undefined);
}

/** One step of a running sync ("Reading BIO-181, 2 of 6"), to every open Halo+ tab. */
async function progressToTabs(text) {
  const tabs = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { kind: 'sync-progress', text: String(text || '') }).catch(() => undefined);
}

/** Tells every open Halo+ tab a sync is waiting in the account, so it takes it now. */
async function pingTabs() {
  const tabs = await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { kind: 'pending' }).catch(() => undefined);
  return tabs;
}

/** An export kept here goes to the account the moment there is a key to send it with. */
async function sendWaiting() {
  const { waiting } = await get('waiting');
  if (!waiting) return;
  const saved = await toAccount(waiting);
  if (!saved.ok) return;
  await chrome.storage.local.remove('waiting');
  await markLanded(waiting.exportedAt, 'account');
  await pingTabs();
}

async function finish(payload, auto, quiet = false, first = false) {
  payload.auto = auto;
  const readAt = payload.exportedAt || new Date().toISOString();
  await set({ lastCounts: countsOf(payload) });
  // What this reading of Halo says, small, for Halo+ on Halo between visits to Halo+ (0.8.0).
  try {
    await set({ haloLive: globalThis.HaloPlusModel.compactLive(payload) });
    void updateBadge();
  } catch {
    /* never fails a sync */
  }
  const r = await land(payload, auto, quiet);
  if (r.landed) {
    await markLanded(readAt, r.how);
    // The first sync (George, 2026-10-21): back to Halo+, showing the payoff, and the popup says it is done.
    if (first && !auto) {
      await focusDash();
      await setupState('done');
    }
    return r;
  }
  const at = clock(readAt);
  const text =
    r.kind === 'no-key'
      ? `Read Halo at ${at}, but it could not go to your account yet: open Halo+ on this computer, signed in, and it goes in.`
      : r.kind === 'offline'
        ? `Read Halo at ${at}, but your Halo+ account could not be reached (no connection). It is kept here and goes in when Halo+ opens.`
        : `Read Halo at ${at}, but it did not reach your account: ${String(r.why || 'unknown error').replace(/\.$/, '')}. It is kept here; press Sync now to try again.`;
  await set({ lastError: r.kind === 'foreign' ? r.why : text, lastErrorKind: r.kind === 'foreign' ? (r.offer ? 'move' : 'foreign') : 'not-landed', lastErrorAt: new Date().toISOString() });
  void tellTabs({ ok: false, kind: r.kind === 'foreign' ? (r.offer ? 'move' : 'foreign') : r.kind || 'not-landed', why: r.kind === 'foreign' ? r.why : text, auto });
  if (r.kind === 'foreign') return r;
  // Never landed (kept in the extension). No key yet is setup, not a fault.
  if (r.kind !== 'no-key') void reportError({ title: 'Extension sync did not reach the account', message: r.why || r.kind, place: auto ? 'scheduled sync' : 'sync now', details: { kind: r.kind || 'unknown', auto } });
  if (!auto && !quiet) await chrome.action.setBadgeText({ text: '!' });
  return r;
}

/** Hands an export to one open Halo+ tab; true when the app said it has it. */
async function handTo(tab, payload) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { kind: 'deliver', payload });
      if (r && r.ok) return true;
    } catch {
      /* the content script is not there yet */
    }
    await sleep(1000);
  }
  return false;
}

async function openDash() {
  const tab = await chrome.tabs.create({ url: DASH_URL, active: true });
  await waitForLoad(tab.id);
  await sleep(1200);
  return tab;
}

/**
 * The account first; an open Halo+ tab is told to take it now. Sync now also brings Halo+ to the front. Without the
 * account: an open tab by hand, or, for Sync now, a new Halo+ tab; a scheduled sync that has neither waits here.
 */
async function land(payload, auto, quiet = false) {
  // A sync after a submission on Halo never brings Halo+ forward: it is told, and takes it, in the background.
  const front = !auto && !quiet;
  const saved = await toAccount(payload);
  if (saved.ok) {
    await chrome.storage.local.remove('waiting');
    const tabs = await pingTabs();
    if (front) {
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true }).catch(() => undefined);
      } else await chrome.tabs.create({ url: DASH_URL, active: true }).catch(() => undefined);
    }
    return { landed: true, how: 'account' };
  }
  if (saved.kind === 'foreign') {
    // This Halo is linked to another Halo+ account: it goes nowhere, not into a tab, not kept (0.6.2). When the server
    // kept a move offer, an open Halo+ tab is told to look now (and brought forward on Sync now) so it can ask (0.6.4).
    await chrome.storage.local.remove(['waiting', 'waitingKey']);
    await set({ lastError: saved.why, lastErrorKind: saved.offer ? 'move' : 'foreign' });
    if (saved.offer) {
      const tabs = await pingTabs();
      if (front) {
        if (tabs[0]) {
          await chrome.tabs.update(tabs[0].id, { active: true });
          await chrome.windows.update(tabs[0].windowId, { focused: true }).catch(() => undefined);
        } else await chrome.tabs.create({ url: DASH_URL, active: true });
      }
    }
    return { landed: false, kind: 'foreign', why: saved.why, offer: !!saved.offer };
  }
  let tab = (await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }))[0] ?? null;
  if (tab && front) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  if (!tab && front) tab = await openDash();
  if (tab && (await handTo(tab, payload))) return { landed: true, how: 'tab' };
  // Kept for the account whose key was in hand when it was read: another account's key never takes it (0.6.2).
  const { syncKey: keyNow } = await get('syncKey');
  await set({ waiting: payload, waitingKey: keyNow || null });
  return { landed: false, kind: saved.kind, why: saved.why };
}
