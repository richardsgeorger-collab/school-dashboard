// The popup: when Halo+ last synced and when it syncs next, a big Sync now with real progress, plain errors, and a link
// to Halo+ (George, 2026-09-30). Everything is read from the worker's storage, so it stays current while it is open.
import { DASH_ORIGIN, PERIOD_MINUTES } from './config.js';

const $ = (id) => document.getElementById(id);
const PAID = ['plus', 'pro', 'max'];
const PLAN_NAMES = { plus: 'Plus', pro: 'Pro', max: 'Max' };
$('open').href = `${DASH_ORIGIN}/#/now`;

const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return time(d);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${time(d)}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time(d)}`;
}

/** "Reading CHM-113 (2 of 6)…" → 2/6 of the class-reading part of the bar. */
function fraction(text) {
  const t = text || '';
  // The first steps, before the classes: small, honest steps forward.
  if (/Checking your Halo login/i.test(t)) return 0.03;
  if (/alerts, messages and classes/i.test(t)) return 0.06;
  if (/Sending|Sent/i.test(t)) return 0.98;
  if (/Finishing up|Read \d+ assignment/i.test(t)) return 0.95;
  const m = /\((\d+) of (\d+)\)/.exec(t);
  if (!m) return null;
  const f = Number(m[1]) / Number(m[2]);
  // Classes are most of the time; rubrics and files come after.
  return /rubric|files/i.test(text) ? 0.85 + 0.12 * f : 0.08 + 0.75 * f;
}

async function render() {
  const s = await chrome.storage.local.get(['tier', 'lastSyncAt', 'lastError', 'lastErrorKind', 'lastErrorAt', 'running', 'progress', 'lastCounts', 'syncKey']);
  const alarm = await chrome.alarms.get('auto-sync');
  const paid = PAID.includes(s.tier);

  $('plan').hidden = !paid;
  $('plan').textContent = PLAN_NAMES[s.tier] ?? '';

  const last = s.lastSyncAt ? `Last synced <b>${when(s.lastSyncAt)}</b>` : 'Not synced from here yet';
  // Never earlier than three hours after the last sync: an alarm that fires sooner skips (synced recently).
  const nextAt = alarm ? Math.max(alarm.scheduledTime, s.lastSyncAt ? new Date(s.lastSyncAt).getTime() + PERIOD_MINUTES * 60_000 : 0) : null;
  const next = paid && nextAt ? `<span class="next">Next sync around ${when(new Date(nextAt).toISOString())}</span>` : '';
  $('status').innerHTML = s.running ? (s.lastSyncAt ? `Last synced <b>${when(s.lastSyncAt)}</b><span class="next">Syncing now</span>` : 'Syncing now') : last + next;
  $('plus').hidden = paid || !s.tier;

  $('sync').disabled = !!s.running;
  $('sync').textContent = s.running ? 'Syncing…' : 'Sync now';
  $('progress').hidden = !s.running;
  if (s.running) {
    const f = fraction(s.progress);
    $('fill').style.width = f === null ? '' : `${Math.round(f * 100)}%`;
    $('fill').parentElement.toggleAttribute('data-indeterminate', f === null);
    $('step').textContent = s.progress || 'Opening Halo…';
  }

  // A problem is shown until a later sync lands. "Last synced" above is only ever a sync that reached the account.
  const problem = !s.running && s.lastError && (!s.lastSyncAt || !s.lastErrorAt || s.lastErrorAt > s.lastSyncAt);
  // Without the account's key a sync can only land in an open Halo+ tab: said once, calmly, until Halo+ is opened.
  const noKey = !s.running && !problem && paid && !s.syncKey;
  $('problem').hidden = !problem && !noKey;
  if (noKey) {
    $('problemText').textContent = 'Open Halo+ once on this computer, signed in, so syncs reach your account even when Halo+ is closed.';
    $('problem').dataset.tone = 'calm';
    [$('problemAction').textContent, $('problemAction').href] = ['Open Halo+', `${DASH_ORIGIN}/#/now`];
    $('problemAction').hidden = false;
  }
  if (problem) {
    $('problemText').textContent = s.lastError;
    $('problem').dataset.tone = s.lastErrorKind === 'logged-out' || s.lastErrorKind === 'offline' ? 'calm' : 'alert';
    const action = s.lastErrorKind === 'logged-out' ? ['Log in to Halo', 'https://halo.gcu.edu/'] : s.lastErrorKind === 'delivery' || s.lastErrorKind === 'not-landed' ? ['Open Halo+', `${DASH_ORIGIN}/#/now`] : null;
    $('problemAction').hidden = !action;
    if (action) [$('problemAction').textContent, $('problemAction').href] = action;
  }
}

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('sync').textContent = 'Syncing…';
  $('progress').hidden = false;
  $('fill').parentElement.setAttribute('data-indeterminate', '');
  $('step').textContent = 'Opening Halo…';
  $('problem').hidden = true;
  await chrome.runtime.sendMessage({ kind: 'sync-now' });
});

// Opening the popup is seeing the problem: the toolbar mark goes.
void chrome.action.setBadgeText({ text: '' });
chrome.storage.onChanged.addListener(() => void render());
void render();
