// Halo's pages as stand-ins for the extension's tests on Halo (e2e-halo-presence, e2e-halo-week), built from what Halo's
// own code and George's real pages show (2026-10-23/24): Student Home has Halo's tabs ("Current classes") above a grid
// of CourseCard cards (MUI Paper: Better Halo's themes restyle them), each with a /courses/<slug> link, a rule and the
// dates; Better Halo (another extension) puts "Upcoming Assignments" before the rule. ClassDetails cards (a "Topic N"
// badge before the code), a topic page, and a plain other page (Calendar). Made-up classes only (the demo student).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const until = async (fn, ms, every = 300) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(every);
  }
  return null;
};

export const haloShell = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Halo</title><style>
:root{color-scheme:light dark}
body{margin:0;font:14px/1.45 "Open Sans",Arial,sans-serif;background:#f4f4f7;color:#212121}
@media (prefers-color-scheme: dark){body{background:#17171c;color:#e6e6ea}.ClassDetails_containerCard__x{background:#23232b!important;border-color:#3a3a46!important}.ClassDetails_description__x{color:#c9c9d2!important}.assess{background:#23232b!important;border-color:#3a3a46!important}}
header{position:fixed;top:0;left:0;right:0;height:64px;background:#4b2e83;color:#fff;display:flex;align-items:center;gap:18px;padding:0 24px;z-index:10}
header b{font-size:20px;letter-spacing:.02em} header nav{display:flex;gap:16px;margin-left:24px} header nav a{color:#fff;text-decoration:none;opacity:.9}
main{padding:88px 32px 40px;max-width:1180px}
h2{font-size:22px;margin:0 0 12px;color:#7a5ad0}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
.ClassDetails_containerCard__x{background:#fff;border:1px solid #d6d6de;border-left:6px solid #7a5ad0;border-radius:6px;padding:0 12px 10px}
.ClassDetails_innerButton__jJQws{all:unset;display:block;width:100%;cursor:pointer;padding-top:12px}
.ClassDetails_innerContainer__O93i7 h3{margin:0;font-size:15px;display:flex;align-items:center;gap:8px}
.stage{font-size:11px;font-weight:700;background:#e9e3f8;color:#4b2e83;border-radius:4px;padding:2px 6px}
.ClassDetails_description__x{margin:4px 0 6px;color:#424242;font-size:16px}
.meta{font-size:12px;color:#757575}
.MuiPaper-root{background-color:#fff;color:rgba(0,0,0,.87)}.MuiPaper-rounded{border-radius:4px}
.MuiPaper-elevation1{box-shadow:0 2px 1px -1px rgba(0,0,0,.2),0 1px 1px 0 rgba(0,0,0,.14),0 1px 3px 0 rgba(0,0,0,.12)}
@media (prefers-color-scheme: dark){.MuiPaper-root{background-color:#23232b;color:#e6e6ea}}
.tabs{display:flex;gap:4px;margin:0 0 16px;border-bottom:1px solid #d6d6de}.tabs [role=tab]{all:unset;padding:10px 14px;font-weight:600;color:#616161;cursor:pointer;border-bottom:2px solid transparent}
.tabs [role=tab][aria-selected=true]{color:#4b2e83;border-bottom-color:#4b2e83}
@media (prefers-color-scheme: dark){.tabs{border-color:#3a3a46}.tabs [role=tab]{color:#b9b9c6}.tabs [role=tab][aria-selected=true]{color:#c9b8ff;border-bottom-color:#c9b8ff}}
.CourseCard_cardContainer__ME7dH{display:flex;flex-direction:column;overflow:hidden}
.CourseCard_cardContainer__ME7dH>a{color:inherit;text-decoration:none}.CourseCard_band__x{height:56px;background:linear-gradient(135deg,#4b2e83,#7a5ad0)}
.CourseCard_body__x{padding:10px 14px 4px}.CourseCard_body__x h3{margin:0;font-size:15px}.CourseCard_body__x p{margin:2px 0 0;opacity:.8}
.CourseCard_cardContainer__ME7dH hr{border:0;border-top:1px solid rgba(127,127,127,.25);margin:8px 8px}.CourseCard_foot__x{padding:0 14px 12px;font-size:12px;opacity:.7}
.better-halo-todo-list{margin:4px 14px 0;font-size:12px;opacity:.85}.better-halo-todo-list b{display:block;font-size:12px;color:#7a5ad0}
.clip .CourseCard_cardContainer__ME7dH{height:100px}
.narrow{grid-template-columns:repeat(4,232px)!important}
.assess{background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px 18px;margin:12px 0}.assess h3{margin:0;font-size:16px}.assess p{margin:6px 0 0;color:#616161}
.assess .row{display:flex;align-items:center;gap:12px}.btn{background:#4b2e83;color:#fff;border:0;border-radius:6px;padding:8px 14px}
</style></head><body><div id="__next"><header><b>HALO</b><nav><a href="/">Home</a><a href="/calendar">Calendar</a><a href="#">Inbox</a></nav></header><main>${body}</main></div></body></html>`;

/**
 * Student Home: Halo's tabs, then CourseCard cards. `bh`: Better Halo's "Upcoming Assignments" in the first three
 * cards (what George's page shows); `clip`: cards of a fixed height that hide what overflows; `tab`: which tab is open.
 */
export const haloHome = (fx, { clip = false, bh = true, tab = 'Current classes', narrow = false } = {}) =>
  haloShell(
    `<h2>Student Home</h2><div class="tabs" role="tablist">${['Current classes', 'Past classes'].map((t) => `<button role="tab" aria-selected="${t === tab}">${t}</button>`).join('')}</div><div class="grid-cards${clip ? ' clip' : ''}${narrow ? ' narrow' : ''}">${fx.courses
      .map(
        (c, k) =>
          `<div class="MuiPaper-root MuiPaper-elevation1 MuiPaper-rounded CourseCard_cardContainer__ME7dH"><a href="/courses/${c.slug}"><div class="CourseCard_band__x"></div><div class="CourseCard_body__x"><h3>${c.cc}</h3><p>${c.name}</p></div></a>${bh && k < 3 ? '<div class="better-halo-todo-list"><b>Upcoming Assignments</b>Topic 7 DQ 1 · Oct 27</div>' : ''}<hr><div class="CourseCard_foot__x">Sep 8 – Dec 20 · Topic ${k + 5}</div></div>`,
      )
      .join('')}</div>`,
  );
/** Halo's ClassDetails cards (read from Halo's code, 2026-10-23), behind a "Topic N" badge. */
export const haloDetails = (fx) =>
  haloShell(
    `<h2>My Classes</h2><div class="grid-cards">${fx.courses
      .map(
        (c, k) =>
          `<div class="MuiPaper-root ClassDetails_containerCard__x"><a href="/courses/${c.slug}"><button class="ClassDetails_innerButton__jJQws" type="submit"><div class="ClassDetails_innerContainer__O93i7"><h3><span class="stage">Topic ${k + 5}</span>${c.cc}</h3><p class="ClassDetails_description__x" title="${c.name}">${c.name}</p><div class="flex flex-row"><span class="meta">Sep 8 – Dec 20</span></div></div></button></a></div>`,
      )
      .join('')}</div>`,
  );
export const haloUnit = (c) =>
  haloShell(`<h2>${c.code} · Topic 3</h2>${c.items.map((i) => `<section class="assess"><div class="row"><h3>${i.title}</h3><span class="meta">${i.type}</span></div><p>Read the instructions and submit by the due date.</p><button class="btn">View</button></section>`).join('')}`);
/** A class's own page: its code and name, then its topics (the pill's page; nothing of Halo+ goes in it). */
export const haloClass = (c) =>
  haloShell(
    `<h2>${c.cc}</h2><p class="meta">${c.name} · Sep 8 – Dec 20</p><div style="margin-top:16px">${[5, 6, 7, 8]
      .map((n) => `<section class="assess"><div class="row"><h3>Topic ${n}</h3><span class="meta">${n === 7 ? 'Current' : n < 7 ? 'Completed' : 'Upcoming'}</span></div><p>${n === 7 ? 'Readings, a discussion and this week’s assignment.' : 'Readings, a discussion and an assignment.'}</p></section>`)
      .join('')}</div>`,
  );
export const haloCalendar = () => haloShell('<h2>Calendar</h2><p class="meta">October 2026</p><div style="height:520px"></div>');

/** The page for a Halo address: a topic page, a class page, ClassDetails (?details), Calendar, else Student Home (?clip, ?past, ?nobh, ?narrow). */
export function haloPage(fx, url) {
  const u = new URL(url);
  const unit = /^\/courses\/([^/]+)\/course-units\//.exec(u.pathname);
  if (unit) return haloUnit(fx.courses.find((c) => c.slug === decodeURIComponent(unit[1])) ?? fx.courses[0]);
  if (u.pathname.startsWith('/calendar')) return haloCalendar();
  const cls = /^\/courses\/([^/]+)\/?$/.exec(u.pathname);
  if (cls) return haloClass(fx.courses.find((c) => c.slug === decodeURIComponent(cls[1])) ?? fx.courses[0]);
  if (u.search.includes('details')) return haloDetails(fx);
  return haloHome(fx, { clip: u.search.includes('clip'), bh: !u.search.includes('nobh'), tab: u.search.includes('past') ? 'Past classes' : 'Current classes', narrow: u.search.includes('narrow') });
}

/** Chrome (headless) or Edge (windowed off-screen), with unpacked extensions loaded over CDP. */
export async function launch(BROWSER, label) {
  const EXE = BROWSER === 'edge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : chromium.executablePath();
  const port = 9300 + Math.floor(Math.random() * 600);
  const look = BROWSER === 'edge' ? ['--use-mock-keychain', '--window-position=-3000,-3000', '--window-size=1366,900'] : ['--headless=new'];
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), `haloplus-${label}-${BROWSER}-`))}`, '--enable-unsafe-extension-debugging', ...look, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`), 30000, 500);
  const ctx = browser.contexts()[0];
  const cdp = await browser.newBrowserCDPSession();
  /** Load an unpacked extension; its service worker. */
  const load = async (path) => {
    const { id } = await cdp.send('Extensions.loadUnpacked', { path });
    const worker = await until(async () => ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}/`)) ?? null, 15000);
    return { id, worker };
  };
  return { browser, ctx, proc, load };
}
