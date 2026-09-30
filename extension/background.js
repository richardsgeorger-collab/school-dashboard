// The service worker. Every three hours while Chrome is open (plans that sync: Plus and up), or at once from the popup's
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
import { DASH_ORIGIN, DASH_URL, DROP_URL, PERIOD_MINUTES } from './config.js';

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
chrome.runtime.onInstalled.addListener(async (d) => {
  // Before 0.3.0 a sync was stamped "Last synced" whether or not it reached Halo+; that time cannot be trusted.
  if (d.reason === 'update' && d.previousVersion && d.previousVersion < '0.3.0') await chrome.storage.local.remove(['lastSyncAt', 'lastError', 'lastErrorKind', 'lastErrorAt']);
  await ensureSchedule();
});
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
  } else if (msg.kind === 'key') {
    // The signed-in account's sync key, from an open Halo+ tab: it can drop a sync into that account and nothing else.
    void set({ syncKey: msg.key || null }).then(() => msg.key && sendWaiting());
    reply({ ok: true });
  } else if (msg.kind === 'landed') {
    // An open Halo+ tab took a kept export by hand.
    void markLanded(msg.exportedAt, 'tab');
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
    // A Halo+ tab just opened: an export kept here goes to the account (the tab takes it from there), or, when the
    // account still cannot be reached, straight to the tab.
    void (async () => {
      if (msg.key) await set({ syncKey: msg.key });
      const { waiting } = await get('waiting');
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
    return { ok: false, kind: 'refused', why };
  } catch (e) {
    await set({ lastDrop: { ...note, ok: false, why: e && e.message ? e.message : String(e) } });
    return { ok: false, kind: 'offline' };
  }
}

/** A sync reached the account (or an open Halo+ tab): now, and only now, it is "Last synced". */
async function markLanded(readAt, how) {
  await set({ lastSyncAt: readAt, lastLanded: how, lastError: null, lastErrorKind: null });
  await chrome.alarms.create(ALARM, { when: Date.now() + PERIOD_MINUTES * 60_000, periodInMinutes: PERIOD_MINUTES });
  await chrome.action.setBadgeText({ text: '' });
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

async function finish(payload, auto) {
  payload.auto = auto;
  const readAt = payload.exportedAt || new Date().toISOString();
  await set({ lastCounts: countsOf(payload) });
  const r = await land(payload, auto);
  if (r.landed) return markLanded(readAt, r.how);
  const at = clock(readAt);
  const text =
    r.kind === 'no-key'
      ? `Read Halo at ${at}, but it could not go to your account yet: open Halo+ on this computer, signed in, and it goes in.`
      : r.kind === 'offline'
        ? `Read Halo at ${at}, but your Halo+ account could not be reached (no connection). It is kept here and goes in when Halo+ opens.`
        : `Read Halo at ${at}, but it did not reach your account: ${String(r.why || 'unknown error').replace(/\.$/, '')}. It is kept here; press Sync now to try again.`;
  await set({ lastError: text, lastErrorKind: 'not-landed', lastErrorAt: new Date().toISOString() });
  if (!auto) await chrome.action.setBadgeText({ text: '!' });
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
async function land(payload, auto) {
  const saved = await toAccount(payload);
  if (saved.ok) {
    await chrome.storage.local.remove('waiting');
    const tabs = await pingTabs();
    if (!auto) {
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true }).catch(() => undefined);
      } else await chrome.tabs.create({ url: DASH_URL, active: true });
    }
    return { landed: true, how: 'account' };
  }
  let tab = (await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }))[0] ?? null;
  if (tab && !auto) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  if (!tab && !auto) tab = await openDash();
  if (tab && (await handTo(tab, payload))) return { landed: true, how: 'tab' };
  await set({ waiting: payload });
  return { landed: false, kind: saved.kind, why: saved.why };
}
