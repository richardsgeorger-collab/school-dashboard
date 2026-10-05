// The extension setup's last step with the real extension (George, 2026-10-04). Chromium started by hand; Halo+ (a
// local build at haloplus.app) is open on the setup's Connect step for a Plus throwaway; then this repo's extension is
// installed into that Chrome (DevTools Extensions.loadUnpacked), exactly as a student pressing Add to Chrome. Since
// 0.5.2 it adds its script to the open Halo+ tab at once: the page shows the check without a reload, asks for the
// first sync, and the sync lands in the account. Halo is faked.
//   KEYS_ENV=... [EXT_DIR=extension] [LOCAL_SITE=dist-site] node scripts/e2e-ext-setup-real.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const EXT = resolve(process.env.EXT_DIR ?? 'extension');
const LOCAL_SITE = process.env.LOCAL_SITE ?? 'dist-site';
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const classes = { getCourseClassesForUser: { courseClasses: [{ id: 'hc-chm', classCode: 'CHM-113-WF700A', slugId: 'CHM-113-WF700A-20260908', startDate: '2026-09-08', endDate: '2026-12-20', name: 'General Chemistry I-Lecture', stage: 'CURRENT', modality: 'ONGROUND', credits: 3, courseCode: 'CHM-113', units: [{ id: 'u1', title: 'Topic 5', sequence: 1, startDate: day(-5), endDate: day(9), assessments: [{ id: 'as1', sequence: 1, title: 'Topic 5 Homework', description: '', startDate: day(-3), dueDate: day(3), points: 20, type: 'ASSIGNMENT', tags: [], requiresLopesWrite: false, isGroupEnabled: false, inPerson: false }] }] }] } };

const who = await kit.persona('plus');
const s0 = (await db.from('settings').select('data').eq('user_id', who.id).single()).data.data;
await db.from('settings').update({ data: { ...s0, lastPull: { ...(s0.lastPull ?? {}), via: 'bookmark' }, updatedAt: new Date().toISOString() } }).eq('user_id', who.id);

const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(chromium.executablePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'haloplus-setup-'))}`, '--enable-unsafe-extension-debugging', '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
try {
  await ctx.route('https://haloplus.app/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    let file = join(LOCAL_SITE, path || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(LOCAL_SITE, 'index.html');
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.route('https://halo.gcu.edu/**', (route) => (route.request().url().includes('/api/auth/session') ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authToken: 'A', contextToken: 'C' }) }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo</title><main>Halo (test)</main>' })));
  await ctx.route('https://gateway.halo.gcu.edu/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData() || '{}');
    const data = body.operationName === 'getCourseClassesForUser' ? classes : null;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(data ? { data } : { errors: [{ message: 'not in the test gateway' }] }) });
  });
  await ctx.addInitScript(({ ses, key }) => { if (location.hostname === 'haloplus.app' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: who.session, key: `sb-${ref}-auth-token` });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://haloplus.app/#/now', { waitUntil: 'load' });
  await p.waitForSelector('.ext-setup-sheet', { timeout: 30000 });
  await p.click('.ext-setup-sheet button:has-text("Set it up")');
  for (const b of ["I've added it", 'Next', "I'm logged in"]) { await p.click(`.ext-setup-sheet button:has-text("${b}")`); await sleep(400); }
  check(/Looking for the extension/.test(await p.locator('.ext-setup-sheet').innerText()), 'Halo+ is on the Connect step, with no extension yet');
  const t0 = Date.now();
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const seen = await until(() => p.locator('.ext-check').count(), 20000, 500);
  check(!!seen && /First sync running|First sync done/.test(await p.locator('.ext-setup-sheet').innerText()), `installed with Halo+ open: the check shows without a reload (${Math.round((Date.now() - t0) / 1000)} s)`);
  const landed = await until(async () => (await db.from('pending_syncs').select('created_at, payload->>source').eq('user_id', who.id).gte('created_at', new Date(t0).toISOString()).limit(1)).data?.[0] ?? null, 90000, 2000);
  check(!!landed && landed.source === 'extension', `the first sync ran and landed in the account (${landed ? Math.round((Date.parse(landed.created_at) - t0) / 1000) : '–'} s after the install)`);
  await p.screenshot({ path: 'docs/screens/ext-setup/6b-done-real-extension-light.png' });
} finally {
  await browser.close().catch(() => undefined);
  proc.kill();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
