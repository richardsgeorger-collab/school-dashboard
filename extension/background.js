// The service worker. On a schedule (Plus and up) or on the popup's button (anyone), it opens Halo in a background
// tab, runs the same sync script the bookmark runs, carries the export to the dashboard tab, and closes what it
// opened. If Halo is not logged in, the sync script says so and nothing is sent.
import { DASH_ORIGIN, DASH_URL, PERIOD_MINUTES } from './config.js';

const PAID = ['plus', 'pro', 'max'];
const state = { pending: null };

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
  } else if (msg.kind === 'halo-export') {
    if (state.pending) state.pending(msg.payload);
    reply({ ok: true });
  } else if (msg.kind === 'sync-now') {
    void runSync({ auto: false }).then(() => reply({ ok: true }));
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
  let haloTab = (await chrome.tabs.query({ url: 'https://halo.gcu.edu/*' }))[0] ?? null;
  const opened = !haloTab;
  if (!haloTab) {
    haloTab = await chrome.tabs.create({ url: 'https://halo.gcu.edu/', active: false });
    await waitForLoad(haloTab.id);
    await sleep(1500);
  }
  const payload = await new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve(null), 90_000);
    state.pending = (p) => {
      clearTimeout(timer);
      resolve(p);
    };
    try {
      await chrome.scripting.executeScript({ target: { tabId: haloTab.id }, files: ['sync-inject.js'], world: 'MAIN' });
    } catch (e) {
      clearTimeout(timer);
      resolve({ error: e && e.message ? e.message : String(e) });
    }
  });
  state.pending = null;
  if (opened) chrome.tabs.remove(haloTab.id).catch(() => undefined);
  if (!payload || payload.error) {
    const why = payload && payload.error ? payload.error : 'Halo did not answer. Are you logged in there?';
    await chrome.storage.local.set({ lastError: why, lastErrorAt: new Date().toISOString() });
    await setBadge('!', why);
    return;
  }
  const delivered = await deliver(payload, auto);
  await chrome.storage.local.set({ lastSyncAt: new Date().toISOString(), lastError: delivered ? null : 'The dashboard tab did not take the export.', lastCounts: { classes: payload.classes.length, assignments: payload.classes.reduce((n, c) => n + (c.assessments || []).length, 0) } });
  await setBadge(delivered ? '' : '!', delivered ? 'School Dashboard' : 'The dashboard tab did not take the export.');
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
