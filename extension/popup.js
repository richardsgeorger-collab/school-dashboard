import { DASH_URL, PERIOD_MINUTES } from './config.js';

const $ = (id) => document.getElementById(id);
$('open').href = DASH_URL;

async function render() {
  const s = await chrome.storage.local.get(['tier', 'lastSyncAt', 'lastError', 'lastCounts']);
  const tier = s.tier || 'free';
  const paid = ['plus', 'pro', 'max'].includes(tier);
  $('tier').textContent = `Plan on this device: ${tier}${paid ? ` · auto-sync every ${PERIOD_MINUTES / 60} hours` : ''}`;
  $('last').textContent = s.lastSyncAt ? `Last sync ${new Date(s.lastSyncAt).toLocaleString()}${s.lastCounts ? ` · ${s.lastCounts.assignments} assignments in ${s.lastCounts.classes} classes` : ''}` : 'Not synced from here yet.';
  $('err').textContent = s.lastError || '';
  $('plus').hidden = paid;
}

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('sync').textContent = 'Syncing…';
  await chrome.runtime.sendMessage({ kind: 'sync-now' });
  $('sync').disabled = false;
  $('sync').textContent = 'Sync now';
  await render();
});

chrome.storage.onChanged.addListener(() => void render());
void render();
