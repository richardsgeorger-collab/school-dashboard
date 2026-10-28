// The common part of every Halo+-on-Halo test (extension 0.12.0): a browser (Chrome or Edge) with the extension (and
// Better Halo, its Web Store build unpacked at BH_DIR, when asked), Halo's stand-in pages (lib/haloPages.mjs), the
// demo student's data in the extension as a sync would leave it, and nothing sent anywhere real.
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep, until } from './haloStandIn.mjs';
import { onHaloFixture, standIn } from './haloPages.mjs';

export const EXT = resolve(process.env.EXT_DIR ?? 'extension');
export const BROWSER = process.env.BROWSER ?? 'chrome';
const BH = process.env.BH_DIR ? resolve(process.env.BH_DIR) : null;
export const bhPath = BH && existsSync(join(BH, 'manifest.json')) ? BH : null;

export function checker(prefix) {
  const checks = [];
  const check = (ok, line) => {
    checks.push(!!ok);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${prefix}: ${line}`);
  };
  return { checks, check, passed: () => checks.length > 0 && checks.every(Boolean) };
}

/**
 * One browser for one run. `bh`: load Better Halo; `bhDark`: its dark theme (catppuccin). Returns helpers: `page(url,
 * {width, scheme})`, `store(obj)` into the extension's storage, `seed(extra)` with the demo student's data, `close()`.
 */
export async function openBench({ label, fx = onHaloFixture(), bh = false, bhDark = false, pages = {}, gateway = {}, rest = [], badges = null }) {
  const { browser, ctx, proc, load } = await launch(BROWSER, label);
  const bench = await standIn(ctx, fx, { bh, badges, pages, gateway, rest });
  await ctx.route('**/functions/v1/report', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await ctx.route('**/functions/v1/sync-drop', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }));
  await ctx.route('https://haloplus.app/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Halo+</title>' }));
  // A browser that goes away on its own, or a page that crashes, says so (a test then fails with "closed").
  let closing = false;
  browser.on('disconnected', () => closing || console.log(`(the ${BROWSER} browser went away on its own)`));
  ctx.on('page', (pg) => pg.on('crash', () => console.log(`(a page crashed: ${pg.url()})`)));
  const { worker } = await load(EXT);
  let bhWorker = null;
  if (bh && bhPath) {
    bhWorker = (await load(bhPath)).worker;
    if (bhDark && bhWorker) await bhWorker.evaluate(() => chrome.storage.sync.set({ theme: 'catppuccin', themeVariant: 'dark' })).catch(() => undefined);
  }
  if (bh && bhDark)
    await ctx.addInitScript(() => {
      if (location.hostname !== 'halo.gcu.edu') return;
      localStorage.setItem('better-halo-initial-theme', 'catppuccin');
      localStorage.setItem('better-halo-initial-dark', '1');
    });
  const store = (o) => worker.evaluate((x) => chrome.storage.local.set(x), o);
  const read = (keys) => worker.evaluate((k) => chrome.storage.local.get(k), keys);
  const seed = async (extra = {}) => {
    await store({ tier: 'max', lastSyncAt: fx.now, syncKey: 'a'.repeat(48), haloSnap: fx.snap, haloIndex: fx.index, haloLive: null, haloDone: null, haloMarks: null, haloUiOn: null, haloFeat: null, haloUi: null, haloBase: null, haloGrades: null, haloWeekOpen: null, ...extra });
    await sleep(400);
    for (const pg of ctx.pages()) if (/^https:\/\/haloplus\.app|^chrome-extension:/.test(pg.url())) await pg.close().catch(() => undefined);
  };
  const page = async (url, { width = 1366, height = 900, scheme = 'light' } = {}) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width, height });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(url, { waitUntil: 'load' });
    return p;
  };
  const close = async () => {
    closing = true;
    await browser.close().catch(() => undefined);
    try {
      proc.kill('SIGKILL');
    } catch {
      /* gone */
    }
  };
  return { ctx, bench, worker, bhWorker, store, read, seed, page, close, fx };
}

export function out(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}
export { sleep, until };
