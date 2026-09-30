// The service worker. On a schedule or when Halo opens (plans that sync: Plus and up), or on the popup's button, it opens Halo in a background
// tab, runs the same sync script the bookmark runs, carries the export to the dashboard tab, and closes what it
// opened. If Halo is not logged in, the sync script says so and nothing is sent.
import { DASH_ORIGIN, DASH_URL, PERIOD_MINUTES } from './config.js';

const PAID = ['plus', 'pro', 'max'];
const state = { pending: null, fail: null, running: false, progress: null, lastProgressAt: 0 };
// A real account (six classes, rubrics, feedback, announcements) takes minutes to read. The worker waits as long as the
// sync script keeps reporting progress, and gives up only after this long with no word from it (2026-09-30: a fixed
// 90 seconds cut real syncs off with "Halo did not answer").
const SILENT_MS = 120_000;
const MAX_MS = 15 * 60_000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('auto-sync', { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'auto-sync') return;
  const { tier } = await chrome.storage.local.get('tier');
  if (!PAID.includes(tier)) return;
  await runSync({ auto: true });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg) return;
  if (msg.kind === 'tier') {
    void chrome.storage.local.set({ tier: msg.tier });
    reply({ ok: true });
  } else if (msg.kind === 'halo-progress') {
    state.progress = msg.text;
    state.lastProgressAt = Date.now();
    void setBadge('…', msg.text);
    reply({ ok: true });
  } else if (msg.kind === 'halo-failed') {
    if (state.fail) state.fail(msg.text);
    reply({ ok: true });
  } else if (msg.kind === 'halo-export') {
    if (state.pending) state.pending(msg.payload);
    // The worker was restarted while Halo was being read (Chrome stops idle workers): the export still goes through.
    else void finish(msg.payload, true);
    reply({ ok: true });
  } else if (msg.kind === 'sync-now') {
    // From the popup (by hand) or from the Halo page itself when it was just opened (auto). Halo sync is part of Plus
    // (2026-09-28): sync-on-open runs only on a plan that syncs; by hand it runs, and the app explains a paused plan.
    void chrome.storage.local.get('tier').then(({ tier }) => {
      if (msg.auto && !PAID.includes(tier)) return reply({ ok: false, why: 'plan' });
      return runSync({ auto: !!msg.auto }).then(() => reply({ ok: true }));
    });
    return true;
  }
});

const waitForLoad = (tabId) =>
  new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(tabId, { status: 'complete' })).catch(() => undefined);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setBadge(text, title) {
  await chrome.action.setBadgeText({ text });
  if (title) await chrome.action.setTitle({ title });
}

async function runSync({ auto }) {
  await setBadge('…', 'Syncing Halo');
  if (state.running) return;
  state.running = true;
  let haloTab = (await chrome.tabs.query({ url: 'https://halo.gcu.edu/*' }))[0] ?? null;
  const opened = !haloTab;
  if (!haloTab) {
    // A tab this worker opens must not trigger sync-on-open itself.
    await chrome.storage.local.set({ openedBySync: true });
    haloTab = await chrome.tabs.create({ url: 'https://halo.gcu.edu/', active: false });
    await waitForLoad(haloTab.id);
    await sleep(1500);
  }
  state.progress = null;
  state.lastProgressAt = Date.now();
  const started = Date.now();
  const payload = await new Promise(async (resolve) => {
    // Checking in keeps this worker alive (an extension API call resets Chrome's idle timer) and ends the wait only
    // when the script has gone quiet for SILENT_MS or the whole run passes MAX_MS.
    const watch = setInterval(() => {
      void chrome.runtime.getPlatformInfo();
      if (Date.now() - state.lastProgressAt > SILENT_MS || Date.now() - started > MAX_MS) {
        clearInterval(watch);
        resolve(null);
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
    try {
      await chrome.scripting.executeScript({ target: { tabId: haloTab.id }, files: ['sync-inject.js'], world: 'MAIN' });
    } catch (e) {
      clearInterval(watch);
      resolve({ error: e && e.message ? e.message : String(e) });
    }
  });
  state.pending = null;
  state.fail = null;
  state.running = false;
  if (opened) {
    chrome.tabs.remove(haloTab.id).catch(() => undefined);
    await chrome.storage.local.set({ openedBySync: false });
  }
  if (!payload || payload.error) {
    const why = payload && payload.error ? payload.error : state.progress ? `Halo stopped answering while: ${state.progress}` : 'Halo did not answer. Are you logged in there?';
    await chrome.storage.local.set({ lastError: why, lastErrorAt: new Date().toISOString() });
    await setBadge('!', why);
    return;
  }
  await finish(payload, auto);
}

async function finish(payload, auto) {
  const delivered = await deliver(payload, auto);
  await chrome.storage.local.set({ lastSyncAt: new Date().toISOString(), lastError: delivered ? null : 'The dashboard tab did not take the export.', lastCounts: { classes: payload.classes.length, assignments: payload.classes.reduce((n, c) => n + (c.assessments || []).length, 0) } });
  await setBadge(delivered ? '' : '!', delivered ? 'Halo+' : 'The dashboard tab did not take the export.');
}

async function deliver(payload, auto) {
  let tab = (await chrome.tabs.query({ url: `${DASH_ORIGIN}/*` }))[0] ?? null;
  if (!tab) {
    tab = await chrome.tabs.create({ url: DASH_URL, active: !auto });
    await waitForLoad(tab.id);
    await sleep(1200);
  } else if (!auto) {
    await chrome.tabs.update(tab.id, { active: true });
  }
  for (let attempt = 0; attempt < 5; attempt++) {
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
