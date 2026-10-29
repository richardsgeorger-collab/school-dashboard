// The popup (0.9.0, George 2026-10-23): Halo+ and the plan, the next graded thing, when the account last took a sync,
// Sync now with real progress, plain errors, the "Show Halo+ on Halo pages" switch, Open Halo+. Nothing empty.
// "Last synced" has one source of truth: the account's last applied sync, as Halo+ itself shows it (sync-drop answers
// it for this computer's key). 0.8.0 showed this extension's own clock, so it said 9:59 PM while Halo+ said 8:12 PM.
import { DASH_ORIGIN, DROP_URL, PERIOD_MINUTES } from './config.js';

const $ = (id) => document.getElementById(id);
const PAID = ['plus', 'pro', 'max'];
// Auto-sync is Max (2026-10-29; Plus, retired, counts as Max). Free syncs whenever the student is on Halo.
const AUTO = ['plus', 'max'];
const PLAN_NAMES = { free: 'Free', plus: 'Max', pro: 'Max', max: 'Max' };
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

const STUCK_MS = 120_000;

/**
 * Setup's own view (George, 2026-10-21): while the first sync runs, "Syncing your classes…"; when it lands, "Done! Back
 * to Halo+" with a button that brings Halo+ to the front; logged out, "Log in to Halo"; not finished, Reload Halo.
 * Shown for 15 minutes after the last step; the everyday view comes back after that, or once "Back to Halo+" is pressed.
 */
function renderSetup(s) {
  const st = s.setup;
  // No account on this computer yet (0.11.0: a Chrome Web Store install that has not signed up): one step, not a Sync
  // now that would read Halo with nowhere to put it.
  const noAccount = !s.syncKey && !s.tier && !s.lastSyncAt && !s.running;
  const live = noAccount || (!!st && Date.now() - Date.parse(st.at || 0) < 15 * 60_000 && ['syncing', 'done', 'login', 'failed'].includes(st.phase));
  $('setup').hidden = !live;
  $('normal').hidden = live;
  if (!live) return;
  if (noAccount) {
    $('setupBar').hidden = true;
    $('setupAlt').hidden = true;
    $('setupTitle').textContent = 'One step left';
    $('setupText').textContent = "Make your free Halo+ account, and your Halo classes come in on their own the next time you're on Halo.";
    [$('setupGo').textContent, $('setupGo').dataset.act, $('setupGo').hidden] = ['Make your free account', 'welcome', false];
    return;
  }
  const phase = st.phase === 'syncing' && !s.running ? (s.lastErrorAt && s.lastErrorAt >= st.at ? 'failed' : 'syncing') : st.phase;
  $('setupBar').hidden = phase !== 'syncing';
  $('setupAlt').hidden = phase !== 'failed';
  if (phase === 'syncing') {
    $('setupTitle').textContent = 'Syncing your classes…';
    const f = fraction(s.progress);
    $('setupFill').style.width = f === null ? '' : `${Math.round(f * 100)}%`;
    $('setupBar').toggleAttribute('data-indeterminate', f === null);
    $('setupText').textContent = s.progress || 'Opening Halo…';
    $('setupGo').hidden = true;
  } else if (phase === 'done') {
    const c = s.lastCounts;
    $('setupTitle').textContent = 'Done!';
    $('setupText').textContent = c ? `${c.assignments} assignments from ${c.classes} class${c.classes === 1 ? '' : 'es'} are in Halo+. It syncs on its own from now on.` : 'Your classes are in Halo+. It syncs on its own from now on.';
    [$('setupGo').textContent, $('setupGo').dataset.act, $('setupGo').hidden] = ['Back to Halo+', 'dash', false];
  } else if (phase === 'login') {
    $('setupTitle').textContent = 'Log in to Halo';
    $('setupText').textContent = "Halo isn't logged in on this computer. Log in, and we'll sync automatically.";
    [$('setupGo').textContent, $('setupGo').dataset.act, $('setupGo').hidden] = ['Log in to Halo', 'login', false];
  } else {
    $('setupTitle').textContent = "Sync didn't finish";
    $('setupText').textContent = 'Try reloading Halo.';
    [$('setupGo').textContent, $('setupGo').dataset.act, $('setupGo').hidden] = ['Reload Halo', 'reload', false];
    $('setupAlt').textContent = 'Try again';
  }
}

/** The account's own answer, kept so the popup opens with it while a fresh one is asked for. */
let server = null;
let asking = null;
let reasks = 0;
async function askServer(key) {
  if (!key || asking) return asking;
  asking = fetch(DROP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, status: true }) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.ok) {
        server = { appliedAt: j.appliedAt, lastDropAt: j.lastDropAt, takenAt: j.takenAt, at: new Date().toISOString() };
        void chrome.storage.local.set({ serverStatus: server });
        // A sync that reached the account but has not gone in yet: an open Halo+ applies it within seconds, so ask
        // again every 5 seconds for a minute while the popup is open.
        const pending = j.lastDropAt && (!j.appliedAt || Date.parse(j.lastDropAt) - Date.parse(j.appliedAt) > 2 * 60_000);
        if (pending && reasks < 12) {
          reasks += 1;
          setTimeout(() => void askServer(key), 5000);
        }
      }
    })
    .catch(() => undefined)
    .finally(() => {
      asking = null;
      void render();
    });
  return asking;
}

/** "Last synced 8:12 PM", or a sync that came in but did not go in, said plainly. */
function lastLine(s) {
  const st = server || s.serverStatus || null;
  if (!s.syncKey) return s.lastSyncAt ? 'Open Halo+ once on this computer to see your account\'s last sync here.' : 'Not synced yet.';
  if (!st) return '';
  const applied = st.appliedAt ? Date.parse(st.appliedAt) : 0;
  const dropped = st.lastDropAt ? Date.parse(st.lastDropAt) : 0;
  const head = applied ? `Last synced <b>${when(st.appliedAt)}</b>` : 'Not synced yet';
  // A sync that arrived well after the last one that went in (10 minutes covers read time vs. arrival).
  if (dropped && dropped - applied > 10 * 60_000) {
    const at = when(st.lastDropAt);
    return `${head}<span class="next">${st.takenAt ? `A sync at ${at} reached Halo+ but didn't go in. Open Halo+ to see it.` : `A sync at ${at} is waiting. It goes in the next time Halo+ is open.`}</span>`;
  }
  return head;
}

/** Next up: the most important graded thing, from what Halo+ and the last sync know. */
function renderNext(s) {
  const M = globalThis.HaloPlusModel;
  const view = M && M.merge(s.haloSnap, s.haloLive, M.doneFrom(s.haloDone, s.haloMarks));
  const p = view && view.plan !== 'free' ? M.peek(view, Date.now()) : null;
  $('next').hidden = !p;
  if (!p) return;
  // Today clear, tomorrow's work next (0.10.1): said as the pill and the peek say it.
  const s2 = M.standing(view, Date.now());
  $('nextHead').textContent = s2.todayDone && s2.tomorrow.length ? "Today's done ✓ · Tomorrow" : 'Next up';
  $('nextTitle').textContent = p.title;
  const tmr = s2.todayDone && s2.tomorrow.length;
  $('nextMeta').textContent = [p.code, tmr ? '' : p.when, p.pts ? `${p.pts} pts` : ''].filter(Boolean).join(' · ');
  $('next').dataset.tone = p.tone === 'red' ? 'red' : '';
  $('next').href = M.link(DASH_ORIGIN, p, 'popup');
}

async function render() {
  const s = await chrome.storage.local.get(['tier', 'lastSyncAt', 'lastError', 'lastErrorKind', 'lastErrorAt', 'running', 'progress', 'progressAt', 'runningSince', 'lastCounts', 'syncKey', 'setup', 'haloSnap', 'haloLive', 'haloDone', 'haloMarks', 'serverStatus']);
  renderSetup(s);
  // "Syncing" is believed only while Halo keeps talking: two minutes of nothing is a sync that stopped (0.6.6).
  const stuck = !!s.running && Date.now() - Date.parse(s.progressAt || s.runningSince || 0) > STUCK_MS;
  if (stuck) s.running = false;
  const alarm = await chrome.alarms.get('auto-sync');
  const paid = PAID.includes(s.tier);
  const auto = AUTO.includes(s.tier);

  $('plan').hidden = !s.tier;
  $('plan').textContent = PLAN_NAMES[s.tier] ?? 'Free';
  renderNext(s);

  const last = lastLine(s);
  // Never earlier than three hours after the last sync: an alarm that fires sooner skips (synced recently).
  const nextAt = alarm ? Math.max(alarm.scheduledTime, s.lastSyncAt ? new Date(s.lastSyncAt).getTime() + PERIOD_MINUTES * 60_000 : 0) : null;
  // Free (0.11.0) has no schedule: it syncs whenever the student is on Halo, and says so.
  const next = auto && nextAt && !/span/.test(last) ? `<span class="next">Syncs on its own, next around ${when(new Date(nextAt).toISOString())}</span>` : s.tier && !auto && !/span/.test(last) ? '<span class="next">Syncs whenever you\'re on Halo</span>' : '';
  $('status').innerHTML = s.running ? `${last.replace(/<span.*$/, '')}<span class="next">Syncing now</span>` : last + next;
  $('status').hidden = !$('status').innerHTML;
  // Free (0.12.12, George 2026-10-29): one line, "Max: $0.99/mo", straight to Max's checkout. Nothing on Max, or
  // before the plan is known.
  $('plus').hidden = auto || !s.tier;
  $('plusText').textContent = '';
  $('upgrade').textContent = 'Max: $0.99/mo';
  $('upgrade').href = `${DASH_ORIGIN}/#/checkout?from=popup`;

  $('sync').disabled = !!s.running;
  $('sync').textContent = s.running ? 'Syncing…' : stuck ? 'Try again' : 'Sync now';
  $('sync').dataset.force = stuck ? '1' : '';
  if (stuck) $('status').innerHTML = `${last.replace(/<span.*$/, '')}<span class="next">The last sync stopped partway: nothing came from Halo for 2 minutes.</span>`;
  $('progress').hidden = !s.running;
  if (s.running) {
    const f = fraction(s.progress);
    $('fill').style.width = f === null ? '' : `${Math.round(f * 100)}%`;
    $('fill').parentElement.toggleAttribute('data-indeterminate', f === null);
    $('step').textContent = s.progress || 'Opening Halo…';
  }

  // A problem is shown until a later sync lands.
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
    // Something only the student can do in Halo+ (move this Halo here, sign in there): said as exactly that.
    const inHaloPlus = s.lastErrorKind === 'move' || s.lastErrorKind === 'no-key';
    $('problemText').textContent = inHaloPlus ? `Waiting for you in Halo+. ${s.lastError}` : s.lastError;
    $('problem').dataset.tone = s.lastErrorKind === 'logged-out' || s.lastErrorKind === 'offline' ? 'calm' : 'alert';
    const action = s.lastErrorKind === 'logged-out' ? ['Log in to Halo', 'https://halo.gcu.edu/'] : s.lastErrorKind === 'delivery' || s.lastErrorKind === 'not-landed' || s.lastErrorKind === 'move' ? ['Open Halo+', `${DASH_ORIGIN}/#/now`] : null;
    $('problemAction').hidden = !action;
    if (action) [$('problemAction').textContent, $('problemAction').href] = action;
  }
  // The account's answer, asked once on open and again after each sync this computer ran.
  if (s.syncKey && (!server || (s.lastSyncAt && Date.parse(s.lastSyncAt) > Date.parse(server.at)))) void askServer(s.syncKey);
}

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('sync').textContent = 'Syncing…';
  $('progress').hidden = false;
  $('fill').parentElement.setAttribute('data-indeterminate', '');
  $('step').textContent = 'Opening Halo…';
  $('problem').hidden = true;
  await chrome.runtime.sendMessage({ kind: 'sync-now', force: $('sync').dataset.force === '1' });
});

$('setupGo').addEventListener('click', async () => {
  const act = $('setupGo').dataset.act;
  if (act === 'dash') {
    await chrome.runtime.sendMessage({ kind: 'focus-dash' });
    window.close();
  } else if (act === 'login') {
    await chrome.tabs.create({ url: 'https://halo.gcu.edu/', active: true });
    window.close();
  } else if (act === 'reload') {
    await chrome.runtime.sendMessage({ kind: 'reload-sync', setup: true });
  } else if (act === 'welcome') {
    await chrome.tabs.create({ url: `${DASH_ORIGIN}/#/welcome?src=store`, active: true });
    window.close();
  }
});
$('setupAlt').addEventListener('click', () => void chrome.runtime.sendMessage({ kind: 'sync-now', force: true }));

// Opening the popup is seeing the problem: the toolbar mark goes.
// "Show Halo+ on Halo pages" (0.8.0): on unless turned off here or in Halo+ (whichever changed last).
void chrome.storage.local.get(['haloUiOn', 'haloSnap', 'badgeShown']).then(({ haloUiOn, haloSnap, badgeShown }) => {
  const fromApp = haloSnap && haloSnap.v === 1 ? { on: haloSnap.show !== false, at: haloSnap.showAt || '' } : { on: true, at: '' };
  const on = haloUiOn && haloUiOn.at > fromApp.at ? haloUiOn.on !== false : fromApp.on;
  $('onHalo').checked = on;
  void feats();
  // Opened while the toolbar showed today's count: counted for Admin.
  if (badgeShown) void chrome.runtime.sendMessage({ kind: 'halo-ui', event: 'badge-click' }).catch(() => undefined);
});
$('onHalo').addEventListener('change', () => {
  void chrome.storage.local.set({ haloUiOn: { on: $('onHalo').checked, at: new Date().toISOString() } });
  void feats();
});

// One switch per Halo+-on-Halo feature (0.12.0), under "Show Halo+ on Halo pages", while that is on, for any account
// (Free since 0.12.12). Whichever list changed last wins, here or in Halo+.
async function feats() {
  const { tier, haloFeat, haloSnap } = await chrome.storage.local.get(['tier', 'haloFeat', 'haloSnap']);
  const box = $('feats');
  const list = globalThis.HaloPlusOnFeatures || [];
  box.hidden = !$('onHalo').checked || !tier || !list.length;
  if (box.hidden) return;
  const snap = haloSnap && haloSnap.hf ? haloSnap.hf : null;
  const off = haloFeat && (!snap || !snap.at || haloFeat.at > snap.at) ? haloFeat.off || [] : (snap && snap.off) || [];
  const wrap = $('featList');
  if (wrap.childElementCount !== list.length) {
    wrap.textContent = '';
    for (const [id, label] of list) {
      const row = document.createElement('label');
      row.className = 'feat';
      const span = document.createElement('span');
      // Search's shortcut is ⌘K on a Mac.
      span.textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? label.replace('(Ctrl+K)', '(⌘K)') : label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.dataset.id = id;
      input.addEventListener('change', () => {
        const now = [...wrap.querySelectorAll('input')].filter((i) => !i.checked).map((i) => i.dataset.id);
        void chrome.storage.local.set({ haloFeat: { off: now, at: new Date().toISOString() } });
      });
      row.append(span, input);
      wrap.append(row);
    }
  }
  for (const input of wrap.querySelectorAll('input')) input.checked = !off.includes(input.dataset.id);
}
void feats();

// A setup still running keeps its mark on the icon.
// Today's due count stays (0.8.0): only the "!" of a failed Sync now goes.
void chrome.storage.local.get(['setup', 'badgeShown']).then(({ setup, badgeShown }) => {
  if ((!setup || setup.phase !== 'syncing') && !badgeShown) void chrome.action.setBadgeText({ text: '' });
});
chrome.storage.onChanged.addListener(() => {
  void render();
  void feats();
});
// Re-checked while open, so a sync that goes quiet turns into "stopped partway" without reopening the popup.
setInterval(() => void render(), 10_000);
void render();
