// The service worker. Every three hours while Chrome is open (plans that sync: Plus and up), or at once from the popup's
// Sync now, it runs the same sync the bookmark runs on a Halo page (the student's own Halo tab if one is open,
// otherwise one it opens quietly in the background and closes after) and carries the export to Halo+.
//
// It never interrupts (George, 2026-09-30): a scheduled sync opens no window, focuses nothing and shows no review
// sheet (the app applies it quietly with an Undo note). If no Halo+ tab is open, the export waits here and is handed
// over the next time Halo+ opens. Logged out of Halo is not an error to nag about: the popup says so, and the next
// scheduled run tries again.
import { DASH_ORIGIN, DASH_URL, PERIOD_MINUTES } from './config.js';

const PAID = ['plus', 'pro', 'max'];
const HALO = 'https://halo.gcu.edu/';
const ALARM = 'auto-sync';
// A real account takes minutes to read: the worker waits as long as the sync keeps reporting progress, and gives up
// after two minutes of silence or fifteen in all (2026-09-30: a fixed 90 seconds cut real syncs off).
const SILENT_MS = 120_000;
const MAX_MS = 15 * 60_000;
const state = { pending: null, fail: null, running: false, lastProgressAt: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

// ---- the schedule ---------------------------------------------------------------------------------------------------
async function ensureSchedule() {
  const { lastSyncAt } = await get('lastSyncAt');
  const due = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > PERIOD_MINUTES * 60_000;
  const alarm = await chrome.alarms.get(ALARM);
  // Overdue (Chrome was closed past the time): one run shortly after start, then every three hours from there.
  if (due) await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MINUTES });
  else if (!alarm) await chrome.alarms.create(ALARM, { when: new Date(lastSyncAt).getTime() + PERIOD_MINUTES * 60_000, periodInMinutes: PERIOD_MINUTES });
}
chrome.runtime.onInstalled.addListener(() => void ensureSchedule());
chrome.runtime.onStartup.addListener(() => void ensureSchedule());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { tier, lastSyncAt } = await get(['tier', 'lastSyncAt']);
  if (!PAID.includes(tier)) return;
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
  } else if (msg.kind === 'halo-progress') {
    state.lastProgressAt = Date.now();
    void set({ progress: msg.text });
    reply({ ok: true });
  } else if (msg.kind === 'halo-failed') {
    if (state.fail) state.fail(msg.text);
    reply({ ok: true });
  } else if (msg.kind === 'halo-export') {
    if (state.pending) state.pending(msg.payload);
    // The worker was restarted while Halo was being read (Chrome stops idle workers): the export still goes through.
    else void finish(msg.payload, true);
    reply({ ok: true });
  } else if (msg.kind === 'take-waiting') {
    // A Halo+ tab just opened: hand it the export a scheduled sync kept for it.
    void get('waiting').then(({ waiting }) => {
      if (waiting) void chrome.storage.local.remove('waiting');
      // Older than half a day: the next sync is fresher than this one, so it is dropped rather than applied late.
      const fresh = waiting && Date.now() - new Date(waiting.exportedAt).getTime() < 12 * 3_600_000;
      reply({ payload: fresh ? waiting : null });
    });
    return true;
  } else if (msg.kind === 'sync-now') {
    // The popup's button: runs at once on any plan (the app explains a plan without sync). The popup follows along
    // through storage, so the reply does not wait for the sync.
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
  if (/stopped answering|did not answer/i.test(s)) return { kind: 'stalled', text: 'Halo stopped answering partway through. Press Sync now to try again.', quiet: false };
  if (/Halo\+ tab|dashboard/i.test(s)) return { kind: 'delivery', text: s, quiet: false };
  return { kind: 'other', text: `Halo sync failed: ${s.replace(/^Halo sync failed:\s*/i, '')}`, quiet: false };
}

async function runSync({ auto }) {
  if (state.running) return;
  state.running = true;
  await set({ running: true, runningSince: new Date().toISOString(), runningAuto: auto, progress: 'Opening Halo…' });
  let haloTab = null;
  let opened = false;
  try {
    // The student's own Halo tab when there is one; otherwise one quietly in the background: never active, never a
    // new window, muted, closed when done.
    haloTab = (await chrome.tabs.query({ url: `${HALO}*` })).find((t) => !t.discarded) ?? null;
    if (!haloTab) {
      haloTab = await chrome.tabs.create({ url: HALO, active: false, index: 9999 });
      opened = true;
      await chrome.tabs.update(haloTab.id, { muted: true }).catch(() => undefined);
      await waitForLoad(haloTab.id);
      await sleep(1500);
      haloTab = await chrome.tabs.get(haloTab.id);
    }
    // Halo sent the tab to its login page: logged out.
    if (!isHalo(haloTab.url ?? haloTab.pendingUrl)) return await failed(explain('logged out'), auto);
    state.lastProgressAt = Date.now();
    const started = Date.now();
    const payload = await new Promise((resolve) => {
      // Checking in keeps this worker alive while it waits.
      const watch = setInterval(() => {
        void chrome.runtime.getPlatformInfo();
        if (Date.now() - state.lastProgressAt > SILENT_MS || Date.now() - started > MAX_MS) {
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
      chrome.scripting.executeScript({ target: { tabId: haloTab.id }, files: ['sync-inject.js'], world: 'MAIN' }).catch((e) => {
        clearInterval(watch);
        resolve({ error: e && e.message ? e.message : String(e) });
      });
    });
    if (!payload || payload.error) return await failed(explain(payload && payload.error), auto);
    await finish(payload, auto);
  } finally {
    state.pending = null;
    state.fail = null;
    state.running = false;
    if (opened && haloTab) chrome.tabs.remove(haloTab.id).catch(() => undefined);
    await set({ running: false, progress: null });
  }
}

async function failed(e, auto) {
  await set({ lastError: e.text, lastErrorKind: e.kind, lastErrorAt: new Date().toISOString() });
  // Nothing to nag about when logged out or offline; a Sync now that failed shows a mark until the popup is opened.
  if (!auto && !e.quiet) await chrome.action.setBadgeText({ text: '!' });
}

async function finish(payload, auto) {
  payload.auto = auto;
  // Every sync restarts the three hours from now: a Sync now just after install otherwise left the first alarm a
  // minute away, and the popup said "Last synced 2:19 AM · Next sync around 2:19 AM" (2026-09-30).
  await chrome.alarms.create(ALARM, { when: Date.now() + PERIOD_MINUTES * 60_000, periodInMinutes: PERIOD_MINUTES });
  const where = await deliver(payload, auto);
  await set({
    lastSyncAt: new Date().toISOString(),
    lastError: where === 'failed' ? 'Halo+ did not take the sync. Open Halo+ and press Sync now again.' : null,
    lastErrorKind: where === 'failed' ? 'delivery' : null,
    lastCounts: { classes: payload.classes.length, assignments: payload.classes.reduce((n, c) => n + (c.assessments || []).length, 0) },
  });
  await chrome.action.setBadgeText({ text: '' });
}

/** To an open Halo+ tab (focused only for Sync now); with none open, a scheduled sync waits here, Sync now opens one. */
async function deliver(payload, auto) {
  let tab = (await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }))[0] ?? null;
  if (!tab) {
    if (auto) {
      await set({ waiting: payload });
      return 'waiting';
    }
    tab = await chrome.tabs.create({ url: DASH_URL, active: true });
    await waitForLoad(tab.id);
    await sleep(1200);
  } else if (!auto) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { kind: 'deliver', payload });
      if (r && r.ok) return 'delivered';
    } catch {
      /* the content script is not there yet */
    }
    await sleep(1000);
  }
  if (auto) {
    await set({ waiting: payload });
    return 'waiting';
  }
  return 'failed';
}
